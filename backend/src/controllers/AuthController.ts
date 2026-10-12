import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { UserModel } from '../models/UserModel';
import { config } from '../config/env';
import { ValidationError, UnauthorizedError } from '../utils/errors';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const user = await UserModel.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await UserModel.updateLastLogin(user.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    res.json({
      success: true,
      data: {
        token,
        user: UserModel.toPublic(user),
      },
    });
  }

  static async me(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: req.user });
  }
}
