/**
 * The journal twin reply reads crisis before anything else (POST /api/journal/twin-response).
 *
 * The person's message went straight to "you are their past self": a crisis message got a reply
 * in their own voice and no crisis help. It now goes through the voice reply's crisis gate first. The
 * twin keeps no conversation, so each message is read on its own. Fictional profile and lines.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRISIS_HELDOUT } from '../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_CONTEXTUAL } from '../../agents/__tests__/fixtures/crisis-contextual.js';

const order: string[] = [];
const { callLLM } = vi.hoisted(() => ({
  callLLM: vi.fn(
    async (_prompt: string, _options?: unknown) => 'honestly, I remember.' as string | null
  ),
}));

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
vi.mock('../../services/llm-utils.js', () => ({ callLLM }));
vi.mock('../../services/journal/index.js', () => ({
  getJournalService: () => ({
    getAllEntries: async () => {
      order.push('db-read');
      return [];
    },
  }),
}));
vi.mock('../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: async () => {
    order.push('db-read');
    return null;
  },
  listCustomAgents: async () => {
    order.push('db-read');
    return [
      {
        id: 'twin-1',
        type: 'twin',
        name: 'Sam',
        displayName: 'Sam',
        personality: { values: ['honesty'], passions: [] },
        behaviors: { catchphrases: ['honestly,'] },
      },
    ];
  },
}));
vi.mock('../../agents/personas/crisis-gate.js', async (real) => {
  const gate = await real<typeof import('../../agents/personas/crisis-gate.js')>();
  return {
    ...gate,
    startCrisisGate: (...args: Parameters<typeof gate.startCrisisGate>) => {
      order.push('crisis');
      return gate.startCrisisGate(...args);
    },
  };
});

const { startCrisisGate } = await import('../../agents/personas/crisis-gate.js');
const { generateTwinResponse } = await import('../../services/custom-agent/twin-reply.js');
const { handleJournalRoutes } = await import('../journal-routes.js');

const profile = {
  name: 'Sam',
  mannerisms: ['honestly,'],
  values: ['honesty'],
  communicationStyle: 'direct',
  philosophy: 'keep going',
  passions: [],
};

const BLOCK = 'standing on the bridge rn. just wanted to tell someone before i jump';
const GUIDE = "i kinda wish i just wouldn't wake up tomorrow";
const PLAIN = 'do you remember the trip to the lake last spring?';

async function twin(body: Record<string, unknown>) {
  const url = '/api/journal/twin-response';
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url,
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      authorization: 'Bearer tok-sam',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let raw = '{}';
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead(code: number) {
      status = code;
      return this;
    },
    setHeader: () => {},
    end: (data?: string) => (raw = data ?? '{}'),
  };
  await handleJournalRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    url
  );
  return {
    status: status || res.statusCode,
    body: JSON.parse(raw) as { response?: string; crisis?: boolean },
  };
}

/** The voice turn's decision for the same words. */
function voiceDecision(text: string) {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  const gate = startCrisisGate(ctx, undefined);
  if (!gate) throw new Error('the voice crisis gate is off');
  return gate.decision;
}

const prompt = () => callLLM.mock.calls[0]?.[0] ?? '';

/** The prompt the twin is asked with for these exact words, with no crisis read. */
async function twinPromptFor(userMessage: string): Promise<string> {
  callLLM.mockClear();
  await generateTwinResponse({ userMessage, profile, relevantJournals: [], keyThemes: [] });
  const sent = prompt();
  callLLM.mockClear();
  return sent;
}

beforeEach(() => {
  order.length = 0;
  callLLM.mockClear();
  callLLM.mockImplementation(async () => {
    order.push('llm');
    return 'honestly, I remember.';
  });
});

describe('journal twin reply: the crisis read', () => {
  it('runs before the twin or the journal is read and before the model', async () => {
    const { status } = await twin({ userMessage: GUIDE, agentId: null });
    expect(status).toBe(200);
    expect(order).toEqual(['crisis', 'db-read', 'db-read', 'llm']);
  });

  it("block: the voice turn's crisis reply, crisis: true, and nothing read or asked", async () => {
    const voice = voiceDecision(BLOCK);
    expect(voice.action).toBe('replace');
    order.length = 0;
    const { status, body } = await twin({ userMessage: BLOCK, agentId: null });
    expect(status).toBe(200);
    expect(body).toEqual({ response: voice.action === 'replace' && voice.script, crisis: true });
    expect(order).toEqual(['crisis']);
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("lower tier: the twin is asked with the voice turn's guidance", async () => {
    const voice = voiceDecision(GUIDE);
    expect(voice.action).toBe('guide');
    const { body } = await twin({ userMessage: GUIDE, profile });
    expect(body).toEqual({ response: 'honestly, I remember.' });
    expect(prompt()).toContain(GUIDE);
    expect(prompt()).toContain(`(${voice.action === 'guide' && voice.guidance})`);
  });

  it('no crisis: the twin gets the same prompt as before', async () => {
    const expected = await twinPromptFor(PLAIN);
    const { body } = await twin({ userMessage: PLAIN, profile });
    expect(body).toEqual({ response: 'honestly, I remember.' });
    expect(prompt()).toBe(expected);
  });

  it('never lower than the voice turn, line for line', async () => {
    const lines = [
      ...CRISIS_HELDOUT.map((row) => row.text),
      ...CRISIS_CONTEXTUAL.map((row) => row.text),
    ];
    const tiers = { replace: 0, guide: 0, pass: 0 };
    const mismatches: string[] = [];
    for (const text of lines) {
      const voice = voiceDecision(text);
      // eslint-disable-next-line no-await-in-loop -- one line at a time: the model spy is shared
      const unread = voice.action === 'pass' ? await twinPromptFor(text) : '';
      // eslint-disable-next-line no-await-in-loop -- one line at a time: the model spy is shared
      const { body } = await twin({ userMessage: text, profile });
      const same =
        voice.action === 'replace'
          ? body.crisis === true &&
            body.response === voice.script &&
            callLLM.mock.calls.length === 0
          : voice.action === 'guide'
            ? !body.crisis && prompt().includes(`(${voice.guidance})`)
            : !body.crisis && prompt() === unread;
      tiers[voice.action] += 1;
      if (!same) mismatches.push(`${voice.action}: ${text}`);
      callLLM.mockClear();
    }
    if (process.env.CRISIS_TIER_TABLE)
      process.stderr.write(
        `twin tiers n=${lines.length} ${JSON.stringify(tiers)} mismatches=${mismatches.length}\n`
      );
    expect(lines.length).toBeGreaterThanOrEqual(100);
    expect(Math.min(tiers.replace, tiers.guide, tiers.pass)).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
