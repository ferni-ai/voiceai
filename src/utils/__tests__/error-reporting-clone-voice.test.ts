/**
 * A consented clone's voice id never reaches Sentry. The error-log sink and reportError
 * see a log call's raw arguments, before the app logger's line redaction, so the scrubber
 * (error-scrub.ts) replaces the registered values (redacted-log-values.ts) itself, whatever
 * their shape: an id with no digit is not caught by the long-opaque-id rule.
 */
import * as Sentry from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initErrorReporting,
  reportError,
  resetErrorReportingForTests,
} from '../error-reporting.js';
import { scrubEvent, scrubString } from '../error-scrub.js';
import { registerRedactedLogValues } from '../redacted-log-values.js';
import { createLogger } from '../safe-logger.js';

// The real logger: its error level feeds the Sentry sink.
vi.unmock('../safe-logger.js');

const DSN = 'https://publickey@o0.ingest.sentry.io/1';
const CLONE = 'fake-seth-id';
// A UUID with no digit: the scrubber's long-opaque-id rule needs one, so only the clone pass catches it.
const UUID_CLONE = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
const REDACTED = '[consented-clone]';

let configured: string[] = [];
registerRedactedLogValues(() => configured);
// The values are read again once a second: each test starts two seconds later, so it sees its own.
let clock = Date.now();
beforeEach(() => {
  clock += 2000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  configured = [CLONE, UUID_CLONE];
});
afterEach(async () => {
  vi.useRealTimers();
  await resetErrorReportingForTests();
});

describe('scrubString', () => {
  it('replaces a clone id however it is cased or joined', () => {
    expect(scrubString(`voice ${CLONE} failed`)).toBe(`voice ${REDACTED} failed`);
    expect(scrubString(`VOICE ${CLONE.toUpperCase()}`)).toBe(`VOICE ${REDACTED}`);
    expect(scrubString(`preview-${CLONE}.mp3`)).toBe(`preview-${REDACTED}.mp3`);
    expect(scrubString(`/tts/bytes?voice=${UUID_CLONE}`)).toBe(`/tts/bytes?voice=${REDACTED}`);
  });

  it('labels a digit-free UUID clone as a clone (the opaque-id rule alone lets it through)', () => {
    expect(scrubString(`voice ${UUID_CLONE}`)).toBe(`voice ${REDACTED}`);
  });

  it('leaves an ordinary voice id as it was', () => {
    expect(scrubString('voice fake-maya-id failed')).toBe('voice fake-maya-id failed');
  });

  it('with no clone configured, changes nothing it did not change before', () => {
    configured = [];
    expect(scrubString(`voice ${CLONE} failed`)).toBe(`voice ${CLONE} failed`);
    expect(scrubString(`voice ${UUID_CLONE}`)).toBe(`voice ${UUID_CLONE}`);
  });

  it('reaches every kept field of an event: message, exception and an http breadcrumb path', () => {
    const out = scrubEvent({
      message: `tts failed for ${CLONE}`,
      exception: { values: [{ type: 'Error', value: `voice ${UUID_CLONE} not found` }] },
      breadcrumbs: [
        {
          category: 'http',
          timestamp: 1,
          data: {
            method: 'GET',
            status_code: 404,
            url: `https://api.cartesia.ai/voices/${UUID_CLONE}`,
          },
        },
      ],
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain(CLONE);
    expect(text).not.toContain(UUID_CLONE);
    expect(out.message).toBe(`tts failed for ${REDACTED}`);
    expect(out.exception?.values?.[0]?.value).toBe(`voice ${REDACTED} not found`);
    expect(out.breadcrumbs?.[0]?.data?.['url']).toBe(`https://api.cartesia.ai/voices/${REDACTED}`);
  });
});

describe('the real Sentry SDK (in-memory transport)', () => {
  async function start(bodies: string[]): Promise<void> {
    const ok = await initErrorReporting(
      { SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: 'dev' },
      async () => Sentry,
      {
        transport: (options) =>
          Sentry.createTransport(options, async (request) => {
            bodies.push(
              typeof request.body === 'string'
                ? request.body
                : new TextDecoder().decode(request.body)
            );
            return { statusCode: 200 };
          }),
      }
    );
    expect(ok).toBe(true);
  }

  it('log.error with an Error naming the clone sends an event without it', async () => {
    const bodies: string[] = [];
    await start(bodies);
    Sentry.addBreadcrumb({ message: `persona voice ${CLONE}` });
    createLogger({ module: 'persona-tts' }).error(
      { error: new Error(`Cartesia rejected voice ${CLONE}`), voiceId: UUID_CLONE },
      `tts failed for ${UUID_CLONE}`
    );
    await Sentry.flush(2000);
    const sent = bodies.join('\n');
    expect(sent).toContain('Cartesia rejected voice');
    expect(sent.toLowerCase()).not.toContain(CLONE);
    expect(sent).not.toContain(UUID_CLONE);
    expect(sent).toContain(REDACTED);
  });

  it('reportError with the clone in the error and the log message sends neither', async () => {
    const bodies: string[] = [];
    await start(bodies);
    reportError(new Error(`voice ${UUID_CLONE} missing`), {
      source: 'log',
      logMessage: `handoff to ${CLONE}`,
    });
    await Sentry.flush(2000);
    const sent = bodies.join('\n');
    expect(sent).toContain('missing');
    expect(sent).not.toContain(UUID_CLONE);
    expect(sent.toLowerCase()).not.toContain(CLONE);
    expect(sent).toContain(`handoff to ${REDACTED}`);
  });

  it('an ordinary voice id reaches Sentry as it was', async () => {
    const bodies: string[] = [];
    await start(bodies);
    reportError(new Error('voice fake-maya-id missing'), { source: 'log' });
    await Sentry.flush(2000);
    const sent = bodies.join('\n');
    expect(sent).toContain('voice fake-maya-id missing');
    expect(sent).not.toContain(REDACTED);
  });
});
