import { Router } from 'express';
import { prisma } from '../db';

export const teachersRouter = Router();

// Demo: all registrations are visible without teacher authentication.
teachersRouter.get('/teacher/registrations', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const rows = await prisma.registration.findMany({ orderBy: [{ registeredAt: 'desc' }, { id: 'asc' }], include: { class: true, student: true } });
    res.json({ items: rows.map(r => ({ id: r.id, studentId: r.studentId, studentName: r.student.name, classCode: r.classCode, className: r.class.name, registeredAt: r.registeredAt.toISOString() })) });
  } catch (err) { next(err); }
});

