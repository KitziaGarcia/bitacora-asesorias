import { Router } from 'express';
import QRCode from 'qrcode';
import { CLASSES, type ClassInfo } from '@bitacora/shared';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { buildScanUrl } from '../qr';

export const classesRouter = Router();

classesRouter.get('/classes', async (_req, res, next) => {
  try {
    const rows = await prisma.class.findMany();
    const order = (code: string) => CLASSES.findIndex(c => c.code === code);
    const items: ClassInfo[] = rows
      .map(r => ({ code: r.code, name: r.name }))
      .sort((a, b) => {
        const ia = order(a.code), ib = order(b.code);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

classesRouter.get('/classes/:code/qr', async (req, res, next) => {
  try {
    const cls = await prisma.class.findUnique({ where: { code: req.params.code } });
    if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', 'Class not found');
    const url = buildScanUrl(cls.code);
    if (req.query.format === 'json') {
      res.json({ url });
    } else if (req.query.format === 'png') {
      const buf = await QRCode.toBuffer(url, { width: 512, margin: 2 });
      res.type('png').send(buf);
    } else {
      const svg = await QRCode.toString(url, { type: 'svg', margin: 2 });
      res.type('image/svg+xml').send(svg);
    }
  } catch (err) {
    next(err);
  }
});
