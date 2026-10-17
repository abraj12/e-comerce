import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  REFRESH_SECRET: z.string().min(16, 'REFRESH_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  STRIPE_SECRET_KEY: z.string().default('sk_test_mock'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_mock'),
  SMTP_HOST: z.string().default('smtp.mailtrap.io'),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().default('mock_user'),
  SMTP_PASS: z.string().default('mock_pass'),
  SMTP_FROM: z.string().default('no-reply@algions-retail.local'),
  UPLOAD_DIR: z.string().default('./public/uploads'),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(5242880),
  STORE_NAME: z.string().default('ALGIONS Retail Mart'),
  STORE_CURRENCY: z.string().default('INR'),
  STORE_EMAIL: z.string().default('retail@algions.com'),
  STORE_PHONE: z.string().default('+919876543210'),
  TAX_RATE_PERCENTAGE: z.coerce.number().default(5.0),
  LOW_STOCK_DEFAULT_THRESHOLD: z.coerce.number().default(5)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  throw new Error('Application environment configuration failed validation');
}

export const env = parsed.data;
export type Environment = z.infer<typeof envSchema>;
