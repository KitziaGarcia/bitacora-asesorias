import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { signClass } from '../src/qr';
import { signToken } from '../src/auth';
import { seedTestData } from './helpers';

const app = createApp();
const auth = (id: string) => ({ Authorization: `Bearer ${signToken(id)}` });
const register = (id: string, body: object) => request(app).post('/api/registrations').set(auth(id)).send(body);
beforeEach(seedTestData);

describe('GET /api/classes and QR', () => {
  it('provides a working signed link for laptop registration', async () => {
    const link = await request(app).get('/api/classes/oop/qr?format=json');
    expect(link.status).toBe(200);
    const url = new URL(link.body.url);
    expect(url.pathname).toBe('/scan');
    const result = await register('S1', { classCode: url.searchParams.get('c'), sig: url.searchParams.get('sig') });
    expect(result.status).toBe(201);
    expect(result.body.registration.studentId).toBe('S1');
  });
  it('lists classes from the database', async () => {
    const res = await request(app).get('/api/classes');
    expect(res.body.items.map((c: any) => c.code).sort()).toEqual(['ai', 'iot', 'oop']);
  });
  it('QR is an SVG by default and a PNG with format=png', async () => {
    const svg = await request(app).get('/api/classes/oop/qr').buffer(true).parse((r, cb) => { let t = ''; r.setEncoding('utf8'); r.on('data', d => { t += d; }); r.on('end', () => cb(null, t)); });
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(String(svg.body)).toContain('<svg');
    const png = await request(app).get('/api/classes/oop/qr?format=png').buffer().parse((r, cb) => {
      const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(png.headers['content-type']).toContain('image/png');
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });
  it('unknown class QR → 404 CLASS_NOT_FOUND', async () => {
    const res = await request(app).get('/api/classes/nope/qr');
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });
});

describe('POST /api/registrations', () => {
  it('registers the logged-in student with a valid signature', async () => {
    const res = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect(res.status).toBe(201);
    expect(res.body.registration).toMatchObject({ studentId: 'S1', classCode: 'oop', className: 'OOP' });
    expect(await prisma.registration.count()).toBe(1);
  });
  it('requires login → 401', async () => {
    const res = await request(app).post('/api/registrations').send({ classCode: 'oop', sig: signClass('oop') });
    expect(res.status).toBe(401);
  });
  it('tampered, wrong-length and empty sigs → 400 INVALID_QR and nothing saved', async () => {
    for (const sig of ['AAAAAAAAAAAAAAAA', 'abc']) {
      const res = await register('S1', { classCode: 'oop', sig });
      expect(res.status).toBe(400); expect(res.body.error.code).toBe('INVALID_QR');
    }
    expect((await register('S1', { classCode: 'oop', sig: '' })).body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.registration.count()).toBe(0);
  });
  it("another class's valid sig does not register the requested class", async () => {
    const res = await register('S1', { classCode: 'ai', sig: signClass('oop') });
    expect(res.body.error.code).toBe('INVALID_QR');
  });
  it('unknown class → 404 CLASS_NOT_FOUND; missing fields → 400 VALIDATION_ERROR', async () => {
    expect((await register('S1', { classCode: 'nope', sig: 'x' })).body.error.code).toBe('CLASS_NOT_FOUND');
    expect((await register('S1', {})).body.error.code).toBe('VALIDATION_ERROR');
  });
  it('same student + class within 2 minutes returns the existing registration (200)', async () => {
    const a = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    const b = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect(b.status).toBe(200); expect(b.body.registration.id).toBe(a.body.registration.id);
  });
  it('a registration older than 2 minutes does not block a new one', async () => {
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'oop', registeredAt: new Date(Date.now() - 3 * 60_000) } });
    expect((await register('S1', { classCode: 'oop', sig: signClass('oop') })).status).toBe(201);
  });
  it('different student or different class is not a duplicate', async () => {
    await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect((await register('S2', { classCode: 'oop', sig: signClass('oop') })).status).toBe(201);
    expect((await register('S1', { classCode: 'ai', sig: signClass('ai') })).status).toBe(201);
  });
  it('two simultaneous scans yield exactly one registration', async () => {
    const [a, b] = await Promise.all([
      register('S1', { classCode: 'oop', sig: signClass('oop') }),
      register('S1', { classCode: 'oop', sig: signClass('oop') }),
    ]);
    expect(a.body.registration.id).toBe(b.body.registration.id);
    expect(await prisma.registration.count()).toBe(1);
  });
});

describe('GET /api/registrations', () => {
  it('demo teacher portal lists registrations from all students without login', async () => {
    await register('S1', { classCode: 'oop', sig: signClass('oop') });
    await register('S2', { classCode: 'ai', sig: signClass('ai') });
    const res = await request(app).get('/api/teacher/registrations');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((r: any) => r.studentId).sort()).toEqual(['S1', 'S2']);
    expect(res.body.items.every((r: any) => r.className && r.studentName && r.registeredAt)).toBe(true);
  });
  it("lists only the caller's registrations, newest first", async () => {
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'oop', registeredAt: new Date(Date.now() - 600_000) } });
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'ai', registeredAt: new Date(Date.now() - 300_000) } });
    await prisma.registration.create({ data: { studentId: 'S2', classCode: 'iot' } });
    const res = await request(app).get('/api/registrations').set(auth('S1'));
    expect(res.body.items.map((r: any) => r.classCode)).toEqual(['ai', 'oop']);
    expect(res.body.items[0]).toMatchObject({ studentId: 'S1', className: 'AI' });
  });
  it('requires login → 401', async () => {
    expect((await request(app).get('/api/registrations')).status).toBe(401);
  });
});
