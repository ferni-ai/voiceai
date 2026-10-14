/**
 * Options for the LiveKit SDK logger in the worker and its job processes.
 *
 * Pretty output is for a person reading a terminal. Deployed (NODE_ENV
 * production, dev and prod agents alike) it splits each record into one log
 * line per field, so an SDK or patch log can't be queried as a record; there
 * the SDK writes one JSON line per record, like our own stderr sink.
 *
 * @module agents/gce/sdk-logger-options
 */
import type { Env } from '../../config/env-flag.js';

export type SdkLogLevel = 'debug' | 'info' | 'warn' | 'error';

export function sdkLoggerOptions(env: Env = process.env): {
  pretty: boolean;
  level: SdkLogLevel;
} {
  return {
    pretty: env.NODE_ENV !== 'production',
    level: (env.LOG_LEVEL || 'info') as SdkLogLevel,
  };
}
