/**
 * HANDOFF_EARLY_GOODBYE when another handoff starts during the tool's setup, through
 * the real handoff tool, orchestrator, voiceSwitch handler and tap path:
 * - a tap to a different teammate cancels the early goodbye (stopped if it is playing,
 *   never started if it is still queued), the tapped handoff completes, and the tap wins
 *   outright: the tool's queued handoff never runs, and its result says so;
 * - a tap to the same teammate: the tool result says the teammate is on the call;
 * - with the flag unset, nothing changes.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHandoffState, setCurrentAgent } from '../../../tools/handoff/executor.js';
import { buildHandoffTools } from '../../../tools/handoff/handoff-factory.js';
import { registerEarlyGoodbye } from '../../../tools/handoff/early-goodbye.js';
import { handoffEvents } from '../../../tools/handoff/state.js';
import { createHandoffLock } from '../../voice-agent/phases/multi-agent-mode.js';
import { earlyGoodbyeCall } from '../early-goodbye-call.js';
import { llmHandoffHandler } from '../llm-handoff.js';
import { handleHandoffFromDataChannel } from '../multi-agent-entry.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

vi.mock('../../model-provider/handoff-cache-warm.js', () => ({
  warmIncomingPersona: vi.fn(async () => undefined),
}));

/** executeHandoff's setup (the greeting) takes this long: the window a tap can land in. */
const setup = vi.hoisted(() => ({ ms: 400 }));
vi.mock('../../../personas/alive-entrances.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAliveEntranceForHandoff: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, setup.ms));
    return null;
  }),
}));

interface Spoken {
  persona: string;
  text: string;
  handle: { interrupt: ReturnType<typeof vi.fn> };
}

let n = 0;
let session = '';
let spoken: Spoken[] = [];
let spawned: string[] = [];
/** The SDK makes the speech for a say this long after it is asked (queued behind other speech). */
let speechDelayMs = 0;
let unregister = (): void => undefined;
let stopSwitch = (): void => undefined;

function config(sessionId: string) {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId,
    createPersonaAgent: vi.fn(async (personaId: string) => {
      spawned.push(personaId);
      const events = new EventEmitter();
      const say = vi.fn((text: string) => {
        const handle = { interrupt: vi.fn() };
        spoken.push({ persona: personaId, text, handle });
        const created = (): boolean =>
          events.emit('speech_created', { source: 'say', speechHandle: handle });
        if (speechDelayMs > 0) setTimeout(created, speechDelayMs);
        else created();
      });
      return {
        id: `${personaId}-agent`,
        personaId,
        isActive: false,
        session: events,
        cleanup: vi.fn(async () => undefined),
        say,
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      } as never;
    }),
  };
}

const services = () =>
  ({ sessionId: session, userProfile: { subscription: { tier: 'free' } } }) as never;

/** One call: Maya on, the early goodbye lent to the tool, the real voiceSwitch handler. */
async function startCall() {
  const orchestrator = createAgentOrchestrator(config(session));
  await orchestrator.start('maya-santos');
  await vi.waitFor(() => expect(spoken).toHaveLength(1)); // the opening greeting
  spoken = [];
  const lock = createHandoffLock();
  unregister = registerEarlyGoodbye(
    session,
    earlyGoodbyeCall(orchestrator, session, () => undefined, lock)
  );
  const onSwitch = llmHandoffHandler({
    orchestrator,
    services: services(),
    lock,
    publish: async () => undefined,
    runHandoff: handleHandoffFromDataChannel,
  });
  handoffEvents.on('voiceSwitch', onSwitch);
  stopSwitch = () => handoffEvents.off('voiceSwitch', onSwitch);
  /** A tap in the app, the way multi-agent-mode.ts runs one */
  const tap = async (target: string) => {
    if (!(await lock.acquire())) return { success: false, error: 'locked' };
    try {
      return await handleHandoffFromDataChannel(orchestrator, target, 'tap', services());
    } finally {
      lock.release();
    }
  };
  /** The model's own handoff, the way llm-handoff.ts runs one: it carries onAgentReady */
  const modelHandoff = async (target: string) => {
    if (!(await lock.acquire())) return { success: false, error: 'locked' };
    try {
      return await handleHandoffFromDataChannel(orchestrator, target, 'llm', services(), () => {});
    } finally {
      lock.release();
    }
  };
  return { orchestrator, tap, modelHandoff };
}

/** The model's handoffToFerni, called by Maya */
async function toolToFerni(): Promise<Record<string, unknown>> {
  const { tools } = await buildHandoffTools('maya-santos');
  setCurrentAgent('maya-santos'); // after the build (early-goodbye.test.ts)
  const name = Object.keys(tools).find((t) => /Ferni$/.test(t));
  if (!name) throw new Error('no handoff tool to Ferni');
  const history = new llm.ChatContext();
  history.addMessage({ role: 'user', content: 'Can I go back to Ferni?' });
  const ctx = {
    ctx: { session: { history }, userData: { services: { sessionId: session } } },
  };
  const tool = tools[name] as unknown as { execute: (a: object, c: object) => Promise<unknown> };
  return (await tool.execute({ reason: 'test' }, ctx)) as Record<string, unknown>;
}

