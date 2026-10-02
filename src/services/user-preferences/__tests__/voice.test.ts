/**
 * Voice operations behind setPreference / getPreferences, and the account-settings bridge.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const profiles = new Map<string, { preferences: { verbosity: string; topicsToAvoid: string[] } }>();
vi.mock('../../../memory/index.js', () => ({
  getDefaultStore: () => ({
    getProfile: async (id: string) => profiles.get(id) ?? null,
    saveProfile: async (p: { userId?: string }) => {
      profiles.set('user-v', p as never);
    },
  }),
}));

const store = await import('../store.js');
const { setPreferenceFromVoice, describePreferencesForVoice } = await import('../voice.js');
const { syncAccountPreferences, applyPreferencesToAccountView, mirrorToUserProfile } =
  await import('../account-sync.js');

const U = 'user-v';

beforeEach(() => {
  fake = createFakeFirestore();
  store.clearPreferenceCache();
  profiles.clear();
});

describe('voice set / forget / describe', () => {
  it('"I prefer shorter answers" via statement, and typed calls', async () => {
    expect(await setPreferenceFromVoice(U, { statement: 'I prefer shorter answers' })).toContain(
      'short'
    );
    expect(await setPreferenceFromVoice(U, { type: 'nickname', value: 'Sam' })).toContain(
      "I'll call you Sam"
    );
    expect(await setPreferenceFromVoice(U, { type: 'avoid-topic', value: 'my dad' })).toContain(
      "won't bring up my dad"
    );
    expect(await setPreferenceFromVoice(U, { type: 'temperature', value: 'celsius' })).toContain(
      'Celsius'
    );
    const prefs = await store.listPreferences(U);
    expect(prefs.every((p) => p.userEdited && p.source === 'explicit')).toBe(true);
    expect(prefs.map((p) => p.key).sort()).toEqual([
      'avoidTopic:my dad',
      'preferredName',
      'responseLength',
      'temperatureUnit',
    ]);
  });

  it('a voice command beats an earlier conversational statement', async () => {
    await store.upsertPreference(U, {
      domain: 'conversation',
      key: 'preferredName',
      value: 'Samuel',
      source: 'explicit',
      confidence: 0.9,
    });
    await setPreferenceFromVoice(U, { type: 'nickname', value: 'Sam' });
    expect((await store.listPreferences(U))[0].value).toBe('Sam');
  });

  it('"what do you know about my preferences?" lists active items and admits hunches', async () => {
    await setPreferenceFromVoice(U, { type: 'nickname', value: 'Sam' });
    await setPreferenceFromVoice(U, { type: 'music', value: 'jazz' });
    await setPreferenceFromVoice(U, {
      type: 'show',
      value: 'Severance',
      detail: 'season 2',
      status: 'watching',
    });
    await store.upsertPreference(U, {
      domain: 'conversation',
      key: 'humor',
      value: 'lots',
      source: 'inferred',
      confidence: 0.4,
      conversationId: 'c1',
    });
    const said = await describePreferencesForVoice(U);
    expect(said).toContain('Name: Sam');
    expect(said).toContain('genre jazz');
    expect(said).toContain('show Severance (season 2, watching)');
    expect(said).toContain('still getting a feel for 1 other thing');
    expect(said).not.toContain('Humour');
  });

  it('"forget that I like jazz" deletes and tombstones', async () => {
    await setPreferenceFromVoice(U, { type: 'like', value: 'jazz', category: 'music' });
    const id = (await store.listPreferences(U))[0].id;
    expect(
      await setPreferenceFromVoice(U, { action: 'forget', statement: 'forget that I like jazz' })
    ).toContain('forgotten');
    expect(await store.listPreferences(U)).toHaveLength(0);
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${id}`)?.reason).toBe('voice_forget');
    expect(await setPreferenceFromVoice(U, { action: 'forget', value: 'opera' })).toContain(
      "don't have anything saved"
    );
  });

  it('handles unknown input and missing identity gently', async () => {
    expect(await setPreferenceFromVoice(U, {})).toContain(
      "I need to know what preference you're setting"
    );
    expect(await setPreferenceFromVoice(undefined, { type: 'nickname', value: 'Sam' })).toContain(
      'signed in'
    );
    expect(fake.store.size).toBe(0);
  });
});

describe('account settings bridge', () => {
  it('PUT /api/account/profile settings land in the profile; removed topics are deleted', async () => {
    await syncAccountPreferences(U, { verbosity: 'concise', topicsToAvoid: ['work', 'my ex'] });
    let prefs = await store.listPreferences(U);
    expect(prefs.map((p) => `${p.key}=${p.value}`).sort()).toEqual([
      'avoidTopic:my ex=my ex',
      'avoidTopic:work=work',
      'responseLength=short',
    ]);
    await syncAccountPreferences(U, { topicsToAvoid: ['work'] });
    prefs = await store.listPreferences(U);
    expect(prefs.map((p) => p.key).sort()).toEqual(['avoidTopic:work', 'responseLength']);
  });

  it('the account view and stored user profile reflect the preference profile', async () => {
    await setPreferenceFromVoice(U, { type: 'response-length', value: 'detailed' });
    await setPreferenceFromVoice(U, { type: 'avoid-topic', value: 'money' });
    expect(
      await applyPreferencesToAccountView(U, {
        verbosity: 'concise',
        topicsToAvoid: [],
        wantsProactiveAdvice: true,
      })
    ).toEqual({
      verbosity: 'storytelling',
      topicsToAvoid: ['money'],
      wantsProactiveAdvice: true,
    });
    profiles.set(U, { preferences: { verbosity: 'balanced', topicsToAvoid: [] } });
    await mirrorToUserProfile(U);
    expect(profiles.get(U)?.preferences).toEqual({
      verbosity: 'storytelling',
      topicsToAvoid: ['money'],
    });
  });
});
