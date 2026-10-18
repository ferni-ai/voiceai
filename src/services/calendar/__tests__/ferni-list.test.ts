/**
 * Ferni's own list as the caller hears it (#1547): all-day items are named, not dropped.
 */
import { describe, expect, it } from 'vitest';
import { describeFerniList } from '../ferni-list.js';

describe('describeFerniList', () => {
  it('names an all-day item instead of dropping it', () => {
    expect(describeFerniList([{ startTime: '2026-10-17T00:00:00.000Z', title: 'Holiday', isAllDay: true }])).toBe(
      'All day Holiday'
    );
  });

  it('names timed items, with the day when asked', () => {
    const events = [{ startTime: '2026-10-17T16:00:00.000Z', title: 'Lunch with Sam' }];
    expect(describeFerniList(events)).toMatch(/^\d{1,2}:\d{2} [AP]M Lunch with Sam$/);
    expect(describeFerniList(events, true)).toMatch(/^\w{3}, \w{3} \d{1,2} \d{1,2}:\d{2} [AP]M Lunch with Sam$/);
  });
});
