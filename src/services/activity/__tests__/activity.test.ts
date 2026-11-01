import { describe, expect, it } from 'vitest';
import { ACTIVITY_STATES, canMove, LIMITS } from '../activity.js';
import type {
  Activity,
  ActivityChange,
  ActivityPatch,
  ActivityState,
  NewActivity,
} from '../activity.js';
import { applyChange, type Applied } from '../activity-change.js';
import { subjectKey, toActivity } from '../activity-parse.js';

const AT = '2026-10-27T14:00:00.000Z';
const LATER = '2026-10-27T15:00:00.000Z';
const ask = (over: Partial<NewActivity> = {}): NewActivity => ({
  kind: 'call',
  subject: { name: 'Doug', relationship: 'dad', contactId: 'c-doug' },
  asked: { at: AT, sessionId: 's-1', words: 'call my dad and ask about Sunday' },
  ...over,
});
const create = (over: Partial<NewActivity> = {}, key?: string): ActivityChange => ({
  op: 'create',
  source: 'callOnBehalf',
  record: ask(over),
  ...(key ? { key } : {}),
});
const made = (): Activity => (applyChange(null, create(), 'a1', AT) as Applied).next;
const stored = (a: Activity): Record<string, unknown> => {
  const { id: _id, ...rest } = a;
  return rest as Record<string, unknown>;
};

describe('state moves', () => {
  it('go forward only and never leave a closed state', () => {
    const legal: Array<[ActivityState, ActivityState]> = [
      ['asked', 'confirmed'],
      ['asked', 'in_progress'], // an immediate call skips confirm and schedule
      ['asked', 'cancelled'], // owner said no
      ['confirmed', 'scheduled'],
      ['scheduled', 'in_progress'],
      ['in_progress', 'done'],
      ['in_progress', 'failed'],
    ];
    const illegal: Array<[ActivityState, ActivityState]> = [
      ['confirmed', 'asked'],
      ['in_progress', 'scheduled'],
      ['done', 'in_progress'],
      ['failed', 'scheduled'],
      ['cancelled', 'confirmed'],
    ];
    for (const [a, b] of legal) expect(canMove(a, b), `${a}->${b}`).toBe(true);
    for (const [a, b] of illegal) expect(canMove(a, b), `${a}->${b}`).toBe(false);
    for (const s of ACTIVITY_STATES) expect(canMove(s, s)).toBe(true);
  });
});

describe('applyChange', () => {
  it('creates at revision 1 in state asked, with a create event that holds no words', () => {
    const r = applyChange(null, create(), 'a1', AT) as Applied;
    expect(r.next).toMatchObject({
      id: 'a1',
      revision: 1,
      state: 'asked',
      told: [],
      followUps: [],
    });
    expect(r.next.subjectKeys).toEqual(['contact:c-doug', 'name:doug']);
    expect(r.event).toMatchObject({
      activityId: 'a1',
      seq: 1,
      op: 'create',
      from: null,
      to: 'asked',
    });
    expect(JSON.stringify(r.event)).not.toContain('Sunday');
  });

  it('clips the ask to LIMITS.words and refuses an empty subject name', () => {
    const long = 'x'.repeat(LIMITS.words + 50);
    const r = applyChange(
      null,
      create({ asked: { at: AT, sessionId: 's', words: long } }),
      'a',
      AT
    );
    expect((r as Applied).next.asked.words).toHaveLength(LIMITS.words);
    expect(applyChange(null, create({ subject: { name: '' } }), 'a', AT)).toBe('invalid');
  });

  it('bumps the revision by one, appends told and followUps, merges links', () => {
    const a = made();
    const r = applyChange(
      a,
      {
        op: 'update',
        id: 'a1',
        source: 'call-result',
        patch: {
          state: 'in_progress',
          links: { onBehalfCallId: 'ob-1' },
          told: [{ at: LATER, sessionId: 's-2', channel: 'voice' }],
          followUps: ['a2', 'a2'],
        },
      },
      'a1',
      LATER
    ) as Applied;
    expect(r.next).toMatchObject({ revision: 2, state: 'in_progress', updatedAt: LATER });
    expect(r.next.links).toEqual({ onBehalfCallId: 'ob-1' });
    expect(r.next.followUps).toEqual(['a2']);
    expect(r.event).toMatchObject({ seq: 2, from: 'asked', to: 'in_progress' });
    expect([...r.event.fields].sort()).toEqual(['followUps', 'links', 'state', 'told']);
  });

  it('a new state drops the old reason unless the change gives one; the same state keeps it', () => {
    const held = { ...made(), state: 'scheduled' as const, reason: 'call_hours' as const };
    const upd = (patch: ActivityPatch) =>
      (applyChange(held, { op: 'update', id: 'a1', source: 't', patch }, 'a1', LATER) as Applied)
        .next;
    expect(upd({ state: 'in_progress' }).reason).toBeUndefined();
    expect(upd({ state: 'failed', reason: 'no_answer' }).reason).toBe('no_answer');
    expect(upd({ scheduledFor: LATER }).reason).toBe('call_hours');
  });

  it('refuses an illegal move, a create over an existing record and an update of none', () => {
    const done = { ...made(), state: 'done' as const };
    const back: ActivityChange = { op: 'update', id: 'a1', source: 't', patch: { state: 'asked' } };
    expect(applyChange(done, back, 'a1', LATER)).toBe('illegal_transition');
    expect(applyChange(made(), create(), 'a1', LATER)).toBe('exists');
    expect(applyChange(null, back, 'a1', LATER)).toBe('not_found');
  });

  it('still records told and the outcome on a closed record', () => {
    const done = { ...made(), state: 'done' as const };
    const r = applyChange(
      done,
      {
        op: 'update',
        id: 'a1',
        source: 'recall',
        patch: {
          outcome: { status: 'reached', theySaid: 'see you Sunday', actionItems: [] },
          told: [{ at: LATER, sessionId: 's-3', channel: 'voice' }],
        },
      },
      'a1',
      LATER
    ) as Applied;
    expect(r.next.state).toBe('done');
    expect(r.next.outcome?.theySaid).toBe('see you Sunday');
    expect(r.next.told).toHaveLength(1);
  });
});

describe('toActivity (strict parser)', () => {
  it('reads back what applyChange wrote', () => {
    expect(toActivity('a1', stored(made()))).toEqual(made());
  });

  it.each([
    ['an unknown field', { transcript: 'everything they said' }],
    ['another shape version', { v: 2 }],
    ['an unknown state', { state: 'maybe' }],
    ['a free-text reason', { reason: 'he was busy' }],
    ['revision 0', { revision: 0 }],
    ['words over the limit', { asked: { at: AT, sessionId: 's', words: 'x'.repeat(201) } }],
    ['subjectKeys out of step with subject', { subjectKeys: ['name:mom'] }],
    ['an unknown link', { links: { stripeId: 'x' } }],
    ['already quarantined', { quarantined: { at: AT } }],
  ])('rejects %s', (_label, over) => {
    expect(toActivity('a1', { ...stored(made()), ...over })).toBeNull();
  });

  it('rejects an id that would address another path', () => {
    expect(toActivity('a/b', stored(made()))).toBeNull();
  });
});

describe('subjectKey', () => {
  it('prefers the contact id and normalizes a name, any script', () => {
    expect(subjectKey({ contactId: 'c1', name: 'Doug' })).toBe('contact:c1');
    expect(subjectKey({ name: '  Doug   Ford ' })).toBe('name:doug_ford');
    expect(subjectKey({ name: '妈妈' })).toBe('name:妈妈');
    expect(subjectKey({ name: '!!' })).toBeUndefined();
  });
});
