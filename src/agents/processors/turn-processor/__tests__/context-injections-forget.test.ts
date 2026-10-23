/**
 * buildContextInjections reads the caller's memory through filtered views
 * (memory/recall/prompt-view.ts, FORGET_EVERY_READER): the runner itself,
 * not a builder called directly. The session keeps a real
 * ConversationStateManager; its summary reaches the turn as
 * [CONVERSATION STATE].
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null }));
vi.mock('../../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

import { ConversationStateManager } from '../../../../services/social/conversation-state.js';
import { createSessionId, createUserId } from '../../../../types/branded.js';
import { resetForgetTopicsSource } from '../../../../memory/recall/forget-topics-source.js';
import { buildContextInjections } from '../context-injections.js';

type Args = Parameters<typeof buildContextInjections>;
let seq = 0;
let user = '';
beforeEach(() => {
  resetForgetTopicsSource();
  stored.topics = ['Biscuit'];
  user = `member-ctx-forget-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

async function turn(state: ConversationStateManager) {
  const ctx = {
    userText: 'how was your day',
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { userId: user, sessionId: `s-${seq}` },
    userData: { turnCount: 3, conversationState: state, keyMoments: [] as string[] },
  } as unknown as Args[0];
  const analysis = {
    analysis: {
      emotion: { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
      topics: { category: 'general' },
      intent: 'chat',
    },
    currentTopic: 'general',
  } as unknown as Args[1];
  const result = await buildContextInjections(
    ctx,
    analysis,
    { primary: 'neutral', intensity: 0.2 } as unknown as Args[2],
    { length: { min: 10, max: 60, guidance: 'Keep it short' } } as unknown as Args[3],
    { needsReinforcement: false } as unknown as Args[4],
    null,
    undefined,
    {} as Args[7]
  );
  return result.injections;
}

const stateSummary = (out: Awaited<ReturnType<typeof turn>>) =>
  out.find((i) => i.category === 'conversation_state')?.content;

function newState() {
  return new ConversationStateManager(createSessionId(`s-${seq}`), createUserId(user), 'ferni');
}

describe('buildContextInjections reads the session through promptViews', () => {
  it('a forgotten key moment at the first turn: the turn still builds, without it', async () => {
    const state = newState();
    state.addKeyMoment('Biscuit learned to sit');
    const summary = stateSummary(await turn(state));
    expect(summary).toContain('Turn: '); // the real manager's summary, methods intact
    expect(summary).not.toMatch(/biscuit/i);
  });

  it('clean at the first turn, a forgotten key moment added later stays out', async () => {
    const state = newState();
    expect(stateSummary(await turn(state))).toContain('Turn: ');
    state.addKeyMoment('Biscuit chewed the couch');
    const summary = stateSummary(await turn(state));
    expect(summary).toContain('Turn: ');
    expect(summary).not.toMatch(/biscuit/i);
  });

  it('flag off: the summary as the manager wrote it', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const state = newState();
    state.addKeyMoment('Biscuit learned to sit');
    expect(stateSummary(await turn(state))).toContain('Biscuit learned to sit');
  });
});
