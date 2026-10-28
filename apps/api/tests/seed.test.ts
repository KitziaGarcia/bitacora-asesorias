import { describe, it, expect, beforeEach } from 'vitest';
import { CLASSES } from '@bitacora/shared';
import { prisma } from '../src/db';
import { resetDb } from './helpers';
import { seed } from '../prisma/seedData';

beforeEach(resetDb);

describe('seed', () => {
  it('creates the six classes and no students', async () => {
    await seed(prisma);
    expect((await prisma.class.findMany()).map(c => c.name).sort()).toEqual(CLASSES.map(c => c.name).sort());
    expect(await prisma.student.count()).toBe(0);
  });
  it('is idempotent and keeps students created at login', async () => {
    await seed(prisma);
    await prisma.student.create({ data: { id: '1234567', name: '1234567' } });
    await seed(prisma);
    expect(await prisma.class.count()).toBe(6);
    expect(await prisma.student.findUnique({ where: { id: '1234567' } })).not.toBeNull();
  });
  it('restores a changed class name instead of duplicating', async () => {
    await seed(prisma);
    await prisma.class.update({ where: { code: 'oop' }, data: { name: 'Stale' } });
    await seed(prisma);
    expect((await prisma.class.findUniqueOrThrow({ where: { code: 'oop' } })).name).toBe('OOP');
    expect(await prisma.class.count()).toBe(6);
  });
});
