import { beforeEach, describe, expect, it, vi } from 'vitest';

let doc: Record<string, unknown> | undefined;

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: doc !== undefined, data: () => doc }) }),
    }),
  }),
}));

import { userReach, type VerifiedPhoneSources } from '../user-reach.js';

const sources = (authPhone?: string): VerifiedPhoneSources => ({
  sponsoredPhone: async () => undefined,
  authPhone: async () => authPhone,
});

describe('userReach finds the phone a Google sign-in verified in Settings', () => {
  beforeEach(() => {
    doc = { contactInfo: { phone: '+15550009999' } };
  });

  it('a web account with only a Firebase Auth phone is reachable on it', async () => {
    const reach = await userReach('googleUid123', 'sms', { standingOptIn: false }, sources('+15552017497'));
    expect(reach).toEqual({ phone: '+15552017497' });
  });

  it('never falls back to the model-written profile phone', async () => {
    const reach = await userReach('googleUid123', 'sms', { standingOptIn: false }, sources());
    expect(reach).toEqual({ reason: 'no_verified_phone' });
  });

  it('a standing check-in still needs the channel opted in, whatever the phone', async () => {
    const reach = await userReach('googleUid123', 'sms', { standingOptIn: true }, sources('+15552017497'));
    expect(reach).toEqual({ reason: 'not_opted_in' });
    doc = { outreachPreferences: { enabled: true, channels: ['in_app', 'sms'] } };
    const opted = await userReach('googleUid123', 'sms', { standingOptIn: true }, sources('+15552017497'));
    expect(opted).toEqual({ phone: '+15552017497' });
  });
});
