/**
 * One person's follow-ups and errands that fill all four "Ferni's on it"
 * sections, with the contact details, recipient names and tool ids that must
 * never reach the screen. Shared by the read model and route tests.
 */
import type { Candidate, Errand } from '../../errands/index.js';
import type { FollowUp } from '../../follow-through/index.js';
import { followUp } from '../../follow-through/__tests__/fixtures.js';

export const NOW = Date.parse('2026-10-22T16:00:00.000Z');
export const at = (hours: number): string => new Date(NOW + hours * 3_600_000).toISOString();

export const errand = (over: Partial<Errand> = {}): Errand => ({
  id: 'e1',
  userId: 'uid-A',
  kind: 'appointment',
  goal: 'g',
  zone: 'America/New_York',
  constraints: { prefs: [] },
  state: 'waiting',
  step: 'wait:p1',
  stepVersion: 1,
  revision: 1,
  nextWakeAt: null,
  candidates: [],
  pending: null,
  queue: [],
  asks: 0,
  approvals: [],
  createdAt: at(-24),
  updatedAt: at(-1),
  env: 'test',
  ...over,
});

export const place = (placeId: string, status: Candidate['status']): Candidate => ({
  placeId,
  name: `Bright Smile ${placeId}`,
  phone: '+14155550199',
  why: 'close by',
  status,
  attempts: 0,
});

/** Strings that would mean a contact detail, a recipient or a system word got through. */
export const NEVER_SHOWN = [
  '415-555-0132',
  '4155550199',
  'linda@example.com',
  '415 555 0177',
  'a@example.com',
  'Linda',
  'contact-abc',
  'Bright Smile',
  'callOnBehalf',
  'reachOut',
  'ref-1',
];

export function liveFollowUps(userId = 'uid-A'): FollowUp[] {
  return [
    followUp({ id: 'held-soon', userId, dueAt: at(2), text: 'call the pharmacy' }),
    followUp({ id: 'held-late', userId, dueAt: at(-3), text: 'renew the registration' }),
    followUp({
      id: 'held-thread',
      userId,
      kind: 'thread',
      dueAt: null,
      text: "sister's interview",
    }),
    followUp({
      id: 'held-number',
      userId,
      dueAt: at(5),
      text: 'text linda@example.com or 415-555-0132 about the lease',
    }),
    followUp({ id: 'held-forgot', userId, dueAt: at(1), text: 'the divorce papers' }),
    followUp({
      id: 'wait-call',
      userId,
      kind: 'promise',
      dueAt: at(4),
      text: 'Call Aunt Linda at 415-555-0132 for you',
      source: { store: 'outreach_confirm', ref: 'ref-1' },
      action: { tool: 'callOnBehalf', contactId: 'contact-abc', waitingOn: 'you' },
    }),
  ];
}

export function changedFollowUps(userId = 'uid-A'): FollowUp[] {
  const closed = (id: string, over: Partial<FollowUp>): FollowUp =>
    followUp({ id, userId, closedAt: at(-6), updatedAt: at(-6), ...over });
  return [
    closed('done-text', {
      status: 'done',
      kind: 'promise',
      text: 'Text Linda at 415-555-0132: running late',
      source: { store: 'outreach_confirm', ref: 'ref-1' },
      action: { tool: 'reachOut', contactId: 'contact-abc', outcome: 'sent' },
    }),
    closed('done-own', {
      status: 'done',
      text: 'book the vet, call 415 555 0177 or a@example.com',
      closedAt: at(-2),
    }),
    closed('done-skipped', {
      status: 'released',
      kind: 'promise',
      text: 'Call Linda back',
      action: { tool: 'callOnBehalf', contactId: 'contact-abc' },
    }),
    closed('done-old', { status: 'done', text: 'too long ago', closedAt: at(-24 * 8) }),
    closed('done-forgot', { status: 'done', text: 'the divorce papers' }),
    followUp({ id: 'still-open', userId, updatedAt: at(-1), text: 'call the pharmacy' }),
  ];
}

export function openErrands(userId = 'uid-A'): Errand[] {
  return [
    errand({
      id: 'e-ask',
      userId,
      state: 'awaiting_owner',
      goal: 'book a dental cleaning, my number is 415-555-0132',
      pending: { id: 'e-ask:ask:book:p1:1', action: { verb: 'book', placeIds: ['p1'] } },
      candidates: [place('p1', 'offered')],
    }),
    errand({
      id: 'e-calling',
      userId,
      goal: 'find a dentist who takes my insurance',
      candidates: [place('p1', 'declined'), place('p2', 'new'), place('p3', 'retry')],
    }),
    errand({
      id: 'e-money',
      userId,
      kind: 'purchase-research',
      state: 'acting',
      goal: 'a new fridge',
    }),
  ];
}
