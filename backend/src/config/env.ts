/**
 * env.ts
 * Centralizes all environment variable access with defaults and validation.
 * Fail-fast: throws at startup if required vars are missing.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val.trim();
}

function optional(key: string, fallback: string): string {
  const val = process.env[key];
  return val && val.trim() !== '' ? val.trim() : fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val || val.trim() === '') return fallback;
  const n = parseInt(val.trim(), 10);
  if (isNaN(n)) throw new Error(`Environment variable ${key} must be an integer, got: ${val}`);
  return n;
}

export const config = {
  // ─── Server ────────────────────────────────────────────────
  PORT: optionalInt('PORT', 3001),
  NODE_ENV: optional('NODE_ENV', 'development'),

  // ─── Database ──────────────────────────────────────────────
  DB_HOST:     optional('DB_HOST', 'localhost'),
  DB_PORT:     optionalInt('DB_PORT', 5432),
  DB_NAME:     optional('DB_NAME', 'mycloud_platform'),
  DB_USER:     optional('DB_USER', 'postgres'),
  DB_PASSWORD: optional('DB_PASSWORD', ''),
  DATABASE_URL: optional('DATABASE_URL', ''),
  DB_SSL: optional('DB_SSL', 'false') === 'true',
  DB_POOL_MAX: optionalInt('DB_POOL_MAX', process.env.VERCEL === '1' ? 1 : 20),
  CORS_ORIGINS: optional(
    'CORS_ORIGINS',
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173',
  ),

  // ─── Auth ──────────────────────────────────────────────────
  JWT_SECRET:     optional('JWT_SECRET', 'mycloud-dev-secret-change-in-prod'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '24h'),

  // ─── Paths ─────────────────────────────────────────────────
  PROJECTS_BASE_PATH: optional('PROJECTS_BASE_PATH', './projects'),
  UPLOADS_PATH:       optional('UPLOADS_PATH', './uploads'),
  LOGS_PATH:          optional('LOGS_PATH', './logs'),

  // ─── Port pool ─────────────────────────────────────────────
  PORT_RANGE_START: optionalInt('PORT_RANGE_START', 4000),
  PORT_RANGE_END:   optionalInt('PORT_RANGE_END', 5000),

  // ─── Upload limits ─────────────────────────────────────────
  MAX_FILE_SIZE_MB: optionalInt('MAX_FILE_SIZE_MB', 200),

  // ─── Health check ──────────────────────────────────────────
  HEALTH_CHECK_TIMEOUT_MS:  optionalInt('HEALTH_CHECK_TIMEOUT_MS', 30000),
  HEALTH_CHECK_INTERVAL_MS: optionalInt('HEALTH_CHECK_INTERVAL_MS', 3000),
  HEALTH_CHECK_RETRIES:     optionalInt('HEALTH_CHECK_RETRIES', 10),

  // ─── Process ───────────────────────────────────────────────
  PROCESS_START_WAIT_MS: optionalInt('PROCESS_START_WAIT_MS', 5000),

  // ─── Vercel (opcional para despliegue web) ──────────────────
  VERCEL_ENABLED: optional('VERCEL_ENABLED', 'false'),
  VERCEL_TOKEN:   optional('VERCEL_TOKEN', ''),
  VERCEL_TEAM_ID: optional('VERCEL_TEAM_ID', ''),
} as const;

export type Config = typeof config;
