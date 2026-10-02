/**
 * Identity merge: an anonymous identity's memory moves into the signed-in
 * account completely, exactly once, and the anonymous identity redirects.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { factIdFor } from '../../../memory/dynamic/fact-identity.js';
import { mergeFactDocs } from '../identity-merge-collections.js';
import { mergeIdentityInto } from '../identity-merge.js';
import { clearRedirectCache, resolveIdentityRedirect } from '../identity-redirect.js';
import { MemoryFirestore } from './memory-firestore.js';

const ANON = 'anonUid123';
const ACCOUNT = 'accountUid456';
const U = (id: string) => `bogle_users/${id}`;

function seedAnonymous(db: MemoryFirestore): void {
  db.put(U(ANON), { id: ANON, name: 'Sam', totalConversations: 2, createdAt: '2026-01-01' });
  db.put(`${U(ANON)}/conversations/c1`, { startedAt: '2026-09-01', summarized: true });
  db.put(`${U(ANON)}/conversations/c1/turns/t1`, { role: 'user', text: 'hi', turnNumber: 1 });
  db.put(`${U(ANON)}/conversations/c1/turns/t2`, {
    role: 'assistant',
    text: 'hello Sam',
    turnNumber: 2,
  });
  // Turns under a conversation doc that was never written itself.
  db.put(`${U(ANON)}/conversations/c2/turns/t1`, { role: 'user', text: 'orphan', turnNumber: 1 });
  db.put(`${U(ANON)}/conversation_threads/th1`, { updatedAt: 1 });
  db.put(`${U(ANON)}/conversation_threads/th1/messages/m1`, { text: 'thread msg' });
  db.put(`${U(ANON)}/summaries/s1`, { summary: 'talked about hiking' });
  db.put(`${U(ANON)}/dynamic_entities/e1`, { name: 'Max', type: 'person' });
  db.put(`${U(ANON)}/dynamic_relationships/r1`, { source: 'Sam', target: 'Max' });
  db.put(`${U(ANON)}/dynamic_facts/${factIdFor({ subject: 'Sam', predicate: 'dog' })}`, {
    subject: 'Sam',
    predicate: 'dog',
    text: 'Has a dog named Max',
    sourceConversationIds: ['c1'],
    updatedAt: '2026-09-01T00:00:00Z',
    userEdited: false,
  });
  db.put('vectors/v1', { content: 'summary', metadata: { userId: ANON, type: 'summary' } });
  db.put('vectors/v2', { content: 'other', metadata: { userId: 'someoneElse' } });
}

describe('mergeIdentityInto', () => {
  let db: MemoryFirestore;
  beforeEach(() => {
    db = new MemoryFirestore();
    clearRedirectCache();
    seedAnonymous(db);
  });

  it('moves every memory layer into the account and leaves a redirect', async () => {
    db.put(U(ACCOUNT), {
      id: ACCOUNT,
      name: 'Friend',
      totalConversations: 3,
      createdAt: '2026-02-01',
    });

    const result = await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    expect(result.success && result.data.status).toBe('complete');

    expect(db.read(`${U(ACCOUNT)}/conversations/c1`)).toMatchObject({ startedAt: '2026-09-01' });
    expect(db.list(`${U(ACCOUNT)}/conversations/c1/turns`)).toHaveLength(2);
    expect(db.read(`${U(ACCOUNT)}/conversations/c2/turns/t1`)).toMatchObject({ text: 'orphan' });
    expect(db.read(`${U(ACCOUNT)}/conversation_threads/th1/messages/m1`)).toBeDefined();
    expect(db.read(`${U(ACCOUNT)}/summaries/s1`)).toBeDefined();
    expect(db.read(`${U(ACCOUNT)}/dynamic_entities/e1`)).toBeDefined();
    expect(db.read(`${U(ACCOUNT)}/dynamic_relationships/r1`)).toBeDefined();
    expect(db.list(`${U(ACCOUNT)}/dynamic_facts`)).toHaveLength(1);
    expect(db.read('vectors/v1')).toMatchObject({ metadata: { userId: ACCOUNT } });
    expect(db.read('vectors/v2')).toMatchObject({ metadata: { userId: 'someoneElse' } });

    // Nothing left behind under the anonymous identity except its marker.
    expect([...db.docs.keys()].filter((p) => p.startsWith(`${U(ANON)}/`))).toEqual([]);
    expect(db.read(U(ANON))).toMatchObject({ mergedInto: ACCOUNT, mergeStatus: 'complete' });
    expect(db.read(`${U(ACCOUNT)}/linked_identities/${ANON}`)).toMatchObject({
      sourceId: ANON,
      reason: 'anonymous_upgrade',
      status: 'complete',
    });
    // Profile: real name fills the placeholder, conversation counts add up.
    expect(db.read(U(ACCOUNT))).toMatchObject({ name: 'Sam', totalConversations: 5 });
  });

  it('creates the account profile from the anonymous one when the account is new', async () => {
    await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    const profile = db.read(U(ACCOUNT));
    expect(profile).toMatchObject({ id: ACCOUNT, name: 'Sam', totalConversations: 2 });
    expect(profile?.mergedInto).toBeUndefined();
    expect(profile?.linkedIdentifiers).toContain(ANON);
  });

  it('is idempotent: running again changes nothing and never double-counts', async () => {
    db.put(U(ACCOUNT), { id: ACCOUNT, name: 'Ana', totalConversations: 3 });
    await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    const before = new Map(db.docs);
    const again = await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    expect(again.success && again.data.profileMerged).toBe(false);
    expect(db.read(U(ACCOUNT))).toMatchObject({ name: 'Ana', totalConversations: 5 });
    for (const [path, data] of before) {
      if (path.includes('linked_identities')) continue; // updatedAt moves
      expect(db.read(path)).toEqual(data);
    }
  });

  it('resumes after a crash mid-merge without losing or duplicating anything', async () => {
    for (let i = 0; i < 5; i++) db.put(`${U(ANON)}/summaries/x${i}`, { summary: `s${i}` });
    db.failAfterCommits(3);
    const first = await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    expect(first.success).toBe(false);
    expect(db.read(U(ANON))).toMatchObject({ mergedInto: ACCOUNT, mergeStatus: 'in_progress' });

    db.failAfterCommits(Infinity);
    const second = await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    expect(second.success && second.data.status).toBe('complete');
    expect(db.list(`${U(ACCOUNT)}/summaries`)).toHaveLength(6);
    expect(db.list(`${U(ACCOUNT)}/conversations/c1/turns`)).toHaveLength(2);
    expect(db.read(U(ACCOUNT))).toMatchObject({ totalConversations: 2 });
  });

  it('two sessions merging the same pair at once end in the same state as one', async () => {
    const fs = db.asFirestore();
    const req = { sourceId: ANON, targetId: ACCOUNT, reason: 'anonymous_upgrade' as const };
    const results = await Promise.all([mergeIdentityInto(fs, req), mergeIdentityInto(fs, req)]);
    expect(results.every((r) => r.success)).toBe(true);
    expect(db.list(`${U(ACCOUNT)}/conversations/c1/turns`)).toHaveLength(2);
    expect(db.list(`${U(ACCOUNT)}/dynamic_facts`)).toHaveLength(1);
    expect(
      db.read(`${U(ACCOUNT)}/dynamic_facts/${factIdFor({ subject: 'Sam', predicate: 'dog' })}`)
    ).toMatchObject({
      sourceConversationIds: ['c1'],
    });
    expect([...db.docs.keys()].filter((p) => p.startsWith(`${U(ANON)}/`))).toEqual([]);
  });

  it('refuses when another account already claimed the anonymous identity', async () => {
    await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    const other = await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: 'intruderUid789',
      reason: 'anonymous_upgrade',
    });
    expect(other.success).toBe(false);
    expect(!other.success && other.error.code).toBe('claimed_by_other_account');
    expect(db.read(U('intruderUid789'))).toBeUndefined();
  });

  it('refuses per-session identities, self-merges and device targets', async () => {
    const fs = db.asFirestore();
    const bad = await Promise.all([
      mergeIdentityInto(fs, {
        sourceId: 'session-job-1',
        targetId: ACCOUNT,
        reason: 'anonymous_upgrade',
      }),
      mergeIdentityInto(fs, {
        sourceId: 'anon:1700000000',
        targetId: ACCOUNT,
        reason: 'anonymous_upgrade',
      }),
      mergeIdentityInto(fs, { sourceId: ACCOUNT, targetId: ACCOUNT, reason: 'anonymous_upgrade' }),
      mergeIdentityInto(fs, {
        sourceId: ANON,
        targetId: 'device:abc12345',
        reason: 'device_claim',
      }),
    ]);
    expect(bad.map((r) => (r.success ? 'ok' : r.error.code))).toEqual([
      'invalid_identity',
      'invalid_identity',
      'same_identity',
      'invalid_identity',
    ]);
  });

  it('skips facts the account owner deleted (tombstoned) and merges same-id facts', async () => {
    const dogId = factIdFor({ subject: 'Sam', predicate: 'dog' });
    const cityId = factIdFor({ subject: 'Sam', predicate: 'city' });
    db.put(`${U(ANON)}/dynamic_facts/${cityId}`, {
      subject: 'Sam',
      predicate: 'city',
      text: 'Lives in Austin',
    });
    db.put(`${U(ACCOUNT)}/memory_tombstones/${cityId}`, { reason: 'user_deleted' });
    db.put(`${U(ACCOUNT)}/dynamic_facts/${dogId}`, {
      subject: 'Sam',
      predicate: 'dog',
      text: 'Has a dog called Maxie',
      userEdited: true,
      editedAt: '2026-08-01T00:00:00Z',
      sourceConversationIds: ['c0'],
      updatedAt: '2026-08-01T00:00:00Z',
    });

    await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });

    expect(db.read(`${U(ACCOUNT)}/dynamic_facts/${cityId}`)).toBeUndefined();
    expect(db.read(`${U(ACCOUNT)}/dynamic_facts/${dogId}`)).toMatchObject({
      text: 'Has a dog called Maxie',
      userEdited: true,
      sourceConversationIds: ['c0', 'c1'],
    });
  });

  it('re-keys legacy random-id facts by their deterministic id', async () => {
    db.put(`${U(ANON)}/dynamic_facts/randomAutoId`, {
      entityName: 'Sam',
      key: 'job',
      value: 'nurse',
      sessionId: 'conv9',
    });
    await mergeIdentityInto(db.asFirestore(), {
      sourceId: ANON,
      targetId: ACCOUNT,
      reason: 'anonymous_upgrade',
    });
    const jobId = factIdFor({ subject: 'Sam', predicate: 'job' });
    expect(db.read(`${U(ACCOUNT)}/dynamic_facts/${jobId}`)).toMatchObject({
      value: 'nurse',
      sourceConversationIds: ['conv9'],
    });
  });
});

describe('mergeFactDocs', () => {
  const base = { subject: 's', predicate: 'p' };

  it('keeps the newest text when neither side was edited, unioning provenance', () => {
    const merged = mergeFactDocs(
      {
        ...base,
        text: 'new',
        updatedAt: '2026-09-02',
        sourceConversationIds: ['b', 'c'],
        firstSeenAt: '2026-09-01',
      },
      {
        ...base,
        text: 'old',
        updatedAt: '2026-08-01',
        sourceConversationIds: ['a', 'b'],
        firstSeenAt: '2026-07-01',
      }
    );
    expect(merged).toMatchObject({
      text: 'new',
      sourceConversationIds: ['a', 'b', 'c'],
      firstSeenAt: '2026-07-01',
      updatedAt: '2026-09-02',
    });
  });

  it('a user-edited version beats a newer automated one, from either side', () => {
    const edited = {
      ...base,
      text: 'mine',
      userEdited: true,
      editedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const auto = { ...base, text: 'extracted', userEdited: false, updatedAt: '2026-09-09' };
    expect(mergeFactDocs(auto, edited)).toMatchObject({ text: 'mine', userEdited: true });
    expect(mergeFactDocs(edited, auto)).toMatchObject({ text: 'mine', userEdited: true });
  });

  it('between two user edits, the latest edit wins', () => {
    const older = { ...base, text: 'first edit', userEdited: true, editedAt: '2026-02-01' };
    const newer = { ...base, text: 'second edit', userEdited: true, editedAt: '2026-03-01' };
    expect(mergeFactDocs(older, newer).text).toBe('second edit');
    expect(mergeFactDocs(newer, older).text).toBe('second edit');
  });
});

describe('resolveIdentityRedirect', () => {
  beforeEach(() => clearRedirectCache());

  it('follows a merged anonymous identity to its account', async () => {
    const db = new MemoryFirestore();
    db.put(U(ANON), { mergedInto: ACCOUNT, mergeStatus: 'complete', mergedAt: 'x' });
    await expect(resolveIdentityRedirect(db.asFirestore(), ANON)).resolves.toEqual({
      userId: ACCOUNT,
      redirectedFrom: ANON,
      mergeComplete: true,
    });
  });

  it('reports an unfinished merge so callers can resume it', async () => {
    const db = new MemoryFirestore();
    db.put(U(ANON), { mergedInto: ACCOUNT, mergeStatus: 'in_progress' });
    const r = await resolveIdentityRedirect(db.asFirestore(), ANON);
    expect(r).toMatchObject({ userId: ACCOUNT, mergeComplete: false });
  });

  it('leaves unmerged identities and missing Firestore alone', async () => {
    const db = new MemoryFirestore();
    db.put(U(ACCOUNT), { name: 'Ana' });
    await expect(resolveIdentityRedirect(db.asFirestore(), ACCOUNT)).resolves.toEqual({
      userId: ACCOUNT,
      mergeComplete: true,
    });
    await expect(resolveIdentityRedirect(null, ANON)).resolves.toEqual({
      userId: ANON,
      mergeComplete: true,
    });
  });
});
