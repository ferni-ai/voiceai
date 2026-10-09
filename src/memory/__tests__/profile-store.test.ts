import { afterEach, describe, expect, it, vi } from 'vitest';

const configured = vi.hoisted(() => ({ kind: 'configured' }));
vi.mock('../storage/store-factory.js', () => ({ getStore: vi.fn(async () => configured) }));

import { getDefaultStore } from '../storage/in-memory-store.js';
import { getProfileStore, isAgentProfilePersistenceOn } from '../profile-store.js';

afterEach(() => {
  delete process.env.PERSIST_AGENT_PROFILES;
});

describe('getProfileStore', () => {
  it('is the same in-memory store as before when the flag is off (the default)', async () => {
    expect(isAgentProfilePersistenceOn()).toBe(false);
    expect(await getProfileStore()).toBe(getDefaultStore());
  });

  it('is the configured store (Firestore in production) when PERSIST_AGENT_PROFILES=true', async () => {
    process.env.PERSIST_AGENT_PROFILES = 'true';
    expect(await getProfileStore()).toBe(configured);
  });

  it('treats anything but "true" as off', async () => {
    process.env.PERSIST_AGENT_PROFILES = '1';
    expect(await getProfileStore()).toBe(getDefaultStore());
  });
});
