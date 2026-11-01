"""
Transactional email. Prefers the Brevo HTTP API (works on hosts that block SMTP
ports, such as Render's free plan) and falls back to SMTP.
"""
import asyncio
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings


class MailNotConfigured(Exception):
    pass


def mail_configured() -> bool:
    return bool(settings.MAIL_FROM and (settings.BREVO_API_KEY or settings.SMTP_HOST))


async def send_mail(to: str, subject: str, text: str, html: str | None = None) -> None:
    if not mail_configured():
        raise MailNotConfigured()
    if settings.BREVO_API_KEY:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                json={
                    "sender": {"email": settings.MAIL_FROM, "name": settings.MAIL_FROM_NAME},
                    "to": [{"email": to}],
                    "subject": subject,
                    "textContent": text,
                    **({"htmlContent": html} if html else {}),
                },
            )
        if response.status_code >= 300:
            raise RuntimeError(f"Brevo rejected the email: {response.status_code} {response.text[:200]}")
        return
    await asyncio.to_thread(_send_smtp, to, subject, text, html)


def _send_smtp(to: str, subject: str, text: str, html: str | None) -> None:
    message = EmailMessage()
    message["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    message["To"], message["Subject"] = to, subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)
