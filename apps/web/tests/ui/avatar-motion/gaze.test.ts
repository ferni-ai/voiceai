/**
 * Conversational gaze (behind ferni:gaze, off by default): Ferni looks at the
 * user while they talk, glances away at the start of his own turn and comes
 * back, looks up and right while thinking, follows the pointer only when
 * idle, and holds still under reduced motion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  AT_USER,
  AVATAR_TURN_EVENT,
  GAZE_ATTR,
  LOOK_AWAY,
  LOOK_AWAY_MAX_MS,
  MAX_GAZE_PX,
  SACCADE_MAX_MS,
  SACCADE_PX,
  THINKING_GAZE,
  createGaze,
  disposeGaze,
  initGaze,
  phaseFromSpeaker,
  pointerBias,
  type GazeDeps,
  type GazePoint,
} from '../../../src/ui/avatar-motion/gaze.js';

interface Harness {
  deps: GazeDeps;
  looks: GazePoint[];
  last: () => GazePoint;
  run: () => void;
  pending: () => number;
}

/** Fake scheduler: `run` fires the one pending timer, like a timeline step. */
function harness(randoms: number[], reduced = false): Harness {
  const looks: GazePoint[] = [];
  let queue: Array<{ fn: () => void; cancelled: boolean }> = [];
  let i = 0;
  const deps: GazeDeps = {
    render: (p) => looks.push(p),
    random: () => randoms[i++ % randoms.length],
    schedule: (fn) => {
      const entry = { fn, cancelled: false };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    reducedMotion: () => reduced,
  };
  return {
    deps,
    looks,
    last: () => looks[looks.length - 1],
    run: () => {
      const live = queue.filter((e) => !e.cancelled);
      queue = [];
      live.forEach((e) => e.fn());
    },
    pending: () => queue.filter((e) => !e.cancelled).length,
  };
}

const RECT = { left: 100, top: 100, width: 100, height: 100 };

describe('phaseFromSpeaker', () => {
  it('maps contract and turn-driver speaker names', () => {
    expect(phaseFromSpeaker('speaking')).toBe('speaking');
    expect(phaseFromSpeaker('ferni')).toBe('speaking');
    expect(phaseFromSpeaker('listening')).toBe('listening');
    expect(phaseFromSpeaker('user')).toBe('listening');
    expect(phaseFromSpeaker('thinking')).toBe('thinking');
    expect(phaseFromSpeaker('none')).toBe('idle');
    expect(phaseFromSpeaker(undefined)).toBe('idle');
  });
});

describe('pointerBias', () => {
  it('looks toward the pointer, never past the max offset', () => {
    const right = pointerBias(2000, 150, RECT);
    expect(right.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThanOrEqual(MAX_GAZE_PX);
    expect(Math.abs(right.y)).toBeLessThan(0.01);
    const upLeft = pointerBias(0, 0, RECT);
    expect(upLeft.x).toBeLessThan(0);
    expect(upLeft.y).toBeLessThan(0);
  });

  it('stays centred when the pointer is on the avatar centre', () => {
    expect(pointerBias(152, 148, RECT)).toEqual(AT_USER);
  });
});

describe('gaze policy', () => {
  it('glances away at the start of Ferni turn, then comes back to the user', () => {
    const h = harness([0.1]); // 0.1 < 0.7: glance away
    const gaze = createGaze(h.deps);
    gaze.setPhase('speaking');
    expect(h.last()).toEqual(LOOK_AWAY);
    h.run();
    expect(h.last()).toEqual(AT_USER);
  });

  it('sometimes starts a turn looking straight at the user', () => {
    const h = harness([0.9]); // 0.9 >= 0.7: no glance
    const gaze = createGaze(h.deps);
    gaze.setPhase('speaking');
    expect(h.last()).toEqual(AT_USER);
    expect(h.looks).not.toContainEqual(LOOK_AWAY);
  });

  it('looks at the user at once when Ferni yields the turn', () => {
    const h = harness([0.1]);
    const gaze = createGaze(h.deps);
    gaze.setPhase('speaking');
    expect(h.last()).toEqual(LOOK_AWAY);
    gaze.setPhase('listening');
    expect(h.last()).toEqual(AT_USER);
    expect(h.pending()).toBe(1); // only the listening saccade, the glance timer is gone
  });

  it('makes small saccades near the user while listening', () => {
    const h = harness([0.95, 0.05]);
    const gaze = createGaze(h.deps);
    gaze.setPhase('listening');
    for (let n = 0; n < 5; n++) h.run();
    const saccades = h.looks.slice(1);
    expect(saccades.length).toBe(5);
    expect(saccades.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
    saccades.forEach((p) => {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(SACCADE_PX);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(SACCADE_PX);
    });
  });

  it('schedules saccades 1-3 s apart and glances within the look-away window', () => {
    const delays: number[] = [];
    const h = harness([0.5]);
    const schedule = h.deps.schedule;
    h.deps.schedule = (fn, ms) => {
      delays.push(ms);
      return schedule(fn, ms);
    };
    createGaze(h.deps).setPhase('listening');
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThanOrEqual(SACCADE_MAX_MS);
    const g = harness([0.1]);
    const glanceDelays: number[] = [];
    const s2 = g.deps.schedule;
    g.deps.schedule = (fn, ms) => {
      glanceDelays.push(ms);
      return s2(fn, ms);
    };
    createGaze(g.deps).setPhase('speaking');
    expect(glanceDelays[0]).toBeLessThanOrEqual(LOOK_AWAY_MAX_MS);
  });

  it('looks up and right while thinking and holds it', () => {
    const h = harness([0.5]);
    const gaze = createGaze(h.deps);
    gaze.setPhase('thinking');
    expect(h.last()).toEqual(THINKING_GAZE);
    expect(THINKING_GAZE.x).toBeGreaterThan(0);
    expect(THINKING_GAZE.y).toBeLessThan(0);
    expect(h.pending()).toBe(0);
  });

  it('lets the pointer bias the gaze only when idle', () => {
    const h = harness([0.9]);
    const gaze = createGaze(h.deps);
    gaze.setPointerBias({ x: 2, y: 1 });
    expect(h.last()).toEqual({ x: 2, y: 1 });
    gaze.setPhase('listening');
    const before = h.looks.length;
    gaze.setPointerBias({ x: -2, y: 1 });
    expect(h.looks.length).toBe(before);
    gaze.setPhase('idle');
    expect(h.last()).toEqual({ x: -2, y: 1 });
  });

  // Deliberate change (#3787 r2, 2026-11-12): reduced motion used to keep the
  // up-and-right thinking point, a jump with no transition. It now rests on the user.
  it('holds still on the user under reduced motion, thinking included', () => {
    const h = harness([0.1], true);
    const gaze = createGaze(h.deps);
    gaze.setPhase('speaking');
    expect(h.last()).toEqual(AT_USER);
    expect(h.pending()).toBe(0);
    gaze.setPointerBias({ x: 3, y: 0 });
    expect(h.last()).toEqual(AT_USER);
    gaze.setPhase('thinking');
    expect(h.last()).toEqual(AT_USER);
    expect(h.looks.some((p) => p.x === THINKING_GAZE.x)).toBe(false);
  });

  it('clamps every rendered offset to the max', () => {
    const h = harness([0.5]);
    createGaze(h.deps).setPointerBias({ x: 40, y: -40 });
    expect(h.last()).toEqual({ x: MAX_GAZE_PX, y: -MAX_GAZE_PX });
  });
});

describe('initGaze (DOM)', () => {
  const eyes = (): HTMLElement | null => document.getElementById('avatarEyes');

  beforeEach(() => {
    document.body.innerHTML =
      '<div class="avatar-container"><div id="coachAvatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div></div>';
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  afterEach(() => {
    disposeGaze();
    localStorage.removeItem(MOTION_FLAG_KEYS.gaze);
    document.getElementById('avatar-gaze-styles')?.remove();
    vi.restoreAllMocks();
  });

  it('does nothing with the flag off, so presence keeps its own tracking', () => {
    expect(initGaze()).toBe(false);
    expect(eyes()?.hasAttribute(GAZE_ATTR)).toBe(false);
    window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker: 'thinking' } }));
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe('');
    expect(document.getElementById('avatar-gaze-styles')).toBeNull();
  });

  it('renders the turn gaze on the eyes with the flag on', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.gaze, 'true');
    expect(initGaze()).toBe(true);
    expect(eyes()?.hasAttribute(GAZE_ATTR)).toBe(true);
    expect(document.getElementById('avatar-gaze-styles')?.textContent).toContain('translate:');
    window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker: 'thinking' } }));
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe(`${THINKING_GAZE.x}px`);
    expect(eyes()?.style.getPropertyValue('--eye-offset-y')).toBe(`${THINKING_GAZE.y}px`);
    window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker: 'listening' } }));
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe('0px');
  });

  it('measures the avatar on resize, not on every pointer move', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.gaze, 'true');
    const avatar = document.getElementById('coachAvatar');
    if (!avatar) throw new Error('fixture missing');
    const measure = vi.spyOn(avatar, 'getBoundingClientRect');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    initGaze();
    const atInit = measure.mock.calls.length;
    for (let n = 0; n < 5; n++) {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 + n, clientY: 0 }));
    }
    frames.forEach((cb) => cb(0));
    expect(measure.mock.calls.length).toBe(atInit);
    expect(frames.length).toBe(1); // pointer moves coalesce into one frame
    expect(
      Number.parseFloat(eyes()?.style.getPropertyValue('--eye-offset-x') ?? '')
    ).toBeGreaterThan(0);
    window.dispatchEvent(new Event('resize'));
    expect(measure.mock.calls.length).toBe(atInit + 1);
  });

  it('returns to idle on disconnect and cleans up on dispose', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.gaze, 'true');
    initGaze();
    window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker: 'thinking' } }));
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe('0px');
    disposeGaze();
    expect(eyes()?.hasAttribute(GAZE_ATTR)).toBe(false);
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe('');
  });

  it('is torn down when presence is disposed', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.gaze, 'true');
    initGaze();
    const { dispose } = await import('../../../src/ui/presence.ui.js');
    dispose();
    expect(eyes()?.hasAttribute(GAZE_ATTR)).toBe(false);
    window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker: 'thinking' } }));
    expect(eyes()?.style.getPropertyValue('--eye-offset-x')).toBe('');
  });
});

