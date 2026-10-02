/**
 * Preference profile store: precedence, user edits, tombstones, evidence
 * threshold, legacy migration, cascade and export hooks (fake Firestore).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const {
  upsertPreference,
  listPreferences,
  editPreference,
  deletePreference,
  forgetPreferenceByKey,
  deletePreferencesFor,
  deletePreferencesDerivedFromFact,
  deleteAllPreferences,
  exportPreferences,
  clearPreferenceCache,
} = await import('../store.js');
const { isActive, preferenceIdFor, decideMerge } = await import('../rules.js');

const U = 'user-1';
const prefPath = (id: string) => `bogle_users/${U}/preferences/${id}`;
const tombPath = (id: string) => `bogle_users/${U}/memory_tombstones/${id}`;

beforeEach(() => {
  fake = createFakeFirestore();
  clearPreferenceCache();
});

describe('ids', () => {
  it('is deterministic per (domain, key) and normalises list items', () => {
    expect(preferenceIdFor('likes', 'food:Sushi ')).toBe(preferenceIdFor('likes', 'food:sushi'));
    expect(preferenceIdFor('likes', 'food:jazz')).not.toBe(preferenceIdFor('media', 'genre:jazz'));
    expect(preferenceIdFor('conversation', 'responseLength')).toMatch(/^pref_[a-f0-9]{24}$/);
  });
});

describe('precedence', () => {
  it('re-learning the same preference upserts one doc and unions provenance', async () => {
    await upsertPreference(U, {
      domain: 'food',
      key: 'dish:sushi',
      value: 'sushi',
      source: 'inferred',
      confidence: 0.5,
      conversationId: 'c1',
    });
    const r = await upsertPreference(U, {
      domain: 'food',
      key: 'dish:Sushi',
      value: 'sushi',
      source: 'inferred',
      confidence: 0.5,
      conversationId: 'c2',
    });
    expect(r.outcome).toBe('reinforced');
    const prefs = await listPreferences(U);
    expect(prefs).toHaveLength(1);
    expect(prefs[0].sourceConversationIds).toEqual(['c1', 'c2']);
    expect(prefs[0].confidence).toBeCloseTo(0.75);
  });

  it('explicit beats inferred; inferred cannot overwrite explicit', async () => {
    await upsertPreference(U, {
      domain: 'conversation',
      key: 'responseLength',
      value: 'long',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c1',
    });
    const ex = await upsertPreference(U, {
      domain: 'conversation',
      key: 'responseLength',
      value: 'short',
      source: 'explicit',
      confidence: 0.9,
      conversationId: 'c2',
    });
    expect(ex.outcome).toBe('updated');
    const inf = await upsertPreference(U, {
      domain: 'conversation',
      key: 'responseLength',
      value: 'long',
      source: 'inferred',
      confidence: 0.99,
      conversationId: 'c3',
    });
    expect(inf.outcome).toBe('skipped_lower_precedence');
    const [p] = await listPreferences(U);
    expect(p.value).toBe('short');
    expect(p.source).toBe('explicit');
  });

  it('user edits beat explicit and inferred; agreeing automation only adds provenance', async () => {
    await upsertPreference(U, {
      domain: 'conversation',
      key: 'preferredName',
      value: 'Sam',
      source: 'explicit',
      confidence: 1,
      userEdited: true,
    });
    const ex = await upsertPreference(U, {
      domain: 'conversation',
      key: 'preferredName',
      value: 'Samuel',
      source: 'explicit',
      confidence: 0.9,
      conversationId: 'c1',
    });
    expect(ex.outcome).toBe('skipped_lower_precedence');
    const agree = await upsertPreference(U, {
      domain: 'conversation',
      key: 'preferredName',
      value: 'sam',
      source: 'inferred',
      confidence: 0.4,
      conversationId: 'c2',
    });
    expect(agree.outcome).toBe('reinforced');
    const [p] = await listPreferences(U);
    expect(p).toMatchObject({
      value: 'Sam',
      userEdited: true,
      confidence: 1,
      sourceConversationIds: ['c2'],
    });
  });

  it('editPreference marks userEdited and wins', async () => {
    const r = await upsertPreference(U, {
      domain: 'conversation',
      key: 'tone',
      value: 'formal',
      source: 'inferred',
      confidence: 0.9,
    });
    const edited = await editPreference(U, r.preference!.id, { value: 'warm and casual' });
    expect(edited.success).toBe(true);
    if (edited.success)
      expect(edited.data).toMatchObject({
        value: 'warm and casual',
        userEdited: true,
        source: 'explicit',
      });
    expect(fake.store.get(prefPath(r.preference!.id))?.editedAt).toBeTruthy();
    expect((await editPreference(U, 'pref_000000000000000000000000', { value: 'x' })).success).toBe(
      false
    );
  });

  it('rejects invalid input (unknown domain, closed vocabulary, unknown key)', async () => {
    expect(
      (
        await upsertPreference(U, {
          domain: 'nope' as never,
          key: 'x',
          value: 'y',
          source: 'explicit',
          confidence: 1,
        })
      ).outcome
    ).toBe('invalid');
    expect(
      (
        await upsertPreference(U, {
          domain: 'conversation',
          key: 'responseLength',
          value: 'huge',
          source: 'explicit',
          confidence: 1,
        })
      ).outcome
    ).toBe('invalid');
    expect(
      (
        await upsertPreference(U, {
          domain: 'likes',
          key: 'secrets:x',
          value: 'x',
          source: 'explicit',
          confidence: 1,
        })
      ).outcome
    ).toBe('invalid');
    expect(fake.store.size).toBe(0);
  });

  it('decideMerge is pure and restarts evidence when the value changes', () => {
    const now = '2026-10-02T00:00:00.000Z';
    const first = decideMerge(
      undefined,
      {
        domain: 'conversation',
        key: 'pace',
        value: 'slow',
        source: 'inferred',
        confidence: 0.5,
        conversationId: 'a',
      },
      'id',
      now
    );
    expect(first.kind).toBe('create');
    if (first.kind !== 'create') return;
    const next = decideMerge(
      first.next,
      {
        domain: 'conversation',
        key: 'pace',
        value: 'fast',
        source: 'inferred',
        confidence: 0.5,
        conversationId: 'b',
      },
      'id',
      now
    );
    expect(next.kind).toBe('replace');
    if (next.kind === 'replace') expect(next.next.sourceConversationIds).toEqual(['b']);
  });
});

describe('evidence threshold', () => {
  it('inferred needs two conversations or high confidence; explicit applies at once', async () => {
    const one = await upsertPreference(U, {
      domain: 'conversation',
      key: 'humor',
      value: 'lots',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c1',
    });
    expect(isActive(one.preference!)).toBe(false);
    const sameConv = await upsertPreference(U, {
      domain: 'conversation',
      key: 'humor',
      value: 'lots',
      source: 'inferred',
      confidence: 0.1,
      conversationId: 'c1',
    });
    expect(isActive(sameConv.preference!)).toBe(false);
    const two = await upsertPreference(U, {
      domain: 'conversation',
      key: 'humor',
      value: 'lots',
      source: 'inferred',
      confidence: 0.1,
      conversationId: 'c2',
    });
    expect(isActive(two.preference!)).toBe(true);

    const high = await upsertPreference(U, {
      domain: 'conversation',
      key: 'pace',
      value: 'slow',
      source: 'inferred',
      confidence: 0.9,
    });
    expect(isActive(high.preference!)).toBe(true);
    const explicit = await upsertPreference(U, {
      domain: 'conversation',
      key: 'directness',
      value: 'direct',
      source: 'explicit',
      confidence: 0.5,
    });
    expect(isActive(explicit.preference!)).toBe(true);
  });

  it('boundaries apply at a lower bar (err on the side of caution)', async () => {
    const b = await upsertPreference(U, {
      domain: 'boundaries',
      key: 'avoidTopic:my divorce',
      value: 'my divorce',
      source: 'inferred',
      confidence: 0.65,
    });
    expect(isActive(b.preference!)).toBe(true);
  });
});

describe('tombstones', () => {
  it('deleting tombstones the id; inference cannot bring it back; a user setting can', async () => {
    const r = await upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      sentiment: 'like',
      source: 'inferred',
      confidence: 0.7,
      conversationId: 'c1',
    });
    const id = r.preference!.id;
    expect(await deletePreference(U, id, 'user_deleted')).toBe(true);
    expect(fake.store.get(tombPath(id))).toMatchObject({
      reason: 'user_deleted',
      kind: 'preference',
    });

    const again = await upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      source: 'inferred',
      confidence: 0.9,
      conversationId: 'c2',
    });
    expect(again.outcome).toBe('skipped_tombstoned');
    const explicitAgain = await upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      source: 'explicit',
      confidence: 0.9,
    });
    expect(explicitAgain.outcome).toBe('skipped_tombstoned');

    const user = await upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      source: 'explicit',
      confidence: 1,
      userEdited: true,
    });
    expect(user.outcome).toBe('created');
    expect(fake.store.has(tombPath(id))).toBe(false);
  });

  it('forgetPreferenceByKey uses the canonical key and voice_forget reason', async () => {
    await upsertPreference(U, {
      domain: 'media',
      key: 'genre:jazz',
      value: 'jazz',
      source: 'explicit',
      confidence: 1,
    });
    expect(await forgetPreferenceByKey(U, 'media', 'genre:Jazz')).toBe(true);
    expect(fake.store.get(tombPath(preferenceIdFor('media', 'genre:jazz')))?.reason).toBe(
      'voice_forget'
    );
    expect(await listPreferences(U)).toHaveLength(0);
  });
});

describe('cascade and export hooks', () => {
  it('deletePreferencesFor strips the conversation; orphans are deleted + tombstoned; user edits survive', async () => {
    const a = await upsertPreference(U, {
      domain: 'food',
      key: 'dish:tacos',
      value: 'tacos',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c1',
    });
    const b = await upsertPreference(U, {
      domain: 'food',
      key: 'dish:ramen',
      value: 'ramen',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c1',
    });
    await upsertPreference(U, {
      domain: 'food',
      key: 'dish:ramen',
      value: 'ramen',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c2',
    });
    await upsertPreference(U, {
      domain: 'conversation',
      key: 'preferredName',
      value: 'Sam',
      source: 'explicit',
      confidence: 1,
      userEdited: true,
      conversationId: 'c1',
    });

    expect(await deletePreferencesFor(U, 'c1')).toBe(3);
    const left = await listPreferences(U, { fresh: true });
    expect(left.map((p) => p.value).sort()).toEqual(['Sam', 'ramen']);
    expect(left.find((p) => p.value === 'ramen')?.sourceConversationIds).toEqual(['c2']);
    expect(left.find((p) => p.value === 'Sam')?.sourceConversationIds).toEqual([]);
    expect(fake.store.get(tombPath(a.preference!.id))?.reason).toBe('conversation_deleted');
    expect(fake.store.has(tombPath(b.preference!.id))).toBe(false);
  });

  it('deletePreferencesDerivedFromFact follows fact provenance', async () => {
    await upsertPreference(U, {
      domain: 'likes',
      key: 'other:gardening',
      value: 'gardening',
      source: 'inferred',
      confidence: 0.6,
      factId: 'f1',
    });
    expect(await deletePreferencesDerivedFromFact(U, 'f1')).toBe(1);
    expect(await listPreferences(U, { fresh: true })).toHaveLength(0);
  });

  it('exportPreferences returns everything; deleteAllPreferences wipes the profile', async () => {
    await upsertPreference(U, {
      domain: 'practical',
      key: 'timeFormat',
      value: '24h',
      source: 'explicit',
      confidence: 1,
    });
    await upsertPreference(U, {
      domain: 'boundaries',
      key: 'avoidTopic:work',
      value: 'work',
      source: 'explicit',
      confidence: 1,
    });
    await upsertPreference('someone-else', {
      domain: 'practical',
      key: 'units',
      value: 'metric',
      source: 'explicit',
      confidence: 1,
    });
    const exported = await exportPreferences(U);
    expect(exported.preferences.map((p) => p.key).sort()).toEqual([
      'avoidTopic:work',
      'timeFormat',
    ]);
    expect(exported.exportedAt).toBeTruthy();
    expect(await deleteAllPreferences(U)).toBe(2);
    expect(await listPreferences(U, { fresh: true })).toHaveLength(0);
    expect(await listPreferences('someone-else')).toHaveLength(1);
  });
});

describe('legacy settings doc', () => {
  it('folds the old setPreference doc into the profile once', async () => {
    fake.store.set(prefPath('settings'), {
      nickname: 'Jo',
      temperatureUnit: 'celsius',
      customPreferences: { coffee: 'oat flat white' },
    });
    const prefs = await listPreferences(U);
    expect(prefs.map((p) => `${p.key}=${p.value}`).sort()).toEqual([
      'custom:coffee=oat flat white',
      'preferredName=Jo',
      'temperatureUnit=celsius',
    ]);
    expect(prefs.every((p) => p.userEdited)).toBe(true);
    expect(fake.store.get(prefPath('settings'))?.migratedToProfileAt).toBeTruthy();
  });
});
