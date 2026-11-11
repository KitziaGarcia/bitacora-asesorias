import { Router } from 'express';
import { ScanBody } from '@bitacora/shared';
import { registrationInclude, toRegistrationDto } from '../registration-dto';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { authenticate } from '../auth';
import { verifySig } from '../qr';
import { withLock } from '../lock';

export const registrationsRouter = Router();

const DUPLICATE_WINDOW_MS = 2 * 60_000;

registrationsRouter.post('/registrations', authenticate, async (req, res, next) => {
  try {
    const parsed = ScanBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'classCode and sig are required');
    const { classCode, sig, assignmentId } = parsed.data;
    if (!assignmentId) throw new HttpError(410, 'LEGACY_QR', 'Use a QR with a teacher assignment');
    const cls = await prisma.class.findUnique({ where: { code: classCode } });
    if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Class not found');
    const assignment = await prisma.teachingAssignment.findFirst({ where: { id: assignmentId, classCode } });
    if (!assignment || !verifySig(classCode, sig, assignmentId)) {
      throw new HttpError(400, 'INVALID_QR', 'This QR code is not valid');
    }
    const studentId = req.student!.id;

    const { registration, created } = await withLock(JSON.stringify([studentId, assignmentId]), async () => {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
      const existing = await prisma.registration.findFirst({
        where: { studentId, assignmentId, registeredAt: { gte: since } },
        orderBy: { registeredAt: 'desc' },
        include: registrationInclude,
      });
      if (existing) return { registration: existing, created: false };
      const made = await prisma.registration.create({
        data: { studentId, classCode, assignmentId },
        include: registrationInclude,
      });
      return { registration: made, created: true };
    });
    res.status(created ? 201 : 200).json({ registration: toRegistrationDto(registration) });
  } catch (err) {
    next(err);
  }
});

registrationsRouter.get('/registrations', authenticate, async (req, res, next) => {
  try {
    const rows = await prisma.registration.findMany({
      where: { studentId: req.student!.id },
      orderBy: { registeredAt: 'desc' },
      include: registrationInclude,
    });
    res.json({ items: rows.map(toRegistrationDto) });
  } catch (err) {
    next(err);
  }
});
