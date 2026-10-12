import { query, withTransaction } from '../config/database';
import { ProjectRow, ProjectStatus, Runtime, Framework, ProjectType } from '../types';
import { PoolClient } from 'pg';

export interface CreateProjectInput {
  userId:      string;
  name:        string;
  slug:        string;
  description?: string;
}

export interface UpdateProjectInput {
  status?:          ProjectStatus;
  runtime?:         Runtime;
  runtimeVersion?:  string;
  framework?:       Framework;
  projectType?:     ProjectType;
  sourcePath?:      string;
  assignedPort?:    number | null;
  processPid?:      number | null;
}

export class ProjectModel {
  static async create(input: CreateProjectInput): Promise<ProjectRow> {
    const res = await query<ProjectRow>(
      `INSERT INTO projects (user_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.userId, input.name, input.slug, input.description ?? null]
    );
    return res.rows[0];
  }

  static async findById(id: string): Promise<ProjectRow | null> {
    const res = await query<ProjectRow>(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    return res.rows[0] ?? null;
  }

  static async findBySlug(slug: string): Promise<ProjectRow | null> {
    const res = await query<ProjectRow>(
      'SELECT * FROM projects WHERE slug = $1',
      [slug]
    );
    return res.rows[0] ?? null;
  }

  static async findAllByUser(userId: string): Promise<ProjectRow[]> {
    const res = await query<ProjectRow>(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.rows;
  }

  static async findAll(): Promise<ProjectRow[]> {
    const res = await query<ProjectRow>(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );
    return res.rows;
  }

  static async update(id: string, input: UpdateProjectInput): Promise<ProjectRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.status !== undefined)         { fields.push(`status = $${idx++}`);          values.push(input.status); }
    if (input.runtime !== undefined)        { fields.push(`runtime = $${idx++}`);         values.push(input.runtime); }
    if (input.runtimeVersion !== undefined) { fields.push(`runtime_version = $${idx++}`); values.push(input.runtimeVersion); }
    if (input.framework !== undefined)      { fields.push(`framework = $${idx++}`);       values.push(input.framework); }
    if (input.projectType !== undefined)    { fields.push(`project_type = $${idx++}`);    values.push(input.projectType); }
    if (input.sourcePath !== undefined)     { fields.push(`source_path = $${idx++}`);     values.push(input.sourcePath); }
    if (input.assignedPort !== undefined)   { fields.push(`assigned_port = $${idx++}`);   values.push(input.assignedPort); }
    if (input.processPid !== undefined)     { fields.push(`process_pid = $${idx++}`);     values.push(input.processPid); }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await query<ProjectRow>(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  static async updateStatus(id: string, status: ProjectStatus): Promise<void> {
    await query(
      'UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }

  static async delete(id: string): Promise<void> {
    await query('DELETE FROM projects WHERE id = $1', [id]);
  }

  static async countByStatus(): Promise<Record<string, number>> {
    const res = await query<{ status: string; count: string }>(
      'SELECT status, COUNT(*) as count FROM projects GROUP BY status'
    );
    const counts: Record<string, number> = {};
    for (const row of res.rows) {
      counts[row.status] = parseInt(row.count);
    }
    return counts;
  }
}
