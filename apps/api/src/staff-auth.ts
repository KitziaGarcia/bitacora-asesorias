import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { StaffRole } from '@bitacora/shared';
import { prisma } from './db';
import { HttpError } from './errors';

const secret = () => process.env.JWT_SECRET ?? 'dev-secret';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, stored] = hash.split(':');
  if (!salt || !stored) return false;
  const expected = Buffer.from(stored, 'hex');
  return expected.length === 64 && timingSafeEqual(expected, scryptSync(password, salt, 64));
}

export function signStaffToken(id: string, role: StaffRole): string {
  return jwt.sign({ role }, secret(), { algorithm: 'HS256', subject: id, expiresIn: '12h' });
}

export function requireStaff(role: StaffRole): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '')?.[1];
      if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in');
      let claims: string | jwt.JwtPayload;
      try {
        claims = jwt.verify(token, secret(), { algorithms: ['HS256'] });
      } catch {
        throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in');
      }
      if (typeof claims === 'string' || !claims.sub || claims.role !== role) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in with the correct role');
      }
      const staff = await prisma.staff.findFirst({ where: { id: claims.sub, role } });
      if (!staff) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in');
      res.locals.staffId = staff.id;
      next();
    } catch (error) { next(error); }
  };
}
