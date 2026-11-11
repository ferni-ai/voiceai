/**
 * SMS_REPLY's real readers: recall through the call's own chain without sensitive facts, the
 * crisis-signals read failing closed, and the model on Vertex only. The stores and the Gemini
 * client are fakes. Fictional people only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const facts = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../../agents/multi-agent/recall-firestore-store.js', () => ({
  firestoreRecallStore: {
    facts: async () => facts,
    summaries: async () => [],
    forgotten: async () => [],
  },
}));
const vertex = vi.hoisted(() => ({
  on: true,
  generateContent: vi.fn(),
  locations: [] as string[],
}));
vi.mock('../../../../config/gemini-config.js', () => ({
  get USE_VERTEX_AI() {
    return vertex.on;
  },
  GOOGLE_CLOUD_PROJECT: 'ferni-example',
  getGeminiClient: async (location: string) => {
    vertex.locations.push(location);
    return { models: { generateContent: vertex.generateContent } };
  },
}));
const signals = vi.hoisted(() => ({ read: async (): Promise<unknown[]> => [] }));
vi.mock('../../../human-transfer/crisis-signals.js', () => ({
  crisisLevelSignalsSince: () => signals.read(),
}));
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => ({}) }));

import { defaultSmsReplyReads, smsSafeFact } from '../sms-reply-reads.js';

const fact = (key: string, value: string) => ({
  entityName: 'user',
  key,
  value,
  confidence: 0.9,
  extractedAt: '2026-11-01T12:00:00Z',
});

beforeEach(() => {
  facts.length = 0;
  vertex.on = true;
  vertex.locations.length = 0;
  vertex.generateContent.mockReset().mockResolvedValue({ text: 'hey you' });
});
afterEach(() => vi.unstubAllEnvs());

describe('recall for a text', () => {
  it('a health fact never reaches the note; the dog does', async () => {
    facts.push(fact('health_condition', 'asthma flares'), fact('pet', 'Biscuit the dog'));
    const { note, count } = await defaultSmsReplyReads.recall('uid-sam', 'Biscuit and my asthma');
    expect(note).toContain('Biscuit the dog');
    expect(note).not.toContain('asthma');
    expect(count).toBe(1);
  });

  it("the mapper's sensitive rule decides, and what recall never raises first is out too", () => {
    const f = { entity: 'user', confidence: 0.9 };
    expect(smsSafeFact({ ...f, key: 'medical', value: 'migraines' })).toBe(false);
    expect(smsSafeFact({ ...f, key: 'note', value: 'divorce papers came' })).toBe(false);
    expect(smsSafeFact({ ...f, key: 'pet', value: 'Biscuit' })).toBe(true);
  });
});

describe('the last crisis', () => {
  const now = new Date('2026-11-12T18:00:00Z');

  it('the newest crisis-level signal, or none', async () => {
    signals.read = async () => [{ timestamp: '2026-11-10T09:00:00Z' }];
    expect(await defaultSmsReplyReads.lastCrisisAt('uid-sam', now)).toEqual(
      new Date('2026-11-10T09:00:00Z')
    );
    signals.read = async () => [];
    expect(await defaultSmsReplyReads.lastCrisisAt('uid-sam', now)).toBeUndefined();
  });

  it('unreadable: a crisis now (fails closed)', async () => {
    signals.read = async () => Promise.reject(new Error('Firestore unavailable'));
    expect(await defaultSmsReplyReads.lastCrisisAt('uid-sam', now)).toEqual(now);
  });
});

describe('the model', () => {
  it("the voice path's model and location, on Vertex", async () => {
    vi.stubEnv('CASCADE_LLM_MODEL', 'gemini-voice-example');
    vi.stubEnv('CASCADE_LLM_LOCATION', 'us-east5');
    const out = await defaultSmsReplyReads.generate('sys', 'hi', new AbortController().signal);
    expect(out).toBe('hey you');
    expect(vertex.locations).toEqual(['us-east5']);
    expect(vertex.generateContent.mock.calls[0]?.[0]).toMatchObject({
      model: 'gemini-voice-example',
      contents: 'hi',
      config: { systemInstruction: 'sys' },
    });
  });

  it('off Vertex: no reply, and no client asked (never an API key or another provider)', async () => {
    vertex.on = false;
    expect(await defaultSmsReplyReads.generate('sys', 'hi', new AbortController().signal)).toBe('');
    expect(vertex.locations).toEqual([]);
  });
});
