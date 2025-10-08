/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as crypto from 'crypto';

// Patch pour crypto manquant dans cPanel
if (!(global as any).crypto) {
  (global as any).crypto = crypto;
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

  app.useGlobalFilters(new HttpExceptionFilter());

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('Digikuntz Payments API')
    .setDescription('Digikuntz Payments API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3002, '0.0.0.0'); // Sstart Backend on port 3001 because 3000 is already used on server
  console.log(
    `Digikuntz Payments backend Application is running on: ${await app.getUrl()}`,
  );
}

bootstrap();
