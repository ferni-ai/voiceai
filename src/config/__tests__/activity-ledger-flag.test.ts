import { describe, expect, it } from 'vitest';
import { activityLedgerEnabled } from '../activity-ledger-flag.js';

describe('ACTIVITY_LEDGER flag', () => {
  it('is off by default and on only when set', () => {
    expect(activityLedgerEnabled({})).toBe(false);
    expect(activityLedgerEnabled({ ACTIVITY_LEDGER: 'on' })).toBe(true);
    expect(activityLedgerEnabled({ ACTIVITY_LEDGER: 'off' })).toBe(false);
  });
});
