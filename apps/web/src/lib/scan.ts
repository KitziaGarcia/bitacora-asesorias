export function parseScanQuery(q: Record<string, unknown>): { classCode: string; sig: string } | null {
  const { c, sig } = q;
  if (typeof c !== 'string' || c === '' || typeof sig !== 'string' || sig === '') return null;
  return { classCode: c, sig };
}

const MESSAGES: Record<string, string> = {
  INVALID_QR: 'This QR code is not valid. Scan a class QR code again.',
  CLASS_NOT_FOUND: 'That class does not exist.',
  STUDENT_NOT_FOUND: 'We could not find that student ID.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  NETWORK: 'Cannot reach the server. Check your connection and try again.',
  VALIDATION_ERROR: 'Please check the information you entered.',
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
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
