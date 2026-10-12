import { query } from '../config/database';
import {
  DeploymentRow, DeploymentStatus,
  DeploymentStageRow, StageStatus,
  DeploymentLogRow, LogLevel,
} from '../types';

export class DeploymentModel {
  // ── Deployments ──────────────────────────────────────────────

  static async create(projectId: string, userId: string): Promise<DeploymentRow> {
    // Determine next version number for this project
    const versionRes = await query<{ max: string }>(
      'SELECT COALESCE(MAX(version), 0) as max FROM deployments WHERE project_id = $1',
      [projectId]
    );
    const nextVersion = parseInt(versionRes.rows[0].max) + 1;

    const res = await query<DeploymentRow>(
      `INSERT INTO deployments (project_id, user_id, version, status, started_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [projectId, userId, nextVersion, DeploymentStatus.PENDING]
    );
    return res.rows[0];
  }

  static async findById(id: string): Promise<DeploymentRow | null> {
    const res = await query<DeploymentRow>(
      'SELECT * FROM deployments WHERE id = $1',
      [id]
    );
    return res.rows[0] ?? null;
  }

  static async findByProject(projectId: string): Promise<DeploymentRow[]> {
    const res = await query<DeploymentRow>(
      'SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    return res.rows;
  }

  static async findLatestByProject(projectId: string): Promise<DeploymentRow | null> {
    const res = await query<DeploymentRow>(
      'SELECT * FROM deployments WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
      [projectId]
    );
    return res.rows[0] ?? null;
  }

  static async updateStatus(
    id: string,
    status: DeploymentStatus,
    stage?: string,
    error?: string
  ): Promise<void> {
    const isTerminal = status === DeploymentStatus.RUNNING || status === DeploymentStatus.FAILED;
    await query(
      `UPDATE deployments
       SET status = $1,
           current_stage = COALESCE($2, current_stage),
           error_message = COALESCE($3, error_message),
           finished_at = CASE WHEN $4 THEN NOW() ELSE finished_at END,
           updated_at = NOW()
       WHERE id = $5`,
      [status, stage ?? null, error ?? null, isTerminal, id]
    );
  }

  // ── Stages ────────────────────────────────────────────────────

  static async createStage(deploymentId: string, stage: string): Promise<DeploymentStageRow> {
    const res = await query<DeploymentStageRow>(
      `INSERT INTO deployment_stages (deployment_id, stage, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [deploymentId, stage, StageStatus.PENDING]
    );
    return res.rows[0];
  }

  static async startStage(deploymentId: string, stage: string): Promise<void> {
    await query(
      `UPDATE deployment_stages
       SET status = $1, started_at = NOW()
       WHERE deployment_id = $2 AND stage = $3`,
      [StageStatus.RUNNING, deploymentId, stage]
    );
  }

  static async finishStage(
    deploymentId: string,
    stage: string,
    status: StageStatus,
    logs?: string,
    error?: string
  ): Promise<void> {
    await query(
      `UPDATE deployment_stages
       SET status = $1,
           logs = COALESCE($2, logs),
           error = COALESCE($3, error),
           finished_at = NOW()
       WHERE deployment_id = $4 AND stage = $5`,
      [status, logs ?? null, error ?? null, deploymentId, stage]
    );
  }

  static async getStages(deploymentId: string): Promise<DeploymentStageRow[]> {
    const res = await query<DeploymentStageRow>(
      'SELECT * FROM deployment_stages WHERE deployment_id = $1 ORDER BY created_at',
      [deploymentId]
    );
    return res.rows;
  }

  // ── Logs ──────────────────────────────────────────────────────

  static async addLog(
    deploymentId: string,
    projectId: string,
    message: string,
    level: LogLevel = LogLevel.INFO,
    stage?: string
  ): Promise<void> {
    await query(
      `INSERT INTO deployment_logs (deployment_id, project_id, level, stage, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [deploymentId, projectId, level, stage ?? null, message]
    );
  }

  static async getLogs(
    deploymentId: string,
    limit = 500,
    offset = 0
  ): Promise<DeploymentLogRow[]> {
    const res = await query<DeploymentLogRow>(
      `SELECT * FROM deployment_logs
       WHERE deployment_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [deploymentId, limit, offset]
    );
    return res.rows;
  }

  static async getProjectLogs(
    projectId: string,
    limit = 200
  ): Promise<DeploymentLogRow[]> {
    const res = await query<DeploymentLogRow>(
      `SELECT * FROM deployment_logs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit]
    );
    return res.rows.reverse();
  }
}
