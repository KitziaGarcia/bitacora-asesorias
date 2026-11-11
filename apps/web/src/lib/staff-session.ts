import type { StaffInfo, StaffRole } from '@bitacora/shared';

type Session = { token: string; staff: StaffInfo };
const key = (role: StaffRole) => `bitacora.staff.${role}`;

export function getStaffSession(role: StaffRole): Session | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(key(role)) ?? 'null') as Session | null;
    return session?.staff?.role === role && typeof session.token === 'string' ? session : null;
  } catch { return null; }
}

export function setStaffSession(role: StaffRole, session: Session | null) {
  if (session) sessionStorage.setItem(key(role), JSON.stringify(session));
  else sessionStorage.removeItem(key(role));
}
