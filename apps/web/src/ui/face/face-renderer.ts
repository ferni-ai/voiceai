/**
 * Draws Ferni's face from the face model with HTML layers moved by the
 * compositor: no SVG geometry changes and no per-frame JS.
 *
 * Measured (voiceai-evidence/face-engine-2026-10-12/lid-bench): anything
 * moved inside an SVG lays the page out every frame (about 61/s), and JS
 * writing every frame restyles 60 times a second. HTML layers animated by
 * the Web Animations API with spring easings did 0 layouts and 6 restyles a
 * second. So each eye is a rounded HTML layer that clips its own lids:
 *
 *   .face-eye (rounded, clips)   eye shape: scale
 *     .face-lid-top              upper lid: slides down by the lid coverage
 *     .face-lid-arch             the happy ^: rises, crossfaded by opacity
 *     .face-lid-bottom           lower lid: rises
 *   .face-crease                 smile crease under each eye: opacity
 *
 * The layers sit over the existing eyes in #coachAvatar and line up with
 * them (index.html: eyes at x 32% / 68%, y 50%, 22% × 28%).
 *
 * @module ui/face/face-renderer
 */

import type { ExpressionId } from '../../config/avatar-expressions.js';
import { faceGeometry, type FaceGeometry } from './face-model.js';
import { FACE_SPRING, springEasing } from './spring-easing.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('FaceRenderer');

const STYLE_ID = 'face-engine-style';
const CSS = `
.face-layer { position: absolute; inset: 0; pointer-events: none; }
.face-eyes { position: absolute; inset: 0; }
.face-eye { position: absolute; top: 36%; width: 22%; height: 28%; border-radius: 50%; overflow: hidden;
  background: var(--face-eye-white, #ffffff); transform-origin: 50% 60%; }
.face-eye.left { left: 21%; } .face-eye.right { left: 57%; }
.face-lid-top, .face-lid-arch, .face-lid-bottom { position: absolute; left: -20%; width: 140%; height: 100%;
  background: var(--face-lid, var(--persona-primary)); }
.face-lid-top { top: -100%; border-radius: 0 0 50% 50% / 0 0 40% 40%; }
.face-lid-arch { top: 100%; border-radius: 50% 50% 0 0 / 70% 70% 0 0; opacity: 0; }
.face-lid-bottom { top: 100%; border-radius: 50% 50% 0 0 / 15% 15% 0 0; }
.face-crease { position: absolute; top: 67%; width: 16%; height: 6%; border-bottom: 2px solid var(--face-crease, rgba(244, 239, 230, 0.6));
  border-radius: 0 0 50% 50%; opacity: 0; }
.face-crease.left { left: 24%; } .face-crease.right { left: 60%; }
`;

export interface FaceRenderer {
  /** Moves every face part to `id`'s geometry over one spring (instantly with `instant`). */
  show: (id: ExpressionId, opts?: { instant?: boolean }) => void;
  /** One blink: the upper lids close and open, then return to the current face. */
  blink: () => void;
  destroy: () => void;
}

interface Parts {
  layer: HTMLElement;
  eyes: HTMLElement;
  eye: Record<'left' | 'right', HTMLElement>;
  lidTop: HTMLElement[];
  arch: HTMLElement[];
  lidBottom: HTMLElement[];
  crease: HTMLElement[];
}

