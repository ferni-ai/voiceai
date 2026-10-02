import { describe, expect, it, vi } from 'vitest';
import type { DataChannelContext } from '../data-channel-handler.js';
import {
  clientDevModeAllowed,
  handleDevModeSync,
  isDevModeBypassEnabled,
} from '../data-channel-handler.js';
import type { SessionServices } from '../../../services/index.js';

/** What any caller can send from the browser console with publishData. */
const forged = { enabled: true, bypassUnlocks: true, simulatedTier: 'partner' as const };

function context(): DataChannelContext {
  return {
    room: { localParticipant: { publishData: vi.fn() } },
    services: {} as SessionServices,
    sessionId: 'test-session',
  } as unknown as DataChannelContext;
}

describe('dev_mode_sync', () => {
  it('is off unless the deployment opts in', () => {
    expect(clientDevModeAllowed({})).toBe(false);
    expect(clientDevModeAllowed({ ALLOW_CLIENT_DEV_MODE: 'false' })).toBe(false);
    expect(clientDevModeAllowed({ ALLOW_CLIENT_DEV_MODE: '1' })).toBe(false);
    expect(clientDevModeAllowed({ ALLOW_CLIENT_DEV_MODE: 'true' })).toBe(true);
  });

  it('cannot unlock team members on a deployment that has not opted in', async () => {
    vi.stubEnv('ALLOW_CLIENT_DEV_MODE', '');
    const ctx = context();
    await handleDevModeSync(forged, ctx);
    expect(isDevModeBypassEnabled(ctx.services)).toBe(false);
    expect(ctx.room.localParticipant?.publishData).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('still works for the dev panel where the deployment opts in', async () => {
    vi.stubEnv('ALLOW_CLIENT_DEV_MODE', 'true');
    const ctx = context();
    await handleDevModeSync(forged, ctx);
    expect(isDevModeBypassEnabled(ctx.services)).toBe(true);
    vi.unstubAllEnvs();
  });
});
