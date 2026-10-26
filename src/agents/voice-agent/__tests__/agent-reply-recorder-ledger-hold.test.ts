/**
 * MINOR_CARE: the reply recorder hands the life ledger the call's sessionId, so the ledger's hold
 * check sees a hold known only by the session (a caller who said they're 14 before the session
 * was bound to the user). The real recorder and ledger run; only Firestore and the model are fakes.
 */
import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../conversation/advanced-humanization-integration.js', () => ({
  recordAgentResponse: vi.fn(),
  recordAdviceGiven: vi.fn(),
}));
vi.mock('../../../services/identity/member-identity.js', () => ({ isMemberIdentity: () => true }));
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async () => ({
      response: { text: () => "Ferni's neighbor finally fixed the fence" },
    }),
  }),
}));
const saved = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => {
    const col = { doc: () => ({}) };
    return {
      collection: () => ({ doc: () => ({ collection: () => col }) }),
      batch: () => ({
        set: (_: unknown, f: unknown) => void saved.push(f),
        commit: async () => {},
      }),
    };
  },
}));

import { registerAgentReplyRecorder } from '../agent-reply-recorder.js';
import { noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
import type { UserData } from '../../shared/types.js';
import type { SessionServices } from '../../../services/index.js';

beforeEach(() => {
  resetMinorCare();
  saved.length = 0;
  vi.stubEnv('MINOR_CARE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

/** A call in which Ferni says one line about himself, then ends. */
async function call(sessionId: string): Promise<void> {
  const session = new EventEmitter();
  const services = { userId: 'uid-member', addTurn: vi.fn() } as unknown as SessionServices;
  const userData = { personaId: 'ferni' } as UserData;
  registerAgentReplyRecorder(session as never, { sessionId, services, userData });
  session.emit(voice.AgentSessionEventTypes.ConversationItemAdded, {
    type: 'conversation_item_added',
    item: llm.ChatMessage.create({
      role: 'assistant',
      content: 'My neighbor finally fixed the fence after the storm, so the dog stays in now.',
    }),
  });
  await vi.waitFor(() => expect(userData.lastAgentResponse).toBeTruthy());
  await new Promise<void>((r) => void setImmediate(r));
  session.emit(voice.AgentSessionEventTypes.Close, {});
  await new Promise<void>((r) => void setTimeout(r, 20));
}

describe('reply recorder → life ledger under MINOR_CARE', () => {
  it("an adult's call stores what Ferni said about himself (persona_told)", async () => {
    await call('call-adult');
    expect(saved).toHaveLength(1);
  });

  it('a call held only by its session stores nothing', async () => {
    noteCallerWords('call-held', "I'm 14 years old");
    await call('call-held');
    expect(saved).toEqual([]);
  });
});
