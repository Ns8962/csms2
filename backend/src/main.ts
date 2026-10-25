import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { validationExceptionFactory } from './common/validation.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const logger = new Logger('Bootstrap');

  app.disable('x-powered-by');
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  if (corsOrigin) {
    app.enableCors({ origin: corsOrigin.split(',').map((o) => o.trim()) });
  }

  // Serve the built React app from the same origin, like the original Express server did.
  const frontendDist = config.get('FRONTEND_DIST', { infer: true });
  if (frontendDist) {
    const dir = resolve(frontendDist);
    if (existsSync(join(dir, 'index.html'))) {
      app.useStaticAssets(dir, { index: 'index.html' });
      logger.log(`Serving frontend from ${dir}`);
    }
  }

  app.enableShutdownHooks();
  const port = config.get('PORT', { infer: true });
  const host = config.get('HOST', { infer: true });
  await app.listen(port, host);
  logger.log(`CSMS API listening on http://${host}:${port}/api`);
}

await bootstrap();
