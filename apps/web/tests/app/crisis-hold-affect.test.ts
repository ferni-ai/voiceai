/**
 * The crisis hold keeps every playful affect still, not only the faces.
 *
 * The hold starts the way the agent starts it (a crisis_detected message
 * through the real backend sender and the web's handleDataMessage). Each row
 * plays one affect twice through its real production writer: once with no
 * crisis, where it must play, then during a crisis, where it must not. Warmth
 * and glow, the calm affect, still play during the hold, and the coach ring
 * goes back to calm when the hold starts.
 *
 * The rows read what each writer leaves behind: a class, an element, a Web
 * Animation or a GSAP tween on the avatar. Nothing here is mocked except the
 * browser APIs jsdom lacks (Element.animate is recorded, not run).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

// The app reads GSAP from the CDN global (utils/gsap-setup.ts); hand it the real package.
vi.mock('../../src/utils/gsap-setup.js', async () => {
  const { gsap } = await import('gsap');
  return { gsap, default: gsap };
});

import { gsap } from 'gsap';

import {
  createDataMessageSender,
  type DataMessageRoom,
} from '../../../../src/agents/shared/data-message-envelope.js';

import { onCallEnded } from '../../src/app/call-end.js';
import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { CRISIS_CALM_AFFECT } from '../../src/config/crisis-faces.js';
import { appState } from '../../src/state/app.state.js';
import type { DataMessage } from '../../src/types/events.js';
import { avatarFeedback } from '../../src/ui/avatar-feedback.ui.js';
import { avatarLamp, initAvatarLamp } from '../../src/ui/avatar-lamp.ui.js';
import { avatarTapReactionsUI } from '../../src/ui/avatar-tap-reactions.ui.js';
import { CelebrationUI } from '../../src/ui/celebration.ui.js';
import { celebrationsUI } from '../../src/ui/celebrations.ui.js';
import { coachUI, initCoachUI } from '../../src/ui/coach.ui.js';
import { isCrisisFaceHeld } from '../../src/ui/face/crisis-face-hold.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import { getMomentsManager } from '../../src/ui/moments/manager.js';
import { resetToastRegion } from '../../src/ui/overlay/toast-region.js';
import { presenceUI } from '../../src/ui/presence.ui.js';
import { initWaveformUI, waveformUI } from '../../src/ui/waveform.ui.js';

/** Room double: what the agent publishes is delivered to the web's handler. */
function roomWiredToWeb(): DataMessageRoom {
  return {
    localParticipant: {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        handleDataMessage(JSON.parse(new TextDecoder().decode(data)) as DataMessage);
      },
    },
  } as DataMessageRoom;
}

async function send(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  await createDataMessageSender(roomWiredToWeb())(type, payload);
}

async function sendCrisis(): Promise<void> {
  await send('crisis_detected', { severity: 0.9, indicators: ['hopelessness'] });
  expect(isCrisisFaceHeld()).toBe(true);
}

const root = document.createElement('div');
root.innerHTML = `
  <div id="coach">
    <div class="avatar-container" data-emotion="neutral">
      <div id="avatarRing"></div>
      <div id="coachAvatar" class="ferni-avatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div>
      <span id="avatarText"></span>
    </div>
    <span id="statusIndicator"></span>
  </div>
  <span id="personaName"></span>
  <span id="personaSubtitle"></span>
  <div id="waveformContainer"></div>`;
const byId = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#${id}`)!;
const avatarContainer = (): HTMLElement => root.querySelector<HTMLElement>('.avatar-container')!;
const coach = (): HTMLElement => byId('coach');

/** Web Animations started on `el` while `play` runs (Element.animate is recorded below). */
let animated: Array<{ el: Element; keyframes: unknown }> = [];
function animationsOn(el: Element, play: () => void): number {
  animated = [];
  play();
  vi.advanceTimersByTime(1_000); // writers that start their motion on a short delay
  return animated.filter((a) => a.el === el).length;
}

