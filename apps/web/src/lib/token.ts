const KEY = 'bitacora.token';

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setToken(t: string | null): void {
  try {
    if (t === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* storage unavailable */ }
}
