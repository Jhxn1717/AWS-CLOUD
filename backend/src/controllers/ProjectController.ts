import { Request, Response } from 'express';
import { ProjectModel } from '../models/ProjectModel';
import { DeploymentModel } from '../models/DeploymentModel';
import { EnvVarModel } from '../models/EnvVarModel';
import { DatabaseCredentialModel } from '../models/DatabaseCredentialModel';
import { PortManager } from '../services/PortManager';
import { ProcessManager } from '../services/ProcessManager';
import { StaticServer } from '../services/StaticServer';
import { ValidationError, NotFoundError } from '../utils/errors';
import { uniqueSlug } from '../utils/slugify';
import { query } from '../config/database';

export class ProjectController {
  // ── List ──────────────────────────────────────────────────────────────────

  static async list(req: Request, res: Response): Promise<void> {
    const projects = req.user?.role === 'admin'
      ? await ProjectModel.findAll()
      : await ProjectModel.findAllByUser(req.user!.id);

    // Attach latest deployment to each project
    const projectsWithDeploy = await Promise.all(
      projects.map(async (p) => ({
        ...p,
        last_deployment: await DeploymentModel.findLatestByProject(p.id),
      }))
    );

    res.json({ success: true, data: projectsWithDeploy });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  static async create(req: Request, res: Response): Promise<void> {
    const { name, description } = req.body as { name?: string; description?: string };

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Project name must be at least 2 characters');
    }
    if (name.trim().length > 100) {
      throw new ValidationError('Project name must be 100 characters or less');
    }

    const slug = uniqueSlug(name.trim());

    const project = await ProjectModel.create({
      userId:      req.user!.id,
      name:        name.trim(),
      slug,
      description: description?.trim(),
    });

    res.status(201).json({ success: true, data: project });
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  static async get(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const lastDeployment = await DeploymentModel.findLatestByProject(project.id);
    const envVars        = await EnvVarModel.findByProject(project.id);
    const dbCreds        = await DatabaseCredentialModel.findByProject(project.id);

    // Running process info
    const isRunning  = ProcessManager.isRunning(project.id) || StaticServer.isRunning(project.id);
    const recentLogs = ProcessManager.getRecentLogs(project.id, 50);

    res.json({
      success: true,
      data: {
        ...project,
        last_deployment: lastDeployment,
        env_vars:        envVars.filter(v => !v.is_secret),
        is_running:      isRunning,
        recent_logs:     recentLogs,
        url: project.assigned_port
          ? `http://localhost:${project.assigned_port}`
          : /^https?:\/\//i.test(project.source_path ?? '') ? project.source_path : null,
        database: dbCreds ? {
          type:     dbCreds.db_type,
          host:     dbCreds.db_host,
          port:     dbCreds.db_port,
          name:     dbCreds.db_name,
          user:     dbCreds.db_user,
          // never expose password in API response
          is_active: dbCreds.is_active,
        } : null,
      },
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  static async update(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const { description } = req.body as { description?: string };
    // Only description is user-editable after creation
    await query(
      'UPDATE projects SET description = $1, updated_at = NOW() WHERE id = $2',
      [description ?? project.description, project.id]
    );

    const updated = await ProjectModel.findById(project.id);
    res.json({ success: true, data: updated });
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────

  static async stats(_req: Request, res: Response): Promise<void> {
    const statusCounts = await ProjectModel.countByStatus();
    const portStats    = await PortManager.getStats();
    const runningProcs = ProcessManager.getRunningProcesses();

    res.json({
      success: true,
      data: {
        projects: statusCounts,
        ports:    portStats,
        running_processes: runningProcs.length,
      },
    });
  }
}
