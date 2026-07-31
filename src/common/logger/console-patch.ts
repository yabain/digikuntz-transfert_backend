import { createLogger, format, transports } from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');
import * as path from 'path';
import * as fs from 'fs';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const winston = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format((info) => {
      info.source = 'console';
      return info;
    })(),
    format.json(),
  ),
  transports: [
    new transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? format.json()
        : format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, stack }) => {
              const stackStr = stack ? `\n${stack}` : '';
              return `${timestamp} ${level} ${message}${stackStr}`;
            }),
          ),
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'console-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      format: format.json(),
    }),
  ],
});

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

console.log = (...args: any[]) => {
  winston.info(args.map(String).join(' '));
};

console.error = (...args: any[]) => {
  const [first, ...rest] = args;
  winston.error(first instanceof Error ? first.message : String(first), {
    stack: first instanceof Error ? first.stack : undefined,
    extra: rest.length ? rest.map(String).join(' ') : undefined,
  });
};

console.warn = (...args: any[]) => {
  winston.warn(args.map(String).join(' '));
};

console.info = (...args: any[]) => {
  winston.info(args.map(String).join(' '));
};

console.debug = (...args: any[]) => {
  winston.debug(args.map(String).join(' '));
};
