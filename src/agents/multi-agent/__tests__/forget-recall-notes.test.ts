/**
 * FORGET_EVERY_READER and recall's notes in the chat. A note held for a
 * preemptive reply (PREEMPT_STABLE_CONTEXT=defer) is checked again when it
 * lands, so a forget made while it waited keeps it out. And a forget takes
 * recall's notes about the topic out of the chat at once, not on the next
 * transcript: a reply the agent starts on its own, or a handoff copying the
 * chat, would otherwise still see them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: [] as string[] | null }));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

import { forgetTopic, type ForgetStore } from '../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../memory/recall/forget-topics-source.js';
import { sendRecall } from '../../personas/context-packet/turn-packet.js';

const SAID = 'tell me about it';
const NOTE = '[WHAT YOU REMEMBER] their dog Biscuit chews things';
const NO_PICK = { lastPick: () => null } as never;
const processOnly: ForgetStore = {
  facts: async () => [],
  markForgotten: async () => undefined,
  addTopic: async () => undefined,
  topics: async () => [],
};

let seq = 0;
let user = '';
beforeEach(async () => {
  stored.topics = [];
  resetForgetTopicsSource();
  user = `member-recall-notes-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  await readTopics(user); // agent setup's prefetch: the transcript tick has a source
});
afterEach(() => vi.unstubAllEnvs());

function chat(items: Array<{ id: string; textContent: string }>) {
  let current = items;
  const activity = {
    _preemptiveGeneration: { info: { newTranscript: SAID }, createdAt: Date.now() } as object,
    _preemptiveGenerationCount: 0,
  };
  const agent = {
    _agentActivity: activity,
    chatCtx: {
      copy: () => {
        const copied = { items: [...current] };
        return Object.assign(copied, {
          addMessage: (m: { content: string; id?: string }) => {
            copied.items.push({ id: m.id ?? '', textContent: m.content });
          },
        });
      },
    },
    updateChatCtx: async (ctx: unknown) => {
      current = (ctx as { items: typeof items }).items;
    },
  };
  const texts = () => current.map((i) => i.textContent);
  return { agent, texts, activity };
}

describe('a recall note held for a preemptive reply', () => {
  it('is checked again when it lands: a forget made while it waited keeps it out', async () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'defer');
    const { agent, texts, activity } = chat([{ id: 'user_1', textContent: SAID }]);
    activity._preemptiveGenerationCount = 1; // a preemptive reply is in flight
    sendRecall(agent as never, {}, NO_PICK, NOTE, SAID, user);
    expect(texts()).not.toContain(NOTE); // held
    await forgetTopic(user, 'Biscuit', processOnly);
    activity._preemptiveGenerationCount = 0; // decided: the held write runs
    await new Promise((r) => {
      setTimeout(r, 150);
    });
    expect(texts()).toEqual([SAID]);
  });

  it('lands when nothing was forgotten while it waited', async () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'defer');
    const { agent, texts, activity } = chat([{ id: 'user_1', textContent: SAID }]);
    activity._preemptiveGenerationCount = 1;
    sendRecall(agent as never, {}, NO_PICK, NOTE, SAID, user);
    activity._preemptiveGenerationCount = 0;
    await vi.waitFor(() => expect(texts()).toContain(NOTE), { timeout: 1000 });
  });
});

describe('a forget during the call', () => {
  it("takes recall's notes about the topic out of the chat at once", async () => {
    const { agent, texts } = chat([
      { id: 'recall_1', textContent: NOTE },
      { id: 'recall_2', textContent: '[WHAT YOU REMEMBER] training for Boston' },
      { id: 'user_1', textContent: 'Biscuit did it again' }, // the caller's words, never touched
    ]);
    sendRecall(agent as never, {}, NO_PICK, null, 'hi', user); // recall has spoken in this chat
    expect(texts()).toHaveLength(3);
    await forgetTopic(user, 'Biscuit', processOnly);
    expect(texts()).toEqual(['[WHAT YOU REMEMBER] training for Boston', 'Biscuit did it again']);
  });

  it('flag off: the chat is left as it is', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const { agent, texts } = chat([{ id: 'recall_1', textContent: NOTE }]);
    sendRecall(agent as never, {}, NO_PICK, null, 'hi', user);
    await forgetTopic(user, 'Biscuit', processOnly);
    expect(texts()).toEqual([NOTE]);
  });
});
