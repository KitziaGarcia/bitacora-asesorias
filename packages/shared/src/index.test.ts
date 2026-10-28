import { describe, it, expect } from 'vitest';
import { CLASSES, findClass, ScanBody, LoginBody } from './index';

describe('shared', () => {
  it('lists the six preset classes in order with unique codes', () => {
    expect(CLASSES.map(c => c.name)).toEqual([
      'OOP', 'IoT', 'Embedded Systems', 'Advanced Electronics', 'Software Engineering', 'AI',
    ]);
    expect(new Set(CLASSES.map(c => c.code)).size).toBe(6);
  });
  it('findClass resolves by code and returns undefined otherwise', () => {
    expect(findClass('oop')?.name).toBe('OOP');
    expect(findClass('nope')).toBeUndefined();
  });
  it('ScanBody requires non-empty classCode and sig', () => {
    expect(ScanBody.safeParse({ classCode: 'oop', sig: 'abc' }).success).toBe(true);
    expect(ScanBody.safeParse({ classCode: 'oop' }).success).toBe(false);
    expect(ScanBody.safeParse({ classCode: '', sig: 'x' }).success).toBe(false);
  });
  it('LoginBody trims and requires a student id', () => {
    expect(LoginBody.parse({ studentId: '  A01  ' })).toEqual({ studentId: 'A01' });
    expect(LoginBody.safeParse({ studentId: '   ' }).success).toBe(false);
    expect(LoginBody.safeParse({}).success).toBe(false);
  });
});
