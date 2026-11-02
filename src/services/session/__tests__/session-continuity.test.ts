/**
 * There were two session-summary modules. Every live caller used the
 * session-context copy (null-safe, but it never wrote memory continuity); the
 * session/ copy wrote continuity but nothing called it, so continuity never
 * ran. Now there is one module: it keeps the null-safety, and never writes
 * memory continuity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const doc = {
    set: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ exists: false })),
    collection: () => ({ doc: () => doc }),
  };
  return { default: { firestore: () => ({ collection: () => ({ doc: () => doc }) }) } };
});
const writeSessionContinuity = vi.fn(async (_data: Record<string, unknown>) => ({
  threadsUpdated: 1,
  anchorsCreated: 1,
  capsuleUpdated: true,
  spannerAvailable: false,
}));
vi.mock('../../../memory/dynamic/memory-continuity.js', () => ({ writeSessionContinuity }));

const summaryModule = await import('../session-summary.js');
const { storeSessionSummary, clearAllSessionData, formatContextForVoiceCall, formatContextForApp } =
  summaryModule;
type Summary = import('../session-summary.js').VoiceSessionSummary;
type Context = import('../session-summary.js').ActiveUserContext;

const summary: Summary = {
  sessionId: 's1',
  userId: 'u1',
  startedAt: new Date('2026-10-11T12:00:00Z'),
  endedAt: new Date('2026-10-11T12:05:00Z'),
  durationSeconds: 300,
  personasEngaged: ['ferni'],
  mainTopics: ['work stress'],
  naturalSummary: 'Talked through a hard week at work',
  insightsGenerated: [
    { type: 'pattern', content: 'Mondays are hardest', confidence: 0.8, timestamp: new Date() },
  ],
  unfinishedTopics: ['sleep'],
  commitmentsMade: ['walk at lunch'],
  emotionalArc: [{ timestamp: new Date(), emotion: 'anxious', intensity: 0.7 }],
  endingEmotionalState: 'calmer',
  wasSignificant: true,
  significanceScore: 0.7,
};

beforeEach(() => {
  clearAllSessionData();
  writeSessionContinuity.mockClear();
});

describe('storeSessionSummary and memory continuity', () => {
  it('no continuity write', async () => {
    await storeSessionSummary(summary);
    expect(writeSessionContinuity).not.toHaveBeenCalled();
  });
});

describe('the merged module keeps the live copy null-safety', () => {
  // A context rebuilt from an old Firestore doc: no arrays, no endedAt, no emotion.
  const sparse = {
    userId: 'u1',
    lastInteractionType: 'voice',
    lastInteractionAt: new Date(),
    unfinishedBusiness: [],
    lastVoiceSession: { sessionId: 's0', naturalSummary: 'old call' },
    appBrowsingContext: { currentScreen: 'home' },
  } as unknown as Context;

  it('formats it for a voice call and for the app without throwing', () => {
    expect(() => formatContextForVoiceCall(sparse)).not.toThrow();
    expect(formatContextForApp(sparse)).toMatchObject({
      pendingTopics: [],
      emotionalState: 'neutral',
    });
  });
});
