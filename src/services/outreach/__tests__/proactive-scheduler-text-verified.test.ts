/**
 * The UI server's proactive scheduler texted profile.contactInfo.phone, which
 * saveContactInfo writes from whatever the model heard. A text now goes only
 * through the guarded owner text (verified phone, STOP, texts off, quiet hours);
 * held, it falls back to a push.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  textOwner: vi.fn(
    async (..._a: unknown[]) =>
      ({ sent: true }) as { sent: boolean; reason?: string; held?: boolean }
  ),
  sms: vi.fn(async () => ({ success: true })),
  push: vi.fn(async () => ({ success: true })),
}));

vi.mock('../call-user-adapter.js', () => ({ callUserAdapter: { textOwner: h.textOwner } }));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS: h.sms }));
vi.mock('../delivery/push-notifications.js', () => ({ sendPushNotification: h.push }));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => ({ contactInfo: { phone: '+12125550199' } }), // model-written
  }),
}));

import { deliverOutreach, setUserOutreachPreferences } from '../proactive-scheduler.js';

const outreach = {
  id: 'o1',
  userId: 'uid-proactive',
  type: 'thinking_of_you',
  message: 'thinking of you',
  scheduledFor: new Date(),
  status: 'pending',
} as unknown as Parameters<typeof deliverOutreach>[0];

afterEach(() => vi.clearAllMocks());

describe('proactive scheduler texts', () => {
  it('go through the guarded owner text, never straight to the saved number', async () => {
    setUserOutreachPreferences('uid-proactive', { preferredMethod: 'text' });
    await deliverOutreach(outreach);
    expect(h.textOwner).toHaveBeenCalledWith('uid-proactive', 'thinking of you', {
      askedNow: false,
    });
    expect(h.sms).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it('a held text (STOP, quiet hours, no verified phone) falls back to a push', async () => {
    setUserOutreachPreferences('uid-proactive', { preferredMethod: 'text' });
    h.textOwner.mockResolvedValueOnce({ sent: false, reason: 'you replied STOP to my texts' });
    await deliverOutreach(outreach);
    expect(h.sms).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledTimes(1);
  });

  it('one the daily text cap held goes out later on its own: no push copy now', async () => {
    setUserOutreachPreferences('uid-proactive', { preferredMethod: 'text' });
    h.textOwner.mockResolvedValueOnce({ sent: false, reason: 'later', held: true });
    await deliverOutreach(outreach);
    expect(h.push).not.toHaveBeenCalled();
    expect(h.sms).not.toHaveBeenCalled();
  });
});
