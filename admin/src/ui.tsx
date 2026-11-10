import React, { useEffect, useRef, useState } from "react";
import { fileUrl } from "./api";

export type Row = Record<string, any>;

const serial = (prefix: string, width: number) => (value: unknown) =>
  typeof value === "number" ? `${prefix}-${String(value).padStart(width, "0")}` : "—";

/** Readable numbers: members U-0001, channels C-0001, payments P-0001, audit entries A-000001. */
export const memberId = serial("U", 4);
export const channelId = serial("C", 4);
export const paymentId = serial("P", 4);
export const auditId = serial("A", 6);

/** "U-0012 · rahim" for a member summary from the API. */
export const memberLabel = (p: Row | null | undefined) =>
  p ? `${memberId(p.serial)} · ${p.username}` : "—";

// ── Filters ─────────────────────────────────────────────────────────────────

export type FilterField =
  | { key: string; kind: "search"; placeholder: string }
  | { key: string; kind: "select"; label: string; options: [string, string][] }
  | { kind: "dates"; label?: string };

export type Filters = Record<string, string>;

/** Search, dropdowns and a date range for a list page. Changing anything resets to page 1. */
export function FilterBar({
  fields,
  values,
  onChange,
}: {
  fields: FilterField[];
  values: Filters;
  onChange: (next: Filters) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...values, [key]: value });
  const active = Object.values(values).some(Boolean);
  return (
    <div className="filters">
      {fields.map((field) =>
        field.kind === "search" ? (
          <label key={field.key} className="filter-search">
            <span className="sr-only">Search</span>
            <input
              type="search"
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </label>
        ) : field.kind === "select" ? (
          <label key={field.key} className="filter-field">
            <span>{field.label}</span>
            <select value={values[field.key] ?? ""} onChange={(e) => set(field.key, e.target.value)}>
              {field.options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div key="dates" className="filter-dates">
            <label className="filter-field">
              <span>{field.label ?? "From"}</span>
              <input
                type="date"
                value={values.date_from ?? ""}
                max={values.date_to || undefined}
                onChange={(e) => set("date_from", e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>To</span>
              <input
                type="date"
                value={values.date_to ?? ""}
                min={values.date_from || undefined}
                onChange={(e) => set("date_to", e.target.value)}
              />
            </label>
          </div>
        ),
      )}
      {active && (
        <button type="button" className="ghost" onClick={() => onChange({})}>
          <Icon name="close" size={14} />
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Debounce a value (typing in the search box should not fire a request per key). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}

// ── Evidence preview ────────────────────────────────────────────────────────

/** Shows an authorised file (image, PDF, audio, video or text) inside the page. */
export function FilePreview({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let url = "";
    let alive = true;
    setFile(null);
    setText(null);
    setError("");
    fileUrl(path)
      .then(async (result) => {
        url = result.url;
        if (!alive) return URL.revokeObjectURL(url);
        if (result.type.startsWith("text/")) setText(await (await fetch(result.url)).text());
        setFile(result);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  const type = file?.type ?? "";
  return (
    <div className="preview">
      <div className="preview-head">
        <strong>
          <Icon name="document" size={14} /> {name}
        </strong>
        <div className="actions">
          {file && (
            <a className="btn-link" href={file.url} download={name}>
              Download
            </a>
          )}
          <button type="button" className="ghost small" onClick={onClose} aria-label="Close preview">
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
      {error ? (
        <div className="error">{error}</div>
      ) : !file ? (
        <p className="subtle">Loading preview…</p>
      ) : type.startsWith("image/") ? (
        <img src={file.url} alt={name} />
      ) : type === "application/pdf" ? (
        <iframe title={name} src={file.url} />
      ) : type.startsWith("audio/") ? (
        <audio controls src={file.url} />
      ) : type.startsWith("video/") ? (
        <video controls src={file.url} />
      ) : text !== null ? (
        <pre>{text}</pre>
      ) : (
        <p className="subtle">This file type cannot be previewed here. Use Download to open it.</p>
      )}
    </div>
  );
}

export const dateTime = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const ICONS: Record<string, string> = {
  play: "M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z",
  refresh:
    "M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  bell: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1z",
  logout:
    "M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z",
  document:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h8v2H8zm0 4h8v2H8z",
  flag: "M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z",
  shield:
    "M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z",
  mail: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  block:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.32L5.68 16.9A7.9 7.9 0 0 1 4 12zm8 8a7.9 7.9 0 0 1-4.9-1.68L18.32 7.1A8 8 0 0 1 12 20z",
  eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z",
};

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLElement>("input, textarea, button, select, a")
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="scrim" onClick={close}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={wide ? "modal wide" : "modal"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") {
            const focusable = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input, textarea, select, a[href], audio",
              ) || [],
            );
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (e.shiftKey && window.document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            }
            if (!e.shiftKey && window.document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
