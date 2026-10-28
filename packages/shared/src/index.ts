import { z } from 'zod';

export interface ClassInfo { code: string; name: string }
export interface RegistrationDto { id: string; classCode: string; className: string; registeredAt: string }

export const CLASSES: readonly ClassInfo[] = [
  { code: 'oop', name: 'OOP' },
  { code: 'iot', name: 'IoT' },
  { code: 'embedded-systems', name: 'Embedded Systems' },
  { code: 'advanced-electronics', name: 'Advanced Electronics' },
  { code: 'software-engineering', name: 'Software Engineering' },
  { code: 'ai', name: 'AI' },
];
export const findClass = (code: string) => CLASSES.find(c => c.code === code);

export const ScanBody = z.object({ classCode: z.string().min(1), sig: z.string().min(1) });
