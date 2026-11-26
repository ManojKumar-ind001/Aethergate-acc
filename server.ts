import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getDb } from './src/backend/database/db.ts';
import { authRouter } from './src/backend/auth/authRoutes.ts';
import { oauthRouter } from './src/backend/oauth/oauthRoutes.ts';
import { consoleRouter } from './src/backend/api/consoleRoutes.ts';
import { gatewayV1Router } from './src/backend/api/gatewayV1Routes.ts';

async function startServer() {
  // Initialize SQLite database & run migrations on boot
  getDb();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Basic security headers (avoid X-Frame-Options so AI Studio iframe preview renders cleanly)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Mount backend API routes
  app.use('/api/auth', authRouter);
  app.use('/api', oauthRouter);
  app.use('/api/console', consoleRouter);
  app.use('/api/v1', gatewayV1Router);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AetherGate server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AetherGate server:', err);
  process.exit(1);
});
