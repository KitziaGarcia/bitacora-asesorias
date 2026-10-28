import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { seedTestData } from './helpers';

const app = createApp();
beforeEach(seedTestData);

describe('POST /api/login', () => {
  it('logs in an existing student id and returns token + student', async () => {
    const res = await request(app).post('/api/login').send({ studentId: 'S1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.student).toEqual({ studentId: 'S1', name: 'Student One' });
  });
  it('trims whitespace around the id', async () => {
    const res = await request(app).post('/api/login').send({ studentId: '  S2 ' });
    expect(res.body.student.studentId).toBe('S2');
  });
  it('an unknown id is created on first login (name defaults to the id) and gets a token', async () => {
    const res = await request(app).post('/api/login').send({ studentId: '1234567' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.student).toEqual({ studentId: '1234567', name: '1234567' });
    const { prisma } = await import('../src/db');
    expect(await prisma.student.count({ where: { id: '1234567' } })).toBe(1);
  });
  it('logging in again with the same id does not duplicate or rename the student', async () => {
    await request(app).post('/api/login').send({ studentId: '1234567' });
    const { prisma } = await import('../src/db');
    await prisma.student.update({ where: { id: '1234567' }, data: { name: 'Real Name' } });
    const res = await request(app).post('/api/login').send({ studentId: '1234567' });
    expect(res.body.student.name).toBe('Real Name');
    expect(await prisma.student.count({ where: { id: '1234567' } })).toBe(1);
  });
  it('two simultaneous first logins with a new id both succeed with one row', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/api/login').send({ studentId: '7654321' }),
      request(app).post('/api/login').send({ studentId: '7654321' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const { prisma } = await import('../src/db');
    expect(await prisma.student.count({ where: { id: '7654321' } })).toBe(1);
  });
  it('blank or missing id → 400 VALIDATION_ERROR', async () => {
    expect((await request(app).post('/api/login').send({ studentId: '   ' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).post('/api/login').send({})).status).toBe(400);
  });
  it('malformed JSON → 400 VALIDATION_ERROR envelope', async () => {
    const res = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/me', () => {
  it('returns the logged-in student', async () => {
    const { body } = await request(app).post('/api/login').send({ studentId: 'S1' });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.body.student).toEqual({ studentId: 'S1', name: 'Student One' });
  });
  it('no token, garbage token → 401 UNAUTHORIZED', async () => {
    expect((await request(app).get('/api/me')).body.error.code).toBe('UNAUTHORIZED');
    expect((await request(app).get('/api/me').set('Authorization', 'Bearer x.y.z')).status).toBe(401);
  });
  it('token of a student that was deleted → 401', async () => {
    const { body } = await request(app).post('/api/login').send({ studentId: 'S2' });
    const { prisma } = await import('../src/db');
    await prisma.student.delete({ where: { id: 'S2' } });
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${body.token}`)).status).toBe(401);
  });
  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
