/**
 * PRIVACY: scientific and life coaching key a caller's cognitive-distortion
 * history (ant_patterns / ant_entries) and coaching state by user id. With no
 * id they used `services.userId || 'unknown'`, pooling every id-less caller's
 * distortions into ant_patterns/unknown and reading them back into the next
 * caller's coaching. They now run as the caller's own id, or one anon: id per
 * server session (callerIdFor); never a shared placeholder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scientificUsers = vi.hoisted(() => [] as string[]);
const coachingUsers = vi.hoisted(() => [] as string[]);
vi.mock('../../../../intelligence/context-builders/coaching/scientific-coaching.js', () => ({
  buildScientificCoachingContext: vi.fn(async (input: { userId: string }) => {
    scientificUsers.push(input.userId);
    return { injections: [], detectedDistortions: [], warnings: [] };
  }),
}));
vi.mock('../../../../services/coaching/index.js', () => ({
  analyzeForCoaching: vi.fn((userId: string) => {
    coachingUsers.push(userId);
    return { needsCoaching: false };
  }),
  getCoachingContextForLLM: vi.fn((userId: string) => {
    coachingUsers.push(userId);
    return '';
  }),
}));

const { buildScientificCoachingInjections, buildLifeCoachingInjections } =
  await import('../safety-coaching-builders.js');

const serverSession = (job: string) => `session-${job}-${Date.now()}`;
const ctx = (services: Record<string, unknown>) =>
  ({
    userText: 'I always ruin everything, I should just give up on it',
    services,
    userData: { turnCount: 4 },
    persona: { id: 'ferni' },
    currentTopic: 'work',
    emotionalState: { primary: 'sad', intensity: 0.5, distressLevel: 0.4 },
    sessionId: services.sessionId,
  }) as never;

beforeEach(() => {
  scientificUsers.length = 0;
  coachingUsers.length = 0;
});

describe('coaching runs as the caller, never a shared placeholder', () => {
  it("a member's coaching runs under their own id", async () => {
    await buildScientificCoachingInjections(ctx({ userId: 'uid-member', sessionId: 's1' }));
    await buildLifeCoachingInjections(ctx({ userId: 'uid-member', sessionId: 's1' }));
    expect(new Set([...scientificUsers, ...coachingUsers])).toEqual(new Set(['uid-member']));
  });

  it('two id-less callers in two sessions never share coaching state; one caller keeps one id', async () => {
    const a = serverSession('AJ_coach_a');
    const b = serverSession('AJ_coach_b');
    for (const services of [
      { sessionId: a },
      { sessionId: a, userId: 'unknown' },
      { sessionId: b },
    ]) {
      await buildScientificCoachingInjections(ctx(services));
      await buildLifeCoachingInjections(ctx(services));
    }
    const ids = [...scientificUsers, ...coachingUsers];
    expect(ids.some((id) => id === 'unknown' || id === '' || id === 'anonymous')).toBe(false);
    expect(ids.every((id) => id.startsWith('anon:'))).toBe(true);
    expect(scientificUsers[0]).toBe(scientificUsers[1]); // same session, same caller
    expect(scientificUsers[2]).not.toBe(scientificUsers[0]); // another session
  });
});
