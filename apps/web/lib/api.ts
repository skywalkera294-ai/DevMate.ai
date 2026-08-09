import type { ApiError } from '@devmate/shared';

// Browser calls are same-origin `/api/...` and are proxied by Next.js to the
// API server. Set NEXT_PUBLIC_API_URL to override (e.g. cross-origin deploys).
export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const TOKEN_KEY = 'devmate_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
    delete headers['Content-Type'];
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('devmate:unauthorized'));
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as ApiError;
      if (data.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      }
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
