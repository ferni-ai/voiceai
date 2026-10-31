/**
 * The Maya notification service starts in every agent call process. Its
 * proactive loop, which listed up to 100 user profiles and could schedule SMS
 * reminders for them, is gone: starting the service scans nobody.
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
    await shutdownEngagementNotificationService();
  });

  it('does not scan user profiles', async () => {
    await initializeMayaNotificationService();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(listProfiles).not.toHaveBeenCalled();
  });
});
