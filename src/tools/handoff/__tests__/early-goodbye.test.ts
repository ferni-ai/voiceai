/**
 * HANDOFF_EARLY_GOODBYE: through the real handoff tool, the outgoing persona's
 * goodbye is said once the consent and target checks pass and before
 * executeHandoff's setup (the greeting, then the voiceSwitch event); never on a
 * declined, locked or missing target, or while a crisis verdict holds the reply.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisVerdictPending } from '../../../agents/safety/crisis-gate-signal.js';
import { handoffEvents } from '../state.js';
import {
  registerEarlyGoodbye,
  sayGoodbyeEarly,
  takeEarlyGoodbye,
  type OutgoingPersona,
} from '../early-goodbye.js';
import { AgentRegistry } from '../../../personas/registry/unified-registry.js';
import { resetHandoffState, setCurrentAgent } from '../executor.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { earlyGoodbyeCall } from '../../../agents/multi-agent/early-goodbye-call.js';

const order: string[] = [];

vi.mock('../../../personas/alive-entrances.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAliveEntranceForHandoff: vi.fn(async () => {
    order.push('greeting');
    return null;
  }),
}));

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<unknown>;
}

let n = 0;
let sessionId = '';
let agent: OutgoingPersona & { say: ReturnType<typeof vi.fn> };
let unregister = (): void => undefined;

function runCtx(lastUserWords: string, tier = 'free') {
  const history = new llm.ChatContext();
  history.addMessage({ role: 'assistant', content: 'Hey Sam, up late?' });
  history.addMessage({ role: 'user', content: lastUserWords });
  return {
    ctx: {
      session: { history },
      userData: {
        services: { sessionId, userProfile: { totalConversations: 0, subscription: { tier } } },
      },
    },
  };
}

/** The voiceSwitch handler: notes the event and confirms the switch. */
const onSwitch = (event: { agentId: string }): void => {
  order.push('voiceSwitch');
  handoffEvents.emit('handoffHandlerComplete', {
    targetId: event.agentId,
    success: true,
    greetingSpoken: true,
    instructionsUpdated: true,
  });
};

async function handoff(from: string, toolMatch: RegExp, words: string) {
  const { tools } = await buildHandoffTools(from);
  const name = Object.keys(tools).find((t) => toolMatch.test(t));
  if (!name) throw new Error(`no tool matching ${toolMatch}`);
  return (tools[name] as unknown as HandoffTool).execute({ reason: 'test' }, runCtx(words));
}

beforeEach(() => {
  n += 1;
  sessionId = `early-goodbye-${n}`;
  order.length = 0;
  resetHandoffState();
  agent = {
    personaId: 'maya-santos',
    session: {},
    say: vi.fn(() => order.push('goodbye')),
  };
  // The call's real side (crisis hold, departure line) over a stand-in orchestrator
  const orchestrator = { getActiveAgent: () => agent, isHandoffInProgress: () => false };
  unregister = registerEarlyGoodbye(
    sessionId,
    earlyGoodbyeCall(orchestrator, sessionId, () => undefined)
  );
  handoffEvents.on('voiceSwitch', onSwitch);
  vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
  vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
});

afterEach(() => {
  handoffEvents.off('voiceSwitch', onSwitch);
  unregister();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('HANDOFF_EARLY_GOODBYE through the handoff tool', () => {
  it('says the goodbye once, before the setup and the voiceSwitch', async () => {
    setCurrentAgent('maya-santos');
    expect(agent.say).not.toHaveBeenCalled();
    await handoff('maya-santos', /Ferni$/, 'Can I go back to Ferni?');
    expect(order).toEqual(['goodbye', 'greeting', 'voiceSwitch']);
    expect(agent.say).toHaveBeenCalledTimes(1);
    const [line, options] = agent.say.mock.calls[0] as [string, object];
    expect(line).toMatch(/Ferni/);
    expect(options).toEqual({ allowInterruptions: false });
    // The orchestrator takes it once, so it doesn't say it again
    expect(takeEarlyGoodbye(sessionId, 'ferni')?.text).toBe(line);
    expect(takeEarlyGoodbye(sessionId, 'ferni')).toBeNull();
  }, 30_000);

  it('flag off: no early goodbye; setup then voiceSwitch as before', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'off');
    setCurrentAgent('maya-santos');
    await handoff('maya-santos', /Ferni$/, 'Can I go back to Ferni?');
    expect(order).toEqual(['greeting', 'voiceSwitch']);
    expect(agent.say).not.toHaveBeenCalled();
    expect(takeEarlyGoodbye(sessionId, 'ferni')).toBeNull();
  }, 30_000);

  it('no goodbye on a handoff the caller never asked for (HANDOFF_ASK_FIRST)', async () => {
    vi.stubEnv('HANDOFF_ASK_FIRST', 'on');
    agent.personaId = 'ferni';
    setCurrentAgent('ferni');
    const result = await handoff('ferni', /Alex$/, 'My friend Dana has not texted back.');
    expect((result as { unavailable?: boolean }).unavailable).toBe(true);
    expect(agent.say).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  }, 30_000);

  it('no goodbye on a locked teammate', async () => {
    vi.stubEnv('HANDOFF_ASK_FIRST', 'off');
    agent.personaId = 'ferni';
    setCurrentAgent('ferni');
    const result = await handoff('ferni', /Alex$/, 'Can I talk to Alex?');
    expect(String((result as { instruction?: string }).instruction)).toMatch(/Don't retry/);
    expect(agent.say).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  }, 30_000);

  it('no goodbye while a crisis verdict holds the reply; the handoff runs as before', async () => {
    noteCrisisVerdictPending(agent.session as object, new Promise(() => undefined));
    setCurrentAgent('maya-santos');
    await handoff('maya-santos', /Ferni$/, 'Can I go back to Ferni?');
    expect(agent.say).not.toHaveBeenCalled();
    expect(order).toEqual(['greeting', 'voiceSwitch']);
  }, 30_000);

  it('no goodbye when the target is not in the registry; the handoff runs as before', async () => {
    vi.spyOn(AgentRegistry, 'getAgentOrNull').mockResolvedValue(null);
    setCurrentAgent('maya-santos');
    await handoff('maya-santos', /Ferni$/, 'Can I go back to Ferni?');
    expect(agent.say).not.toHaveBeenCalled();
    expect(order).toEqual(['greeting', 'voiceSwitch']);
  }, 30_000);

  it('no goodbye for a target with no persona voice (the handoff event would refuse it)', async () => {
    expect(await sayGoodbyeEarly(sessionId, 'no-such-teammate-xyz')).toBe(false);
    expect(agent.say).not.toHaveBeenCalled();
    expect(await sayGoodbyeEarly(sessionId, 'ferni')).toBe(true); // control: a real target
    expect(agent.say).toHaveBeenCalledTimes(1);
  }, 30_000);
});
