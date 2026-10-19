/**
 * "High distress (N%)" comes only from a negative emotion.
 *
 * Before: the builder used the intensity of ANY cached emotion as distress, so joy
 * at 0.8 told the agent "EMOTIONAL ALERT: High distress detected (80%)". This runs
 * the real builder over the cached-emotion shape Redis holds.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEmotionalState = vi.fn();
vi.mock('../../../../memory/redis-cache.js', () => ({
  getRedisCache: () => ({ getEmotionalState }),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/emotional-semantics.js', () => ({
  getEmotionalTrajectory: vi.fn(async () => null),
}));

const { distressFromEmotion, emotionalTrajectoryAwarenessBuilder } =
  await import('../emotional-trajectory-awareness.js');

const input = { services: { userId: 'u1' }, userData: { turnCount: 3 } } as unknown as Parameters<
  typeof emotionalTrajectoryAwarenessBuilder.build
>[0];

beforeEach(() => getEmotionalState.mockReset());

describe('distress is negative-valence intensity only', () => {
  it.each([
    ['joy', 0.8, 0],
    ['excited', 0.95, 0],
    ['happy', 1, 0],
    ['neutral', 0.9, 0],
    [undefined, 0.9, 0],
    ['sad', 0.8, 0.8],
    ['Anxious', 0.75, 0.75],
    ['overwhelmed', 1.4, 1],
  ])('%s at %s is %s distress', (emotion, intensity, distress) => {
    expect(distressFromEmotion(emotion, intensity)).toBe(distress);
  });
});

describe('every label the detectors write', () => {
  // Text detector PrimaryEmotion and voice detector VoiceEmotion, as cached by turn-handler
  it.each([
    ['sadness', true],
    ['anger', true],
    ['fear', true],
    ['disgust', true],
    ['anxiety', true],
    ['regret', true],
    ['joy', false],
    ['surprise', false],
    ['trust', false],
    ['anticipation', false],
    ['neutral', false],
    ['sad', true],
    ['angry', true],
    ['fearful', true],
    ['anxious', true],
    ['contempt', true],
    ['disgusted', true],
    ['happy', false],
    ['excited', false],
    ['surprised', false],
    ['bored', false],
    ['confused', false],
  ])('%s counts as distress: %s', (label, negative) => {
    expect(distressFromEmotion(label as string, 0.9) > 0).toBe(negative);
  });
});

describe('the agent alert', () => {
  it.each([
    { n: 'joy 0.8', primary: 'joy', intensity: 0.8, alert: false },
    { n: 'sad 0.5', primary: 'sad', intensity: 0.5, alert: false },
    { n: 'sad 0.8', primary: 'sad', intensity: 0.8, alert: true },
  ])('$n: high-distress alert = $alert', async ({ primary, intensity, alert }) => {
    getEmotionalState.mockResolvedValue({
      primary,
      intensity,
      confidence: 0.9,
      timestamp: new Date().toISOString(),
    });
    const injections = await emotionalTrajectoryAwarenessBuilder.build(input);
    const text = injections.map((i) => JSON.stringify(i)).join(' ');
    expect(text.includes('High distress')).toBe(alert);
    if (alert) expect(text).toContain('(80%)');
  });
});
