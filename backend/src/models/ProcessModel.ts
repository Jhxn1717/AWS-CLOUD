import { query } from '../config/database';
import { ProcessRow, ProcessStatus } from '../types';

export class ProcessModel {
  static async create(input: {
    projectId:  string;
    command:    string;
    args:       string[];
    workingDir: string;
    envVars:    Record<string, string>;
  }): Promise<ProcessRow> {
    const res = await query<ProcessRow>(
      `INSERT INTO processes (project_id, command, args, working_dir, env_vars, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.projectId,
        input.command,
        JSON.stringify(input.args),
        input.workingDir,
        JSON.stringify(input.envVars),
        ProcessStatus.STARTING,
      ]
    );
    return res.rows[0];
  }

  static async updatePid(id: string, pid: number): Promise<void> {
    await query(
      `UPDATE processes SET pid = $1, status = $2, started_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [pid, ProcessStatus.RUNNING, id]
    );
  }

  static async updateStatus(
    id: string,
    status: ProcessStatus,
    exitCode?: number | null,
    exitSignal?: string | null
  ): Promise<void> {
    await query(
      `UPDATE processes
       SET status = $1,
           exit_code = COALESCE($2, exit_code),
           exit_signal = COALESCE($3, exit_signal),
           stopped_at = CASE WHEN $4 THEN NOW() ELSE stopped_at END,
           updated_at = NOW()
       WHERE id = $5`,
      [
        status,
        exitCode ?? null,
        exitSignal ?? null,
        [ProcessStatus.STOPPED, ProcessStatus.CRASHED, ProcessStatus.KILLED].includes(status),
        id,
      ]
    );
  }

  static async findByProject(projectId: string): Promise<ProcessRow | null> {
    const res = await query<ProcessRow>(
      `SELECT * FROM processes WHERE project_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    return res.rows[0] ?? null;
  }

  static async findAllRunning(): Promise<ProcessRow[]> {
    const res = await query<ProcessRow>(
      `SELECT * FROM processes WHERE status IN ('STARTING', 'RUNNING')`
    );
    return res.rows;
  }
}
