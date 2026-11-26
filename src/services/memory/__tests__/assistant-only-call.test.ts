/**
 * #3222: a call where only Ferni spoke (the greeting, then "are you there?") is not a
 * session together. startConversation wrote turnCount 0 but no userTurnCount, so the
 * field stayed missing when the caller never spoke, and sessions-together read a missing
 * field as a call stored before userTurnCount existed: two turns of any kind counted.
 * ASSISTANT_ONLY_CALLS_UNCOUNTED=on starts the record with userTurnCount 0.
 *
 * The record here is written by the real startConversation / persistTurn /
 * endConversation into an in-memory doc, and judged by the real isCountedSession.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const stored = new Map<string, Doc>();

function applyUpdate(id: string, data: Doc): void {
  const doc = stored.get(id);
  if (!doc) throw new Error(`NOT_FOUND: ${id}`); // Firestore's update needs the doc
  for (const [key, value] of Object.entries(data)) {
    const inc = (value as { increment?: unknown } | null)?.increment;
    doc[key] =
      typeof inc === 'number' ? (typeof doc[key] === 'number' ? doc[key] : 0) + inc : value;
  }
}

vi.mock('@google-cloud/firestore', () => {
  const conversationDoc = (id: string) => ({
    set: async (data: Doc) => void stored.set(id, { ...data }),
    update: async (data: Doc) => applyUpdate(id, data),
    collection: () => ({ add: async () => ({ id: 'turn' }) }),
  });
  const userDoc = { collection: () => ({ doc: conversationDoc }) };
  return {
    FieldValue: { increment: (n: number) => ({ increment: n }) },
    Firestore: class {
      collection = () => ({ doc: () => userDoc });
    },
  };
});

const { startConversation, persistTurn, endConversation } = await import('../realtime-memory.js');
const { isCountedSession } = await import('../../stores/sessions-together.js');

async function call(lines: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<Doc> {
  const id = await startConversation('u1', 'ferni');
  for (const line of lines) {
    await persistTurn('u1', id, { ...line, timestamp: new Date() });
  }
  await endConversation('u1', id);
  return stored.get(id) ?? {};
}

const GREETING = { role: 'assistant' as const, content: 'Hey, it is Ferni. How are you doing?' };
const ARE_YOU_THERE = { role: 'assistant' as const, content: 'Are you there?' };
const CALLER = { role: 'user' as const, content: 'Yeah, sorry, I am here.' };

afterEach(() => {
  vi.unstubAllEnvs();
  stored.clear();
});

describe('an assistant-only call (#3222)', () => {
  it('flag on: a greeting plus "are you there?" with no caller line is not a session', async () => {
    vi.stubEnv('ASSISTANT_ONLY_CALLS_UNCOUNTED', 'on');
    const doc = await call([GREETING, ARE_YOU_THERE]);
    expect(doc.turnCount).toBe(2);
    expect(doc.userTurnCount).toBe(0);
    expect(isCountedSession(doc)).toBe(false);
  });

  it('flag on: a call where the caller spoke still counts', async () => {
    vi.stubEnv('ASSISTANT_ONLY_CALLS_UNCOUNTED', 'on');
    const doc = await call([GREETING, CALLER]);
    expect(doc.userTurnCount).toBe(1);
    expect(isCountedSession(doc)).toBe(true);
  });

  it('flag off: the start record is unchanged and the assistant-only call counts as before', async () => {
    vi.stubEnv('ASSISTANT_ONLY_CALLS_UNCOUNTED', '');
    const id = await startConversation('u1', 'ferni');
    expect(Object.keys(stored.get(id) ?? {}).sort()).toEqual(
      ['personaId', 'startedAt', 'summarized', 'turnCount'].sort()
    );
    stored.clear();
    const doc = await call([GREETING, ARE_YOU_THERE]);
    expect('userTurnCount' in doc).toBe(false);
    expect(isCountedSession(doc)).toBe(true);
  });

  it('calls stored before the change (no userTurnCount) keep the two-turn reading', () => {
    const legacy = { startedAt: new Date(1), endedAt: new Date(2) };
    expect(isCountedSession({ ...legacy, turnCount: 2 })).toBe(true);
    expect(isCountedSession({ ...legacy, turnCount: 1 })).toBe(false);
  });
});
