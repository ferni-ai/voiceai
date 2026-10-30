/**
 * A tool call that reads a linked account's token says WHOSE token ran on its
 * "Tool execution tracked" line, as a keyed hash, never the uid (integration
 * plan lane S3: every end-to-end proof greps these lines). Runs the real seams:
 * perCallerTool scopes the call, Google Calendar's getValidAccessToken reports
 * the read, the tracking handler writes the line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => {
  process.env.LOG_HASH_SECRET = 'test-log-hash-secret';
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
  return {
    handler: undefined as undefined | ((event: unknown) => void),
    tracked: [] as Array<Record<string, unknown>>,
    pending: [] as Array<Promise<unknown>>,
    tokens: new Map<string, Record<string, unknown>>(),
  };
});

vi.mock('@livekit/agents', () => ({
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  voice: { AgentSessionEventTypes: { FunctionToolsExecuted: 'function_tools_executed' } },
}));
vi.mock('../../../services/diagnostic-logger.js', () => ({
  diag: {
    tool: (message: string, data: Record<string, unknown>) => {
      if (message === 'Tool execution tracked') world.tracked.push(data);
    },
  },
}));
vi.mock('../../../utils/safe-fire-and-forget.js', () => ({
  fireAndForget: (work: () => Promise<unknown>) => world.pending.push(work()),
}));
vi.mock('../../../intelligence/capability-learning.js', () => ({ onToolExecuted: vi.fn() }));
vi.mock('../../../tools/execution/index.js', () => ({
  startToolPresence: vi.fn(),
  stopToolPresence: vi.fn(),
}));
vi.mock('../../../intelligence/context-builders/awareness/tool-timing-awareness.js', () => ({
  recordToolTiming: vi.fn(),
}));
vi.mock('../../../services/analytics/tool-usage-analytics.js', () => ({
  recordToolUsage: vi.fn(),
}));
vi.mock('../../../tools/deprecation.js', () => ({ deprecationService: { recordUsage: vi.fn() } }));
vi.mock('../../../tools/optimization/pattern-analyzer.js', () => ({
  patternAnalyzer: { recordToolCall: vi.fn() },
}));
vi.mock('../../../tools/optimization/auto-optimizer.js', () => ({
  autoOptimizer: { recordToolExecution: vi.fn() },
}));
vi.mock('../../model-provider/index.js', () => ({ getModelProvider: () => ({ id: 'gemini' }) }));
vi.mock('../tool-result-speech.js', () => ({ needsExplicitToolResultReply: () => false }));
// The encrypted Firestore store; everything above it in the read path is real.
vi.mock('../../../services/identity/google-calendar-token-store.js', () => ({
  getTokens: async (uid: string) => world.tokens.get(uid),
  saveTokens: vi.fn(async () => undefined),
  removeTokens: vi.fn(async () => undefined),
  peekTokens: (uid: string) => world.tokens.get(uid),
  listTokenUsers: vi.fn(async () => []),
}));

import { bqHash } from '../../../services/analytics/bq-events.js';
import {
  clearFailedTokenStatus,
  getValidAccessToken,
} from '../../../services/identity/google-calendar-oauth.js';
import { perCallerTool } from '../../../tools/registry/per-caller-tool.js';
import type { ToolContext, ToolDefinition } from '../../../tools/registry/types.js';
import { setupToolTrackingHandler } from '../tool-tracking-handler.js';

const SETH = 'uid-seth-7f3a';
const MOM = 'uid-mom-91c2';
const HOUR = 3_600_000;

/** A calendar read: runs as the call's caller and reads that caller's Google token. */
const checkCalendar = perCallerTool(
  {
    id: 'checkCalendar',
    name: 'Check calendar',
    description: 'Read the caller calendar',
    domain: 'calendar',
    create: (ctx: ToolContext) => ({
      description: 'Read the caller calendar',
      execute: async () =>
        (await getValidAccessToken(ctx.userId)) ? 'You have 2 events.' : 'No calendar.',
    }),
  } as unknown as ToolDefinition,
  {} as never
);

