/**
 * CONTACT_SAVE_ON_YES off is main: the same scripted turns, on the Firestore emulator, give the
 * read-backs, replies, dials and stored documents recorded from origin/main (f0d12a6e6) in
 * owner-contact-parity.main.json. PARITY_OUT=<file> writes this run's record instead, which
 * is how that file was made (on main's call-on-behalf.ts, call-confirm.ts, outreach-confirm.ts
 * and storage.ts). Needs FIRESTORE_EMULATOR_HOST; skips without it. Every number is fake.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._a: unknown[]) => ({ participantId: 'PA_test' })),
}));
vi.mock('livekit-server-sdk', () => ({
  SipClient: class {
    createSipParticipant = sip.createSipParticipant;
  },
  RoomServiceClient: class {
    createRoom = async () => ({});
  },
  AgentDispatchClient: class {
    createDispatch = async () => ({});
  },
}));
vi.mock('../../../../services/data-layer/hooks/contacts-hooks.js', () => ({
  onContactChange: async () => undefined,
  onContactInteractionChange: async () => undefined,
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

process.env.GCLOUD_PROJECT ??= 'demo-owner-contact';
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

import { Firestore } from '@google-cloud/firestore';
import { clearCache } from '../../../../services/contacts/contact-relationship-service.js';
import { clearAllEntityCaches } from '../../../../memory/entity-store/entity-cache.js';
import { initializeEntityStore } from '../../../../memory/entity-store/integration.js';
import { noteCallerWords, resetMinorCare } from '../../../../utils/minor-care.js';
import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { getTelephonyToolDefinitions } from '../index.js';
import { seed, stubCallEnv } from './contact-pick.harness.js';

const FIXTURE = fileURLToPath(new URL('./owner-contact-parity.main.json', import.meta.url));
const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT });
const record: Record<string, unknown> = {};
const settle = () => new Promise((r) => setTimeout(r, 300));
const nextSession = () => {
  clearCache();
  clearAllEntityCaches();
};
let n = 0;

async function turn(u: string, args: Record<string, unknown>, yes: boolean, sid?: string) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = {
    userId: u,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: sid,
  };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  const call = async (callId: string) => {
    const out = await registry
      .get('callOnBehalf')!
      .create(ctx)
      .execute(args, { ctx: { session }, toolCallId: callId });
    listeners.onToolsExecuted({ functionCalls: [{ callId }] });
    return String(out);
  };
  const preview = await call(`p${n++}`);
  let placed = '';
  if (yes) {
    listeners.onTranscript({ transcript: 'Yes.', isFinal: true });
    placed = await call(`y${n++}`);
  }
  await settle();
  return { preview, placed };
}

/** Stored documents without ids or times, in a stable order. */
async function stored(u: string) {
  const strip = (o: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(o)
        .filter(([k]) => !/At$|^id$|Interaction$|^userId$/.test(k))
        .sort(([a], [b]) => a.localeCompare(b))
    );
  const cr = await db.collection('contact_relationships').where('userId', '==', u).get();
  const ent = await db.collection('entity_store').doc(u).collection('entities').get();
  const rows = [...cr.docs, ...ent.docs].map((d) => JSON.stringify(strip(d.data())));
  return rows.sort();
}

async function seedEntity(u: string, name: string, rel: string, shape: string, phone: string) {
  const ref = db.collection('entity_store').doc(u).collection('entities').doc(`${rel}-ent`);
  await ref.set({
    userId: u,
    type: 'person',
    canonicalName: name,
    aliases: [name.toLowerCase(), rel],
    specificRelation: rel,
    salience: 0.5,
    attributes: { relationship: rel, ...(shape === 'attributes' && { phone }) },
    ...(shape === 'contact' && { contact: { phone } }),
  });
}

async function wipe(u: string) {
  const cr = await db.collection('contact_relationships').where('userId', '==', u).get();
  await Promise.all(cr.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(db.collection('entity_store').doc(u));
}

type Turn = [string, string | undefined, boolean, string?];
const N = '801-555-0142';
const HOME = '801-555-0177';
const SCENARIOS: Record<string, { seed?: (u: string) => Promise<void>; turns: Turn[] }> = {
  fresh: {
    turns: [
      ['my dad', N, true],
      ['dad', undefined, true],
    ],
  },
  noYes: {
    turns: [
      ['my dad', N, false],
      ['dad', undefined, false],
    ],
  },
  entityContactTwin: {
    seed: async (u) => {
      await seedEntity(u, 'Dad', 'dad', 'contact', '+18015550199');
      await seed([['Dad', '+18015550199', "User's dad", 'family']], u);
    },
    turns: [
      ['my dad', N, true],
      ['dad', undefined, true],
    ],
  },
  entityAttributes: {
    seed: (u) => seedEntity(u, 'Dad', 'dad', 'attributes', '+18015550199'),
    turns: [
      ["dad's", N, true],
      ['Dad', undefined, true],
    ],
  },
  sharedMomCr: {
    seed: (u) => seed([['Mom', '+18015550177', "User's mom", 'family']], u),
    turns: [
      ['Doug', HOME, true],
      ['Doug', undefined, true],
      ['mom', undefined, true],
    ],
  },
  sharedMomEntity: {
    seed: (u) => seedEntity(u, 'Mom', 'mom', 'contact', '+18015550177'),
    turns: [
      ['dad', HOME, true],
      ['dad', undefined, true],
    ],
  },
  noSession: { turns: [['my dad', N, true, 'none']] },
  heldSession: { turns: [['my dad', N, true, 'held']] },
  junk: { turns: [['my dad', '12345', true]] },
};

beforeAll(async () => {
  if (emulator) await initializeEntityStore();
});
beforeEach(() => {
  nextSession();
  resetMinorCare();
  stubCallEnv();
  vi.stubEnv('CONTACT_PICK_V2', '');
  vi.stubEnv('CONTACT_SAVE_ON_YES', '');
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('SIP_TRUNK_NUMBER', '+18015550100');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  );
  sip.createSipParticipant.mockClear();
});
afterAll(() => {
  if (process.env.PARITY_OUT)
    writeFileSync(process.env.PARITY_OUT, JSON.stringify(record, null, 2));
});

describe.skipIf(!emulator)('CONTACT_SAVE_ON_YES off: the same turns as main', () => {
  const main = process.env.PARITY_OUT
    ? {}
    : (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>);

  it.each(Object.keys(SCENARIOS))('%s', async (name) => {
    const u = `parity-${name}`;
    await wipe(u);
    const { seed: plant, turns } = SCENARIOS[name];
    if (plant) await plant(u);
    const out = [];
    for (const [who, phone, yes, sid] of turns) {
      nextSession();
      const sessionId = sid === 'none' ? undefined : `s-${name}-${sid ?? 'ok'}`;
      if (sid === 'held') noteCallerWords(sessionId, "I'm 13 years old");
      const args = { contactQuery: who, purpose: 'say hi', ...(phone && { phoneNumber: phone }) };
      // eslint-disable-next-line no-await-in-loop -- turns are in order
      out.push(await turn(u, args, yes, sessionId));
    }
    nextSession();
    record[name] = {
      turns: out,
      dialed: sip.createSipParticipant.mock.calls.map((c) => c[1]),
      stored: await stored(u),
    };
    if (!process.env.PARITY_OUT) expect(record[name]).toEqual(main[name]);
  });
});
