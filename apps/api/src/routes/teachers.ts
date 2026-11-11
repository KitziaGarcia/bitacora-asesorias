import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { StaffRole } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { hashPassword, requireStaff, signStaffToken, verifyPassword } from '../staff-auth';
import { registrationInclude, toRegistrationDto } from '../registration-dto';

export const teachersRouter = Router();
const credentials = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
  role: z.enum(['teacher', 'admin']),
});

const classCreate = z.object({
  code: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens for the code'),
  name: z.string().trim().min(1).max(120),
  teacherId: z.string().trim().min(1).max(80).optional(),
});

const assignmentCreate = z.object({
  classCode: z.string().trim().min(1).max(80),
  teacherId: z.string().trim().min(1).max(80),
});

const teacherCreate = z.object({
  username: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  classCodes: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

teachersRouter.post('/staff/login', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid login data');
    const { username, password, role } = parsed.data;
    const staff = await prisma.staff.findFirst({ where: { username: username.toLowerCase(), role } });
    if (!staff || !verifyPassword(password, staff.passwordHash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }
    res.set('Cache-Control', 'no-store');
    res.json({ token: signStaffToken(staff.id, role), staff: { name: staff.name, role } });
  } catch (error) { next(error); }
});

teachersRouter.get('/teachers', async (_req, res, next) => {
  try {
    const teachers = await prisma.staff.findMany({
      where: { role: 'teacher', assignments: { some: {} } },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true,
        assignments: { orderBy: { class: { name: 'asc' } }, select: { id: true, class: true } },
      },
    });
    res.json({ items: teachers.map(({ id, name, assignments }) => ({
      id, name, classes: assignments.map(a => ({ ...a.class, assignmentId: a.id })),
    })) });
  } catch (error) { next(error); }
});

const adminTeacherSelect = {
  id: true,
  username: true,
  name: true,
  assignments: {
    orderBy: { class: { name: 'asc' as const } },
    select: { id: true, class: true },
  },
} as const;

teachersRouter.get('/admin/teachers', requireStaff('admin'), async (_req, res, next) => {
  try {
    const teachers = await prisma.staff.findMany({
      where: { role: 'teacher' },
      orderBy: { name: 'asc' },
      select: adminTeacherSelect,
    });
    res.json({ items: teachers.map(({ id, username, name, assignments }) => ({
      id,
      username,
      name,
      classes: assignments.map(a => ({ ...a.class, assignmentId: a.id })),
    })) });
  } catch (error) { next(error); }
});

teachersRouter.get('/admin/classes', requireStaff('admin'), async (_req, res, next) => {
  try {
    const classes = await prisma.class.findMany({
      orderBy: { name: 'asc' },
      select: {
        code: true,
        name: true,
        assignments: {
          orderBy: { teacher: { name: 'asc' } },
          select: { id: true, teacherId: true, teacher: { select: { name: true } } },
        },
      },
    });
    res.json({ items: classes.map(c => ({
      code: c.code,
      name: c.name,
      assignments: c.assignments.map(a => ({ id: a.id, teacherId: a.teacherId, teacherName: a.teacher.name })),
    })) });
  } catch (error) { next(error); }
});

teachersRouter.post('/admin/classes', requireStaff('admin'), async (req, res, next) => {
  try {
    const parsed = classCreate.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Code and name are required; code must use lowercase letters, numbers and hyphens');
    const { code, name, teacherId } = parsed.data;
    const created = await prisma.$transaction(async tx => {
      if (teacherId) {
        const teacher = await tx.staff.findFirst({ where: { id: teacherId, role: 'teacher' }, select: { id: true } });
        if (!teacher) throw new HttpError(404, 'TEACHER_NOT_FOUND', 'Teacher not found');
      }
      const cls = await tx.class.create({ data: { code, name } });
      if (teacherId) await tx.teachingAssignment.create({ data: { teacherId, classCode: cls.code } });
      return cls;
    });
    res.status(201).json({ item: { code: created.code, name: created.name } });
  } catch (error) {
    if (isUniqueError(error)) return next(new HttpError(409, 'CLASS_EXISTS', 'A class with that code already exists'));
    next(error);
  }
});

teachersRouter.post('/admin/assignments', requireStaff('admin'), async (req, res, next) => {
  try {
    const parsed = assignmentCreate.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'A class and teacher are required');
    const { classCode, teacherId } = parsed.data;
    const [cls, teacher] = await Promise.all([
      prisma.class.findUnique({ where: { code: classCode }, select: { code: true } }),
      prisma.staff.findFirst({ where: { id: teacherId, role: 'teacher' }, select: { id: true } }),
    ]);
    if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Class not found');
    if (!teacher) throw new HttpError(404, 'TEACHER_NOT_FOUND', 'Teacher not found');
    const assignment = await prisma.teachingAssignment.create({ data: { classCode, teacherId } });
    res.status(201).json({ item: { id: assignment.id, classCode, teacherId } });
  } catch (error) {
    if (isUniqueError(error)) return next(new HttpError(409, 'ASSIGNMENT_EXISTS', 'This teacher is already assigned to that class'));
    next(error);
  }
});

teachersRouter.post('/admin/teachers', requireStaff('admin'), async (req, res, next) => {
  try {
    const parsed = teacherCreate.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Name, username and a password of at least 8 characters are required');
    const username = parsed.data.username.toLowerCase();
    const classCodes = [...new Set(parsed.data.classCodes)];
    const created = await prisma.$transaction(async tx => {
      if (classCodes.length) {
        const classes = await tx.class.findMany({ where: { code: { in: classCodes } }, select: { code: true } });
        if (classes.length !== classCodes.length) throw new HttpError(404, 'CLASS_NOT_FOUND', 'One or more selected classes do not exist');
      }
      const teacher = await tx.staff.create({
        data: {
          id: username,
          username,
          name: parsed.data.name,
          role: 'teacher',
          passwordHash: hashPassword(parsed.data.password),
          assignments: { create: classCodes.map(classCode => ({ classCode })) },
        },
        select: { id: true, username: true, name: true },
      });
      return teacher;
    });
    res.status(201).json({ item: created });
  } catch (error) {
    if (isUniqueError(error)) return next(new HttpError(409, 'USERNAME_EXISTS', 'That username is already in use'));
    next(error);
  }
});

function isUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

function listRegistrations(role: StaffRole): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const rows = await prisma.registration.findMany({
        where: role === 'teacher' ? { assignment: { teacherId: res.locals.staffId } } : {},
        orderBy: [{ registeredAt: 'desc' }, { id: 'asc' }],
        include: { ...registrationInclude, student: { select: { name: true } } },
      });
      res.json({ items: rows.map(row => ({ ...toRegistrationDto(row), studentName: row.student.name })) });
    } catch (error) { next(error); }
  };
}

teachersRouter.get('/teacher/registrations', requireStaff('teacher'), listRegistrations('teacher'));
teachersRouter.get('/admin/registrations', requireStaff('admin'), listRegistrations('admin'));
