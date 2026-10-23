/**
 * memory_saved (CLIENT_SIGNALS_V2): once, after a store that resolved, through
 * the real writers (rememberAboutUser / rememberImportantFact in
 * tools-unified.ts, and the FTIS memory executor) with only storage faked.
 * Never on a failed write, before the write resolves, for a held minor, or
 * with the flag off; never with content.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WriteResult = { success: boolean; memoryId?: string };
const write = vi.hoisted(() =>
  vi.fn(async (): Promise<WriteResult> => ({ success: true, memoryId: 'mem_1_abc1234' }))
);
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write }),
}));
const firestoreAdd = vi.hoisted(() =>
  vi.fn(async (): Promise<{ id: string }> => ({ id: 'Fs7docId01' }))
);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ add: firestoreAdd }) }) }),
  }),
}));
vi.mock('../../../../memory/embeddings.js', () => ({ embed: async () => [0.1] }));
vi.mock('../../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => undefined }),
}));

import { memoryExecutor } from '../../../../agents/shared/tool-executors/memory-executor.js';
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../../utils/minor-care.js';
import {
  announceMemorySaved,
  MEMORY_SAVED,
  memoryIsSensitive,
  opaqueMemoryId,
  setMemorySavedSender,
} from '../memory-saved.js';
import { rememberAboutUserUnifiedDef, rememberImportantFactUnifiedDef } from '../tools-unified.js';

const sent: Array<{ sessionId: string; type: string; payload: Record<string, unknown> }> = [];
const send = vi.fn(async (sessionId: string, type: string, payload: Record<string, unknown>) => {
  sent.push({ sessionId, type, payload });
  return true;
});

type Execute = (args: Record<string, string>, opts: unknown) => Promise<string>;
const execute = (def: { create: (ctx: never) => unknown }) =>
  (def.create({ agentId: 'ferni' } as never) as { execute: Execute }).execute;
const remember = (sessionId: string, fact = 'has two kids') =>
  execute(rememberAboutUserUnifiedDef)(
    { fact, category: 'personal', importance: 'high' },
    { ctx: { userData: { userId: 'u1', services: { sessionId } } } }
  );
/** Let the fire-and-forget announce settle. */
const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

beforeEach(() => {
  sent.length = 0;
  send.mockClear();
  write.mockClear();
  firestoreAdd.mockClear();
  setMemorySavedSender(send);
  vi.stubEnv('CLIENT_SIGNALS_V2', 'on');
});
afterEach(() => {
  setMemorySavedSender(null);
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('memory_saved from rememberAboutUser (tools-unified.ts)', () => {
  it('fires once after a successful write, with only id, sensitive and ts', async () => {
    await remember('s1');
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.sessionId).toBe('s1');
    expect(sent[0]!.type).toBe(MEMORY_SAVED);
    expect(Object.keys(sent[0]!.payload).sort()).toEqual(['id', 'sensitive', 'ts']);
    expect(sent[0]!.payload).toMatchObject({ id: 'mem_1_abc1234', sensitive: true });
    expect(JSON.stringify(sent[0]!.payload)).not.toMatch(/kids|personal/);
  });

  it('is not sent before the write resolves', async () => {
    let resolveWrite: (r: WriteResult) => void = () => {};
    write.mockImplementationOnce(
      () =>
        new Promise<WriteResult>((r) => {
          resolveWrite = r;
        })
    );
    const pending = remember('s2', 'likes jazz');
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
    resolveWrite({ success: true, memoryId: 'mem_2_xyz7890' });
    await pending;
    await settle();
    expect(sent.map((m) => m.payload.id)).toEqual(['mem_2_xyz7890']);
    expect(sent[0]!.payload.sensitive).toBe(false);
  });

  it('is never sent when the write fails', async () => {
    write.mockResolvedValueOnce({ success: false });
    await remember('s3');
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });

  it('is never sent for a held minor (MINOR_CARE): nothing is stored either', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    noteCallerWords('minor-1', "I'm 16 years old and kind of bored");
    await remember('minor-1');
    await settle();
    expect(write).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('is never sent with CLIENT_SIGNALS_V2 off, though the write still happens', async () => {
    vi.stubEnv('CLIENT_SIGNALS_V2', 'off');
    await remember('s4');
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });
});

describe('memory_saved from the other writers', () => {
  it('rememberImportantFact: once on success, never on failure; a concern is sensitive', async () => {
    const run = () =>
      execute(rememberImportantFactUnifiedDef)(
        { fact: 'starting a new job', type: 'concern', emotionalWeight: 'medium' },
        { ctx: { userData: { userId: 'u1', services: { sessionId: 's5' } } } }
      );
    await run();
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.sensitive).toBe(true);
    write.mockResolvedValueOnce({ success: false });
    await run();
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('memory executor: once after extracted_facts.add resolves, never when it rejects', async () => {
    const run = () =>
      memoryExecutor.execute(
        'rememberAboutUser',
        { fact: 'plays tennis', category: 'preference' },
        { userId: 'u1', sessionId: 's6' }
      );
    await run();
    await settle();
    expect(firestoreAdd).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ id: 'Fs7docId01', sensitive: false });
    firestoreAdd.mockRejectedValueOnce(new Error('unavailable'));
    await run();
    await settle();
    expect(firestoreAdd).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(1);
  });
});

describe('announceMemorySaved holds minors itself (backstop if a caller forgets)', () => {
  const saved = (sessionId: string, userId: string) => ({
    sessionId,
    userId,
    id: 'mem_123456',
    fact: 'likes trains',
  });

  it('sends nothing for a held session, and sends for one that is not held', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    noteCallerWords('kid-call', "I'm 13 and in seventh grade");
    expect(await announceMemorySaved(saved('adult-call', 'u-adult'))).toBe(true);
    expect(await announceMemorySaved(saved('kid-call', 'u-adult'))).toBe(false);
    expect(sent.map((m) => m.sessionId)).toEqual(['adult-call']);
  });

  it('sends nothing for a held user, even from another session', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    bindSessionUser('kid-call', 'u-kid');
    noteCallerWords('kid-call', "I'm 13 and in seventh grade");
    expect(await announceMemorySaved(saved('text-thread', 'u-adult'))).toBe(true);
    expect(await announceMemorySaved(saved('text-thread', 'u-kid'))).toBe(false);
    expect(sent).toHaveLength(1);
  });
});

describe('memoryIsSensitive / opaqueMemoryId', () => {
  it.each([
    ['has a therapist', true],
    ['recently came out as gay', true],
    ['is in a custody fight', true],
    ['daughter is 12', true],
    ['has a girlfriend named Sam', true],
    ['thought about suicide last year', true],
    ['loves hiking', false],
    ['prefers mornings', false],
  ])('%s → %s', (fact, sensitive) => {
    expect(memoryIsSensitive(fact, 'personal')).toBe(sensitive);
  });

  it('emotional and financial categories are sensitive whatever the words', () => {
    expect(memoryIsSensitive('loves hiking', 'emotional')).toBe(true);
    expect(memoryIsSensitive('loves hiking', 'financial')).toBe(true);
  });

  it('keeps a plain store id and replaces anything else with a random one', () => {
    expect(opaqueMemoryId('mem_1_abc1234')).toBe('mem_1_abc1234');
    expect(opaqueMemoryId('fact about kids')).toMatch(/^[0-9a-f-]{36}$/);
    expect(opaqueMemoryId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
