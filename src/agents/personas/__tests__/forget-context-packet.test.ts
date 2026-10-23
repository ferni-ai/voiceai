/**
 * FORGET_EVERY_READER with CONTEXT_PACKET=on (#2662): a topic the caller asked
 * Ferni to forget in an EARLIER call (stored, not forgotten in this process)
 * never reaches the turn's packet, from a pick made before the forget or one
 * made now. And a new recall note about it is not sent at all: it never
 * restarts the preemptive reply (PREEMPT_STABLE_CONTEXT=on) for nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null }));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

const { readTopics, resetForgetTopicsSource } =
  await import('../../../memory/recall/forget-topics-source.js');
const { rememberForPacket, sendRecall, turnPacket } =
  await import('../context-packet/turn-packet.js');

const SAID = 'tell me about it';
const BISCUIT = { entity: 'dog', key: 'name', value: 'Biscuit chews shoes', confidence: 0.9 };
const GARDEN = { entity: 'user', key: 'hobby', value: 'growing tomatoes', confidence: 0.9 };
const PICK = { facts: [BISCUIT, GARDEN], rest: null, userName: 'Sam' };
const NOTE = '[WHAT YOU REMEMBER] their dog Biscuit chews shoes';

let seq = 0;
let user = '';
beforeEach(async () => {
  stored.topics = ['Biscuit'];
  resetForgetTopicsSource();
  user = `member-packet-forget-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  vi.stubEnv('CONTEXT_PACKET', 'on');
  await readTopics(user); // agent setup's prefetch
});
afterEach(() => vi.unstubAllEnvs());

const parts = { words: SAID, notes: [], now: Date.now() };
const packetText = (session: object) => JSON.stringify(turnPacket(session, parts));

function agentWithPreemptive() {
  const restarts: unknown[] = [];
  const activity = {
    _preemptiveGeneration: { info: { newTranscript: SAID } } as { info: object } | undefined,
    _preemptiveGenerationCount: 0,
    onPreemptiveGeneration: (info: unknown) => {
      restarts.push(info);
      activity._preemptiveGeneration = { info: { newTranscript: SAID } };
    },
  };
  let items: unknown[] = [];
  const agent = {
    _agentActivity: activity,
    chatCtx: {
      copy: () => {
        const copied = { items: [...items] };
        return Object.assign(copied, { addMessage: (m: unknown) => copied.items.push(m) });
      },
    },
    updateChatCtx: async (ctx: { items: unknown[] }) => {
      items = ctx.items;
    },
  };
  return { agent, restarts };
}

describe('a stored forgotten topic and the context packet', () => {
  it('a pick made before the forget: the packet leaves its fact out, keeps the rest', () => {
    const session = { userData: { userId: user } };
    rememberForPacket(session, PICK);
    const text = packetText(session);
    expect(text).not.toContain('Biscuit');
    expect(text).toContain('growing tomatoes');
  });

  it('a pick made now, with its note: nothing about it reaches the packet', () => {
    const session = { userData: { userId: user } };
    const { agent } = agentWithPreemptive();
    sendRecall(agent as never, session, { lastPick: () => PICK } as never, NOTE, SAID, user);
    expect(packetText(session)).not.toContain('Biscuit');
  });

  it('when the topics cannot be read, the packet carries no memories at all', async () => {
    stored.topics = null;
    resetForgetTopicsSource();
    await readTopics(user);
    const session = { userData: { userId: user } };
    rememberForPacket(session, PICK);
    expect(packetText(session)).not.toContain('growing tomatoes');
  });
});

describe('a new recall note about it', () => {
  it('is not sent, so it never restarts the preemptive reply', () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    vi.stubEnv('CONTEXT_PACKET', 'off');
    const { agent, restarts } = agentWithPreemptive();
    sendRecall(agent as never, {}, { lastPick: () => null } as never, NOTE, SAID, user);
    expect(restarts).toHaveLength(0);
  });

  it('a note about anything else does restart it (the restart is observable)', () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    vi.stubEnv('CONTEXT_PACKET', 'off');
    const { agent, restarts } = agentWithPreemptive();
    const note = '[WHAT YOU REMEMBER] they grow tomatoes';
    sendRecall(agent as never, {}, { lastPick: () => null } as never, note, SAID, user);
    expect(restarts).toHaveLength(1);
  });
});
