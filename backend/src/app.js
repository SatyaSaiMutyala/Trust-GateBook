import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { devicesRouter } from './routes/devices.js';
import { filesRouter } from './routes/files.js';
import { hostsRouter } from './routes/hosts.js';
import { mailRouter } from './routes/mail.js';
import { notificationsRouter } from './routes/notifications.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { usersRouter } from './routes/users.js';
import { visitsRouter } from './routes/visits.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      // Photos are loaded cross-origin by the web app via <img src>.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      exposedHeaders: ['Content-Disposition'],
      maxAge: 600,
    }),
  );
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  // Public feature switches; the apps load them before login.
  app.get('/api/config', (_req, res) => {
    res.json({ features: { signup: config.features.signup, accountDeletion: config.features.accountDeletion } });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/hosts', hostsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/visits', visitsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/mail', mailRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/files', filesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
