/**
 * Frame sampler for the first-paint checks (motion audit 2026-10-29, P8).
 *
 * `installSampler` runs in the page before any of its scripts (Playwright
 * addInitScript), so it has to be self-contained: no imports, no closures.
 * Every animation frame until `windowMs` it records which avatars a person
 * could see, whether the sign-in gate or Home is on screen, and every infinite
 * animation still running on an element nobody can see. Layout shifts come
 * from a PerformanceObserver. `summarize` turns the frames into the numbers
 * the specs assert on. For animations, an inert element counts as hidden too.
 *
 * "Can see" means: laid out with a size, in the viewport, visibility visible,
 * an opacity product over its ancestors above 0.02 (so a fading
 * layer still counts: that is the double exposure), and not under an opaque,
 * full-screen layer painted above it (so Home under the gate does not count).
 */

export interface Box {
  sel: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  t: number;
  avatars: Box[];
  gate: boolean;
  home: boolean;
  hiddenInfinite: string[];
}

export interface Shift {
  t: number;
  v: number;
  /** What moved */
  src: string[];
}

export interface Capture {
  frames: Frame[];
  shifts: Shift[];
}

/** Runs in the page; see the module comment. */
export function installSampler(windowMs: number): void {
  const out: Capture = { frames: [], shifts: [] };
  (window as unknown as { __firstPaint: Capture }).__firstPaint = out;
  try {
    new PerformanceObserver((list) => {
      type Entry = {
        hadRecentInput: boolean;
        startTime: number;
        value: number;
        sources?: { node?: Node | null }[];
      };
      for (const e of list.getEntries() as unknown as Entry[]) {
        if (e.hadRecentInput) continue;
        const src = (e.sources ?? []).map((x) => {
          const n = x.node;
          if (!(n instanceof Element)) return n ? n.nodeName : '?';
          return n.id
            ? `#${n.id}`
            : `${n.tagName.toLowerCase()}.${
                String(n.getAttribute('class') ?? '')
                  .trim()
                  .split(/\s+/)[0]
              }`;
        });
        out.shifts.push({ t: Math.round(e.startTime), v: e.value, src });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* no layout-shift entries in this browser */
  }

  const AVATARS: [string, string][] = [
    ['gate copy', '.gate-first-paint__logo'],
    ['gate', '.sign-in-gate-logo img'],
    ['home', '#coach .avatar-container'],
  ];
  const opacity = (el: Element): number => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (c.display === 'none') return 0;
      o *= parseFloat(c.opacity);
    }
    return o;
  };
  const alpha = (color: string): number => {
    if (!color || color === 'transparent') return 0;
    const m = color.match(/\(([^)]*)\)/);
    if (!m) return 1;
    const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
    const isRgba = /^rgba|\//.test(color) || parts.length === 4;
    if (!isRgba) return 1;
    const a = parts[parts.length - 1]!;
    return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
  };
  const z = (el: Element): number => parseInt(getComputedStyle(el).zIndex, 10) || 0;
  const topLevel = (el: Element): Element => {
    let e: Element = el;
    while (e.parentElement && e.parentElement !== document.body) e = e.parentElement;
    return e;
  };
  /** An opaque, full-screen layer painted above `el` hides it completely. */
  const covered = (el: Element): boolean => {
    const top = topLevel(el);
    for (const layer of Array.from(document.body.children)) {
      if (layer === top || layer.contains(el)) continue;
      const c = getComputedStyle(layer);
      if (c.visibility !== 'visible' || (c.position !== 'fixed' && c.position !== 'absolute'))
        continue;
      const r = layer.getBoundingClientRect();
      if (r.left > 1 || r.top > 1 || r.right < innerWidth - 1 || r.bottom < innerHeight - 1)
        continue;
      if (alpha(c.backgroundColor) < 0.98 || opacity(layer) < 0.98) continue;
      const above =
        z(layer) > z(top) ||
        (z(layer) === z(top) &&
          !!(top.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (above) return true;
    }
    return false;
  };
  /** On screen for a person. `inertHides`: an inert element is painted, but nobody can use it either. */
  const seen = (el: Element, minSize: number, inertHides = false): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < minSize || r.height < minSize) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    if (getComputedStyle(el).visibility !== 'visible' || (inertHides && el.closest('[inert]')))
      return false;
    if (el instanceof HTMLImageElement && !(el.complete && el.naturalWidth > 0)) return false;
    return opacity(el) > 0.02 && !covered(el);
  };
  const describe = (el: Element): string =>
    el.id
      ? `#${el.id}`
      : `${el.tagName.toLowerCase()}.${
          String(el.getAttribute('class') ?? '')
            .trim()
            .split(/\s+/)[0]
        }`;

  const sample = (t: number): Frame => {
    const avatars: Box[] = [];
    for (const [name, sel] of AVATARS) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!seen(el, 2)) continue;
        const r = el.getBoundingClientRect();
        avatars.push({ sel: name, x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
    const gate = Array.from(document.querySelectorAll('#gateFirst, .sign-in-gate-overlay')).some(
      (el) => seen(el, 2)
    );
    const coach = document.getElementById('coach');
    const hiddenInfinite: string[] = [];
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const effect = a.effect as KeyframeEffect | null;
      if (!effect || effect.getComputedTiming().iterations !== Infinity) continue;
      const target = effect.target;
      if (!target || seen(target, 1, true)) continue;
      const name = (a as CSSAnimation).animationName ?? 'script';
      hiddenInfinite.push(`${name} on ${describe(target)}`);
    }
    return { t: Math.round(t), avatars, gate, home: !!coach && seen(coach, 2), hiddenInfinite };
  };
  const tick = (t: number): void => {
    if (document.body) out.frames.push(sample(t));
    if (t < windowMs) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface Summary {
  frames: number;
  /** First frame with the gate or Home on screen */
  firstContentMs: number | null;
  /** Frames showing the gate or Home with no avatar, or more than one */
  framesNotOneAvatar: number;
  maxAvatars: number;
  /** Frames where Home (the old layout) is on screen */
  homeFrames: number;
  gateFrames: number;
  /** Largest move or resize of the one avatar between consecutive frames, px */
  avatarJumpPx: number;
  hiddenInfiniteFrames: number;
  hiddenInfinite: string[];
  cls: number;
}

export function summarize(capture: Capture, untilMs: number): Summary {
  const frames = capture.frames.filter((f) => f.t <= untilMs);
  const content = frames.filter((f) => f.gate || f.home);
  let jump = 0;
  let last: Box | null = null;
  for (const f of content) {
    const box = f.avatars.length === 1 ? f.avatars[0]! : null;
    if (box && last) {
      const d = Math.max(
        Math.abs(box.x + box.w / 2 - (last.x + last.w / 2)),
        Math.abs(box.y + box.h / 2 - (last.y + last.h / 2)),
        Math.abs(box.w - last.w),
        Math.abs(box.h - last.h)
      );
      jump = Math.max(jump, d);
    }
    last = box ?? last;
  }
  const hidden = frames.filter((f) => f.hiddenInfinite.length > 0);
  return {
    frames: frames.length,
    firstContentMs: content[0]?.t ?? null,
    framesNotOneAvatar: content.filter((f) => f.avatars.length !== 1).length,
    maxAvatars: Math.max(0, ...frames.map((f) => f.avatars.length)),
    homeFrames: frames.filter((f) => f.home).length,
    gateFrames: frames.filter((f) => f.gate).length,
    avatarJumpPx: +jump.toFixed(1),
    hiddenInfiniteFrames: hidden.length,
    hiddenInfinite: [...new Set(hidden.flatMap((f) => f.hiddenInfinite))],
    cls: +capture.shifts
      .filter((s) => s.t <= untilMs)
      .reduce((sum, s) => sum + s.v, 0)
      .toFixed(4),
  };
}
