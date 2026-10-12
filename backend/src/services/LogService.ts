/**
 * LogService.ts
 * Writes structured deployment logs to the database and broadcasts
 * them over Server-Sent Events (SSE) for real-time streaming to the frontend.
 */

import { EventEmitter } from 'events';
import { DeploymentModel } from '../models/DeploymentModel';
import { LogLevel } from '../types';
import logger from '../utils/logger';

// Global SSE event bus — controllers subscribe to this
export const logEvents = new EventEmitter();
logEvents.setMaxListeners(100);

export class LogService {
  /**
   * Write a log entry to the DB and broadcast it over SSE.
   */
  static async log(
    deploymentId: string,
    projectId: string,
    message: string,
    level: LogLevel = LogLevel.INFO,
    stage?: string,
  ): Promise<void> {
    // Persist to DB
    await DeploymentModel.addLog(deploymentId, projectId, message, level, stage);

    // Broadcast for SSE streaming
    const event = {
      deploymentId,
      projectId,
      level,
      stage: stage ?? null,
      message,
      timestamp: new Date().toISOString(),
    };

    logEvents.emit(`deployment:${deploymentId}`, event);
    logEvents.emit(`project:${projectId}`, event);
    logEvents.emit('all', event);

    // Also log to Winston
    const winstonLevel = level === LogLevel.ERROR ? 'error' :
                         level === LogLevel.WARN  ? 'warn'  :
                         level === LogLevel.DEBUG ? 'debug' : 'info';
    logger[winstonLevel](`[Deploy:${stage ?? '?'}] ${message}`);
  }

  static async info(d: string, p: string, msg: string, stage?: string): Promise<void> {
    return LogService.log(d, p, msg, LogLevel.INFO, stage);
  }

  static async warn(d: string, p: string, msg: string, stage?: string): Promise<void> {
    return LogService.log(d, p, msg, LogLevel.WARN, stage);
  }

  static async error(d: string, p: string, msg: string, stage?: string): Promise<void> {
    return LogService.log(d, p, msg, LogLevel.ERROR, stage);
  }

  static async debug(d: string, p: string, msg: string, stage?: string): Promise<void> {
    return LogService.log(d, p, msg, LogLevel.DEBUG, stage);
  }
}