describe('while the crisis face is held (fe 2026-11-11: gaze steady on the caller)', () => {
  it('policy: every phase looks at the user, with 0 saccades and 0 look-aways scheduled', () => {
    const h = harness([0.1]);
    const gaze = createGaze({ ...h.deps, steady: () => true });
    for (const phase of ['speaking', 'listening', 'thinking', 'idle', 'speaking'] as const) {
      gaze.setPhase(phase);
      expect(h.last()).toEqual(AT_USER);
      expect(h.pending()).toBe(0);
    }
    gaze.setPointerBias({ x: 3, y: 0 });
    expect(h.looks.every((p) => p.x === 0 && p.y === 0)).toBe(true);
  });

  it('policy: a hold that starts mid-glance brings the eyes back and stops the saccades', () => {
    const h = harness([0.1]);
    let held = false;
    const gaze = createGaze({ ...h.deps, steady: () => held });
    gaze.setPhase('speaking');
    expect(h.last()).toEqual(LOOK_AWAY);
    held = true;
    gaze.refresh();
    expect(h.last()).toEqual(AT_USER);
    expect(h.pending()).toBe(0);
  });

  describe('initGaze with the real hold', () => {
    const offset = (): string =>
      `${document.getElementById('avatarEyes')?.style.getPropertyValue('--eye-offset-x')},${document.getElementById('avatarEyes')?.style.getPropertyValue('--eye-offset-y')}`;
    const turnTo = (speaker: string): boolean =>
      window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker } }));

    beforeEach(() => {
      vi.useFakeTimers();
      document.body.innerHTML =
        '<div class="avatar-container"><div id="coachAvatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div></div>';
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // always glance away at turn start
      localStorage.setItem(MOTION_FLAG_KEYS.gaze, 'true');
    });

    afterEach(async () => {
      disposeGaze();
      (await import('../../../src/ui/face/crisis-face-hold.js')).releaseCrisisFace();
      localStorage.removeItem(MOTION_FLAG_KEYS.gaze);
      document.getElementById('avatar-gaze-styles')?.remove();
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    /** Every offset the eyes show over a call: speaking, listening, thinking, 30 s. */
    function walk(): Set<string> {
      const seen = new Set<string>();
      for (const speaker of ['ferni', 'user', 'thinking', 'ferni', 'none']) {
        turnTo(speaker);
        seen.add(offset());
        for (let t = 0; t < 6000; t += 100) {
          vi.advanceTimersByTime(100);
          seen.add(offset());
        }
      }
      return seen;
    }

    it('control, no hold: the eyes look away, think up and right, and saccade', () => {
      initGaze();
      const seen = walk();
      expect(seen).toContain(`${LOOK_AWAY.x}px,${LOOK_AWAY.y}px`);
      expect(seen).toContain(`${THINKING_GAZE.x}px,${THINKING_GAZE.y}px`);
      expect(seen.size).toBeGreaterThan(3);
    });

    it('held: the eyes stay on the user for the whole call (0 saccades, 0 look-aways)', async () => {
      const crisis = await import('../../../src/ui/face/crisis-face-hold.js');
      initGaze();
      crisis.holdCrisisFace();
      expect([...walk()]).toEqual(['0px,0px']);
    });

    it('held under reduced motion: thinking turns stay on the user too', async () => {
      const crisis = await import('../../../src/ui/face/crisis-face-hold.js');
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      })) as unknown as typeof window.matchMedia;
      try {
        initGaze();
        crisis.holdCrisisFace();
        expect([...walk()]).toEqual(['0px,0px']);
      } finally {
        window.matchMedia = original;
      }
    });

    it('held while idle: the pointer does not pull the eyes', async () => {
      const crisis = await import('../../../src/ui/face/crisis-face-hold.js');
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
      initGaze();
      crisis.holdCrisisFace();
      for (let n = 0; n < 5; n++) {
        document.dispatchEvent(
          new MouseEvent('pointermove', { clientX: 600 + n * 40, clientY: n * 30 })
        );
        frames.splice(0).forEach((cb) => cb(0));
        expect(offset()).toBe('0px,0px');
      }
      expect(frames).toHaveLength(0);
    });

    it('control, not held, idle: the pointer pulls the eyes', () => {
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
      initGaze();
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 0 }));
      frames.splice(0).forEach((cb) => cb(0));
      expect(offset()).not.toBe('0px,0px');
    });

    it('a hold that starts mid look-away brings the eyes straight back', async () => {
      const crisis = await import('../../../src/ui/face/crisis-face-hold.js');
      initGaze();
      turnTo('ferni');
      expect(offset()).toBe(`${LOOK_AWAY.x}px,${LOOK_AWAY.y}px`);
      crisis.holdCrisisFace();
      expect(offset()).toBe('0px,0px');
      vi.advanceTimersByTime(10_000);
      expect(offset()).toBe('0px,0px');
    });
  });
});
