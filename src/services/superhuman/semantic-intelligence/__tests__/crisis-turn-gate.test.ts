/**
 * processSemanticIntelligence feeds a member's turn to every semantic system: stores, embeddings,
 * the LLM detectors and the outreach signal buffer. A crisis turn, or one whose crisis read is
 * unknown, feeds none of them; an ordinary turn feeds them as before.
 *
 * Each sink this module writes through is replaced by a recorder, so the rows count real call
 * sites rather than a stand-in. Every line here is fictional, written for this test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hits, recorders } = vi.hoisted(() => {
  const hits: string[] = [];
  const recorders =
    (mod: string, names: string[]) =>
    async (importOriginal: () => Promise<Record<string, unknown>>) => {
      const out: Record<string, unknown> = { ...(await importOriginal()) };
      for (const name of names) {
        out[name] = async () => {
          hits.push(`${mod}:${name}`);
          return undefined;
        };
      }
      return out;
    };
  return { hits, recorders };
});

vi.mock('../correlation-mining.js', recorders('correlation', ['recordObservation']));
vi.mock('../emotional-trajectories.js', recorders('trajectories', ['recordEmotionalWaypoint']));
vi.mock('../relational-semantics.js', recorders('relational', ['recordPersonMention']));
vi.mock('../counterfactual-memory.js', recorders('counterfactual', ['recordDecisionPoint']));
vi.mock('../growth-fingerprint.js', recorders('growth', ['recordConversationData']));
vi.mock('../cross-session-threading.js', recorders('threading', ['recordMoment']));
vi.mock('../llm-detector.js', recorders('llm', ['extractPersonsHybrid', 'detectAdviceHybrid']));
vi.mock('../advice-matcher.js', recorders('embeddings', ['findMatchingAdvice', 'precomputeAdviceEmbeddings']));
vi.mock('../open-loops.js', recorders('openLoops', ['processUserTextForLoops']));
vi.mock('../relationship-graph.js', recorders('graph', ['upsertPerson']));
vi.mock('../temporal-patterns.js', recorders('temporal', ['recordSnapshot']));
vi.mock('../behavioral-intelligence.js', recorders('behavioral', ['updateBaseline', 'recordPotentialSabotage']));
vi.mock('../coaching-intelligence.js', recorders('coaching', ['updateLearningStyle', 'recordDeflection']));
vi.mock('../self-awareness.js', recorders('selfAwareness', ['recordDistortions', 'recordSelfPerception']));
vi.mock(
  '../../../conversation-thread/superhuman-outreach-intelligence.js',
  recorders('outreach', ['accumulateSignal'])
);

import { processSemanticIntelligence, type TurnSemanticData } from '../integration.js';

const MEMBER = 'Qm7tXr2LpV9sKd4Wn8cYb3EfGATE'; // a member-shaped uid

function turn(crisisTurn: boolean | undefined): TurnSemanticData {
  return {
    userId: MEMBER,
    sessionId: 'session-gate-1',
    personaId: 'ferni',
    turnNumber: 3,
    userText: "My sister Priya and I keep arguing about the garden, I've decided to call her tonight.",
    topic: 'family',
    textEmotion: 'sad',
    textEmotionIntensity: 0.8,
    mentionedPerson: 'Priya',
    timestamp: new Date('2026-03-04T19:00:00Z'),
    dayOfWeek: 3,
    hourOfDay: 19,
    turnsSinceStart: 3,
    crisisTurn,
  } as TurnSemanticData;
}

beforeEach(() => {
  hits.length = 0;
});

describe('semantic intelligence on a crisis turn', () => {
  it('an ordinary member turn reaches the systems (positive control)', async () => {
    await processSemanticIntelligence(turn(false));
    expect(hits).toEqual(
      expect.arrayContaining([
        'threading:recordMoment',
        'openLoops:processUserTextForLoops',
        'temporal:recordSnapshot',
        'behavioral:updateBaseline',
        'behavioral:recordPotentialSabotage',
        'coaching:updateLearningStyle',
        'selfAwareness:recordDistortions',
        'selfAwareness:recordSelfPerception',
      ])
    );
  });

  it('a crisis turn writes, embeds and asks a model nothing', async () => {
    await processSemanticIntelligence(turn(true));
    expect(hits).toEqual([]);
  });

  it('a turn with no crisis read counts as a crisis turn', async () => {
    await processSemanticIntelligence(turn(undefined));
    expect(hits).toEqual([]);
  });
});
