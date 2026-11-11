import type { AdminClassInfo, AdminTeacherInfo, ClassInfo, RegistrationDto, StudentDto, StaffInfo, StaffRole, TeacherInfo } from '@bitacora/shared';
import { getToken } from './lib/token';
import { getStaffSession } from './lib/staff-session';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void { onUnauthorized = fn; }

async function request<T>(path: string, init: RequestInit = {}, opts: { skip401?: boolean; token?: string | null } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = opts.token === undefined ? getToken() : opts.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError('NETWORK', 'Network error');
  }
  if (res.ok) return (await res.json()) as T;
  let code = 'INTERNAL';
  let message = res.statusText || 'Request failed';
  try {
    const body = await res.json();
    if (body?.error) { code = body.error.code ?? code; message = body.error.message ?? message; }
  } catch { /* non-JSON error body */ }
  if (res.status === 401 && !opts.skip401) onUnauthorized();
  throw new ApiError(code, message);
}

export const login = (studentId: string) =>
  request<{ token: string; student: StudentDto }>(
    '/login', { method: 'POST', body: JSON.stringify({ studentId }) }, { skip401: true });

export const getMe = async (): Promise<StudentDto> => (await request<{ student: StudentDto }>('/me')).student;

export const getClasses = async (): Promise<ClassInfo[]> =>
  (await request<{ items: ClassInfo[] }>('/classes')).items;

export const registerScan = async (classCode: string, sig: string, assignmentId: string): Promise<RegistrationDto> =>
  (await request<{ registration: RegistrationDto }>(
    '/registrations', { method: 'POST', body: JSON.stringify({ classCode, sig, assignmentId }) })).registration;

export const getRegistrations = async (): Promise<RegistrationDto[]> =>
  (await request<{ items: RegistrationDto[] }>('/registrations')).items;

export const getTeachers = async () => (await request<{ items: TeacherInfo[] }>('/teachers')).items;
export const qrUrl = (code: string, assignmentId: string) =>
  `/api/classes/${encodeURIComponent(code)}/qr?a=${encodeURIComponent(assignmentId)}`;
export const getScanLink = (code: string, assignmentId: string) =>
  request<{ url: string }>(`${qrUrl(code, assignmentId).slice(4)}&format=json`);
export type TeacherRegistration = RegistrationDto & { studentName: string };
export const staffLogin = (role: StaffRole, username: string, password: string) =>
  request<{ token: string; staff: StaffInfo }>('/staff/login', {
    method: 'POST', body: JSON.stringify({ role, username, password }),
  }, { token: null, skip401: true });
export const getStaffRegistrations = async (role: StaffRole): Promise<TeacherRegistration[]> =>
  (await request<{ items: TeacherRegistration[] }>(`/${role}/registrations`, {}, {
    token: getStaffSession(role)?.token ?? null, skip401: true,
  })).items;

const adminRequest = <T>(path: string, init: RequestInit = {}) => request<T>(path, init, {
  token: getStaffSession('admin')?.token ?? null,
  skip401: true,
});

export const getAdminTeachers = async (): Promise<AdminTeacherInfo[]> =>
  (await adminRequest<{ items: AdminTeacherInfo[] }>('/admin/teachers')).items;

export const getAdminClasses = async (): Promise<AdminClassInfo[]> =>
  (await adminRequest<{ items: AdminClassInfo[] }>('/admin/classes')).items;

export const createAdminClass = async (payload: { code: string; name: string; teacherId?: string }) =>
  (await adminRequest<{ item: ClassInfo }>('/admin/classes', {
    method: 'POST', body: JSON.stringify(payload),
  })).item;

export const createAdminAssignment = async (payload: { classCode: string; teacherId: string }) =>
  (await adminRequest<{ item: { id: string; classCode: string; teacherId: string } }>('/admin/assignments', {
    method: 'POST', body: JSON.stringify(payload),
  })).item;

export const createAdminTeacher = async (payload: { username: string; name: string; password: string; classCodes: string[] }) =>
  (await adminRequest<{ item: { id: string; username: string; name: string } }>('/admin/teachers', {
    method: 'POST', body: JSON.stringify(payload),
  })).item;
