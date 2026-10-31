/**
 * Error reporting to Sentry, gated on SENTRY_DSN.
 *
 * With SENTRY_DSN unset nothing happens: the SDK is never loaded and
 * reportError() is a no-op. With it set, each process (voice worker, per-call
 * job child, UI server) initialises once from `src/instrument.ts` and reports:
 * - every uncaught exception (and unhandled rejection Node escalates to one),
 * - unhandled rejections the app's own handler catches (reportError),
 * - log.error calls that carry an Error (rate-limited).
 *
 * Every event and breadcrumb passes through the privacy scrubber
 * (utils/error-scrub.ts) before it leaves the process.
 *
 * Env: SENTRY_DSN, SENTRY_ENVIRONMENT (else DEPLOY_ENV, else NODE_ENV),
 * SENTRY_RELEASE (else BUILD_SHA, else K_REVISION), SENTRY_TRACES_SAMPLE_RATE
 * (0 to 1, default 0).
 *
 * @module utils/error-reporting
 */

import { basename } from 'node:path';

import type * as SentryNode from '@sentry/node';

import { scrubBreadcrumb, scrubEvent, scrubString } from './error-scrub.js';
import { setErrorLogSink } from './safe-logger.js';

type Sentry = typeof SentryNode;
type Env = Record<string, string | undefined>;

/** Built-ins we replace: they change process exit behaviour or record console output. */
const DROPPED_INTEGRATIONS = new Set([
  'Console',
  'LocalVariables',
  'LocalVariablesAsync',
  'OnUncaughtException',
  'OnUnhandledRejection',
]);

/** Non-fatal reports allowed per minute per process, and how long one message is muted. */
const REPORTS_PER_MINUTE = 30;
const REPEAT_MUTE_MS = 5 * 60_000;
const FLUSH_BEFORE_EXIT_MS = 2_000;

let sentry: Sentry | null = null;
let windowStart = 0;
let windowCount = 0;
const lastSentAt = new Map<string, number>();

/** Sentry options from the environment, or null when SENTRY_DSN is unset. */
export function buildSentryOptions(env: Env = process.env): SentryNode.NodeOptions | null {
  const dsn = env['SENTRY_DSN']?.trim();
  if (!dsn) return null;
  const rate = Number(env['SENTRY_TRACES_SAMPLE_RATE']);
  const tracesSampleRate = Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0;
  const tracing = tracesSampleRate > 0;
  return {
    dsn,
    environment: env['SENTRY_ENVIRONMENT'] || env['DEPLOY_ENV'] || env['NODE_ENV'] || 'development',
    release: env['SENTRY_RELEASE'] || env['BUILD_SHA'] || env['K_REVISION'] || undefined,
    tracesSampleRate,
    // Errors only by default: leave the global OpenTelemetry API and the
    // runtime channel hooks alone, so LiveKit's own tracer setup is untouched.
    enableOpenTelemetrySetup: tracing,
    enableRuntimeChannelInjection: tracing,
    // Sentry 11 dropped sendDefaultPii and collects all of these by default.
    // AI prompts/completions would carry call transcripts; DB, queue and
    // GraphQL payloads can carry phone numbers. Keep every one off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
    },
    includeLocalVariables: false,
    maxBreadcrumbs: 30,
    integrations: (defaults) => defaults.filter((i) => !DROPPED_INTEGRATIONS.has(i.name)),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    initialScope: {
      tags: {
        process:
          env['AGENT_JOB_CHILD'] === '1' ? 'agent-job' : basename(process.argv[1] ?? 'unknown'),
      },
    },
  };
}

/** True once Sentry is initialised in this process. */
export function isErrorReportingEnabled(): boolean {
  return sentry !== null;
}

function allow(key: string, now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  const last = lastSentAt.get(key);
  if (last !== undefined && now - last < REPEAT_MUTE_MS) return false;
  if (windowCount >= REPORTS_PER_MINUTE) return false;
  windowCount++;
  if (lastSentAt.size > 500) lastSentAt.clear();
  lastSentAt.set(key, now);
  return true;
}

