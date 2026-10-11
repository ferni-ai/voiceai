/**
 * With one session per call, the handlers the call's first persona wired (transcript,
 * session state, tool tracking, turn sounds, director notes, tool retrieval) must follow
 * the persona on the call. Wired with the first persona's values, after Ferni→Maya they
 * stored Maya's turns as Ferni's, played Ferni's recorded backchannels in Maya's call and
 * read Ferni's frozen chat for the director.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Director } from '../../personas/director-notes.js';
import { agentOnCall, personaOnCall, rememberPersona } from '../persona-swap.js';
import { installDirectorNotes } from '../turn-observers.js';

const ferni = { id: 'ferni', displayName: 'Ferni' };
const maya = { id: 'maya-santos', displayName: 'Maya' };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the persona on the call', () => {
  it('without single-session handoffs is the first persona itself', () => {
    const session = {};
    expect(personaOnCall(session, { personaId: 'maya-santos' }, ferni)).toBe(ferni);
  });

  it('follows each swap, and its rollback, through userData.personaId', () => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    const session = {};
    const userData = { personaId: 'ferni' };
    rememberPersona(session, ferni);
    rememberPersona(session, maya);
    const onCall = personaOnCall(session, userData, ferni);
    expect(onCall.displayName).toBe('Ferni');

    userData.personaId = 'maya-santos';
    expect(onCall.id).toBe('maya-santos');
    expect({ ...onCall }).toEqual(maya); // spreads and serialisation see Maya too
    expect(JSON.parse(JSON.stringify(onCall))).toEqual(maya);

    userData.personaId = 'ferni'; // a rollback
    expect(onCall.displayName).toBe('Ferni');
  });

  it("falls back to the first persona for one the call hasn't built", () => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    const session = {};
    rememberPersona(session, ferni);
    expect(personaOnCall(session, { personaId: 'nobody' }, ferni).id).toBe('ferni');
  });
});

describe('the agent on the call', () => {
  it("is the session's current agent, or the first when the session isn't running", () => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    const first = { name: 'ferni-agent' };
    let current: unknown = { name: 'maya-agent' };
    const session = {
      get currentAgent() {
        if (!current) throw new Error('AgentSession is not running');
        return current;
      },
    };
    const agentNow = agentOnCall(session as never, first);
    expect(agentNow()).toEqual({ name: 'maya-agent' });
    current = undefined;
    expect(agentNow()).toBe(first);
  });

  it('without single-session handoffs is always the first agent', () => {
    const first = { name: 'ferni-agent' };
    const session = { currentAgent: { name: 'maya-agent' } };
    expect(agentOnCall(session as never, first)()).toBe(first);
  });
});

describe('director notes after a swap', () => {
  it("read the chat of the agent on the call, not the first agent's", async () => {
    const observed = vi.spyOn(Director.prototype, 'observe').mockResolvedValue(undefined as never);
    const handlers: Array<(ev: unknown) => void> = [];
    const session = {
      on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
      off: () => {},
    };
    const said = (text: string) => ({
      chatCtx: { items: [{ type: 'message', role: 'assistant', textContent: text }] },
    });
    let onCall = said('Ferni, before the swap');
    await installDirectorNotes({
      session: session as never,
      sessionId: 's',
      userName: undefined,
      agent: () => onCall,
      cleanupFunctions: [],
    });

    onCall = said('Maya, after the swap');
    handlers.forEach((h) => h({ newState: 'speaking' }));
    handlers.forEach((h) => h({ newState: 'listening' }));

    expect(JSON.stringify(observed.mock.calls.at(-1))).toContain('Maya, after the swap');
  });
});
