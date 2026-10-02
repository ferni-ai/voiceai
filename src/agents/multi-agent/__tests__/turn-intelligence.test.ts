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
  it('is off unless TURN_INTELLIGENCE=on', () => {
    expect(resolveTurnIntelligenceMode({})).toBe('off');
    expect(resolveTurnIntelligenceMode({ TURN_INTELLIGENCE: 'true' })).toBe('off');
    expect(resolveTurnIntelligenceMode({ TURN_INTELLIGENCE: 'on' })).toBe('on');
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

describe('realtime turn context', () => {
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

  it('detects sessions whose model replies without onUserTurnCompleted', async () => {
    const { usesServerTurnDetection } = await import('../turn-intelligence.js');
    expect(usesServerTurnDetection({ llm: { capabilities: { turnDetection: true } } })).toBe(true);
    expect(usesServerTurnDetection({ llm: { capabilities: { turnDetection: false } } })).toBe(
      false
    );
    expect(usesServerTurnDetection({})).toBe(false);
  });

  it('holds the turn context and pushes it only when the agent is listening again', async () => {
    const { createRealtimeTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const hook = vi.fn(async (turnCtx: llm.ChatContext) => {
      turnCtx.addMessage({
        role: 'user',
        content: '[CONTEXT: they mentioned their dog Biscuit last week]',
      });
    });
    const pusher = createRealtimeTurnContextPusher(hook, agent);

    await pusher.onFinalTranscript('my puppy chewed my shoes again');
    await pusher.onAgentState('speaking');
    expect(agent.updateChatCtx).not.toHaveBeenCalled();

    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1);
    const pushed = agent.chatCtx.items
      .map((i) => (i as { textContent?: string }).textContent)
      .join('\n');
    expect(pushed).toContain('Biscuit');
    expect(pushed).toContain('not something the user said');

    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1); // nothing new to push
  });

  it('pushes nothing when the turn handler adds no context', async () => {
    const { createRealtimeTurnContextPusher } = await import('../turn-intelligence.js');
    const agent = makeAgent();
    const pusher = createRealtimeTurnContextPusher(
      vi.fn(async () => {}),
      agent
    );
    await pusher.onFinalTranscript('hi');
    await pusher.onAgentState('listening');
    expect(agent.updateChatCtx).not.toHaveBeenCalled();
  });
});