function el(cls: string, parent: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

function build(root: HTMLElement): Parts {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  root.querySelectorAll('.face-layer').forEach((n) => n.remove());
  const layer = el('face-layer', root);
  layer.setAttribute('aria-hidden', 'true');
  const eyes = el('face-eyes', layer);
  const parts: Parts = {
    layer,
    eyes,
    eye: {} as Parts['eye'],
    lidTop: [],
    arch: [],
    lidBottom: [],
    crease: [],
  };
  for (const side of ['left', 'right'] as const) {
    const eye = el(`face-eye ${side}`, eyes);
    parts.eye[side] = eye;
    parts.lidTop.push(el('face-lid-top', eye));
    parts.arch.push(el('face-lid-arch', eye));
    parts.lidBottom.push(el('face-lid-bottom', eye));
    parts.crease.push(el(`face-crease ${side}`, layer));
  }
  return parts;
}

/** The style each part should end on for a face. */
export function targetsFor(
  g: FaceGeometry
): Map<'eyes' | 'left' | 'right' | 'lidTop' | 'arch' | 'lidBottom' | 'crease', Keyframe> {
  const eye = (o: FaceGeometry['leftEye']) =>
    `scale(${o?.scaleX ?? g.eyeScaleX}, ${o?.scaleY ?? g.eyeScaleY})`;
  return new Map([
    ['eyes', { transform: `translate(${g.gazeX}%, ${g.gazeY}%)` }],
    ['left', { transform: eye(g.leftEye) }],
    ['right', { transform: eye(g.rightEye) }],
    ['lidTop', { transform: `translateY(${(g.upperLid * 100).toFixed(1)}%)` }],
    [
      'arch',
      { transform: `translateY(${(-g.arch * 100).toFixed(1)}%)`, opacity: g.arch > 0 ? 1 : 0 },
    ],
    ['lidBottom', { transform: `translateY(${(-g.lowerLid * 100).toFixed(1)}%)` }],
    ['crease', { opacity: g.crease }],
  ]);
}

export function createFaceRenderer(root: HTMLElement): FaceRenderer {
  const parts = build(root);
  /** Where each element is resting, so a new animation starts there without reading styles back. */
  const at = new WeakMap<HTMLElement, Keyframe>();
  const running = new WeakMap<HTMLElement, Animation>();
  let current: FaceGeometry | null = null;

  /** Where an element is right now: its resting keyframe, or (mid-flight) its live style, read once per change. */
  const startOf = (e: HTMLElement, to: Keyframe): Keyframe => {
    const prev = running.get(e);
    if (prev?.playState === 'running') {
      const cs = getComputedStyle(e);
      prev.cancel();
      return {
        transform: cs.transform === 'none' ? 'none' : cs.transform,
        opacity: Number(cs.opacity),
      };
    }
    return at.get(e) ?? to;
  };

  const move = (els: HTMLElement[], to: Keyframe, instant: boolean): void => {
    const { easing, durationMs } = springEasing(FACE_SPRING);
    for (const e of els) {
      const from = startOf(e, to);
      at.set(e, to);
      const a = e.animate([from, to], {
        duration: instant ? 0 : durationMs,
        easing,
        fill: 'forwards',
      });
      running.set(e, a);
      a.finished
        .then(() => {
          a.commitStyles();
          a.cancel();
        })
        .catch((error: unknown) => {
          // Cancelled because a newer face took over: expected, nothing to do.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          log.warn('Face animation failed', error);
        });
    }
  };

  return {
    show(id, opts = {}) {
      current = faceGeometry(id);
      const t = targetsFor(current);
      const instant = opts.instant === true;
      move([parts.eyes], t.get('eyes') ?? {}, instant);
      move([parts.eye.left], t.get('left') ?? {}, instant);
      move([parts.eye.right], t.get('right') ?? {}, instant);
      move(parts.lidTop, t.get('lidTop') ?? {}, instant);
      move(parts.arch, t.get('arch') ?? {}, instant);
      move(parts.lidBottom, t.get('lidBottom') ?? {}, instant);
      move(parts.crease, t.get('crease') ?? {}, instant);
    },
    blink() {
      const open = current
        ? (targetsFor(current).get('lidTop') ?? {})
        : { transform: 'translateY(0%)' };
      for (const lid of parts.lidTop) {
        lid.animate([open, { transform: 'translateY(100%)' }, open], {
          duration: 160,
          easing: 'ease-in-out',
        });
      }
    },
    destroy() {
      parts.layer.remove();
    },
  };
}
