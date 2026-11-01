let token = "";
export function setToken(value: string) {
  token = value;
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
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function documentUrl(id: string) {
  const response = await fetch(`/api/v1/admin/applications/${id}/document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Could not retrieve verification document");
  return URL.createObjectURL(await response.blob());
}

/** Fetch an authorised file (e.g. moderation evidence) and return a temporary object URL. */
export async function fileUrl(path: string) {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Could not open the file");
  return URL.createObjectURL(await response.blob());
}
