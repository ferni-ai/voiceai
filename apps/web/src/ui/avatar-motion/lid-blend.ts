/**
 * Lid blend: emotion shapes the window, voice opens it.
 *
 * Behind the lidBlend switch (config/motion-flags.ts, off by default). With it on, the
 * speaking system's lid layer starts from the *current expression's* lid
 * paths (exported by ferni-expressions) and adds the voice opening to the
 * bottom curve, instead of rewriting both lids from a neutral base every
 * frame. The volume comes from a gated time-domain RMS (audio.service) and is
 * smoothed by the direction it moves: fast attack when it rises, slow
 * release when it falls.
 *
 * Avatar audit item 4 (W5, W6). Spec: WINDOW-AVATAR-DESIGN-LANGUAGE.md
 * "Speaking + Emotion": "emotion provides shape, speech provides opening".
 */

import { isMotionFlagOn } from '../../config/motion-flags.js';
import { audioService } from '../../services/audio.service.js';
import { gsap } from '../../utils/gsap-setup.js';
import { getLidBasePaths } from '../ferni-expressions.ui.js';
import { NEUTRAL_DOME_PATHS } from '../face/dome-poses.js';

/** Neutral lids, used until ferni-expressions has set an expression. */
export const NEUTRAL_LID_PATHS = NEUTRAL_DOME_PATHS;

/** How far full volume lifts the bottom dome, in old `Q 50,k` control units. */
export const LID_OPEN_RANGE = 40;
/** The voice never lifts the bottom dome past a `Q 50,62` curve, so the eye stays readable. */
export const LID_OPEN_FLOOR = 62;
/** Per-frame easing toward a new expression shape while the voice owns the lids. */
export const LID_SHAPE_EASE = 0.18;
/**
 * The control y values in `M0 100C x p1 x p2 50 m C x p3 x p4 100 100Z` and how far
 * each moves per unit of the old Q control: lifting a `Q 50,k` dome by Δ moves the
 * split halves' outer controls Δ/3 and the inner controls and join Δ/2. Lifting
 * them this way opens every dome exactly as the old single-Q lift did.
 */
const BOTTOM_CONTROLS = [
  { index: 3, weight: 1 / 3 },
  { index: 5, weight: 1 / 2 },
  { index: 7, weight: 1 / 2 },
  { index: 9, weight: 1 / 2 },
  { index: 11, weight: 1 / 3 },
] as const;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

export function isLidBlendEnabled(): boolean {
  return isMotionFlagOn('lidBlend');
}

/** Smooth toward a target with attack when it rises and release when it falls. */
export function smoothByDirection(
  current: number,
  target: number,
  attack: number,
  release: number
): number {
  const coefficient = target > current ? attack : release;
  return current + (target - current) * coefficient;
}

/** The voice level for the speaking system: gated RMS, or the given level with no analyser. */
export function lidBlendLevel(fallback: number): number {
  const rms = audioService.getRmsVolume();
  return rms ?? fallback;
}

interface ParsedPath {
  /** The path with every number removed; two paths blend only when these match. */
  template: string[];
  numbers: number[];
}

export function parseLidPath(d: string): ParsedPath {
  return {
    template: d.split(NUMBER_PATTERN),
    numbers: (d.match(NUMBER_PATTERN) ?? []).map(Number),
  };
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatLidPath(path: ParsedPath): string {
  return path.template.reduce((out, part, i) => {
    const value = path.numbers[i];
    return out + part + (value === undefined ? '' : formatNumber(value));
  }, '');
}

function sameTemplate(a: ParsedPath, b: ParsedPath): boolean {
  return (
    a.template.length === b.template.length && a.template.every((part, i) => part === b.template[i])
  );
}

/** Ease `current` toward `target`, or snap when the two shapes can't be blended. */
export function easeLidPath(
  current: ParsedPath | null,
  target: ParsedPath,
  ease: number
): ParsedPath {
  if (!current || !sameTemplate(current, target)) {
    return { template: target.template, numbers: [...target.numbers] };
  }
  return {
    template: target.template,
    numbers: current.numbers.map(
      (value, i) => value + ((target.numbers[i] ?? value) - value) * ease
    ),
  };
}

/** Lift the bottom dome's control points by the voice, never past the floor. */
export function openBottomLid(base: ParsedPath, volume: number): ParsedPath {
  const numbers = [...base.numbers];
  const level = Math.max(0, Math.min(1, volume));
  for (const { index, weight } of BOTTOM_CONTROLS) {
    const controlY = numbers[index];
    const floor = 100 - (100 - LID_OPEN_FLOOR) * weight;
    if (controlY === undefined || controlY <= floor) continue;
    numbers[index] = Math.max(floor, controlY - level * LID_OPEN_RANGE * weight);
  }
  return { template: base.template, numbers };
}

export interface LidElements {
  top: SVGPathElement | null;
  bottom: SVGPathElement | null;
}

let shownTop: ParsedPath | null = null;
let shownBottom: ParsedPath | null = null;
let lastBaseKey = '';

/**
 * While the voice owns the lids, an expression's GSAP path tween would fight
 * this frame writer, so stop it (its transform squeeze keeps running) and
 * ease to the new shape here instead.
 */
function takeOverPathTweens(lids: LidElements, baseKey: string): void {
  if (baseKey === lastBaseKey && shownTop) return;
  lastBaseKey = baseKey;
  const targets = [lids.top, lids.bottom].filter((el): el is SVGPathElement => el !== null);
  // gsap is the CDN global and can be missing if the script failed to load
  if (targets.length > 0) (gsap as typeof gsap | undefined)?.killTweensOf(targets, 'd');
}

/** One speaking frame: the expression's shape, opened by the voice. */
export function writeBlendedLids(lids: LidElements, volume: number): void {
  const base = getLidBasePaths() ?? NEUTRAL_LID_PATHS;
  takeOverPathTweens(lids, `${base.top}|${base.bottom}`);
  const target = { top: parseLidPath(base.top), bottom: parseLidPath(base.bottom) };
  shownTop = easeLidPath(shownTop, target.top, LID_SHAPE_EASE);
  shownBottom = easeLidPath(shownBottom, target.bottom, LID_SHAPE_EASE);
  lids.top?.setAttribute('d', formatLidPath(shownTop));
  lids.bottom?.setAttribute('d', formatLidPath(openBottomLid(shownBottom, volume)));
}

/** Speech ended: leave the lids on the current expression, not on neutral. */
export function settleBlendedLids(lids: LidElements): void {
  const base = getLidBasePaths() ?? NEUTRAL_LID_PATHS;
  lids.top?.setAttribute('d', base.top);
  lids.bottom?.setAttribute('d', base.bottom);
  shownTop = null;
  shownBottom = null;
  lastBaseKey = '';
}
