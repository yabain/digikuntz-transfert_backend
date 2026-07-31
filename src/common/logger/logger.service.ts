import { Injectable, LoggerService, Scope, Optional } from '@nestjs/common';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');
import { LOGGER_DIR, LOG_LEVELS } from './logger.constants';
import { TraceService } from '../trace/trace.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private logger: WinstonLogger;
  private context?: string;

  constructor(@Optional() private readonly traceService?: TraceService) {
    const logDir = path.resolve(process.cwd(), LOGGER_DIR);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.errors({ stack: true }),
      format((info) => {
        const traceId = this.traceService?.getTraceId();
        if (traceId) info.traceId = traceId;
        if (this.context) info.context = this.context;
        return info;
      })(),
      process.env.NODE_ENV === 'production'
        ? format.json()
        : format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, context, traceId, stack, ...meta }) => {
              const ctx = context ? `[${context}]` : '';
              const trace = traceId ? ` (trace: ${traceId})` : '';
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              const stackStr = stack ? `\n${stack}` : '';
              return `${timestamp} ${level} ${ctx}${trace} ${message}${metaStr}${stackStr}`;
            }),
          ),
    );

    this.logger = createLogger({
      levels: LOG_LEVELS,
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        new transports.Console(),
        new DailyRotateFile({
          filename: path.join(logDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          maxSize: '20m',
          format: format.json(),
        }),
        new DailyRotateFile({
          filename: path.join(logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxFiles: '90d',
          maxSize: '20m',
          level: 'error',
          format: format.json(),
        }),
      ],
    });
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: any, context?: string): void {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: any, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context: context || this.context });
  }

  warn(message: any, context?: string): void {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: any, context?: string): void {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: any, context?: string): void {
    this.logger.verbose(message, { context: context || this.context });
  }

  info(message: any, meta?: Record<string, any>): void {
    this.logger.info(message, { ...meta, context: this.context });
  }
}
