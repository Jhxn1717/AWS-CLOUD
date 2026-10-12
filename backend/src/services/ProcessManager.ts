/**
 * ProcessManager.ts
 * Spawns, monitors, stops, and restarts project processes.
 * Uses child_process.spawn() — never exec or shell:true with user input.
 * Keeps an in-memory registry of running processes keyed by projectId.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { ProcessModel } from '../models/ProcessModel';
import { ProjectModel } from '../models/ProjectModel';
import { ProcessStatus, ProjectStatus } from '../types';
import { config } from '../config/env';
import logger from '../utils/logger';

interface RunningProcess {
  child:      ChildProcess;
  projectId:  string;
  dbRecordId: string;
  port:       number;
  command:    string;
  args:       string[];
  startedAt:  Date;
  logBuffer:  string[];
}

// In-memory registry: projectId → RunningProcess
const registry = new Map<string, RunningProcess>();

// Event emitter for real-time log streaming
export const processEvents = new EventEmitter();

export class ProcessManager {
  /**
   * Start a new process for a project.
   * Returns the OS PID.
   */
  static async start(options: {
    projectId:  string;
    command:    string;
    args:       string[];
    workingDir: string;
    port:       number;
    envVars:    Record<string, string>;
  }): Promise<number> {
    const { projectId, command, args, workingDir, port, envVars } = options;

    // Kill any existing process for this project first
    await ProcessManager.stop(projectId, true);

    // Build the full environment: inherit parent + project vars
    const fullEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...envVars,
      PORT: String(port),
    };

    logger.info(`[ProcessManager] Spawning: ${command} ${args.join(' ')}`, {
      projectId,
      workingDir,
      port,
    });

    // Determine platform-specific shell options
    const isWindows = process.platform === 'win32';

    // Create log file for this project
    const logsDir = path.resolve(process.cwd(), config.LOGS_PATH, `project-${projectId}`);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, `process-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    // Create DB record
    const dbRecord = await ProcessModel.create({
      projectId,
      command,
      args,
      workingDir,
      envVars,
    });

    // Spawn the process
    const child = spawn(command, args, {
      cwd:   workingDir,
      env:   fullEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      // On Windows, use shell for npm/pip commands
      shell: isWindows && (command === 'npm' || command === 'pip' || command === 'python'),
      windowsHide: true,
    });

    if (!child.pid) {
      await ProcessModel.updateStatus(dbRecord.id, ProcessStatus.CRASHED);
      throw new Error(`Failed to spawn process: ${command} ${args.join(' ')}`);
    }

    logger.info(`[ProcessManager] Process spawned PID=${child.pid} for project ${projectId}`);

    // Update DB with PID
    await ProcessModel.updatePid(dbRecord.id, child.pid);

    const entry: RunningProcess = {
      child,
      projectId,
      dbRecordId: dbRecord.id,
      port,
      command,
      args,
      startedAt: new Date(),
      logBuffer: [],
    };

    registry.set(projectId, entry);

    // ── stdout ────────────────────────────────────────────────
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      logStream.write(`[stdout] ${text}`);
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        entry.logBuffer.push(`[OUT] ${line}`);
        if (entry.logBuffer.length > 1000) entry.logBuffer.shift();
        processEvents.emit('log', { projectId, line: `[OUT] ${line}`, timestamp: new Date() });
      }
    });

    // ── stderr ────────────────────────────────────────────────
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      logStream.write(`[stderr] ${text}`);
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        entry.logBuffer.push(`[ERR] ${line}`);
        if (entry.logBuffer.length > 1000) entry.logBuffer.shift();
        processEvents.emit('log', { projectId, line: `[ERR] ${line}`, timestamp: new Date() });
      }
    });

    // ── exit ──────────────────────────────────────────────────
    child.on('exit', async (code, signal) => {
      logStream.end();
      registry.delete(projectId);

      logger.warn(`[ProcessManager] Process exited PID=${child.pid} code=${code} signal=${signal}`, {
        projectId,
      });

      const status = code === 0 ? ProcessStatus.STOPPED : ProcessStatus.CRASHED;

      await ProcessModel.updateStatus(dbRecord.id, status, code, signal ?? undefined);

      // Update project status
      const projectStatus = code === 0 ? ProjectStatus.STOPPED : ProjectStatus.FAILED;
      await ProjectModel.updateStatus(projectId, projectStatus);
      await ProjectModel.update(projectId, { processPid: null });

      processEvents.emit('exit', { projectId, code, signal, timestamp: new Date() });
    });

    // ── error ─────────────────────────────────────────────────
    child.on('error', async (err) => {
      logStream.end();
      registry.delete(projectId);

      logger.error(`[ProcessManager] Process error: ${err.message}`, { projectId });

      await ProcessModel.updateStatus(dbRecord.id, ProcessStatus.CRASHED);
      await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
      await ProjectModel.update(projectId, { processPid: null });

      processEvents.emit('error', { projectId, error: err.message, timestamp: new Date() });
    });

    // Update project with PID
    await ProjectModel.update(projectId, { processPid: child.pid });

    return child.pid;
  }

  /**
   * Stop a running process gracefully (SIGTERM → SIGKILL after 5s).
   */
  static async stop(projectId: string, silent = false): Promise<void> {
    const entry = registry.get(projectId);
    if (!entry) {
      if (!silent) logger.warn(`[ProcessManager] No running process found for project ${projectId}`);
      return;
    }

    logger.info(`[ProcessManager] Stopping PID=${entry.child.pid} for project ${projectId}`);

    return new Promise((resolve) => {
      const pid = entry.child.pid;
      let killed = false;

      const onExit = () => {
        killed = true;
        clearTimeout(killTimer);
        resolve();
      };

      entry.child.once('exit', onExit);

      // Try graceful termination first
      try {
        if (process.platform === 'win32' && pid) {
          // On Windows use taskkill to kill the entire process tree
          spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false });
          // Give taskkill a moment then resolve
          setTimeout(() => {
            if (!killed) resolve();
          }, 2000);
        } else {
          entry.child.kill('SIGTERM');
        }
      } catch (e) {
        logger.warn(`[ProcessManager] Failed to send SIGTERM: ${e}`);
      }

      // Force kill after 5 seconds
      const killTimer = setTimeout(async () => {
        if (!killed) {
          try {
            if (process.platform !== 'win32') {
              entry.child.kill('SIGKILL');
            }
          } catch (e) {
            // ignore
          }
          await ProcessModel.updateStatus(entry.dbRecordId, ProcessStatus.KILLED);
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Restart a project's process.
   */
  static async restart(projectId: string): Promise<number> {
    const entry = registry.get(projectId);
    if (!entry) {
      throw new Error(`No running process found for project ${projectId}`);
    }

    const { command, args, port } = entry;
    const child = entry.child;

    // Get working dir and env from the DB record
    const dbRecord = await ProcessModel.findByProject(projectId);
    if (!dbRecord) throw new Error('No process record found');

    await ProcessManager.stop(projectId);

    // Small delay to allow port to be freed by OS
    await new Promise(r => setTimeout(r, 1000));

    return ProcessManager.start({
      projectId,
      command,
      args,
      workingDir: dbRecord.working_dir,
      port,
      envVars: dbRecord.env_vars as Record<string, string>,
    });
  }

  /**
   * Check if a process is currently running in memory.
   */
  static isRunning(projectId: string): boolean {
    const entry = registry.get(projectId);
    if (!entry) return false;
    // Check if child is still alive
    try {
      process.kill(entry.child.pid!, 0);
      return true;
    } catch {
      registry.delete(projectId);
      return false;
    }
  }

  /**
   * Get the PID of a running process.
   */
  static getPid(projectId: string): number | null {
    return registry.get(projectId)?.child.pid ?? null;
  }

  /**
   * Get recent log lines from the in-memory buffer.
   */
  static getRecentLogs(projectId: string, lines = 100): string[] {
    const entry = registry.get(projectId);
    if (!entry) return [];
    return entry.logBuffer.slice(-lines);
  }

  /**
   * Recover processes after server restart.
   * Marks any DB records in STARTING/RUNNING state as CRASHED
   * since we lost the actual PIDs.
   */
  static async recoverAfterRestart(): Promise<void> {
    const running = await ProcessModel.findAllRunning();
    if (running.length === 0) return;

    logger.warn(`[ProcessManager] Found ${running.length} orphaned process(es) after restart — marking as CRASHED`);

    for (const proc of running) {
      await ProcessModel.updateStatus(proc.id, ProcessStatus.CRASHED, null, null);
      await ProjectModel.updateStatus(proc.project_id, ProjectStatus.FAILED);
      await ProjectModel.update(proc.project_id, { processPid: null });
    }
  }

  /**
   * Get summary of all currently running processes.
   */
  static getRunningProcesses(): Array<{
    projectId: string;
    pid: number | undefined;
    port: number;
    uptime: number;
    command: string;
  }> {
    return Array.from(registry.values()).map(e => ({
      projectId: e.projectId,
      pid: e.child.pid,
      port: e.port,
      uptime: Date.now() - e.startedAt.getTime(),
      command: `${e.command} ${e.args.join(' ')}`,
    }));
  }
}
