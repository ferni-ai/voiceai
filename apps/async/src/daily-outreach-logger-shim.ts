import { createLogger as createAsyncLogger } from './logger.js';

export interface FallbackLogger {
  debug: (first: unknown, ...rest: unknown[]) => void;
  info: (first: unknown, ...rest: unknown[]) => void;
  warn: (first: unknown, ...rest: unknown[]) => void;
  error: (first: unknown, ...rest: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => FallbackLogger;
}

export function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

export function createLogger(options: string | { module?: string }): FallbackLogger {
  const moduleName = typeof options === 'string' ? options : options.module || 'daily-outreach';
  const logger = createAsyncLogger(moduleName);
  const writeLog = (
    level: 'debug' | 'info' | 'warn' | 'error',
    first: unknown,
    rest: readonly unknown[]
  ): void => {
    if (typeof first === 'string') {
      logger[level]({ args: rest }, first);
      return;
    }

    const message = typeof rest[0] === 'string' ? rest[0] : 'daily outreach log';
    logger[level](first as Record<string, unknown>, message);
  };

  return {
    debug: (first: unknown, ...rest: unknown[]) => writeLog('debug', first, rest),
    info: (first: unknown, ...rest: unknown[]) => writeLog('info', first, rest),
    warn: (first: unknown, ...rest: unknown[]) => writeLog('warn', first, rest),
    error: (first: unknown, ...rest: unknown[]) => writeLog('error', first, rest),
    child: (bindings: Record<string, unknown>) =>
      createLogger(`${moduleName}:${String(bindings.module || 'child')}`),
  };
}

export function getLogger(): FallbackLogger {
  return createLogger('daily-outreach');
}

export function truncateForLog(value: unknown, maxLength = 500): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export const safeLog = getLogger;
