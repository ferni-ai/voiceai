/**
 * The call-start profile read (setupProfileReader) with FORGET_FRESH_READ: the forget store read
 * starts when setup starts, beside the prompt loads, not after them, and the profile that
 * attaches later is scrubbed with it (#2755). Off, nothing is read early. Only the stored list is
 * faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';
import { trackDeferredProfileLoad } from '../../../services/session/deferred-profile.js';
import { setupProfileReader } from '../setup-profile.js';

type Profile = { lifeEvents: Array<{ id: string; title: string }> };

function deferredServices(userId: string) {
  const services: { userId: string; userProfile?: Profile | null } = { userId };
  let attach!: () => void;
  trackDeferredProfileLoad(
    services,
    new Promise<void>((resolve) => {
      attach = () => {
        services.userProfile = {
          lifeEvents: [
            { id: 'l1', title: 'Biscuit is sick' },
            { id: 'l2', title: 'moving to Denver' },
          ],
        };
        resolve();
      };
    })
  );
  return { services, attach };
}

describe('setupProfileReader, FORGET_FRESH_READ (#2755)', () => {
  beforeEach(() => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: the store read starts at setup, and the profile attached later is scrubbed', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    const topics = vi.spyOn(firestoreForgetStore, 'topics').mockResolvedValue(['Biscuit']);
    const { services, attach } = deferredServices('member-setup-fresh');
    const readProfile = setupProfileReader(services, 's-setup-fresh');
    expect(topics).toHaveBeenCalledTimes(1); // before the profile attaches or anyone waits
    attach();
    const seen = await readProfile();
    expect(seen?.lifeEvents.map((e) => e.title)).toEqual(['moving to Denver']);
    expect(topics).toHaveBeenCalledTimes(1);
  });

  it('off: nothing is read at setup; the scrub reads when the profile is read', async () => {
    const topics = vi.spyOn(firestoreForgetStore, 'topics').mockResolvedValue(['Biscuit']);
    const { services, attach } = deferredServices('member-setup-off');
    const readProfile = setupProfileReader(services, 's-setup-off');
    expect(topics).not.toHaveBeenCalled();
    attach();
    const seen = await readProfile();
    expect(seen?.lifeEvents.map((e) => e.title)).toEqual(['moving to Denver']);
    expect(topics).toHaveBeenCalledTimes(1);
  });
});
