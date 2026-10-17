import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env
dotenv.config();

const isRunningTests =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.includes('test')) ||
  process.execArgv.some((arg) => arg.includes('test')) ||
  Boolean(process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes('test'));

if (isRunningTests && process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'test';
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  REFRESH_SECRET: z.string().min(16, 'REFRESH_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_mockKeyId'),
  RAZORPAY_KEY_SECRET: z.string().default('mockKeySecret1234567890'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('mockWebhookSecret1234567890'),
  ENABLE_MOCK_PAYMENTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ALLOWED_ORIGINS: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().optional().default('sk_test_mock'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default('whsec_mock'),
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
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.RAZORPAY_KEY_ID || data.RAZORPAY_KEY_ID.includes('mock')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_KEY_ID'],
        message: 'A valid production RAZORPAY_KEY_ID is required in production environment'
      });
    }
    if (!data.RAZORPAY_KEY_SECRET || data.RAZORPAY_KEY_SECRET.includes('mock')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_KEY_SECRET'],
        message: 'A valid production RAZORPAY_KEY_SECRET is required in production environment'
      });
    }
    if (!data.RAZORPAY_WEBHOOK_SECRET || data.RAZORPAY_WEBHOOK_SECRET.includes('mock')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_WEBHOOK_SECRET'],
        message: 'A valid production RAZORPAY_WEBHOOK_SECRET is required in production environment'
      });
    }
    if (data.ENABLE_MOCK_PAYMENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENABLE_MOCK_PAYMENTS'],
        message: 'ENABLE_MOCK_PAYMENTS cannot be enabled in production environment'
      });
    }
    if (data.JWT_SECRET.length < 32 || data.JWT_SECRET.includes('replace-with')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 random characters in production'
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  throw new Error('Application environment configuration failed validation');
}

export const env = parsed.data;
export type Environment = z.infer<typeof envSchema>;
