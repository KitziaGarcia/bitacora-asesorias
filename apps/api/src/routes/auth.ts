import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { LoginBody, type StudentDto } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { signToken, authenticate } from '../auth';

export const authRouter = Router();

// First login with an ID creates the student. The name is unknown at that point, so the ID is used as a placeholder.
async function findOrCreateStudent(id: string) {
  const existing = await prisma.student.findUnique({ where: { id } });
  if (existing) return existing;
  try {
    return await prisma.student.create({ data: { id, name: id } });
  } catch (err) {
    // Two first logins with the same ID at once: the other request won the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.student.findUniqueOrThrow({ where: { id } });
    }
    throw err;
  }
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'A student ID is required');
    const id = parsed.data.studentId;
    const student = await findOrCreateStudent(id);
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
