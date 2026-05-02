import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

import type { NestExpressApplication } from '@nestjs/platform-express';


async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const orchestratorToken = process.env['ORCHESTRATOR_TOKEN'];

  // Simple token middleware — skip /health
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/health') {
      return next();
    }
    const authHeader = req.headers['authorization'];
    const expectedToken = orchestratorToken ? `Bearer ${orchestratorToken}` : undefined;

    if (!expectedToken) {
      // ORCHESTRATOR_TOKEN not set — allow all (development mode)
      Logger.warn('ORCHESTRATOR_TOKEN not set — all requests allowed', 'Bootstrap');
      return next();
    }

    if (authHeader !== expectedToken) {
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
      return;
    }

    return next();
  });

  const port = parseInt(process.env['PORT'] ?? '5000', 10);
  await app.listen(port);
  Logger.log(`Orchestrator running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(`Failed to start: ${String(err)}`, 'Bootstrap');
  process.exit(1);
});
