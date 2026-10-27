/**
 * CONTACT_SAVE_ON_YES on the Firestore emulator: the real entity store (storage.ts +
 * integration.ts), the real contact_relationships service, the real gated callOnBehalf tool
 * (outreach-confirm read-back, the caller's words, dial) and the real MINOR_CARE module.
 * Mocked: LiveKit's SIP client, fetch, the semantic index hooks. Every number is fake.
 * A "next session" drops both process caches, so every read comes from the emulator.
 *
 * Needs FIRESTORE_EMULATOR_HOST; skips without it. Adapted from the round-2 verifier's
 * emulator tests on #2949.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../../utils/minor-care.js';
import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { getTelephonyToolDefinitions } from '../index.js';
import { rings, seed, stubCallEnv } from './contact-pick.harness.js';

const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT });
let n = 0;
const uid = () => `oc-${Date.now().toString(36)}-${n++}`;
const N1 = '+18015550142';
const OLD = '+18015550199';
const HOME = '+18015550177';
const settle = () => new Promise((r) => setTimeout(r, 300));
const nextSession = () => {
  clearCache();
  clearAllEntityCaches();
};
const dialed = () => sip.createSipParticipant.mock.calls.map((c) => String(c[1]));

/** The gated callOnBehalf tool as a live call gets it, with this session id. */
function liveCall(userId: string, sessionId: string | undefined) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni', sessionId };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    call: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('callOnBehalf')!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

/** Read-back, then (yes = true) the owner's "Yes." and the confirmed call. */
async function turn(
  userId: string,
  args: Record<string, unknown>,
  yes = true,
  sessionId: string | null = `s-${userId}` // null: the session id is unknown
) {
  const c = liveCall(userId, sessionId ?? undefined);
  const preview = await c.call(args, `p${n++}`);
  await settle();
  const writesAtReadBack = await writeCount(userId);
  if (!yes) return { preview, placed: '', writesAtReadBack };
  c.caller('Yes.');
  const placed = await c.call(args, `y${n++}`);
  await settle();
  return { preview, placed, writesAtReadBack };
}

type Doc = Record<string, unknown> & { docId: string };
async function crDocs(userId: string): Promise<Doc[]> {
  const s = await db.collection('contact_relationships').where('userId', '==', userId).get();
  return s.docs.map((d) => ({ docId: d.id, ...d.data() }));
}
async function entityDocs(userId: string): Promise<Doc[]> {
  const s = await db.collection('entity_store').doc(userId).collection('entities').get();
  return s.docs.map((d) => ({ docId: d.id, ...d.data() }));
}
/** Every stored document, serialized: a write anywhere changes it. */
const snapshot = async (u: string) => JSON.stringify([await crDocs(u), await entityDocs(u)]);
const writeCount = async (u: string) =>
  (await crDocs(u)).length + (await entityDocs(u)).filter((e) => e.updatedAt !== undefined).length;

async function seedEntity(
  userId: string,
  id: string,
  name: string,
  rel: string,
  shape: 'contact' | 'attributes',
  phone: string
) {
  await db
    .collection('entity_store')
    .doc(userId)
    .collection('entities')
    .doc(id)
    .set({
      id,
      userId,
      type: 'person',
      canonicalName: name,
      aliases: [name.toLowerCase(), rel],
      specificRelation: rel,
      relationship: 'family',
      salience: 0.5,
      attributes: { _type: 'person', relationship: rel, ...(shape === 'attributes' && { phone }) },
      ...(shape === 'contact' && { contact: { phone } }),
    });
}
const named = (docs: Doc[], name: string) =>
  docs.filter((d) => String(d.name ?? d.canonicalName).toLowerCase() === name.toLowerCase());
const phonesOf = (docs: Doc[], name: string) =>
  named(docs, name).map((d) => ({
    phone: d.phone as string | undefined,
    contactPhone: (d.contact as { phone?: string } | undefined)?.phone,
    attrPhone: (d.attributes as { phone?: string } | undefined)?.phone,
  }));

