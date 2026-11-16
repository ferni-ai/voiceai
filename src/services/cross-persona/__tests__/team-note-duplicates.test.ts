/**
 * One team note per wording, in the panel's voice.
 *
 * 2026-11-16 audit: GET /api/team-insights carried "From ferni: You mentioned some
 * things you wanted to do: ... Just checking in - no pressure." six times, and the team
 * panel showed its first-run empty state anyway. The scan runs on every GET and only an
 * hour-old copy counted as a duplicate, so the note was saved again every hour it lived.
 */
import { describe, expect, it } from 'vitest';
import type { CrossPersonaInsight } from '../cross-persona-insights.js';
import { insightChanges, isRecentDuplicate } from '../insight-store.js';
import { toClientDiscoveries, toClientInsight, withoutDashPauses } from '../insight-wire-format.js';

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const WORDS =
  'You mentioned some things you wanted to do: "make some keys". Just checking in - no pressure.';

const note = (id: string, ageHours: number, content = WORDS): CrossPersonaInsight => ({
  id,
  source: 'ferni',
  target: 'all',
  priority: 'high',
  content,
  category: 'commitment-followup',
  createdAt: NOW - ageHours * HOUR,
  expiresAt: NOW - ageHours * HOUR + 24 * HOUR,
  proactive: true,
  oneTime: true,
});

describe('isRecentDuplicate: the same words while the first is live', () => {
  it('a copy two hours later is a duplicate, not a second note', () => {
    expect(isRecentDuplicate(note('first', 2), note('again', 0), NOW)).toBe(true);
  });

  it('new words two hours later are a new note', () => {
    expect(isRecentDuplicate(note('first', 2), note('next', 0, 'Something new.'), NOW)).toBe(false);
  });

  it('the same words once the first has expired are a new note', () => {
    expect(isRecentDuplicate(note('first', 25), note('again', 0), NOW)).toBe(false);
  });

  it('the stored list keeps one copy when the hourly scan adds it again', () => {
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const stored = [note('first', 5)];
      expect(
        insightChanges
          .add(note('again', 0))(stored)
          .map((i) => i.id)
      ).toEqual(['first']);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('toClientDiscoveries: the panel list', () => {
  it('six stored copies of one note are one card, newest, in a comma not a dash', () => {
    const copies = [1, 2, 3, 4, 5, 6].map((h) => note(`copy-${h}`, h));

    const cards = toClientDiscoveries(copies, []);

    expect(cards.map((c) => c.id)).toEqual(['copy-1']);
    expect(cards[0].content).toBe(
      'You mentioned some things you wanted to do: "make some keys". Just checking in, no pressure.'
    );
    expect(cards[0].content).not.toMatch(/From ferni/);
  });

  it('leaves out a note the panel already lists as an insight', () => {
    const listed = [toClientInsight(note('shown', 1))];
    expect(toClientDiscoveries([note('shown', 1), note('copy', 2)], listed)).toEqual([]);
  });
});

describe('withoutDashPauses', () => {
  it('turns spaced hyphens and dashes into commas, and leaves ranges and words alone', () => {
    expect(withoutDashPauses('a pattern here - a habit could help')).toBe(
      'a pattern here, a habit could help'
    );
    expect(withoutDashPauses('steady — no rush')).toBe('steady, no rush');
    expect(withoutDashPauses('3 - 5 days, a well-earned rest')).toBe(
      '3 - 5 days, a well-earned rest'
    );
  });

  it('turns an unspaced em dash into a comma too, and leaves a number range alone', () => {
    expect(withoutDashPauses('Just checking in\u2014no pressure.')).toBe(
      'Just checking in, no pressure.'
    );
    expect(withoutDashPauses('pages 3\u20145')).toBe('pages 3\u20145');
    expect(withoutDashPauses('a few words\u2014 5 things')).toBe('a few words, 5 things');
  });
});
