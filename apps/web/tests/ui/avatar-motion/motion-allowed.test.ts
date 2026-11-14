/**
 * avatarMotionAllowed: reduced motion stops every kind; the crisis face hold
 * stops every kind but the calm blink (fe's ruling, 2026-11-11) and the
 * protective lean (Seth's ruling, 2026-11-12); outside both,
 * everything plays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { holdCrisisFace, releaseCrisisFace } from '../../../src/ui/face/crisis-face-hold.js';
import {
  avatarMotionAllowed,
  type AvatarMotionKind,
} from '../../../src/ui/avatar-motion/motion-allowed.js';

const KINDS: AvatarMotionKind[] = [
  'blink',
  'blinkFlourish',
  'bodyDip',
  'gazeShift',
  'thinkingLook',
  'speechBeat',
  'lidVoice',
  'fullNod',
  'smile',
  'bodyTurn',
  'drawCloser',
  'comfortPulse',
];

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setReducedMotion(false));
afterEach(() => releaseCrisisFace());

describe('avatarMotionAllowed', () => {
  it('allows every kind with no hold and no reduced motion', () => {
    expect(KINDS.filter((k) => !avatarMotionAllowed(k))).toEqual([]);
  });

  it('allows only the calm blink and the protective lean while the crisis face is held', () => {
    holdCrisisFace();
    expect(KINDS.filter((k) => avatarMotionAllowed(k))).toEqual(['blink', 'drawCloser']);
  });

  it('allows nothing under reduced motion, held or not', () => {
    setReducedMotion(true);
    expect(KINDS.filter((k) => avatarMotionAllowed(k))).toEqual([]);
    holdCrisisFace();
    expect(KINDS.filter((k) => avatarMotionAllowed(k))).toEqual([]);
  });

  it('allows everything again once the call ends and the hold releases', () => {
    holdCrisisFace();
    releaseCrisisFace();
    expect(KINDS.filter((k) => !avatarMotionAllowed(k))).toEqual([]);
  });
});
