import { describe, expect, it } from 'vitest';
import { parseTrustProfile } from '../parse-trust-profile.js';

describe('parseTrustProfile', () => {
  it('gives back Dates for the dates a profile was saved with, at any depth', () => {
    const saved = {
      lastNoAgendaOutreach: new Date('2026-10-02T22:15:00.000Z'),
      sentMoments: [{ sentAt: new Date('2026-09-30T08:00:00.000Z'), note: 'hi' }],
    };
    const loaded = parseTrustProfile<typeof saved>(JSON.stringify(saved));
    expect(loaded.lastNoAgendaOutreach).toBeInstanceOf(Date);
    expect(loaded.lastNoAgendaOutreach.getTime()).toBe(saved.lastNoAgendaOutreach.getTime());
    expect(loaded.sentMoments[0].sentAt).toBeInstanceOf(Date);
  });

  it('leaves other strings alone, including date-like ones it did not write', () => {
    const loaded = parseTrustProfile<Record<string, unknown>>(
      JSON.stringify({ waitUntil: 'they_bring_it_up', day: '2026-10-02', note: 'see you 2026-10-02T10:00' })
    );
    expect(loaded).toEqual({ waitUntil: 'they_bring_it_up', day: '2026-10-02', note: 'see you 2026-10-02T10:00' });
  });
});
