import { afterEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ doc: null as Record<string, unknown> | null }));

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  cleanForFirestore: (x: unknown) => x,
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: stored.doc !== null, data: () => stored.doc }),
            set: async () => undefined,
          }),
        }),
      }),
    }),
  }),
}));

import {
  hasClinicalLabel,
  hasEnoughHistory,
  isGroundedInsight,
  isSubstantiveSummary,
  isSurfaceableInsight,
  keepGroundedInsights,
  keepUnlabelledHypotheses,
} from '../deep-analysis-guards.js';
import { getPredictiveIntelligenceContext } from '../index.js';

const insight = (over: Record<string, unknown> = {}) => ({
  observation: 'Talks about martial arts training most weeks',
  significance: 'It is a steady thread worth asking about',
  confidence: 0.8,
  evidence: ['Session 2: training', 'Session 3: sparring limited'],
  surfacingContext: 'when_relevant',
  ...over,
});

const realCall = {
  topics: ['training'],
  keyMoments: ['Sparring has been limited', 'Wants to compete again'],
};
const testCall = { topics: [], keyMoments: ['User asked: Hey, how are you doing?'] };

afterEach(() => {
  stored.doc = null;
  delete process.env.DEEP_ANALYSIS_IN_CALL;
});

describe('history', () => {
  it('counts only calls with real content', () => {
    expect(isSubstantiveSummary(realCall)).toBe(true);
    expect(isSubstantiveSummary(testCall)).toBe(false);
    expect(
      isSubstantiveSummary({
        topics: ['music'],
        keyMoments: ['User asked: play music', 'User asked: louder'],
      })
    ).toBe(false);
  });

  it('needs five real calls, however many test calls there are', () => {
    expect(hasEnoughHistory([...Array(4).fill(realCall), ...Array(10).fill(testCall)])).toBe(false);
    expect(hasEnoughHistory(Array(5).fill(realCall))).toBe(true);
  });
});

describe('labels', () => {
  it('catches clinical and psych labels as whole words', () => {
    expect(
      hasClinicalLabel('uses AI questions as a protective buffer to avoid vulnerability')
    ).toBe(true);
    expect(hasClinicalLabel('shows an avoidant attachment style')).toBe(true);
    expect(hasClinicalLabel('a classic defense mechanism')).toBe(true);
    expect(hasClinicalLabel('He seems depressed lately')).toBe(true);
  });

  it('leaves ordinary words alone', () => {
    expect(
      hasClinicalLabel('his desk is disorderly, he likes projectors and is avoiding traffic')
    ).toBe(false);
    expect(hasClinicalLabel('Talks about martial arts training most weeks')).toBe(false);
  });
});

describe('insights', () => {
  it('keeps an insight backed by two calls, drops a one-call or labelled one', () => {
    expect(isGroundedInsight(insight())).toBe(true);
    expect(isGroundedInsight(insight({ evidence: ['Session 5 only'] }))).toBe(false);
    expect(
      isGroundedInsight(insight({ significance: 'a defense mechanism against closeness' }))
    ).toBe(false);
    expect(keepGroundedInsights([insight(), insight({ evidence: [] })])).toHaveLength(1);
  });

  it('surfaces only confident, non-crisis insights', () => {
    expect(isSurfaceableInsight(insight())).toBe(true);
    expect(isSurfaceableInsight(insight({ confidence: 0.7 }))).toBe(false);
    expect(isSurfaceableInsight(insight({ surfacingContext: 'crisis_only' }))).toBe(false);
  });

  it('drops hypotheses that carry a label', () => {
    const out = keepUnlabelledHypotheses([
      { prediction: 'Will mention the belt test', reasoning: 'It is coming up' },
      { prediction: 'Will withdraw', reasoning: 'trauma response' },
    ]);
    expect(out.map((h) => h.prediction)).toEqual(['Will mention the belt test']);
  });
});

describe('getPredictiveIntelligenceContext with a stored deep analysis', () => {
  const analysis = {
    analysisId: 'deep_1',
    timestamp: { toDate: () => new Date() },
    insights: [
      insight(),
      insight({
        observation: 'Deflects personal questions as a protective buffer',
        confidence: 0.85,
      }),
    ],
    hypotheses: [],
    outreachSuggestions: [],
    coachingGuidance: [],
    model: 'gemini',
    tokenUsage: { input: 1, output: 1 },
  };

  it('says nothing about deep insights in a call unless DEEP_ANALYSIS_IN_CALL=on', async () => {
    stored.doc = analysis;
    const text = await getPredictiveIntelligenceContext('u1');
    expect(text).not.toContain('martial arts');
    expect(text).not.toContain('DEEP INTELLIGENCE');
  });

  it('with the flag on, carries the grounded insight and never the labelled one', async () => {
    stored.doc = analysis;
    process.env.DEEP_ANALYSIS_IN_CALL = 'on';
    const text = await getPredictiveIntelligenceContext('u1');
    expect(text).toContain('Talks about martial arts training most weeks');
    expect(text).not.toContain('protective buffer');
  });
});
