/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as crypto from 'crypto';

// Patch pour crypto manquant dans cPanel
if (!(global as any).crypto) {
  (global as any).crypto = crypto;
}

function titleFromOperation(path: string, method: string): string {
  const cleanPath = path
    .replace(/[{}]/g, '')
    .replace(/\//g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return `${method.toUpperCase()} ${cleanPath || 'root'}`;
}

function ensureErrorSchema(document: any) {
  document.components = document.components || {};
  document.components.schemas = document.components.schemas || {};
  document.components.schemas.ErrorResponse = {
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 400 },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/transaction/unknown' },
      message: {
        oneOf: [
          { type: 'string', example: 'Bad Request' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
    },
  };
}

function enhanceSwaggerDocument(document: any): any {
  ensureErrorSchema(document);

  document.paths = document.paths || {};
  for (const [path, pathItem] of Object.entries<any>(document.paths)) {
    const operations = pathItem || {};
    for (const method of Object.keys(operations)) {
      const op = operations[method];
      if (!op || typeof op !== 'object') continue;

      if (!op.summary) {
        op.summary = titleFromOperation(path, method);
      }
      if (!op.description) {
        op.description =
          'Automatically documented endpoint. Add a domain-specific description for better precision.';
      }

      op.responses = op.responses || {};
      if (!op.responses['200'] && !op.responses['201'] && method !== 'delete') {
        op.responses['200'] = {
          description: 'Operation completed successfully.',
        };
      }
      if (!op.responses['204'] && method === 'delete') {
        op.responses['204'] = {
          description: 'Deletion completed successfully.',
        };
      }

      const defaultErrorRef = {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      };

      if (!op.responses['400']) {
        op.responses['400'] = {
          description: 'Invalid request.',
          ...defaultErrorRef,
        };
      }
      if (!op.responses['401']) {
        op.responses['401'] = {
          description: 'Authentication required.',
          ...defaultErrorRef,
        };
      }
      if (!op.responses['403']) {
        op.responses['403'] = {
          description: 'Access denied.',
          ...defaultErrorRef,
        };
      }
      if (!op.responses['404']) {
        op.responses['404'] = {
          description: 'Resource not found.',
          ...defaultErrorRef,
        };
      }
      if (!op.responses['500']) {
        op.responses['500'] = {
          description: 'Internal server error.',
          ...defaultErrorRef,
        };
      }

      // Ajoute un requestBody generique si absent pour POST/PUT/PATCH
      if (
        ['post', 'put', 'patch'].includes(method.toLowerCase()) &&
        !op.requestBody
      ) {
        op.requestBody = {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        };
      }
    }
  }

  return document;
}

async function bootstrap() {
  const assetsPath =
    process.env.NODE_ENV === 'production'
      ? '/app/assets'
      : join(__dirname, '..', '..', 'assets');

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // --- Handlers globaux pour éviter que le backend tombe ---
  process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Middleware de logging (optionnel)
  app.use((req, res, next) => {
    // console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Configuration CORS renforcée
  // app.enableCors({
  //   origin: [
  //     'http://localhost',
  //     'https://localhost',
  //     'http://localhost:8100',
  //     'https://localhost:8100',
  //     'http://localhost:4200',
  //     'https://localhost:4200',
  //     'https://payments.digikuntz.com',
  //     'http://payments.digikuntz.com',
  //     'https://app.digikuntz-payment.cm',
  //     'http://app.digikuntz-payment.cm',
  //     'https://web.digikuntz-payment.cm',
  //     'http://web.digikuntz-payment.cm',
  //     'capacitor://localhost',
  //     'ionic://localhost',
  //     '*',
  //   ],
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  //   allowedHeaders: [
  //     'Content-Type',
  //     'Authorization',
  //     'Accept',
  //     'X-Requested-With',
  //     'Origin',
  //   ],
  //   exposedHeaders: ['Authorization', 'Content-Length'],
  //   // credentials: true,
  //   preflightContinue: false,
  //   optionsSuccessStatus: 204,
  // });
  app.enableCors({
    origin: true, // Autoriser toutes les origines
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
    ],
    exposedHeaders: ['Authorization', 'Content-Length'],
    credentials: true, // Si vous avez besoin des cookies/sessions
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  // Gestion spécifique des requêtes OPTIONS
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Accept',
      );
      return res.status(204).send();
    }
    next();
  });

  // Validation globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Fichiers statiques
  app.useStaticAssets(assetsPath, {
    prefix: '/assets',
  });

  app.useStaticAssets(assetsPath, {
    prefix: '/uploads',
  });

  // Par ceci :
  app.useStaticAssets(join(assetsPath, 'images'), {
    prefix: '/uploads',
    index: false,
  });

  app.useStaticAssets(assetsPath, {
    prefix: '/assets',
    index: false,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('digiKUNTZ Payments API')
    .setDescription(
      'Official digiKUNTZ Payments API documentation with standardized responses and error models.',
    )
    .setVersion('1.0')
    .addServer('http://127.0.0.1:3002', 'Local')
    .addServer('https://app.digikuntz.com', 'Production')
    .setContact(
      'digiKUNTZ Engineering',
      'https://digikuntz.com',
      'support@digikuntz.com',
    )
    .addBearerAuth()
    .build();
  const rawDocument = SwaggerModule.createDocument(app, config);
  const document = enhanceSwaggerDocument(rawDocument);
  SwaggerModule.setup('api/docs', app, document);
  SwaggerModule.setup('api-docs', app, document);
  SwaggerModule.setup('api-doc', app, document);

  // Global fallback for unknown routes
  app.use((req, res) => {
    res.status(404).json({
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
      message: 'Route not found',
    });
  });

  await app.listen(process.env.PORT ?? 3002, '0.0.0.0'); // Sstart Backend on port 3002 because 3000 is already used on server
  console.log(
    `digiKUNTZ Payments backend Application is running on: ${await app.getUrl()}`,
  );
}

bootstrap();
