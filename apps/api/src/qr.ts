import { createHmac, timingSafeEqual } from 'node:crypto';
const secret = () => process.env.QR_SECRET ?? 'dev-secret';
const baseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

export const signClass = (code: string) =>
  createHmac('sha256', secret()).update(code).digest('base64url').slice(0, 16);

export function verifySig(code: string, sig: string): boolean {
  const expected = Buffer.from(signClass(code));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
export function buildScanUrl(code: string): string {
  const url = new URL('/scan', baseUrl());
  url.searchParams.set('c', code);
  url.searchParams.set('sig', signClass(code));
  return url.toString();
}
