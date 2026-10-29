/**
 * The turn's first log line carries the length of what the caller said, never the words.
 * processTurn logged `preview: userText.slice(0, 100)` through diag.user, which logs at
 * info in production, so the opening of every turn reached Cloud Logging. Every diag and
 * logger call is captured; the line must fire, and no 12-character run of the sentinel
 * may appear in any of them.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logged: [] as unknown[][] }));

vi.mock('../../../../services/diagnostic-logger.js', () => {
  const capture =
    (level: string) =>
    (...args: unknown[]) =>
      void h.logged.push([level, ...args]);
  const diag = new Proxy({}, { get: (_t, level) => capture(String(level)) });
  return { diag, default: diag };
});
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void h.logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture, trace: capture };
  const child = () => ({ ...logger, child });
  return {
    ...(await importOriginal<typeof import('../../../../utils/safe-logger.js')>()),
    createLogger: () => ({ ...logger, child }),
    getLogger: () => ({ ...logger, child }),
  };
});

const { processTurn } = await import('../process-turn.js');

const SENTINEL = 'my sister Dolores has stage-three lupus and a biopsy friday';
const PIECES = Array.from({ length: SENTINEL.length - 11 }, (_, i) => SENTINEL.slice(i, i + 12));
const holdsWords = (value: unknown): string[] => {
  const text = JSON.stringify(value).toLowerCase();
  return PIECES.filter((p) => text.includes(p.toLowerCase()));
};

describe('the turn start log keeps no caller words', () => {
  it('logs the length of the turn, and no part of the words', async () => {
    const ctx = {
      userText: SENTINEL,
      userData: {},
      services: { sessionId: 's-test', userId: 'u-test' },
      turnCtx: { addMessage: () => undefined, items: [] },
      logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
    } as unknown as Parameters<typeof processTurn>[0];
    // The rest of the turn needs a live session; only its logging is under test
    await processTurn(ctx).catch(() => undefined);

    const start = h.logged.find((args) => args[1] === 'Processing user turn');
    expect(start).toEqual(['user', 'Processing user turn', { userTextLength: SENTINEL.length }]);
    expect(holdsWords(h.logged.map((args) => args.map(String)))).toEqual([]);
    expect(holdsWords(h.logged)).toEqual([]);
  });
});
