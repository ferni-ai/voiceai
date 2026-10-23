import { describe, expect, it } from 'vitest';
import { ALL_COPY } from '../on-it-copy.js';
import { buildOnIt, type OnItInput, type OnItRow } from '../on-it.js';
import {
  NEVER_SHOWN,
  NOW,
  at,
  changedFollowUps,
  errand,
  liveFollowUps,
  openErrands,
} from './fixtures.js';

const input = (over: Partial<OnItInput> = {}): OnItInput => ({
  userId: 'uid-A',
  live: liveFollowUps(),
  changed: changedFollowUps(),
  errands: openErrands(),
  forgotten: (text) => text.includes('divorce'),
  now: new Date(NOW),
  ...over,
});

const rowsOf = (view: ReturnType<typeof buildOnIt>, id: string): OnItRow[] =>
  view.sections.find((s) => s.id === id)?.rows.slice() ?? [];

/** Words that are the system talking, never a friend (engagement spec 5.1 "Never"). */
const SYSTEM_WORDS =
  /\baction\b|executing|\brequest|\bconfirmed\b|\bAI\b|[a-z][A-Z]\w*\(|\b[a-z]+[A-Z]\w*\b/;

describe('buildOnIt', () => {
  it('a held item, a closed follow-up and errands give all four sections, in screen order', () => {
    const view = buildOnIt(input());

    expect(view.sections.map((s) => [s.id, s.title])).toEqual([
      ['waitingOnYou', 'Waiting on you'],
      ['doing', 'On it'],
      ['holding', 'Holding for you'],
      ['done', 'Done lately'],
    ]);
    expect(rowsOf(view, 'waitingOnYou').map((r) => r.id)).toEqual([
      'follow-up:wait-call',
      'errand:e-ask',
    ]);
    expect(rowsOf(view, 'doing').map((r) => r.id)).toEqual(['errand:e-calling', 'errand:e-money']);
    expect(rowsOf(view, 'holding').map((r) => r.id)).toEqual([
      'follow-up:held-late',
      'follow-up:held-soon',
      'follow-up:held-number',
      'follow-up:held-thread',
    ]);
    expect(rowsOf(view, 'done').map((r) => r.id)).toEqual([
      'follow-up:done-own',
      'follow-up:done-text',
      'follow-up:done-skipped',
    ]);
    expect(view.asOf).toBe(new Date(NOW).toISOString());
  });

  it('friend-language lines with the owning teammate, and slipped ones own up', () => {
    const view = buildOnIt(input());
    const line = (section: string, id: string) =>
      rowsOf(view, section).find((r) => r.id === id) ?? null;

    expect(line('holding', 'follow-up:held-late')).toMatchObject({
      personaId: 'alex-chen',
      line: "I didn't get to this in time: renew the registration",
    });
    expect(line('holding', 'follow-up:held-thread')).toMatchObject({
      personaId: 'ferni',
      detail: "I'll ask how it went.",
    });
    expect(line('doing', 'errand:e-calling')).toMatchObject({
      personaId: 'alex-chen',
      line: 'Find a dentist who takes my insurance',
      detail: 'Alex is waiting to hear back. Two places left to try.',
    });
    expect(line('doing', 'errand:e-money')).toMatchObject({ personaId: 'peter-john' });
    expect(line('waitingOnYou', 'errand:e-ask')?.detail).toBe(
      'Alex found an opening and would like your okay to book it.'
    );
    expect(rowsOf(view, 'done').map((r) => r.line)).toEqual([
      'Done: book the vet',
      'Sent the message you asked me to send.',
      "I didn't send it. You said not this time.",
    ]);
  });

  it('no tool id, "action", "executing" or "AI" anywhere on the screen or in the copy table', () => {
    const view = buildOnIt(input());
    const shown = view.sections.flatMap((s) => [
      s.title,
      ...s.rows.flatMap((r) => [r.line, r.detail ?? '']),
    ]);

    for (const text of [...shown, ...ALL_COPY]) {
      expect(text).not.toMatch(SYSTEM_WORDS);
      expect(text).not.toMatch(/callOnBehalf|reachOut|tool/i);
    }
  });

  it('no em dash or ellipsis in any copy', () => {
    for (const text of ALL_COPY) expect(text).not.toMatch(/—|…|\.\.\./);
  });

  it('contact details and recipients are blanked: no number, email, name, place or contact id', () => {
    const json = JSON.stringify(buildOnIt(input()));

    for (const secret of NEVER_SHOWN) expect(json).not.toContain(secret);
    expect(json).toContain('Text an email address or a number about the lease');
    expect(json).toContain('Book a dental cleaning, my number is a number');
  });

  it('forgotten topics are left out of every section', () => {
    const view = buildOnIt(
      input({
        errands: [errand({ id: 'e-forgot', goal: 'divorce lawyer consult' })],
        forgotten: (t) => t.includes('divorce'),
      })
    );

    expect(JSON.stringify(view)).not.toMatch(/divorce|forgot/);
  });

  it('fails closed: a forgotten check that throws makes the read throw, never a partial view', () => {
    const throws = (): boolean => {
      throw new Error('forgotten topics unreadable');
    };

    expect(() => buildOnIt(input({ forgotten: throws }))).toThrow('forgotten topics unreadable');
  });

  it("errands off: no doing section and no errand questions; only the caller's rows count", () => {
    const view = buildOnIt(
      input({
        errands: null,
        live: [
          ...liveFollowUps(),
          ...liveFollowUps('uid-B').map((f) => ({ ...f, id: `b-${f.id}` })),
        ],
      })
    );

    expect(view.sections.map((s) => s.id)).toEqual(['waitingOnYou', 'holding', 'done']);
    expect(JSON.stringify(view)).not.toContain('errand:');
    expect(JSON.stringify(view)).not.toContain('b-held');
  });

  it('nothing open and nothing closed lately gives no sections', () => {
    const view = buildOnIt(input({ live: [], changed: [], errands: [] }));

    expect(view.sections).toEqual([]);
  });

  it('a scheduled errand says when it picks back up', () => {
    const view = buildOnIt(
      input({ errands: [errand({ id: 'e-later', state: 'scheduled', nextWakeAt: at(20) })] })
    );

    expect(rowsOf(view, 'doing')[0]).toMatchObject({
      detail: 'Alex will pick this back up soon.',
      at: at(20),
    });
  });
});
