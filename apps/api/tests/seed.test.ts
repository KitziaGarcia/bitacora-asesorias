import { describe, it, expect, beforeEach } from 'vitest';
import { CLASSES } from '@bitacora/shared';
import { prisma } from '../src/db';
import { resetDb } from './helpers';
import { seed } from '../prisma/seedData';
import { STUDENTS } from '../prisma/students';

beforeEach(resetDb);

describe('seed', () => {
  it('creates the six classes and every student from students.ts', async () => {
    await seed(prisma);
    expect((await prisma.class.findMany({ orderBy: { code: 'asc' } })).map(c => c.name).sort())
      .toEqual(CLASSES.map(c => c.name).sort());
    expect(await prisma.student.count()).toBe(STUDENTS.length);
  });
  it('is idempotent and keeps rows a teammate added directly in the DB', async () => {
    await seed(prisma);
    await prisma.student.create({ data: { id: 'EXTRA-1', name: 'Added by teammate' } });
    await seed(prisma);
    expect(await prisma.class.count()).toBe(6);
    expect(await prisma.student.count()).toBe(STUDENTS.length + 1);
    expect(await prisma.student.findUnique({ where: { id: 'EXTRA-1' } })).not.toBeNull();
  });
  it('updates a changed student name instead of duplicating', async () => {
    await seed(prisma);
    await prisma.student.update({ where: { id: STUDENTS[0].id }, data: { name: 'Stale' } });
    await seed(prisma);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: STUDENTS[0].id } })).name).toBe(STUDENTS[0].name);
  });
  it('STUDENTS has unique ids and at least 3 entries', () => {
    expect(new Set(STUDENTS.map(s => s.id)).size).toBe(STUDENTS.length);
    expect(STUDENTS.length).toBeGreaterThanOrEqual(3);
  });
});