export interface ReportOptions {
  /** Where the error surfaced: uncaught-exception, unhandled-rejection, log. */
  source: string;
  level?: 'error' | 'fatal';
  /** The log line's message; scrubbed before it is attached. */
  logMessage?: string;
}

/** Sends an error to Sentry (scrubbed, rate-limited unless fatal). No-op without SENTRY_DSN. */
export function reportError(error: unknown, options: ReportOptions): void {
  const client = sentry;
  if (!client) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const level = options.level ?? 'error';
  const key = `${options.source}:${err.name}:${(options.logMessage ?? err.message).slice(0, 120)}`;
  if (level !== 'fatal' && !allow(key, Date.now())) return;
  try {
    client.withScope((scope) => {
      scope.setTag('source', options.source);
      scope.setLevel(level);
      if (options.logMessage) scope.setContext('log', { message: scrubString(options.logMessage) });
      client.captureException(err);
    });
  } catch {
    // Reporting must never take the process down.
  }
}

/** Finds an Error in a log call's bindings (`error` or `err`), as pino callers pass it. */
function errorFromLogArgs(args: unknown[]): { error: Error; message?: string } | null {
  const [first, second] = args;
  if (typeof first !== 'object' || first === null) return null;
  const bindings = first as Record<string, unknown>;
  const error = bindings['error'] ?? bindings['err'];
  if (!(error instanceof Error)) return null;
  return { error, message: typeof second === 'string' ? second : undefined };
}

/**
 * Reports every uncaught exception. When the app has its own handler the process
 * keeps running, as before; when it has none, this flushes and exits 1, which is
 * what Node would have done without the flush.
 */
function onUncaughtException(error: unknown, origin: string): void {
  reportError(error, { source: origin, level: 'fatal' });
  const others = process.listeners('uncaughtException').filter((l) => l !== onUncaughtException);
  if (others.length > 0) return;
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  const exit = (): never => process.exit(1);
  void sentry?.flush(FLUSH_BEFORE_EXIT_MS).then(exit, exit);
  if (!sentry) exit();
}

async function start(
  env: Env,
  load: () => Promise<Sentry>,
  extra: Partial<SentryNode.NodeOptions>
): Promise<boolean> {
  const options = buildSentryOptions(env);
  if (!options) return false;
  let sdk: Sentry;
  try {
    sdk = await load();
    sdk.init({ ...options, ...extra });
  } catch (error) {
    process.stderr.write(`[error-reporting] Sentry init failed: ${String(error)}\n`);
    return false;
  }
  sentry = sdk;
  process.on('uncaughtException', onUncaughtException);
  setErrorLogSink((args) => {
    const found = errorFromLogArgs(args);
    if (found) reportError(found.error, { source: 'log', logMessage: found.message });
  });
  return true;
}

let starting: Promise<boolean> | null = null;

/**
 * Initialises Sentry once per process (concurrent callers share one start).
 * Loads the SDK only when SENTRY_DSN is set. `load` and `extra` exist for tests.
 */
export async function initErrorReporting(
  env: Env = process.env,
  load: () => Promise<Sentry> = async () => import('@sentry/node'),
  extra: Partial<SentryNode.NodeOptions> = {}
): Promise<boolean> {
  starting ??= start(env, load, extra);
  return starting;
}

/** Sends whatever is queued, for a process about to exit. No-op without SENTRY_DSN; never rejects. */
export async function flushErrorReporting(ms: number = FLUSH_BEFORE_EXIT_MS): Promise<void> {
  try {
    await sentry?.flush(ms);
  } catch {
    // Exiting matters more than the last report.
  }
}

/** Test helper: forget the client and handlers. */
export async function resetErrorReportingForTests(): Promise<void> {
  process.off('uncaughtException', onUncaughtException);
  setErrorLogSink(null);
  const client = sentry;
  sentry = null;
  starting = null;
  await client?.close(0);
  windowStart = 0;
  windowCount = 0;
  lastSentAt.clear();
}
