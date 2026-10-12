/**
 * DatabaseManager.ts
 * Provisions isolated databases for projects that genuinely need them.
 * Only creates a database when schema evidence exists (schema.sql, migrations/, etc.).
 *
 * Supports: PostgreSQL, SQLite (file-based, no provisioning needed).
 * MySQL support requires local MySQL installation.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseType } from '../types';
import { DatabaseCredentialModel } from '../models/DatabaseCredentialModel';
import { config } from '../config/env';
import logger from '../utils/logger';

function generateDbName(projectId: string): string {
  // e.g. mc_a1b2c3d4
  return `mc_${projectId.replace(/-/g, '').substring(0, 8)}`;
}

function generateDbUser(projectId: string): string {
  return `mc_user_${projectId.replace(/-/g, '').substring(0, 8)}`;
}

function generatePassword(): string {
  return crypto.randomBytes(16).toString('hex');
}

export class DatabaseManager {
  /**
   * Provision a new isolated database for a project.
   * Returns the credentials to inject into the project's environment.
   */
  static async provision(
    projectId: string,
    dbType: DatabaseType,
    projectPath: string,
  ): Promise<Record<string, string>> {
    switch (dbType) {
      case DatabaseType.POSTGRESQL:
        return DatabaseManager.provisionPostgres(projectId, projectPath);
      case DatabaseType.SQLITE:
        return DatabaseManager.provisionSqlite(projectId, projectPath);
      case DatabaseType.MYSQL:
        return DatabaseManager.provisionMysql(projectId, projectPath);
      case DatabaseType.NONE:
        return {};
      default:
        logger.warn(`[DatabaseManager] Unknown DB type: ${dbType}. Skipping.`);
        return {};
    }
  }

  // ── PostgreSQL ─────────────────────────────────────────────────────────────

  private static async provisionPostgres(
    projectId: string,
    projectPath: string,
  ): Promise<Record<string, string>> {
    const dbName   = generateDbName(projectId);
    const dbUser   = generateDbUser(projectId);
    const dbPass   = generatePassword();
    const dbPort   = config.DB_PORT;
    const dbHost   = config.DB_HOST;

    logger.info(`[DatabaseManager] Provisioning PostgreSQL DB: ${dbName}`);

    const adminClient = new Client({
      host:     dbHost,
      port:     dbPort,
      database: 'postgres',
      user:     config.DB_USER,
      password: config.DB_PASSWORD,
    });

    try {
      await adminClient.connect();

      // Create user if not exists
      const userExists = await adminClient.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`, [dbUser]
      );
      if (!userExists.rows.length) {
        // Safe: dbUser is generated, not user input
        await adminClient.query(
          `CREATE USER "${dbUser}" WITH PASSWORD '${dbPass}'`
        );
        logger.info(`[DatabaseManager] Created DB user: ${dbUser}`);
      }

      // Create database
      const dbExists = await adminClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
      );
      if (!dbExists.rows.length) {
        await adminClient.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
        logger.info(`[DatabaseManager] Created database: ${dbName}`);
      }

      await adminClient.query(
        `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`
      );
    } finally {
      await adminClient.end();
    }

    // Run schema import if available
    await DatabaseManager.importSchema(dbName, dbUser, dbPass, dbHost, dbPort, projectPath);

    // Save credentials to MyCloud DB
    await DatabaseCredentialModel.create({
      projectId,
      dbType: DatabaseType.POSTGRESQL,
      dbHost,
      dbPort,
      dbName,
      dbUser,
      dbPassword: dbPass,
    });

    const envVars: Record<string, string> = {
      DB_HOST:     dbHost,
      DB_PORT:     String(dbPort),
      DB_NAME:     dbName,
      DB_USER:     dbUser,
      DB_PASSWORD: dbPass,
      DATABASE_URL: `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`,
    };

    logger.info(`[DatabaseManager] PostgreSQL provisioned: ${dbName}`);
    return envVars;
  }

  // ── SQLite ─────────────────────────────────────────────────────────────────

  private static async provisionSqlite(
    projectId: string,
    projectPath: string,
  ): Promise<Record<string, string>> {
    // SQLite is file-based — no server to provision.
    // We just set the path and let the app create it.
    const dbPath = path.join(projectPath, 'data', 'app.db');
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    logger.info(`[DatabaseManager] SQLite path: ${dbPath}`);

    await DatabaseCredentialModel.create({
      projectId,
      dbType:     DatabaseType.SQLITE,
      dbHost:     'localhost',
      dbPort:     0,
      dbName:     dbPath,
      dbUser:     '',
      dbPassword: '',
    });

    return {
      DATABASE_URL: `sqlite:${dbPath}`,
      DB_PATH:      dbPath,
    };
  }

  // ── MySQL ──────────────────────────────────────────────────────────────────

  private static async provisionMysql(
    projectId: string,
    projectPath: string,
  ): Promise<Record<string, string>> {
    // MySQL provisioning requires mysql client in PATH
    logger.warn('[DatabaseManager] MySQL provisioning not fully implemented. Providing env vars only.');

    const dbName = generateDbName(projectId);
    const dbUser = generateDbUser(projectId);
    const dbPass = generatePassword();

    await DatabaseCredentialModel.create({
      projectId,
      dbType:     DatabaseType.MYSQL,
      dbHost:     'localhost',
      dbPort:     3306,
      dbName,
      dbUser,
      dbPassword: dbPass,
    });

    return {
      DB_HOST:     'localhost',
      DB_PORT:     '3306',
      DB_NAME:     dbName,
      DB_USER:     dbUser,
      DB_PASSWORD: dbPass,
      DATABASE_URL: `mysql://${dbUser}:${dbPass}@localhost:3306/${dbName}`,
    };
  }

  // ── Schema import ─────────────────────────────────────────────────────────

  private static async importSchema(
    dbName: string,
    dbUser: string,
    dbPass: string,
    dbHost: string,
    dbPort: number,
    projectPath: string,
  ): Promise<void> {
    const schemaFiles = ['schema.sql', 'database.sql', 'dump.sql', 'init.sql'];
    const schemaFile = schemaFiles.find(f => fs.existsSync(path.join(projectPath, f)));

    if (!schemaFile) {
      // Check migrations directory
      const migrationsDir = path.join(projectPath, 'migrations');
      if (!fs.existsSync(migrationsDir)) return;

      logger.info(`[DatabaseManager] Migrations directory found. Running migrations is the app's responsibility.`);
      return;
    }

    const schemaPath = path.join(projectPath, schemaFile);
    logger.info(`[DatabaseManager] Importing schema from: ${schemaFile}`);

    const client = new Client({
      host:     dbHost,
      port:     dbPort,
      database: dbName,
      user:     dbUser,
      password: dbPass,
    });

    try {
      await client.connect();
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      logger.info(`[DatabaseManager] Schema imported successfully`);
    } finally {
      await client.end();
    }
  }

  /**
   * Drop a project's database (called on project deletion).
   */
  static async destroy(projectId: string): Promise<void> {
    const creds = await DatabaseCredentialModel.findByProject(projectId);
    if (!creds) return;

    if (creds.db_type === DatabaseType.POSTGRESQL) {
      const adminClient = new Client({
        host:     config.DB_HOST,
        port:     config.DB_PORT,
        database: 'postgres',
        user:     config.DB_USER,
        password: config.DB_PASSWORD,
      });

      try {
        await adminClient.connect();

        // Terminate active connections
        await adminClient.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [creds.db_name]
        );

        await adminClient.query(`DROP DATABASE IF EXISTS "${creds.db_name}"`);
        await adminClient.query(`DROP USER IF EXISTS "${creds.db_user}"`);
        logger.info(`[DatabaseManager] Dropped PostgreSQL DB: ${creds.db_name}`);
      } finally {
        await adminClient.end();
      }
    } else if (creds.db_type === DatabaseType.SQLITE) {
      if (fs.existsSync(creds.db_name)) {
        fs.unlinkSync(creds.db_name);
        logger.info(`[DatabaseManager] Deleted SQLite file: ${creds.db_name}`);
      }
    }

    await DatabaseCredentialModel.deactivate(projectId);
  }
}
