import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { prisma } from './db';
import { HttpError } from './errors';

const secret = () => process.env.JWT_SECRET ?? 'dev-secret';

export function signToken(studentId: string): string {
  return jwt.sign({}, secret(), {
    subject: studentId,
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '12h') as jwt.SignOptions['expiresIn'],
  });
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Please sign in');
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) throw unauthorized();
    let sub: string | undefined;
    try {
      sub = jwt.verify(match[1], secret()).sub as string | undefined;
    } catch {
      throw unauthorized();
    }
    if (!sub) throw unauthorized();
    const student = await prisma.student.findUnique({ where: { id: sub } });
    if (!student) throw unauthorized();
    req.student = { id: student.id, name: student.name };
    next();
  } catch (err) {
    next(err);
  }
};
