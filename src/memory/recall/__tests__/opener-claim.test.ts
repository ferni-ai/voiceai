import { afterEach, describe, expect, it } from 'vitest';
import {
  CLAIM_MS,
  claimOpenerFollowUp,
  clearOpenerClaims,
  takeOpenerClaim,
} from '../opener-claim.js';

afterEach(() => clearOpenerClaims());

describe('opener claim', () => {
  it('tells the recall note the greeting already asked, once', () => {
    claimOpenerFollowUp('u1', 'greeting', 1000);
    expect(takeOpenerClaim('u2', 1000)).toBeUndefined(); // another caller
    expect(takeOpenerClaim('u1', 2000)).toBe('greeting');
    expect(takeOpenerClaim('u1', 3000)).toBeUndefined(); // taken: the next call starts clean
  });

  it('lapses, so a stray claim never silences a later call', () => {
    claimOpenerFollowUp('u1', 'greeting', 0);
    expect(takeOpenerClaim('u1', CLAIM_MS + 1)).toBeUndefined();
  });
});
