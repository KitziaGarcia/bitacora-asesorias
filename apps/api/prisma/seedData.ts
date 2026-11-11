import type { PrismaClient } from '@prisma/client';
import { CLASSES } from '@bitacora/shared';
import { hashPassword } from '../src/staff-auth';

// Add demo accounts and assignments without overwriting existing credentials or history.
export async function seed(db: PrismaClient): Promise<void> {
  for (const c of CLASSES) {
    await db.class.upsert({ where: { code: c.code }, update: { name: c.name }, create: { code: c.code, name: c.name } });
  }
  const passwordHash = hashPassword(process.env.DEMO_STAFF_PASSWORD ?? 'asesorias-demo');
  const teachers = [
    { id: 'gael', name: 'Gael', classes: ['oop', 'iot'] },
    { id: 'diego', name: 'Diego', classes: ['oop', 'embedded-systems'] },
    { id: 'juan', name: 'Juan', classes: ['advanced-electronics'] },
    { id: 'kitzia', name: 'Kitzia', classes: ['software-engineering'] },
    { id: 'curlango', name: 'curlango', classes: ['ai'] },
  ];
  for (const teacher of teachers) {
    await db.staff.upsert({
      where: { id: teacher.id },
      update: {},
      create: { id: teacher.id, username: teacher.id, name: teacher.name, role: 'teacher', passwordHash },
    });
    for (const classCode of teacher.classes) {
      const assignment = { teacherId: teacher.id, classCode };
      await db.teachingAssignment.upsert({
        where: { teacherId_classCode: assignment },
        update: {},
        create: assignment,
      });
    }
  }
  await db.staff.upsert({
    where: { id: 'admin' },
    update: {},
    create: { id: 'admin', username: 'admin', name: 'Administrador', role: 'admin', passwordHash },
  });
}
