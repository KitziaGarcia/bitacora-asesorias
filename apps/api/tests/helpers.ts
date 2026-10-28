import { prisma } from '../src/db';

export async function resetDb() {
  await prisma.registration.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
}
export async function seedTestData() {
  await resetDb();
  await prisma.class.createMany({ data: [
    { code: 'oop', name: 'OOP' }, { code: 'iot', name: 'IoT' }, { code: 'ai', name: 'AI' },
  ] });
  await prisma.student.createMany({ data: [
    { id: 'S1', name: 'Student One' }, { id: 'S2', name: 'Student Two' },
  ] });
}
