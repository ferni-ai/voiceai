/**
 * gameState reaches a live call only with GAME_STATE=on: it is in the tools a
 * call's first agent gets (buildEssentialToolSet, capped like agent-setup.ts),
 * and a call through the SDK's own dispatcher (performToolExecutions, as
 * agent_activity.js runs it) keeps the game on that call's session, the object
 * turn-request.ts reads the per-turn note from.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const profile = { subscription: { tier: 'free' } };

/** The first agent's tools for a call, capped like agent-setup.ts, with GAME_STATE as given. */
async function firstAgentTools(gameState: string): Promise<Record<string, unknown>> {
  vi.resetModules();
  vi.stubEnv('GAME_STATE', gameState);
  const { buildEssentialToolSet } = await import('../../agents/multi-agent/essential-tool-set.js');
  const { resolveInitialToolLimit } = await import('../../agents/multi-agent/initial-tools.js');
  const { capToolsToLimit, getMaxTools } = await import('../../config/tool-config.js');
  const { tools } = await buildEssentialToolSet({
    personaId: 'ferni',
    userId: 'test-user',
    services: { userProfile: profile } as never,
  });
  return capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools())) as Record<string, unknown>;
}

async function dispatch(
  session: object,
  toolCtx: Record<string, unknown>,
  args: Record<string, unknown>
): Promise<string> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (
      opts: unknown
    ) => [{ result: Promise<unknown> }, { output: Array<{ toolCallOutput?: { output: string } }> }];
  };
  const call = llm.FunctionCall.create({
    callId: `call-${Math.random()}`,
    name: 'gameState',
    args: JSON.stringify(args),
  });
  const [task, out] = performToolExecutions({
    session,
    speechHandle: { id: 'speech-1', numSteps: 1 },
    toolCtx,
    toolChoice: 'auto',
    toolCallStream: new ReadableStream({
      start(controller) {
        controller.enqueue(call);
        controller.close();
      },
    }),
    controller: new globalThis.AbortController(),
  });
  await task.result;
  const result = out.output[0]?.toolCallOutput?.output;
  if (result === undefined) throw new Error('the dispatcher produced no output');
  return result;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('gameState on the live path', () => {
  it('is not in a call’s tools with the flag off', async () => {
    expect(Object.keys(await firstAgentTools(''))).not.toContain('gameState');
  }, 60_000);

  it('is in a call’s tools with GAME_STATE=on, and keeps the game on the call’s session', async () => {
    const tools = await firstAgentTools('on');
    expect(Object.keys(tools)).toContain('gameState');

    const { gameTurnNote } = await import('../../services/games/call-game-state.js');
    const { PersonaVoiceAgent } = await import('../../agents/personas/ferni-agent.js');
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: tools as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = { userData: { services: { userProfile: profile } }, currentAgent: agent };
    const other = { userData: {} };
    const toolCtx = agent.toolCtx as unknown as Record<string, unknown>;
    await dispatch(session, toolCtx, { action: 'start', gameType: 'trivia' });
    await dispatch(session, toolCtx, {
      action: 'update',
      used: 'Capital of Peru?',
      nextTurn: true,
    });
    const note = gameTurnNote(session);
    expect(note).toContain('Game on: trivia');
    expect(note).toContain('Capital of Peru?');
    expect(gameTurnNote(other)).toBe('');
  }, 60_000);
});
