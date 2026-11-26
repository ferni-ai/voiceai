/**
 * #3215: older web builds still post the caller's last line, on the report and in a dropped
 * call's customData. The server keeps only its length.
 */
import { describe, expect, it } from 'vitest';

import {
  withoutCallerWords,
  type FrontendCrashReport,
  type StoredCrash,
} from '../crash-report-input.js';

const WORDS = 'SAMPLE-CALLER-WORDS my neighbour Pat Example called about the garden';

const report = (extra: Partial<FrontendCrashReport>): FrontendCrashReport => ({
  errorName: 'Error',
  errorMessage: 'Connection dropped: network',
  sessionId: 'session-1',
  ...extra,
});

describe('a client crash as kept', () => {
  it('keeps the length of the caller’s last line, never its words', () => {
    const kept = withoutCallerWords(report({ lastUserMessage: WORDS }));
    expect(kept.lastUserMessageLen).toBe(WORDS.length);
    expect(kept).not.toHaveProperty('lastUserMessage');
    expect(JSON.stringify(kept)).not.toContain('SAMPLE-CALLER');
  });

  it('drops the caller’s words from customData and keeps the rest', () => {
    const kept = withoutCallerWords(
      report({ customData: { disconnectReason: 'network', lastUserMessage: WORDS } })
    );
    expect(kept.customData).toEqual({ disconnectReason: 'network' });
    expect(JSON.stringify(kept)).not.toContain('SAMPLE-CALLER');
  });

  it('a report spread in whole is not a stored crash (pnpm typecheck)', () => {
    const raw = report({ lastUserMessage: WORDS });
    // @ts-expect-error the caller's words cannot be stored: StoredCrash.lastUserMessage is never
    const stored: StoredCrash = { ...raw, crashId: 'client_1', receivedAt: 'now' };
    expect(stored.lastUserMessage).toBe(WORDS); // why the type must refuse it
    const kept: StoredCrash = {
      ...withoutCallerWords(raw),
      crashId: 'client_1',
      receivedAt: 'now',
    };
    expect(kept).not.toHaveProperty('lastUserMessage');
  });

  it('keeps everything else as sent', () => {
    const kept = withoutCallerWords(report({ turnCount: 4, connectionState: 'disconnected' }));
    expect(kept).toEqual({
      errorName: 'Error',
      errorMessage: 'Connection dropped: network',
      sessionId: 'session-1',
      turnCount: 4,
      connectionState: 'disconnected',
      lastUserMessageLen: undefined,
    });
  });
});
