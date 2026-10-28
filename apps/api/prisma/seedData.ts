import type { PrismaClient } from '@prisma/client';
import { CLASSES } from '@bitacora/shared';

// Seeds the preset classes only. Students are created on first login.
// Idempotent: upserts only, never deletes rows added elsewhere.
export async function seed(db: PrismaClient): Promise<void> {
  for (const c of CLASSES) {
    await db.class.upsert({ where: { code: c.code }, update: { name: c.name }, create: { code: c.code, name: c.name } });
  }
}
