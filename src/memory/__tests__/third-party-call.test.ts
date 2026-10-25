/**
 * The person who picks up an on-behalf call is not our user: nothing they say
 * is captured, buffered or extracted as theirs, and no profile is made for
 * them. Prod 2026-10-18: a relative's words went through fast capture, the
 * short-term buffer and knowledge capture under `onbehalf:<callId>`.
 *
 * Each case runs the real entry point twice, for a member and for the call's
 * pseudo-user, so a pass can't come from the input alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const extractEntities = vi.hoisted(() =>
  vi.fn(async () => ({ entities: [], extractionTimeMs: 0 }))
);
vi.mock('../knowledge-graph/extractors/index.js', () => ({
  extractEntities,
  extractFacts: vi.fn(async () => ({ facts: [] })),
  extractRelationships: vi.fn(async () => ({ relationships: [] })),
}));

const { fastCapture } = await import('../dynamic/fast-capture.js');
const { recordTurn, getRecentTurns, cleanupSession } = await import('../dynamic/stm-buffer.js');
const { captureTurn } = await import('../knowledge-graph/services/knowledge-capture.js');
const { validateUserId } = await import('../../services/session/validation.js');
const { isThirdPartyCallUser } = await import('../third-party-call.js');

const CALLEE = 'onbehalf:onbehalf_1760799649000_abcde';
const MEMBER = 'member-uid-1';
const SAID = "I'm going to church with my sister Ruth on Sunday, tell him he should come too.";

beforeEach(() => {
  extractEntities.mockClear();
  cleanupSession('s-member');
  cleanupSession('s-callee');
});

describe('an on-behalf call session remembers nothing about the person on the line', () => {
  it('names the pseudo-user, and only it', () => {
    expect(isThirdPartyCallUser(CALLEE)).toBe(true);
    expect(isThirdPartyCallUser(MEMBER)).toBe(false);
    expect(isThirdPartyCallUser('anon:abc')).toBe(false);
    expect(isThirdPartyCallUser(undefined)).toBe(false);
  });

  it('fast capture finds nothing and queues no deep extraction for them', async () => {
    const input = { sessionId: 's', turnNumber: 1, transcript: SAID };
    const member = await fastCapture({ ...input, userId: MEMBER });
    expect(member.mentionedEntities.length).toBeGreaterThan(0);

    const callee = await fastCapture({ ...input, userId: CALLEE });
    expect(callee.mentionedEntities).toEqual([]);
    expect(callee.relationshipSignals).toEqual([]);
    expect(callee.asyncJobId).toBeNull();
  });

  it('the short-term buffer keeps no turn of theirs (so nothing is promoted at session end)', async () => {
    const capture = await fastCapture({
      sessionId: 's',
      turnNumber: 1,
      transcript: SAID,
      userId: MEMBER,
    });
    recordTurn('s-member', MEMBER, capture, SAID, 1);
    expect(getRecentTurns('s-member')).toHaveLength(1);

    recordTurn('s-callee', CALLEE, capture, SAID, 1);
    expect(getRecentTurns('s-callee')).toEqual([]);
  });

  it('knowledge capture never extracts from their words', async () => {
    const turn = { sessionId: 's', turnNumber: 1, transcript: SAID };
    await captureTurn({ ...turn, userId: CALLEE });
    expect(extractEntities).not.toHaveBeenCalled();

    await captureTurn({ ...turn, userId: MEMBER });
    expect(extractEntities).toHaveBeenCalledTimes(1);
  });

  it('no profile is loaded or created for them', () => {
    expect(validateUserId(MEMBER)).toBe(MEMBER);
    expect(validateUserId(CALLEE)).toBeUndefined();
  });
});
