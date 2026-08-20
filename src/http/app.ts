import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}
