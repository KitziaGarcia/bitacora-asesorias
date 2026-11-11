import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { signClass } from '../src/qr';
import { signStaffToken, hashPassword } from '../src/staff-auth';
import { signToken } from '../src/auth';
import { seedTestData } from './helpers';

const app = createApp();
const password = 'test-password';
const adminHeader = () => ({ Authorization: `Bearer ${signStaffToken('admin', 'admin')}` });
const teacherHeader = (id: string) => ({ Authorization: `Bearer ${signStaffToken(id, 'teacher')}` });

beforeEach(async () => {
  await seedTestData();
  await prisma.staff.create({ data: {
    id: 'admin', username: 'admin', name: 'Administrador', role: 'admin', passwordHash: hashPassword(password),
  } });
});

describe('admin catalog management', () => {
  it('creates teachers, creates a class, and assigns a second teacher to the same class', async () => {
    const maria = await request(app).post('/api/admin/teachers').set(adminHeader()).send({
      username: 'maria.luisa', name: 'María Luisa', password,
    });
    expect(maria.status).toBe(201);

    const createdClass = await request(app).post('/api/admin/classes').set(adminHeader()).send({
      code: 'poo', name: 'Programación Orientada a Objetos', teacherId: maria.body.item.id,
    });
    expect(createdClass.status).toBe(201);

    const curlango = await request(app).post('/api/admin/teachers').set(adminHeader()).send({
      username: 'curlango', name: 'Curlango', password,
    });
    expect(curlango.status).toBe(201);

    const secondAssignment = await request(app).post('/api/admin/assignments').set(adminHeader()).send({
      classCode: 'poo', teacherId: curlango.body.item.id,
    });
    expect(secondAssignment.status).toBe(201);

    const catalog = await request(app).get('/api/admin/classes').set(adminHeader());
    expect(catalog.status).toBe(200);
    expect(catalog.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'poo',
        assignments: expect.arrayContaining([
          expect.objectContaining({ teacherName: 'María Luisa' }),
          expect.objectContaining({ teacherName: 'Curlango' }),
        ]),
      }),
    ]));

    const teachers = await request(app).get('/api/teachers');
    const mariaInfo = teachers.body.items.find((item: any) => item.name === 'María Luisa');
    const curlangoInfo = teachers.body.items.find((item: any) => item.name === 'Curlango');
    expect(mariaInfo.classes[0].assignmentId).not.toBe(curlangoInfo.classes[0].assignmentId);
  });

  it('protects admin writes and reports duplicate catalog entries', async () => {
    expect((await request(app).post('/api/admin/teachers').send({ username: 'x', name: 'X', password })).status).toBe(401);
    const teacher = await request(app).post('/api/admin/teachers').set(adminHeader()).send({
      username: 'gael', name: 'Gael', password,
    });
    expect(teacher.status).toBe(201);
    expect((await request(app).post('/api/admin/teachers').set(adminHeader()).send({ username: 'gael', name: 'Otro', password })).body.error.code).toBe('USERNAME_EXISTS');
    expect((await request(app).post('/api/admin/classes').set(adminHeader()).send({ code: 'poo', name: 'POO', teacherId: teacher.body.item.id })).status).toBe(201);
    expect((await request(app).post('/api/admin/classes').set(adminHeader()).send({ code: 'poo', name: 'Otra', teacherId: teacher.body.item.id })).body.error.code).toBe('CLASS_EXISTS');
    expect((await request(app).post('/api/admin/assignments').set(teacherHeader('gael')).send({ classCode: 'poo', teacherId: 'gael' })).status).toBe(401);
  });
});

describe('assignment-specific registration scope', () => {
  it('shows the same class separately to each teacher and to the administrator', async () => {
    const maria = await request(app).post('/api/admin/teachers').set(adminHeader()).send({ username: 'maria', name: 'María', password });
    const curlango = await request(app).post('/api/admin/teachers').set(adminHeader()).send({ username: 'curlango', name: 'Curlango', password });
    const cls = await request(app).post('/api/admin/classes').set(adminHeader()).send({ code: 'poo', name: 'POO', teacherId: maria.body.item.id });
    const other = await request(app).post('/api/admin/assignments').set(adminHeader()).send({ classCode: cls.body.item.code, teacherId: curlango.body.item.id });
    const catalog = await request(app).get('/api/admin/classes').set(adminHeader());
    const mariaAssignmentId = catalog.body.items.find((item: any) => item.code === 'poo').assignments
      .find((assignment: any) => assignment.teacherId === maria.body.item.id).id;

    const first = await request(app).post('/api/registrations').set({ Authorization: `Bearer ${signToken('S1')}` }).send({
      classCode: 'poo', assignmentId: mariaAssignmentId, sig: signClass('poo', mariaAssignmentId),
    });
    const second = await request(app).post('/api/registrations').set({ Authorization: `Bearer ${signToken('S1')}` }).send({
      classCode: 'poo', assignmentId: other.body.item.id, sig: signClass('poo', other.body.item.id),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const mariaRows = await request(app).get('/api/teacher/registrations').set(teacherHeader('maria'));
    const curlangoRows = await request(app).get('/api/teacher/registrations').set(teacherHeader('curlango'));
    const adminRows = await request(app).get('/api/admin/registrations').set(adminHeader());
    expect(mariaRows.body.items).toHaveLength(1);
    expect(curlangoRows.body.items).toHaveLength(1);
    expect(adminRows.body.items).toHaveLength(2);
    expect(mariaRows.body.items[0].teacherName).toBe('María');
    expect(curlangoRows.body.items[0].teacherName).toBe('Curlango');
  });
});
