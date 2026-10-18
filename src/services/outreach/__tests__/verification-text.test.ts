/**
 * A phone-verification code goes straight to the number being verified (never
 * a user lookup), only when that number never sent STOP and the user and the
 * number are under the limits, and counts as sent only when the provider took it.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', () => {
  const keep = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: keep, info: keep, warn: keep, error: keep };
  return { createLogger: () => logger, getLogger: () => ({ ...logger, child: () => logger }) };
});

import { phoneHash } from '../checkin-replies.js';
import { codeText, textVerificationCode, type CodeTextDeps } from '../verification-text.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const START = Date.parse('2026-10-18T16:00:00Z');

function deps(over: Partial<CodeTextDeps> = {}) {
  const sends = new Map<string, string[]>();
  let clock = START;
  const d: CodeTextDeps = {
    env: ENV,
    isOptedOut: vi.fn(async () => false),
    recentSends: async (key) => sends.get(key) ?? [],
    saveSends: async (key, at) => void sends.set(key, at),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date(clock),
    ...over,
  };
  return { d, advance: (ms: number) => void (clock += ms) };
}
const makeCode = () => vi.fn(async (_e164: string) => '123456');

describe('textVerificationCode', () => {
  it('texts the code to the number given, in plain words, and only then is it sent', async () => {
    const { d } = deps();
    const make = makeCode();
    expect(await textVerificationCode('uid-1', '(555) 555-0100', make, d)).toEqual({ sent: true });
    expect(make).toHaveBeenCalledWith('+15555550100');
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15555550100',
        body: 'Your Ferni code is 123456. It expires in 10 minutes.',
      })
    );
    expect(codeText('1')).not.toMatch(/[—\u{1F300}-\u{1FAFF}☀-➿]/u); // no em dash, no emoji
  });

  it('a send the provider refused is not "sent"', async () => {
    const { d } = deps({
      send: vi.fn(async () => ({ success: false, error: 'bad +15555550100' })),
    });
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toEqual({
      sent: false,
      reason: 'send-failed',
    });
  });

  it('one a minute and five an hour, per user and per number', async () => {
    const { d, advance } = deps();
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toEqual({
      sent: true,
    });
    advance(30_000);
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toMatchObject({
      reason: 'too-soon',
    });
    // Another account asking for the same number is held by the number's own limit.
    expect(await textVerificationCode('uid-2', '+15555550100', makeCode(), d)).toMatchObject({
      reason: 'too-soon',
    });
    for (let i = 0; i < 4; i++) {
      advance(61_000);
      expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toEqual({
        sent: true,
      });
    }
    advance(61_000);
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toMatchObject({
      reason: 'too-many',
    });
    expect(d.send).toHaveBeenCalledTimes(5);
    advance(60 * 60 * 1000);
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toEqual({
      sent: true,
    });
  });

  it('one user asking for codes to different numbers is held by their own limit', async () => {
    const { d, advance } = deps();
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toEqual({
      sent: true,
    });
    advance(30_000);
    expect(await textVerificationCode('uid-1', '+15555550111', makeCode(), d)).toMatchObject({
      reason: 'too-soon',
    });
  });

  it('a number that sent STOP gets no code, and no code is made for it', async () => {
    const stopped = phoneHash('+15555550100', ENV);
    const { d } = deps({ isOptedOut: vi.fn(async (h: string) => h === stopped) });
    const make = makeCode();
    expect(await textVerificationCode('uid-1', '+15555550100', make, d)).toEqual({
      sent: false,
      reason: 'opted-out',
    });
    expect(make).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('without the hash secret (STOP unreadable) nothing goes; a non-number is refused', async () => {
    const { d } = deps({ env: {} });
    expect(await textVerificationCode('uid-1', '+15555550100', makeCode(), d)).toMatchObject({
      reason: 'unavailable',
    });
    const ok = deps();
    expect(await textVerificationCode('uid-1', '12', makeCode(), ok.d)).toMatchObject({
      reason: 'invalid-number',
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('never logs the code or the full number, sent or not', async () => {
    logged.length = 0;
    const { d } = deps();
    await textVerificationCode('uid-1', '+15555550100', makeCode(), d);
    const failing = deps({
      send: vi.fn(async () => ({ success: false, error: 'to +15555550100' })),
    });
    await textVerificationCode('uid-1', '+15555550100', makeCode(), failing.d);
    expect(logged.length).toBeGreaterThan(1);
    const all = JSON.stringify(logged);
    expect(all).not.toContain('123456');
    expect(all).not.toContain('5555550100');
    expect(all).toContain('0100'); // last four only
  });
});
