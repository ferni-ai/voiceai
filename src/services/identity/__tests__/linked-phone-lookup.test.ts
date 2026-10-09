/**
 * Phone identification must find a user by a linked phone with the store's
 * indexed lookup, never by listing every profile (which on Firestore read up
 * to 1000 documents at the start of a call).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sponsored-identity.js', () => ({ lookupByPhone: vi.fn(async () => ({ found: false })) }));
vi.mock('../../memory/memory-management.js', () => ({
  getCachedPhoneMapping: vi.fn(() => undefined),
  savePhoneMapping: vi.fn(async () => undefined),
}));

import type { MemoryStore } from '../../../memory/profile-store.js';
import { findProfileByLinkedPhone, identifyByPhone, setGlobalStore } from '../user-identification.js';

const sam = { id: 'user-sam', name: 'Sam', totalConversations: 3 };

function fakeStore(match: unknown = null) {
  const store = {
    getProfile: vi.fn(async () => null),
    findProfileByLinkedIdentifier: vi.fn(async () => match),
    listProfiles: vi.fn(async () => {
      throw new Error('listProfiles must not be used to find a phone');
    }),
  };
  setGlobalStore(store as unknown as MemoryStore);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('findProfileByLinkedPhone', () => {
  it('asks the store for every stored phone format, without listing profiles', async () => {
    const store = fakeStore(sam);
    expect(await findProfileByLinkedPhone('+15551234567')).toBe(sam);
    expect(store.findProfileByLinkedIdentifier).toHaveBeenCalledWith([
      'phone:+15551234567',
      '+15551234567',
      '5551234567',
    ]);
    expect(store.listProfiles).not.toHaveBeenCalled();
  });

  it('returns null when the lookup fails', async () => {
    const store = fakeStore();
    store.findProfileByLinkedIdentifier.mockRejectedValueOnce(new Error('firestore down'));
    expect(await findProfileByLinkedPhone('+15551234567')).toBeNull();
  });
});

describe('identifyByPhone', () => {
  it('recognises a caller whose number is linked to an existing profile', async () => {
    const store = fakeStore(sam);
    const result = await identifyByPhone('+1 (555) 123-4567');
    expect(result.userId).toBe('user-sam');
    expect(result.isNew).toBe(false);
    expect(store.findProfileByLinkedIdentifier).toHaveBeenCalled();
    expect(store.listProfiles).not.toHaveBeenCalled();
  });
});
