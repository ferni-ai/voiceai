/**
 * Alex's morning brief text: what goes in, what it never says, and how it fits.
 */
import { describe, expect, it } from 'vitest';
import { MAX_CHARS, cleanItem, composeMorningBrief, type MorningBriefInput } from '../compose.js';

const CHICAGO = 'America/Chicago';
// 18 Oct 2026, Central daylight time is UTC-5.
const at = (hhmm: string): Date => new Date(`2026-10-18T${hhmm}:00-05:00`);

const empty: MorningBriefInput = {
  timeZone: CHICAGO,
  events: [],
  reminders: [],
  tasks: [],
  commitments: [],
};

describe('composeMorningBrief', () => {
  it('puts the calendar, reminders, tasks and commitments in one text', () => {
    const text = composeMorningBrief({
      ...empty,
      name: 'Seth',
      events: [
        { title: 'Dentist', start: at('14:00'), allDay: false },
        { title: 'Standup', start: at('10:00'), allDay: false },
      ],
      reminders: ['Call the plumber'],
      tasks: ['Renew passport'],
      commitments: ["I'm going to send Mindy the photos"],
    });
    expect(text).toBe(
      "Morning Seth, it's Alex. Today: 10am Standup and 2pm Dentist. Due: Call the plumber. " +
        'Still open: Renew passport and send Mindy the photos. Call me if you want to move anything.'
    );
  });

  it('still sends on a day with no meetings when a reminder is due', () => {
    const text = composeMorningBrief({ ...empty, reminders: ['Pick up the dry cleaning'] });
    expect(text).toBe(
      "Morning, it's Alex. Due: Pick up the dry cleaning. Call me if you want a hand with any of it."
    );
    expect(text).not.toContain('Today:');
  });

  it('gives null when there is nothing at all today', () => {
    expect(composeMorningBrief(empty)).toBeNull();
    // Items that clean down to nothing count as nothing.
    expect(composeMorningBrief({ ...empty, tasks: ['\u{1F389}'] })).toBeNull();
  });

  it('stays under the cap and ends a long list with "and N more"', () => {
    const events = Array.from({ length: 9 }, (_, i) => ({
      title: `Planning session number ${i + 1} with the whole team`,
      start: at(`${String(8 + i).padStart(2, '0')}:30`),
      allDay: false,
    }));
    const text = composeMorningBrief({
      ...empty,
      name: 'Seth',
      events,
      reminders: ['Call the plumber about the leak under the sink', 'Water the plants', 'Pay rent'],
      tasks: ['Renew passport', 'Book flights for Thanksgiving', 'Fix the gate'],
      commitments: ['Send Mindy the photos', 'Go for a run'],
    });
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(text).toMatch(/Today: 8:30am Planning session number 1 with the .* and \d+ more\./);
    expect(text).toMatch(/Still open: .* and \d+ more\./);
  });

  it('never says an em dash, an ellipsis or an emoji', () => {
    const text = composeMorningBrief({
      ...empty,
      events: [{ title: 'Lunch — with Sam… \u{1F37D}\u{FE0F}', start: at('12:00'), allDay: false }],
      tasks: ['Call mom...'],
    });
    expect(text).toBe(
      "Morning, it's Alex. Today: 12pm Lunch, with Sam. Still open: Call mom. Call me if you want to move anything."
    );
    expect(text).not.toMatch(/[—–…]|\.\.\.|\p{Extended_Pictographic}/u);
  });

  it('shows an all-day event without a time', () => {
    const text = composeMorningBrief({
      ...empty,
      events: [{ title: "Mindy's birthday", start: at('00:00'), allDay: true }],
    });
    expect(text).toContain("Today: Mindy's birthday.");
  });
});

describe('cleanItem', () => {
  it('cuts a long item at a word, with no ellipsis', () => {
    const item = cleanItem('Write the quarterly planning document for the whole leadership team');
    expect(item.length).toBeLessThanOrEqual(40);
    expect(item).toBe('Write the quarterly planning document');
  });

  it('turns what they said they would do into a to-do, names left alone', () => {
    expect(cleanItem("I'll call Mindy about Thanksgiving.")).toBe('call Mindy about Thanksgiving');
    expect(cleanItem("Mindy's birthday")).toBe("Mindy's birthday");
  });
});

describe('nothing in a brief can carry someone else\'s phishing', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 19, h, 0));
  const base = { timeZone: 'America/New_York', reminders: [], tasks: [], commitments: [] };

  it('shows an outside invite by time only, never its title', () => {
    const text = composeMorningBrief({
      ...base,
      events: [
        { title: 'Your account is locked, call 555 201 8899 now', start: at(19), allDay: false, invite: true },
        { title: 'Standup', start: at(14), allDay: false },
      ],
    });
    expect(text).toContain('an invite at 3pm');
    expect(text).toContain('10am Standup');
    expect(text).not.toMatch(/locked|555|account/i);
  });

  it('strips links, domains, emails and phone numbers from any line', () => {
    const text = composeMorningBrief({
      ...base,
      events: [{ title: 'Sync https://evil.example/x', start: at(14), allDay: false }],
      reminders: ['pay at paypa1-secure.com today', 'text +1 (801) 555-0199 back'],
      tasks: ['email boss@corp.co the deck'],
    })!;
    for (const bad of ['https', 'evil', 'paypa1', '.com', '555', '0199', '@', 'corp.co']) {
      expect(text).not.toContain(bad);
    }
    expect(text).toContain('Sync');
  });

  it('catches look-alike dots, any domain ending and a link at the length cut', () => {
    for (const raw of [
      'login at paypal．com now',
      'go to account-help。support today',
      'see evil.example/reset',
      'go to evil.\u{1F642}com',
      'go to evil\u200B.com',
      'call 801\u2060555\u20600199',
      `${'word '.repeat(7)}https://evil.example/very/long/path`,
    ]) {
      const out = cleanItem(raw);
      expect(out, raw).not.toMatch(/paypal|support|evil|https|\.com|555|0199/i);
    }
  });

  it('cleans a pathological title quickly', () => {
    const t0 = performance.now();
    cleanItem(`${'1 '.repeat(5000)}x ${'a.'.repeat(5000)}com`);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
