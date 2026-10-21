import { sessionRegistrationFailure } from './session-diagnostics';
import type { AuthRequest } from './auth';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  Module,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { API_CONFIG, type ApiConfig } from './config';
import { Database } from './database';
import { AuthGuard, PermissionsGuard } from './auth';
import { FoundationController } from './controller';
import { FoundationService } from './service';
import { FoundationRepository } from './repository';
import { AssessmentController } from './assessment/controller';
import { AssessmentService } from './assessment/service';
import { AssessmentRepository } from './assessment/repository';
import { SessionController } from './sessions';
import { TrainingController } from './training/controller';
import { TrainingService } from './training/service';
import { TrainingRepository } from './training/repository';
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host
      .switchToHttp()
      .getRequest<Request & { requestId: string }>();
    let status = 500;
    let message: unknown = 'Internal server error';
    if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.getResponse();
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      status = 409;
      message = 'Duplicate record';
    }
    if (
      request.method === 'POST' &&
      request.path === '/api/v1/sessions' &&
      status >= 500
    ) {
      console.error(
        JSON.stringify({
          ...sessionRegistrationFailure(
            (request as AuthRequest).sessionRegistrationStage,
            error,
          ),
          requestId: request.requestId,
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: 'request.failed',
        requestId: request.requestId,
        status,
      }),
    );
    response.status(status).json({
      statusCode: status,
      error: message,
      requestId: request.requestId,
    });
  }
}
export async function createApp(config: ApiConfig): Promise<INestApplication> {
  @Module({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
    controllers: [
      FoundationController,
      AssessmentController,
      SessionController,
      TrainingController,
    ],
    providers: [
      { provide: API_CONFIG, useValue: config },
      Database,
      FoundationRepository,
      FoundationService,
      AssessmentRepository,
      AssessmentService,
      TrainingRepository,
      TrainingService,
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    abortOnError: false,
    logger: config.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(
    (
      request: Request & { requestId: string },
      response: Response,
      next: NextFunction,
    ) => {
      request.requestId = randomUUID();
      response.setHeader('X-Request-Id', request.requestId);
      response.setHeader('Cache-Control', 'no-store');
      const start = Date.now();
      response.on('finish', () => {
        if (config.NODE_ENV !== 'test')
          console.log(
            JSON.stringify({
              event: 'request.completed',
              requestId: request.requestId,
              method: request.method,
              status: response.statusCode,
              durationMs: Date.now() - start,
            }),
          );
      });
      next();
    },
  );
  app.useGlobalFilters(new SafeErrors());
  app.enableShutdownHooks();
  if (config.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VetReady Africa assessment and development API')
        .setVersion('0.1.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
  await app.init();
  return app;
}
