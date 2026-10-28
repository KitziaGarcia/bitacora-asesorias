export function parseScanQuery(q: Record<string, unknown>): { classCode: string; sig: string } | null {
  const { c, sig } = q;
  if (typeof c !== 'string' || c === '' || typeof sig !== 'string' || sig === '') return null;
  return { classCode: c, sig };
}

const MESSAGES: Record<string, string> = {
  INVALID_QR: 'Este código QR no es válido. Escanea de nuevo el código QR de una clase.',
  CLASS_NOT_FOUND: 'Esa clase no existe.',
  STUDENT_NOT_FOUND: 'No encontramos esa matrícula.',
  UNAUTHORIZED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  NETWORK: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa la información que ingresaste.',
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? 'Algo salió mal. Inténtalo de nuevo.';
}

export function safeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw;
}

export function resolveGuard(
  loggedIn: boolean,
  to: { fullPath: string; meta: { public?: boolean } },
): true | string {
  if (!loggedIn && !to.meta.public) return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  if (loggedIn && to.fullPath.split('?')[0] === '/login') return '/';
  return true;
}
