/**
 * Options for the LiveKit SDK logger in the worker and its job processes.
 *
 * Pretty output is for a person reading a terminal. Deployed (NODE_ENV
 * production, dev and prod agents alike) it splits each record into one log
 * line per field, so an SDK or patch log can't be queried as a record; there
 * the SDK writes one JSON line per record, like our own stderr sink.
 *
 * initializeSdkLogger is how both processes (the worker and each job child) start it:
 * it first makes the SDK's `lk.pii.*` values lengths outside dev
 * (utils/log-pii-key-redaction.ts), for this logger and any the SDK sets later.
 *
 * @module agents/gce/sdk-logger-options
 */
import { initializeLogger } from '@livekit/agents';

import type { Env } from '../../config/env-flag.js';
import { installSdkPiiKeyRedaction } from '../../utils/log-pii-key-redaction.js';

type SdkLogLevel = 'debug' | 'info' | 'warn' | 'error';

function sdkLoggerOptions(env: Env = process.env): {
  pretty: boolean;
  level: SdkLogLevel;
} {
  return {
    pretty: env.NODE_ENV !== 'production',
    level: (env.LOG_LEVEL || 'info') as SdkLogLevel,
  };
}

/** Starts the SDK logger for this process, with its lk.pii.* values redacted outside dev. */
export function initializeSdkLogger(env: Env = process.env): void {
  installSdkPiiKeyRedaction(env);
  initializeLogger(sdkLoggerOptions(env));
}
