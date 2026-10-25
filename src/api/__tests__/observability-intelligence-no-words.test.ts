/**
 * GET /api/observability/intelligence must never show anyone's words.
 *
 * Community insights are one shared store (Firestore community_insights/global).
 * Before this fix the endpoint served, to ANY signed-in caller, 100 chars of
 * prompt-context text as `topBreakthroughQuestions[].pattern` (text that can carry
 * another caller's memories) plus free-text topics. This test goes through the real
 * route and the real auth middleware (only the Firebase token check is faked).
 * All data is synthetic.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

vi.mock('../../services/identity/firebase-auth.js', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  const users: Record<string, { uid: string; admin: boolean }> = {
    'tok-A': { uid: 'synthetic-alice-uid-A1', admin: false },
    'tok-ADMIN': { uid: 'synthetic-admin-uid-Z9', admin: true },
  };
  return {
    ...actual,
    claimsFirebaseIssuer: () => false,
    verifyFirebaseToken: async (t: string) =>
      users[t]
        ? {
            uid: users[t].uid,
            emailVerified: true,
            isAnonymous: false,
            claims: users[t].admin ? { admin: true } : {},
          }
        : null,
  };
});

import { handleObservabilityRoutes } from '../observability-routes.js';
import {
  getCommunityInsights,
  resetCommunityInsights,
  type CommunityResponsePattern,
  type EffectiveQuestion,
  type StoryResonance,
} from '../../intelligence/collective/community-insights.js';
import { QUESTION_SHAPES } from '../../intelligence/collective/community-labels.js';

// Distinctive synthetic phrases: caller B's memories/replies, and caller A's own
const B_PHRASES = ['zanzibarquokka', 'bankruptcylawyer', 'marmaladeheron', 'tangerinewalrus'];
const A_PHRASES = ['periwinkleotter', 'cobaltpangolin'];
const ALL_PHRASES = [...B_PHRASES, ...A_PHRASES];

function seed(): void {
  resetCommunityInsights();
  const insights = getCommunityInsights();

  // A live write the way the old turn-learning call did it: prompt text as the
  // "question", the caller's reply as the context, free text as the topic
  insights.recordBreakthroughQuestion(
    'Bob mentioned his divorce lawyer zanzibarquokka last week - how is that going for you now?',
    'ferni',
    'bankruptcylawyer',
    'user B said: i finally get it marmaladeheron',
    0.9
  );
  insights.recordBreakthroughQuestion(
    'Your sister periwinkleotter said what would feel like a win?',
    'ferni',
    'cobaltpangolin',
    'conversation',
    0.8
  );

  // Rows saved to Firestore before this fix, as importInsights() loads them at startup
  const now = new Date();
  const legacyQuestion: EffectiveQuestion = {
    questionPattern: 'How did the tangerinewalrus appointment go?',
    topic: 'tangerinewalrus',
    personaId: 'maya',
    avgBreakthroughRate: 1,
    avgEngagementLift: 0.7,
    bestContexts: ['i finally see it now marmaladeheron'],
    sampleSize: 12,
    lastUpdated: now,
  };
  const legacyPattern: CommunityResponsePattern = {
    id: 'pattern_sad_zanzibarquokka_friend_ferni',
    context: { userEmotion: 'sad', topic: 'zanzibarquokka', personaId: 'ferni' },
    strategies: [
      {
        type: 'empathy',
        avgEngagement: 0.8,
        avgDepthening: 0.5,
        avgPositiveShift: 0.4,
        sampleSize: 20,
        confidenceScore: 0.7,
      },
    ],
    bestStrategy: 'empathy',
    improvementOverBaseline: 0.1,
    lastUpdated: now,
    totalSamples: 20,
    minimumSamplesRequired: 10,
  };
  const legacyStory: StoryResonance = {
    storyId: 'ferni-story-garden',
    personaId: 'ferni',
    overallEffectiveness: 0.9,
    byRelationshipStage: { friend: 0.9 },
    byTopic: { bankruptcylawyer: 0.9 },
    byUserEmotion: { sad: 0.9 },
    userReactions: { moved: 3, inspired: 0, connected: 1, curious: 0, indifferent: 0 },
    bestContexts: ['bankruptcylawyer'],
    sampleSize: 4,
    lastUpdated: now,
  };
  const existing = insights.exportInsights();
  insights.importInsights({
    effectiveQuestions: [...existing.effectiveQuestions, legacyQuestion],
    patterns: [legacyPattern],
    storyResonance: [legacyStory],
  });
}

let server: http.Server;
let base = '';

beforeAll(async () => {
  seed();
  server = http.createServer((req, res) => {
    void handleObservabilityRoutes(req, res, new URL(req.url || '/', 'http://x').pathname);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  resetCommunityInsights();
  await new Promise<void>((r) => {
    server.close(() => r());
  });
});

async function get(token: string): Promise<{ status: number; text: string; body: any }> {
  const r = await fetch(`${base}/api/observability/intelligence`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  return { status: r.status, text, body: JSON.parse(text) };
}

describe('GET /api/observability/intelligence shows no one’s words', () => {
  it('a signed-in non-admin gets totals only, with none of their own or anyone else’s words', async () => {
    const { status, text, body } = await get('tok-A');
    expect(status).toBe(200);
    // The store really holds rows, so an empty answer is not why the words are missing
    expect(body.communityInsights.totalEffectiveQuestions).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('topBreakthroughQuestions');
    expect(body).not.toHaveProperty('topResonatingStories');
    expect(body).not.toHaveProperty('topResponsePatterns');
    for (const phrase of ALL_PHRASES) expect(text).not.toContain(phrase);
  });

  it('an admin gets the top lists, as labels, still with none of anyone’s words', async () => {
    const { status, text, body } = await get('tok-ADMIN');
    expect(status).toBe(200);
    expect(body.topBreakthroughQuestions.length).toBeGreaterThan(0);
    for (const q of body.topBreakthroughQuestions) {
      expect(QUESTION_SHAPES).toContain(q.pattern);
      expect(q.topic).toBe('general');
    }
    for (const phrase of ALL_PHRASES) expect(text).not.toContain(phrase);
  });

  it('the shared store itself (what gets saved to Firestore) holds none of the words', () => {
    const saved = JSON.stringify(getCommunityInsights().exportInsights());
    for (const phrase of ALL_PHRASES) expect(saved).not.toContain(phrase);
  });

  it('refuses a caller who is not signed in', async () => {
    const r = await fetch(`${base}/api/observability/intelligence`);
    expect([401, 403]).toContain(r.status);
  });
});
