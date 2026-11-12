/**
 * The crisis hold's start signal, and the milestone queue's second line of defence.
 *
 * When a hold starts, `holdCrisisFace` tells whoever listens (onCrisisHoldStart),
 * and the milestones drop any celebration still waiting in their queue then.
 * crisis-hold-affect.test.ts drives that drop end to end. This file pins what
 * it rests on:
 * - a listener runs once when a hold starts, and a listener that throws can
 *   neither stop the hold nor the listeners after it;
 * - with the hold-start drop switched off (through the unsubscribe the
 *   milestones got back), the queue's own check on its next try still drops a
 *   waiting celebration during the hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

// Wrapped only to record what each caller gets back; it still registers for real.
vi.mock('../../src/ui/face/crisis-face-hold.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ui/face/crisis-face-hold.js')>();
  return { ...real, onCrisisHoldStart: vi.fn(real.onCrisisHoldStart) };
});

import { appState } from '../../src/state/app.state.js';
import {
  holdCrisisFace,
  isCrisisFaceHeld,
  onCrisisHoldStart,
  releaseCrisisFace,
} from '../../src/ui/face/crisis-face-hold.js';
import { ferniMilestones } from '../../src/ui/ferni-milestones.ui.js';
import { resetToastRegion } from '../../src/ui/overlay/toast-region.js';
import { soundUI } from '../../src/ui/sound.ui.js';
import { haptics } from '../../src/utils/haptics.js';

/** The unsubscribe the milestones got back when they registered their hold-start drop. */
const registrations = vi.mocked(onCrisisHoldStart).mock.results;

afterEach(() => {
  releaseCrisisFace();
});

describe('the hold-start signal', () => {
  it('the milestones register one hold-start drop when they load', () => {
    expect(registrations).toHaveLength(1);
  });

  it('runs a listener once when the hold starts, not again while it holds, and again next call', () => {
    const listener = vi.fn();
    const stop = onCrisisHoldStart(listener);
    holdCrisisFace();
    holdCrisisFace(); // renewed by a second crisis message
    expect(listener).toHaveBeenCalledTimes(1);

    releaseCrisisFace();
    holdCrisisFace();
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    releaseCrisisFace();
    holdCrisisFace();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a listener that throws stops neither the hold nor the listeners after it', () => {
    const after = vi.fn();
    const stopThrowing = onCrisisHoldStart(() => {
      throw new Error('listener failed');
    });
    const stopAfter = onCrisisHoldStart(after);

    expect(() => holdCrisisFace()).not.toThrow();
    expect(isCrisisFaceHeld()).toBe(true);
    expect(after).toHaveBeenCalledTimes(1);

    stopThrowing();
    stopAfter();
  });
});

describe('the milestone queue, with the hold-start drop switched off', () => {
  let sound: ReturnType<typeof vi.spyOn>;
  let bigWin: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetToastRegion();
    ferniMilestones.resetMilestones();
    sound = vi.spyOn(soundUI, 'play').mockImplementation(() => undefined);
    bigWin = vi.spyOn(haptics, 'bigWin').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    appState.set('connection', 'disconnected');
    appState.set('audio', 'idle');
    await vi.advanceTimersByTimeAsync(5_000); // let a celebration finish before the next test
    sound.mockRestore();
    bigWin.mockRestore();
    ferniMilestones.resetMilestones();
  });

  async function queueWhileSpeaking(): Promise<void> {
    appState.set('connection', 'connected');
    appState.set('audio', 'speaking');
    ferniMilestones.triggerMilestone('one-year');
    await vi.advanceTimersByTimeAsync(10);
    expect(sound).not.toHaveBeenCalled();
  }

  it('a waiting milestone plays once Ferni stops speaking (no crisis)', async () => {
    await queueWhileSpeaking();
    appState.set('audio', 'idle');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sound).toHaveBeenCalledWith('celebrate');
    expect(bigWin).toHaveBeenCalledTimes(1);
  });

  it("the queue's next try during the hold still drops it, so it never plays", async () => {
    const stopDropAtHoldStart = registrations[0]?.value as () => void;
    stopDropAtHoldStart(); // only the queue's own check is left

    await queueWhileSpeaking();
    holdCrisisFace();
    appState.set('audio', 'idle');
    await vi.advanceTimersByTimeAsync(10_000); // the retry runs inside the hold
    releaseCrisisFace();
    appState.set('connection', 'disconnected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sound).not.toHaveBeenCalledWith('celebrate');
    expect(bigWin).not.toHaveBeenCalled();
  });
});
