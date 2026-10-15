/**
 * Talking to a teammate is not a life event (synthetic call, prod shape of 2026-10-13):
 * "Hey Jordan, can you help me do some planning" and "I'm going to talk to Jordan" were
 * stored as key moments ("Made a decision to talk to Jordan", heavy, followUpNeeded), and
 * the next call asked "did you ever talk to Jordan about those plans?". Every extractor
 * that heard those lines, and every reader of what was stored, is checked here. A real
 * person who shares a teammate's name still counts.
 */
import { describe, expect, it } from 'vitest';
import { ProactiveInsightEngine } from '../intelligence/proactive-insight-engine.js';
import { UserLearningEngine } from '../intelligence/user-learning-engine.js';
import { withoutTeammateMoments } from '../utils/teammate-talk.js';
import type { EmotionResult } from '../intelligence/detectors/emotion.js';
import type { IntentResult } from '../intelligence/intent-classifier.js';
import type { ConversationState } from '../intelligence/state/conversation.js';
import { withCallerProvenance } from '../memory/caller-assertions.js';
import { teammateNote } from '../memory/cross-persona/persona-memory-context.js';
import {
  extractCallbackKeyMoments,
  getPendingCallbacksFromProfile,
} from '../personality/callback-helpers.js';
import { callerCommitmentDocs } from '../services/superhuman/after-call-commitments.js';
import type { KeyMoment, UserProfile } from '../types/user-profile.js';

const TO_JORDAN = [
  'Hey Jordan, can you help me do some planning',
  "I'm going to talk to Jordan.",
  'Can I talk to Jordan?',
];

const analysis = (distressLevel: number) => ({
  emotion: {
    primary: 'neutral',
    valence: 'neutral',
    intensity: 0.5,
    distressLevel,
    confidence: 0.8,
    markers: [],
    suggestedTone: 'calm',
  } as unknown as EmotionResult,
  intent: { primary: 'asking_question', secondary: [], confidence: 0.8 } as unknown as IntentResult,
  state: { phase: 'exploring', turnCount: 5 } as unknown as ConversationState,
});

const profile = (keyMoments: KeyMoment[] = []) =>
  ({ id: 'u-synthetic', keyMoments, goals: [], pendingFollowUps: [] }) as unknown as UserProfile;

const moment = (summary: string, type: KeyMoment['type'] = 'decision'): KeyMoment => ({
  id: `km-${summary.length}`,
  timestamp: new Date(Date.now() - 2 * 86_400_000),
  type,
  summary,
  emotionalWeight: 'heavy',
  topics: [],
  followUpNeeded: true,
});

describe('the learning engine', () => {
  const momentsFrom = (line: string, distress = 0) => {
    const engine = new UserLearningEngine();
    engine.processUserTurn(line, analysis(distress), profile());
    return engine.finalizeSession(profile()).keyMoments;
  };

  it('records no key moment for speech to a teammate, even with high distress', () => {
    for (const line of TO_JORDAN) expect(momentsFrom(line, 0.9), line).toEqual([]);
  });

  it('still records the life news said to a teammate, and a friend with that name', () => {
    expect(momentsFrom("Hey Jordan, I've decided to quit my job.").map((m) => m.type)).toEqual([
      'decision',
    ]);
    expect(momentsFrom("I'm going to tell my friend Jordan I'm moving.")).toHaveLength(1);
  });

  it('refuses a key moment the model wrote about switching to a teammate', () => {
    const engine = new UserLearningEngine();
    engine.captureExternalKeyMoment(moment('Made a decision to talk to Jordan'));
    engine.captureExternalKeyMoment(moment('Decided to quit the bakery job'));
    expect(engine.finalizeSession(profile()).keyMoments.map((m) => m.summary)).toEqual([
      'Decided to quit the bakery job',
    ]);
  });
});

describe('callbacks ("the smile factor")', () => {
  it('extracts nothing from speech to a teammate', () => {
    for (const line of TO_JORDAN) expect(extractCallbackKeyMoments(line), line).toEqual([]);
  });

  it('still takes a hard talk with a real person who shares the name', () => {
    const [m] = extractCallbackKeyMoments('I need to talk to my sister Maya about the house.');
    expect(m?.type).toBe('decision');
  });

  it('never follows up on a moment stored before this, about switching to a teammate', () => {
    const stored = [
      moment('Made a decision to "I\'m going to talk to Jordan"'),
      moment('Expressed concern about "Hey Jordan, can you help me do some planning"', 'concern'),
      moment('Made a decision to "I\'m going to quit my job"'),
    ];
    expect(getPendingCallbacksFromProfile(profile(stored)).map((p) => p.moment.summary)).toEqual([
      'Made a decision to "I\'m going to quit my job"',
    ]);
  });
});

describe('the next call, from what was stored before this fix', () => {
  // the prod record's shape, synthetic words: a concern from five days ago
  const stored = () => [
    {
      ...moment(
        'Expressed concern about "Hey Jordan, can you help me do some planning"',
        'concern'
      ),
      timestamp: new Date(Date.now() - 5 * 86_400_000),
    },
    {
      ...moment('Expressed concern about "My sister Maya is in the hospital"', 'concern'),
      timestamp: new Date(Date.now() - 5 * 86_400_000),
    },
  ];

  it('the proactive opener asks about the real concern, never the teammate one', () => {
    const insights = new ProactiveInsightEngine('u-synthetic')
      .generateInsights({ ...profile(stored()), goals: [] } as UserProfile)
      .insights.map((i) => JSON.stringify(i));
    expect(insights.join(' ')).not.toMatch(/jordan/i);
    expect(insights.join(' ')).toMatch(/hospital/i);
  });

  it('the profile loads without the teammate moments, for every reader', () => {
    const loaded = withoutTeammateMoments(profile(stored()));
    expect(loaded.keyMoments.map((m) => m.summary)).toEqual([
      'Expressed concern about "My sister Maya is in the hospital"',
    ]);
  });
});

describe('after-call commitments', () => {
  it('"I\'m going to talk to Jordan" is not a plan to check in on', () => {
    const observation = (quote: string) => ({
      subjectKind: 'self',
      attribute: 'commitment',
      value: quote,
      confidence: 0.9,
      source: { quote },
      by: 'caller' as const,
    });
    const docs = callerCommitmentDocs(
      [observation("I'm going to talk to Jordan."), observation("I'm going to call my landlord.")],
      { userId: 'u', sessionId: 's', now: Date.parse('2026-10-14T12:00:00Z') }
    );
    expect(docs.map((d) => d.statement)).toEqual(["I'm going to call my landlord."]);
  });
});

describe('summary threads', () => {
  it('a thread about talking to a teammate is not kept as theirs', () => {
    const summary = withCallerProvenance(
      {
        mainTopics: [],
        keyPoints: [],
        followUpItems: ['Ask if they talked to Jordan about the plans'],
      },
      [
        {
          role: 'user',
          content:
            "Hey Jordan, can you help me do some planning. I'm going to talk to Jordan about plans.",
        },
      ]
    );
    expect(summary.followUpItems).toEqual([]);
  });
});

describe("a teammate's notes in another persona's prompt", () => {
  it('reads as what came up on their call with the teammate, not their own news', () => {
    const line = teammateNote({
      fromPersona: 'jordan',
      content: 'Planning a move in spring',
    } as never);
    expect(line).toBe(
      "- From the caller's call with your teammate Jordan: Planning a move in spring"
    );
  });
});
