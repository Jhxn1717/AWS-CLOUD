import { Request, Response } from 'express';
import { ProjectModel }     from '../models/ProjectModel';
import { DeploymentModel }  from '../models/DeploymentModel';
import { DeploymentService } from '../services/DeploymentService';
import { NotFoundError, ValidationError } from '../utils/errors';
import { ProjectStatus } from '../types';
import { logEvents } from '../services/LogService';

export class DeploymentController {
  // ── Upload & deploy ────────────────────────────────────────────────────────

  static async upload(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    if (!req.file) {
      throw new ValidationError('No file uploaded. Send a ZIP file as multipart/form-data field "file".');
    }

    // Reject if a deployment is already in progress
    const blockedStatuses: ProjectStatus[] = [
      ProjectStatus.ANALYZING,
      ProjectStatus.BUILDING,
      ProjectStatus.STARTING,
      ProjectStatus.DELETING,
    ];
    if (blockedStatuses.includes(project.status as ProjectStatus)) {
      throw new ValidationError(
        `Cannot deploy: project is currently in state "${project.status}". Wait for it to finish.`,
      );
    }

    const deploymentId = await DeploymentService.deploy(
      project.id,
      req.user!.id,
      req.file.path,
    );

    res.status(202).json({
      success: true,
      data: {
        deploymentId,
        message: 'Deployment pipeline started. Poll /api/deployments/:id for status.',
      },
    });
  }

  static async deployFromGithub(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const repoUrl = typeof req.body?.repoUrl === 'string' ? req.body.repoUrl.trim() : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : 'main';

    if (!repoUrl) {
      throw new ValidationError('GitHub repository URL is required. Example: https://github.com/owner/repo');
    }

    const blockedStatuses: ProjectStatus[] = [
      ProjectStatus.ANALYZING,
      ProjectStatus.BUILDING,
      ProjectStatus.STARTING,
      ProjectStatus.DELETING,
    ];
    if (blockedStatuses.includes(project.status as ProjectStatus)) {
      throw new ValidationError(
        `Cannot deploy: project is currently in state "${project.status}". Wait for it to finish.`,
      );
    }

    const deploymentId = await DeploymentService.deployFromGithub(
      project.id,
      req.user!.id,
      repoUrl,
      branch || 'main',
    );

    res.status(202).json({
      success: true,
      data: {
        deploymentId,
        message: 'GitHub deployment pipeline started. Poll /api/deployments/:id for status.',
      },
    });
  }

  // ── List deployments for a project ────────────────────────────────────────

  static async list(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const deployments = await DeploymentModel.findByProject(project.id);
    res.json({ success: true, data: deployments });
  }

  // ── Get a single deployment ────────────────────────────────────────────────

  static async get(req: Request, res: Response): Promise<void> {
    const deployment = await DeploymentModel.findById(req.params.depId);
    if (!deployment) throw new NotFoundError('Deployment');
    if (deployment.project_id !== req.params.id) throw new NotFoundError('Deployment');

    const stages = await DeploymentModel.getStages(deployment.id);
    const logs   = await DeploymentModel.getLogs(deployment.id, 500);

    res.json({
      success: true,
      data: { ...deployment, stages, logs },
    });
  }

  // ── Get deployment logs ────────────────────────────────────────────────────

  static async logs(req: Request, res: Response): Promise<void> {
    const deployment = await DeploymentModel.findById(req.params.depId);
    if (!deployment) throw new NotFoundError('Deployment');
    if (deployment.project_id !== req.params.id) throw new NotFoundError('Deployment');

    const limit  = Math.min(parseInt(req.query.limit as string ?? '500'), 2000);
    const offset = parseInt(req.query.offset as string ?? '0');
    const logs   = await DeploymentModel.getLogs(deployment.id, limit, offset);

    res.json({ success: true, data: logs });
  }

  // ── SSE: real-time log streaming ───────────────────────────────────────────

  static async streamLogs(req: Request, res: Response): Promise<void> {
    const deployment = await DeploymentModel.findById(req.params.depId);
    if (!deployment) throw new NotFoundError('Deployment');
    if (deployment.project_id !== req.params.id) throw new NotFoundError('Deployment');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send existing logs first
    const existing = await DeploymentModel.getLogs(deployment.id, 500);
    for (const log of existing) {
      send(log);
    }

    // Subscribe to new logs
    const handler = (event: unknown) => send(event);
    logEvents.on(`deployment:${deployment.id}`, handler);

    // Keep-alive ping every 15s
    const ping = setInterval(() => res.write(':ping\n\n'), 15000);

    req.on('close', () => {
      clearInterval(ping);
      logEvents.off(`deployment:${deployment.id}`, handler);
    });
  }

  // ── SSE: project-level log streaming ──────────────────────────────────────

  static async streamProjectLogs(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send recent logs
    const recent = await DeploymentModel.getProjectLogs(project.id, 100);
    for (const log of recent) send(log);

    const handler = (event: unknown) => send(event);
    logEvents.on(`project:${project.id}`, handler);

    const ping = setInterval(() => res.write(':ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      logEvents.off(`project:${project.id}`, handler);
    });
  }
}
