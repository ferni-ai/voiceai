/**
 * HANDOFF_EARLY_GOODBYE failure safety, through the real handoff tool: once the
 * caller has heard the goodbye, a handoff that then fails, throws or finds the
 * handoff lock taken gets one honest line in the outgoing voice, a tool result
 * that names the promise, and no saved goodbye left behind. A busy lock means no
 * early goodbye at all, and the flag is off when the env var is unset.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { earlyGoodbyeCall } from '../../../agents/multi-agent/early-goodbye-call.js';
import { llmHandoffHandler } from '../../../agents/multi-agent/llm-handoff.js';
import {
  brokenPromiseLine,
  registerEarlyGoodbye,
  takeEarlyGoodbye,
  type OutgoingPersona,
} from '../early-goodbye.js';
import { resetHandoffState, setCurrentAgent } from '../executor.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { handoffEvents } from '../state.js';

const event = vi.hoisted(() => ({ throws: false }));
vi.mock('../types.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../types.js')>();
  return {
    ...real,
    createHandoffEvent: vi.fn(async (...args: Parameters<typeof real.createHandoffEvent>) => {
      if (event.throws) throw new Error('Cannot create handoff event: no voiceId');
      return real.createHandoffEvent(...args);
    }),
  };
});

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<unknown>;
}

const HONEST = brokenPromiseLine('Ferni');
let n = 0;
let sessionId = '';
let said: string[] = [];
let agent: OutgoingPersona;
let lockHeld = false;
let unregister = (): void => undefined;
let outcome: 'confirm' | 'fail' = 'confirm';

/** The voiceSwitch handler: confirms the switch, or reports it failed. */
const onSwitch = (e: { agentId: string }): void => {
  const success = outcome === 'confirm';
  handoffEvents.emit('handoffHandlerComplete', {
    targetId: e.agentId,
    success,
    greetingSpoken: success,
    instructionsUpdated: success,
    error: success ? undefined : 'spawn failed',
  });
};

async function handoffToFerni(): Promise<{ error?: string }> {
  const { tools } = await buildHandoffTools('maya-santos');
  const name = Object.keys(tools).find((t) => /Ferni$/.test(t));
  if (!name) throw new Error('no handoff tool to Ferni');
  const history = new llm.ChatContext();
  history.addMessage({ role: 'user', content: 'Can I go back to Ferni?' });
  const ctx = {
    ctx: {
      session: { history },
      userData: { services: { sessionId, userProfile: { subscription: { tier: 'free' } } } },
    },
  };
  return (await (tools[name] as unknown as HandoffTool).execute({ reason: 'test' }, ctx)) as {
    error?: string;
  };
}

const goodbyes = (): string[] => said.filter((s) => s !== HONEST);
const honest = (): string[] => said.filter((s) => s === HONEST);

beforeEach(() => {
  n += 1;
  sessionId = `early-goodbye-fail-${n}`;
  said = [];
  lockHeld = false;
  outcome = 'confirm';
  event.throws = false;
  resetHandoffState();
  setCurrentAgent('maya-santos');
  agent = { personaId: 'maya-santos', session: {}, say: vi.fn((text: string) => said.push(text)) };
  const orchestrator = { getActiveAgent: () => agent, isHandoffInProgress: () => false };
  const lock = { held: () => lockHeld };
  unregister = registerEarlyGoodbye(
    sessionId,
    earlyGoodbyeCall(orchestrator, sessionId, () => undefined, lock)
  );
  handoffEvents.on('voiceSwitch', onSwitch);
  vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
  vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
});

afterEach(() => {
  handoffEvents.off('voiceSwitch', onSwitch);
  unregister();
  vi.unstubAllEnvs();
});

describe('HANDOFF_EARLY_GOODBYE when the handoff fails after the goodbye', () => {
  it('(a) the handler reports failure: one honest line, and the result names the promise', async () => {
    outcome = 'fail';
    const result = await handoffToFerni();
    expect(goodbyes()).toHaveLength(1);
    expect(honest()).toHaveLength(1);
    expect(said).toEqual([goodbyes()[0], HONEST]); // goodbye first, then the honest line
    expect(result.error).toMatch(/already told them Ferni was coming/);
    expect(result.error).toMatch(/Don't say Ferni joined/);
    expect(takeEarlyGoodbye(sessionId, 'ferni')).toBeNull(); // cleared
  }, 30_000);

  it('(b) the handoff lock is held: no early goodbye at all', async () => {
    lockHeld = true;
    await handoffToFerni();
    expect(said).toEqual([]);
  }, 30_000);

  it('(b) the lock is taken after the goodbye: the tool answers at once, honestly, no dead air', async () => {
    handoffEvents.off('voiceSwitch', onSwitch);
    const busy = llmHandoffHandler({
      orchestrator: {} as never,
      services: { sessionId } as never,
      lock: { acquire: async () => false, release: () => undefined },
      publish: async () => undefined,
      runHandoff: vi.fn() as never,
    });
    handoffEvents.on('voiceSwitch', busy);
    try {
      const started = Date.now();
      const result = await handoffToFerni();
      expect(Date.now() - started).toBeLessThan(3_000); // not the handoff timeout
      expect(goodbyes()).toHaveLength(1);
      expect(honest()).toHaveLength(1);
      expect(result.error).toMatch(/already told them Ferni was coming/);
    } finally {
      handoffEvents.off('voiceSwitch', busy);
    }
  }, 30_000);

  it('(c) createHandoffEvent throws: one honest line, a result instead of a throw', async () => {
    event.throws = true;
    const result = await handoffToFerni();
    expect(goodbyes()).toHaveLength(1);
    expect(honest()).toHaveLength(1);
    expect(result.error).toMatch(/already told them Ferni was coming/);
    expect(takeEarlyGoodbye(sessionId, 'ferni')).toBeNull();
  }, 30_000);

  it('a failure then a retry within 10 s: the retry says its goodbye again', async () => {
    outcome = 'fail';
    await handoffToFerni();
    expect(goodbyes()).toHaveLength(1);
    outcome = 'confirm';
    resetHandoffState(); // the rate limit, not under test here
    setCurrentAgent('maya-santos');
    await handoffToFerni();
    expect(goodbyes()).toHaveLength(2);
    expect(honest()).toHaveLength(1);
  }, 30_000);

  it('flag off: a failed handoff says nothing from this code', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'off');
    outcome = 'fail';
    const result = await handoffToFerni();
    expect(said).toEqual([]);
    expect(result.error).not.toMatch(/already told them/);
  }, 30_000);

  it('default off: with HANDOFF_EARLY_GOODBYE unset, no early goodbye', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', undefined);
    expect(process.env.HANDOFF_EARLY_GOODBYE).toBeUndefined();
    await handoffToFerni();
    expect(said).toEqual([]);
  }, 30_000);
});
