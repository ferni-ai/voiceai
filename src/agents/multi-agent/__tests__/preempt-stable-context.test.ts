/**
 * PREEMPT_STABLE_CONTEXT: held writes run once the preemptive reply is decided,
 * never later than MAX_WAIT_MS, and nothing changes with the flag off. The tool
 * closure for an unverified caller (14 real prod drops, 2026-10-15..22) waits too.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { toolsForTurn } from '../../personas/turn-request.js';
import { injectTurnContext } from '../../processors/turn-processor/inject-context.js';
import { createTurnContextPusher } from '../turn-intelligence.js';
import {
  afterPreemptive,
  heldForPreemptive,
  MAX_WAIT_MS,
  preemptStableMode,
  restartPreemptive,
} from '../preempt-stable-context.js';

const inFlight = () => ({
  _agentActivity: { _preemptiveGeneration: { info: {} } as unknown, _preemptiveGenerationCount: 1 },
});
const settle = (agent: { _agentActivity: { _preemptiveGeneration?: unknown } }) => {
  agent._agentActivity._preemptiveGeneration = undefined;
};
const ON = { PREEMPT_STABLE_CONTEXT: 'on' };

describe('preempt-stable-context', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PREEMPT_STABLE_CONTEXT;
  });

  it('reads off unless on or defer', () => {
    expect(preemptStableMode({})).toBe('off');
    expect(preemptStableMode({ PREEMPT_STABLE_CONTEXT: 'yes' })).toBe('off');
    expect(preemptStableMode(ON)).toBe('on');
    expect(preemptStableMode({ PREEMPT_STABLE_CONTEXT: ' Defer ' })).toBe('defer');
  });

  it('off: writes at once even under a preemptive reply, and holds nothing', () => {
    const write = vi.fn();
    expect(afterPreemptive(inFlight(), 'x', write, {})).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    const retry = vi.fn();
    expect(heldForPreemptive(inFlight(), 'x', retry, {})).toBe(false);
    expect(retry).not.toHaveBeenCalled();
  });

  it('on, nothing in flight: the writer goes ahead itself', () => {
    const retry = vi.fn();
    expect(heldForPreemptive({ _agentActivity: {} }, 'x', retry, ON)).toBe(false);
    expect(retry).not.toHaveBeenCalled();
  });

  it('on: held until the reply is decided, then every held write runs in order', () => {
    vi.useFakeTimers();
    const agent = inFlight();
    const ran: string[] = [];
    expect(afterPreemptive(agent, 'a', () => ran.push('a'), ON)).toBe(true);
    expect(afterPreemptive(agent, 'b', () => ran.push('b'), ON)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(ran).toEqual([]);
    settle(agent);
    vi.advanceTimersByTime(60);
    expect(ran).toEqual(['a', 'b']);
  });

  it('on: a turn that never commits still gets its write after MAX_WAIT_MS', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    afterPreemptive(inFlight(), 'a', write, ON);
    vi.advanceTimersByTime(MAX_WAIT_MS - 100);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('restartPreemptive when LiveKit does not start a new reply', () => {
  it('puts the running reply’s transcript back, so the commit can still keep it', () => {
    const info = { newTranscript: 'I went to see my sister.', startedSpeakingAt: Date.now() };
    const running = { info };
    const activity = {
      _preemptiveGeneration: running,
      _preemptiveGenerationCount: 1,
      onPreemptiveGeneration: vi.fn(), // returns early, as on a guard LiveKit checks and we don't
    };
    expect(restartPreemptive({ _agentActivity: activity }, 'I went to see my sister.')).toBe(false);
    expect(activity.onPreemptiveGeneration).toHaveBeenCalledWith(info);
    expect(activity._preemptiveGeneration).toBe(running);
    expect(running.info).toBe(info); // not left answering ''
  });
});

describe('the tool closure for a caller who is not a verified owner', () => {
  afterEach(() => {
    delete process.env.PREEMPT_STABLE_CONTEXT;
  });

  const tool = (name: string) =>
    llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });

  async function underPreemptive(mode: string) {
    process.env.PREEMPT_STABLE_CONTEXT = mode;
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: new llm.ToolContext(
        ['callOnBehalf', 'getWeather'].map(tool)
      ) as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const activity = {
      _preemptiveGeneration: { info: {} } as unknown,
      _preemptiveGenerationCount: 1,
      updateTools: vi.fn(),
    };
    (agent as unknown as { _agentActivity: unknown })._agentActivity = activity;
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Can you call my buddy?' });
    const offered = await toolsForTurn(
      { userData: { userId: 'anon:7c2e', services: { sessionId: `s-${mode}` } } },
      chat,
      agent.toolCtx as unknown as llm.ToolContext,
      { loggedLockedHandoffs: false, agent }
    );
    return { offered: Object.keys(offered.functionTools), activity };
  }

  for (const mode of ['off', 'on', 'defer']) {
    it(`${mode}: closed on the agent at once, even under a preemptive reply`, async () => {
      // LiveKit copies the tools when a generation starts and runs calls against that copy,
      // so a kept preemptive reply must never start from tools a held closure left open.
      const r = await underPreemptive(mode);
      expect(r.offered).toEqual(['getWeather']);
      expect(r.activity.updateTools).toHaveBeenCalledTimes(1);
      const closed = r.activity.updateTools.mock.calls[0]![0] as Array<{ name?: string }>;
      expect(closed.map((t) => t.name)).toEqual(['getWeather']);
    });
  }
});

describe('a safety note waiting for Ferni to listen', () => {
  afterEach(() => {
    delete process.env.PREEMPT_STABLE_CONTEXT;
  });

  /** The pusher with a plain agent; the second final transcript's note is ordinary context. */
  async function overwrite(mode: string): Promise<string> {
    process.env.PREEMPT_STABLE_CONTEXT = mode;
    let ctx = llm.ChatContext.empty();
    const agent = {
      get chatCtx() {
        return ctx;
      },
      updateChatCtx: async (next: llm.ChatContext) => {
        ctx = next;
      },
    };
    let calls = 0;
    const hook = async (turnCtx: llm.ChatContext) => {
      calls += 1;
      const injections =
        calls === 1
          ? [
              {
                category: 'crisis_response',
                content: '[CRISIS SUPPORT]\nValidate first.',
                priority: 98,
              },
            ]
          : [{ category: 'memory', content: 'They love hiking.', priority: 50 }];
      injectTurnContext(turnCtx, { context: { injections } } as never);
    };
    const pusher = createTurnContextPusher(hook, agent as never);
    await pusher.onAgentState('speaking'); // not listening: the note waits
    await pusher.onFinalTranscript('I can’t do this anymore.');
    await pusher.onFinalTranscript('Anyway, I went hiking.');
    await pusher.onAgentState('listening');
    return ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');
  }

  it('off (as before): the later note replaces it', async () => {
    expect(await overwrite('off')).not.toContain('[CRISIS SUPPORT]');
  });

  it('on: kept ahead of the later note, so it still lands', async () => {
    const pushed = await overwrite('on');
    expect(pushed).toContain('[CRISIS SUPPORT]');
    expect(pushed).toContain('They love hiking.');
  });
});
