import { Request, Response } from 'express';
import { authService } from './auth.service.js';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.registerCustomer(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.login(req.body.email, req.body.password, req.ip, req.headers['user-agent']);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(401).json({ success: false, error: (error as Error).message });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.refreshTokens(req.body.refreshToken);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(401).json({ success: false, error: (error as Error).message });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.body.refreshToken;
      await authService.logout(refreshToken, req.user?.userId);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getMe(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: req.user });
  }

  async createEmployee(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.createEmployee(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async listEmployees(_req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.listEmployees();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
}

export const authController = new AuthController();
