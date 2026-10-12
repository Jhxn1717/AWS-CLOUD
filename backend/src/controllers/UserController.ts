import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { UserModel } from '../models/UserModel';
import { ConflictError, ValidationError } from '../utils/errors';

export class UserController {
  static async list(_req: Request, res: Response): Promise<void> {
    const users = await UserModel.findAll();
    res.json({ success: true, data: users.map(UserModel.toPublic) });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!name?.trim() || name.trim().length > 100) {
      throw new ValidationError('Name is required and must be at most 100 characters');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new ValidationError('A valid email address is required');
    }
    if (!password || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    if (role !== 'admin' && role !== 'user') {
      throw new ValidationError('Role must be either admin or user');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await UserModel.create(email.trim().toLowerCase(), passwordHash, name.trim(), role);
      res.status(201).json({ success: true, data: UserModel.toPublic(user) });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  }
}