/** GSAP tweens running on `el` right after `play` (each writer kills its own first). */
function tweensOn(el: Element, play: () => void): number {
  gsap.killTweensOf(el);
  play();
  return gsap.getTweensOf(el).length;
}

function classesDuring(el: Element, prefix: string, play: () => void): string[] {
  play();
  return [...el.classList].filter((c) => c.startsWith(prefix));
}

const originalAnimate = Element.prototype.animate;

beforeAll(() => {
  Element.prototype.animate = function (this: Element, keyframes: unknown) {
    animated.push({ el: this, keyframes });
    return {
      playState: 'finished',
      finished: new Promise(() => undefined),
      cancel: () => undefined,
      pause: () => undefined,
      play: () => undefined,
      commitStyles: () => undefined,
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
  document.body.appendChild(root);
  initCoachUI();
  presenceUI.init();
  avatarFeedback.init();
  initAvatarLamp();
  initWaveformUI();
  ferniExpressions.setExpression('neutral'); // creates the lid overlay and the sparkle layer
});

beforeEach(() => {
  // The shared setup empties the body before each test; the UI modules keep
  // references to these nodes, so put the same ones back.
  document.body.appendChild(root);
});

afterEach(() => {
  onCallEnded();
  vi.clearAllTimers();
  for (const c of [...coach().classList])
    if (c.startsWith('tap-reaction-')) coach().classList.remove(c);
  for (const c of ['gentle-bounce', 'warmth-glow', 'warmth-warm', 'warmth-gentle']) {
    avatarContainer().classList.remove(c);
  }
});

afterAll(() => {
  Element.prototype.animate = originalAnimate;
  vi.useRealTimers();
});

describe('squash and jump motion', () => {
  it('the presence hop plays, then not during a crisis', async () => {
    expect(animationsOn(avatarContainer(), () => presenceUI.bounce())).toBe(1);
    await sendCrisis();
    expect(animationsOn(avatarContainer(), () => presenceUI.bounce())).toBe(0);
  });

  it('the coach bounce plays, then not during a crisis', async () => {
    expect(animationsOn(byId('coachAvatar'), () => coachUI.bounce())).toBe(1);
    await sendCrisis();
    expect(animationsOn(byId('coachAvatar'), () => coachUI.bounce())).toBe(0);
  });

  it("a held pose's squash and hop play, then not during a crisis", async () => {
    expect(
      tweensOn(avatarContainer(), () => ferniExpressions.heldPose('happy', 400))
    ).toBeGreaterThan(0);
    await sendCrisis();
    expect(tweensOn(avatarContainer(), () => ferniExpressions.heldPose('empathetic', 400))).toBe(0);
  });

  it('the gentle bounce and the pixar bounce play, then not during a crisis', async () => {
    expect(
      classesDuring(avatarContainer(), 'gentle-bounce', () => celebrationsUI.gentleBounce())
    ).toEqual(['gentle-bounce']);
    expect(
      classesDuring(coach(), 'react-bounce', () => avatarFeedback.pixarReact('bounce'))
    ).toEqual(['react-bounce']);
    avatarContainer().classList.remove('gentle-bounce');
    vi.advanceTimersByTime(1_000);

    await sendCrisis();
    expect(
      classesDuring(avatarContainer(), 'gentle-bounce', () => celebrationsUI.gentleBounce())
    ).toEqual([]);
    expect(
      classesDuring(coach(), 'react-bounce', () => avatarFeedback.pixarReact('bounce'))
    ).toEqual([]);
  });

  it('a celebration message from the agent hops nothing during a crisis', async () => {
    await sendCrisis();
    const before = animated.length;
    await send('celebration', { celebrationType: 'good_news' });
    await send('celebration', { celebrationType: 'aha_moment' });
    vi.advanceTimersByTime(1_000);
    const hops = animated
      .slice(before)
      .filter((a) => a.el === avatarContainer() || a.el === byId('coachAvatar'));
    expect(hops).toEqual([]);
    expect(avatarContainer().classList.contains('gentle-bounce')).toBe(false);
  });
});

describe('sparkles', () => {
  const sparkles = (): number => coach().querySelectorAll('.emotion-sparkle').length;

  it('the warmth sparkle plays, then not during a crisis', async () => {
    ferniExpressions.warmthSparkle();
    expect(sparkles()).toBeGreaterThan(0);
    coach().querySelector('.emotion-sparkles-container')!.innerHTML = '';

    await sendCrisis();
    ferniExpressions.warmthSparkle();
    await send('wrap_up', { sentiment: 'warm' }); // the farewell's "extra warmth: gentle sparkle"
    expect(sparkles()).toBe(0);
  });

  it("the persona swap's ring sparkle plays, then not during a crisis", async () => {
    const persona = appState.get('activePersona');
    coachUI.updatePersona(persona);
    expect(coach().classList.contains('persona-transitioning')).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(coach().classList.contains('persona-transitioning')).toBe(false);

    await sendCrisis();
    coachUI.updatePersona(persona);
    expect(coach().classList.contains('persona-transitioning')).toBe(false);
  });
});

describe('lamp bounce', () => {
  it('the lamp bounces and laugh-shakes, then not during a crisis', async () => {
    expect(tweensOn(byId('coachAvatar'), () => avatarLamp.bounce(0.8, 2))).toBeGreaterThan(0);
    expect(tweensOn(byId('coachAvatar'), () => avatarLamp.shake(0.6))).toBeGreaterThan(0);

    await sendCrisis();
    expect(tweensOn(byId('coachAvatar'), () => avatarLamp.bounce(0.8, 2))).toBe(0);
    expect(tweensOn(byId('coachAvatar'), () => avatarLamp.shake(0.6))).toBe(0);
    expect(tweensOn(byId('coachAvatar'), () => avatarLamp.express('celebrating'))).toBe(0);
  });
});

describe('tap reactions', () => {
  it('laugh and wink play on a tap, then not during a crisis', async () => {
    for (const reaction of ['laugh', 'wink'] as const) {
      expect(
        classesDuring(coach(), 'tap-reaction-', () => avatarTapReactionsUI.playReaction(reaction))
      ).toEqual([`tap-reaction-${reaction}`]);
      vi.advanceTimersByTime(1_000);
    }

    await sendCrisis();
    for (const reaction of ['laugh', 'wink', 'giggle'] as const) {
      expect(
        classesDuring(coach(), 'tap-reaction-', () => avatarTapReactionsUI.playReaction(reaction))
      ).toEqual([]);
    }
  });

  it('a real tap on the avatar plays nothing during a crisis', async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 2_000)); // past the cooldown
    avatarTapReactionsUI.init();
    byId('coachAvatar').click();
    expect(classesDuring(coach(), 'tap-reaction-', () => undefined)).toHaveLength(1);
    vi.advanceTimersByTime(2_000);

    await sendCrisis();
    for (let i = 0; i < 6; i++) byId('coachAvatar').click(); // 5+ rapid taps: the special bounce
    vi.advanceTimersByTime(2_000);
    expect(classesDuring(coach(), 'tap-reaction-', () => undefined)).toEqual([]);
    expect(coach().classList.contains('react-bounce')).toBe(false);
    avatarTapReactionsUI.dispose();
    clock.mockRestore();
  });
});

