/**
 * Session identity resolution: memory is never keyed by a per-session id,
 * merged anonymous identities resolve to their account, and a device's earlier
 * memory follows the account that first presents it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryStore } from '../../../memory/index.js';
import { isEphemeralUserId } from '../../../utils/ephemeral-identity.js';
import { validateUserId } from '../../session/validation.js';
import { MemoryFirestore } from './memory-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/firestore-utils.js')>();
  return { ...actual, getFirestoreDb: () => fake.db };
});

import { clearRedirectCache } from '../identity-redirect.js';
import { getIdentityMetrics, resetIdentityMetrics } from '../identity-metrics.js';
import { mergeIdentityInto } from '../identity-merge.js';
import { resetSweepThrottle, sweepLinkedIdentities } from '../identity-resolution.js';
import { identifyFromMetadata, setGlobalStore } from '../user-identification.js';

let db: MemoryFirestore;

function useStore(): void {
  const store = {
    getProfile: async (id: string) => {
      const data = db.read(`bogle_users/${id}`);
      return data?.name ? { totalConversations: 0, ...data } : null;
    },
  };
  setGlobalStore(store as unknown as MemoryStore);
}

beforeEach(() => {
  db = new MemoryFirestore();
  fake.db = db;
  clearRedirectCache();
  resetSweepThrottle();
  resetIdentityMetrics();
  useStore();
});

describe('anonymous callers', () => {
  it('get an explicit ephemeral id, never the session id, and no durable key', async () => {
    const result = await identifyFromMetadata({ session_id: 'session-job1-1700' });
    expect(result.isEphemeral).toBe(true);
    expect(result.userId).not.toBe('session-job1-1700');
    expect(result.userId.startsWith('ephemeral:')).toBe(true);
    expect(isEphemeralUserId(result.userId)).toBe(true);
    // The session gate that guards every durable session write refuses it.
    expect(validateUserId(result.userId)).toBeUndefined();
    expect(getIdentityMetrics().ephemeralSessions).toBe(1);
  });

  it('treats placeholder dispatch ids as no identity at all', async () => {
    const result = await identifyFromMetadata({ userId: 'unknown' });
    expect(result.isEphemeral).toBe(true);
    expect(result.userId).not.toBe('unknown');
  });

  it('still recognises a persistent device id as a stable anonymous identity', async () => {
    const result = await identifyFromMetadata({ device_id: 'dev-1234-5678' });
    expect(result.userId).toBe('device:dev-1234-5678');
    expect(result.isEphemeral).toBeUndefined();
  });

  it('does not follow a redirect for an unverified device id', async () => {
    db.put('bogle_users/device:dev-1234-5678', { mergedInto: 'acct', mergeStatus: 'complete' });
    const result = await identifyFromMetadata({ device_id: 'dev-1234-5678' });
    expect(result.userId).toBe('device:dev-1234-5678');
  });
});

describe('validateUserId', () => {
  it.each(['anon:1700000000', 'session-abc-1', 'ephemeral:x', 'anonymous', 'unknown'])(
    'refuses %s',
    (id) => {
      expect(validateUserId(id)).toBeUndefined();
    }
  );
  it.each(['Xy7aB2cD3eF4gH5iJ6kL7mN8oP9q', 'device:abc-123', 'phone:+15551234567'])(
    'accepts %s',
    (id) => {
      expect(validateUserId(id)).toBe(id);
    }
  );
});

describe('verified identities', () => {
  it('resolve a merged anonymous Firebase uid to the signed-in account', async () => {
    db.put('bogle_users/anonUid', { mergedInto: 'acctUid', mergeStatus: 'complete' });
    db.put('bogle_users/acctUid', { name: 'Ana', totalConversations: 4 });
    const result = await identifyFromMetadata({ firebase_uid: 'anonUid' });
    expect(result.userId).toBe('acctUid');
    expect(result.isReturning).toBe(true);
    expect(getIdentityMetrics().redirectsFollowed).toBe(1);
  });

  it('fold a device into an account that already has a profile', async () => {
    db.put('bogle_users/acctUid', { name: 'Ana', totalConversations: 1 });
    db.put('bogle_users/device:dev-1234-5678', { name: 'Ana', totalConversations: 2 });
    db.put('bogle_users/device:dev-1234-5678/summaries/s1', { summary: 'hiking' });

    const result = await identifyFromMetadata({
      firebase_uid: 'acctUid',
      device_id: 'dev-1234-5678',
    });

    expect(result.userId).toBe('acctUid');
    expect(db.read('bogle_users/acctUid/summaries/s1')).toBeDefined();
    expect(db.read('bogle_users/device:dev-1234-5678')).toMatchObject({ mergedInto: 'acctUid' });
  });

  it('never hand a device already claimed by another account to a second one', async () => {
    db.put('bogle_users/device:dev-1234-5678', {
      mergedInto: 'firstAcct',
      mergeStatus: 'complete',
    });
    db.put('bogle_users/device:dev-1234-5678/summaries/late', { summary: 'written later' });
    await identifyFromMetadata({ firebase_uid: 'secondAcct', device_id: 'dev-1234-5678' });
    expect(db.read('bogle_users/secondAcct/summaries/late')).toBeUndefined();
    expect(db.read('bogle_users/device:dev-1234-5678')).toMatchObject({ mergedInto: 'firstAcct' });
  });
});

describe('leftover sweep', () => {
  it('moves memory a still-running anonymous session wrote after the merge finished', async () => {
    db.put('bogle_users/anonUid/summaries/s1', { summary: 'before' });
    const merged = await mergeIdentityInto(db.asFirestore(), {
      sourceId: 'anonUid',
      targetId: 'acctUid',
      reason: 'anonymous_upgrade',
    });
    expect(merged.success).toBe(true);
    // The old session ends and writes under the anonymous identity.
    db.put('bogle_users/anonUid/summaries/late', { summary: 'after' });

    await expect(sweepLinkedIdentities('acctUid')).resolves.toBe(1);
    expect(db.read('bogle_users/acctUid/summaries/late')).toBeDefined();
    // Throttled: a second sweep within the hour does nothing.
    db.put('bogle_users/anonUid/summaries/later', { summary: 'later' });
    await expect(sweepLinkedIdentities('acctUid')).resolves.toBe(0);
  });

  it('does nothing for accounts without linked identities', async () => {
    await expect(sweepLinkedIdentities('lonelyAcct')).resolves.toBe(0);
  });
});
