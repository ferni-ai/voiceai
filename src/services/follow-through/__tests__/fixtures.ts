import type { FollowUp } from '../follow-up.js';

export const NY = 'America/New_York';

export function followUp(over: Partial<FollowUp> = {}): FollowUp {
  return {
    id: 'f1',
    userId: 'u1',
    kind: 'reminder',
    text: 'call mom',
    dueAt: '2026-10-13T16:00:00.000Z',
    zone: NY,
    repeat: null,
    source: { store: 'reminders', ref: 'r1' },
    status: 'open',
    surfaced: [],
    createdAt: '2026-10-12T02:41:00.000Z',
    updatedAt: '2026-10-12T02:41:00.000Z',
    ...over,
  };
}
