import { describe, expect, it } from 'vitest';
import type { SignificantDate } from '../../../memory/recall/significant-dates.js';
import { createSignificantDatesRecorder } from '../significant-dates-recorder.js';

// Friday 2026-10-02, 19:00 in Denver
const now = () => new Date('2026-10-03T01:00:00Z');

describe('createSignificantDatesRecorder', () => {
  it('notes a stored date that falls today in the caller calendar', () => {
    const userData: { timezone?: string; daysThatMatter?: string | null } = {
      timezone: 'America/Denver',
    };
    const recorder = createSignificantDatesRecorder({ userData, now });
    recorder.loaded([
      { id: 'loss-dad-10-2', kind: 'loss', who: 'dad', month: 9, day: 2, year: 2019 },
    ]);
    expect(userData.daysThatMatter).toContain('Today is the anniversary of losing their dad');
  });

  it('saves a date the caller mentions, once, and not one already known', () => {
    const userData = { timezone: 'America/Denver' };
    const saved: SignificantDate[] = [];
    const recorder = createSignificantDatesRecorder({ userData, now, save: (d) => saved.push(d) });
    recorder.loaded([{ id: 'birthday-self-3-3', kind: 'birthday', who: 'self', month: 2, day: 3 }]);

    recorder.heard('My birthday is March 3rd'); // already known
    recorder.heard("My mom's birthday is June 14");
    recorder.heard("My mom's birthday is June 14");
    recorder.heard('We had pizza tonight');
    expect(saved.map((d) => d.id)).toEqual(['birthday-mom-6-14']);
  });
});
