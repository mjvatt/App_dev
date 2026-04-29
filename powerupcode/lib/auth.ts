/**
 * Web auth state helpers.
 *
 * Tokens live in HttpOnly cookies set by the backend on register/login
 * and cleared by /api/auth/logout. JavaScript cannot read them, so the
 * exported functions here cover only the remembered-email UX, which is
 * a convenience (not a credential).
 */
const LAST_EMAIL_KEY = "puc_last_email";

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
