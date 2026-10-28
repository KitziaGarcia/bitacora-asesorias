import { describe, it, expect } from 'vitest';
import { parseScanQuery, errorMessage, safeRedirect, resolveGuard } from './scan';

describe('parseScanQuery', () => {
  it('extracts c and sig', () => {
    expect(parseScanQuery({ c: 'oop', sig: 'abc' })).toEqual({ classCode: 'oop', sig: 'abc' });
  });
  it('returns null when missing, empty, or not a plain string', () => {
    for (const q of [{}, { c: 'oop' }, { sig: 'x' }, { c: '', sig: '' }, { c: ['a', 'b'], sig: 'x' }])
      expect(parseScanQuery(q)).toBeNull();
  });
});
describe('errorMessage', () => {
  it('has distinct friendly messages per known code and a generic fallback', () => {
    const known = ['INVALID_QR', 'CLASS_NOT_FOUND', 'STUDENT_NOT_FOUND', 'UNAUTHORIZED', 'NETWORK', 'VALIDATION_ERROR'].map(errorMessage);
    expect(new Set(known).size).toBe(6);
    expect(errorMessage('WHATEVER')).toMatch(/something went wrong/i);
  });
});
describe('safeRedirect', () => {
  it('accepts same-origin paths (query kept) and rejects open redirects', () => {
    expect(safeRedirect('/scan?c=oop&sig=abc')).toBe('/scan?c=oop&sig=abc');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', undefined, ['/a']])
      expect(safeRedirect(bad)).toBeNull();
  });
});
describe('resolveGuard', () => {
  const to = (fullPath: string, pub = false) => ({ fullPath, meta: { public: pub } });
  it('logged out on a protected route → /login with the full path encoded', () => {
    const r = resolveGuard(false, to('/scan?c=oop&sig=abc')) as string;
    expect(r.startsWith('/login?redirect=')).toBe(true);
    expect(decodeURIComponent(r.split('redirect=')[1])).toBe('/scan?c=oop&sig=abc');
  });
  it('logged out on a public route passes; logged in passes; logged in on /login goes home', () => {
    expect(resolveGuard(false, to('/login', true))).toBe(true);
    expect(resolveGuard(true, to('/'))).toBe(true);
    expect(resolveGuard(true, to('/login', true))).toBe('/');
  });
});
