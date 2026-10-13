/**
 * index.ts
 * MyCloud Platform – Express application entry point.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config }          from './config/env';
import { testConnection, closePool } from './config/database';
import { StorageManager }  from './services/StorageManager';
import { ProcessManager }  from './services/ProcessManager';
import { errorHandler }    from './middleware/errorHandler';

import authRoutes    from './routes/auth';
import projectRoutes from './routes/projects';
import userRoutes    from './routes/users';
import logger from './utils/logger';

const app = express();

// ── Security & middleware ─────────────────────────────────────────────────────

app.use(helmet({ crossOriginEmbedderPolicy: false }));

const allowedOrigins = config.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (skip in test)
if (config.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ success: true, version: '1.0.0', time: new Date().toISOString() });
});

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/projects', projectRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler (must be last)
app.use(errorHandler as unknown as (err: Error, req: Request, res: Response, next: NextFunction) => void);

// ── Startup ───────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  logger.info('=== MyCloud Platform Starting ===');

  // Verify DB connection
  await testConnection();

  // Ensure storage directories exist
  StorageManager.ensureDirectories();

  // Mark any orphaned processes from previous run as crashed
  await ProcessManager.recoverAfterRestart();

  const server = app.listen(config.PORT, () => {
    logger.info(`✅ MyCloud API running on http://localhost:${config.PORT}`);
    logger.info(`   Environment: ${config.NODE_ENV}`);
    logger.info(`   Database:    ${config.DB_NAME} @ ${config.DB_HOST}:${config.DB_PORT}`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`[Shutdown] Received ${signal}...`);
    server.close(async () => {
      await closePool();
      logger.info('[Shutdown] Clean exit');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error(`[UncaughtException] ${err.message}`, { stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`[UnhandledRejection] ${String(reason)}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
