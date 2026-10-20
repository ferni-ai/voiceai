/**
 * A failed profile read must never become a whole-document overwrite.
 *
 * These modules used to catch a read error, return null, and let the caller
 * treat it as a new user: build a default profile and set() it over whatever
 * was stored. Each test seeds a stored profile, makes reads throw, calls every
 * writer in the module, and checks nothing was written and the doc is intact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeProfileFirestore, type FakeProfileFirestore } from './fake-profile-firestore.js';

let fake: FakeProfileFirestore;
vi.mock('../firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

import * as milestones from '../proactive-milestone-detector.js';
import * as eventPatterns from '../event-pattern-memory.js';
import * as guests from '../guest-intelligence.js';
import * as seasonal from '../seasonal-planning-intelligence.js';
import type { EventOutcome } from '../event-pattern-memory.js';

const USER = 'user-1';
const stored = { userId: USER, marker: 'years of history', trackedDates: [{ id: 'keep-me' }] };

function seed(collection: string): string {
  const path = `bogle_users/${USER}/${collection}/profile`;
  fake.docs.set(path, structuredClone(stored));
  return path;
}

async function expectUntouched(path: string, writers: Array<() => Promise<unknown>>) {
  fake.failReads.on = true;
  for (const write of writers) await write();
  expect(fake.writes).toEqual([]);
  expect(fake.docs.get(path)).toEqual(stored);
}

const outcome = {
  eventId: 'e1',
  eventName: 'Party',
  eventType: 'birthday',
  eventDate: '2026-01-01',
  budget: 100,
  actualSpent: 90,
  guestCountPlanned: 5,
  guestCountActual: 5,
  categorySpending: {},
  guestOutcomes: [],
  vendors: [],
  reflections: { whatWorked: [], whatWouldChange: [], unexpectedJoys: [] },
} as unknown as EventOutcome;

beforeEach(() => {
  fake = createFakeProfileFirestore();
});

describe('a failed read leaves the stored profile alone', () => {
  it('proactive-milestone-detector', async () => {
    const path = seed('milestone_detector');
    await expectUntouched(path, [
      () => milestones.trackDate(USER, 'Anniversary', '2020-06-01', 'anniversary'),
      () => milestones.trackQuietWin(USER, 'Sober', '2025-01-01'),
      () => milestones.recordLifeStageSignal(USER, 'new job', ['hired'], 0.8),
      () => milestones.acknowledgeMilestone(USER, 'Anniversary', '2026-06-01'),
    ]);
  });

  it('event-pattern-memory', async () => {
    const path = seed('event_pattern_memory');
    const vendor = {
      name: 'Cakes',
      category: 'food',
      sentiment: 'loved' as const,
      reason: 'tasty',
      lastUsed: '2026-01-01',
    };
    await expectUntouched(path, [
      () => eventPatterns.recordEventOutcome(USER, outcome),
      () => eventPatterns.recordGuestConflict(USER, 'Ann', 'Bob', 'old feud'),
      () => eventPatterns.recordRegrettedOmission(USER, 'Cy', 'Party', 'forgot'),
      () => eventPatterns.recordVendorExperience(USER, vendor),
    ]);
  });

  it('guest-intelligence', async () => {
    const path = seed('guest_intelligence');
    await expectUntouched(path, [
      () => guests.upsertGuestProfile(USER, 'Ann', { relationship: 'friend' }),
      () => guests.recordGuestRelationship(USER, 'Ann', 'Bob', 'strong_bond', 0.9, 'college'),
      () => guests.upsertGuestGroup(USER, 'College', ['Ann', 'Bob'], 'friends'),
    ]);
  });

  it('seasonal-planning-intelligence', async () => {
    const path = seed('seasonal_planning');
    await expectUntouched(path, [
      () => seasonal.updateCulturalBackgrounds(USER, ['jewish']),
      () => seasonal.updatePersonalPatterns(USER, { preferredCelebrationMonths: [6] }),
      () => seasonal.recordEventOutcome(USER, 'birthday', '2026-06-01', 9),
    ]);
  });
});

describe('a missing profile is still created', () => {
  it('writes a fresh profile for a new user', async () => {
    await milestones.trackDate(USER, 'Anniversary', '2020-06-01', 'anniversary');
    const doc = fake.docs.get(`bogle_users/${USER}/milestone_detector/profile`);
    expect(doc?.trackedDates).toEqual([expect.objectContaining({ label: 'Anniversary' })]);
  });

  it('adds to an existing profile when the read succeeds', async () => {
    const path = seed('guest_intelligence');
    fake.docs.set(path, { userId: USER, guests: {}, relationships: [], groups: [] });
    await guests.upsertGuestGroup(USER, 'College', ['Ann'], 'friends');
    expect(fake.docs.get(path)?.groups).toEqual([expect.objectContaining({ name: 'College' })]);
  });
});
