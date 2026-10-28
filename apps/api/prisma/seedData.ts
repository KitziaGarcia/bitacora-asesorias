import type { PrismaClient } from '@prisma/client';
import { CLASSES } from '@bitacora/shared';
import { STUDENTS } from './students';

// Idempotent: upserts only, never deletes rows added elsewhere.
export async function seed(db: PrismaClient): Promise<void> {
  for (const c of CLASSES) {
    await db.class.upsert({ where: { code: c.code }, update: { name: c.name }, create: { code: c.code, name: c.name } });
  }
  for (const s of STUDENTS) {
    await db.student.upsert({ where: { id: s.id }, update: { name: s.name }, create: { id: s.id, name: s.name } });
  }
}
