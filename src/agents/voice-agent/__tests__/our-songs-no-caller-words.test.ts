/**
 * "Our Songs" keeps no caller words, and MINOR_CARE holds it.
 *
 * Before this fix, a significant moment while music played (turn-learning.ts) kept 200 chars of
 * what the caller said as the song's `memorableQuote`, logged 50 chars of it at info, and Ferni
 * later said it back ("Remember when you said …?"). A held caller (under 18 by their own words)
 * got a song memory like anyone else. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lines = vi.hoisted(() => [] as unknown[]);
const logger = vi.hoisted(() => {
  const rec = (...args: unknown[]) => void lines.push(args);
  const l: Record<string, unknown> = { info: rec, warn: rec, debug: rec, error: rec, trace: rec };
  l.child = () => l;
  return l;
});
vi.mock('@livekit/agents', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  log: () => logger,
}));
vi.mock('../../../utils/safe-logger.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createLogger: () => logger,
}));
vi.mock('../index.js', () => ({ recordTrustSystemsData: vi.fn(async () => undefined) }));
vi.mock('../../../intelligence/context-builders/intelligence/temporal-intelligence.js', () => ({
  learnTemporalPattern: vi.fn(async () => undefined),
}));
vi.mock('../../../intelligence/context-builders/relationship/deep-relationship.js', () => ({
  recordSharedMoment: vi.fn(async () => undefined),
}));
vi.mock('../../../intelligence/capability-learning.js', () => ({
  onUserEngagedWithCapability: vi.fn(),
  getRecentlySurfacedDomains: vi.fn(() => []),
}));
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async () => null),
    recordImplicitPreference: vi.fn(async () => null),
  },
}));
vi.mock('../../../intelligence/index.js', async () => ({
  ...(await import('../../../intelligence/collective/integration.js')),
}));
const TRACK = { name: 'Harbor Lights', artist: 'The Synthetic Band', uri: 'spotify:track:syn1' };
vi.mock('../../../audio/music-player.js', () => ({
  getMusicPlayer: () => ({ getState: () => ({ isPlaying: true, currentTrack: TRACK }) }),
}));

import { recordAllLearningData, type LearningContext } from '../turn-learning.js';
import {
  checkForOurSong,
  getAllOurSongs,
  getOurSongsProfileForPersistence,
  getProactiveRememberWhen,
  loadOurSongsProfile,
  type OurSongsProfile,
} from '../../../services/trust-systems/our-songs.js';
import {
  bindSessionUser,
  heldAfter,
  resetMinorCare,
  writeHeld,
} from '../../../utils/minor-care.js';

/** A breakthrough ("i finally") while music plays; every 10-char piece of it is checked. */
const SAID = 'I finally told aunt Philippa about the Kilimanjaro sabbatical plan';
const FOURTEEN = "I'm 14 years old";

/** The 10-character pieces of SAID found in `blob` (case-insensitive). */
function leaks(blob: string): string[] {
  const said = SAID.toLowerCase();
  const text = blob.toLowerCase();
  const found: string[] = [];
  for (let i = 0; i + 10 <= said.length; i++) {
    if (text.includes(said.slice(i, i + 10))) found.push(said.slice(i, i + 10));
  }
  return found;
}

let n = 0;
function turn(userId: string, sessionId = `syn-session-${++n}`): LearningContext {
  return {
    userId,
    sessionId,
    personaId: 'ferni',
    turnCount: 6, // a multiple of 3 on a high-emotion turn: the Our Songs branch runs
    userText: SAID,
    emotionalResult: { primary: 'joy', intensity: 0.9, distressLevel: 0 },
    injections: [],
    turnResult: { emotional: { primary: 'joy', intensity: 0.9 }, context: {} },
  };
}

/** Everything Ferni could say about the song: each phrase the callback can pick, and the opener. */
function spoken(userId: string): { phrases: string[]; ssml: string[] } {
  const phrases: string[] = [];
  const ssml: string[] = [];
  const random = vi.spyOn(Math, 'random');
  try {
    for (const r of [0, 0.21, 0.41, 0.61, 0.81, 0.99]) {
      random.mockReturnValue(r);
      for (const song of getAllOurSongs(userId)) song.lastCallback = undefined; // no 24 h skip
      const callback = checkForOurSong(userId, TRACK.name, TRACK.artist);
      if (!callback) continue;
      phrases.push(callback.phrase);
      ssml.push(callback.ssml);
    }
    for (const song of getAllOurSongs(userId)) song.lastCallback = undefined;
    const opener = getProactiveRememberWhen(userId);
    if (opener) {
      phrases.push(opener.phrase);
      ssml.push(opener.ssml);
    }
  } finally {
    random.mockRestore();
  }
  return { phrases, ssml };
}

