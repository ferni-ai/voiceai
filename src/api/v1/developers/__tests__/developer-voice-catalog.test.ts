/**
 * Developers get stock library voices only.
 *
 * The catalog used to offer Ferni's old voice, Nayan's voice (a clone of a real
 * person whose consent covers Ferni's Nayan persona, not third parties) and five
 * persona voices, and the preview route spoke any UUID it was handed. Now the
 * catalog, the preview TTS and persona submission all refuse persona voices and
 * clones, consented or retired, including voices set by env override.
 */
import { EventEmitter } from 'events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FERNI_CALM_B_VOICE_ID,
  LESTER_PRO_V3_VOICE_ID,
  RETIRED_CLONE_VOICE_IDS,
  VOICE_IDS,
} from '../../../../config/voice-ids.js';

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../shared/developer-auth.js', () => {
  const doc = (id: string) => ({
    get: async () => ({ id, exists: docs.has(id), data: () => docs.get(id) }),
    set: async (data: Record<string, unknown>) => void docs.set(id, data),
    update: async (data: Record<string, unknown>) =>
      void docs.set(id, { ...docs.get(id), ...data }),
  });
  return {
    getPublisherFromToken: async () => 'pub_1',
    requirePublisherFromToken: async () => 'pub_1',
    getFirestore: async () => ({ collection: () => ({ doc }) }),
  };
});

const { handleDeveloperVoicesRoutes } = await import('../voice-routes.js');
const { handleDeveloperPersonasRoutes } = await import('../personas-routes.js');

const NAYAN = VOICE_IDS.NAYAN_PATEL;
const RETIRED = [...RETIRED_CLONE_VOICE_IDS][0]!;
const STOCK = '694f9389-aac1-45b6-b726-9d9369183238'; // Cartesia "Sarah"
const PERSONA_AND_CLONE_IDS = [
  ...Object.values(VOICE_IDS),
  FERNI_CALM_B_VOICE_ID,
  LESTER_PRO_V3_VOICE_ID,
  ...RETIRED_CLONE_VOICE_IDS,
];

function call(method: string, url: string, body?: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost', authorization: 'Bearer t' };
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, result: () => ({ status, body: raw ? JSON.parse(raw) : null }) };
}

async function listVoices(): Promise<string[]> {
  const c = call('GET', '/api/v1/developers/voices');
  await handleDeveloperVoicesRoutes(c.req, c.res, '/api/v1/developers/voices');
  return (c.result().body.voices as Array<{ id: string }>).map((v) => v.id);
}

async function preview(voiceId: string) {
  const c = call('POST', '/api/v1/developers/voices/preview', { voice_id: voiceId });
  await handleDeveloperVoicesRoutes(c.req, c.res, '/api/v1/developers/voices/preview');
  return c.result();
}

const manifest = (voiceId: string) => ({
  identity: { id: 'p', name: 'Pat', tagline: 'A friendly study buddy for exams' },
  voice: { provider: 'cartesia', voice_id: voiceId },
  personality: {
    warmth: 0.5,
    humor_level: 0.5,
    directness: 0.5,
    formality: 0.5,
    traits: ['kind', 'patient'],
  },
  knowledge: { category: 'education', domains: ['study'], expertise_tags: ['exams'] },
});

async function submit(voiceId: string) {
  docs.set('persona_abc', { publisherId: 'pub_1', status: 'draft', manifest: manifest(voiceId) });
  const path = '/api/v1/developers/personas/persona_abc/submit';
  const c = call('POST', path);
  await handleDeveloperPersonasRoutes(c.req, c.res, path);
  return { reply: c.result().body, stored: docs.get('persona_abc') };
}

const fetchSpy = vi.fn(async () => new Response('', { status: 500 }));
beforeEach(() => {
  docs.clear();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubEnv('CARTESIA_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('developer voice catalog', () => {
  it('lists no persona voice and no clone', async () => {
    const ids = await listVoices();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of PERSONA_AND_CLONE_IDS) expect(ids).not.toContain(id);
  });

  it('names none of them in the catalog source either (the request-time filter is a backstop)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/api/v1/developers/voice-routes.ts'),
      'utf-8'
    );
    for (const id of PERSONA_AND_CLONE_IDS) expect(source).not.toContain(id);
  });

  it('drops a catalog voice that a persona is switched to by env override', async () => {
    expect(await listVoices()).toContain(STOCK);
    vi.stubEnv('NAYAN_PATEL_VOICE_ID', STOCK);
    expect(await listVoices()).not.toContain(STOCK);
    expect((await preview(STOCK)).status).toBe(400);
  });
});

describe('voice preview (TTS)', () => {
  it("refuses Nayan's voice and a retired clone, without calling the provider", async () => {
    for (const id of [NAYAN, RETIRED, FERNI_CALM_B_VOICE_ID]) {
      expect((await preview(id)).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('speaks a catalog voice', async () => {
    await preview(STOCK);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('persona submission', () => {
  it("refuses a manifest in Nayan's voice or a retired clone, and stays a draft", async () => {
    for (const id of [NAYAN, RETIRED]) {
      const { reply, stored } = await submit(id);
      expect(reply.success).toBe(false);
      expect(reply.validation.errors.join(' ')).toMatch(/developer catalog/);
      expect(stored?.status).toBe('draft');
    }
  });

  it('accepts a catalog voice', async () => {
    const { reply, stored } = await submit(STOCK);
    expect(reply.success).toBe(true);
    expect(stored?.status).toBe('submitted');
  });
});
