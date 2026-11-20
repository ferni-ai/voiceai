/**
 * Outcome-eval cases for the store-backed tools (routines, commerce, alarms, commitments, lists,
 * relationships): a healthy and a write-fails case per tool, each write-fails case with the fix
 * flag that makes it honest (#4272, #4275, #4279, #4280, #4282). Imported by tool-outcomes.test.ts
 * after its Firestore mocks are registered; the outcome checks read the fake's documents directly.
 */
import * as subscriptions from '../../../services/stores/subscription-store.js';
import * as workflows from '../../../services/stores/workflow-store.js';
import { definitions as commerceTools } from '../../domains/commerce/index.js';
import { getRelationshipToolDefinitions } from '../../domains/information/relationships/index.js';
import { commitmentTools } from '../../domains/productivity/commitments.js';
import { routineToolDefinitions } from '../../domains/routines/index.js';
import { alarmToolDefinitions } from '../../domains/simple-utilities/alarm-tools.js';
import { listToolDefinitions } from '../../domains/simple-utilities/list-tools.js';
import type { Fault, FakeFirestore } from './fake-firestore.js';

/** The store tools these cases call. */
export const STORE_TOOLS = [
  ...routineToolDefinitions,
  ...commerceTools,
  ...alarmToolDefinitions,
  ...commitmentTools,
  ...listToolDefinitions,
  ...getRelationshipToolDefinitions(),
];

/** The fields of tool-outcomes.test.ts's Case that these cases set. */
interface StoreCase {
  id: string;
  tool: string;
  fault: Fault;
  seed?: (uid: string) => Promise<void>;
  args: Record<string, unknown>;
  outcome: (uid: string, reply: string) => boolean;
  fix?: { flag: string; pr: string };
}

/** The test's fake Firestore, handed in by storeCases. */
let fake: FakeFirestore;

/** Every stored document of this person, as JSON, for outcome checks across store layouts. */
const mine = (uid: string): string =>
  JSON.stringify([...fake.docs].filter(([p]) => p.includes(uid)).map(([, d]) => d));
/** The stored copy of a named thing: the JSON object around `"name":"<name>"` in any doc. */
function stored(uid: string, key: string, value: string): Record<string, unknown> | undefined {
  const seen: Array<Record<string, unknown>> = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      if (o[key] === value) seen.push(o);
      Object.values(o).forEach(walk);
    }
  };
  for (const [p, d] of fake.docs) if (p.includes(uid)) walk(d);
  return seen[0];
}

async function seedRoutine(uid: string): Promise<void> {
  await workflows.createWorkflow(uid, {
    ...{ name: 'Morning Ferns', status: 'active', conditions: [], actions: [] },
    ...{ variables: {}, tags: [], isTemplate: false },
    trigger: { type: 'phrase', phrases: ['good morning'], requireExactMatch: false },
  });
}
async function seedSubscription(uid: string): Promise<void> {
  await subscriptions.addSubscription(uid, {
    ...{ name: 'Fern Monthly', category: 'streaming', status: 'active', amount: 9 },
    ...{ currency: 'USD', frequency: 'monthly', startDate: '2026-01-01' },
    ...{ detectedFrom: 'manual', autoRenew: true, tags: [] },
  });
}
async function seedAlarm(uid: string): Promise<void> {
  await fake.doc(`bogle_users/${uid}/alarms/alarm-ferns`).set({
    ...{ id: 'alarm-ferns', userId: uid, label: 'ferns', time: '07:00', repeat: 'daily' },
    ...{ enabled: true, createdAt: 1, updatedAt: 1 },
  });
}
async function seedCommitment(uid: string): Promise<void> {
  const now = Date.now();
  await fake.doc(`bogle_users/${uid}/commitments/c-fern-walk`).set({
    ...{ userId: uid, statement: 'I will walk the fern trail', summary: 'walk the fern trail' },
    ...{ text: 'I will walk the fern trail', type: 'intention', emotionalWeight: 0.3 },
    ...{ createdAt: now, lastMentioned: now, followUpAfter: now, status: 'active' },
    followUpCount: 0,
  });
}
async function seedList(uid: string): Promise<void> {
  await fake.doc(`bogle_users/${uid}/lists/list-hike`).set({
    ...{ id: 'list-hike', userId: uid, name: 'Hike Gear', type: 'packing', archived: false },
    ...{ items: [{ id: 'i1', text: 'trail boots', checked: false, addedAt: 1 }] },
    ...{ createdAt: 1, updatedAt: 1 },
  });
}
async function seedPerson(uid: string): Promise<void> {
  await fake.doc(`users/${uid}/relationships/rel-morgan`).set({
    ...{ id: 'rel-morgan', name: 'Morgan Vale', relationshipType: 'friend' },
    ...{ interests: ['pottery'], favoriteTeams: [], lastContact: null },
  });
}
const alarms = (uid: string): object[] => [...fake.list(`bogle_users/${uid}/alarms`).values()];

