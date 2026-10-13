/**
 * seedDb.ts
 * Creates the default admin user with hashed password.
 *
 * Usage: ts-node src/scripts/seedDb.ts
 */

import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_NAME = 'mycloud_platform',
  DB_USER = 'postgres',
  DB_PASSWORD = '',
  DATABASE_URL = '',
  DB_SSL = 'false',
} = process.env;

function databaseOptions() {
  if (DATABASE_URL) {
    return {
      connectionString: DATABASE_URL,
      ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    };
  }
  return {
    host: DB_HOST,
    port: parseInt(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  };
}

async function main(): Promise<void> {
  console.log('\n=== MyCloud Platform - Seed Admin User ===\n');

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const plainPassword = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'MyCloud Admin';
  const role = 'admin';

  if (!email || !plainPassword || plainPassword.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in backend/.env before seeding.');
  }

  const client = new Client(databaseOptions());

  try {
    await client.connect();
    console.log('✓ Connected to database');

    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query(
        'UPDATE users SET password_hash = $1, name = $2, role = $3, is_active = true, updated_at = NOW() WHERE email = $4',
        [passwordHash, name, role, email]
      );
      console.log(`✓ Admin credentials updated from environment: ${email}`);
      return;
    }

    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, passwordHash, name, role]
    );

    const user = result.rows[0];
    console.log('✓ Admin user created:');
    console.log(`  ID:    ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name:  ${user.name}`);
    console.log(`  Role:  ${user.role}`);
    console.log('\n✅ Seed complete!\n');
  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
