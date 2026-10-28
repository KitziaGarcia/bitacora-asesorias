import express, { type Express } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { classesRouter } from './routes/classes';
import { registrationsRouter } from './routes/registrations';
import { notFound, errorHandler } from './errors';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', authRouter);
  app.use('/api', classesRouter);
  app.use('/api', registrationsRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
