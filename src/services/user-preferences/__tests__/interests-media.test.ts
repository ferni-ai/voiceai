/**
 * Interests & hobbies and music & entertainment: capture, merge rules,
 * getInterests / getMediaProfile, listening-history precedence, DJ query resolution.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const store = await import('../store.js');
const { getInterests, parseInterestStatements, sanitizeDetails } = await import('../interests.js');
const {
  getMediaProfile,
  importListeningHistory,
  parseMediaStatements,
  resolveMusicQuery,
  resolveMusicQueryForUser,
} = await import('../media.js');
const { recordUserTurnPreferences } = await import('../inference.js');
const { buildPreferenceBlock } = await import('../context-block.js');

const U = 'user-i';

beforeEach(() => {
  fake = createFakeFirestore();
  store.clearPreferenceCache();
});

describe('interests & hobbies', () => {
  it('captures explicit interests with kind, level and specifics', () => {
    const [pottery] = parseInterestStatements(
      "I've gotten into pottery lately",
      'explicit',
      0.9,
      'c1'
    );
    expect(pottery).toMatchObject({
      domain: 'interests',
      key: 'interest:pottery',
      details: { kind: 'creative', level: 'regular' },
    });
    const [run] = parseInterestStatements("I'm training for a 10k", 'explicit', 0.9);
    expect(run).toMatchObject({
      key: 'interest:running',
      details: { kind: 'sport', level: 'serious', specifics: ['training for a 10k'] },
    });
    const [guitar] = parseInterestStatements('I play a 1998 Fender guitar', 'explicit', 0.9);
    expect(guitar.details?.specifics).toEqual(['plays a 1998 Fender guitar']);
    expect(parseInterestStatements("I've gotten into a fight", 'explicit', 0.9)).toEqual([]);
  });

  it('inferred interests need repeated mentions; mentions merge additively', async () => {
    const base = {
      domain: 'interests' as const,
      key: 'interest:chess',
      value: 'chess',
      source: 'inferred' as const,
      confidence: 0.5,
    };
    await store.upsertPreference(U, {
      ...base,
      conversationId: 'c1',
      details: { level: 'curious', specifics: ['learning the Sicilian'] },
    });
    expect(await getInterests(U)).toHaveLength(0);
    expect(await getInterests(U, { activeOnly: false })).toHaveLength(1);
    await store.upsertPreference(U, {
      ...base,
      conversationId: 'c2',
      details: {
        level: 'regular',
        specifics: ['plays online with Raj'],
        relatedPeople: [{ name: 'Raj', personId: 'p_raj' }],
      },
    });
    const [chess] = await getInterests(U);
    expect(chess).toMatchObject({
      name: 'chess',
      level: 'regular',
      active: true,
      relatedPeople: [{ name: 'Raj', personId: 'p_raj' }],
    });
    expect(chess.specifics).toEqual(['learning the Sicilian', 'plays online with Raj']);
    expect(chess.lastMentionedAt).toBeTruthy();
  });

  it('user edits to an interest win; automation only touches lastMentionedAt', async () => {
    const created = await store.upsertPreference(U, {
      domain: 'interests',
      key: 'interest:pottery',
      value: 'pottery',
      source: 'explicit',
      confidence: 0.9,
      details: { level: 'regular' },
    });
    const edited = await store.editPreference(U, created.preference!.id, {
      details: { level: 'casual', specifics: ['Tuesday class'] },
    });
    expect(edited.success).toBe(true);
    await store.upsertPreference(U, {
      domain: 'interests',
      key: 'interest:pottery',
      value: 'pottery',
      source: 'explicit',
      confidence: 0.9,
      conversationId: 'c3',
      details: { level: 'serious', specifics: ['bought a wheel'] },
    });
    const [p] = await getInterests(U);
    expect(p).toMatchObject({ level: 'casual', specifics: ['Tuesday class'], userEdited: true });
  });

  it('rejects malformed details', () => {
    expect(sanitizeDetails({ level: 'obsessed' })).toBeNull();
    expect(sanitizeDetails({ specifics: 'x' })).toBeNull();
    expect(sanitizeDetails({ relatedPeople: ['Mia', { name: 'Raj', personId: 'p1' }] })).toEqual({
      relatedPeople: [{ name: 'Mia' }, { name: 'Raj', personId: 'p1' }],
    });
  });

  it('liked activities become interests, and appear in the session block', async () => {
    await recordUserTurnPreferences(U, 'I love hiking', 'c1');
    const [hike] = await getInterests(U);
    expect(hike).toMatchObject({ name: 'hiking', kind: 'outdoors' });
    expect(buildPreferenceBlock(await store.listPreferences(U))).toContain(
      'Into (good conversation material): hiking'
    );
  });
});

describe('music & entertainment', () => {
  it('captures shows with progress, people, and music-mood associations', () => {
    const [show] = parseMediaStatements(
      "I'm on season 2 of Severance with my wife",
      'explicit',
      0.9,
      'c1'
    );
    expect(show).toMatchObject({
      domain: 'media',
      key: 'show:Severance',
      details: { status: 'watching', progress: 'season 2', relatedPeople: [{ name: 'wife' }] },
    });
    const [book] = parseMediaStatements("I'm on book 3 of the Dune series", 'explicit', 0.9);
    expect(book).toMatchObject({
      key: 'book:Dune',
      details: { progress: 'book 3', status: 'reading' },
    });
    const [mood] = parseMediaStatements('I listen to jazz when I work', 'explicit', 0.9);
    expect(mood).toMatchObject({ key: 'genre:jazz', details: { contexts: ['working'] } });
    const [song] = parseMediaStatements(
      'That song "Fast Car" always reminds me of my dad',
      'explicit',
      0.9
    );
    expect(song).toMatchObject({
      key: 'song:Fast Car',
      details: { relatedPeople: [{ name: 'dad' }] },
    });
  });

  it('explicit statements beat listening history; history beats nothing', async () => {
    await importListeningHistory(U, {
      artists: ['Radiohead', 'Taylor Swift'],
      genres: ['country'],
    });
    let profile = await getMediaProfile(U);
    expect(profile.music.favorites).toHaveLength(0);
    expect(profile.music.listeningHistory.map((i) => i.name).sort()).toEqual([
      'Radiohead',
      'Taylor Swift',
      'country',
    ]);
    expect(resolveMusicQuery(profile, 'music')).toBe('Radiohead');

    await recordUserTurnPreferences(U, "I can't stand country music", 'c1');
    await recordUserTurnPreferences(U, 'I really love jazz music', 'c1');
    await store.upsertPreference(U, {
      domain: 'media',
      key: 'genre:country',
      value: 'country',
      sentiment: 'dislike',
      source: 'explicit',
      confidence: 1,
    });
    await importListeningHistory(U, { genres: ['country'] });
    profile = await getMediaProfile(U);
    expect(profile.music.dislikes.map((i) => i.name)).toEqual(['country']);
    expect(profile.music.listeningHistory.map((i) => i.name)).not.toContain('country');
  });

  it('DJ resolution: mood associations > favourites > history, never a dislike, specific requests untouched', async () => {
    await store.upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      source: 'explicit',
      confidence: 1,
      details: { contexts: ['working'] },
    });
    await store.upsertPreference(U, {
      domain: 'media',
      key: 'artist:Phoebe Bridgers',
      value: 'Phoebe Bridgers',
      source: 'explicit',
      confidence: 1,
      userEdited: true,
    });
    await store.upsertPreference(U, {
      domain: 'media',
      key: 'genre:upbeat',
      value: 'upbeat',
      source: 'explicit',
      confidence: 1,
      details: { contexts: ['running'] },
    });
    await store.upsertPreference(U, {
      domain: 'media',
      key: 'genre:metal',
      value: 'metal',
      sentiment: 'dislike',
      source: 'explicit',
      confidence: 1,
      details: { contexts: ['running'] },
    });
    expect(await resolveMusicQueryForUser(U, 'music for working')).toBe('jazz');
    expect(await resolveMusicQueryForUser(U, '', 'running')).toBe('upbeat');
    expect(await resolveMusicQueryForUser(U, 'play something')).toBe('Phoebe Bridgers');
    expect(await resolveMusicQueryForUser(U, 'Bohemian Rhapsody')).toBeNull();
    expect(await resolveMusicQueryForUser(U, '', 'sleeping')).toBeNull();
    expect(await resolveMusicQueryForUser(undefined, 'music')).toBeNull();
  });

  it('getMediaProfile exposes in-progress entertainment for openers', async () => {
    await recordUserTurnPreferences(U, "I'm on season 2 of Severance", 'c1');
    await recordUserTurnPreferences(U, 'I just finished Shogun', 'c1');
    const profile = await getMediaProfile(U);
    expect(profile.inProgress.map((i) => `${i.name}:${i.progress}`)).toEqual([
      'Severance:season 2',
    ]);
    expect(profile.entertainment.map((i) => i.status).sort()).toEqual(['finished', 'watching']);
    expect(buildPreferenceBlock(await store.listPreferences(U))).toContain(
      'Currently into: Severance (season 2)'
    );
  });

  it('conversation cascade removes media learned only from that conversation', async () => {
    await recordUserTurnPreferences(U, "I'm on season 2 of Severance", 'c1');
    await importListeningHistory(U, { artists: ['Radiohead'] });
    await store.deletePreferencesFor(U, 'c1');
    const profile = await getMediaProfile(U);
    expect(profile.entertainment).toHaveLength(0);
    expect(profile.music.listeningHistory).toHaveLength(1);
  });
});