beforeAll(async () => {
  if (emulator) await initializeEntityStore();
});
beforeEach(() => {
  nextSession();
  resetMinorCare();
  stubCallEnv();
  vi.stubEnv('CONTACT_PICK_V2', '');
  vi.stubEnv('CONTACT_SAVE_ON_YES', 'on');
  vi.stubEnv('MINOR_CARE', '');
  vi.stubEnv('SIP_TRUNK_NUMBER', '+18015550100');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  );
  sip.createSipParticipant.mockClear();
});

describe.skipIf(!emulator)('CONTACT_SAVE_ON_YES on the emulator', () => {
  it.each(['my dad', 'Dad', "dad's"])(
    'fresh owner, "%s" + number: nothing at the read-back, one Dad after the yes, dialed next session',
    async (who) => {
      const u = uid();
      const r = await turn(u, { contactQuery: who, phoneNumber: '801-555-0142', purpose: 'hi' });
      expect(r.writesAtReadBack).toBe(0);
      expect(phonesOf(await crDocs(u), 'Dad')).toEqual([
        { phone: N1, contactPhone: undefined, attrPhone: undefined },
      ]);
      nextSession();
      const next = await turn(u, { contactQuery: 'my dad', purpose: 'hi' });
      expect(next.preview).toContain('801-555-0142');
      expect(dialed()).toEqual([N1, N1]);
    }
  );

  it.each([
    ['contact', false, 'my dad'],
    ['contact', true, 'my dad'],
    ['attributes', false, 'my dad'],
    ['attributes', true, 'my dad'],
    ['contact', true, 'Dad'],
    ['attributes', false, 'Dad'],
    ['contact', false, "dad's"],
    ['attributes', true, "dad's"],
  ] as const)(
    'change: entity %s.phone, legacy twin %s, "%s": every record new, exactly one Dad, dialed next session',
    async (shape, twin, who) => {
      const u = uid();
      await seedEntity(u, 'dad-ent', 'Dad', 'dad', shape, OLD);
      if (twin) await seed([['Dad', OLD, "User's dad", 'family']], u);
      nextSession();
      const before = await snapshot(u);
      const r = await turn(u, { contactQuery: who, phoneNumber: '801-555-0142', purpose: 'hi' });
      expect(r.preview).toContain("change Dad's saved number (now ending 0199) to this one");
      nextSession();
      const ent = await entityDocs(u);
      const cr = await crDocs(u);
      expect(before).not.toBe(await snapshot(u));
      expect(phonesOf(ent, 'Dad')).toEqual([
        { phone: undefined, contactPhone: N1, attrPhone: shape === 'attributes' ? N1 : undefined },
      ]);
      expect(phonesOf(cr, 'Dad')).toEqual(
        twin ? [{ phone: N1, contactPhone: undefined, attrPhone: undefined }] : []
      );
      expect(await rings('dad', u)).toBe(`Dad|${N1}`);
      const next = await turn(u, { contactQuery: 'dad', purpose: 'hi' });
      expect(next.preview).toContain('801-555-0142');
      expect(dialed()).toEqual([N1, N1]);
    }
  );

  it('read-back alone writes nothing, and the old number still rings next session', async () => {
    const u = uid();
    await seedEntity(u, 'dad-ent', 'Dad', 'dad', 'attributes', OLD);
    await seed([['Dad', OLD, "User's dad", 'family']], u);
    nextSession();
    const before = await snapshot(u);
    await turn(u, { contactQuery: 'my dad', phoneNumber: '801-555-0142', purpose: 'hi' }, false);
    await turn(u, { contactQuery: 'Doug', phoneNumber: '801-555-0142', purpose: 'hi' }, false);
    nextSession();
    expect(await snapshot(u)).toBe(before);
    expect(dialed()).toEqual([]);
  });

  it.each([
    ['Doug', 'entity'],
    ['Doug', 'cr'],
    ['Doug', 'both'],
    ['dad', 'entity'],
    ['dad', 'cr'],
    ['dad', 'both'],
  ] as const)(
    'shared landline: "%s" given Mom\'s number (Mom in %s): asked, Mom byte-identical, saved only on yes',
    async (who, where) => {
      const u = uid();
      if (where !== 'cr') await seedEntity(u, 'mom-ent', 'Mom', 'mom', 'contact', HOME);
      if (where !== 'entity') await seed([['Mom', HOME, "User's mom", 'family']], u);
      nextSession();
      const momBefore = JSON.stringify(
        named([...(await crDocs(u)), ...(await entityDocs(u))], 'mom')
      );
      const args = { contactQuery: who, phoneNumber: '801-555-0177', purpose: 'hi' };
      const noYes = await turn(u, args, false);
      expect(noYes.preview).toContain(
        `that's the number I have for Mom: is ${who === 'dad' ? 'Dad' : 'Doug'} at the same number?`
      );
      nextSession();
      expect(named(await crDocs(u), who)).toEqual([]);
      await turn(u, args);
      nextSession();
      const all = [...(await crDocs(u)), ...(await entityDocs(u))];
      expect(JSON.stringify(named(all, 'mom'))).toBe(momBefore);
      expect(phonesOf(await crDocs(u), who)).toEqual([
        { phone: HOME, contactPhone: undefined, attrPhone: undefined },
      ]);
      expect(await rings(who, u)).toBe(`${who === 'dad' ? 'Dad' : 'Doug'}|${HOME}`);
      expect(dialed()).toEqual([HOME]);
    }
  );

  it('a number another person holds is never saved without the "same number?" read-back', async () => {
    const u = uid();
    // Read back when the number was nobody's; Mom gets it before the yes
    const c = liveCall(u, `s-${u}`);
    const args = { contactQuery: 'Doug', phoneNumber: '801-555-0177', purpose: 'hi' };
    const preview = await c.call(args, 'race-p');
    expect(preview).not.toContain('same number');
    await seed([['Mom', HOME, "User's mom", 'family']], u);
    const momBefore = JSON.stringify(named(await crDocs(u), 'mom'));
    c.caller('Yes.');
    await c.call(args, 'race-y');
    nextSession();
    expect(named(await crDocs(u), 'doug')).toEqual([]);
    expect(JSON.stringify(named(await crDocs(u), 'mom'))).toBe(momBefore);
  });

  describe('MINOR_CARE and the session id', () => {
    const args = { contactQuery: 'my dad', phoneNumber: '801-555-0142', purpose: 'hi' };
    beforeEach(() => {
      vi.stubEnv('MINOR_CARE', 'on');
    });

    it('held by this session only (not bound to the user): 0 writes', async () => {
      const u = uid();
      const sid = `held-${u}`;
      expect(noteCallerWords(sid, "I'm 13 years old")).toBe(true);
      await turn(u, args, true, sid);
      expect(await writeCount(u)).toBe(0);
    });

    it("held by another of this user's sessions only: 0 writes", async () => {
      const u = uid();
      const other = `other-${u}`;
      expect(noteCallerWords(other, "I'm 13 years old")).toBe(true);
      bindSessionUser(other, u);
      await turn(u, args, true, `fresh-${u}`);
      expect(await writeCount(u)).toBe(0);
    });

    it('unknown session id: 0 writes', async () => {
      const u = uid();
      await turn(u, args, true, null);
      expect(await writeCount(u)).toBe(0);
    });

    it('not held, known session: the yes saves (the checks above are not vacuous)', async () => {
      const u = uid();
      await turn(u, args, true, `ok-${u}`);
      expect(await writeCount(u)).toBe(1);
    });
  });
});
