import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { hashPassword, verifyPassword } from '../../core/authentication/password.js';
import { generateAccessToken, createSession, validateAndRotateSession, revokeSession } from '../../core/authentication/token.js';
import { recordAuditEvent } from '../../core/logging/audit.js';

export class AuthService {
  async registerCustomer(data: { email: string; password: string; name: string; phone?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      throw new Error('Email is already registered');
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: Role.CUSTOMER
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = await createSession(user.id);

    await recordAuditEvent({
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id
    });

    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid email or password');
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await recordAuditEvent({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        ipAddress,
        userAgent
      });
      throw new Error('Invalid email or password');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await createSession(user.id);

    await recordAuditEvent({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      accessToken,
      refreshToken
    };
  }

  async refreshTokens(refreshToken: string) {
    const rotated = await validateAndRotateSession(refreshToken);
    if (!rotated) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw new Error('User no longer active');
    }

    const accessToken = generateAccessToken(user);
    return { accessToken, refreshToken: rotated.newRefreshToken };
  }

  async logout(refreshToken: string, userId?: string) {
    if (refreshToken) {
      await revokeSession(refreshToken);
    }
    if (userId) {
      await recordAuditEvent({
        userId,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: userId
      });
    }
    return { success: true };
  }

  async createEmployee(data: { email: string; password: string; name: string; role: Role; phone?: string }, creatorId: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      throw new Error('Email is already registered');
    }

    const passwordHash = await hashPassword(data.password);
    const employee = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: data.role
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    await recordAuditEvent({
      userId: creatorId,
      action: 'EMPLOYEE_CREATED',
      entityType: 'User',
      entityId: employee.id,
      details: { role: employee.role, email: employee.email }
    });

    return employee;
  }

  async listEmployees() {
    return prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.MANAGER, Role.STAFF, Role.DELIVERY] }
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const authService = new AuthService();
