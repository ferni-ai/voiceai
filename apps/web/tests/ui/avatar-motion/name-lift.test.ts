/**
 * The name lift on the avatar: brighten sparks, attentive and comfort never
 * do, nothing plays over another effect, and reduced motion gets a static
 * warmth change only. The last block drives the real path: the agent's
 * message through the humanization bridge service and the EQ bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeSoul = vi.hoisted(() => ({
  triggerWarmthBloom: vi.fn(),
  triggerMemorySpark: vi.fn(),
  getState: vi.fn(() => ({ comfortPulseActive: false, protectiveMode: false })),
}));
vi.mock('../../../src/ui/avatar-soul.ui.js', () => ({ avatarSoul: fakeSoul }));

import {
  NAME_LIFT_ATTR,
  NAME_LIFT_CSS,
  playNameLift,
  runNameLift,
  type NameLiftDeps,
  type NameLiftEffect,
} from '../../../src/ui/avatar-motion/name-lift.js';
import { initBetterThanHumanSignalHandlers } from '../../../src/eq/bridge/humanization-bridge.js';
import { processHumanizationMessage } from '../../../src/services/humanization-bridge.service.js';
import { ferniExpressions } from '../../../src/ui/ferni-expressions.ui.js';
import type { DataMessage } from '../../../src/types/events.js';

/** Lid expressions that draw sparkles (ferni-expressions.ui.ts). */
const SPARKLING = [
  'delighted',
  'excited',
  'proud',
  'celebrating',
  'recognizing',
  'reconnecting',
  'growing',
  'farewell',
];

let container: HTMLElement;
let express: ReturnType<typeof vi.fn>;
let scheduled: Array<() => void>;
let reduced = false;

function deps(): NameLiftDeps {
  return {
    soul: async () => fakeSoul,
    express,
    reducedMotion: () => reduced,
    container: () => document.querySelector<HTMLElement>('.avatar-container'),
    schedule: (fn) => {
      scheduled.push(fn);
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="coach"><div class="avatar-container"></div></div>';
  container = document.querySelector<HTMLElement>('.avatar-container')!;
  express = vi.fn();
  scheduled = [];
  reduced = false;
  fakeSoul.triggerWarmthBloom.mockClear();
  fakeSoul.triggerMemorySpark.mockClear();
  fakeSoul.getState.mockImplementation(() => ({
    comfortPulseActive: false,
    protectiveMode: false,
  }));
});

describe('name lift effects', () => {
  it('brighten: a warm bloom and the memory spark', async () => {
    expect(await runNameLift('brighten', deps())).toBe(true);
    expect(fakeSoul.triggerWarmthBloom).toHaveBeenCalledWith(1);
    expect(fakeSoul.triggerMemorySpark).toHaveBeenCalledTimes(1);
    expect(express.mock.calls[0][0]).toBe('warm');
  });

  it('attentive: an attentive look, no sparkle and no bloom', async () => {
    expect(await runNameLift('attentive', deps())).toBe(true);
    expect(express.mock.calls[0][0]).toBe('attentive');
    expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(fakeSoul.triggerWarmthBloom).not.toHaveBeenCalled();
  });

  it('comfort: a soft bloom and an empathetic look, never the spark', async () => {
    expect(await runNameLift('comfort', deps())).toBe(true);
    expect(fakeSoul.triggerWarmthBloom).toHaveBeenCalledWith(0.8);
    expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(express.mock.calls[0][0]).toBe('empathetic');
    expect(SPARKLING).not.toContain(express.mock.calls[0][0]);
  });

  it('marks the container while it shows, then clears it', async () => {
    await runNameLift('comfort', deps());
    expect(container.getAttribute(NAME_LIFT_ATTR)).toBe('comfort');
    scheduled.forEach((fn) => fn());
    expect(container.hasAttribute(NAME_LIFT_ATTR)).toBe(false);
  });
});

describe('name lift input', () => {
  it('ignores an effect it does not know', async () => {
    playNameLift({ effect: 'sparkle' }, deps());
    playNameLift({}, deps());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakeSoul.triggerWarmthBloom).not.toHaveBeenCalled();
    expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(container.hasAttribute(NAME_LIFT_ATTR)).toBe(false);
  });
});

describe('name lift never covers anything', () => {
  it.each<[string, () => void]>([
    ['another lift', () => container.setAttribute(NAME_LIFT_ATTR, 'attentive')],
    [
      'a comfort pulse',
      () =>
        fakeSoul.getState.mockImplementation(() => ({
          comfortPulseActive: true,
          protectiveMode: false,
        })),
    ],
    [
      'protective mode',
      () =>
        fakeSoul.getState.mockImplementation(() => ({
          comfortPulseActive: false,
          protectiveMode: true,
        })),
    ],
    [
      'an open dialog',
      () =>
        document.body.insertAdjacentHTML(
          'beforeend',
          '<div role="dialog" aria-modal="true"></div>'
        ),
    ],
    ['no avatar', () => container.remove()],
  ])('plays nothing over %s', async (_label, arrange) => {
    arrange();
    expect(await runNameLift('brighten', deps())).toBe(false);
    expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(fakeSoul.triggerWarmthBloom).not.toHaveBeenCalled();
    expect(express).not.toHaveBeenCalled();
  });
});

describe('name lift under prefers-reduced-motion', () => {
  it.each<NameLiftEffect>(['brighten', 'attentive', 'comfort'])(
    '%s is a static warmth change only',
    async (effect) => {
      reduced = true;
      expect(await runNameLift(effect, deps())).toBe(true);
      expect(container.getAttribute(NAME_LIFT_ATTR)).toBe(effect);
      expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
      expect(fakeSoul.triggerWarmthBloom).not.toHaveBeenCalled();
      expect(express).not.toHaveBeenCalled();
    }
  );

  it('the warmth style moves nothing', () => {
    expect(NAME_LIFT_CSS).toContain('transition: none');
    expect(NAME_LIFT_CSS).not.toMatch(/animation|transform|@keyframes/);
  });
});

describe('name lift through the humanization bridge', () => {
  let setExpression: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    setExpression = vi.spyOn(ferniExpressions, 'setExpression').mockImplementation(() => undefined);
    initBetterThanHumanSignalHandlers();
  });
  afterEach(() => {
    setExpression.mockRestore();
    vi.useRealTimers();
  });

  const send = (effect: string) =>
    processHumanizationMessage({
      type: 'humanization_signal',
      signalType: 'name_lift',
      effect,
      timestamp: Date.now(),
    } as unknown as DataMessage);

  it("plays the agent's comfort signal on the avatar, with no spark", async () => {
    expect(send('comfort')).toBe(true);
    await vi.waitFor(() => expect(fakeSoul.triggerWarmthBloom).toHaveBeenCalledWith(0.8));
    expect(setExpression).toHaveBeenCalledWith(
      'empathetic',
      expect.any(Number),
      expect.any(Number)
    );
    expect(fakeSoul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(container.getAttribute(NAME_LIFT_ATTR)).toBe('comfort');
  });
});
