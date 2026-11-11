import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { StaffRole } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { requireStaff, signStaffToken, verifyPassword } from '../staff-auth';
import { registrationInclude, toRegistrationDto } from '../registration-dto';

export const teachersRouter = Router();
const credentials = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
  role: z.enum(['teacher', 'admin']),
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
