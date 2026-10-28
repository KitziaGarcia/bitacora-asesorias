import { describe, it, expect } from 'vitest';
import { signClass, verifySig, buildScanUrl } from '../src/qr';

describe('qr signing', () => {
  it('is deterministic, 16 url-safe chars', () => {
    expect(signClass('oop')).toBe(signClass('oop'));
    expect(signClass('oop')).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
  it('verifies matching signature only', () => {
    expect(verifySig('oop', signClass('oop'))).toBe(true);
    expect(verifySig('ai', signClass('oop'))).toBe(false);
  });
  it('wrong-length or empty sigs return false without throwing', () => {
    expect(verifySig('oop', 'abc')).toBe(false);
    expect(verifySig('oop', '')).toBe(false);
  });
  it('buildScanUrl builds the scan link', () => {
    const u = new URL(buildScanUrl('oop'));
    expect(u.origin).toBe('http://localhost:5173');
    expect(u.pathname).toBe('/scan');
    expect(u.searchParams.get('c')).toBe('oop');
    expect(u.searchParams.get('sig')).toBe(signClass('oop'));
  });
});