beforeEach(() => {
  lines.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('Our Songs keeps no caller words', () => {
  it('a moment leaves none of the sentence in the store, the logs or what Ferni says', async () => {
    const userId = `syn-songs-${++n}`;
    await recordAllLearningData(turn(userId));

    expect(getAllOurSongs(userId)).toHaveLength(1); // the moment really was learned
    expect(lines.length).toBeGreaterThan(0); // and logged
    const { phrases } = spoken(userId);
    expect(phrases.length).toBeGreaterThan(0); // and is spoken back

    expect(leaks(JSON.stringify(getOurSongsProfileForPersistence(userId)))).toEqual([]);
    expect(leaks(JSON.stringify(lines))).toEqual([]);
    expect(leaks(phrases.join(' | '))).toEqual([]);
  });

  it('the spoken line still works without a quote', async () => {
    const userId = `syn-songs-${++n}`;
    await recordAllLearningData(turn(userId));
    const { phrases, ssml } = spoken(userId);

    expect(phrases).toHaveLength(7); // six song callbacks and the proactive opener
    expect(new Set(phrases.slice(0, 6)).size).toBeGreaterThanOrEqual(4); // the varied lines
    for (const [i, phrase] of phrases.entries()) {
      expect(phrase.length).toBeGreaterThan(20);
      expect(phrase).not.toMatch(/you said/i);
      expect(ssml[i]).toContain(phrase);
    }
  });

  it('an old memory with a quote loads without it, and it is never said or kept', () => {
    const userId = `syn-songs-${++n}`;
    const song = {
      id: 'song_old',
      song: { name: TRACK.name, artist: TRACK.artist },
      moment: {
        timestamp: '2026-01-02T03:04:05.000Z',
        type: 'breakthrough',
        emotion: 'grateful',
        context: 'joy',
        memorableQuote: SAID,
      },
      significance: 'life_changing',
      callbackCount: 0,
      callbackReception: 'unknown',
      canSuggest: true,
    };
    const old = {
      userId,
      songs: [song],
      totalMoments: 1,
      preferences: { lovedGenres: [], lovedArtists: [], preferredMoods: [] },
      firstSong: song,
      mostMeaningful: song,
    } as unknown as OurSongsProfile;
    expect(leaks(JSON.stringify(old)).length).toBeGreaterThan(0); // the old doc held the words

    loadOurSongsProfile(userId, old);

    const kept = getOurSongsProfileForPersistence(userId);
    expect(kept?.songs).toHaveLength(1); // the memory itself survives
    expect(kept?.songs[0].moment.timestamp).toBeInstanceOf(Date);
    expect(JSON.stringify(kept)).not.toContain('memorableQuote');
    expect(leaks(JSON.stringify(kept))).toEqual([]);
    const { phrases } = spoken(userId);
    expect(phrases.length).toBeGreaterThan(0);
    expect(leaks(phrases.join(' | '))).toEqual([]);
  });
});

describe('MINOR_CARE: a held caller gets no song memory', () => {
  it('learns nothing while held, on that call or a later one inside the hold', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const userId = `syn-held-${++n}`;
    const sessionId = `syn-held-session-${n}`;
    bindSessionUser(sessionId, userId);
    heldAfter(sessionId, FOURTEEN, { userId });
    expect(writeHeld(userId, sessionId)).toBe(true);

    await recordAllLearningData(turn(userId, sessionId));
    expect(getAllOurSongs(userId)).toEqual([]);

    const later = `syn-held-later-${n}`;
    bindSessionUser(later, userId); // the next call, same user, hold still live
    await recordAllLearningData(turn(userId, later));
    expect(getAllOurSongs(userId)).toEqual([]);
    expect(spoken(userId).phrases).toEqual([]); // nothing to say back
  });

  it('an unheld caller with the flag on still gets the memory', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const userId = `syn-unheld-${++n}`;
    const sessionId = `syn-unheld-session-${n}`;
    bindSessionUser(sessionId, userId);
    await recordAllLearningData(turn(userId, sessionId));
    expect(getAllOurSongs(userId)).toHaveLength(1);
  });
});
