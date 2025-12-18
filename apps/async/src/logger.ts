/**
 * Logger utility for async workers
 *
 * Uses pino for structured JSON logging in production,
 * pretty-printed logs in development.
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
});

/**
 * Create a child logger with a module name for easier filtering
 */
export function createLogger(module: string) {
  return logger.child({ module });
}

