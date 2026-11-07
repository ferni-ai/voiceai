/**
 * replacesReply is guardFromDetection's replace test without its log (#3488): a crisis at
 * SEVERITY.block or above replaces the reply, anything below does not.
 */
import { describe, expect, it } from 'vitest';
import { SEVERITY, replacesReply } from '../crisis-severity.js';

describe('replacesReply', () => {
  it.each([
    [true, SEVERITY.block, true],
    [true, 1, true],
    [true, SEVERITY.block - 0.01, false],
    [false, 1, false],
  ])('isCrisis=%s severity=%s replaces: %s', (isCrisis, severity, replaces) => {
    expect(replacesReply({ isCrisis, severity })).toBe(replaces);
  });
});
