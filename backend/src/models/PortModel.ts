import { query, withTransaction } from '../config/database';
import { PortRow } from '../types';
import { PoolClient } from 'pg';

export class PortModel {
  /**
   * Returns the first available port (is_active=false, project_id IS NULL),
   * locking the row to prevent race conditions.
   */
  static async findAvailable(client: PoolClient): Promise<PortRow | null> {
    const res = await client.query<PortRow>(
      `SELECT * FROM ports
       WHERE is_active = false AND project_id IS NULL
       ORDER BY port_number ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    return res.rows[0] ?? null;
  }

  static async allocate(
    client: PoolClient,
    portNumber: number,
    projectId: string
  ): Promise<PortRow> {
    const res = await client.query<PortRow>(
      `UPDATE ports
       SET is_active = true,
           project_id = $1,
           allocated_at = NOW(),
           released_at = NULL
       WHERE port_number = $2
       RETURNING *`,
      [projectId, portNumber]
    );
    return res.rows[0];
  }

  static async release(portNumber: number): Promise<void> {
    await query(
      `UPDATE ports
       SET is_active = false,
           project_id = NULL,
           released_at = NOW()
       WHERE port_number = $1`,
      [portNumber]
    );
  }

  static async findByProject(projectId: string): Promise<PortRow | null> {
    const res = await query<PortRow>(
      'SELECT * FROM ports WHERE project_id = $1 AND is_active = true',
      [projectId]
    );
    return res.rows[0] ?? null;
  }

  static async stats(): Promise<{ total: number; used: number; available: number }> {
    const res = await query<{ total: string; used: string }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as used
       FROM ports`
    );
    const total = parseInt(res.rows[0].total);
    const used = parseInt(res.rows[0].used ?? '0');
    return { total, used, available: total - used };
  }
}
