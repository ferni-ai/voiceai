/**
 * Error reporting runs the real Sentry SDK against an in-memory transport:
 * nothing without SENTRY_DSN, every event scrubbed, log.error and unhandled
 * rejections reported, rate-limited, and process exit behaviour unchanged.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSentryOptions,
  initErrorReporting,
  isErrorReportingEnabled,
  reportError,
  resetErrorReportingForTests,
} from '../error-reporting.js';
import { createLogger } from '../safe-logger.js';

// The real logger: its error level is one of the paths under test.
vi.unmock('../safe-logger.js');

const DSN = 'https://publickey@o0.ingest.sentry.io/1';
const TRANSCRIPT = 'I keep thinking about the divorce and I cannot sleep';
const PHONE = '+1 (415) 555-0134';

/** Sentry transport that keeps envelopes in memory. */
function memoryTransport(bodies: string[]) {
  return (options: Parameters<typeof Sentry.createTransport>[0]) =>
    Sentry.createTransport(options, async (request) => {
      bodies.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body)
      );
      return { statusCode: 200 };
    });
}

/** The error events in the captured envelopes. */
function events(bodies: string[]): Array<Record<string, unknown>> {
  return bodies.flatMap((body) => {
    const lines = body.split('\n');
    const out: Array<Record<string, unknown>> = [];
    for (let i = 1; i + 1 < lines.length; i += 2) {
      const header = JSON.parse(lines[i] ?? '{}') as { type?: string };
      if (header.type === 'event') out.push(JSON.parse(lines[i + 1] ?? '{}'));
    }
    return out;
  });
}

async function start(bodies: string[]): Promise<void> {
  const ok = await initErrorReporting(
    { SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: 'dev', BUILD_SHA: 'abc123' },
    async () => Sentry,
    { transport: memoryTransport(bodies) }
  );
  expect(ok).toBe(true);
}

afterEach(async () => {
  await resetErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('buildSentryOptions', () => {
  it('returns null without SENTRY_DSN (the gate)', () => {
    expect(buildSentryOptions({})).toBeNull();
    expect(buildSentryOptions({ SENTRY_DSN: '  ' })).toBeNull();
  });

  it('reads environment, release and trace rate, and never sends default PII', () => {
    const o = buildSentryOptions({
      SENTRY_DSN: DSN,
      DEPLOY_ENV: 'prod',
      NODE_ENV: 'production',
      BUILD_SHA: 'f00d',
    });
    expect(o).toMatchObject({
      dsn: DSN,
      environment: 'prod',
      release: 'f00d',
      tracesSampleRate: 0,
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
      sendDefaultPii: false,
      includeLocalVariables: false,
    });
    expect(buildSentryOptions({ SENTRY_DSN: DSN, NODE_ENV: 'production' })?.environment).toBe(
      'production'
    );
    expect(buildSentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '0.2' })).toMatchObject(
      { tracesSampleRate: 0.2, skipOpenTelemetrySetup: false, registerEsmLoaderHooks: true }
    );
    expect(buildSentryOptions({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '5' })).toMatchObject({
      tracesSampleRate: 0,
    });
  });
});

