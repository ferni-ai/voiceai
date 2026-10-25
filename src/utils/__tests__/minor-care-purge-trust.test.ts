/**
 * MINOR_CARE=on: the trust systems and personality resonance keep a caller's words in per-user
 * in-memory caches (a boundary's message, an inside joke, a life event's original text, the topics
 * they mentioned…). A held call's cleanup saves none of it, but the caches survived, and a later
 * call's cleanup (saveTrustProfiles, flushResonanceProfile) saved whatever a held caller said
 * before their age statement, or anything a write let through. purgeHeldUser now drops both for
 * the held user, and only for them.
 *
 * Each store runs for real; only Firestore-backed persistence is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => {
  const ref = (): Record<string, unknown> => ({
    collection: () => ({ doc: () => ref() }),
    get: async () => ({ exists: false, data: () => undefined }),
    set: async () => undefined,
  });
  return {
    Firestore: class {
      collection() {
        return { doc: () => ref() };
      }
    },
  };
});
vi.mock('../../services/persistence/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createPersistenceStore: () => ({
    load: async () => null,
    set: () => undefined,
    flush: async () => undefined,
  }),
}));
vi.mock('../../services/superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

import { purgeHeldUser } from '../../agents/voice-agent/minor-care-purge.js';
import {
  exportBoundaries,
  getPrematureAdviceRecords,
  importBoundaries,
  recordPrematureAdvice,
} from '../../services/trust-systems/boundary-memory.js';
import {
  exportGrowthProfile,
  importGrowthProfile,
} from '../../services/trust-systems/growth-reflection.js';
import {
  exportInsideJokesProfile,
  importInsideJokesProfile,
} from '../../services/trust-systems/inside-jokes.js';
import {
  exportSmallWinsProfile,
  importSmallWinsProfile,
} from '../../services/trust-systems/small-wins.js';
import {
  exportThinkingOfYouProfile,
  importThinkingOfYouProfile,
} from '../../services/trust-systems/thinking-of-you.js';
import {
  getMomentumProfile,
  recordWin,
} from '../../services/trust-systems/celebration-momentum.js';
import {
  getBaseline,
  recordVoiceSample,
} from '../../services/trust-systems/voice-prosody-learning.js';
import {
  getJournalingPatterns,
  recordResponse,
} from '../../services/trust-systems/journaling-prompts.js';
import {
  getSeasonalProfile,
  recordSeasonalData,
} from '../../services/trust-systems/seasonal-awareness.js';
import {
  getLearningProfile,
  recordLearningSignals,
} from '../../services/trust-systems/learning-style.js';
import {
  getMediaPreferences,
  updateMusicPreferences,
} from '../../services/trust-systems/media-suggestions.js';
import { getTimeline, setTimeline } from '../../services/trust-systems/sentiment-timeline.js';
import { getUserEvents, setUserEvents } from '../../services/trust-systems/life-events.js';
import {
  getCachedResonance,
  recordUserTopicMention,
} from '../../personas/shared/personality-resonance-store.js';
import { bindSessionUser, heldAfter, resetMinorCare, userHeld } from '../minor-care.js';

const SAID = 'my best friend Riley and I had a fight and I do not want to talk about it';
let n = 0;

/** A user whose session is bound (session start), flag on; hold() says "I'm 16 years old". */
function caller(): { userId: string; hold: () => void } {
  const userId = `user-trust-purge-${++n}`;
  const sessionId = `session-${userId}`;
  vi.stubEnv('MINOR_CARE', 'on');
  bindSessionUser(sessionId, userId);
  return { userId, hold: () => void heldAfter(sessionId, "I'm 16 years old", { userId }) };
}

/** What a later call's cleanup would save, per store (saveTrustProfiles skips a null). */
const kept = (userId: string): Record<string, boolean> => ({
  boundaries: exportBoundaries(userId) !== null,
  prematureAdvice: getPrematureAdviceRecords(userId).length > 0,
  growth: exportGrowthProfile(userId) !== null,
  insideJokes: exportInsideJokesProfile(userId) !== null,
  smallWins: exportSmallWinsProfile(userId) !== null,
  thinkingOfYou: exportThinkingOfYouProfile(userId) !== null,
  celebrationMomentum: getMomentumProfile(userId) !== null,
  voiceProsody: getBaseline(userId) !== null,
  journaling: getJournalingPatterns(userId) !== null,
  seasonal: getSeasonalProfile(userId) !== null,
  learningStyle: getLearningProfile(userId) !== null,
  mediaPreferences: getMediaPreferences(userId) !== null,
  sentimentTimeline: getTimeline(userId) !== null,
  lifeEvents: getUserEvents(userId).length > 0,
  resonance: getCachedResonance(userId) !== null,
});
const all = (value: boolean) => Object.fromEntries(Object.keys(kept('x')).map((k) => [k, value]));

/** The caller's words in every store, before their age statement (nothing held yet). */
async function fill(userId: string): Promise<void> {
  const at = new Date();
  importBoundaries({ userId, boundaries: [{ topic: 'friends', context: SAID }] } as never);
  recordPrematureAdvice(userId, 'talk to Riley', 'friends', 'withdrew' as never);
  importGrowthProfile({ userId, patterns: [], historicalResponses: [SAID] } as never);
  importInsideJokesProfile({ userId, moments: [{ content: SAID }] } as never);
  importSmallWinsProfile({ userId, wins: [{ description: SAID }] } as never);
  importThinkingOfYouProfile({ userId, significantShares: [{ content: SAID }] } as never);
  recordWin(userId, { type: 'social', description: SAID } as never);
  const voice = { pitchMean: 180, pitchRange: 40, energyMean: 0.5, speakingRate: 150 };
  for (let i = 0; i < 12; i++)
    recordVoiceSample(userId, voice as never, { conversationContext: SAID });
  for (let i = 0; i < 5; i++)
    recordResponse({ userId, promptId: `p${i}`, responseText: SAID, respondedAt: at } as never);
  recordSeasonalData(userId, { mood: 0.4, energy: 'low', context: SAID });
  recordLearningSignals(userId, SAID);
  updateMusicPreferences(userId, { favoriteArtists: ['Riley'] });
  setTimeline(userId, { userId, snapshots: [{ id: 's1', timestamp: at, note: SAID }] } as never);
  setUserEvents(userId, [{ id: 'e1', context: { mentionedAt: at, originalText: SAID } }] as never);
  await recordUserTopicMention(userId, 'fight with Riley');
}

afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE purge: trust systems and personality resonance', () => {
  it("drops every store for the held caller and none of another caller's", async () => {
    const a = caller();
    const b = caller();
    await fill(a.userId);
    await fill(b.userId);
    expect(kept(a.userId)).toEqual(all(true)); // the precondition: every store has their words
    a.hold();
    expect([userHeld(a.userId), userHeld(b.userId)]).toEqual([true, false]);
    purgeHeldUser(a.userId);
    expect(kept(a.userId)).toEqual(all(false));
    expect(kept(b.userId)).toEqual(all(true));
  });
});
