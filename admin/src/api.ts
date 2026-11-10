// The session token is kept in localStorage so a page reload (or a new tab) stays
// signed in until the administrator signs out or the server revokes the session.
const STORAGE_KEY = "bornoverse.admin.token";

function stored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

let token = stored();
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string) {
  token = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the session simply lasts for this tab.
  }
}

export function getToken() {
  return token;
}

/** Called when the server rejects the session (expired, revoked or signed out elsewhere). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function request<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401 && token && !path.startsWith("/auth/admin-login")) {
      setToken("");
      onUnauthorized?.();
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join(", ")
          : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

/** Build a query string, leaving out empty values. */
export function query(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function documentUrl(id: string) {
  const response = await fetch(`/api/v1/admin/applications/${id}/document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Could not retrieve verification document");
  return URL.createObjectURL(await response.blob());
}

/** Fetch an authorised file (e.g. moderation evidence) and return a temporary object URL and its type. */
export async function fileUrl(path: string) {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Could not open the file");
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), type: blob.type || response.headers.get("content-type") || "" };
}
