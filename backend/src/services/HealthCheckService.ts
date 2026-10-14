/**
 * HealthCheckService.ts
 * Performs HTTP health checks against deployed applications.
 * Retries with exponential backoff.
 * A deployment is only marked RUNNING after receiving HTTP 200-399.
 */

import * as http from 'http';
import * as https from 'https';
import { HealthCheckResult } from '../types';
import { config } from '../config/env';
import logger from '../utils/logger';

function httpGet(url: string, timeoutMs: number): Promise<{ statusCode: number; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proto = url.startsWith('https') ? https : http;

    const req = proto.get(url, { timeout: timeoutMs }, (res) => {
      const latencyMs = Date.now() - start;
      // Drain response to free socket
      res.resume();
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, latencyMs });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

export class HealthCheckService {
  /**
   * Wait for a deployed application to become healthy.
   * Retries up to config.HEALTH_CHECK_RETRIES times with config.HEALTH_CHECK_INTERVAL_MS interval.
   *
   * @param port - The port the application is listening on
   * @param retries - Override retry count (uses config default if not set)
   * @param intervalMs - Override interval (uses config default if not set)
   */
  static async waitForHealthy(
    port: number,
    retries  = config.HEALTH_CHECK_RETRIES,
    intervalMs = config.HEALTH_CHECK_INTERVAL_MS,
    processError?: () => string | null,
  ): Promise<HealthCheckResult> {
    const url = `http://127.0.0.1:${port}`;

    logger.info(`[HealthCheck] Waiting for ${url} (${retries} retries, ${intervalMs}ms interval)`);

    let lastResult: HealthCheckResult = {
      healthy: false, statusCode: null, latencyMs: null, error: null, checkedAt: new Date(),
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      // Wait before checking (give the process time to start)
      await new Promise(r => setTimeout(r, intervalMs));
      const failure = processError?.();
      if (failure) return { healthy: false, statusCode: null, latencyMs: null, error: failure, checkedAt: new Date() };

      const result = await HealthCheckService.check(port);

      if (result.healthy) {
        logger.info(
          `[HealthCheck] ✓ Healthy on attempt ${attempt}/${retries} — HTTP ${result.statusCode} in ${result.latencyMs}ms`,
        );
        return result;
      }

      logger.debug(
        `[HealthCheck] Attempt ${attempt}/${retries} — ${result.error ?? `HTTP ${result.statusCode}`}`,
      );

      lastResult = result;
    }

    logger.warn(`[HealthCheck] All ${retries} attempts failed. Last error: ${lastResult.error}`);
    return lastResult;
  }

  /**
   * Single health check — does NOT retry.
   */
  static async check(port: number): Promise<HealthCheckResult> {
    const url = `http://127.0.0.1:${port}`;

    try {
      const { statusCode, latencyMs } = await httpGet(url, 5000);
      const healthy = statusCode >= 200 && statusCode < 400;

      return {
        healthy,
        statusCode,
        latencyMs,
        error: healthy ? null : `HTTP ${statusCode}`,
        checkedAt: new Date(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        healthy:    false,
        statusCode: null,
        latencyMs:  null,
        error:      message,
        checkedAt:  new Date(),
      };
    }
  }
}