describe('initErrorReporting', () => {
  it('does not load the SDK when SENTRY_DSN is unset', async () => {
    const load = vi.fn(async () => Sentry);
    expect(await initErrorReporting({}, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(isErrorReportingEnabled()).toBe(false);
    reportError(new Error('x'), { source: 'test' }); // no client: must not throw
  });

  it('leaves the global OpenTelemetry API unclaimed when tracing is off', async () => {
    const otel = Symbol.for('opentelemetry.js.api.1');
    const before = (globalThis as Record<symbol, Record<string, unknown> | undefined>)[otel];
    await start([]);
    const after = (globalThis as Record<symbol, Record<string, unknown> | undefined>)[otel];
    expect(after?.['trace']).toBe(before?.['trace']);
    expect(after?.['context']).toBe(before?.['context']);
  });

  it('adds no unhandledRejection listener (Node keeps deciding whether to crash)', async () => {
    const before = process.listenerCount('unhandledRejection');
    await start([]);
    expect(process.listenerCount('unhandledRejection')).toBe(before);
  });

  it('reports a log.error carrying an Error, scrubbed of transcript, phone and token', async () => {
    const bodies: string[] = [];
    await start(bodies);
    Sentry.setExtra('callerPhone', PHONE);
    Sentry.addBreadcrumb({ category: 'console', message: `user said ${TRANSCRIPT}` });
    const err = new Error(`Failed to process utterance: ${TRANSCRIPT}`);
    createLogger({ module: 'turn' }).error(
      { error: err, phone: PHONE, headers: { Authorization: 'Bearer abc.def.ghi' } },
      `Turn failed for ${PHONE}: "${TRANSCRIPT}"`
    );
    await Sentry.flush(2000);

    const sent = events(bodies);
    expect(sent).toHaveLength(1);
    const text = JSON.stringify(sent);
    for (const secret of ['divorce', 'cannot sleep', '415', '0134', 'abc.def.ghi']) {
      expect(text).not.toContain(secret);
    }
    const event = sent[0] as {
      tags: Record<string, string>;
      environment: string;
      release: string;
      exception: { values: Array<{ type: string; value: string }> };
    };
    expect(event.tags['source']).toBe('log');
    expect(event.environment).toBe('dev');
    expect(event.release).toBe('abc123');
    expect(event.exception.values[0]).toMatchObject({
      type: 'Error',
      value: 'Failed to process utterance: [redacted]',
    });
  });

  it('ignores log.error without an Error and lower levels', async () => {
    const bodies: string[] = [];
    await start(bodies);
    const log = createLogger({ module: 'quiet' });
    log.error({ error: 'just a string' }, 'string error');
    log.warn({ error: new Error('warned') }, 'a warning');
    await Sentry.flush(2000);
    expect(events(bodies)).toHaveLength(0);
  });

  it('mutes a repeated error', async () => {
    const bodies: string[] = [];
    await start(bodies);
    for (let i = 0; i < 5; i++) reportError(new Error('same failure'), { source: 'log' });
    await Sentry.flush(2000);
    expect(events(bodies)).toHaveLength(1);
  });

  it('caps non-fatal reports per minute', async () => {
    const bodies: string[] = [];
    await start(bodies);
    for (let i = 0; i < 40; i++) reportError(new Error(`failure ${i}`), { source: 'log' });
    await Sentry.flush(2000);
    expect(events(bodies)).toHaveLength(30);
  });

  it('the global unhandledRejection handler reports the rejection', async () => {
    const bodies: string[] = [];
    await start(bodies);
    const { registerGlobalErrorHandlers } = await import('../safe-fire-and-forget.js');
    registerGlobalErrorHandlers();
    const handlers = process.listeners('unhandledRejection');
    const handler = handlers[handlers.length - 1] as (r: unknown, p: Promise<unknown>) => void;
    handler(new Error('db write failed'), Promise.resolve());
    await Sentry.flush(2000);
    const sent = events(bodies) as Array<{ tags: Record<string, string> }>;
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tags['source']).toBe('unhandledRejection');
  });
});

describe('uncaught exceptions (child process, real SDK)', () => {
  const child = fileURLToPath(new URL('./fixtures/uncaught-child.ts', import.meta.url));
  const run = (mode: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', child, mode], {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, SENTRY_DSN: DSN },
    });

  it('with no app handler: reports, flushes, then exits 1 as Node would', () => {
    const r = run('crash');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('SENT fatal uncaughtException');
    expect(r.stdout).not.toContain('divorce');
    expect(r.stdout).not.toContain('still running');
  });

  it('with an app handler: reports and the process keeps running', () => {
    const r = run('survive');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('SENT fatal uncaughtException');
    expect(r.stdout).toContain('still running');
  });
});
