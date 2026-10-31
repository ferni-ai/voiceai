/**
 * The crisis lines and emergency number an unverified message may carry come
 * from the safety context (CRISIS_RESOURCES and EMERGENCY_NUMBER, exported by
 * services/safety/index.ts), the one source of truth. Replaced here with
 * fictional ones: if the filter kept its own copy, the fictional numbers would
 * be refused and the real ones would still pass.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../services/safety/index.js', () => ({
  EMERGENCY_NUMBER: '119',
  SAFETY_CRISIS_RESOURCES: {
    fictional: [{ name: 'Fictional Line', description: '', phone: '1-555-010-0199', text: 'Text HELP to 424242', available: '24/7' }], // prettier-ignore
  },
}));

import { blockedContent } from '../owner-message-content.js';

describe('crisis lines are read from the crisis module', () => {
  it('a line in that list passes alone, by phone or by text', () => {
    expect(blockedContent('call 1-555-010-0199 any time')).toBeNull();
    expect(blockedContent('text HELP to 424242')).toBeNull();
  });

  it('the emergency number is read from there too', () => {
    expect(blockedContent('call 119 right away')).toBeNull();
    expect(blockedContent('call 911 right away')).toBe('short_code');
  });

  it('a number missing from that list is no crisis line', () => {
    expect(blockedContent('text 741741 now')).toBe('short_code');
  });
});
