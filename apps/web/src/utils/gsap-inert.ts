/**
 * An inert stand-in for GSAP, used when the CDN script didn't load (#3273).
 *
 * Nothing moves, but each tween still ends: after its duration (plus delay) it writes its end
 * opacity and display on elements (and its end numbers on plain objects), then calls onUpdate
 * once and onComplete. So a flow that waits on onComplete, such as hiding a
 * panel after it fades, still finishes, and a loop that restarts from onComplete keeps its pace.
 * A timeline runs its steps in order, ignoring positions, then its own onComplete. A tween or
 * timeline with `repeat: -1` never completes, as in GSAP. kill() and killTweensOf() cancel the
 * pending end. Nothing here has a `then`, so `await tween` can't wait forever.
 */
import type { gsap as GsapType } from 'gsap';

type Vars = Record<string, unknown>;
type Fn = (...args: unknown[]) => void;

const ELEMENT_KEYS = ['opacity', 'display'] as const;

function targetsOf(targets: unknown): unknown[] {
  if (Array.isArray(targets)) return targets.flatMap(targetsOf);
  if (targets instanceof NodeList) return Array.from(targets);
  return targets == null ? [] : [targets];
}

function applyEnd(targets: unknown[], vars: Vars): void {
  for (const target of targets) {
    if (target instanceof Element) {
      if (!(target instanceof HTMLElement || target instanceof SVGElement)) continue;
      const { style } = target;
      for (const key of ELEMENT_KEYS) {
        const value = vars[key];
        if (typeof value === 'number' || typeof value === 'string') {
          style.setProperty(key, String(value));
        }
      }
    } else if (target && typeof target === 'object') {
      const record = target as Record<string, unknown>;
      for (const [key, value] of Object.entries(vars)) {
        if (typeof value === 'number' && typeof record[key] === 'number') record[key] = value;
      }
    }
  }
}

const secondsOf = (vars: Vars): number =>
  (typeof vars.duration === 'number' ? vars.duration : 0.5) +
  (typeof vars.delay === 'number' ? vars.delay : 0);

const live = new Set<InertTween>();

class InertTween {
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly seconds: number;
  readonly targets: unknown[];

  constructor(
    targets: unknown,
    private readonly vars: Vars,
    start: boolean
  ) {
    this.targets = targetsOf(targets);
    this.seconds = secondsOf(vars);
    if (start) this.schedule(this.seconds);
  }

  /** Ends the tween now: its end state, then onUpdate and onComplete. */
  finish(): void {
    live.delete(this);
    applyEnd(this.targets, this.vars);
    (this.vars.onUpdate as Fn | undefined)?.();
    (this.vars.onComplete as Fn | undefined)?.();
  }

  private schedule(seconds: number): void {
    if (this.vars.repeat === -1) return;
    live.add(this);
    this.timer = setTimeout(() => this.finish(), seconds * 1000);
  }

  kill(): this {
    live.delete(this);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this;
  }
}

type Step = { seconds: number; run: () => void };

class InertTimeline {
  private readonly steps: Step[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Steps added in the same tick as the timeline run once that tick ends. */
  constructor(private readonly vars: Vars = {}) {
    this.timers.push(setTimeout(() => this.start(), 0));
  }

  private start(): void {
    let at = 0;
    for (const step of this.steps) {
      at += step.seconds;
      this.timers.push(setTimeout(step.run, at * 1000));
    }
    if (this.vars.repeat === -1) return;
    this.timers.push(setTimeout(() => (this.vars.onComplete as Fn | undefined)?.(), at * 1000));
  }

  private step(tween: InertTween): this {
    this.steps.push({ seconds: tween.seconds, run: () => tween.finish() });
    return this;
  }
  to(targets: unknown, vars: Vars): this {
    return this.step(new InertTween(targets, vars, false));
  }
  fromTo(targets: unknown, _from: Vars, to: Vars): this {
    return this.to(targets, to);
  }
  set(targets: unknown, vars: Vars): this {
    return this.step(new InertTween(targets, { ...vars, duration: 0, delay: 0 }, false));
  }
  call(fn: Fn, params?: unknown[]): this {
    this.steps.push({ seconds: 0, run: () => fn(...(params ?? [])) });
    return this;
  }
  add(child: unknown): this {
    if (typeof child === 'function') return this.call(child as Fn);
    if (child instanceof InertTween) return this.step(child.kill());
    return this;
  }
  kill(): this {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    return this;
  }
}

const TIMING = ['duration', 'delay', 'repeat', 'onUpdate', 'onComplete'];
/** A from() tween ends where the element already is, so it keeps only its timing and callbacks. */
const timingOnly = (vars: Vars): Vars =>
  Object.fromEntries(TIMING.filter((key) => key in vars).map((key) => [key, vars[key]]));

const noop = (): void => undefined;

/** The GSAP members the app uses, inert. Members it doesn't use are absent. */
export function createInertGsap(): typeof GsapType {
  const inert = {
    to: (targets: unknown, vars: Vars) => new InertTween(targets, vars, true),
    from: (targets: unknown, vars: Vars) => new InertTween(targets, timingOnly(vars), true),
    fromTo: (targets: unknown, _from: Vars, to: Vars) => new InertTween(targets, to, true),
    set: (targets: unknown, vars: Vars) => {
      const tween = new InertTween(targets, vars, false);
      tween.finish();
      return tween;
    },
    timeline: (vars?: Vars) => new InertTimeline(vars),
    killTweensOf: (targets: unknown) => {
      const killed = new Set(targetsOf(targets));
      for (const tween of [...live]) if (tween.targets.some((t) => killed.has(t))) tween.kill();
    },
    isTweening: (target: unknown) => [...live].some((tween) => tween.targets.includes(target)),
    defaults: noop,
    config: noop,
    ticker: { fps: noop },
    globalTimeline: { pause: noop, resume: noop },
  };
  return inert as unknown as typeof GsapType;
}
