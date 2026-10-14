/**
 * DeploymentService.ts
 * Orchestrates the full deployment pipeline:
 *
 *  1. ZIP_UPLOAD        – validate & stage the ZIP
 *  2. EXTRACTION        – extract with Zip Slip protection
 *  3. ANALYSIS          – detect runtime/framework/type
 *  4. DEPENDENCY_INSTALL – npm install / pip install / mvn / composer
 *  5. DATABASE_PROVISIONING – create isolated DB if needed
 *  6. BUILD             – npm run build / mvn package / etc.
 *  7. PORT_ALLOCATION   – reserve a port from the pool
 *  8. PROCESS_START     – spawn the process (or static server)
 *  9. HEALTH_CHECK      – HTTP probe, retry loop
 * 10. RUNNING           – mark success
 *
 * RULES:
 *  - A stage failure immediately marks the deployment FAILED with the real error.
 *  - RUNNING is ONLY set after a successful HTTP health check.
 *  - Never mark success when exit code ≠ 0.
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

import { ProjectAnalyzer }  from './ProjectAnalyzer';
import { StorageManager }   from './StorageManager';
import { PortManager }      from './PortManager';
import { ProcessManager }   from './ProcessManager';
import { DatabaseManager }  from './DatabaseManager';
import { HealthCheckService } from './HealthCheckService';
import { StaticServer }     from './StaticServer';
import { NodeRuntimeManager } from './NodeRuntimeManager';
import { RuntimePreflight } from './RuntimePreflight';
import { LogService }       from './LogService';

import { ProjectModel }     from '../models/ProjectModel';
import { DeploymentModel }  from '../models/DeploymentModel';
import { EnvVarModel }      from '../models/EnvVarModel';

import {
  DeploymentStatus, StageStatus, ProjectStatus,
  ProjectType, Framework, LogLevel, AnalysisResult,
} from '../types';
import { config } from '../config/env';
import logger from '../utils/logger';
import { projectEnvironment } from '../utils/projectEnvironment';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Run a child process and collect output.
 * Resolves on exit code 0, rejects with full stderr/stdout on any other code.
 */
