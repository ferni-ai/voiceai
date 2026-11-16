/**
 * Crisis words never resurface (CRISIS_WORDS_NEVER_RESURFACE).
 *
 * With the flag on, a crisis_support or vulnerability moment keeps no caller words: the
 * relationship engine stores type, date and score only, the personality service's vulnerability
 * deposit keeps no summary, content or keywords, and its pattern evidence keeps no line. Such a
 * moment is never offered as a callback, even one saved with words before the flag, and the
 * personality prompt never quotes a deposit with no words. An ordinary happy moment still comes
 * back. Off: as on main.
 *
 * Real bridge, real engine, real personality use cases on the in-memory repository; only the
 * relationship store is stubbed. All text is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ service: undefined as unknown }));

vi.mock('../persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadRelationshipMemory: vi.fn().mockResolvedValue(null),
  saveRelationshipMemory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../personality/v2/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPersonalityService: () => state.service,
}));

import { clearAllRelationshipEngines, initializeRelationship } from '../engine.js';
import type { SharedMomentType } from '../types.js';
import { recordUnifiedMoment } from '../../../personality/bridge/personality-bridge.js';
import { createTestPersonalityService } from '../../../personality/v2/index.js';
import type { InMemoryPersonalityRepository } from '../../../personality/infrastructure/in-memory-personality-repository.js';

const HARD = "i've never told anyone this, but some nights at work i don't want to be here anymore";
const HAPPY = 'we finally finished the garden shed together and it looks amazing';
const PERSONA = 'ferni';
const FULL = { withPatterns: true, withVulnerabilities: true };

let repository: InMemoryPersonalityRepository;
let n = 0;

beforeEach(() => {
  clearAllRelationshipEngines();
  const { service, repository: repo } = createTestPersonalityService();
  state.service = service;
  repository = repo;
});
afterEach(() => vi.unstubAllEnvs());

/** One moment through the real bridge; returns the engine and the saved profile for the user. */
async function record(type: SharedMomentType, message: string, flag: 'on' | 'off') {
  vi.stubEnv('CRISIS_WORDS_NEVER_RESURFACE', flag);
  const userId = `user-wordless-${++n}`;
  const engine = await initializeRelationship(userId, PERSONA);
  const result = await recordUnifiedMoment({
    userId,
    personaId: PERSONA,
    type,
    message,
    topics: ['work'],
    emotionalIntensity: 0.9,
  });
  expect(result.success).toBe(true);
  const profile = await repository.loadProfile(userId, PERSONA, FULL);
  if (!profile) throw new Error('the personality service saved no profile');
  return { userId, engine, profile };
}

const evidenceLines = (p: Awaited<ReturnType<typeof record>>['profile']) =>
  p.emotionalPatterns.flatMap((pattern) => pattern.evidence.map((e) => e.context));

describe.each<SharedMomentType>(['crisis_support', 'vulnerability'])(
  'flag on: a %s moment keeps no words and is never a callback',
  (type) => {
    it('stores type, date and score only in the relationship engine', async () => {
      const { engine } = await record(type, HARD, 'on');
      const [moment] = engine.buildRelationshipContext().recentMoments;
      expect(moment.type).toBe(type);
      expect(moment.significance).toBe(0.9);
      expect(moment.timestamp).toBeInstanceOf(Date);
      expect(moment.summary).toBe('');
      expect(moment.userPhrase).toBeUndefined();
      expect(moment.topic).toBeUndefined();
    });

    it('offers no callback hint, with or without a topic', async () => {
      const { engine } = await record(type, HARD, 'on');
      expect(engine.getCallbackOpportunity()).toBeNull();
      expect(engine.getCallbackOpportunity('work')).toBeNull();
    });

    it('keeps no words in the vulnerability deposit or the pattern evidence', async () => {
      const { profile } = await record(type, HARD, 'on');
      expect(profile.vulnerabilityDeposits).toHaveLength(1);
      const [deposit] = profile.vulnerabilityDeposits;
      expect([deposit.summary, deposit.content, deposit.keywords]).toEqual(['', '', []]);
      expect(evidenceLines(profile).length).toBeGreaterThan(0);
      expect(evidenceLines(profile).every((line) => line === '')).toBe(true);
    });
  }
);

describe('flag off: as on main', () => {
  it('stores the words and offers them back as a callback', async () => {
    const { engine, profile } = await record('crisis_support', HARD, 'off');
    const [moment] = engine.buildRelationshipContext().recentMoments;
    expect(moment.userPhrase?.startsWith(HARD.slice(0, 60))).toBe(true);
    expect(engine.getCallbackOpportunity()?.suggestedPhrase).toContain(HARD.slice(0, 40));
    expect(profile.vulnerabilityDeposits[0].content).toBe(HARD);
    expect(evidenceLines(profile)).toContain(HARD);
  });
});

describe('flag on: other moments', () => {
  it('still surfaces an ordinary happy moment with its words', async () => {
    const { engine } = await record('celebration', HAPPY, 'on');
    expect(engine.getCallbackOpportunity()?.suggestedPhrase).toContain(HAPPY.slice(0, 40));
  });

  it('never surfaces a crisis moment saved with words before the flag', async () => {
    const { engine } = await record('crisis_support', HARD, 'off');
    expect(engine.getCallbackOpportunity()).not.toBeNull();
    vi.stubEnv('CRISIS_WORDS_NEVER_RESURFACE', 'on');
    expect(engine.getCallbackOpportunity()).toBeNull();
    expect(engine.getCallbackOpportunity('work')).toBeNull();
  });
});

describe('the personality prompt never quotes a deposit with no words', () => {
  it('drops the wordless deposit and keeps one that kept its words', async () => {
    const { userId } = await record('crisis_support', HARD, 'on');
    // The same caller later shares on an ordinary turn: that deposit keeps its words.
    await new Promise<void>((r) => {
      setTimeout(r, 5);
    }); // deposit ids carry Date.now()
    const worded = "i've never told anyone this, but i'm scared of failing my exam";
    await recordUnifiedMoment({
      userId,
      personaId: PERSONA,
      type: 'deep_conversation',
      message: worded,
    });
    const profile = await repository.loadProfile(userId, PERSONA, FULL);
    expect(profile?.openVulnerabilities.filter((v) => v.needsFollowUp)).toHaveLength(2);

    const service = state.service as ReturnType<typeof createTestPersonalityService>['service'];
    const { formattedContext } = await service.buildContext({ userId, personaId: PERSONA });
    expect(formattedContext.match(/VULNERABILITY CALLBACK/g)).toHaveLength(1);
    expect(formattedContext).toContain(
      "they shared: \"i've never told anyone this, but i'm scared"
    );
    expect(formattedContext).not.toContain('they shared: ""');
  });
});
