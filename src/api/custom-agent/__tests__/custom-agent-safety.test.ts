/**
 * A custom agent's server-owned fields and voice can't be set by a crafted request.
 *
 * PUT /api/custom-agents/:id used to deep-merge any body into the stored agent,
 * so a request could set `status`, `marketplaceId`, or `voice.voiceId` to a
 * retired clone of a real person (its id is in this public repo) and the
 * runtime would speak in it.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));
vi.mock('firebase-admin/firestore', () => {
  const doc = (id: string) => ({
    get: async () => {
      const data = store.docs.get(id);
      return { id, exists: data !== undefined, data: () => data };
    },
    set: async (data: Record<string, unknown>) => {
      store.docs.set(id, { ...(store.docs.get(id) ?? {}), ...data });
    },
  });
  const firestore = { collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }) };
  return { getFirestore: () => firestore, FieldValue: {}, Timestamp: {} };
});

const { handleUpdateAgent } = await import('../agent-routes.js');
const { handleSelectPremadeVoice } = await import('../voice-routes.js');
const { customAgentToPersonaConfig } =
  await import('../../../services/custom-agent/custom-agent-runtime-service.js');
const { getCustomAgent } =
  await import('../../../services/custom-agent/custom-agent-persistence-service.js');

const RETIRED = '3ebcd114-d280-4eed-a238-b9323a6b8e52'; // RETIRED_CLONE_VOICE_IDS
const FERNI = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc'; // VOICE_IDS.FERNI since 2026-10-20
const CALM_B = '2e7f8a26-1627-4d66-88dc-293c297c1619'; // FERNI_CALM_B_VOICE_ID, the rollback
const CALM_A = '24a60cd5-9428-453d-8a95-92f50567f32e'; // FERNI_CALM_A_VOICE_ID, a spare
const CALM_C = '5b13b172-56f9-4821-887a-a943fe949830'; // FERNI_CALM_C_VOICE_ID, a spare
const STOCK = '694f9389-aac1-45b6-b726-9d9369183238';
const DEFAULT = '69092565-1c93-4a88-9f2c-ac8cddaf9f65'; // Janice, DEFAULT_CUSTOM_AGENT_VOICE_ID

function put(body: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'PUT';
  req.headers = {};
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, result: () => ({ status, body: raw ? JSON.parse(raw) : null }) };
}

beforeEach(() => {
  store.docs.clear();
  store.docs.set('agent_1', {
    userId: 'u1',
    name: 'Grandpa',
    displayName: 'Grandpa',
    description: 'A kind grandfather',
    type: 'legacy',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    voice: {
      type: 'selected',
      voiceId: '',
      status: 'pending',
      settings: { speed: 1, stability: 0.7, similarityBoost: 0.7 },
    },
    personality: {
      warmth: 0.5,
      humorLevel: 0.3,
      directness: 0.5,
      energy: 0.5,
      formality: 0.5,
      traits: [],
      values: [],
      cognitiveProfile: 'balanced',
      responsePatterns: {},
    },
    memories: { stories: [], wisdom: [], sharedMoments: [] },
    behaviors: { greetings: [], farewells: [], catchphrases: [], responsePatterns: {} },
    privacy: 'private',
  });
});

async function update(body: unknown) {
  const call = put(body);
  await handleUpdateAgent(call.req, call.res, 'u1', 'agent_1');
  return call.result();
}

async function selectPremade(voiceId: string) {
  const call = put({ voiceId });
  await handleSelectPremadeVoice(call.req, call.res, 'u1', 'agent_1');
  return call.result();
}

const stored = () => store.docs.get('agent_1') as Record<string, any>;

describe('PUT /api/custom-agents/:id', () => {
  it('refuses fields that are not user-editable and writes nothing', async () => {
    for (const body of [
      { ownerId: 'u2' },
      { marketplaceId: 'm1' },
      { privacy: 'marketplace' },
      { userId: 'u2' },
      { name: 'X', tier: 'pro' },
    ]) {
      const { status, body: reply } = await update(body);
      expect(status).toBe(400);
      expect(reply.fields.length).toBeGreaterThan(0);
    }
    expect(stored().name).toBe('Grandpa');
    expect(stored().marketplaceId).toBeUndefined();
    expect(stored().privacy).toBe('private');
  });

  it('refuses a retired clone (or any new id) as the voice', async () => {
    const { status, body } = await update({ voice: { voiceId: RETIRED, status: 'ready' } });
    expect(status).toBe(400);
    expect(body.fields).toEqual(['voice.voiceId', 'voice.status']);
    expect(stored().voice.voiceId).toBe('');
  });

  it("accepts the editor's save: name and voice settings, with the voice echoed back unchanged", async () => {
    const echoed = { ...stored().voice, settings: { ...stored().voice.settings, speed: 1.2 } };
    const { status } = await update({ name: 'Pops', status: 'draft', voice: echoed });
    expect(status).toBe(200);
    expect(stored().name).toBe('Pops');
    expect(stored().voice.settings.speed).toBe(1.2);
  });

  it("won't activate through PUT what /status wouldn't", async () => {
    const { status, body } = await update({ status: 'active' });
    expect(status).toBe(400);
    expect(body.validationErrors).toContain('Voice is not ready');
    expect(stored().status).toBe('draft');
    expect((await update({ status: 'archived' })).status).toBe(400);
    expect((await update({ status: 'paused' })).status).toBe(200);
    expect(stored().status).toBe('paused');
  });
});

describe('PUT /api/custom-agents/:id/voice/select-premade', () => {
  it('refuses an id that is not a stock library voice, without marking anything ready', async () => {
    for (const id of ['cartesia-friendly-female', RETIRED, FERNI, CALM_A, CALM_B, CALM_C]) {
      const { status, body } = await selectPremade(id);
      expect(status).toBe(400);
      expect(body.error).toBe('unknown_voice');
    }
    expect(stored().voice).toMatchObject({ voiceId: '', status: 'pending' });
  });

  it('stores a stock voice as ready', async () => {
    expect((await selectPremade(STOCK)).status).toBe(200);
    expect(stored().voice).toMatchObject({ voiceId: STOCK, status: 'ready', type: 'selected' });
  });
});

describe('the runtime voice', () => {
  const withVoice = async (voice: Record<string, unknown>) => {
    store.docs.set('agent_1', { ...stored(), voice: { ...stored().voice, ...voice } });
    return customAgentToPersonaConfig((await getCustomAgent('u1', 'agent_1'))!).voice.voiceId;
  };

  it('replaces a stored retired clone or persona voice with the default', async () => {
    expect(await withVoice({ type: 'selected', voiceId: RETIRED, status: 'ready' })).toBe(DEFAULT);
    expect(await withVoice({ type: 'cloned', voiceId: RETIRED, status: 'ready' })).toBe(DEFAULT);
    expect(await withVoice({ type: 'selected', voiceId: FERNI, status: 'ready' })).toBe(DEFAULT);
    expect(await withVoice({ type: 'selected', voiceId: CALM_B, status: 'ready' })).toBe(DEFAULT);
    expect(await withVoice({ type: 'cloned', voiceId: CALM_A, status: 'ready' })).toBe(DEFAULT);
    expect(await withVoice({ type: 'cloned', voiceId: CALM_C, status: 'ready' })).toBe(DEFAULT);
  });

  it("keeps a stock voice and the agent's own finished clone", async () => {
    expect(await withVoice({ type: 'selected', voiceId: STOCK, status: 'ready' })).toBe(STOCK);
    const clone = '11111111-2222-4333-8444-555555555555';
    expect(await withVoice({ type: 'cloned', voiceId: clone, status: 'ready' })).toBe(clone);
  });
});
