import { app } from './app.js';
import { env } from './core/config/env.js';
import { logger } from './core/logging/logger.js';
import { checkDatabaseConnection, disconnectDatabase } from './core/database/prisma.js';
import { getCasbinEnforcer } from './core/authorization/casbin.js';

async function bootstrap() {
  try {
    // 1. Verify Database Connection
    const dbCheck = await checkDatabaseConnection();
    if (!dbCheck.connected) {
      throw new Error('Could not establish initial database connection');
    }
    logger.info(`Database connected successfully (Latency: ${dbCheck.latencyMs}ms)`);

    // 2. Initialize Casbin Authorization Enforcer
    await getCasbinEnforcer();

    // 3. Start HTTP Server
    const server = app.listen(env.PORT, () => {
      logger.info(`=======================================================`);
      logger.info(`ALGIONS Retail Platform started successfully`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Server URL : http://localhost:${env.PORT}`);
      logger.info(`Storefront : http://localhost:${env.PORT}/`);
      logger.info(`Admin UI   : http://localhost:${env.PORT}/admin/`);
      logger.info(`OpenAPI UI : http://localhost:${env.PORT}/api-docs`);
      logger.info(`=======================================================`);
    });

    // Graceful Shutdown Handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        logger.info('HTTP server closed and database disconnected.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to bootstrap server', error as Error);
    process.exit(1);
  }
}

bootstrap();
