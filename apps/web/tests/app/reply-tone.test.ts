/**
 * Reply tone (behind ferni:reply-tone, off by default): the agent's
 * `reply_tone { emotion, speed }` sets the face Ferni rests in for the reply
 * and the breathing rate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../src/config/motion-flags.js';

const face = vi.hoisted(() => ({ current: 'neutral' as string }));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: {
    setExpression: vi.fn((e: string) => {
      face.current = e;
    }),
    getExpression: vi.fn(() => face.current),
  },
}));
vi.mock('../../src/ui/presence.ui.js', () => ({
  presenceUI: { resetBreathSync: vi.fn() },
}));

import {
  REPLY_TONE_EXPRESSIONS,
  breathRateForSpeed,
  handleReplyTone,
  resetReplyTone,
} from '../../src/app/reply-tone.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import { presenceUI } from '../../src/ui/presence.ui.js';

const breaths: number[] = [];
const onBreath = (e: Event) => breaths.push((e as CustomEvent<{ rate: number }>).detail.rate);

beforeEach(() => {
  face.current = 'neutral';
  breaths.length = 0;
  resetReplyTone();
  vi.clearAllMocks();
  document.addEventListener('ferni:breath-sync', onBreath);
});
afterEach(() => {
  document.removeEventListener('ferni:breath-sync', onBreath);
  localStorage.clear();
});

const tone = (emotion: string | null, speed = 1) => ({ type: 'reply_tone', emotion, speed });

describe('reply tone, flag off', () => {
  it('consumes the message but leaves the face and breathing alone', () => {
    expect(handleReplyTone(tone('sympathetic', 0.8))).toBe(true);
    expect(ferniExpressions.setExpression).not.toHaveBeenCalled();
    expect(breaths).toEqual([]);
  });

  it('ignores other messages', () => {
    expect(handleReplyTone({ type: 'emotion', emotion: 'calm' })).toBe(false);
  });
});

describe('reply tone, flag on', () => {
  beforeEach(() => localStorage.setItem(MOTION_FLAG_KEYS.replyTone, 'true'));

  it.each(Object.entries(REPLY_TONE_EXPRESSIONS))(
    'rests %s replies on the %s face',
    (emotion, expected) => {
      handleReplyTone(tone(emotion));
      expect(ferniExpressions.setExpression).toHaveBeenCalledWith(expected);
    }
  );

  it('clears its own face when the next reply has no emotion', () => {
    handleReplyTone(tone('sympathetic'));
    handleReplyTone(tone(null));
    expect(ferniExpressions.setExpression).toHaveBeenLastCalledWith('neutral');
  });

  it('leaves a face another system set when the reply has no emotion', () => {
    handleReplyTone(tone('sympathetic'));
    face.current = 'happy';
    handleReplyTone(tone(null));
    expect(ferniExpressions.setExpression).toHaveBeenCalledTimes(1);
  });

  it('breathes slower for a slow reply and faster for a quick one', () => {
    handleReplyTone(tone('calm', 0.8));
    handleReplyTone(tone('calm', 1.2));
    expect(breaths).toEqual([12, 18]);
  });

  it('returns to the default breathing once a reply is at normal speed', () => {
    handleReplyTone(tone('calm', 0.8));
    handleReplyTone(tone('calm', 1.02));
    expect(presenceUI.resetBreathSync).toHaveBeenCalledTimes(1);
    expect(breaths).toEqual([12]);
  });

  it('does not reset breathing it never changed', () => {
    handleReplyTone(tone('calm', 1));
    expect(presenceUI.resetBreathSync).not.toHaveBeenCalled();
  });
});

describe('breathRateForSpeed', () => {
  it('clamps to the voice speed range', () => {
    expect(breathRateForSpeed(3)).toBe(22.5);
    expect(breathRateForSpeed(0.1)).toBe(9);
    expect(breathRateForSpeed(Number.NaN)).toBeNull();
  });
});
