export type Theme = 'light' | 'dark';

const KEY = 'bitacora.theme';

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

/** Saved choice first, otherwise follow the operating system. */
export function initialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
}
