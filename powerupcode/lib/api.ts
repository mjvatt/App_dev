const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function rawFetch<T>(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

let _refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // De-duplicate concurrent 401s: every caller awaits the same in-flight
  // /refresh call so we don't kick off N parallel rotations.
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

/**
 * Authenticated request. The browser carries the puc_access HttpOnly cookie
 * automatically; on a 401 we transparently call /api/auth/refresh once and
 * retry the original request. Throws ApiError on non-2xx responses.
 */
export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await rawFetch<T>(path, init);
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawFetch<T>(path, init);
    }
  }
  return parseOrThrow<T>(res);
}

/** Unauthenticated request. Same shape as authedRequest, no refresh path. */
export default async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawFetch<T>(path, init);
  return parseOrThrow<T>(res);
}

export { ApiError };
