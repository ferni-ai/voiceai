import { describe, expect, it } from 'vitest';
import { endpointingDelays } from '../turn-patience.js';

describe('endpointingDelays', () => {
  it('waits through thinking pauses by default (was 150/450 ms, which cut callers off)', () => {
    const { minEndpointingDelay, maxEndpointingDelay } = endpointingDelays({});
    expect(minEndpointingDelay).toBe(300);
    expect(minEndpointingDelay).toBeLessThan(700); // longer gaps read as hesitation
    expect(maxEndpointingDelay).toBe(2500);
    expect(maxEndpointingDelay).toBeGreaterThanOrEqual(1500); // longer than a typical thinking pause
  });

  it('takes env overrides for tuning by ear', () => {
    expect(
      endpointingDelays({ CASCADE_MIN_ENDPOINTING_MS: '350', CASCADE_MAX_ENDPOINTING_MS: '1800' })
    ).toEqual({
      minEndpointingDelay: 350,
      maxEndpointingDelay: 1800,
    });
  });

  it('clamps nonsense and keeps max >= min', () => {
    expect(
      endpointingDelays({ CASCADE_MIN_ENDPOINTING_MS: '5', CASCADE_MAX_ENDPOINTING_MS: 'later' })
    ).toEqual({
      minEndpointingDelay: 100,
      maxEndpointingDelay: 2500,
    });
    expect(
      endpointingDelays({ CASCADE_MIN_ENDPOINTING_MS: '1500', CASCADE_MAX_ENDPOINTING_MS: '400' })
    ).toEqual({
      minEndpointingDelay: 1500,
      maxEndpointingDelay: 1500,
    });
  });
});
