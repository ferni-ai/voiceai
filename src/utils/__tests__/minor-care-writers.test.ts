/**
 * MINOR_CARE=on: with a caller who said they're under 18 and isn't a verified
 * owner, each gated writer stores nothing. Every case runs the real writer
 * with only its storage faked, and checks the same writer still stores for a
 * verified owner and with the flag off.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const write = vi.hoisted(() => vi.fn(async () => ({ success: true, memoryId: 'm1' })));
vi.mock('../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write }),
}));
const store = vi.hoisted(() => ({
  getProfileForWrite: vi.fn(async (userId: string): Promise<unknown> => ({ userId, name: 'Sam' })),
  saveProfile: vi.fn(async () => undefined),
  saveSummary: vi.fn(async () => undefined),
}));
vi.mock('../../services/global-services.js', () => ({
  getGlobalServices: async () => ({ store }),
}));
vi.mock('../../services/data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));
vi.mock('../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 60,
    turnCount: 2,
    mainTopics: ['school'],
    keyPoints: ['said where they live'],
    emotionalArc: 'calm',
  }),
}));
const firestoreAdd = vi.hoisted(() => vi.fn(async () => ({ id: 'stored-1' })));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ add: firestoreAdd }) }) }),
  }),
}));
vi.mock('../../memory/embeddings.js', () => ({ embed: async () => [0.1] }));
vi.mock('../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => undefined }),
}));

import { getHistoryTracker } from '../../memory/index.js';
import { memoryExecutor } from '../../agents/shared/tool-executors/memory-executor.js';
import { toolsForTurn, withTurnReminder } from '../../agents/personas/turn-request.js';
import { rememberAboutUserDef } from '../../tools/domains/memory/tools.js';
import {
  rememberAboutUserUnifiedDef,
  rememberImportantFactUnifiedDef,
} from '../../tools/domains/memory/tools-unified.js';
import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
} from '../../services/session/after-call-tasks.js';
import {
  MINOR_CARE_NOTE,
  noteCallerWords,
  resetMinorCare,
  setVerifiedOwnerCheck,
  userHeld,
} from '../minor-care.js';
import { createSessionServices } from '../../services/session/session-manager.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A session in the given state: held (flag on, said 16), a verified owner who said 16, or flag off. */
function sessionFor(c: Case): string {
  const sessionId = `minor-${c}-${++n}`;
  if (c === 'off') vi.stubEnv('MINOR_CARE', 'off');
  else vi.stubEnv('MINOR_CARE', 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  noteCallerWords(sessionId, "I'm 16 years old and kind of bored");
  return sessionId;
}

type Execute = (args: Record<string, string>, opts: unknown) => Promise<string>;
const execute = (def: { create: (ctx: never) => unknown }) =>
  (def.create({ agentId: 'ferni' } as never) as { execute: Execute }).execute;

beforeEach(() => {
  write.mockClear();
  store.saveProfile.mockClear();
  store.saveSummary.mockClear();
  firestoreAdd.mockClear();
});
afterEach(async () => {
  resetMinorCare();
  vi.unstubAllEnvs();
  clearAfterCallTasks();
  await drainAfterCallTasks(50);
});

describe.each<[Case, boolean]>([
  ['held', false],
  ['owner', true],
  ['off', true],
])('%s: stores = %s', (c, stores) => {
  it('rememberAboutUser (tools-unified.ts): memory service write', async () => {
    const sessionId = sessionFor(c);
    await execute(rememberAboutUserUnifiedDef)(
      { fact: 'lives in 12345', category: 'personal', importance: 'high' },
      { ctx: { userData: { userId: 'u1', services: { sessionId } } } }
    );
    expect(write).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('rememberImportantFact (tools-unified.ts): memory service write', async () => {
    const sessionId = sessionFor(c);
    await execute(rememberImportantFactUnifiedDef)(
      { fact: 'goes to church on Sunday', type: 'life_event', emotionalWeight: 'medium' },
      { ctx: { userData: { userId: 'u1', services: { sessionId } } } }
    );
    expect(write).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('rememberAboutUser (tools.ts): insight to the learning engine', async () => {
    const sessionId = sessionFor(c);
    const captureInsight = vi.fn();
    await execute(rememberAboutUserDef)(
      { fact: 'lives in 12345', category: 'personal', importance: 'high' },
      { ctx: { userData: { services: { sessionId, captureInsight } } } }
    );
    expect(captureInsight).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('FTIS memory executor: extracted_facts write', async () => {
    const sessionId = sessionFor(c);
    await memoryExecutor.execute(
      'rememberAboutUser',
      { fact: 'lives in 12345', category: 'personal' },
      { userId: 'u1', sessionId, personaId: 'ferni' } as never
    );
    expect(firestoreAdd).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('after-call tasks (fact sweep, extraction, commitments, ...): none run', async () => {
    const sessionId = sessionFor(c);
    const task = vi.fn(async () => undefined);
    registerAfterCallTask('probe', task);
    runAfterCallTasks({ userId: 'u1', sessionId, turns: [], startedAt: new Date() });
    await drainAfterCallTasks(1_000);
    expect(task).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('endSession: call summary and profile', async () => {
    const sessionId = sessionFor(c);
    const services = await createSessionServices(sessionId, `user-${sessionId}`);
    const tracker = getHistoryTracker(sessionId, `user-${sessionId}`);
    tracker.addAssistantTurn('Hey, who is this?');
    tracker.addUserTurn("I'm 16 years old and kind of bored");
    store.saveProfile.mockClear();
    await services.endSession();
    expect(store.saveSummary).toHaveBeenCalledTimes(stores ? 1 : 0);
    expect(store.saveProfile.mock.calls.length > 0).toBe(stores);
  });

  it('toolsForTurn: no memory tool in the request or left on the agent', async () => {
    const sessionId = sessionFor(c);
    const tool = () =>
      llm.tool({ description: 'x', parameters: z.object({}), execute: async () => 'ok' });
    const names = ['rememberAboutUser', 'rememberImportantFact', 'getWeather'];
    const agent = {
      toolCtx: new llm.ToolContext(Object.fromEntries(names.map((t) => [t, tool()]))),
      async updateTools(tools: llm.ToolContext) {
        this.toolCtx = tools;
      },
    };
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: "I'm 16 years old and kind of bored" });
    const sent = await toolsForTurn(
      { userData: { personaId: 'ferni', services: { sessionId } } } as never,
      chat,
      agent.toolCtx,
      { loggedLockedHandoffs: true, agent } as never
    );
    expect('rememberAboutUser' in sent.functionTools).toBe(stores);
    expect('rememberAboutUser' in agent.toolCtx.functionTools).toBe(stores);
    expect('getWeather' in sent.functionTools).toBe(true);
  });
});

describe('the live tools path (turn-request.ts) binds the userId, so userHeld follows', () => {
  it('a caller who says 16 holds their user for the per-user stores', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const sessionId = `minor-turn-${++n}`;
    const userId = `user-${sessionId}`;
    const agent = { toolCtx: new llm.ToolContext({}), async updateTools() {} };
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: "I'm 16 years old and kind of bored" });
    await toolsForTurn(
      { userData: { personaId: 'ferni', userId, services: { sessionId } } } as never,
      chat,
      agent.toolCtx,
      { loggedLockedHandoffs: true, agent } as never
    );
    expect(userHeld(userId)).toBe(true);
  });
});

describe('the care note on the live request (turn-request.ts)', () => {
  const request = (sessionId: string, said: string, shape?: boolean): string => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: said });
    const out = withTurnReminder(chat, { userData: { services: { sessionId } } }, { shape });
    return (out.items.at(-1) as llm.ChatMessage).textContent ?? '';
  };

  it('rides the reply once they said they are under 18, flag on', () => {
    vi.stubEnv('MINOR_CARE', 'on');
    expect(request('note-1', 'what should I watch tonight')).not.toContain(MINOR_CARE_NOTE);
    expect(request('note-1', "I'm in 8th grade")).toContain(MINOR_CARE_NOTE);
  });

  it('a bare "16." counts only as the answer to Ferni asking their age', () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const answer = (sessionId: string, asked: string): string => {
      const chat = llm.ChatContext.empty();
      chat.addMessage({ role: 'assistant', content: asked });
      chat.addMessage({ role: 'user', content: '16.' });
      const out = withTurnReminder(chat, { userData: { services: { sessionId } } }, {});
      return (out.items.at(-1) as llm.ChatMessage).textContent ?? '';
    };
    expect(answer('bare-1', 'How many minutes out are you?')).not.toContain(MINOR_CARE_NOTE);
    expect(answer('bare-2', 'How old are you, if you don’t mind me asking?')).toContain(
      MINOR_CARE_NOTE
    );
  });

  it('never with crisis guidance, and not with the flag off', () => {
    vi.stubEnv('MINOR_CARE', 'on');
    expect(request('note-2', "I'm 15 years old", false)).not.toContain(MINOR_CARE_NOTE);
    vi.stubEnv('MINOR_CARE', 'off');
    expect(request('note-3', "I'm 15 years old")).not.toContain(MINOR_CARE_NOTE);
  });
});
