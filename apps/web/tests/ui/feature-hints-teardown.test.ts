/**
 * destroyFeatureHints() leaves nothing scheduled. Its first hint check runs 1 s after init on a
 * tracked timeout; left pending, it ran after a test file's jsdom was gone and failed the web
 * run with "localStorage is not defined" (from tests/ui/relationship-facts-surfaces.test.ts).
 * Destroy also drops its stage-change listener, and clears only its own tracked timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('feature hints teardown', () => {
  it('init schedules its checks, and destroy clears every one of them', async () => {
    const hints = await import('../../src/ui/feature-hints.ui.js');
    const before = vi.getTimerCount();
    hints.initFeatureHints();
    expect(vi.getTimerCount()).toBe(before + 2); // the 2 s interval and the 1 s first check
    hints.destroyFeatureHints();
    expect(vi.getTimerCount()).toBe(before);
  });

  it('after destroy, no hint check runs, however long the page stays up', async () => {
    const coordinator = await import('../../src/services/modal-coordinator.service.js');
    const checks = vi.spyOn(coordinator.modalCoordinator, 'hasMinimumConversations');
    const hints = await import('../../src/ui/feature-hints.ui.js');
    hints.initFeatureHints();
    hints.destroyFeatureHints();
    vi.advanceTimersByTime(60_000);
    expect(checks).not.toHaveBeenCalled();
  });

  it('a stage change after destroy schedules no hint check', async () => {
    const coordinator = await import('../../src/services/modal-coordinator.service.js');
    const { relationshipStageService } =
      await import('../../src/services/relationship-stage.service.js');
    const listeners = new Set<() => void>();
    vi.spyOn(relationshipStageService, 'onStageChange').mockImplementation((listener) => {
      listeners.add(listener as () => void);
      return () => listeners.delete(listener as () => void);
    });
    const checks = vi.spyOn(coordinator.modalCoordinator, 'hasMinimumConversations');
    const hints = await import('../../src/ui/feature-hints.ui.js');
    hints.initFeatureHints();
    expect(listeners.size).toBe(1);
    hints.destroyFeatureHints();
    listeners.forEach((stageChanged) => stageChanged());
    vi.advanceTimersByTime(60_000);
    expect(listeners.size).toBe(0);
    expect(checks).not.toHaveBeenCalled();
  });

  it("another module's tracked timer survives destroyFeatureHints", async () => {
    const { createTimeoutTracker } = await import('../../src/utils/tracked-timeout.js');
    const other = createTimeoutTracker();
    const otherRan = vi.fn();
    other.trackedTimeout(otherRan, 5_000);
    const hints = await import('../../src/ui/feature-hints.ui.js');
    hints.initFeatureHints();
    hints.destroyFeatureHints();
    expect(other.getActiveCount()).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(otherRan).toHaveBeenCalledTimes(1);
  });
});
