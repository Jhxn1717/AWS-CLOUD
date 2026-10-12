import { query } from '../config/database';
import { DatabaseCredentialRow, DatabaseType } from '../types';

export class DatabaseCredentialModel {
  static async create(input: {
    projectId: string;
    dbType:    DatabaseType;
    dbHost:    string;
    dbPort:    number;
    dbName:    string;
    dbUser:    string;
    dbPassword: string;
  }): Promise<DatabaseCredentialRow> {
    const res = await query<DatabaseCredentialRow>(
      `INSERT INTO database_credentials
         (project_id, db_type, db_host, db_port, db_name, db_user, db_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.projectId,
        input.dbType,
        input.dbHost,
        input.dbPort,
        input.dbName,
        input.dbUser,
        input.dbPassword,
      ]
    );
    return res.rows[0];
  }

  static async findByProject(projectId: string): Promise<DatabaseCredentialRow | null> {
    const res = await query<DatabaseCredentialRow>(
      'SELECT * FROM database_credentials WHERE project_id = $1 AND is_active = true',
      [projectId]
    );
    return res.rows[0] ?? null;
  }

  static async deactivate(projectId: string): Promise<void> {
    await query(
      'UPDATE database_credentials SET is_active = false WHERE project_id = $1',
      [projectId]
    );
  }
}
