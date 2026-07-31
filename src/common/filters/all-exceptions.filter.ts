import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLogger();
  constructor() {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorPayload: Record<string, any> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, any>;
        message = String(responseObj.message || message);
        errorPayload = Object.fromEntries(
          Object.entries(responseObj).filter(([key]) => key !== 'message'),
        );
      }
    }

    // Les erreurs 4xx (mauvais identifiants, 404, 400, etc.) et les erreurs de
    // connectivité DB sont des cas attendus, pas des erreurs système : on les
    // logue en warn. Seules les vraies erreurs serveur restent en error.
    const isExpected = status < HttpStatus.INTERNAL_SERVER_ERROR || this.isDatabaseConnectionError(exception);

    if (isExpected) {
      this.logger.warn(`${request.method} ${request.url} - ${status} - ${message}`);
    } else {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...errorPayload,
    });
  }

  private isDatabaseConnectionError(exception: unknown): boolean {
    if (!(exception instanceof Error)) return false;
    if (exception.name === 'MongoServerSelectionError') return true;
    if (exception.name === 'MongoNetworkError') return true;
    return /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|MongoServerSelectionError|MongoNetworkError)/.test(
      exception.message,
    );
  }
}
