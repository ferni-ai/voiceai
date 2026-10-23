/**
 * HANDOFF_FAST_ARRIVAL: while a handoff holds the arrival window open, the coordinator
 * waits ARRIVAL_GAP_MS after the goodbye ends, not its 750 ms+ echo cooldown, before it
 * speaks the teammate's queued greeting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armArrivalCooldown,
  arrivalCooldownMs,
  disarmArrivalCooldown,
} from '../arrival-cooldown.js';
import { CoordinatorState, SpeechCoordinator } from '../speech-coordinator.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  disarmArrivalCooldown();
  vi.useRealTimers();
});

describe('arrival window', () => {
  it('is closed until a handoff opens it, and closes on disarm', () => {
    expect(arrivalCooldownMs()).toBeUndefined();
    armArrivalCooldown(150);
    expect(arrivalCooldownMs()).toBe(150);
    disarmArrivalCooldown();
    expect(arrivalCooldownMs()).toBeUndefined();
  });

  it('closes by itself after its limit, so a lost handoff cannot leave it open', () => {
    armArrivalCooldown(150, 5_000);
    expect(arrivalCooldownMs(Date.now() + 4_999)).toBe(150);
    expect(arrivalCooldownMs(Date.now() + 5_001)).toBeUndefined();
    expect(arrivalCooldownMs()).toBeUndefined();
  });
});

describe('coordinator cooldown after the goodbye', () => {
  /** How long after onSpeechEnded the coordinator is free to speak again. */
  function cooldownAfterGoodbye(): number {
    const coordinator = new SpeechCoordinator();
    coordinator.onSpeechEnded(false, 2500);
    expect(coordinator.getState()).toBe(CoordinatorState.COOLDOWN);
    let ms = 0;
    while (coordinator.getState() === CoordinatorState.COOLDOWN && ms < 5_000) {
      vi.advanceTimersByTime(10);
      ms += 10;
    }
    return ms;
  }

  it('pre: with no window the next line waits the echo cooldown (750 ms or more)', () => {
    expect(cooldownAfterGoodbye()).toBeGreaterThanOrEqual(750);
  });

  it('post: with the window open it waits only the arrival gap', () => {
    armArrivalCooldown(150);
    expect(cooldownAfterGoodbye()).toBe(150);
  });
});
