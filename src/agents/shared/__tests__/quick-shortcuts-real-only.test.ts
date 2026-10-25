/**
 * QUICK_SHORTCUTS_REAL_ONLY: while ASSISTANT_ACTIONS_REAL is off, quickCall,
 * quickText and quickEmail can only answer "use reachOut" (shortcut-handoff.ts),
 * which costs the caller an extra model round trip. With the flag on they are
 * not offered, decided once per call so the tool list never changes mid-call.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { toolsForTurn } from '../../personas/turn-request.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';

const tool = (name: string) =>
  llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'done' });

const SHORTCUTS = ['quickCall', 'quickText', 'quickEmail'];
const OTHERS = ['reachOut', 'callOnBehalf', 'getWeather'];
const NAMES = [...OTHERS, ...SHORTCUTS];

let n = 0;
/** A verified owner's fresh call: every tool that reaches others is offered to them. */
function newCall() {
  n += 1;
  const sessionId = `s-quick-${n}`;
  rememberDispatchIdentity(sessionId, 'firebase', '{}');
  const agent = new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(NAMES.map(tool)) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
  const session = { userData: { userId: `user-${n}`, services: { sessionId } } };
  return { agent, session };
}

async function offered({ agent, session }: ReturnType<typeof newCall>): Promise<string[]> {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Text my brother that I am running late.' });
  const tools = await toolsForTurn(session, chat, agent.toolCtx as unknown as llm.ToolContext, {
    loggedLockedHandoffs: true,
    agent,
  });
  return Object.keys(tools.functionTools);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('QUICK_SHORTCUTS_REAL_ONLY', () => {
  it('flag off: the shortcuts are offered as before', async () => {
    vi.stubEnv('QUICK_SHORTCUTS_REAL_ONLY', 'off');
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'off');
    expect(await offered(newCall())).toEqual(NAMES);
  });

  it('flag on, actions off: the shortcuts are not offered; reachOut and callOnBehalf are', async () => {
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'off');
    vi.stubEnv('QUICK_SHORTCUTS_REAL_ONLY', 'off');
    expect(await offered(newCall())).toEqual(NAMES); // pre: a call with the flag off has them
    vi.stubEnv('QUICK_SHORTCUTS_REAL_ONLY', 'on');
    const got = await offered(newCall());
    expect(got).toEqual(OTHERS);
    for (const name of SHORTCUTS) expect(got).not.toContain(name);
  });

  it('flag on, actions real: the shortcuts do the job, so they stay offered', async () => {
    vi.stubEnv('QUICK_SHORTCUTS_REAL_ONLY', 'on');
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'on');
    expect(await offered(newCall())).toEqual(NAMES);
  });

  it('decided at the call start: the tool list does not change mid-call', async () => {
    vi.stubEnv('QUICK_SHORTCUTS_REAL_ONLY', 'on');
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'off');
    const call = newCall();
    expect(await offered(call)).toEqual(OTHERS);
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'on'); // a mid-call env change
    expect(await offered(call)).toEqual(OTHERS);

    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'on');
    const other = newCall();
    expect(await offered(other)).toEqual(NAMES);
    vi.stubEnv('ASSISTANT_ACTIONS_REAL', 'off');
    expect(await offered(other)).toEqual(NAMES);
  });
});
