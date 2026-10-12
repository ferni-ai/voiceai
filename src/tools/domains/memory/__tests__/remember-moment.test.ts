/**
 * "I'll remember: …" moment: sent only after a store that succeeded, with a
 * short safe summary, never about a forgotten topic, and only with
 * REMEMBER_MOMENT=on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const write = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; memoryId?: string }> => ({
    success: true,
    memoryId: 'mem_1',
  }))
);
const forgotten = vi.hoisted(() => vi.fn(async (): Promise<string[] | null> => []));

vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write }),
}));
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: forgotten,
}));

import {
  initializeFrontendPublisher,
  resetFrontendPublisher,
  type RoomRef,
} from '../../../../agents/realtime/frontend-publisher.js';
import {
  announceRemembered,
  MAX_SUMMARY_CHARS,
  momentSummary,
  setRememberMomentPorts,
  type MomentPorts,
} from '../remember-moment.js';
import { rememberAboutUserUnifiedDef } from '../tools-unified.js';

const ON = { REMEMBER_MOMENT: 'on' };
const fact = { userId: 'u-1', sessionId: 's-1', fact: 'has two kids', category: 'personal' };

function ports(isForgotten: MomentPorts['isForgotten'] = async () => false) {
  const send = vi.fn(async (..._args: Parameters<MomentPorts['send']>) => true);
  return { isForgotten, send };
}

/** Let a fire-and-forget announcement run to completion. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  setRememberMomentPorts(null);
  resetFrontendPublisher();
});

describe('momentSummary', () => {
  it('keeps a short fact as it is, without quotes or a trailing full stop', () => {
    expect(momentSummary('  "training for a half marathon in 2027."  ')).toBe(
      'training for a half marathon in 2027'
    );
  });

  it('shortens a long fact at a word, under the pill length', () => {
    const long =
      'is planning a long road trip up the coast with her two sisters and their dog next spring';
    const s = momentSummary(long) ?? '';
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    expect(long.startsWith(s.slice(0, -1))).toBe(true);
  });

  it.each([
    ['an email', 'email is sam.rivera@example.com'],
    ['a phone number', 'mom’s number is 555 123 4567'],
    ['a link', 'likes https://example.com/recipes'],
    ['an account number', 'savings account 004417829'],
    ['nothing at all', '  ".  '],
  ])('shows nothing for %s', (_label, text) => {
    expect(momentSummary(text)).toBeNull();
  });
});

describe('announceRemembered', () => {
  it('sends a ferni_moment with the summary when the flag is on', async () => {
    const p = ports();
    expect(await announceRemembered(fact, ON, p)).toBe(true);
    expect(p.send).toHaveBeenCalledWith('s-1', 'ferni_moment', {
      kind: 'remembered',
      summary: 'has two kids',
    });
  });

  it('sends nothing with the flag off (the default)', async () => {
    const p = ports();
    expect(await announceRemembered(fact, {}, p)).toBe(false);
    expect(await announceRemembered(fact, { REMEMBER_MOMENT: 'off' }, p)).toBe(false);
    expect(p.send).not.toHaveBeenCalled();
  });

  it('never echoes a topic the caller asked Ferni to forget', async () => {
    const p = ports(async () => true);
    expect(await announceRemembered(fact, ON, p)).toBe(false);
    expect(p.send).not.toHaveBeenCalled();
  });

  it('sends nothing when it cannot tell whether the topic was forgotten', async () => {
    const unknown = ports(async () => null);
    expect(await announceRemembered(fact, ON, unknown)).toBe(false);
    const failing = ports(async () => {
      throw new Error('firestore down');
    });
    expect(await announceRemembered(fact, ON, failing)).toBe(false);
    expect(unknown.send).not.toHaveBeenCalled();
    expect(failing.send).not.toHaveBeenCalled();
  });

  it.each(['emotional', 'financial'])('keeps %s facts off the screen', async (category) => {
    const p = ports();
    expect(await announceRemembered({ ...fact, category }, ON, p)).toBe(false);
    expect(p.send).not.toHaveBeenCalled();
  });

  it('sends nothing outside a call, or before the session plugged it in', async () => {
    const p = ports();
    expect(await announceRemembered({ ...fact, sessionId: undefined }, ON, p)).toBe(false);
    expect(await announceRemembered(fact, ON)).toBe(false);
    expect(p.send).not.toHaveBeenCalled();
  });
});

/** The live tool, the session's real wiring (initializeFrontendPublisher) and a fake room. */
describe('rememberAboutUser in a call', () => {
  type Execute = (
    args: { fact: string; category: string; importance: string },
    opts: unknown
  ) => Promise<string>;

  function call(): Array<Record<string, unknown>> {
    const received: Array<Record<string, unknown>> = [];
    const room: RoomRef = {
      localParticipant: {
        publishData: async (data: Uint8Array): Promise<void> => {
          received.push(JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>);
        },
      },
    };
    initializeFrontendPublisher('s-1', room);
    return received;
  }

  const remember = async (factText: string): Promise<string> =>
    (
      rememberAboutUserUnifiedDef.create({ agentId: 'ferni' } as never) as unknown as {
        execute: Execute;
      }
    ).execute(
      { fact: factText, category: 'personal', importance: 'medium' },
      { ctx: { userData: { userId: 'u-1', services: { sessionId: 's-1' } } } }
    );

  it('shows the moment in the room once the store succeeded', async () => {
    vi.stubEnv('REMEMBER_MOMENT', 'on');
    const received = call();
    expect(await remember('has two kids')).toBe('');
    await vi.waitFor(() =>
      expect(received).toEqual([
        expect.objectContaining({
          type: 'ferni_moment',
          kind: 'remembered',
          summary: 'has two kids',
        }),
      ])
    );
  });

  it('sends nothing when the store failed', async () => {
    vi.stubEnv('REMEMBER_MOMENT', 'on');
    const received = call();
    write.mockResolvedValueOnce({ success: false });
    await remember('has two kids');
    await settle();
    expect(forgotten).not.toHaveBeenCalled();
    expect(received).toEqual([]);
  });

  it('sends nothing about a topic forgotten earlier', async () => {
    vi.stubEnv('REMEMBER_MOMENT', 'on');
    forgotten.mockResolvedValueOnce(['sister wedding']);
    const received = call();
    await remember("is giving a toast at her sister's wedding");
    await settle();
    expect(forgotten).toHaveBeenCalledWith('u-1');
    expect(received).toEqual([]);
  });

  it('sends nothing with the flag off', async () => {
    const received = call();
    await remember('has two kids');
    await settle();
    expect(received).toEqual([]);
  });
});