/** A healthy and a write-fails case for one tool call; the fix flag goes on the second. */
function pair(
  id: string,
  base: Omit<StoreCase, 'id' | 'fault' | 'fix'>,
  fix: { flag: string; pr: string }
): StoreCase[] {
  return [
    { ...base, id: `${id}/healthy`, fault: 'none' },
    { ...base, id: `${id}/write-fails`, fault: 'write', fix },
  ];
}
const STORES = { flag: 'STORE_WRITES_TRUTHFUL', pr: '#4272' };
const ALARMS = { flag: 'ALARM_WRITES_TRUTHFUL', pr: '#4275' };
const COMMITMENTS = { flag: 'COMMITMENT_WRITES_TRUTHFUL', pr: '#4279' };
const LISTS = { flag: 'LIST_WRITES_TRUTHFUL', pr: '#4280' };
const PEOPLE = { flag: 'RELATIONSHIP_WRITES_TRUTHFUL', pr: '#4282' };

/** The store cases, reading `db` (the test's fake) in their seeds and outcome checks. */
export function storeCases(db: FakeFirestore): StoreCase[] {
  fake = db;
  return STORE_CASES;
}

const STORE_CASES: StoreCase[] = [
  ...pair(
    'toggleRoutine',
    {
      tool: 'toggleRoutine',
      seed: seedRoutine,
      args: { routineName: 'Morning Ferns', action: 'pause' },
      outcome: (uid) => stored(uid, 'name', 'Morning Ferns')?.status === 'paused',
    },
    STORES
  ),
  ...pair(
    'cancelSubscription',
    {
      tool: 'cancelSubscription',
      seed: seedSubscription,
      args: { name: 'fern monthly' },
      outcome: (uid) => stored(uid, 'name', 'Fern Monthly')?.status === 'cancelled',
    },
    STORES
  ),
  ...pair(
    'deleteAlarm',
    {
      tool: 'deleteAlarm',
      seed: seedAlarm,
      args: { query: 'ferns' },
      outcome: (uid) => alarms(uid).length === 0,
    },
    ALARMS
  ),
  ...pair(
    'completeCommitment',
    {
      tool: 'completeCommitment',
      seed: seedCommitment,
      args: { commitmentQuery: 'fern trail' },
      outcome: (uid) =>
        fake.docs.get(`bogle_users/${uid}/commitments/c-fern-walk`)?.status === 'completed',
    },
    COMMITMENTS
  ),
  ...pair(
    'addToList',
    {
      tool: 'addToList',
      seed: seedList,
      args: { listName: 'hike gear', items: ['rain jacket'] },
      outcome: (uid) => mine(uid).includes('rain jacket'),
    },
    LISTS
  ),
  ...pair(
    'createList',
    {
      tool: 'createList',
      args: { name: 'Beach Reads', type: 'reading', items: ['a sea novel'] },
      outcome: (uid) => stored(uid, 'name', 'Beach Reads') !== undefined,
    },
    LISTS
  ),
  ...pair(
    'addInterestToRelationship',
    {
      tool: 'addInterestToRelationship',
      seed: seedPerson,
      args: { name: 'Morgan Vale', interest: 'kayaking' },
      outcome: (uid) => mine(uid).includes('kayaking'),
    },
    PEOPLE
  ),
  ...pair(
    'recordContact',
    {
      tool: 'recordContact',
      seed: seedPerson,
      args: { name: 'Morgan Vale' },
      outcome: (uid) => fake.docs.get(`users/${uid}/relationships/rel-morgan`)?.lastContact != null,
    },
    PEOPLE
  ),
];
