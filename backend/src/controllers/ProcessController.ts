import { Request, Response } from 'express';
import { ProjectModel }      from '../models/ProjectModel';
import { DeploymentService } from '../services/DeploymentService';
import { ProcessManager }    from '../services/ProcessManager';
import { StaticServer }      from '../services/StaticServer';
import { NotFoundError, ValidationError } from '../utils/errors';
import { ProjectStatus } from '../types';

export class ProcessController {
  // ── Start ─────────────────────────────────────────────────────────────────

  static async start(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    if (project.status === ProjectStatus.RUNNING) {
      throw new ValidationError('Project is already running');
    }
    if (!project.source_path) {
      throw new ValidationError('No source code found. Deploy the project first.');
    }

    await DeploymentService.startProject(project.id);

    const updated = await ProjectModel.findById(project.id);
    res.json({
      success: true,
      data: updated,
      message: `Project started on port ${updated?.assigned_port}`,
    });
  }

  // ── Stop ──────────────────────────────────────────────────────────────────

  static async stop(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    if (project.status === ProjectStatus.STOPPED) {
      throw new ValidationError('Project is already stopped');
    }

    await DeploymentService.stopProject(project.id);

    res.json({ success: true, message: 'Project stopped' });
  }

  // ── Restart ───────────────────────────────────────────────────────────────

  static async restart(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    if (!project.source_path) {
      throw new ValidationError('No source code found. Deploy the project first.');
    }

    await DeploymentService.restartProject(project.id);

    const updated = await ProjectModel.findById(project.id);
    res.json({
      success: true,
      data: updated,
      message: `Project restarted on port ${updated?.assigned_port}`,
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  static async deleteProject(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    await DeploymentService.deleteProject(project.id);

    res.json({ success: true, message: 'Project deleted and resources released' });
  }

  // ── Logs (live process output) ────────────────────────────────────────────

  static async processLogs(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const lines = parseInt(req.query.lines as string ?? '100');
    const logs = ProcessManager.getRecentLogs(project.id, Math.min(lines, 500));

    res.json({ success: true, data: logs });
  }

  // ── Status ────────────────────────────────────────────────────────────────

  static async status(req: Request, res: Response): Promise<void> {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');

    const isProcessRunning = ProcessManager.isRunning(project.id);
    const isStaticRunning  = StaticServer.isRunning(project.id);

    res.json({
      success: true,
      data: {
        projectId:      project.id,
        status:         project.status,
        pid:            project.process_pid,
        port:           project.assigned_port,
        url:            project.assigned_port ? `http://localhost:${project.assigned_port}` : null,
        process_alive:  isProcessRunning || isStaticRunning,
      },
    });
  }
}