function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  onLine?: (line: string) => void,
): Promise<string> {
  return (async () => {
    if (['node', 'npm', 'npx', 'yarn'].includes(command)) {
      const prefixIndex = args.indexOf('--prefix');
      const runtimeDirectory = prefixIndex >= 0 && args[prefixIndex + 1] ? path.resolve(cwd, args[prefixIndex + 1]) : cwd;
      const runtime = await NodeRuntimeManager.resolve(runtimeDirectory, async message => { onLine?.(message); });
      env = { ...env, ...runtime.env };
      if (command === 'node') command = runtime.nodePath;
      else if (command === 'npm' || command === 'npx') {
        const cli = path.join(path.dirname(runtime.nodePath), 'node_modules/npm/bin', command === 'npm' ? 'npm-cli.js' : 'npx-cli.js');
        args = [cli, ...args];
        command = runtime.nodePath;
      }
    }
    return new Promise<string>((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const useShell  = isWindows && (command === 'npm' || command === 'pip' ||
                                    command === 'mvn' || command === 'composer');

    const child = spawn(command, args, {
      cwd,
      env: projectEnvironment(env),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: useShell,
      windowsHide: true,
    });

    let output = '';

    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      if (onLine) {
        text.split('\n').filter(Boolean).forEach(onLine);
      }
    });

    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      if (onLine) {
        text.split('\n').filter(Boolean).forEach(line => onLine(`[STDERR] ${line}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to run "${command} ${args.join(' ')}": ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(
          `Command "${command} ${args.join(' ')}" exited with code ${code}.\n${output}`,
        ));
      }
    });
    });
  })();
}

// ─── Vercel Deployer Helper ──────────────────────────────────────────────────

class VercelDeployer {
  private token: string;
  private teamId?: string;

  constructor(token: string, teamId?: string) {
    this.token = token;
    this.teamId = teamId;
  }

  /**
   * Uploads source files and waits for Vercel's production build to finish.
   */
  async deployFromDirectory(
    projectName: string,
    projectPath: string,
    env: Record<string, string> = {},
    analysis: AnalysisResult,
    onStatus?: (message: string) => Promise<void>,
  ): Promise<string> {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    if (!safeName) throw new Error('A valid Vercel project name could not be generated.');

    const project = await this.getOrCreateProject(safeName);
    const projectId = typeof project.id === 'string' ? project.id : '';
    if (!projectId) throw new Error('Vercel did not return a project ID.');

    await this.upsertEnvironment(projectId, env);
    const files = await this.collectSourceFiles(projectPath, Boolean(analysis.buildCommand));
    if (files.length === 0) throw new Error('No deployable source files were found.');
    if (files.length > 15000) throw new Error('Vercel deployment exceeds the 15,000-file limit.');

    await onStatus?.(`[VERCEL] Uploading ${files.length} source files`);
    const uploadedFiles: Array<{ file: string; sha: string; size: number }> = [];
    for (let offset = 0; offset < files.length; offset += 4) {
      const uploaded = await Promise.all(
        files.slice(offset, offset + 4).map(file => this.uploadFile(file)),
      );
      uploadedFiles.push(...uploaded);
    }

    const deployment = await this.request('/v13/deployments', 'POST', {
      name: safeName,
      project: projectId,
      files: uploadedFiles,
      projectSettings: this.getProjectSettings(analysis, projectPath),
      target: 'production',
      meta: { mycloudProject: projectName },
    });
    const deploymentId = typeof deployment?.id === 'string' ? deployment.id : '';
    if (!deploymentId) throw new Error('Vercel did not return a deployment ID.');

    return this.waitForReady(deploymentId, deployment, safeName, onStatus);
  }

  private async request(pathname: string, method: string, body?: unknown, allowNotFound = false): Promise<Record<string, unknown> | null> {
    const url = new URL(pathname, 'https://api.vercel.com');
    if (this.teamId && !url.searchParams.has('teamId')) url.searchParams.set('teamId', this.teamId);
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === 'string'
        ? error.message
        : typeof payload.message === 'string' ? payload.message : response.statusText;
      throw new Error(`Vercel API ${response.status}: ${message}`);
    }
    return payload;
  }

  private async getOrCreateProject(projectName: string): Promise<Record<string, unknown>> {
    const projectPath = `/v9/projects/${encodeURIComponent(projectName)}`;
    const existing = await this.request(projectPath, 'GET', undefined, true);
    if (existing) return existing;

    try {
      const created = await this.request('/v11/projects', 'POST', { name: projectName });
      if (created) return created;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('409')) throw error;
      const existingAfterConflict = await this.request(projectPath, 'GET');
      if (existingAfterConflict) return existingAfterConflict;
    }
    throw new Error(`Vercel project "${projectName}" could not be created or found.`);
  }

  private async upsertEnvironment(projectId: string, env: Record<string, string>): Promise<void> {
    const reservedKeys = new Set(['NODE_ENV', 'PORT']);
    const variables = Object.entries(env)
      .filter(([key, value]) => key && value !== undefined && !reservedKeys.has(key))
      .map(([key, value]) => ({
      key,
      value,
      type: /PASSWORD|SECRET|TOKEN|DATABASE_URL|PRIVATE|KEY/i.test(key) ? 'encrypted' : 'plain',
      target: ['production', 'preview'],
      }));
    if (variables.length === 0) return;

    const result = await this.request(
      `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
      'POST',
      variables,
    );
    const failed = result?.failed;
    if (Array.isArray(failed) && failed.length > 0) {
      const keys = failed.map(item => {
        const failure = item as { error?: { key?: string; message?: string } };
        return failure.error?.key ?? 'unknown variable';
      });
      throw new Error(`Vercel rejected environment variables: ${keys.join(', ')}`);
    }
  }

  private async collectSourceFiles(
    projectPath: string,
    hasRemoteBuild: boolean,
  ): Promise<Array<{ file: string; absolutePath: string; size: number; sha: string }>> {
    const ignoredDirectories = new Set(['.git', '.vercel', 'node_modules', '.next', '.turbo', '.cache', 'coverage']);
    const ignoredOutputs = new Set(['dist', 'build', 'out']);
    const files: Array<{ file: string; absolutePath: string; size: number; sha: string }> = [];

    const visit = async (directory: string): Promise<void> => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (ignoredDirectories.has(entry.name) || (hasRemoteBuild && ignoredOutputs.has(entry.name))) continue;
          await visit(absolutePath);
          continue;
        }
        if (!entry.isFile() || /(^|\/)\.env(?:$|\.)/i.test(entry.name) || /\.log$/i.test(entry.name)) continue;

        const relative = path.relative(projectPath, absolutePath).split(path.sep).join('/');
        const stat = fs.statSync(absolutePath);
        const sha = await this.sha1File(absolutePath);
        files.push({ file: relative, absolutePath, size: stat.size, sha });
      }
    };

    await visit(projectPath);
    return files;
  }

  private async sha1File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async uploadFile(file: { file: string; absolutePath: string; size: number; sha: string }): Promise<{ file: string; sha: string; size: number }> {
    const url = new URL('/v2/files', 'https://api.vercel.com');
    if (this.teamId) url.searchParams.set('teamId', this.teamId);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(file.size),
        'x-vercel-digest': file.sha,
      },
      body: fs.createReadStream(file.absolutePath),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      const error = payload.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === 'string' ? error.message : response.statusText;
      throw new Error(`Vercel file upload failed (${response.status}) for ${file.file}: ${message}`);
    }
    return { file: file.file, sha: file.sha, size: file.size };
  }

  private getProjectSettings(analysis: AnalysisResult, projectPath: string): Record<string, string | null> {
    const rootFiles = fs.readdirSync(projectPath);
    const hasViteConfig = rootFiles.some(file => /^vite\.config\./.test(file));
    let framework: string | null = null;
    let outputDirectory: string | null = null;

    switch (analysis.framework) {
      case Framework.NEXTJS: framework = 'nextjs'; break;
      case Framework.VITE: framework = 'vite'; break;
      case Framework.REACT:
        framework = hasViteConfig ? 'vite' : 'create-react-app';
        outputDirectory = hasViteConfig ? 'dist' : 'build';
        break;
      case Framework.VUE:
        framework = hasViteConfig ? 'vite' : 'vue';
        outputDirectory = 'dist';
        break;
      case Framework.ANGULAR:
        framework = 'angular';
        outputDirectory = 'dist';
        break;
      case Framework.EXPRESS: framework = 'express'; break;
      case Framework.FASTAPI: framework = 'fastapi'; break;
      case Framework.FLASK: framework = 'flask'; break;
      case Framework.DJANGO: framework = 'django'; break;
      default: break;
    }

    return {
      framework,
      buildCommand: analysis.buildCommand,
      installCommand: null,
      outputDirectory,
    };
  }

  private async waitForReady(
    deploymentId: string,
    initial: Record<string, unknown> | null,
    projectName: string,
    onStatus?: (message: string) => Promise<void>,
  ): Promise<string> {
    const deadline = Date.now() + 15 * 60 * 1000;
    let deployment = initial;
    let previousState = '';

    while (Date.now() < deadline) {
      const state = typeof deployment?.readyState === 'string' ? deployment.readyState : 'QUEUED';
      if (state !== previousState) {
        previousState = state;
        await onStatus?.(`[VERCEL] ${projectName}: ${state}`);
      }
      if (state === 'READY') {
        const url = typeof deployment?.url === 'string' ? deployment.url : '';
        if (!url) throw new Error('Vercel reported READY without a deployment URL.');
        return url.startsWith('http') ? url : `https://${url}`;
      }
      if (state === 'ERROR' || state === 'CANCELED' || state === 'BLOCKED') {
        const detail = typeof deployment?.errorMessage === 'string' ? deployment.errorMessage : state;
        throw new Error(`Vercel deployment ${state}: ${detail}`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      deployment = await this.request(`/v13/deployments/${encodeURIComponent(deploymentId)}`, 'GET');
    }

    throw new Error(`Vercel deployment did not become ready within 15 minutes: ${projectName}`);
  }

  async deleteProject(projectName: string): Promise<void> {
    await this.request(`/v9/projects/${encodeURIComponent(projectName)}`, 'DELETE', undefined, true);
  }
}

// ─── DeploymentService ───────────────────────────────────────────────────────

export class DeploymentService {
  /**
   * Convert a GitHub repository URL into a ZIP archive URL and download it.
   * Supports public GitHub repos; for private repos, provide a token in the future.
   */
  private static normalizeGithubRepoUrl(repoUrl: string, branch: string): string {
    let clean = repoUrl.trim();

    if (!clean) {
      throw new Error('GitHub repository URL is required.');
    }

    clean = clean.replace(/^git@github\.com:/i, 'https://github.com/');
    clean = clean.replace(/\.git$/i, '');
    clean = clean.replace(/[?#].*$/g, '');
    clean = clean.replace(/\/+(?=$)/, '');

    if (clean.includes('/tree/') || clean.includes('/blob/')) {
      clean = clean.replace(/\/(tree|blob)\/.*$/i, '');
    }

    const match = clean.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i) ??
      clean.match(/^github\.com\/([^/]+)\/([^/]+)$/i) ??
      clean.match(/^([^/]+)\/([^/]+)$/);

    if (!match) {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }

    const [, owner, repo] = match;
    return `https://github.com/${owner}/${repo}/archive/refs/heads/${encodeURIComponent(branch || 'main')}.zip`;
  }

  private static async downloadGitHubRepoZip(repoUrl: string, branch: string): Promise<string> {
    const zipUrl = DeploymentService.normalizeGithubRepoUrl(repoUrl, branch);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycloud-github-'));
    const zipPath = path.join(tmpDir, 'repo.zip');

    logger.info(`[GitHub] Downloading repo archive: ${zipUrl}`);

    const response = await fetch(zipUrl, {
      headers: {
        'User-Agent': 'mycloud-app',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub repository download failed (${response.status} ${response.statusText}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));
    logger.info(`[GitHub] Repo archive saved to: ${zipPath}`);

    return zipPath;
  }

  static async deployFromGithub(
    projectId: string,
    userId: string,
    repoUrl: string,
    branch = 'main',
  ): Promise<string> {
    const zipPath = await DeploymentService.downloadGitHubRepoZip(repoUrl, branch);
    return DeploymentService.deploy(projectId, userId, zipPath);
  }

  /**
   * Entry point: called after a ZIP has been received by the upload controller.
   * Runs the full pipeline asynchronously (does not block the HTTP response).
   *
   * @param projectId   - Project UUID
   * @param userId      - Authenticated user UUID
   * @param tempZipPath - Path to the uploaded temp file (from multer)
   */
  static async deploy(
    projectId: string,
    userId: string,
    tempZipPath: string,
  ): Promise<string> {
    // Create deployment record
    const deployment = await DeploymentModel.create(projectId, userId);
    const depId = deployment.id;

    // Update project status
    await ProjectModel.updateStatus(projectId, ProjectStatus.ANALYZING);

    // Run pipeline asynchronously so HTTP can return the deployment ID immediately
    setImmediate(() => {
      DeploymentService._runPipeline(projectId, userId, depId, tempZipPath).catch(async (err) => {
        logger.error(`[DeploymentService] Unhandled pipeline error: ${err.message}`);
        await DeploymentModel.updateStatus(depId, DeploymentStatus.FAILED, undefined, err.message);
        await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
      });
    });

    return depId;
  }

  // ── Full pipeline ───────────────────────────────────────────────────────────

  private static async _runPipeline(
    projectId: string,
    userId: string,
    depId: string,
    tempZipPath: string,
  ): Promise<void> {
    let allocatedPort: number | null = null;
    let vercelUrl: string | null = null;
    const deployToVercel = config.VERCEL_ENABLED === 'true' && !!config.VERCEL_TOKEN;

    // Helper: log + stage tracking
    const log = async (msg: string, level = LogLevel.INFO, stage?: string) =>
      LogService.log(depId, projectId, msg, level, stage);

    const startStage = async (stage: string) => {
      await DeploymentModel.createStage(depId, stage);
      await DeploymentModel.startStage(depId, stage);
      await DeploymentModel.updateStatus(depId, stage as DeploymentStatus, stage);
      await log(`Starting stage: ${stage}`, LogLevel.INFO, stage);
    };

    const finishStage = async (stage: string, logs?: string) => {
      await DeploymentModel.finishStage(depId, stage, StageStatus.SUCCESS, logs);
      await log(`Stage complete: ${stage}`, LogLevel.INFO, stage);
    };

    const skipStage = async (stage: string, reason: string) => {
      await DeploymentModel.createStage(depId, stage);
      await DeploymentModel.updateStatus(depId, stage as DeploymentStatus, stage);
      await DeploymentModel.finishStage(depId, stage, StageStatus.SKIPPED);
      await log(reason, LogLevel.INFO, stage);
    };

    const failStage = async (stage: string, error: string) => {
      await DeploymentModel.finishStage(depId, stage, StageStatus.FAILED, undefined, error);
      await DeploymentModel.updateStatus(depId, DeploymentStatus.FAILED, stage, error);
      await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
      await log(`Stage FAILED: ${stage} — ${error}`, LogLevel.ERROR, stage);
    };

    try {
      // ── 1. ZIP_UPLOAD ────────────────────────────────────────
      await startStage(DeploymentStatus.ZIP_UPLOAD);

      if (!StorageManager.validateZip(tempZipPath)) {
        await failStage(DeploymentStatus.ZIP_UPLOAD, 'Invalid ZIP file (magic bytes check failed)');
        return;
      }

      const zipPath = StorageManager.stageUpload(projectId, tempZipPath);
      await log(`[UPLOAD] ZIP received and staged: ${zipPath}`, LogLevel.INFO, DeploymentStatus.ZIP_UPLOAD);
      await finishStage(DeploymentStatus.ZIP_UPLOAD, zipPath);

      // ── 2. EXTRACTION ────────────────────────────────────────
      await startStage(DeploymentStatus.EXTRACTION);
      let projectPath: string;
      try {
        await log('[EXTRACTION] Deteniendo la version anterior antes de reemplazar sus archivos.', LogLevel.INFO, DeploymentStatus.EXTRACTION);
        await ProcessManager.stop(projectId, true);
        StaticServer.stop(projectId);
        await ProjectModel.updateStatus(projectId, ProjectStatus.ANALYZING);
        const previous = await ProjectModel.findById(projectId);
        if (previous?.assigned_port) {
          await PortManager.releasePort(previous.assigned_port, projectId);
          await ProjectModel.update(projectId, { assignedPort: null, processPid: null });
        }
        projectPath = await StorageManager.extractZip(projectId, zipPath);
        await log(`[EXTRACTION] Extracted to: ${projectPath}`, LogLevel.INFO, DeploymentStatus.EXTRACTION);
        await finishStage(DeploymentStatus.EXTRACTION, projectPath);
      } catch (err: unknown) {
        await failStage(DeploymentStatus.EXTRACTION, (err as Error).message);
        return;
      }

      // Update project source path
      await ProjectModel.update(projectId, { sourcePath: projectPath });

      // ── 3. ANALYSIS ──────────────────────────────────────────
      await startStage(DeploymentStatus.ANALYSIS);
      let analysis: AnalysisResult;
      try {
        analysis = await ProjectAnalyzer.analyze(projectPath);
        if (analysis.projectRoot && analysis.projectRoot !== projectPath) {
          projectPath = analysis.projectRoot;
          await ProjectModel.update(projectId, { sourcePath: projectPath });
          logger.info(`[DeploymentService] Analyzer selected project root: ${projectPath}`);
        }
        if (!deployToVercel) {
          await RuntimePreflight.check(analysis, projectPath, message => log(message, LogLevel.INFO, DeploymentStatus.ANALYSIS));
        }
        await log(`[ANALYZER] Runtime: ${analysis.runtime}`, LogLevel.INFO, DeploymentStatus.ANALYSIS);
        await log(`[ANALYZER] Framework: ${analysis.framework}`, LogLevel.INFO, DeploymentStatus.ANALYSIS);
        await log(`[ANALYZER] Type: ${analysis.projectType}`, LogLevel.INFO, DeploymentStatus.ANALYSIS);
        if (analysis.warnings.length > 0) {
          for (const w of analysis.warnings) {
            await log(`[ANALYZER] Warning: ${w}`, LogLevel.WARN, DeploymentStatus.ANALYSIS);
          }
        }
        await ProjectModel.update(projectId, {
          runtime:     analysis.runtime,
          framework:   analysis.framework,
          projectType: analysis.projectType,
        });
        await finishStage(DeploymentStatus.ANALYSIS);
      } catch (err: unknown) {
        await failStage(DeploymentStatus.ANALYSIS, (err as Error).message);
        return;
      }

      // ── 4. DEPENDENCY_INSTALL ────────────────────────────────
      await ProjectModel.updateStatus(projectId, ProjectStatus.BUILDING);
      if (deployToVercel) {
        await skipStage(DeploymentStatus.DEPENDENCY_INSTALL, '[INSTALL] Vercel instalará las dependencias durante el build remoto.');
      } else if (analysis.projectType === ProjectType.STATIC_FRONTEND && !fs.existsSync(path.join(projectPath, 'package.json')) && !analysis.buildCommand) {
        await skipStage(DeploymentStatus.DEPENDENCY_INSTALL, '[INSTALL] Sitio HTML estático sin dependencias — no requiere instalación.');
      } else {
        await startStage(DeploymentStatus.DEPENDENCY_INSTALL);
        try {
          await DeploymentService._installDependencies(analysis, projectPath, depId, projectId);
          await finishStage(DeploymentStatus.DEPENDENCY_INSTALL);
        } catch (err: unknown) {
          await failStage(DeploymentStatus.DEPENDENCY_INSTALL, (err as Error).message);
          return;
        }
      }

      // ── 5. DATABASE_PROVISIONING ─────────────────────────────
      let dbEnvVars: Record<string, string> = {};
      if (deployToVercel) {
        await skipStage(
          DeploymentStatus.DATABASE_PROVISIONING,
          '[DB] No se aprovisiona una base local para Vercel; se enviarán las variables guardadas en el proyecto.',
        );
        const configuredEnv = await EnvVarModel.toRecord(projectId);
        if (analysis.needsDatabase && !configuredEnv.DATABASE_URL && !configuredEnv.DB_HOST) {
          await log('[DB] Configura la conexión externa del proyecto antes de usar la app desplegada.', LogLevel.WARN, DeploymentStatus.DATABASE_PROVISIONING);
        }
      } else if (analysis.needsDatabase && analysis.databaseType !== 'none') {
        await startStage(DeploymentStatus.DATABASE_PROVISIONING);
        try {
          dbEnvVars = await DatabaseManager.provision(projectId, analysis.databaseType, projectPath);
          await log(`[DB] Database provisioned: ${analysis.databaseType}`, LogLevel.INFO, DeploymentStatus.DATABASE_PROVISIONING);
          await EnvVarModel.upsertMany(projectId, dbEnvVars, ['DB_PASSWORD']);
          await finishStage(DeploymentStatus.DATABASE_PROVISIONING);
        } catch (err: unknown) {
          await failStage(DeploymentStatus.DATABASE_PROVISIONING, (err as Error).message);
          return;
        }
      } else {
        await skipStage(DeploymentStatus.DATABASE_PROVISIONING, '[DB] No database required — skipping');
      }

      // ── 6. BUILD ─────────────────────────────────────────────
      if (deployToVercel) {
        await skipStage(DeploymentStatus.BUILD, '[BUILD] Vercel ejecutará el build remoto.');
      } else if (analysis.buildCommand) {
        await startStage(DeploymentStatus.BUILD);
        try {
          await DeploymentService._runBuild(analysis, projectPath, depId, projectId);

          // For static frontends: verify dist/index.html was generated
          if (analysis.projectType === ProjectType.STATIC_FRONTEND) {
            if (!StorageManager.distExists(projectId, projectPath)) {
              await failStage(
                DeploymentStatus.BUILD,
                'Build completed but dist/index.html was NOT generated. Build may have failed silently.',
              );
              return;
            }
            await log('[BUILD] dist/index.html confirmed ✓', LogLevel.INFO, DeploymentStatus.BUILD);
          }
          await finishStage(DeploymentStatus.BUILD);
        } catch (err: unknown) {
          await failStage(DeploymentStatus.BUILD, (err as Error).message);
          return;
        }
      } else {
        await skipStage(DeploymentStatus.BUILD, '[BUILD] No build step required — skipping');
      }

      // ── MODIFICACIÓN PARA Vercel: Deploy a Vercel en lugar de usar puertos ─────
      if (deployToVercel) {
        await startStage(DeploymentStatus.PROCESS_START);
        try {
          const vercel = new VercelDeployer(config.VERCEL_TOKEN, config.VERCEL_TEAM_ID);
          const storedEnvVars = await EnvVarModel.toRecord(projectId);
          vercelUrl = await vercel.deployFromDirectory(
            `project-${projectId}`,
            projectPath,
            { ...storedEnvVars, ...dbEnvVars, NODE_ENV: 'production' },
            analysis,
            message => log(message, LogLevel.INFO, DeploymentStatus.PROCESS_START),
          );
          await log(`[VERCEL] Deployed to: ${vercelUrl}`, LogLevel.INFO, DeploymentStatus.PROCESS_START);
          await finishStage(DeploymentStatus.PROCESS_START, vercelUrl);
          
          // Update project with Vercel URL instead of port
          await ProjectModel.update(projectId, { assignedPort: null });
          await ProjectModel.update(projectId, { sourcePath: vercelUrl });
          
          await DeploymentModel.updateStatus(depId, DeploymentStatus.RUNNING);
          await ProjectModel.updateStatus(projectId, ProjectStatus.RUNNING);

          await StorageManager.deleteProject(projectId).catch(error => {
            logger.warn(`[DeploymentService] Could not clean temporary Vercel source for ${projectId}: ${(error as Error).message}`);
          });
          
          logger.info(`[DeploymentService] ✅ Deployment ${depId} RUNNING on Vercel: ${vercelUrl}`);
          return;
        } catch (err: unknown) {
          await failStage(DeploymentStatus.PROCESS_START, (err as Error).message);
          await StorageManager.deleteProject(projectId).catch(() => undefined);
          return;
        }
      }

      // ── ORIGINAL: PORT_ALLOCATION (para despliegue local con procesos) ───────
      await startStage(DeploymentStatus.PORT_ALLOCATION);
      try {
        allocatedPort = await PortManager.allocatePort(projectId);
        await log(`[PORT] Assigned port ${allocatedPort}`, LogLevel.INFO, DeploymentStatus.PORT_ALLOCATION);
        await ProjectModel.update(projectId, { assignedPort: allocatedPort });
        await finishStage(DeploymentStatus.PORT_ALLOCATION, String(allocatedPort));
      } catch (err: unknown) {
        await failStage(DeploymentStatus.PORT_ALLOCATION, (err as Error).message);
        return;
      }

      // ── 8. PROCESS_START ─────────────────────────────────────
      await startStage(DeploymentStatus.PROCESS_START);
      await ProjectModel.updateStatus(projectId, ProjectStatus.STARTING);

      // Build env vars for the process
      const processEnv: Record<string, string> = {
        ...await EnvVarModel.toRecord(projectId),
        PORT:     String(allocatedPort),
        NODE_ENV: 'production',
        ...dbEnvVars,
      };
      await EnvVarModel.upsert(projectId, 'PORT', String(allocatedPort));
      await EnvVarModel.upsert(projectId, 'NODE_ENV', 'production');

      try {
        const pid = await DeploymentService._startProcess(
          analysis,
          projectPath,
          projectId,
          allocatedPort,
          processEnv,
        );
        await log(`[PROCESS] Process started PID=${pid}`, LogLevel.INFO, DeploymentStatus.PROCESS_START);
        await finishStage(DeploymentStatus.PROCESS_START, String(pid));
      } catch (err: unknown) {
        await failStage(DeploymentStatus.PROCESS_START, (err as Error).message);
        // Release port
        await PortManager.releasePort(allocatedPort, projectId);
        allocatedPort = null;
        return;
      }

      // ── 9. HEALTH_CHECK ──────────────────────────────────────
      await startStage(DeploymentStatus.HEALTH_CHECK);
      const health = await HealthCheckService.waitForHealthy(allocatedPort!, undefined, undefined, () => {
        if (StaticServer.isRunning(projectId) || ProcessManager.isRunning(projectId)) return null;
        const output = ProcessManager.getRecentLogs(projectId, 12).join('\n');
        return `El proceso terminó antes de responder al health check.\n${output || 'Revisa los registros de ejecución.'}`;
      });

      if (!health.healthy) {
        const errMsg = health.error?.startsWith('El proceso terminó') ? health.error : `Health check failed after ${config.HEALTH_CHECK_RETRIES} retries. ` +
                       `Last error: ${health.error ?? `HTTP ${health.statusCode}`}`;
        await failStage(DeploymentStatus.HEALTH_CHECK, errMsg);
        // Stop the process and release port
        await ProcessManager.stop(projectId);
        await PortManager.releasePort(allocatedPort!, projectId);
        return;
      }

      await log(
        `[HEALTH] HTTP ${health.statusCode} in ${health.latencyMs}ms ✓`,
        LogLevel.INFO,
        DeploymentStatus.HEALTH_CHECK,
      );
      await finishStage(DeploymentStatus.HEALTH_CHECK);

      // ── 10. RUNNING ──────────────────────────────────────────
      await DeploymentModel.updateStatus(depId, DeploymentStatus.RUNNING);
      await ProjectModel.updateStatus(projectId, ProjectStatus.RUNNING);
      await log(
        `[DEPLOYMENT] RUNNING on http://localhost:${allocatedPort}`,
        LogLevel.INFO,
        DeploymentStatus.RUNNING,
      );

      logger.info(`[DeploymentService] ✅ Deployment ${depId} RUNNING on port ${allocatedPort}`);

      // Clean up upload staging
      StorageManager.cleanUpload(projectId);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[DeploymentService] Pipeline error: ${message}`);
      await DeploymentModel.updateStatus(depId, DeploymentStatus.FAILED, undefined, message);
      await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
      await log(`[DEPLOYMENT] FAILED: ${message}`, LogLevel.ERROR);

      // Release port if it was allocated
      if (allocatedPort !== null) {
        await PortManager.releasePort(allocatedPort, projectId).catch(() => undefined);
      }
    }
  }

  // ── Stage implementations ───────────────────────────────────────────────────

  private static async _installDependencies(
    analysis: AnalysisResult,
    projectPath: string,
    depId: string,
    projectId: string,
  ): Promise<void> {
    const log = (msg: string) =>
      LogService.info(depId, projectId, msg, DeploymentStatus.DEPENDENCY_INSTALL);

    switch (analysis.runtime) {
      case 'nodejs': {
        const lockFile = fs.existsSync(path.join(projectPath, 'package-lock.json'))
          ? 'package-lock.json'
          : fs.existsSync(path.join(projectPath, 'yarn.lock'))
          ? 'yarn.lock' : null;

        const cmd  = lockFile === 'yarn.lock' ? 'yarn' : 'npm';
        const args = lockFile === 'yarn.lock' ? ['install', '--frozen-lockfile'] :
                                                [lockFile ? 'ci' : 'install', '--prefer-offline', '--include=dev', '--include=optional'];

        await log(`[INSTALL] Running: ${cmd} ${args.join(' ')}`);
        try {
          await runCommand(cmd, args, projectPath, undefined, line => log(`[npm] ${line}`));
        } catch {
          // npm ci can fail if no package-lock — fall back to npm install
          await log('[INSTALL] npm ci failed, falling back to npm install');
          await runCommand('npm', ['install', '--include=dev', '--include=optional'], projectPath, undefined, line => log(`[npm] ${line}`));
        }

        // Also install frontend/ subdirectory if it exists (fullstack projects)
        const frontendDir = path.join(projectPath, 'frontend');
        if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
          await log('[INSTALL] Installing frontend/ dependencies');
          await runCommand('npm', ['install', '--include=dev', '--include=optional'], frontendDir, undefined, line => log(`[npm/frontend] ${line}`));
        }
        break;
      }

      case 'python': {
        // Install from root requirements.txt OR backend/requirements.txt
        const rootReqs    = fs.existsSync(path.join(projectPath, 'requirements.txt'));
        const backendReqs = fs.existsSync(path.join(projectPath, 'backend', 'requirements.txt'));
        const pythonCmd   = process.platform === 'win32' ? 'python.exe' : 'python';

        if (rootReqs) {
          await log('[INSTALL] Running: python -m pip install -r requirements.txt');
          await runCommand(pythonCmd, ['-m', 'pip', 'install', '-r', 'requirements.txt'], projectPath, undefined, line => log(`[pip] ${line}`));
        }
        if (backendReqs && !rootReqs) {
          await log('[INSTALL] Running: python -m pip install -r backend/requirements.txt');
          await runCommand(pythonCmd, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt'], projectPath, undefined, line => log(`[pip] ${line}`));
        }
        if (!rootReqs && !backendReqs && fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
          await log('[INSTALL] Installing Python project from pyproject.toml');
          await runCommand(pythonCmd, ['-m', 'pip', 'install', '.'], projectPath, undefined, line => log(`[pip] ${line}`));
        } else if (!rootReqs && !backendReqs) {
          await log('[INSTALL] No requirements.txt found — skipping pip install');
        }

        // Also install frontend/ subdirectory if it exists (fullstack projects)
        const frontendDir = path.join(projectPath, 'frontend');
        if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
          await log('[INSTALL] Installing frontend/ dependencies');
          await runCommand('npm', ['install', '--include=dev', '--include=optional'], frontendDir, undefined, line => log(`[npm/frontend] ${line}`));
        }
        break;
      }

      case 'java': {
        const hasMaven = fs.existsSync(path.join(projectPath, 'pom.xml'));
        if (hasMaven) {
          await log('[INSTALL] Running: mvn dependency:resolve');
          await runCommand(
            'mvn', ['dependency:resolve', '-q'],
            projectPath, undefined,
            line => log(`[mvn] ${line}`),
          );
        }
        break;
      }

      case 'php': {
        const hasComposer = fs.existsSync(path.join(projectPath, 'composer.json'));
        if (hasComposer) {
          await log('[INSTALL] Running: composer install');
          await runCommand(
            'composer', ['install', '--no-interaction'],
            projectPath, undefined,
            line => log(`[composer] ${line}`),
          );
        }
        break;
      }
    }
  }

  private static async _runBuild(
    analysis: AnalysisResult,
    projectPath: string,
    depId: string,
    projectId: string,
  ): Promise<void> {
    const log = (msg: string) =>
      LogService.info(depId, projectId, msg, DeploymentStatus.BUILD);

    if (!analysis.buildCommand) return;

    await log(`[BUILD] Running: ${analysis.buildCommand}`);

    // Parse build command safely
    // Handle "npm --prefix frontend run build" style commands with flags
    const parts = analysis.buildCommand.split(' ');
    const cmd   = parts[0];
    const args  = parts.slice(1);

    await runCommand(cmd, args, projectPath, undefined, line => log(`[build] ${line}`));
    await log('[BUILD] Build command completed');
  }

  private static async _startProcess(
    analysis: AnalysisResult,
    projectPath: string,
    projectId: string,
    port: number,
    envVars: Record<string, string>,
  ): Promise<number> {
    // Static frontend: use our internal static server
    if (
      analysis.projectType === ProjectType.STATIC_FRONTEND ||
      analysis.startCommand === '__STATIC_SERVER__'
    ) {
      const distPath = StorageManager.getDistPath(projectId, projectPath);
      const pid = await StaticServer.start({ projectId, distPath, port });
      return process.pid; // static server runs in-process
    }

    // Dynamic process: resolve {{PORT}} in args
    const resolvedArgs = ProjectAnalyzer.resolvePort(analysis.startArgs, port);
    let command = analysis.startCommand;
    let args = resolvedArgs;
    if (analysis.runtime === 'nodejs') {
      const runtime = await NodeRuntimeManager.resolve(projectPath);
      envVars = { ...envVars, ...runtime.env };
      if (command === 'node') command = runtime.nodePath;
      else if (command === 'npm' || command === 'npx') {
        const cli = path.join(path.dirname(runtime.nodePath), 'node_modules/npm/bin', command === 'npm' ? 'npm-cli.js' : 'npx-cli.js');
        args = [cli, ...args];
        command = runtime.nodePath;
      }
    }

    return ProcessManager.start({
      projectId,
      command,
      args,
      workingDir: analysis.startWorkingDir ?? projectPath,
      port,
      envVars,
    });
  }

  // ── Lifecycle operations ────────────────────────────────────────────────────

  static async stopProject(projectId: string): Promise<void> {
    // Stop dynamic process
    await ProcessManager.stop(projectId);
    // Stop static server
    StaticServer.stop(projectId);

    const project = await ProjectModel.findById(projectId);
    if (project?.assigned_port) {
      // Do NOT release port on stop — it stays reserved so restart works
    }
    await ProjectModel.updateStatus(projectId, ProjectStatus.STOPPED);
    await ProjectModel.update(projectId, { processPid: null });
  }

  static async startProject(projectId: string): Promise<void> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new Error('Project not found');
    if (!project.source_path) throw new Error('Project has no source path — re-deploy first');
    if (!project.assigned_port) throw new Error('Project has no assigned port — re-deploy first');

    await ProjectModel.updateStatus(projectId, ProjectStatus.STARTING);

    // Re-analyze to get start command
    let analysis = await ProjectAnalyzer.analyze(project.source_path);
    // Restart the previously deployed artifact, not an optional backend found
    // elsewhere in the source tree of a site deployed as a static frontend.
    if (project.project_type === ProjectType.STATIC_FRONTEND && fs.existsSync(path.join(StorageManager.getDistPath(projectId, project.source_path), 'index.html'))) {
      analysis = { ...analysis, projectType: ProjectType.STATIC_FRONTEND, startCommand: '__STATIC_SERVER__', startArgs: [], startWorkingDir: undefined, buildCommand: null };
    }
    const envVars = await EnvVarModel.toRecord(projectId);

    try {
      await DeploymentService._startProcess(
        analysis,
        project.source_path,
        projectId,
        project.assigned_port,
        envVars,
      );

      // Wait for health
      const health = await HealthCheckService.waitForHealthy(project.assigned_port);
      if (!health.healthy) {
        await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
        throw new Error(`Health check failed after start: ${health.error}`);
      }

      await ProjectModel.updateStatus(projectId, ProjectStatus.RUNNING);
    } catch (err) {
      await ProjectModel.updateStatus(projectId, ProjectStatus.FAILED);
      throw err;
    }
  }

  static async restartProject(projectId: string): Promise<void> {
    await DeploymentService.stopProject(projectId);
    await new Promise(r => setTimeout(r, 1500));
    await DeploymentService.startProject(projectId);
  }

  static async deleteProject(projectId: string): Promise<void> {
    const project = await ProjectModel.findById(projectId);
    if (config.VERCEL_ENABLED === 'true' && config.VERCEL_TOKEN && /^https:\/\//i.test(project?.source_path ?? '')) {
      const vercel = new VercelDeployer(config.VERCEL_TOKEN, config.VERCEL_TEAM_ID);
      await vercel.deleteProject(`project-${projectId}`);
    }

    await ProjectModel.updateStatus(projectId, ProjectStatus.DELETING);

    // Stop processes
    await ProcessManager.stop(projectId, true);
    StaticServer.stop(projectId);

    // Release port
    if (project?.assigned_port) {
      await PortManager.releasePort(project.assigned_port, projectId);
    }

    // Destroy database
    await DatabaseManager.destroy(projectId);

    // Delete files
    await StorageManager.deleteProject(projectId);

    // Delete DB record (cascades to all related tables)
    await ProjectModel.delete(projectId);

    logger.info(`[DeploymentService] Project ${projectId} deleted`);
  }
}
