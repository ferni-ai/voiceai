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
import {
  afterPreemptive,
  heldForPreemptive,
  MAX_WAIT_MS,
  preemptStableMode,
} from '../preempt-stable-context.js';

const inFlight = () => ({ _agentActivity: { _preemptiveGeneration: { info: {} } } });
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
    const activity = { _preemptiveGeneration: { info: {} } as unknown, updateTools: vi.fn() };
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

  it('off: the agent tools change inside the preemptive reply (it is dropped at the commit)', async () => {
    const r = await underPreemptive('off');
    expect(r.offered).toEqual(['getWeather']);
    expect(r.activity.updateTools).toHaveBeenCalledTimes(1);
  });

  it('on: the request still leaves them out; the agent closes them once the reply is decided', async () => {
    const r = await underPreemptive('on');
    expect(r.offered).toEqual(['getWeather']);
    expect(r.activity.updateTools).not.toHaveBeenCalled();
    r.activity._preemptiveGeneration = undefined;
    await vi.waitFor(() => expect(r.activity.updateTools).toHaveBeenCalledTimes(1));
    const closed = r.activity.updateTools.mock.calls[0]![0] as Array<{ name?: string }>;
    expect(closed.map((t) => t.name)).not.toContain('callOnBehalf');
  });
});
