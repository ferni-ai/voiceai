import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

const { prefetchUserCommitments, identifyFromMetadata } = vi.hoisted(() => ({
  prefetchUserCommitments: vi.fn(async () => {}),
  identifyFromMetadata: vi.fn(),
}));

vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({ prefetchUserCommitments }));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));

const { identifyUser } = await import('../user-identification-handler.js');

const room = {} as Room;

describe('identifyUser commitment prefetch', () => {
  beforeEach(() => {
    prefetchUserCommitments.mockClear();
    identifyFromMetadata.mockReset();
  });

  it("starts loading the identified user's commitments", async () => {
    identifyFromMetadata.mockResolvedValue({
      userId: 'user-42',
      source: { type: 'metadata' },
      profile: { name: 'Sam' },
    });

    const result = await identifyUser({ jobMetadata: '{"userId":"user-42"}', room, sessionId: 's1' });

    expect(result.userId).toBe('user-42');
    expect(prefetchUserCommitments).toHaveBeenCalledWith('user-42');
  });

  it('does not prefetch when there is no job metadata to identify from', async () => {
    await identifyUser({ jobMetadata: undefined, room, sessionId: 's2' });

    expect(identifyFromMetadata).not.toHaveBeenCalled();
    expect(prefetchUserCommitments).not.toHaveBeenCalled();
  });
});
