import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { initDb } from './server/db/database';
import apiRouter from './server/routes/api';

async function startServer() {
  try {
    await initDb();
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }

  const app = express();
  const PORT = 3000;

  // Enable trust proxy for reverse proxy environments (Cloud Run, Nginx)
  app.set('trust proxy', 1);

  // 0. Explicit CORS middleware for cross-origin / mobile browser requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
      crossOriginEmbedderPolicy: false,
      frameguard: false, // Allows iframe embedding in preview environments
    })
  );

  // 2. Request Body Limit (Protection against payload size DoS)
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // 3. Rate Limiters
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  });

  const financialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, error: 'Financial request limit reached. Please wait a few minutes before trying again.' },
  });

  const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, error: 'Too many requests. Please slow down.' },
  });

  // Apply rate limiters
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/wallet', financialLimiter);
  app.use('/api/payments', financialLimiter);
  app.use('/api/escrow', financialLimiter);
  app.use('/api', generalApiLimiter);

  // Diagnostic API Request Logger
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    console.log(`[API REQUEST] METHOD: ${req.method} | PATH: ${req.originalUrl || req.url} | HOST: ${req.headers.host} | ORIGIN: ${req.headers.origin || 'none'}`);
    next();
  });

  // 4. Mount API router FIRST
  app.use('/api', apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 5. Centralized Error Handler (No sensitive leaks)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Server Error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'An unexpected internal error occurred.' : (err.message || 'Internal Server Error'),
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
