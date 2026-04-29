/**
 * Web auth state helpers.
 *
 * After the cookie-auth migration the access and refresh tokens live in
 * HttpOnly cookies that JS cannot read. The functions below cover only:
 *   - The remembered-email UX (not a credential — just convenience).
 *   - A lightweight isAuthenticated() check that hits /api/auth/me.
 *
 * The legacy setToken/getToken/clearToken helpers are kept as no-ops so
 * existing callsites compile during the migration; new code should not
 * use them. They will be removed in a follow-up sweep.
 */
const LAST_EMAIL_KEY = "puc_last_email";

export function setToken(_token: string): void {
  // No-op: tokens live in HttpOnly cookies set by the backend.
}

export function getToken(): string | null {
  // Web cannot read HttpOnly cookies. Callers should not gate on this.
  return null;
}

export function clearToken(): void {
  // No-op: logout is server-driven via POST /api/auth/logout.
}

export function rememberEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // best-effort
  }
}

export function getRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
