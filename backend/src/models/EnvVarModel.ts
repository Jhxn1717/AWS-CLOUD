import { query } from '../config/database';
import { EnvVarRow } from '../types';

export class EnvVarModel {
  static async upsert(
    projectId: string,
    key: string,
    value: string,
    isSecret = false
  ): Promise<EnvVarRow> {
    const res = await query<EnvVarRow>(
      `INSERT INTO environment_variables (project_id, key, value, is_secret)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, key)
       DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_at = NOW()
       RETURNING *`,
      [projectId, key, value, isSecret]
    );
    return res.rows[0];
  }

  static async upsertMany(
    projectId: string,
    vars: Record<string, string>,
    secrets: string[] = []
  ): Promise<void> {
    for (const [key, value] of Object.entries(vars)) {
      await this.upsert(projectId, key, value, secrets.includes(key));
    }
  }

  static async findByProject(projectId: string): Promise<EnvVarRow[]> {
    const res = await query<EnvVarRow>(
      'SELECT * FROM environment_variables WHERE project_id = $1 ORDER BY key',
      [projectId]
    );
    return res.rows;
  }

  static async toRecord(projectId: string): Promise<Record<string, string>> {
    const rows = await this.findByProject(projectId);
    const record: Record<string, string> = {};
    for (const row of rows) {
      record[row.key] = row.value;
    }
    return record;
  }

  static async deleteByProject(projectId: string): Promise<void> {
    await query('DELETE FROM environment_variables WHERE project_id = $1', [projectId]);
  }
}
