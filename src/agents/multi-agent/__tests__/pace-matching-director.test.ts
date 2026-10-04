/**
 * Pace matching and the speech director must not both set Ferni's speed:
 * with SPEECH_DIRECTOR on, the director owns pacing and pace matching stands
 * down (agreed with the #180 owner).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPaceMatching } from '../turn-observers.js';

function fakeSession(): { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> } {
  return { on: vi.fn(), off: vi.fn() };
}

describe('pace matching vs the speech director', () => {
  const saved = process.env.SPEECH_DIRECTOR;
  afterEach(() => {
    if (saved === undefined) delete process.env.SPEECH_DIRECTOR;
    else process.env.SPEECH_DIRECTOR = saved;
  });

  it('listens for the caller when the director is off', async () => {
    delete process.env.SPEECH_DIRECTOR;
    const session = fakeSession();
    await installPaceMatching(session as never, 's-off', []);
    expect(session.on).toHaveBeenCalled();
  });

  it('stands down when the director is live', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    const session = fakeSession();
    const cleanup: Array<() => void> = [];
    await installPaceMatching(session as never, 's-live', cleanup);
    expect(session.on).not.toHaveBeenCalled();
    expect(cleanup).toHaveLength(0);
  });

  it('keeps pacing when the director only observes (shadow)', async () => {
    process.env.SPEECH_DIRECTOR = 'shadow';
    const session = fakeSession();
    await installPaceMatching(session as never, 's-shadow', []);
    expect(session.on).toHaveBeenCalled();
  });

  it('keeps pacing when the director is live but its pacing lever is not', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    process.env.SPEECH_DIRECTOR_PACING = 'off';
    try {
      const session = fakeSession();
      await installPaceMatching(session as never, 's-lever', []);
      expect(session.on).toHaveBeenCalled();
    } finally {
      delete process.env.SPEECH_DIRECTOR_PACING;
    }
  });
});
