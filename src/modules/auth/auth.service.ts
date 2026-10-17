import crypto from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { hashPassword, verifyPassword } from '../../core/authentication/password.js';
import { generateAccessToken, createSession, validateAndRotateSession, revokeSession, revokeAllUserSessions } from '../../core/authentication/token.js';
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

  /**
   * Request password reset token.
   * Employs OWASP anti-enumeration: always returns a generic success message
   * regardless of whether the email exists.
   */
  async forgotPassword(email: string, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    let debugToken: string | undefined;

    if (user && user.isActive) {
      // High-entropy 32-byte cryptographic token
      const rawToken = crypto.randomBytes(32).toString('hex');
      // Store SHA-256 hash in database to prevent token theft from database backups/logs
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      // Token valid for 15 minutes
      const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: hashedToken,
          resetTokenExpiry
        }
      });

      await recordAuditEvent({
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        ipAddress,
        userAgent
      });

      // Provide debugToken only in test environment for automated verification
      if (process.env.NODE_ENV === 'test') {
        debugToken = rawToken;
      }
    }

    return {
      message: 'If an account with that email exists, password reset instructions have been sent.',
      ...(debugToken ? { debugToken } : {})
    };
  }

  /**
   * Reset password with single-use expiring token.
   * Revokes all active sessions upon successful reset.
   */
  async resetPassword(token: string, newPassword: string, ipAddress?: string, userAgent?: string) {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or expired password reset token');
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
        isActive: true
      }
    });

    if (!user) {
      throw new Error('Invalid or expired password reset token');
    }

    const passwordHash = await hashPassword(newPassword);

    // Atomically update password and clear reset token to prevent replay
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    // Invalidate all existing user sessions
    await revokeAllUserSessions(user.id);

    await recordAuditEvent({
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent
    });

    return {
      message: 'Password has been reset successfully. Please log in with your new password.'
    };
  }

  /**
   * Authenticated password change with session revocation.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Revoke all sessions so re-login with new password is required
    await revokeAllUserSessions(user.id);

    await recordAuditEvent({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
      userAgent
    });

    return {
      message: 'Password changed successfully. Please log in with your new credentials.'
    };
  }
}

export const authService = new AuthService();
