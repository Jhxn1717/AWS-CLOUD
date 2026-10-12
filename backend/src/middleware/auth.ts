/**
 * auth.ts
 * JWT authentication middleware.
 * Attaches req.user if token is valid.
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { PublicUser } from '../types';
import { ProjectModel } from '../models/ProjectModel';

interface JwtPayload {
  id:    string;
  email: string;
  name:  string;
  role:  string;
  iat?:  number;
  exp?:  number;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // Support token via Authorization header OR ?token= query param (needed for SSE/EventSource)
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return next(new UnauthorizedError('No authorization token provided'));
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.user = {
      id:    payload.id,
      email: payload.email,
      name:  payload.name,
      role:  payload.role,
    };
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}

export async function requireProjectAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role === 'admin') return next();

    const project = await ProjectModel.findById(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (project.user_id !== req.user.id) throw new ForbiddenError('You can only access your own projects');
    next();
  } catch (error) {
    next(error);
  }
}
