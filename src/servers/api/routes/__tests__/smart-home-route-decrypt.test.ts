/**
 * When the agent wrote a smart_home doc last (user-credentials.saveCredential
 * stores `enc_` fields), the web route reader handed those ciphertexts to the
 * Hue/LIFX/Sonos APIs as if they were tokens. It now decrypts them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => h.db,
}));

const state = newMergeFakeState();

describe('smart_home route reader and agent-written enc_ fields', () => {
  beforeEach(() => {
    h.db = createMergeFakeFirestore(state);
    state.docs.clear();
  });

  it('decrypts what the agent wrote, for every integration', async () => {
    const creds = await import('../../../../services/smart-home/user-credentials.js');
    const routes = await import('../smart-home.js');
    await creds.saveCredential('u1', 'lifx', { token: 'fixture-lifx-token' });
    await creds.saveCredential('u1', 'hue', { bridgeIp: '10.0.0.2', username: 'fixture-hue-user' });
    await creds.saveCredential('u1', 'sonos', {
      accessToken: 'fixture-sonos-access',
      refreshToken: 'fixture-sonos-refresh',
    });
    // Stored encrypted (enc_), as the agent writes it.
    expect(String(state.docs.get('bogle_users/u1/smart_home/lifx')?.token)).toMatch(/^enc_/);

    expect(await routes.getCredentials('u1', 'lifx')).toMatchObject({
      token: 'fixture-lifx-token',
    });
    expect(await routes.getCredentials('u1', 'hue')).toMatchObject({
      bridgeIp: '10.0.0.2',
      username: 'fixture-hue-user',
    });
    expect(await routes.getCredentials('u1', 'sonos')).toMatchObject({
      accessToken: 'fixture-sonos-access',
      refreshToken: 'fixture-sonos-refresh',
    });
  });

  it('a route save after an agent save carries the decrypted values, never enc_ ones', async () => {
    const creds = await import('../../../../services/smart-home/user-credentials.js');
    const routes = await import('../smart-home.js');
    await creds.saveCredential('u2', 'sonos', {
      accessToken: 'fixture-sonos-access',
      refreshToken: 'fixture-sonos-refresh',
      householdId: 'hh-1',
    });
    await routes.saveCredentials('u2', 'sonos', { accessToken: 'fixture-new-access' });
    expect(await routes.getCredentials('u2', 'sonos')).toMatchObject({
      accessToken: 'fixture-new-access',
      refreshToken: 'fixture-sonos-refresh',
      householdId: 'hh-1',
    });
    expect(JSON.stringify(await routes.getCredentials('u2', 'sonos'))).not.toContain('enc_');
  });
});
