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
import { lifeMoments } from '../utils/teammate-talk.js';
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
  "I'm going to talk to Jordan about my birthday party.",
  'I need to talk to Jordan about the trip',
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

  it('records news about someone they know, named the way people name a partner or child', () => {
    for (const line of [
      'Alex left me.',
      'Alex has cancer.',
      'Jordan lost his job.',
      'Peter cheated on me.',
      "I'm worried about Alex.",
      "I'm scared Peter will leave.",
      'I miss Peter so much.',
      'I talked to Maya, she is pregnant.',
      'I spoke with Peter and he wants a divorce.',
      'I have to tell Peter I lost my job.',
      "I'm going to visit Peter in the hospital.",
    ]) {
      const moments = momentsFrom(line, 0.9);
      expect(moments, line).toHaveLength(1);
      // and every reader keeps it
      expect(lifeMoments(moments), line).toHaveLength(1);
    }
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

  it('every keyMoments reader sees only life moments, and nothing is deleted', () => {
    const p = profile(stored());
    expect(lifeMoments(p.keyMoments).map((m) => m.summary)).toEqual([
      'Expressed concern about "My sister Maya is in the hospital"',
    ]);
    expect(p.keyMoments).toHaveLength(2);
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

/**
 * Verifier round 4 (2026-10-16): with Jordan the persona on the call, summary threads that
 * make Jordan the subject ("Has Jordan helped with the planning?") passed every wording
 * rule, because "Jordan has/was/got" also reads as a friend's news. The call's own
 * evidence decides: a teammate who spoke as themself, or was spoken to, was on the call.
 */
describe('a teammate who was on this call', () => {
  const CALL = [
    { role: 'user', content: "I'm going to talk to Jordan." },
    { role: 'assistant', content: "Hi, I'm Jordan. What are we planning?" },
    { role: 'user', content: 'Hey Jordan, can you help me do some planning' },
    { role: 'assistant', content: 'Of course. Where to?' },
    { role: 'user', content: 'My trip to Denver in May' },
  ];
  const SIX = [
    'Has Jordan helped with the planning?',
    'Did Jordan plan the trip to Denver?',
    'Follow up with Jordan on the trip',
    'Jordan was going to help plan the Denver trip',
    'Jordan has the Denver trip plan',
    'Check whether Jordan got the trip to Denver together',
  ];

  it('is never a thread, key point, follow-up or topic of theirs, however it is worded', () => {
    const summary = withCallerProvenance(
      {
        mainTopics: ['Planning with Jordan', 'Trip to Denver'],
        keyPoints: SIX,
        questionsRemaining: SIX,
        followUpItems: [...SIX, 'Ask about the trip to Denver in May'],
      },
      CALL
    );
    expect(summary.keyPoints).toEqual([]);
    expect(summary.questionsRemaining).toEqual([]);
    expect(summary.followUpItems).toEqual(['Ask about the trip to Denver in May']);
    expect(summary.mainTopics).toEqual(['Trip to Denver']);
    for (const item of SIX) expect(summary.assistantRaisedItems).toContain(item);
  });

  it('still counts someone they know by that name, said as theirs', () => {
    const summary = withCallerProvenance(
      { mainTopics: ["Jordan's wedding", 'Their sister Jordan moving'], keyPoints: [] },
      [
        ...CALL,
        { role: 'user', content: "My sister Jordan is moving, and Jordan's wedding is soon" },
      ]
    );
    expect(summary.mainTopics).toEqual(["Jordan's wedding", 'Their sister Jordan moving']);
  });

  it('changes nothing when that teammate was not on the call', () => {
    const summary = withCallerProvenance({ mainTopics: ['Jordan got a new job'], keyPoints: [] }, [
      { role: 'user', content: 'Jordan got a new job and I am happy for him' },
    ]);
    expect(summary.mainTopics).toEqual(['Jordan got a new job']);
  });

  const momentsAfter = (assistant: string | null, line: string) => {
    const engine = new UserLearningEngine();
    if (assistant) engine.processAssistantTurn(assistant);
    engine.processUserTurn(line, analysis(0.9), profile());
    return engine.finalizeSession(profile()).keyMoments;
  };

  it('gives the distress fallback no concern for a line naming them', () => {
    for (const line of [
      'Jordan will help me plan the wedding',
      'Jordan please help me plan all of this',
    ]) {
      expect(momentsAfter("Hi, I'm Jordan.", line), line).toEqual([]);
    }
  });

  it('leaves the fallback for their own news, and for that name when the teammate is not there', () => {
    expect(momentsAfter("Hi, I'm Jordan.", 'My mom is in the hospital again')).toHaveLength(1);
    expect(momentsAfter(null, 'Jordan will help me plan the wedding')).toHaveLength(1);
  });
});
