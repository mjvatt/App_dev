const TOKEN_KEY = "puc_token";
const LAST_EMAIL_KEY = "puc_last_email";

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
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
