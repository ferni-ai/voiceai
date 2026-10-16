/**
 * ferni:luxo-bridge: which expression system emotion changes reach.
 * Unset keeps today's Luxo routing; 'false' routes to the lid overlay.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lid = vi.hoisted(() => ({ happy: vi.fn(), setExpression: vi.fn() }));
const luxo = vi.hoisted(() => ({
  hasExpression: vi.fn(() => true),
  setExpression: vi.fn(),
  emotionToExpression: vi.fn(() => 'neutral'),
  getCurrentExpression: vi.fn(() => 'happy'),
}));

vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({ ferniExpressions: lid }));
vi.mock('../../src/ui/luxo-expressions.ui.js', () => luxo);

import {
  LUXO_BRIDGE_FLAG_KEY,
  getCurrentExpression,
  isLuxoBridgeEnabled,
  triggerExpressionForEmotion,
} from '../../src/emotion/emotion-expression-bridge.js';

describe('ferni:luxo-bridge routing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => localStorage.clear());

  it('routes to Luxo when the flag is unset (current behaviour)', () => {
    expect(isLuxoBridgeEnabled()).toBe(true);
    triggerExpressionForEmotion('happy');
    expect(luxo.setExpression).toHaveBeenCalledWith('happy', { duration: 300 });
    expect(lid.happy).not.toHaveBeenCalled();
    expect(getCurrentExpression()).toBe('happy');
  });

  it("routes to the lid overlay when the flag is 'false'", () => {
    localStorage.setItem(LUXO_BRIDGE_FLAG_KEY, 'false');
    expect(isLuxoBridgeEnabled()).toBe(false);
    triggerExpressionForEmotion('happy');
    expect(lid.happy).toHaveBeenCalledWith(800);
    expect(luxo.setExpression).not.toHaveBeenCalled();
    expect(getCurrentExpression()).toBeNull();
  });

  it('keeps Luxo routing when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(isLuxoBridgeEnabled()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
