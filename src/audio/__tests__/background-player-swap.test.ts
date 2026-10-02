/**
 * Each new song recreated LiveKit's BackgroundAudioPlayer without closing the
 * old one; every player publishes its own audio track, so a live call ended
 * with 10 agent tracks. The swap closes the previous player first.
 */
import { describe, expect, it, vi } from 'vitest';
import { swapBackgroundPlayer } from '../background-player-swap.js';

function fakePlayer(log: string[], name: string) {
  return {
    start: vi.fn(async () => void log.push(`start ${name}`)),
    close: vi.fn(async () => void log.push(`close ${name}`)),
  };
}

describe('swapBackgroundPlayer', () => {
  it('closes the previous player before starting the new one', async () => {
    const log: string[] = [];
    const old = fakePlayer(log, 'old');
    const next = await swapBackgroundPlayer(old, () => fakePlayer(log, 'new'), {} as never);
    expect(log).toEqual(['close old', 'start new']);
    expect(next.start).toHaveBeenCalledOnce();
  });

  it('still starts the new player if closing the old one fails', async () => {
    const log: string[] = [];
    const old = fakePlayer(log, 'old');
    old.close.mockRejectedValueOnce(new Error('already closed'));
    await swapBackgroundPlayer(old, () => fakePlayer(log, 'new'), {} as never);
    expect(log).toEqual(['start new']);
  });

  it('works when there is no previous player', async () => {
    const log: string[] = [];
    await swapBackgroundPlayer(null, () => fakePlayer(log, 'new'), {} as never);
    expect(log).toEqual(['start new']);
  });
});
