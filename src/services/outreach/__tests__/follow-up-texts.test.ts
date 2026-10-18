import { describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '../../follow-through/index.js';
import { followUp } from '../../follow-through/__tests__/fixtures.js';
import {
  FOLLOW_UP_GAP_MS,
  followUpJobOn,
  followUpText,
  sendDueFollowUpTexts,
  type FollowUpTextDeps,
} from '../follow-up-texts.js';

const NOW = new Date('2026-10-13T16:10:00Z'); // 12:10 in New York; the fixture is due at 12:00

/** An in-memory store with the real one's live() and compare-and-set save(). */
function deps(
  due: FollowUp[],
  opts: { cohort?: string[]; saveOk?: boolean; optedIn?: string[] } = {}
) {
  const docs = new Map(due.map((f) => [f.id, f]));
  const saved: FollowUp[] = [];
  const d: FollowUpTextDeps = {
    store: {
      live: vi.fn(async (u: string) => [...docs.values()].filter((f) => f.userId === u)),
      save: vi.fn(async (next: FollowUp, expected: string) => {
        if (opts.saveOk === false || docs.get(next.id)?.updatedAt !== expected) return false;
        saved.push(next);
        docs.set(next.id, next);
        return true;
      }),
    },
    optedIn: vi.fn(async () => opts.optedIn ?? [...new Set(due.map((f) => f.userId))]),
    resolveFlags: vi.fn(async (u: string): Promise<Record<string, string>> =>
      (opts.cohort ?? ['u1']).includes(u) ? { FOLLOW_THROUGH_TEXTS: 'on' } : {}
    ),
    sendText: vi.fn(async () => ({ sent: true })),
  };
  return { d, saved, docs };
}

describe('sendDueFollowUpTexts', () => {
  it('texts a due reminder through the guarded sender and marks it surfaced by text', async () => {
    const { d, saved } = deps([followUp()]);
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.sendText).toHaveBeenCalledWith({
      userId: 'u1',
      body: "It's Ferni. You asked me to remind you: call mom",
      kind: 'follow-up',
      refId: 'f1',
      minGapMs: FOLLOW_UP_GAP_MS,
    });
    expect(report.sent).toBe(1);
    expect(saved[0]).toMatchObject({ status: 'surfaced', surfaced: [{ via: 'text' }] });
    expect(d.store.save).toHaveBeenCalledWith(saved[0], followUp().updatedAt);
  });

  it('sends nothing to someone whose FOLLOW_THROUGH_TEXTS is off', async () => {
    const { d, saved } = deps([followUp({ userId: 'mom' })]);
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.sendText).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(report.notInCohort).toBe(1);
  });

  it('sends one text per person per run, the oldest due first', async () => {
    const older = followUp({ id: 'old', dueAt: '2026-10-13T15:30:00.000Z', text: 'take the pill' });
    const { d } = deps([followUp(), older]);
    await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.sendText).toHaveBeenCalledTimes(1);
    expect(d.sendText).toHaveBeenCalledWith(expect.objectContaining({ refId: 'old' }));
  });

  it('expires a follow-up long past due instead of texting it', async () => {
    const stale = followUp({ id: 'stale', dueAt: '2026-10-09T16:00:00.000Z' });
    const { d, saved } = deps([stale]);
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.sendText).not.toHaveBeenCalled();
    expect(report.expired).toBe(1);
    expect(saved[0]?.status).toBe('expired');
  });

  it('does not text a commitment during quiet hours', async () => {
    const late = new Date('2026-10-14T02:30:00Z'); // 22:30 in New York
    const c = followUp({ kind: 'commitment', dueAt: '2026-10-14T02:00:00.000Z' });
    const { d } = deps([c]);
    expect((await sendDueFollowUpTexts(d, { now: late })).sent).toBe(0);
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('counts why the guarded sender held a text and puts the claim back for a later run', async () => {
    const { d, docs } = deps([followUp()]);
    d.sendText = vi.fn(async () => ({ sent: false, reason: 'opted-out' }));
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(report.held).toEqual({ 'opted-out': 1 });
    expect(docs.get('f1')).toEqual(followUp());

    d.sendText = vi.fn(async () => ({ sent: true }));
    expect((await sendDueFollowUpTexts(d, { now: NOW })).sent).toBe(1);
  });

  it('claims before sending: a call that raised it first means no text', async () => {
    const { d, docs } = deps([followUp()]);
    const read = d.store.live;
    // A call surfaces f1 between the job's read and its claim.
    d.store.live = vi.fn(async (u: string) => {
      const theirs = await read(u);
      docs.set('f1', { ...followUp(), status: 'surfaced', updatedAt: '2026-10-13T16:09:00.000Z' });
      return theirs;
    });
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.sendText).not.toHaveBeenCalled();
    expect(report).toMatchObject({ sent: 0, lostSaves: 1 });
  });

  it('reads and writes nothing for someone not opted in, even a stale follow-up', async () => {
    const stale = followUp({ userId: 'mom', id: 'stale', dueAt: '2026-10-09T16:00:00.000Z' });
    const { d } = deps([stale], { cohort: ['u1'] });
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.store.live).not.toHaveBeenCalled();
    expect(d.store.save).not.toHaveBeenCalled();
    expect(report).toMatchObject({ expired: 0, notInCohort: 1 });
  });

  it('reads only the opted-in people, so nobody else crowds them out', async () => {
    const others = Array.from({ length: 300 }, (_, i) =>
      followUp({ id: `o${i}`, userId: `other${i}`, dueAt: '2026-10-13T15:00:00.000Z' })
    );
    const { d } = deps([...others, followUp()], { optedIn: ['u1'] });
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(d.store.live).toHaveBeenCalledTimes(1);
    expect(d.store.live).toHaveBeenCalledWith('u1');
    expect(report).toMatchObject({ people: 1, sent: 1 });
  });

  it('one person failing does not stop the run for the people after them', async () => {
    const { d } = deps([followUp({ id: 'a', userId: 'broken' }), followUp()], {
      cohort: ['broken', 'u1'],
    });
    const flags = d.resolveFlags;
    d.resolveFlags = vi.fn(async (u: string) => {
      if (u === 'broken') throw new Error('flag read failed');
      return flags(u);
    });
    const report = await sendDueFollowUpTexts(d, { now: NOW });
    expect(report).toMatchObject({ errors: 1, sent: 1 });
    expect(d.sendText).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('reports a lost save, and sends nothing, when the claim loses', async () => {
    const { d } = deps([followUp()], { saveOk: false });
    expect((await sendDueFollowUpTexts(d, { now: NOW })).lostSaves).toBe(1);
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('in a dry run sends and saves nothing but counts what it would do', async () => {
    const stale = followUp({ id: 'stale', dueAt: '2026-10-09T16:00:00.000Z' });
    const { d, saved } = deps([followUp(), stale]);
    const report = await sendDueFollowUpTexts(d, { now: NOW, dryRun: true });
    expect(d.sendText).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(report).toMatchObject({ wouldSend: 1, expired: 1, sent: 0 });
  });
});

describe('followUpText and the kill switch', () => {
  it('asks how a commitment went, in their words', () => {
    expect(followUpText(followUp({ kind: 'commitment', text: 'go for a run' }))).toBe(
      'It\'s Ferni. How did it go? You said: "go for a run"'
    );
  });

  it('is off unless FOLLOW_THROUGH_JOB is on', () => {
    expect(followUpJobOn({})).toBe(false);
    expect(followUpJobOn({ FOLLOW_THROUGH_JOB: 'on' })).toBe(true);
  });
});
