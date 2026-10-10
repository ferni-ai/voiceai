/**
 * The Maya notification service starts in every agent call process. Its
 * proactive loop lists up to 100 user profiles and can schedule SMS
 * reminders for them, so it must stay off unless MAYA_PROACTIVE_CHECKS=on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listProfiles = vi.fn(async () => []);

vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ listProfiles, getProfile: async () => null }),
}));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: async () => null,
    set: () => undefined,
    flush: async () => undefined,
    shutdown: async () => undefined,
  }),
}));

import {
  initializeMayaNotificationService,
  shutdownEngagementNotificationService,
} from '../engagement-notification-service.js';

describe('Maya proactive check loop gate', () => {
  beforeEach(() => {
    listProfiles.mockClear();
  });

  afterEach(async () => {
    delete process.env.MAYA_PROACTIVE_CHECKS;
    await shutdownEngagementNotificationService();
  });

  it('does not scan user profiles when the flag is unset', async () => {
    await initializeMayaNotificationService();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('scans user profiles when MAYA_PROACTIVE_CHECKS=on', async () => {
    process.env.MAYA_PROACTIVE_CHECKS = 'on';
    await initializeMayaNotificationService();
    await vi.waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));
  });
});
