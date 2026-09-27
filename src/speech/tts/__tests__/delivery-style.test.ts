/**
 * Adaptive delivery: how Ferni's reply should SOUND given how the caller
 * sounded this turn. Emotion names are Cartesia Sonic-3 generation_config
 * values, verified against the live API on 2026-09-27 (sympathetic, calm,
 * happy, content, excited all returned 200).
 */
import { describe, expect, it } from 'vitest';
import { deliveryStyleForUserVoice, isAdaptiveDeliveryEnabled } from '../delivery-style.js';

describe('deliveryStyleForUserVoice', () => {
  it('meets sadness with a sympathetic, slightly slower voice', () => {
    expect(deliveryStyleForUserVoice({ primary: 'sad', confidence: 0.8 })).toEqual({
      emotion: 'sympathetic',
      speed: 0.92,
    });
  });

  it('meets anxiety or fear with a calm, slower voice', () => {
    expect(deliveryStyleForUserVoice({ primary: 'anxious', confidence: 0.8 })).toEqual({
      emotion: 'calm',
      speed: 0.9,
    });
    expect(deliveryStyleForUserVoice({ primary: 'fearful', confidence: 0.8 })).toEqual({
      emotion: 'calm',
      speed: 0.9,
    });
  });

  it('treats high vocal stress as anxiety even when the label is neutral', () => {
    expect(
      deliveryStyleForUserVoice({ primary: 'neutral', confidence: 0.8, stressLevel: 0.85 })
    ).toEqual({ emotion: 'calm', speed: 0.9 });
  });

  it('meets anger with calm, not matched intensity', () => {
    expect(deliveryStyleForUserVoice({ primary: 'angry', confidence: 0.8 })).toEqual({
      emotion: 'calm',
      speed: 0.95,
    });
  });

  it('lifts with a happy caller', () => {
    expect(deliveryStyleForUserVoice({ primary: 'happy', confidence: 0.8 })).toEqual({
      emotion: 'happy',
      speed: 1.05,
    });
    expect(deliveryStyleForUserVoice({ primary: 'excited', confidence: 0.8 })).toEqual({
      emotion: 'excited',
      speed: 1.05,
    });
  });

  it('returns null (default delivery) for neutral, unknown or low-confidence readings', () => {
    expect(deliveryStyleForUserVoice({ primary: 'neutral', confidence: 0.9 })).toBeNull();
    expect(deliveryStyleForUserVoice({ primary: 'sad', confidence: 0.3 })).toBeNull();
    expect(deliveryStyleForUserVoice({ primary: 'bored', confidence: 0.9 })).toBeNull();
    expect(deliveryStyleForUserVoice(undefined)).toBeNull();
  });

  it('keeps speed inside the range Sonic-3 accepts (0.6-2.0)', () => {
    for (const primary of ['sad', 'anxious', 'angry', 'happy', 'excited']) {
      const s = deliveryStyleForUserVoice({ primary, confidence: 1 });
      expect(s?.speed).toBeGreaterThanOrEqual(0.6);
      expect(s?.speed).toBeLessThanOrEqual(2);
    }
  });
});

describe('isAdaptiveDeliveryEnabled', () => {
  it('is off unless ADAPTIVE_DELIVERY=on', () => {
    expect(isAdaptiveDeliveryEnabled({})).toBe(false);
    expect(isAdaptiveDeliveryEnabled({ ADAPTIVE_DELIVERY: 'true' })).toBe(false);
    expect(isAdaptiveDeliveryEnabled({ ADAPTIVE_DELIVERY: ' ON ' })).toBe(true);
  });
});
