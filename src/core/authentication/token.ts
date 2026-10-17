import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export function generateAccessToken(user: { id: string; email: string; role: string; name: string }): string {
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '2h',
    algorithm: 'HS256'
  });
}

export async function createSession(userId: string): Promise<string> {
  const refreshToken = uuidv4() + '.' + jwt.sign({ userId }, env.REFRESH_SECRET, { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt
    }
  });

  return refreshToken;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

export async function validateAndRotateSession(refreshToken: string): Promise<{ userId: string; newRefreshToken: string } | null> {
  const session = await prisma.session.findUnique({
    where: { token: refreshToken }
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  // Revoke old session and issue new rotated session (token rotation pattern)
  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() }
  });

  const newRefreshToken = await createSession(session.userId);
  return { userId: session.userId, newRefreshToken };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { token: refreshToken },
    data: { revokedAt: new Date() }
  });
}
