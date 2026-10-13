/**
 * initDb.ts
 * Creates the mycloud_platform database (if it doesn't exist),
 * runs the full schema, and seeds the port pool.
 *
 * Usage: ts-node src/scripts/initDb.ts
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_NAME = 'mycloud_platform',
  DB_USER = 'postgres',
  DB_PASSWORD = '',
  DATABASE_URL = '',
  DB_SSL = 'false',
  PORT_RANGE_START = '4000',
  PORT_RANGE_END = '5000',
} = process.env;

function databaseOptions(database = DB_NAME) {
  if (DATABASE_URL) {
    return {
      connectionString: DATABASE_URL,
      ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    };
  }
  return {
    host: DB_HOST,
    port: parseInt(DB_PORT),
    database,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  };
}

async function createDatabase(): Promise<void> {
  if (DATABASE_URL) {
    console.log('✓ Using the managed PostgreSQL database from DATABASE_URL');
    return;
  }

  // Connect to the default 'postgres' database to create ours
  const adminClient = new Client(databaseOptions('postgres'));

  try {
    await adminClient.connect();
    console.log('✓ Connected to PostgreSQL as admin');

    const checkRes = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );

    if (checkRes.rowCount === 0) {
      // Sanitize DB_NAME to prevent SQL injection (only allow alphanumeric + underscore)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(DB_NAME)) {
        throw new Error(`Invalid database name: ${DB_NAME}`);
      }
      await adminClient.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`✓ Database '${DB_NAME}' created`);
    } else {
      console.log(`✓ Database '${DB_NAME}' already exists`);
    }
  } finally {
    await adminClient.end();
  }
}

async function runSchema(): Promise<void> {
  const client = new Client(databaseOptions());

  try {
    await client.connect();
    console.log(`✓ Connected to '${DB_NAME}'`);

    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    await client.query(schemaSql);
    console.log('✓ Schema applied successfully');

    await seedPortPool(client);
  } finally {
    await client.end();
  }
}

async function seedPortPool(client: Client): Promise<void> {
  const start = parseInt(PORT_RANGE_START);
  const end = parseInt(PORT_RANGE_END);

  // Count existing ports
  const countRes = await client.query('SELECT COUNT(*) FROM ports');
  const existingCount = parseInt(countRes.rows[0].count);

  if (existingCount > 0) {
    console.log(`✓ Port pool already seeded (${existingCount} ports)`);
    return;
  }

  console.log(`Seeding port pool: ${start} → ${end} ...`);

  // Batch insert for performance
  const values: string[] = [];
  const params: number[] = [];
  let paramIdx = 1;

  for (let port = start; port <= end; port++) {
    values.push(`($${paramIdx})`);
    params.push(port);
    paramIdx++;
  }

  await client.query(
    `INSERT INTO ports (port_number) VALUES ${values.join(', ')} ON CONFLICT (port_number) DO NOTHING`,
    params
  );

  console.log(`✓ Port pool seeded: ${end - start + 1} ports (${start}-${end})`);
}

async function main(): Promise<void> {
  console.log('\n=== MyCloud Platform - Database Initialization ===\n');

  try {
    await createDatabase();
    await runSchema();

    console.log('\n✅ Database initialization complete!\n');
  } catch (err) {
    console.error('\n❌ Initialization failed:', err);
    process.exit(1);
  }
}

main();
