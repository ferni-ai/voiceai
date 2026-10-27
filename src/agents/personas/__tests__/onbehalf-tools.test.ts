/**
 * ONBEHALF_WRITE_GATE: the person on a call Ferni places for a member is offered
 * no tool that acts on an account. rememberAboutUser and addContact ran as
 * `onbehalf:<callId>` and wrote under it. The real per-turn tool filter
 * (toolsForTurn) leaves only the phone-safe set, the call's own endCall and
 * crisis support included, in the request and on the agent. A member keeps them.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { toolsForTurn } from '../turn-request.js';

const tool = (name: string) =>
  llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'done' });

const OWN_ACCOUNT = ['rememberAboutUser', 'addContact', 'manageContact', 'setReminder'];
const CALL_OWN = ['endCall', 'quickCrisisResources', 'getWeather'];
const NAMES = [...OWN_ACCOUNT, ...CALL_OWN];

async function offered(
  userId: string,
  sessionId: string
): Promise<{ request: string[]; agent: string[] }> {
  const agent = new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(NAMES.map(tool)),
    skipGreeting: true,
  });
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Can you remember my new number for Seth?' });
  const tools = await toolsForTurn(
    { userData: { userId, services: { sessionId } } },
    chat,
    new llm.ToolContext(NAMES.map(tool)), // the request's own copy; the agent's is filtered too
    {
      loggedLockedHandoffs: false,
      agent,
    }
  );
  return {
    request: Object.keys(tools.functionTools),
    agent: Object.keys(agent.toolCtx.functionTools),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('tools on an on-behalf call', () => {
  it('own-account tools leave the request and the agent; the call keeps endCall and support', async () => {
    const { request, agent } = await offered('onbehalf:test123', 's-onbehalf-1');
    expect(request).toEqual(CALL_OWN);
    expect(agent).toEqual(CALL_OWN);
  });

  it('a member keeps every tool (control)', async () => {
    const { request } = await offered('member-uid-7f3a', 's-member-1');
    expect(request).toEqual(expect.arrayContaining(OWN_ACCOUNT));
  });

  it('kill switch off: offered as before', async () => {
    vi.stubEnv('ONBEHALF_WRITE_GATE', 'off');
    const { request } = await offered('onbehalf:test123', 's-onbehalf-2');
    expect(request).toEqual(expect.arrayContaining(OWN_ACCOUNT));
  });
});
