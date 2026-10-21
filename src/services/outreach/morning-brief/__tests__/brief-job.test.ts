/**
 * The morning-brief run: who gets it, when, how often, and what happens when
 * the text can't go. Every edge is a fake dep; the run itself is real.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';
import { runMorningBriefs, type DayItems, type MorningBriefDeps } from '../brief-job.js';

const SETH = 'uid-seth';
const CHICAGO = { contactInfo: { timezone: 'America/Chicago' }, name: 'Seth Ford' };
// 18 Oct 2026, Chicago is UTC-5.
const EIGHT_AM = new Date('2026-10-18T13:05:00Z');
const SEVEN_AM = new Date('2026-10-18T12:05:00Z');

const day: DayItems = {
  events: [{ title: 'Standup', start: new Date('2026-10-18T15:00:00Z'), allDay: false }],
  reminders: ['Call the plumber'],
  tasks: [],
  commitments: [],
};

function fakeDeps(over: Partial<MorningBriefDeps> = {}, env: Record<string, string> = {}) {
  const claimed = new Set<string>();
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const sendPush = vi.fn(async () => true);
  const deps: MorningBriefDeps = {
    env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: SETH, ...env },
    cohortUsers: async () => [],
    userDoc: async () => CHICAGO,
    readDay: async () => day,
    claims: {
      async claim(userId, dateKey, kind) {
        const key = `${userId}:${dateKey}:${kind}`;
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      async release(userId, dateKey, kind) {
        claimed.delete(`${userId}:${dateKey}:${kind}`);
      },
    },
    sendText,
    sendPush,
    ...over,
  };
  return { deps, sendText, sendPush, claimed };
}

describe('runMorningBriefs', () => {
  it('sends nothing while MORNING_BRIEF is off, even to a listed user', async () => {
    const { deps, sendText, sendPush } = fakeDeps({}, { MORNING_BRIEF: 'off' });
    const { recipients, report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(recipients).toEqual([]);
    expect(report.checked).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  // Prod turns MORNING_BRIEF on for the whole web server (#2233), so the server flag must
  // never mean "everyone": only the env list and people whose own cohort or override is on.
  it('with MORNING_BRIEF on, sends to no one who is neither listed nor flagged', async () => {
    const { deps, sendText, sendPush } = fakeDeps({}, { MORNING_BRIEF_USERS: '' });
    const { recipients, report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(recipients).toEqual([]);
    expect(report.checked).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('with MORNING_BRIEF on and no env list, sends only to people whose own flag is on', async () => {
    const { deps, sendText } = fakeDeps(
      { cohortUsers: async () => [SETH] },
      { MORNING_BRIEF_USERS: '' }
    );
    const { recipients } = await runMorningBriefs(deps, EIGHT_AM);
    expect(recipients).toEqual([SETH]);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].userId).toBe(SETH);
  });

  it('texts a listed user once at 8am their time, as a morning-brief from Alex', async () => {
    const { deps, sendText, sendPush } = fakeDeps();
    const { recipients, report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(recipients).toEqual([SETH]);
    expect(report).toMatchObject({ checked: 1, sent: 1, skipped: 0, pushedInstead: {} });
    expect(sendText).toHaveBeenCalledTimes(1);
    const text = sendText.mock.calls[0][0];
    expect(text).toMatchObject({
      userId: SETH,
      kind: 'morning-brief',
      refId: 'morning-brief:2026-10-18',
      minGapMs: 20 * 60 * 60 * 1000,
    });
    expect(text.body).toBe(
      "Morning Seth, it's Alex. Today: 10am Standup. Due: Call the plumber. Call me if you want to move anything."
    );
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('includes cohort members, without listing anyone twice', async () => {
    const { deps, sendText } = fakeDeps({ cohortUsers: async () => [SETH, 'uid-mindy'] });
    const { recipients } = await runMorningBriefs(deps, EIGHT_AM);
    expect(recipients).toEqual([SETH, 'uid-mindy']);
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it('sends nothing at 7am their time', async () => {
    const { deps, sendText } = fakeDeps();
    const { report } = await runMorningBriefs(deps, SEVEN_AM);
    expect(report.reasons).toEqual({ 'not-8am': 1 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('sends once when the job runs again the same morning', async () => {
    const { deps, sendText } = fakeDeps();
    await runMorningBriefs(deps, EIGHT_AM);
    const second = await runMorningBriefs(deps, new Date(EIGHT_AM.getTime() + 15 * 60_000));
    expect(second.report).toMatchObject({ sent: 0, reasons: { 'already-sent': 1 } });
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('skips someone with no stored time zone rather than guess UTC', async () => {
    const { deps, sendText } = fakeDeps({ userDoc: async () => ({ name: 'Seth' }) });
    // 08:05 UTC: a UTC fallback would send now.
    const { report } = await runMorningBriefs(deps, new Date('2026-10-18T08:05:00Z'));
    expect(report.reasons).toEqual({ 'no-timezone': 1 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('skips a day with nothing on it and frees the claim', async () => {
    const empty: DayItems = { events: [], reminders: [], tasks: [], commitments: [] };
    const { deps, sendText, claimed } = fakeDeps({ readDay: async () => empty });
    const { report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(report.reasons).toEqual({ 'nothing-today': 1 });
    expect(sendText).not.toHaveBeenCalled();
    expect(claimed.size).toBe(0);
  });

  it('pushes the same words from Alex when the text cannot go', async () => {
    const noPhone = vi.fn(async (): Promise<TextOutcome> => ({
      sent: false,
      reason: 'no-verified-phone',
    }));
    const { deps, sendPush } = fakeDeps({ sendText: noPhone });
    const { report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(report).toMatchObject({ sent: 1, pushedInstead: { 'no-verified-phone': 1 } });
    expect(sendPush).toHaveBeenCalledWith(
      SETH,
      expect.objectContaining({
        personaId: 'alex-chen',
        body: expect.stringContaining("it's Alex. Today: 10am Standup."),
      })
    );
    expect(noPhone).toHaveBeenCalledTimes(1);
  });

  it('does not push after a text already went this morning', async () => {
    const { deps, sendPush, claimed } = fakeDeps({
      sendText: vi.fn(async (): Promise<TextOutcome> => ({ sent: false, reason: 'recently-sent' })),
    });
    const { report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(report.reasons).toEqual({ 'recently-sent': 1 });
    expect(sendPush).not.toHaveBeenCalled();
    expect(claimed.size).toBe(1);
  });

  it('frees the claim when neither text nor push went, so a later run can try', async () => {
    const { deps, claimed } = fakeDeps({
      sendText: vi.fn(async (): Promise<TextOutcome> => ({ sent: false, reason: 'sms-off' })),
      sendPush: vi.fn(async () => false),
    });
    const { report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(report.reasons).toEqual({ 'no-channel': 1 });
    expect(claimed.size).toBe(0);
  });

  it('holds the brief for someone whose quiet hours run past 8am', async () => {
    const late = {
      ...CHICAGO,
      outreachPreferences: { quietHours: { enabled: true, start: '22:00', end: '09:00' } },
    };
    const { deps, sendText } = fakeDeps({ userDoc: async () => late });
    const { report } = await runMorningBriefs(deps, EIGHT_AM);
    expect(report.reasons).toEqual({ 'quiet-hours': 1 });
    expect(sendText).not.toHaveBeenCalled();
  });
});
