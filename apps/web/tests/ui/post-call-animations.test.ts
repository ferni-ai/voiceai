/**
 * After a call ends, the page goes back to the animations it had before it.
 *
 * Measured in the dev app (phone, fake call): 8 infinite animations ran before
 * the call and 14 after hang-up. One of the leftovers was the unified
 * indicator's "disconnected" heartbeat: before the first call the indicator
 * starts at rest, but after a hang-up it switched to disconnected and pulsed
 * forever. This test pins the indicator to the same resting state both times.
 *
 * Most of the rest came from `#coach.is-connected` surviving hang-up: the
 * idle breathing (humanBreathing, humanBreathingRing) and the eye blink
 * (natural-blink) are CSS gated on it. coach.ui removed it on disconnect,
 * then expressiveEyes.setVoiceState('idle') added it back. coach.ui is now
 * its one owner; these tests pin both directions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: { onSubtitleChange: () => () => undefined },
}));

interface Running {
  target: Element;
  cancelled: boolean;
}
let animations: Array<Running & { infinite: boolean }> = [];

function infiniteOn(selector: string): number {
  return animations.filter((a) => a.infinite && !a.cancelled && a.target.matches(selector)).length;
}

function setConnection(state: string): void {
  window.dispatchEvent(new CustomEvent('ferni:connection-state', { detail: { state } }));
}

beforeEach(() => {
  vi.resetModules();
  animations = [];
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Element.prototype.animate = function animate(
    this: Element,
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions
  ): Animation {
    const record = {
      target: this,
      cancelled: false,
      infinite: typeof options === 'object' && options.iterations === Infinity,
    };
    animations.push(record);
    return {
      cancel: () => {
        record.cancelled = true;
      },
      onfinish: null,
    } as unknown as Animation;
  };
  document.body.innerHTML = '<div class="avatar-container"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('unified indicator after a call', () => {
  it('rests after hang-up exactly as it did before the first call', async () => {
    const indicator = await import('../../src/ui/unified-indicator.ui.js');
    indicator.initUnifiedIndicator();
    const before = infiniteOn('.unified-indicator');

    setConnection('connecting');
    setConnection('connected');
    expect(infiniteOn('.unified-indicator')).toBeGreaterThan(0); // in-call breathing runs

    setConnection('disconnected');
    expect(infiniteOn('.unified-indicator')).toBe(before);
    expect(before).toBe(0);
    indicator.disposeUnifiedIndicator();
  });
});

describe('#coach.is-connected has one owner (coach.ui)', () => {
  /** The CSS idle loops that is-connected gates (inline-styles.css). */
  const BREATHING = '#coach.is-connected:not(.is-speaking):not(.is-thinking):not(.is-listening) #coachAvatar';
  const RING = '#coach.is-connected:not(.is-speaking):not(.is-thinking):not(.is-listening) #avatarRing';
  const BLINK = '#coach.is-connected:not(.is-speaking):not(.is-listening):not(.is-thinking) .avatar-eyes .eye-main';

  async function mount() {
    document.body.innerHTML = `
      <div id="coach"><div class="avatar-container"><div id="avatarRing"></div>
        <div id="coachAvatar"><span id="avatarText"></span>
          <svg class="avatar-eyes"><ellipse class="eye-main eye-left"></ellipse></svg></div></div>
        <div id="personaName"></div><div id="personaSubtitle"></div><div id="statusIndicator"></div></div>`;
    const coach = await import('../../src/ui/coach.ui.js');
    const { expressiveEyes } = await import('../../src/ui/expressive-eyes.ui.js');
    coach.initCoachUI();
    expressiveEyes.init();
    return { coach, eyes: expressiveEyes };
  }
  const coachEl = (): HTMLElement => document.getElementById('coach') as HTMLElement;
  const q = (sel: string): Element => document.querySelector(sel) as Element;

  it('after hang-up, the eyes going idle leave #coach disconnected', async () => {
    const { coach, eyes } = await mount();
    coach.updateConnectionState('connected');
    eyes.setVoiceState('speaking');
    coach.updateConnectionState('disconnected');
    eyes.setVoiceState('idle'); // what app.ts and the turn driver do on hang-up
    expect(coachEl().classList.contains('is-connected')).toBe(false);
    expect(q('#coachAvatar').matches(BREATHING)).toBe(false);
    expect(q('.eye-main').matches(BLINK)).toBe(false);
  });

  it('on connect, coach.ui sets is-connected before any eye state, so breathing and blink start', async () => {
    const { coach, eyes } = await mount();
    expect(coachEl().classList.contains('is-connected')).toBe(false);
    coach.updateConnectionState('connected'); // no setVoiceState yet
    expect(coachEl().classList.contains('is-connected')).toBe(true);
    expect(q('#coachAvatar').matches(BREATHING)).toBe(true);
    expect(q('#avatarRing').matches(RING)).toBe(true);
    expect(q('.eye-main').matches(BLINK)).toBe(true);
    eyes.setVoiceState('speaking');
    eyes.setVoiceState('idle');
    expect(q('#coachAvatar').matches(BREATHING)).toBe(true); // still connected mid-call
  });
});
