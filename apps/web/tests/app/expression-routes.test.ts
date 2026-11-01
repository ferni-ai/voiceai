/**
 * Expression routing (behind ferni:expression-arbiter, off by default): each
 * agent signal shows one reaction through the arbiter, the user's arousal no
 * longer drives Ferni's speaking intensity, and distress gets a grounded face.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../src/config/motion-flags.js';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: { setExpression: vi.fn(), getExpression: vi.fn(() => 'neutral') },
}));
vi.mock('../../src/ui/better-than-human.ui.js', () => ({
  ferni: {
    playMicroExpression: vi.fn(),
    onUserSpeechPause: vi.fn(),
    setBreathSyncStrength: vi.fn(),
  },
}));
vi.mock('../../src/ui/presence.ui.js', () => ({
  presenceUI: { setVoiceEmotion: vi.fn(), setSpeakingIntensity: vi.fn(), resetBreathSync: vi.fn() },
}));
vi.mock('../../src/ui/waveform.ui.js', () => ({ waveformUI: { setEmotion: vi.fn() } }));

import { expressionArbiter } from '../../src/app/expression-arbiter.js';
import { faceForUserEmotion, routeExpressionMessage } from '../../src/app/expression-routes.js';
import { resetReplyTone } from '../../src/app/reply-tone.js';
import { ferni } from '../../src/ui/better-than-human.ui.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import { presenceUI } from '../../src/ui/presence.ui.js';

const setExpression = vi.mocked(ferniExpressions.setExpression);
const faces = () => setExpression.mock.calls.map((c) => c[0]);

const emotion = (name: string, intensity = 0.9, confidence = 0.9) => ({
  type: 'emotion',
  emotion: name,
  intensity,
  confidence,
  timestamp: 0,
});
const laugh = (laughType: string, confidence = 0.9) => ({
  type: 'laughter_detected',
  laughType,
  confidence,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.clearAllMocks();
  expressionArbiter.reset();
  resetReplyTone();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('expression routing, flag off', () => {
  it('leaves every expression signal to the legacy handlers', () => {
    for (const m of [
      emotion('happy'),
      laugh('hearty'),
      { type: 'avatar_cue', expression: 'warmth' },
    ]) {
      expect(routeExpressionMessage(m)).toBe(false);
    }
    expect(setExpression).not.toHaveBeenCalled();
  });

  it('still consumes reply_tone through the reply-tone handler', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.replyTone, 'true');
    expect(routeExpressionMessage({ type: 'reply_tone', emotion: 'calm', speed: 1 })).toBe(true);
    expect(setExpression).toHaveBeenCalledWith('present');
  });
});

describe('expression routing, flag on', () => {
  beforeEach(() => localStorage.setItem(MOTION_FLAG_KEYS.expressionArbiter, 'true'));

  it('consumes the routed types and passes others on', () => {
    expect(routeExpressionMessage(emotion('happy'))).toBe(true);
    expect(routeExpressionMessage(laugh('laugh'))).toBe(true);
    expect(routeExpressionMessage({ type: 'avatar_cue', expression: 'warmth' })).toBe(true);
    expect(routeExpressionMessage({ type: 'crisis_detected' })).toBe(true);
    expect(routeExpressionMessage({ type: 'transcript', text: 'hi' })).toBe(false);
  });

  it("never maps the user's arousal to Ferni's speaking intensity", () => {
    routeExpressionMessage(emotion('excited', 0.95));
    expect(presenceUI.setSpeakingIntensity).not.toHaveBeenCalled();
  });

  it('mirrors joy and grounds distress', () => {
    expect(faceForUserEmotion('happy', 0.9)?.expression).toBe('delighted');
    expect(faceForUserEmotion('anxious', 0.9)?.expression).toBe('present');
    expect(faceForUserEmotion('frustrated', 0.9)?.expression).toBe('attentive');
    routeExpressionMessage(emotion('anxious'));
    expect(presenceUI.setVoiceEmotion).toHaveBeenCalledWith('calm');
  });

  it('shows one reaction per laugh: a lid face and no micro-expression burst', () => {
    routeExpressionMessage(laugh('hearty'));
    vi.advanceTimersByTime(1000);
    expect(faces()).toEqual(['delighted']);
    expect(ferni.playMicroExpression).not.toHaveBeenCalled();
  });

  it('holds a reaction for the minimum dwell before the next one', () => {
    routeExpressionMessage(emotion('happy', 0.6));
    vi.advanceTimersByTime(500);
    routeExpressionMessage(laugh('chuckle'));
    expect(faces()).toEqual(['happy']);
    vi.advanceTimersByTime(2000);
    routeExpressionMessage(laugh('chuckle'));
    expect(faces()).toEqual(['happy', 'pleased']);
  });

  it('keeps the safety face against reactions and cues', () => {
    routeExpressionMessage({ type: 'emotional_intervention' });
    routeExpressionMessage(emotion('happy'));
    routeExpressionMessage({ type: 'avatar_cue', expression: 'excitement' });
    expect(faces()).toEqual(['holdingSpace']);
    expect(ferni.playMicroExpression).not.toHaveBeenCalled();
    expect(ferni.setBreathSyncStrength).toHaveBeenCalledWith(0.6);
  });

  it('routes reply tone through the arbiter at reply-tone priority', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.replyTone, 'true');
    routeExpressionMessage(laugh('laugh'));
    routeExpressionMessage({ type: 'reply_tone', emotion: 'sympathetic', speed: 1 });
    routeExpressionMessage(emotion('happy'));
    expect(faces()).toEqual(['happy', 'empathetic']);
  });

  it('drops reply tone while a safety face holds', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.replyTone, 'true');
    routeExpressionMessage({ type: 'crisis_detected' });
    routeExpressionMessage({ type: 'reply_tone', emotion: 'content', speed: 1 });
    expect(faces()).toEqual(['empathetic']);
  });

  it('nods for a micro-nod cue and plays one micro for an expression cue', () => {
    routeExpressionMessage({ type: 'avatar_cue', gesture: 'micro-nod', expression: 'warmth' });
    expect(ferni.onUserSpeechPause).toHaveBeenCalledWith(200);
    expect(ferni.playMicroExpression).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    routeExpressionMessage({ type: 'avatar_cue', expression: 'concern', gesture: 'lean-in' });
    expect(ferni.playMicroExpression).toHaveBeenCalledTimes(1);
    expect(ferni.playMicroExpression).toHaveBeenCalledWith('concern_flash');
  });

  it('ignores low-confidence emotion and shows no face for mild intensity', () => {
    routeExpressionMessage(emotion('happy', 0.9, 0.3));
    routeExpressionMessage(emotion('sad', 0.4, 0.9));
    expect(setExpression).not.toHaveBeenCalled();
  });
});