describe('celebration overlays', () => {
  beforeEach(() => resetToastRegion()); // its root is cached, and the shared setup empties the body
  it("the milestone's joy hop and ring pulse play, then not during a crisis (its warmth still does)", async () => {
    expect(
      animationsOn(byId('avatarRing'), () => celebrationsUI.celebrateMilestone('ten calls'))
    ).toBe(1);
    avatarContainer().classList.remove('warmth-glow', 'warmth-warm');

    vi.advanceTimersByTime(2_000);

    await sendCrisis();
    animated = [];
    celebrationsUI.celebrateMilestone('ten calls');
    expect(avatarContainer().classList.contains('warmth-glow')).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(
      animated.filter((a) => a.el === byId('avatarRing') || a.el === byId('coachAvatar'))
    ).toEqual([]);
  });

  // Celebrations render as achievement toasts by default (ui/overlay/toast-flag.ts).
  it('the celebration overlay shows, then not during a crisis', async () => {
    const overlay = new CelebrationUI();
    void overlay.celebrate({ type: 'small_win', title: 'first big win' });
    await vi.advanceTimersByTimeAsync(50);
    expect(document.body.textContent).toContain('first big win');

    await sendCrisis();
    void overlay.celebrate({ type: 'small_win', title: 'second big win' });
    await vi.advanceTimersByTimeAsync(50);
    expect(document.body.textContent).not.toContain('second big win');
    overlay.destroy();
  });

  it('the moments celebration and milestone show, then not during a crisis', async () => {
    const moments = getMomentsManager();
    void moments.celebrate('small_win', { title: 'first moment win' });
    await vi.advanceTimersByTimeAsync(50);
    expect(document.body.textContent).toContain('first moment win');
    moments.dismissAll();
    await vi.advanceTimersByTimeAsync(10_000);

    await sendCrisis();
    void moments.celebrate('small_win', { title: 'second moment win' });
    void moments.milestone('anniversary', {
      title: 'one year together',
      message: 'a year of talks',
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.body.textContent).not.toContain('second moment win');
    expect(document.body.textContent).not.toContain('one year together');
  });

  it('a milestone shows outside a crisis', async () => {
    void getMomentsManager().milestone('anniversary', {
      title: 'one year together',
      message: 'hi',
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.body.textContent).toContain('one year together');
    getMomentsManager().dismissAll();
    await vi.advanceTimersByTimeAsync(2_000);
  });

  it('the waveform celebrates, then not during a crisis', async () => {
    waveformUI.celebrate();
    expect(byId('waveformContainer').classList.contains('celebrating')).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(byId('waveformContainer').classList.contains('celebrating')).toBe(false);

    await sendCrisis();
    await send('celebration', { celebrationType: 'milestone', message: 'ten calls' });
    waveformUI.celebrate();
    expect(byId('waveformContainer').classList.contains('celebrating')).toBe(false);
  });
});

describe('the calm affect during the hold', () => {
  it('only warmth and glow are allowed', () => {
    expect([...CRISIS_CALM_AFFECT].sort()).toEqual(['glow', 'warm']);
  });

  it('warmth still plays during a crisis', async () => {
    await sendCrisis();
    celebrationsUI.warmthGlow({ intensity: 'warm' });
    expect(avatarContainer().classList.contains('warmth-glow')).toBe(true);
  });

  it('the glow still follows a calm face during a crisis', async () => {
    await sendCrisis();
    expect(avatarContainer().getAttribute('data-emotion')).toBe('empathetic');
    presenceUI.setVoiceEmotion('attentive' as Parameters<typeof presenceUI.setVoiceEmotion>[0]);
    expect(presenceUI.getVoiceEmotion()).toBe('attentive');
    expect(avatarContainer().getAttribute('data-emotion')).toBe('attentive');
  });
});

describe('the coach ring', () => {
  it('goes back to calm when the hold starts', async () => {
    coachUI.setEmotion('excited');
    coachUI.updatePersona(appState.get('activePersona')); // the ring sparkle, mid-play
    expect(coach().classList.contains('emotion-excited')).toBe(true);
    expect(coach().classList.contains('persona-transitioning')).toBe(true);

    await sendCrisis();
    const ring = [...coach().classList].filter(
      (c) => c.startsWith('emotion-') || c === 'persona-transitioning'
    );
    expect(ring).toEqual(['emotion-calm']);
  });

  it('every affect plays again once the call ends', async () => {
    await sendCrisis();
    onCallEnded();
    expect(animationsOn(avatarContainer(), () => presenceUI.bounce())).toBe(1);
    ferniExpressions.warmthSparkle();
    expect(coach().querySelectorAll('.emotion-sparkle').length).toBeGreaterThan(0);
    expect(
      classesDuring(coach(), 'tap-reaction-', () => avatarTapReactionsUI.playReaction('wink'))
    ).toEqual(['tap-reaction-wink']);
  });
});
