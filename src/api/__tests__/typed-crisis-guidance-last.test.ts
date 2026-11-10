/**
 * The typed routes' crisis guidance is the last word the model reads: nothing after it but
 * the speaker cue the model completes. Driven through the real handlers (POST
 * /api/custom-agents/:id/chat and /api/journal/twin-response); only the model, sign-in and
 * stores are stubbed. Fictional lines only; no eval set is loaded.
 */
import { EventEmitter } from 'events';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomAgent } from '../../types/custom-agent-api.js';

const { callLLM } = vi.hoisted(() => ({
  callLLM: vi.fn(async (_prompt: string, _options?: unknown) => 'a reply' as string | null),
}));
vi.mock('../../services/llm-utils.js', () => ({ callLLM }));
// "tok-<name>" verifies as uid-<name>
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));
vi.mock('../../services/journal/index.js', () => ({
  getJournalService: () => ({ getAllEntries: async () => [] }),
}));

const captain = {
  id: 'agent-1',
  userId: 'u1',
  name: 'Captain Nova',
  displayName: 'Captain Nova',
  description: 'A cheerful starship captain',
  type: 'fictional',
  personality: { warmth: 0.8, humorLevel: 0.9, traits: ['playful'] },
  behaviors: { greetings: [], catchphrases: [] },
  memories: { stories: [], wisdom: [], sharedMoments: [], journalEntries: [] },
  voice: {
    type: 'selected',
    voiceId: '',
    status: 'pending',
    settings: { speed: 1, stability: 0.5, similarityBoost: 0.5 },
  },
} as unknown as CustomAgent;
vi.mock('../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: async (_userId: string, agentId: string) =>
    agentId === 'agent-1' ? captain : null,
  listCustomAgents: async () => [],
  deleteCustomAgent: vi.fn(),
}));

const { startCrisisGate } = await import('../../agents/personas/crisis-gate.js');
const { buildAgentChatPrompt, handleAgentChat } = await import('../custom-agent/chat-routes.js');
const { handleJournalRoutes } = await import('../journal-routes.js');

// Lower tier: the gate guides the model rather than replacing its reply.
const GUIDE = 'some nights lately i wish i could just not wake up';
const SPEAKER = 'Captain Nova:';

interface Turn {
  from: 'person' | 'agent';
  text: string;
}

/** The voice turn's decision for these words and earlier turns. */
function voiceAction(text: string, earlier: Turn[] = []) {
  const ctx = llm.ChatContext.empty();
  for (const turn of earlier)
    ctx.addMessage({ role: turn.from === 'person' ? 'user' : 'assistant', content: turn.text });
  ctx.addMessage({ role: 'user', content: text });
  return startCrisisGate(ctx, undefined)?.decision;
}

/** The voice turn's guidance for these words: what the typed route must put last. */
function voiceGuidance(text: string, earlier: Turn[] = []): string {
  const decision = voiceAction(text, earlier);
  if (decision?.action !== 'guide') throw new Error(`expected guide, got ${decision?.action}`);
  return `(${decision.guidance})`;
}

const prompt = (): string => callLLM.mock.calls[0]?.[0] ?? '';
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/**
 * Main's bytes for a guided line mid-conversation, kept exactly: the guidance rode on the
 * message as a "\n\n(…)" text part, and textContent joined the parts with "\n", so three
 * newlines separate the person's words from it.
 */
const mainGuidedTail = (words: string, guidance: string): string =>
  `Them: ${words}\n\n\n${guidance}\n\n${SPEAKER}`;

/** The whole prompt main sent: the guided text in the message slot, no separate note. */
const mainGuidedPrompt = (words: string, guidance: string, history: Turn[] = []): string =>
  buildAgentChatPrompt(captain, history, `${words}\n\n\n${guidance}`, '');

async function chat(body: { message?: string; scene?: string; history?: Turn[] }): Promise<void> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify({ history: [], ...body })));
    req.emit('end');
  }, 0);
  await handleAgentChat(req, res, 'u1', 'agent-1');
}