/** One LLM turn's tool calls, executed the way LiveKit does, then the tracked lines. */
async function turn(calls: Array<{ callId: string; caller: string }>) {
  const outputs = await Promise.all(
    calls.map(async ({ callId, caller }) => ({
      name: 'checkCalendar',
      callId,
      output: String(
        await checkCalendar.execute(
          {},
          { toolCallId: callId, ctx: { userData: { userId: caller } } }
        )
      ),
    }))
  );
  world.tracked.length = 0;
  world.handler?.({ functionCallOutputs: outputs });
  await Promise.all(world.pending.splice(0));
  return world.tracked;
}

beforeEach(() => {
  world.tokens.clear();
  for (const uid of [SETH, MOM]) clearFailedTokenStatus(uid);
  world.handler = undefined;
  world.pending.length = 0;
  setupToolTrackingHandler({
    session: {
      on: (_event: string, handler: (event: unknown) => void) => {
        world.handler = handler;
      },
    },
    userData: { conversationState: { recordToolCall: vi.fn() } },
    services: { userId: SETH, sessionId: 's1' },
    sessionPersona: { id: 'ferni' },
    sessionId: 's1',
  } as unknown as Parameters<typeof setupToolTrackingHandler>[0]);
});

afterEach(() => vi.unstubAllGlobals());

describe('Tool execution tracked: whose linked token ran', () => {
  it("a calendar read carries the hash of the token owner's uid, and each caller gets their own", async () => {
    for (const uid of [SETH, MOM]) {
      world.tokens.set(uid, {
        access_token: `ya29.${uid}`,
        refresh_token: 'r',
        expires_at: Date.now() + HOUR,
      });
    }

    const [seth, mom] = await turn([
      { callId: 'call-1', caller: SETH },
      { callId: 'call-2', caller: MOM },
    ]);

    expect(seth).toMatchObject({
      tool: 'checkCalendar',
      link_provider: 'google_calendar',
      link_uid_tag: bqHash('user', SETH),
      link_state: 'connected',
    });
    expect(mom).toMatchObject({ link_uid_tag: bqHash('user', MOM), link_state: 'connected' });
    expect(seth.link_uid_tag).toMatch(/^[0-9a-f]{32}$/);
    expect(seth.link_uid_tag).not.toBe(mom.link_uid_tag);
  });

  it('never logs the uid itself', async () => {
    world.tokens.set(SETH, {
      access_token: 'ya29.x',
      refresh_token: 'r',
      expires_at: Date.now() + HOUR,
    });

    const [line] = await turn([{ callId: 'call-1', caller: SETH }]);

    expect(line.link_uid_tag).toBeTruthy();
    expect(JSON.stringify(line)).not.toContain(SETH);
    expect(JSON.stringify(line)).not.toContain('7f3a');
  });

  it('an expired link with no refresh token shows as needs_reauth', async () => {
    world.tokens.set(SETH, {
      access_token: 'ya29.old',
      refresh_token: '',
      expires_at: Date.now() - HOUR,
    });

    const [line] = await turn([{ callId: 'call-1', caller: SETH }]);

    expect(line).toMatchObject({ link_uid_tag: bqHash('user', SETH), link_state: 'needs_reauth' });
  });

  it('a grant Google says is revoked (invalid_grant) shows as needs_reauth', async () => {
    world.tokens.set(MOM, {
      access_token: 'ya29.old',
      refresh_token: 'r-mom',
      expires_at: Date.now() - HOUR,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }))
    );

    const [line] = await turn([{ callId: 'call-1', caller: MOM }]);

    expect(line).toMatchObject({ link_uid_tag: bqHash('user', MOM), link_state: 'needs_reauth' });
  });

  it('a caller with no link shows as not_connected', async () => {
    const [line] = await turn([{ callId: 'call-1', caller: SETH }]);

    expect(line).toMatchObject({ link_provider: 'google_calendar', link_state: 'not_connected' });
  });

  it('a tool that read no linked token has no link fields', async () => {
    world.tracked.length = 0;
    world.handler?.({
      functionCallOutputs: [{ name: 'getWeather', callId: 'w1', output: 'Sunny.' }],
    });
    await Promise.all(world.pending.splice(0));

    expect(world.tracked[0]).not.toHaveProperty('link_uid_tag');
    expect(world.tracked[0]).not.toHaveProperty('link_state');
  });
});
