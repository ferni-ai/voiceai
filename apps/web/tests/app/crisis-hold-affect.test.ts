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
import { initBetterThanHumanSignalHandlers } from '../../src/eq/bridge/humanization-bridge.js';
import { t } from '../../src/i18n/index.js';
import { delightService } from '../../src/services/delight.service.js';
import { appState } from '../../src/state/app.state.js';
import type { DataMessage } from '../../src/types/events.js';
import { avatarFeedback } from '../../src/ui/avatar-feedback.ui.js';
import { avatarLamp, initAvatarLamp } from '../../src/ui/avatar-lamp.ui.js';
import { initAvatarSoul } from '../../src/ui/avatar-soul.ui.js';
import { avatarTapReactionsUI } from '../../src/ui/avatar-tap-reactions.ui.js';
import { CelebrationUI } from '../../src/ui/celebration.ui.js';
import { celebrationsUI } from '../../src/ui/celebrations.ui.js';
import { coachUI, initCoachUI } from '../../src/ui/coach.ui.js';
import { isCrisisFaceHeld } from '../../src/ui/face/crisis-face-hold.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import { ferniMilestones } from '../../src/ui/ferni-milestones.ui.js';
import { getMomentsManager } from '../../src/ui/moments/manager.js';
import { noteConnectionState } from '../../src/ui/milestone-placement.js';
import { resetToastRegion } from '../../src/ui/overlay/toast-region.js';
import { presenceUI } from '../../src/ui/presence.ui.js';
import { soundUI } from '../../src/ui/sound.ui.js';
import { initWaveformUI, waveformUI } from '../../src/ui/waveform.ui.js';
import { haptics } from '../../src/utils/haptics.js';

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
  <div id="waveformContainer"></div>
  <div id="app"></div>`;
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
const originalGetAnimations = Element.prototype.getAnimations;

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
  Element.prototype.getAnimations = () => []; // jsdom has none
  document.body.appendChild(root);
  initCoachUI();
  presenceUI.init();
  avatarFeedback.init();
  initAvatarLamp();
  initWaveformUI();
  initAvatarSoul(); // the memory spark
  initBetterThanHumanSignalHandlers(); // name lift and temporal insight reach the soul through it
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
  Element.prototype.getAnimations = originalGetAnimations;
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

// The crisis lead's second list (2026-11-10): ten more playful affects the hold
// keeps still, four calm ones it lets play.
describe('more playful affect held during a crisis', () => {
  it('the presence joy flash plays, then not during a crisis', async () => {
    expect(animationsOn(byId('coachAvatar'), () => presenceUI.joy())).toBe(1);
    await sendCrisis();
    expect(animationsOn(byId('coachAvatar'), () => presenceUI.joy())).toBe(0);
  });

  it('the realization double-take pops, then not during a crisis', async () => {
    expect(tweensOn(avatarContainer(), () => ferniExpressions.realization())).toBeGreaterThan(0);
    gsap.killTweensOf(avatarContainer());
    await sendCrisis();
    expect(tweensOn(avatarContainer(), () => ferniExpressions.realization())).toBe(0);
  });

  it('the lamp perks up (directly, on a memory callback, surprised or proud), then not during a crisis', async () => {
    const avatar = byId('coachAvatar');
    const memoryCallback = (): void => {
      document.dispatchEvent(new CustomEvent('ferni:memory-callback'));
    };
    expect(tweensOn(avatar, () => avatarLamp.perkUp())).toBeGreaterThan(0);
    expect(tweensOn(avatar, memoryCallback)).toBeGreaterThan(0);
    expect(tweensOn(avatar, () => avatarLamp.express('surprised'))).toBeGreaterThan(0);
    gsap.killTweensOf(avatar);

    await sendCrisis();
    expect(tweensOn(avatar, () => avatarLamp.perkUp())).toBe(0);
    expect(tweensOn(avatar, memoryCallback)).toBe(0);
    expect(tweensOn(avatar, () => avatarLamp.express('surprised'))).toBe(0);
    expect(tweensOn(avatar, () => avatarLamp.express('proud'))).toBe(0);
  });

  it('the laugh, happy and surprise reactions play, then not during a crisis', async () => {
    const playful = ['laugh', 'happy', 'surprise'] as const;
    for (const reaction of playful) {
      expect(classesDuring(coach(), 'reaction-', () => avatarFeedback.react(reaction))).toEqual([
        `reaction-${reaction}`,
      ]);
      vi.advanceTimersByTime(1_000);
    }

    await sendCrisis();
    for (const reaction of playful) {
      expect(classesDuring(coach(), 'reaction-', () => avatarFeedback.react(reaction))).toEqual([]);
    }
    // The calm ones still play.
    expect(classesDuring(coach(), 'reaction-', () => avatarFeedback.react('empathy'))).toEqual([
      'reaction-empathy',
    ]);
    vi.advanceTimersByTime(1_000);
  });

  it('the avatar dances to music, then not during a crisis', async () => {
    expect(animationsOn(byId('coachAvatar'), () => avatarFeedback.musicPresence())).toBeGreaterThan(
      0
    );
    expect(avatarFeedback.isDancing()).toBe(true);
    avatarFeedback.stopDancing();

    await sendCrisis();
    expect(animationsOn(byId('coachAvatar'), () => avatarFeedback.musicPresence())).toBe(0);
    expect(avatarFeedback.isDancing()).toBe(false);
  });

  it('a celebration message buzzes, then not during a crisis', async () => {
    const buzz = vi.spyOn(delightService, 'haptic').mockImplementation(() => undefined);
    await send('celebration', { celebrationType: 'good_news' });
    await send('celebration', { celebrationType: 'milestone', message: 'ten calls' });
    expect(buzz.mock.calls).toEqual([['light'], ['light']]);
    vi.advanceTimersByTime(2_000);
    buzz.mockClear();

    await sendCrisis();
    await send('celebration', { celebrationType: 'good_news' });
    await send('celebration', { celebrationType: 'aha_moment' });
    await send('celebration', { celebrationType: 'milestone', message: 'ten calls' });
    expect(buzz).not.toHaveBeenCalled();
    buzz.mockRestore();
  });

  it("the waveform's laugh particles burst, then not during a crisis", async () => {
    const particles = (): number => root.querySelectorAll('.waveform-particles > *').length;
    waveformUI.burstCelebration();
    expect(particles()).toBeGreaterThan(0);
    vi.advanceTimersByTime(5_000);
    root.querySelectorAll('.waveform-particles > *').forEach((p) => p.remove());

    await sendCrisis();
    waveformUI.burstCelebration();
    expect(particles()).toBe(0);
  });

  describe('the memory spark', () => {
    const sparkParts = (): Element[] => {
      const spark = root.querySelector('.soul-memory-spark')!;
      return [spark, ...spark.querySelectorAll('*')];
    };
    const sparkTweens = (): number => gsap.getTweensOf(sparkParts()).length;

    // Each humanization signal type has a 3 s cooldown on the wall clock.
    let now = 9_000_000;
    let clock: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 5_000));
    });
    afterEach(() => clock.mockRestore());

    /** Tweens the spark gained from `fire` (GSAP's ticker does not run here, so old ones stay). */
    async function sparkOn(fire: () => void | Promise<void>): Promise<number> {
      const before = sparkTweens();
      await fire();
      // The name lift and temporal insight import the soul first: let that resolve.
      for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
      const n = sparkTweens() - before;
      await vi.advanceTimersByTimeAsync(10_000);
      avatarContainer().removeAttribute('data-name-lift'); // a lift never plays over another
      return n;
    }

    const paths: Array<[string, () => void | Promise<void>]> = [
      [
        'a memory callback',
        () => void document.dispatchEvent(new CustomEvent('ferni:memory-callback')),
      ],
      [
        'a name lift',
        () => send('humanization_signal', { signalType: 'name_lift', effect: 'brighten' }),
      ],
      [
        'a temporal insight',
        () => send('humanization_signal', { signalType: 'temporal_insight', intensity: 0.8 }),
      ],
      ['an inside joke', () => void document.dispatchEvent(new CustomEvent('ferni:inside-joke'))],
    ];

    for (const [name, fire] of paths) {
      it(`flashes on ${name}, then not during a crisis`, async () => {
        expect(await sparkOn(fire)).toBeGreaterThan(0);
        await sendCrisis();
        expect(await sparkOn(fire)).toBe(0);
      });
    }
  });

  describe('the ferni milestone celebration', () => {
    let sound: ReturnType<typeof vi.spyOn>;
    let bigWin: ReturnType<typeof vi.spyOn>;
    let celebrated: number;
    const onCelebrated = (): void => {
      celebrated++;
    };
    const celebrations = (): number =>
      sound.mock.calls.length + bigWin.mock.calls.length + celebrated;

    beforeEach(() => {
      resetToastRegion();
      ferniMilestones.resetMilestones();
      sound = vi.spyOn(soundUI, 'play').mockImplementation(() => undefined);
      bigWin = vi.spyOn(haptics, 'bigWin').mockImplementation(() => undefined);
      celebrated = 0;
      window.addEventListener('ferni:milestone-celebrated', onCelebrated);
    });
    afterEach(async () => {
      window.removeEventListener('ferni:milestone-celebrated', onCelebrated);
      appState.set('connection', 'disconnected');
      appState.set('audio', 'idle');
      await vi.advanceTimersByTimeAsync(5_000); // let a celebration finish before the next test
      sound.mockRestore();
      bigWin.mockRestore();
      ferniMilestones.resetMilestones();
    });

    it('plays its sound, big-win buzz and moment outside a crisis', async () => {
      ferniMilestones.triggerMilestone('one-year');
      await vi.advanceTimersByTimeAsync(100);
      expect(sound).toHaveBeenCalledWith('celebrate');
      expect(bigWin).toHaveBeenCalledTimes(1);
      expect(celebrated).toBe(1);
    });

    it('a milestone crossed during the hold is dropped, and never plays after the call ends', async () => {
      await sendCrisis();
      ferniMilestones.triggerMilestone('one-year');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(celebrations()).toBe(0);

      onCallEnded();
      ferniMilestones.triggerMilestone('one-year');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(celebrations()).toBe(0);
      expect(ferniMilestones.getMilestones().find((m) => m.id === 'one-year')?.celebrated).toBe(
        true
      );
    });

    // While Ferni speaks a milestone waits in the queue and is tried again later.
    async function queueWhileSpeaking(): Promise<void> {
      appState.set('connection', 'connected');
      appState.set('audio', 'speaking');
      ferniMilestones.triggerMilestone('one-year');
      await vi.advanceTimersByTimeAsync(10);
      expect(sound).not.toHaveBeenCalled();
    }

    it('a milestone waiting while Ferni speaks plays once he stops', async () => {
      await queueWhileSpeaking();
      appState.set('audio', 'idle');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sound).toHaveBeenCalledWith('celebrate');
    });

    it('a milestone still waiting when the hold starts is dropped', async () => {
      await queueWhileSpeaking();
      await sendCrisis();
      appState.set('audio', 'idle');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sound).not.toHaveBeenCalled();
      expect(bigWin).not.toHaveBeenCalled();

      onCallEnded();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sound).not.toHaveBeenCalled();
    });

    // Queued before the hold, and the call ends before the queue's next retry:
    // the hold has lifted by then, so only a drop at hold start keeps it silent.
    const queuedBeforeTheCallEnds = [
      {
        window: 'the speaking retry: queued while Ferni speaks, call ends 1 s later',
        queue: queueWhileSpeaking,
        crisisAfterMs: 0,
        endAfterMs: 1_000,
      },
      {
        window: 'the opening settle: queued at connect, crisis at 5 s, call ends at 10 s',
        queue: async (): Promise<void> => {
          appState.set('connection', 'connected');
          noteConnectionState('connected'); // what the milestones' connection listener records
          appState.set('audio', 'idle');
          ferniMilestones.triggerMilestone('one-year');
          await vi.advanceTimersByTimeAsync(10);
          expect(sound).not.toHaveBeenCalled();
        },
        crisisAfterMs: 5_000,
        endAfterMs: 5_000,
      },
    ];

    async function endTheCall(afterMs: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(afterMs);
      appState.set('connection', 'disconnected');
      noteConnectionState('disconnected');
      onCallEnded();
    }

    for (const { window: name, queue, crisisAfterMs, endAfterMs } of queuedBeforeTheCallEnds) {
      describe(name, () => {
        it('with no crisis, it still celebrates after the call ends', async () => {
          await queue();
          await vi.advanceTimersByTimeAsync(crisisAfterMs);
          await endTheCall(endAfterMs);
          await vi.advanceTimersByTimeAsync(60_000);
          expect(sound).toHaveBeenCalledWith('celebrate');
          expect(bigWin).toHaveBeenCalledTimes(1);
        });

        it('with a crisis, it is dropped and never plays after the call ends', async () => {
          await queue();
          await vi.advanceTimersByTimeAsync(crisisAfterMs);
          await sendCrisis();
          await endTheCall(endAfterMs);
          expect(isCrisisFaceHeld()).toBe(false);
          await vi.advanceTimersByTimeAsync(60_000); // past every retry and the opening settle
          expect(sound).not.toHaveBeenCalledWith('celebrate');
          expect(bigWin).not.toHaveBeenCalled();
        });
      });
    }
  });

  it('the first-connection celebration plays, then not during a crisis', async () => {
    const shown = (): string[] =>
      [
        byId('app').classList.contains('first-connection') && 'first-connection',
        avatarContainer().classList.contains('connection-warmth') && 'connection-warmth',
      ].filter((c): c is string => Boolean(c));
    celebrationsUI.celebrateFirstConnection();
    expect(shown()).toEqual(['first-connection', 'connection-warmth']);
    vi.advanceTimersByTime(10_000);
    expect(shown()).toEqual([]);

    await sendCrisis();
    celebrationsUI.celebrateFirstConnection();
    expect(shown()).toEqual([]);
  });

  it('the "tickles" whisper plays on 5+ rapid taps, then not during a crisis', async () => {
    let now = 5_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 2_000)); // past the cooldown
    const whisper = vi.spyOn(avatarFeedback, 'whisper');
    const tickles = (): number =>
      whisper.mock.calls.filter(([text]) => text === t('avatarTapReactions.tickles')).length;
    avatarTapReactionsUI.init();

    for (let i = 0; i < 6; i++) byId('coachAvatar').click();
    vi.advanceTimersByTime(2_000);
    expect(tickles()).toBe(1);
    vi.advanceTimersByTime(2_000);

    await sendCrisis();
    for (let i = 0; i < 6; i++) byId('coachAvatar').click();
    vi.advanceTimersByTime(2_000);
    expect(tickles()).toBe(1);

    avatarTapReactionsUI.dispose();
    whisper.mockRestore();
    clock.mockRestore();
  });
});

describe('calm affect that still plays during a crisis', () => {
  beforeEach(async () => {
    await sendCrisis();
  });

  it('the presence nod, shake, pulse and curious tilt', () => {
    for (const play of [
      presenceUI.nod,
      presenceUI.shake,
      presenceUI.pulse,
      presenceUI.curiousTilt,
    ]) {
      expect(animationsOn(avatarContainer(), play)).toBe(1);
    }
  });

  it('the lamp tilt and nod', () => {
    const avatar = byId('coachAvatar');
    expect(tweensOn(avatar, () => avatarLamp.tilt('right', 0.6))).toBeGreaterThan(0);
    expect(tweensOn(avatar, () => avatarLamp.nod(1, 'slow'))).toBeGreaterThan(0);
  });

  it('the connection warmth', () => {
    celebrationsUI.connectionWarmth();
    expect(avatarContainer().classList.contains('connection-warmth')).toBe(true);
    vi.advanceTimersByTime(10_000);
  });

  it('the soft acknowledgement', () => {
    celebrationsUI.softAcknowledge();
    expect(avatarContainer().classList.contains('soft-acknowledge')).toBe(true);
    vi.advanceTimersByTime(10_000);
  });
});

describe('the coach ring when a face layer throws', () => {
  it('still goes back to calm', async () => {
    coachUI.setEmotion('excited');
    expect(coach().classList.contains('emotion-excited')).toBe(true);
    const broken = vi.spyOn(presenceUI, 'setVoiceEmotion').mockImplementation(() => {
      throw new Error('glow layer failed');
    });

    await sendCrisis();
    broken.mockRestore();
    const ring = [...coach().classList].filter(
      (c) => c.startsWith('emotion-') || c === 'persona-transitioning'
    );
    expect(ring).toEqual(['emotion-calm']);
  });
});
