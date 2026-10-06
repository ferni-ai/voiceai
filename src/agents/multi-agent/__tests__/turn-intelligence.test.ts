import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import {
  createTurnIntelligenceHook,
  resolveTurnIntelligenceMode,
  type TurnIntelligenceDeps,
} from '../turn-intelligence.js';

const persona = {
  id: 'ferni',
  name: 'Ferni',
  displayName: 'Ferni',
} as unknown as TurnIntelligenceDeps['persona'];
const services = {
  sessionId: 'session-test',
  userId: 'user-test',
} as unknown as TurnIntelligenceDeps['services'];
const userData = { turnCount: 3 } as unknown as TurnIntelligenceDeps['userData'];

const userMessage = (text: string) => llm.ChatMessage.create({ role: 'user', content: text });

describe('resolveTurnIntelligenceMode', () => {
  it('is on unless TURN_INTELLIGENCE=off', () => {
    expect(resolveTurnIntelligenceMode({})).toBe('on');
    expect(resolveTurnIntelligenceMode({ TURN_INTELLIGENCE: 'true' })).toBe('on');
    expect(resolveTurnIntelligenceMode({ TURN_INTELLIGENCE: 'on' })).toBe('on');
    expect(resolveTurnIntelligenceMode({ TURN_INTELLIGENCE: 'off' })).toBe('off');
  });
});

describe('createTurnIntelligenceHook', () => {
  it('hands the turn to the turn handler with the session context', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
    const turnCtx = llm.ChatContext.empty();

    await hook(turnCtx, userMessage('  I had a rough day at work  '));

    expect(handle).toHaveBeenCalledTimes(1);
    const ctx = handle.mock.calls[0][0];
    expect(ctx.turnCtx).toBe(turnCtx);
    expect(ctx.userText).toBe('I had a rough day at work');
    expect(ctx.persona).toBe(persona);
    expect(ctx.services).toBe(services);
    expect(ctx.userData.turnCount).toBe(3);
    expect(typeof ctx.sendDataMessage).toBe('function');
  });

  it('skips empty turns', async () => {
    const handle = vi.fn();
    const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
    await hook(llm.ChatContext.empty(), userMessage('   '));
    expect(handle).not.toHaveBeenCalled();
  });

  it('never breaks the reply when the handler fails', async () => {
    const handle = vi.fn().mockRejectedValue(new Error('builder exploded'));
    const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
    await expect(hook(llm.ChatContext.empty(), userMessage('hi'))).resolves.toBeUndefined();
  });

  it('lets StopResponse through so a turn can still suppress the reply', async () => {
    const stop = Object.assign(new Error('stop'), { name: 'StopResponse' });
    const handle = vi.fn().mockRejectedValue(stop);
    const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
    await expect(hook(llm.ChatContext.empty(), userMessage('hi'))).rejects.toBe(stop);
  });
});

describe('turn context pusher', () => {
  const makeAgent = () => {
    let ctx = llm.ChatContext.empty();
    return {
      get chatCtx() {
        return ctx;
      },
      updateChatCtx: vi.fn(async (next: llm.ChatContext) => {
        ctx = next;
      }),
    };
  };
  const texts = (agent: ReturnType<typeof makeAgent>) =>
    agent.chatCtx.items.map((i) => (i as { textContent?: string }).textContent ?? '');
  const noting = (note: (text: string) => string) =>
    vi.fn(async (turnCtx: llm.ChatContext, message: llm.ChatMessage) => {
      turnCtx.addMessage({ role: 'user', content: note(message.textContent ?? '') });
    });

  it('runs the turn handler context-only, so it never speaks or acts', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const hook = createTurnIntelligenceHook({ persona, services, userData, handle });
    await hook(llm.ChatContext.empty(), userMessage('turn off the lights'));
    expect(handle.mock.calls[0][0].contextOnly).toBe(true);
  });

  it('holds the context while Ferni speaks and pushes it when she is listening again', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const pusher = createTurnContextPusher(
      noting(() => '[CONTEXT: they mentioned their dog Biscuit last week]'),
      agent
    );

    await pusher.onAgentState('speaking');
    await pusher.onFinalTranscript('my puppy chewed my shoes again');
    expect(agent.updateChatCtx).not.toHaveBeenCalled();

    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1);
    expect(texts(agent).join('\n')).toContain('Biscuit');
    expect(texts(agent).join('\n')).toContain('not something the user said');

    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1); // nothing new to push
  });

  it('never pushes while the user is speaking', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const pusher = createTurnContextPusher(noting(() => '[CONTEXT: note]'), agent);

    await pusher.onUserState('speaking');
    await pusher.onFinalTranscript('so anyway');
    expect(agent.updateChatCtx).not.toHaveBeenCalled();

    await pusher.onUserState('listening');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous note instead of piling notes up', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const pusher = createTurnContextPusher(noting((text) => `[CONTEXT about: ${text}]`), agent);

    await pusher.onFinalTranscript('first topic');
    await pusher.onAgentState('speaking');
    await pusher.onFinalTranscript('second topic');
    await pusher.onAgentState('listening');

    const notes = texts(agent).filter((t) => t.includes('[CONTEXT about:'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('second topic');
  });

  it('builds on the whole turn: segments accumulate, only the latest run counts', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const hook = noting((text) => `[CONTEXT about: ${text}]`);
    const pusher = createTurnContextPusher(hook, agent);

    await pusher.onUserState('speaking');
    await Promise.all([pusher.onFinalTranscript('I finally'), pusher.onFinalTranscript('quit my job')]);
    await pusher.onUserState('listening');

    expect(hook.mock.calls.at(-1)?.[1].textContent).toBe('I finally quit my job');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1);
    expect(texts(agent).join('\n')).toContain('I finally quit my job');
  });

  it('drops a slower run on part of the turn when a later run already finished', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((resolve) => (releaseFirst = resolve));
    let call = 0;
    const hook = vi.fn(async (turnCtx: llm.ChatContext, message: llm.ChatMessage) => {
      if (++call === 1) await firstDone; // the first run (partial turn) is slow
      turnCtx.addMessage({ role: 'user', content: `[CONTEXT about: ${message.textContent}]` });
    });
    const pusher = createTurnContextPusher(hook, agent);

    await pusher.onUserState('speaking');
    const first = pusher.onFinalTranscript('I finally');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    await pusher.onFinalTranscript('quit my job');
    releaseFirst();
    await first;
    await pusher.onUserState('listening');

    expect(texts(agent).join('\n')).toContain('[CONTEXT about: I finally quit my job]');
    expect(texts(agent).join('\n')).not.toContain('[CONTEXT about: I finally]');
  });

  it('pushes nothing when the turn handler adds no context', async () => {
    const { createTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const pusher = createTurnContextPusher(vi.fn(async () => {}), agent);
    await pusher.onFinalTranscript('hi');
    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).not.toHaveBeenCalled();
  });
});
