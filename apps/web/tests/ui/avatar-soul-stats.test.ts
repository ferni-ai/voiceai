/**
 * Every avatar moment the soul plays is counted once, where it plays, and never
 * when it was refused (#4069): warmth bloom, growth celebration and cameo arrival
 * in avatar-soul.ui.ts, and the crisis hold when it starts. Reduced motion
 * refuses the soul's moments, so they count nothing; the crisis hold refuses the
 * memory spark, so it counts nothing. The record calls are spies; the soul and
 * the crisis hold are real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const record = vi.hoisted(() => ({
  recordMicroExpression: vi.fn(),
  recordProtectiveMode: vi.fn(),
  recordComfortPulse: vi.fn(),
  recordMemorySpark: vi.fn(),
  recordWarmthBloom: vi.fn(),
  recordCelebrateGrowth: vi.fn(),
  recordCameoArrival: vi.fn(),
  recordCrisisHold: vi.fn(),
  recordNameLift: vi.fn(),
}));
vi.mock('../../src/services/soul-stats.service.js', () => ({ soulStatsService: record }));

function timeline(): Record<string, unknown> {
  const tl: Record<string, unknown> = {};
  for (const method of ['to', 'set', 'fromTo']) tl[method] = () => tl;
  tl.kill = vi.fn();
  return tl;
}
vi.mock('../../src/utils/gsap-setup.js', () => {
  const root = timeline();
  return { gsap: { ...root, timeline, killTweensOf: vi.fn(), isTweening: () => false } };
});
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: new Proxy({}, { get: () => vi.fn() }),
}));

let reduceMotion = false;
let soul: typeof import('../../src/ui/avatar-soul.ui.js');
let hold: typeof import('../../src/ui/face/crisis-face-hold.js');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  for (const spy of Object.values(record)) spy.mockClear();
  reduceMotion = false;
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
  hold = await import('../../src/ui/face/crisis-face-hold.js');
  soul = await import('../../src/ui/avatar-soul.ui.js');
});

afterEach(() => {
  soul.disposeAvatarSoul();
  hold.releaseCrisisFace();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function init(reduced = false): void {
  reduceMotion = reduced;
  soul.initAvatarSoul();
}

describe('the soul moments, counted once per play', () => {
  it('warmth bloom: once per bloom', () => {
    init();
    soul.triggerWarmthBloom(1);
    soul.triggerWarmthBloom(0.8);
    expect(record.recordWarmthBloom).toHaveBeenCalledTimes(2);
  });

  it('growth celebration: once per celebration', () => {
    init();
    soul.celebrateGrowth();
    expect(record.recordCelebrateGrowth).toHaveBeenCalledTimes(1);
  });

  it('cameo arrival: once per arrival (its own warmth bloom counts as the bloom it is)', () => {
    init();
    soul.triggerCameoArrival('#5a8f6a');
    expect(record.recordCameoArrival).toHaveBeenCalledTimes(1);
    expect(record.recordWarmthBloom).toHaveBeenCalledTimes(1);
  });

  it('a cameo return is not an arrival', () => {
    init();
    soul.triggerCameoReturn();
    expect(record.recordCameoArrival).not.toHaveBeenCalled();
  });
});

describe('refused moments count nothing', () => {
  it('reduced motion: no bloom, celebration or arrival plays, and none is counted', () => {
    init(true);
    soul.triggerWarmthBloom(1);
    soul.celebrateGrowth();
    soul.triggerCameoArrival('#5a8f6a', true);
    vi.advanceTimersByTime(1_000); // past the first-cameo spark's delay
    expect(record.recordWarmthBloom).not.toHaveBeenCalled();
    expect(record.recordCelebrateGrowth).not.toHaveBeenCalled();
    expect(record.recordCameoArrival).not.toHaveBeenCalled();
    expect(record.recordMemorySpark).not.toHaveBeenCalled();
  });

  it('no soul yet (before init): nothing plays, nothing is counted', () => {
    soul.triggerWarmthBloom(1);
    soul.celebrateGrowth();
    expect(record.recordWarmthBloom).not.toHaveBeenCalled();
    expect(record.recordCelebrateGrowth).not.toHaveBeenCalled();
  });

  it('the crisis hold refuses the memory spark, and it is not counted', () => {
    init();
    soul.triggerMemorySpark();
    expect(record.recordMemorySpark).toHaveBeenCalledTimes(1); // control
    hold.holdCrisisFace();
    soul.triggerMemorySpark();
    expect(record.recordMemorySpark).toHaveBeenCalledTimes(1);
  });
});

describe('the crisis hold', () => {
  it('is counted when it starts, not again while it is already held', () => {
    expect(record.recordCrisisHold).not.toHaveBeenCalled();
    hold.holdCrisisFace();
    expect(record.recordCrisisHold).toHaveBeenCalledTimes(1);
    hold.holdCrisisFace();
    hold.holdCrisisFace();
    expect(record.recordCrisisHold).toHaveBeenCalledTimes(1);
  });

  it('a new hold after the call ended is counted again', () => {
    hold.holdCrisisFace();
    hold.releaseCrisisFace();
    hold.holdCrisisFace();
    expect(record.recordCrisisHold).toHaveBeenCalledTimes(2);
  });

  it('is counted even if a hold-start listener throws (the hold still started)', () => {
    hold.onCrisisHoldStart(() => {
      throw new Error('fictional listener failure');
    });
    hold.holdCrisisFace();
    expect(hold.isCrisisFaceHeld()).toBe(true);
    expect(record.recordCrisisHold).toHaveBeenCalledTimes(1);
  });
});
