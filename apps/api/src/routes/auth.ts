import { Router } from 'express';
import { LoginBody, type StudentDto } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { signToken, authenticate } from '../auth';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'A student ID is required');
    const id = parsed.data.studentId;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'That student ID is not registered');
    const dto: StudentDto = { studentId: student.id, name: student.name };
    res.json({ token: signToken(student.id), student: dto });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  const s = req.student!;
  const student: StudentDto = { studentId: s.id, name: s.name };
  res.json({ student });
});