const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const maya = () => spoken.filter((s) => s.persona === 'maya-santos');
const heard = (s: Spoken) => s.handle.interrupt.mock.calls.length === 0;

beforeEach(() => {
  n += 1;
  session = `early-goodbye-other-${n}`;
  spoken = [];
  spawned = [];
  speechDelayMs = 0;
  resetHandoffState();
  vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
  vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
  vi.stubEnv('TEAM_BY_NEED', 'on'); // Peter open to a tap
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});

afterEach(() => {
  stopSwitch();
  unregister();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('HANDOFF_EARLY_GOODBYE and a tap during the setup', () => {
  it('a tap to Peter at 250 ms: the playing goodbye to Ferni is stopped; Peter comes on', async () => {
    const { orchestrator, tap } = await startCall();
    const tool = toolToFerni();
    await after(250);
    expect(maya()).toHaveLength(1); // pre: the early goodbye to Ferni is playing
    const [early] = maya();
    expect(heard(early)).toBe(true);

    const tapped = await tap('peter-john');
    expect(tapped.success).toBe(true);
    expect(early.handle.interrupt).toHaveBeenCalledWith(true); // stopped, not played out
    expect(maya().slice(1).filter(heard)).toHaveLength(1); // the tap's own goodbye plays
    expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
    const result = await tool;
    expect(maya().filter(heard)).toHaveLength(1); // Maya said one goodbye: the tap's
    // The tap wins outright: Ferni never joins, Peter stays on, the model is told why
    expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
    expect(spawned).not.toContain('ferni');
    expect(result).toMatchObject({ error: expect.stringMatching(/They chose Peter instead/) });
  }, 30_000);

  it("the model's own handoff to Peter during the setup is not the caller choosing", async () => {
    const { modelHandoff } = await startCall();
    const tool = toolToFerni();
    await after(250);
    await modelHandoff('peter-john');
    const result = await tool;
    // Only a tap (no onAgentReady) supersedes the tool's handoff (#3048)
    expect(String(result.error ?? '')).not.toMatch(/chose/);
  }, 30_000);

  it('a tap to Peter at 100 ms, the goodbye still queued: it never plays', async () => {
    const { orchestrator, tap } = await startCall();
    speechDelayMs = 300; // from now, the SDK makes each say's speech 300 ms later (queued)
    const tool = toolToFerni();
    await after(100);
    expect(maya()).toHaveLength(1); // asked for, not yet made
    const [early] = maya();
    expect(early.handle.interrupt).not.toHaveBeenCalled();

    const tapped = await tap('peter-john');
    expect(tapped.success).toBe(true);
    expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
    await vi.waitFor(() => expect(early.handle.interrupt).toHaveBeenCalledWith(true));
    const result = await tool;
    expect(maya().filter(heard)).toHaveLength(1); // only the tap's goodbye
    expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
    expect(spawned).not.toContain('ferni');
    expect(result).toMatchObject({ error: expect.stringMatching(/They chose Peter instead/) });
  }, 30_000);

  it('a tap to Ferni during the setup: the tool result says Ferni is on the call', async () => {
    const { orchestrator, tap } = await startCall();
    const tool = toolToFerni();
    await after(100);
    expect(await tap('ferni')).toMatchObject({ success: true });
    const result = await tool;
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
    expect(result).toMatchObject({ handoff_complete: true, new_agent: 'Ferni' });
    expect(JSON.stringify(result)).not.toMatch(/couldn't join|Don't say/);
    expect(maya()).toHaveLength(1); // one goodbye (the early one), no honest line
    expect(heard(maya()[0])).toBe(true);
  }, 30_000);

  it('flag unset: no early goodbye, and the same tap gives the old result', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', undefined);
    expect(process.env.HANDOFF_EARLY_GOODBYE).toBeUndefined();
    const { orchestrator, tap } = await startCall();
    const tool = toolToFerni();
    await after(100);
    expect(spoken).toEqual([]); // the tool said nothing
    expect(await tap('ferni')).toMatchObject({ success: true });
    const result = await tool;
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
    expect(result).toMatchObject({ error: expect.stringMatching(/couldn't join/) });
  }, 30_000);

  it('flag unset: a tap to Peter during the setup is followed by the queued Ferni (as main)', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', undefined);
    const { orchestrator, tap } = await startCall();
    const tool = toolToFerni();
    await after(100);
    expect(await tap('peter-john')).toMatchObject({ success: true });
    await tool;
    expect(spawned).toContain('ferni');
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
  }, 30_000);
});
