import type { ClassInfo, RegistrationDto, StudentDto } from '@bitacora/shared';
import { getToken } from './lib/token';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void { onUnauthorized = fn; }

async function request<T>(path: string, init: RequestInit = {}, opts: { skip401?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
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

export const registerScan = async (classCode: string, sig: string): Promise<RegistrationDto> =>
  (await request<{ registration: RegistrationDto }>(
    '/registrations', { method: 'POST', body: JSON.stringify({ classCode, sig }) })).registration;

export const getRegistrations = async (): Promise<RegistrationDto[]> =>
  (await request<{ items: RegistrationDto[] }>('/registrations')).items;

export const qrUrl = (code: string) => `/api/classes/${encodeURIComponent(code)}/qr`;
export const getScanLink = (code: string) => request<{ url: string }>(`/classes/${encodeURIComponent(code)}/qr?format=json`);
export type TeacherRegistration = RegistrationDto & { studentName: string };
export const getTeacherRegistrations = async (): Promise<TeacherRegistration[]> =>
  (await request<{ items: TeacherRegistration[] }>('/teacher/registrations')).items;
