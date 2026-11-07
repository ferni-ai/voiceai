/**
 * Custom-agent chat reads crisis before anything else (POST /api/custom-agents/:agentId/chat).
 *
 * The person's message went straight to an in-character model call: a crisis line got the
 * character's reply and no crisis help. It now goes through the voice reply's crisis gate first, so
 * the same words get the same handling as on a call. Fictional agent and lines only.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomAgent } from '../../../types/custom-agent-api.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';

const order: string[] = [];
const { callLLM, getCustomAgent } = vi.hoisted(() => ({
  callLLM: vi.fn(async (_prompt: string) => 'Ahoy! Welcome aboard.' as string | null),
  getCustomAgent: vi.fn(async (_userId: string, _agentId: string) => null as unknown),
}));
vi.mock('../../../services/llm-utils.js', () => ({ callLLM }));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent,
  deleteCustomAgent: vi.fn(),
}));
vi.mock('../../../agents/personas/crisis-gate.js', async (real) => {
  const gate = await real<typeof import('../../../agents/personas/crisis-gate.js')>();
  return {
    ...gate,
    startCrisisGate: (...args: Parameters<typeof gate.startCrisisGate>) => {
      order.push('crisis');
      return gate.startCrisisGate(...args);
    },
  };
});

const { startCrisisGate } = await import('../../../agents/personas/crisis-gate.js');
const { buildAgentChatPrompt, handleAgentChat } = await import('../chat-routes.js');
type ChatTurn = import('../chat-routes.js').ChatTurn;

const captain = {
  id: 'agent-1',
  userId: 'u1',
  name: 'Captain Nova',
  displayName: 'Captain Nova',
  description: 'A cheerful starship captain who loves puns',
  type: 'fictional',
  personality: { warmth: 0.8, humorLevel: 0.9, traits: ['playful'] },
  behaviors: { greetings: [], catchphrases: [] },
  memories: { stories: [], wisdom: [], sharedMoments: [], journalEntries: [] },
} as unknown as CustomAgent;

const BLOCK = 'standing on the bridge rn. just wanted to tell someone before i jump';
const GUIDE = "i kinda wish i just wouldn't wake up tomorrow";
const PLAIN = 'what was the strangest planet you ever landed on?';

async function chat(message: string, history: ChatTurn[] = [], scene = '') {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify({ message, history, scene })));
    req.emit('end');
  }, 0);
  await handleAgentChat(req, res, 'u1', 'agent-1');
  return { status, body: JSON.parse(raw) as { reply?: string; crisis?: boolean } };
}

/** The voice turn's decision for the same words and earlier turns. */
function voiceDecision(text: string, history: ChatTurn[] = []) {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const turn of history)
    ctx.addMessage({ role: turn.from === 'person' ? 'user' : 'assistant', content: turn.text });
  ctx.addMessage({ role: 'user', content: text });
  const gate = startCrisisGate(ctx, undefined);
  if (!gate) throw new Error('the voice crisis gate is off');
  return gate.decision;
}

const prompt = () => callLLM.mock.calls[0]?.[0] ?? '';

beforeEach(() => {
  order.length = 0;
  callLLM.mockClear();
  callLLM.mockImplementation(async () => {
    order.push('llm');
    return 'Ahoy! Welcome aboard.';
  });
  getCustomAgent.mockReset();
  getCustomAgent.mockImplementation(async () => {
    order.push('db-read');
    return captain;
  });
});

describe('custom-agent chat: the crisis read', () => {
  it('runs before the agent is read and before the model', async () => {
    await chat(GUIDE);
    expect(order).toEqual(['crisis', 'db-read', 'llm']);
  });

  it("block: the voice turn's crisis reply, crisis: true, and no model call", async () => {
    const voice = voiceDecision(BLOCK);
    expect(voice.action).toBe('replace');
    order.length = 0;
    const { status, body } = await chat(BLOCK);
    expect(status).toBe(200);
    expect(body).toEqual({ reply: voice.action === 'replace' && voice.script, crisis: true });
    expect(callLLM).not.toHaveBeenCalled();
    expect(getCustomAgent).not.toHaveBeenCalled();
  });

  it("lower tier: the model is asked with the voice turn's guidance", async () => {
    const voice = voiceDecision(GUIDE);
    expect(voice.action).toBe('guide');
    const { body } = await chat(GUIDE);
    expect(body).toEqual({ reply: 'Ahoy! Welcome aboard.' });
    expect(prompt()).toContain(`Them: ${GUIDE}`);
    expect(prompt()).toContain(`(${voice.action === 'guide' && voice.guidance})`);
  });

  it('reads the conversation so far, as the voice turn reads earlier turns', async () => {
    const history: ChatTurn[] = [
      { from: 'person', text: 'sometimes i wish i could just disappear' },
      { from: 'agent', text: 'That sounds heavy, crewmate. What happened?' },
    ];
    const now = 'soon none of this will matter';
    const voice = voiceDecision(now, history);
    expect(voiceDecision(now).action).toBe('pass');
    expect(voice.action).toBe('guide');
    await chat(now, history);
    expect(prompt()).toContain(`(${voice.action === 'guide' && voice.guidance})`);
  });

  it('no crisis: the model gets the same prompt as before', async () => {
    const history: ChatTurn[] = [{ from: 'agent', text: 'Welcome to the bridge.' }];
    const { body } = await chat(PLAIN, history, 'A tour of the starship');
    expect(body).toEqual({ reply: 'Ahoy! Welcome aboard.' });
    expect(prompt()).toBe(buildAgentChatPrompt(captain, history, PLAIN, 'A tour of the starship'));
  });

  it('never lower than the voice turn, line for line', async () => {
    const rows = [
      ...CRISIS_HELDOUT.map((row) => ({ text: row.text, history: [] as ChatTurn[] })),
      ...CRISIS_CONTEXTUAL.map((row) => ({
        text: row.text,
        history: [
          ...row.earlier.map((text): ChatTurn => ({ from: 'person', text })),
          ...(row.companion ? [{ from: 'agent' as const, text: row.companion }] : []),
        ],
      })),
    ];
    const tiers = { replace: 0, guide: 0, pass: 0 };
    const mismatches: string[] = [];
    for (const { text, history } of rows) {
      callLLM.mockClear();
      const voice = voiceDecision(text, history);
      // eslint-disable-next-line no-await-in-loop -- one line at a time: the model spy is shared
      const { body } = await chat(text, history);
      const same =
        voice.action === 'replace'
          ? body.crisis === true && body.reply === voice.script && callLLM.mock.calls.length === 0
          : voice.action === 'guide'
            ? !body.crisis && prompt().includes(`(${voice.guidance})`)
            : !body.crisis && prompt() === buildAgentChatPrompt(captain, history, text, '');
      tiers[voice.action] += 1;
      if (!same) mismatches.push(`${voice.action}: ${text}`);
    }
    if (process.env.CRISIS_TIER_TABLE)
      process.stderr.write(
        `chat tiers n=${rows.length} ${JSON.stringify(tiers)} mismatches=${mismatches.length}\n`
      );
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(Math.min(tiers.replace, tiers.guide, tiers.pass)).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
