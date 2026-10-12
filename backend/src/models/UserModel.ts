import { query } from '../config/database';
import { UserRow, PublicUser } from '../types';

export class UserModel {
  static async findAll(): Promise<UserRow[]> {
    const res = await query<UserRow>(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    return res.rows;
  }

  static async create(email: string, passwordHash: string, name: string, role: string): Promise<UserRow> {
    const res = await query<UserRow>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, name, role]
    );
    return res.rows[0];
  }

  static async findByEmail(email: string): Promise<UserRow | null> {
    const res = await query<UserRow>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    return res.rows[0] ?? null;
  }

  static async findById(id: string): Promise<UserRow | null> {
    const res = await query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    return res.rows[0] ?? null;
  }

  static async updateLastLogin(id: string): Promise<void> {
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
  }

  static toPublic(user: UserRow): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
