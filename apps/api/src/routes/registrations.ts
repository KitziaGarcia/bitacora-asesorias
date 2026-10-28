import { Router } from 'express';
import type { Class, Registration } from '@prisma/client';
import { ScanBody, type RegistrationDto } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { authenticate } from '../auth';
import { verifySig } from '../qr';
import { withLock } from '../lock';

export const registrationsRouter = Router();

const DUPLICATE_WINDOW_MS = 2 * 60_000;

const toDto = (r: Registration & { class: Class }): RegistrationDto => ({
  id: r.id,
  studentId: r.studentId,
  classCode: r.classCode,
  className: r.class.name,
  registeredAt: r.registeredAt.toISOString(),
});

registrationsRouter.post('/registrations', authenticate, async (req, res, next) => {
  try {
    const parsed = ScanBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'classCode and sig are required');
    const { classCode, sig } = parsed.data;
    const cls = await prisma.class.findUnique({ where: { code: classCode } });
    if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Class not found');
    if (!verifySig(classCode, sig)) throw new HttpError(400, 'INVALID_QR', 'This QR code is not valid');
    const studentId = req.student!.id;

    const { registration, created } = await withLock(`${studentId}:${classCode}`, async () => {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
      const existing = await prisma.registration.findFirst({
        where: { studentId, classCode, registeredAt: { gte: since } },
        orderBy: { registeredAt: 'desc' },
        include: { class: true },
      });
      if (existing) return { registration: existing, created: false };
      const made = await prisma.registration.create({
        data: { studentId, classCode },
        include: { class: true },
      });
      return { registration: made, created: true };
    });
    res.status(created ? 201 : 200).json({ registration: toDto(registration) });
  } catch (err) {
    next(err);
  }
});

registrationsRouter.get('/registrations', authenticate, async (req, res, next) => {
  try {
    const rows = await prisma.registration.findMany({
      where: { studentId: req.student!.id },
      orderBy: { registeredAt: 'desc' },
      include: { class: true },
    });
    res.json({ items: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
});
