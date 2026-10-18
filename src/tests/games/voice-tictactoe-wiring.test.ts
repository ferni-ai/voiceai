/**
 * VOICE_TICTACTOE=on: tic-tac-toe by voice plays on the real board engine.
 *
 * The games audit (2026-10-18) found the text-game tools cut from every call by
 * the first agent's 64-slot cap, so Ferni improvised the board, took a move onto
 * his own square and described the board wrong. This drives the whole path:
 * the call's first tools (buildEssentialToolSet, capped like agent-setup.ts),
 * a later topic load through the session's real DynamicToolLoader and
 * updateAgentTools, the SDK's own tool dispatcher (performToolExecutions, as
 * agent_activity.js runs it) and the real TextGameEngine.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const profile = { subscription: { tier: 'free' } };
const TTT_TOOLS = ['startTextGame', 'makeTextGameMove', 'getTextGameBoard', 'endTextGame'];

/** The first agent's tools for a call, capped like agent-setup.ts, with VOICE_TICTACTOE as given. */
async function firstAgentTools(flag: string): Promise<Record<string, unknown>> {
  vi.resetModules();
  vi.stubEnv('VOICE_TICTACTOE', flag);
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

/** Runs one tool call through the SDK's dispatcher, as a live turn does. */
async function dispatch(
  session: object,
  toolCtx: Record<string, unknown>,
  name: string,
  args: Record<string, unknown> = {}
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
    name,
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

async function agentWith(tools: Record<string, unknown>) {
  const { PersonaVoiceAgent } = await import('../../agents/personas/ferni-agent.js');
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: tools as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('tic-tac-toe on the live path', () => {
  it('is not in a call’s tools with the flag off (as the audit found)', async () => {
    const names = Object.keys(await firstAgentTools(''));
    for (const tool of TTT_TOOLS) expect(names).not.toContain(tool);
  }, 60_000);

  it('plays on the engine’s board by voice with VOICE_TICTACTOE=on, and refuses an occupied square', async () => {
    const tools = await firstAgentTools('on');
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(TTT_TOOLS));

    const agent = await agentWith(tools);
    const sessionId = `ttt-${Math.random()}`;
    const session = {
      userData: { services: { userProfile: profile, sessionId } },
      currentAgent: agent,
    };
    const toolCtx = agent.toolCtx as unknown as Record<string, unknown>;
    const { getSessionTextGameEngine } = await import('../../services/games/text-game-engine.js');
    const engine = () => getSessionTextGameEngine(sessionId);

    const started = await dispatch(session, toolCtx, 'startTextGame', { gameType: 'tic-tac-toe' });
    expect(started).toContain('The board now (from the game');
    expect(started).toContain('Top row: empty, empty, empty');

    const moved = await dispatch(session, toolCtx, 'makeTextGameMove', { move: 'center' });
    const board = engine().describeState();
    expect(board).toMatch(/Middle row: \w+, X, \w+/);
    expect(moved).toContain(board); // the model hears the engine's board, not its own

    // The caller's own square, then Ferni's square: both refused, the board unchanged.
    const again = await dispatch(session, toolCtx, 'makeTextGameMove', { move: 'center' });
    expect(again).toContain('already taken');
    const cells = (engine().getState().gameData as { board: { cells: Array<string | null> } }).board
      .cells;
    const ferniSquare = cells.indexOf('O') + 1;
    expect(ferniSquare).toBeGreaterThan(0);
    const onFerni = await dispatch(session, toolCtx, 'makeTextGameMove', {
      move: String(ferniSquare),
    });
    expect(onFerni).toContain('already taken');
    expect(engine().describeState()).toBe(board);

    expect(await dispatch(session, toolCtx, 'getTextGameBoard')).toContain(board);
    expect(await dispatch(session, toolCtx, 'endTextGame')).toContain('game ended');
    expect(engine().isGameActive()).toBe(false);
  }, 60_000);

  it('keeps the board between moves only under the call’s session, and fails closed without one', async () => {
    const tools = await firstAgentTools('on');
    const agent = await agentWith(tools);
    const toolCtx = agent.toolCtx as unknown as Record<string, unknown>;
    const noSession = { userData: { services: { userProfile: profile } }, currentAgent: agent };
    const started = await dispatch(noSession, toolCtx, 'startTextGame', {
      gameType: 'tic-tac-toe',
    });
    expect(started).toContain("can't keep a game board on this call");
    expect(await dispatch(noSession, toolCtx, 'makeTextGameMove', { move: 'center' })).toContain(
      "can't keep a game board on this call"
    );
  }, 60_000);

  it('keeps the tic-tac-toe tools when a later topic loads more tools mid-call', async () => {
    const tools = await firstAgentTools('on');
    const agent = await agentWith(tools);
    const { createSessionToolLoader } = await import('../../tools/dynamic-loader/index.js');
    const { updateAgentTools } = await import('../../agents/shared/tool-updater.js');
    const loader = createSessionToolLoader({ enableAutoUnload: false });
    await loader.initialize({
      userId: 'test-user',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      sessionId: 'ttt-topic',
      services: undefined as never,
    });
    const loaded = await loader.processMessage("what's the weather and the news today");
    expect(loaded.length).toBeGreaterThan(0);
    await updateAgentTools(agent as never, loader.getToolsForDomains(loaded), { domains: loaded });
    await updateAgentTools(agent as never, loader.getCurrentTools());
    expect(Object.keys(agent.toolCtx.functionTools)).toEqual(expect.arrayContaining(TTT_TOOLS));
    loader.shutdown();
  }, 60_000);
});

describe('the games tools key each game by the call', () => {
  async function tool(id: string, sessionId?: string) {
    const { createGameToolDefinitions } = await import('../../tools/domains/games/index.js');
    const def = createGameToolDefinitions().find((d) => d.id === id);
    if (!def) throw new Error(`no ${id}`);
    const ctx = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni', sessionId };
    return def.create(ctx as never) as unknown as {
      execute: (args: unknown, run: unknown) => Promise<string>;
    };
  }

  it('fails closed with no session instead of starting a board it loses on the next move', async () => {
    const run = { ctx: { userData: {} } };
    const start = await (await tool('startTextGame')).execute({ gameType: 'tic-tac-toe' }, run);
    expect(start).toContain("can't keep a game board on this call");
    const move = await (await tool('makeTextGameMove')).execute({ move: 'center' }, run);
    expect(move).toContain("can't keep a game board on this call");
  });

  it('keeps the board between moves under the tool context’s session id', async () => {
    const run = { ctx: { userData: {} } };
    const id = `ctx-${Math.random()}`;
    await (await tool('startTextGame', id)).execute({ gameType: 'tic-tac-toe' }, run);
    const move = await (await tool('makeTextGameMove', id)).execute({ move: 'center' }, run);
    expect(move).toMatch(/Middle row: \w+, X, \w+/);
  });
});
