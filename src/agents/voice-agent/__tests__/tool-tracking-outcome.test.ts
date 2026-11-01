/**
 * "Tool execution tracked" carries an `outcome` for music tools, so a reply
 * that says Spotify isn't connected stops counting as a success (the agent
 * counts a tool error only when the tool throws: integration audit,
 * 2026-10-29, 11 prod music calls all fine on paper, all 30-second previews).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  handler: undefined as undefined | ((event: unknown) => void),
  tracked: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Promise<unknown>>,
}));

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

import { setupToolTrackingHandler } from '../tool-tracking-handler.js';

async function execute(outputs: Array<{ name: string; output: string; isError?: boolean }>) {
  world.tracked.length = 0;
  world.handler?.({ functionCallOutputs: outputs });
  await Promise.all(world.pending.splice(0));
  return world.tracked;
}

beforeEach(() => {
  world.handler = undefined;
  world.pending.length = 0;
  setupToolTrackingHandler({
    session: {
      on: (_event: string, handler: (event: unknown) => void) => {
        world.handler = handler;
      },
    },
    userData: { conversationState: { recordToolCall: vi.fn() } },
    services: { userId: 'u1', sessionId: 's1' },
    sessionPersona: { id: 'ferni' },
    sessionId: 's1',
  } as unknown as Parameters<typeof setupToolTrackingHandler>[0]);
});

describe('Tool execution tracked: outcome', () => {
  it('a music reply that says Spotify is not connected is unavailable, not a success', async () => {
    const [line] = await execute([
      {
        name: 'playMusic',
        output: JSON.stringify({
          spotify: 'unavailable',
          reason: 'revoked',
          say: "Spotify isn't connected right now, so I can only play short previews. Want a preview?",
        }),
      },
    ]);

    expect(line).toMatchObject({ tool: 'playMusic', hasError: false, outcome: 'unavailable' });
  });

  it('a music reply that played a track is ok', async () => {
    const [line] = await execute([
      { name: 'playMusic', output: 'Here\'s "Sunny Strum" by Luke Gaul!' },
    ]);

    expect(line).toMatchObject({ hasError: false, outcome: 'ok' });
  });

  it('a tool that failed is error', async () => {
    const [line] = await execute([{ name: 'playMusic', output: 'boom', isError: true }]);

    expect(line).toMatchObject({ hasError: true, outcome: 'error' });
  });

  it('another tool gets no ok verdict nobody checked', async () => {
    const [line] = await execute([{ name: 'getWeather', output: 'Right now it is 70.' }]);

    expect(line.outcome).toBeUndefined();
  });
});
