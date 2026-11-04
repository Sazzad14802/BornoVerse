/**
 * Centralized HTTP client for the Platform API.
 *
 * Patterns:
 * - Singleton / Facade: one `apiClient` hides headers, auth, timeouts and parsing.
 * - Chain of Responsibility: transport failures fall through to the next base URL
 *   candidate; any real HTTP response (even 4xx) stops the chain.
 * - Observer: an unauthorized handler lets the auth layer react to revoked tokens
 *   without the client depending on React state.
 */

import {
  getActiveApiBaseUrl,
  getApiBaseUrlCandidates,
  REQUEST_TIMEOUT_MS,
  setActiveApiBaseUrl,
  UPLOAD_TIMEOUT_MS,
} from '../config';
import { authStorage } from '../storage/authStorage';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** True when the server could not be reached at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.detail || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by AuthContext so a revoked/expired session signs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

let clientLanguage: 'bn' | 'en' = 'bn';

/** Set by LanguageContext so client-side messages use the app language. */
export function setClientLanguage(language: 'bn' | 'en') {
  clientLanguage = language;
}

const NETWORK_FAILURE = {
  bn: 'সার্ভারের সাথে সংযোগ করা যায়নি। Wi-Fi বা ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
  en: 'Could not connect to the server. Check your Wi-Fi or internet connection and try again.',
};

function parseDetail(body: any, status: number): string {
  let detail = body?.detail ?? body?.message ?? `HTTP ${status}`;
  // FastAPI validation errors arrive as an array of {msg}
  if (Array.isArray(detail)) {
    detail = detail.map((e: { msg?: string }) => e?.msg ?? '').filter(Boolean).join(', ');
  }
  return typeof detail === 'string' ? detail : `HTTP ${status}`;
}

interface Transport {
  send(url: string, timeoutMs: number): Promise<{ status: number; body: any }>;
}

function fetchTransport(init: RequestInit): Transport {
  return {
    async send(url, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const text = response.status === 204 ? '' : await response.text();
        let body: any = undefined;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = { detail: text.slice(0, 200) };
          }
        }
        return { status: response.status, body };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new ApiError(0, `Request timed out after ${timeoutMs / 1000}s`);
        }
        throw new ApiError(0, err?.message || 'Network request failed');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Multipart uploads use XMLHttpRequest: React Native's fetch cannot serialise
 * native file descriptors ({ uri, name, type }) inside FormData.
 */
/** Thrown when the caller cancels an upload; never retried on another host. */
export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
  }
}

export interface UploadOptions {
  /** Called with the sent fraction (0-1) while the body uploads. */
  onProgress?: (fraction: number) => void;
  /** Aborting it cancels the upload. */
  signal?: AbortSignal;
}

function xhrTransport(formData: FormData, headers: Record<string, string>, options: UploadOptions = {}): Transport {
  return {
    send(url, timeoutMs) {
      return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(new UploadCancelled());
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = timeoutMs;
        if (options.onProgress) {
          xhr.upload.onprogress = (event) => {
            // Android can count multipart overhead in `loaded`; hold at 99% until the server replies.
            if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(0.99, event.loaded / event.total));
          };
        }
        options.signal?.addEventListener('abort', () => xhr.abort());
        xhr.onabort = () => reject(new UploadCancelled());
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
        xhr.onload = () => {
          let body: any = undefined;
          try {
            body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
          } catch {
            body = { detail: xhr.responseText?.slice(0, 200) };
          }
          resolve({ status: xhr.status, body });
        };
        xhr.onerror = () => reject(new ApiError(0, 'Network request failed'));
        xhr.ontimeout = () => reject(new ApiError(0, 'Upload timed out'));
        xhr.send(formData);
      });
    },
  };
}

async function buildHeaders(authenticated: boolean, json: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    const token = await authStorage.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function execute<T>(
  path: string,
  transport: Transport,
  timeoutMs: number,
  authenticated: boolean,
): Promise<T> {
  const active = getActiveApiBaseUrl();
  const candidates = [active, ...getApiBaseUrlCandidates().filter((c) => c !== active)];

  for (const baseUrl of candidates) {
    let result: { status: number; body: any };
    try {
      result = await transport.send(`${baseUrl}/api/v1${path}`, timeoutMs);
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) continue; // try the next host
      throw err;
    }

    if (baseUrl !== active) setActiveApiBaseUrl(baseUrl);
    if (result.status >= 200 && result.status < 300) return result.body as T;

    if (result.status === 401 && authenticated) unauthorizedHandler?.();
    throw new ApiError(result.status, parseDetail(result.body, result.status));
  }

  throw new ApiError(0, NETWORK_FAILURE[clientLanguage]);
}

async function jsonRequest<T>(
  method: string,
  path: string,
  body: unknown,
  authenticated: boolean,
): Promise<T> {
  const headers = await buildHeaders(authenticated, body !== undefined);
  const transport = fetchTransport({
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return execute<T>(path, transport, REQUEST_TIMEOUT_MS, authenticated);
}

export const apiClient = {
  get<T>(path: string, authenticated = true): Promise<T> {
    return jsonRequest<T>('GET', path, undefined, authenticated);
  },
  post<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
    return jsonRequest<T>('POST', path, body, authenticated);
  },
  patch<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
    return jsonRequest<T>('PATCH', path, body, authenticated);
  },
  put<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
    return jsonRequest<T>('PUT', path, body, authenticated);
  },
  delete<T>(path: string, authenticated = true): Promise<T> {
    return jsonRequest<T>('DELETE', path, undefined, authenticated);
  },
  async uploadFile<T>(path: string, formData: FormData, authenticated = true, options?: UploadOptions): Promise<T> {
    const headers = await buildHeaders(authenticated, false);
    return execute<T>(path, xhrTransport(formData, headers, options), UPLOAD_TIMEOUT_MS, authenticated);
  },
};
