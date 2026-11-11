import { z } from 'zod';

export interface ClassInfo { code: string; name: string }
export interface RegistrationDto { id: string; studentId: string; classCode: string; className: string; registeredAt: string; teacherId: string | null; teacherName: string | null }
export interface TeacherInfo { id: string; name: string; classes: (ClassInfo & { assignmentId: string })[] }
export type StaffRole = 'teacher' | 'admin';
export interface StaffInfo { name: string; role: StaffRole }

export const CLASSES: readonly ClassInfo[] = [
  { code: 'oop', name: 'OOP' },
  { code: 'iot', name: 'IoT' },
  { code: 'embedded-systems', name: 'Embedded Systems' },
  { code: 'advanced-electronics', name: 'Advanced Electronics' },
  { code: 'software-engineering', name: 'Software Engineering' },
  { code: 'ai', name: 'AI' },
];
export const findClass = (code: string) => CLASSES.find(c => c.code === code);

export const ScanBody = z.object({ classCode: z.string().min(1), sig: z.string().min(1), assignmentId: z.string().min(1).optional() });

export const LoginBody = z.object({ studentId: z.string().trim().min(1) });
export interface StudentDto { studentId: string; name: string }
