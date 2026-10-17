import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from './token.js';
import { prisma } from '../database/prisma.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload & { isActive: boolean };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication Required: Bearer token is missing or invalid'
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token'
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, name: true, isActive: true }
  });

  if (!user || !user.isActive) {
    res.status(401).json({
      success: false,
      error: 'User account is inactive or no longer exists'
    });
    return;
  }

  req.user = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    isActive: user.isActive
  };

  next();
}

export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, name: true, isActive: true }
      });
      if (user && user.isActive) {
        req.user = {
          userId: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          isActive: user.isActive
        };
      }
    }
  }
  next();
}
