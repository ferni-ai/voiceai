/**
 * Intelligence Worker Logger
 *
 * Pino-based structured logging for the intelligence worker.
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {
        // JSON logging in production for Cloud Logging
        formatters: {
          level: (label) => ({ severity: label.toUpperCase() }),
        },
      }
    : {
        // Pretty printing in development
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
});

/**
 * Create a child logger with a module name
 */
export function createLogger(module: string): pino.Logger {
  return baseLogger.child({ module });
}

export { baseLogger as logger };

