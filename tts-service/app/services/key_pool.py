"""
Rotating pool of Gemini API keys with per-key rate limits.

Each key has its own quota per model (free tier: 5 requests per minute and
10 per day for gemini-3.8-flash-tts). The pool hands out a key that still has
room, prefers the least-used one, waits when every key is only minute-limited,
and reports when every key has used up its day. Daily counts are saved to disk
so a restart does not forget them; Google resets daily quotas at midnight
Pacific time.
"""
import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _pacific():
    """Google resets daily quotas at midnight Pacific time. Windows has no time-zone
    database unless the `tzdata` package is installed; then use a fixed UTC-8."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("America/Los_Angeles")
    except Exception:
        return timezone(timedelta(hours=-8), "PST")


PACIFIC = _pacific()


class QuotaExhausted(Exception):
    """Every key has used its daily quota for this model."""

    def __init__(self, retry_after: int):
        super().__init__(f"Daily Gemini quota used on every key; retry in {retry_after}s")
        self.retry_after = retry_after


def quota_day() -> str:
    return datetime.now(PACIFIC).strftime("%Y-%m-%d")


def seconds_until_reset() -> int:
    now = datetime.now(PACIFIC)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=30, microsecond=0)
    return max(60, int((tomorrow - now).total_seconds()))


def is_rate_limit(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower()


def is_bad_key(exc: Exception) -> bool:
    """The key itself is unusable (wrong, expired, or its project lacks access)."""
    text = str(exc)
    return any(s in text for s in ("API_KEY_INVALID", "API key not valid", "API key expired", "PERMISSION_DENIED",
                                   "SERVICE_DISABLED", "403"))


def is_daily_limit(exc: Exception) -> bool:
    text = str(exc).lower()
    return "perday" in text or "per day" in text or "requests_per_day" in text or "daily" in text


def mask(key: str) -> str:
    return f"...{key[-4:]}" if len(key) > 4 else "..."


class KeyPool:
    def __init__(self, keys: list[str], per_minute: int, per_day: int, state_file: Path):
        self.keys = list(dict.fromkeys(k for k in keys if k))  # unique, in order
        self.per_minute = per_minute
        self.per_day = per_day
        self.state_file = state_file
        self.lock = threading.Lock()
        self.recent: dict[tuple[str, str], deque] = {}
        self.cooldown: dict[tuple[str, str], float] = {}
        self.state = self._load()

    # ── persistence ──────────────────────────────────────────────────────
    def _load(self) -> dict:
        try:
            state = json.loads(self.state_file.read_text(encoding="utf-8"))
            if state.get("day") == quota_day():
                return state
        except Exception:
            pass
        return {"day": quota_day(), "used": {}, "exhausted": []}

    def _save(self) -> None:
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self.state_file.write_text(json.dumps(self.state), encoding="utf-8")
        except Exception as exc:
            logger.debug("Could not save key usage: %s", exc)

    def _roll_day(self) -> None:
        if self.state["day"] != quota_day():
            self.state = {"day": quota_day(), "used": {}, "exhausted": []}
            self._save()

    @staticmethod
    def _id(key: str, model: str) -> str:
        return f"{model}:{key[-8:]}"

    def used_today(self, key: str, model: str) -> int:
        return self.state["used"].get(self._id(key, model), 0)

    # ── selection ────────────────────────────────────────────────────────
    def acquire(self, model: str, max_wait: float = 70.0) -> str:
        """A key with room for one more request (waits out minute limits). Raises QuotaExhausted."""
        deadline = time.monotonic() + max_wait
        while True:
            with self.lock:
                self._roll_day()
                now = time.monotonic()
                available, soonest = [], None
                for key in self.keys:
                    ident = self._id(key, model)
                    if ident in self.state["exhausted"] or self.used_today(key, model) >= self.per_day:
                        continue
                    window = self.recent.setdefault((key, model), deque())
                    while window and now - window[0] >= 60:
                        window.popleft()
                    blocked_until = max(self.cooldown.get((key, model), 0),
                                        window[0] + 60 if len(window) >= self.per_minute else 0)
                    if blocked_until > now:
                        soonest = blocked_until if soonest is None else min(soonest, blocked_until)
                        continue
                    available.append(key)
                if available:
                    key = min(available, key=lambda k: (self.used_today(k, model), len(self.recent[(k, model)])))
                    self.recent[(key, model)].append(now)
                    ident = self._id(key, model)
                    self.state["used"][ident] = self.used_today(key, model) + 1
                    self._save()
                    logger.info("Gemini key %s for %s (%d/%d today)", mask(key), model,
                                self.state["used"][ident], self.per_day)
                    return key
                if soonest is None:
                    raise QuotaExhausted(seconds_until_reset())
            wait = soonest - time.monotonic()
            if time.monotonic() + wait > deadline:
                raise QuotaExhausted(int(max(5, wait)))
            time.sleep(max(0.5, wait))

    def report_limit(self, key: str, model: str, exc: Exception) -> None:
        """Google said 429: take the key out for the day, or for a minute."""
        with self.lock:
            if is_daily_limit(exc):
                ident = self._id(key, model)
                if ident not in self.state["exhausted"]:
                    self.state["exhausted"].append(ident)
                self._save()
                logger.warning("Gemini key %s reached its daily %s quota", mask(key), model)
            else:
                self.cooldown[(key, model)] = time.monotonic() + 60
                logger.warning("Gemini key %s is rate-limited for %s; cooling down 60s", mask(key), model)

    def disable(self, key: str, model: str, exc: Exception) -> None:
        """A broken key: skip it until the next quota day (fix it in .env and restart)."""
        with self.lock:
            ident = self._id(key, model)
            if ident not in self.state["exhausted"]:
                self.state["exhausted"].append(ident)
            self._save()
        logger.error("Gemini key %s cannot be used (%s); skipping it today", mask(key), str(exc)[:160])

    def status(self, model: str) -> list[dict]:
        with self.lock:
            self._roll_day()
            return [{"key": mask(k), "used_today": self.used_today(k, model), "limit": self.per_day,
                     "exhausted": self._id(k, model) in self.state["exhausted"]} for k in self.keys]