async function twin(userMessage: string): Promise<void> {
  const url = '/api/journal/twin-response';
  const profile = {
    name: 'Sam',
    mannerisms: ['honestly,'],
    values: ['honesty'],
    communicationStyle: 'direct',
    philosophy: 'keep going',
    passions: [],
  };
  const raw = JSON.stringify({ userMessage, profile, relevantJournals: [], keyThemes: [] });
  const req = Object.assign(Readable.from([Buffer.from(raw)]), {
    url,
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      authorization: 'Bearer tok-sam',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead() {
      return this;
    },
    setHeader: () => {},
    end: () => {},
  };
  await handleJournalRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    url
  );
}

beforeEach(() => callLLM.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe.each(['true', 'false'])('custom-agent chat (CUSTOM_AGENT_CHAT_HONESTY=%s)', (honesty) => {
  beforeEach(() => vi.stubEnv('CUSTOM_AGENT_CHAT_HONESTY', honesty));

  it('opening on a lower-tier scene: the guidance comes after the style line and the opener cue', async () => {
    const guidance = voiceGuidance(GUIDE);
    await chat({ scene: GUIDE });
    const sent = prompt();
    expect(count(sent, guidance)).toBe(1);
    expect(sent.indexOf(guidance)).toBeGreaterThan(sent.indexOf('Reply as Captain Nova only'));
    expect(sent.indexOf(guidance)).toBeGreaterThan(
      sent.indexOf('(Captain Nova opens the conversation.)')
    );
    expect(sent.endsWith(`${guidance}\n\n${SPEAKER}`)).toBe(true);
  });

  it("a lower-tier message: the guidance is last before the speaker cue, in main's bytes", async () => {
    const guidance = voiceGuidance(GUIDE);
    await chat({ message: GUIDE });
    const sent = prompt();
    expect(count(sent, guidance)).toBe(1);
    expect(sent.indexOf(guidance)).toBeGreaterThan(sent.indexOf('Reply as Captain Nova only'));
    expect(sent.endsWith(mainGuidedTail(GUIDE, guidance))).toBe(true);
    expect(sent).toBe(mainGuidedPrompt(GUIDE, guidance));
  });

  it("guided by the earlier turns alone: the guidance is last, in main's bytes", async () => {
    const history: Turn[] = [
      { from: 'person', text: 'sometimes i wish i could just disappear' },
      { from: 'agent', text: 'that sounds heavy. what has the week been like?' },
    ];
    const now = 'soon none of this will matter';
    expect(voiceAction(now)?.action).toBe('pass');
    const guidance = voiceGuidance(now, history);
    await chat({ message: now, history });
    const sent = prompt();
    expect(count(sent, guidance)).toBe(1);
    expect(sent.endsWith(mainGuidedTail(now, guidance))).toBe(true);
    expect(sent).toBe(mainGuidedPrompt(now, guidance, history));
  });
});

// Every production caller of the typed crisis read must thread its guidance into the model's
// prompt; a new caller fails here until a case above proves it does.
describe('the typed crisis read has no other callers', () => {
  it('only the custom-agent chat and the journal twin call readTypedMessageForCrisis', () => {
    const callers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(path);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (readFileSync(path, 'utf8').includes('readTypedMessageForCrisis(')) callers.push(path);
        }
      }
    };
    walk('src');
    expect(callers.sort()).toEqual([
      'src/agents/personas/crisis-gate-text.ts',
      'src/api/custom-agent/chat-routes.ts',
      'src/api/journal-twin-route.ts',
    ]);
  });
});

describe('journal twin', () => {
  it('a lower-tier message: the guidance is the last block, after the style line', async () => {
    const guidance = voiceGuidance(GUIDE);
    await twin(GUIDE);
    const sent = prompt();
    expect(count(sent, guidance)).toBe(1);
    expect(sent.indexOf(guidance)).toBeGreaterThan(
      sent.indexOf('Reply as yourself, in your own voice:')
    );
    expect(sent.endsWith(guidance)).toBe(true);
  });
});
