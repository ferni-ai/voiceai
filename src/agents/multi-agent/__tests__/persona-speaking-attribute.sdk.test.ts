/**
 * PERSONA_SPEAKING_ATTRIBUTE through the real handoff path on a real LiveKit AgentSession:
 * the real call-session builder (call-session.ts, which installs the attribute), the real
 * orchestrator (opening greeting, goodbye, single-session swap, arrival) and the real tap
 * handoff (handleHandoffFromDataChannel). Only the TTS, the STT (none), the room audio
 * and the room's participant are doubles.
 *
 * The app's name chip must say Ferni through Ferni's goodbye and Maya from the moment
 * Maya's voice starts: not when the handoff is decided, not after her greeting.
 */
import { initializeLogger, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// No STT: nothing is heard in these tests, and a real one dials Cartesia and ends the call on a 401
vi.mock('../../model-provider/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../model-provider/index.js')>()),
  createProviderSTT: () => undefined,
}));
vi.mock('../resume-after-drop.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../resume-after-drop.js')>()),
  greetingOrResume: async () => 'Hey Sam.',
}));

import { AgentDirectory } from '../../../personas/agent-directory.js';
import { createCallSession } from '../call-session.js';
import { handleHandoffFromDataChannel } from '../multi-agent-entry.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';
import { PERSONA_ATTRIBUTE, PERSONA_NAME_ATTRIBUTE } from '../persona-speaking-attribute.js';
import { PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

let calls = 0;
const GOODBYE = 'Let me get Maya for you.';
const GREETING = 'Hi, Maya here.';

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

interface Span {
  start: number;
  end?: number;
  /** The persona attribute the app sees as this speech's audio starts */
  shown?: string;
}

const cleanups: Array<() => Promise<unknown> | void> = [];

/** Waits until `done`, or fails saying what it was waiting for */
async function until(done: () => boolean, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    // eslint-disable-next-line no-await-in-loop -- polling the real session
    await sleep(25);
  }
}

async function tapHandoffToMaya() {
  const SESSION = `persona-attribute-sdk-${(calls += 1)}`;
  const userData: { personaId?: string } = {};
  const writes: Array<Record<string, string> & { at: number }> = [];
  const room = {
    localParticipant: {
      setAttributes: vi.fn(async (attributes: Record<string, string>) => {
        writes.push({ ...attributes, at: Date.now() } as (typeof writes)[number]);
      }),
    },
  };
  const spans: Span[] = [];
  const out = new RoomLikeAudioOutput(1000);
  let session: voice.AgentSession | undefined;
  let built = 0;

  const orchestrator = createAgentOrchestrator({
    ctx: {} as never,
    room: room as never,
    userParticipant: {} as never,
    sessionId: SESSION,
    createPersonaAgent: async (personaId: string, context: { callSession?: unknown }) => {
      const agent = new voice.Agent({ instructions: `You are ${personaId}.` });
      if (!context.callSession) {
        userData.personaId = personaId; // as agent-setup.ts, before the session is built
        const s = await createCallSession({
          persona: { id: personaId } as never,
          sessionId: SESSION,
          services: {} as never,
          userData: userData as never,
          llmModel: undefined,
          tts: new PacedTTS() as never,
          room,
        });
        session = s as unknown as voice.AgentSession;
        session.output.audio = out;
        session.on(voice.AgentSessionEventTypes.Error, () => undefined);
        // Registered after the session's own listeners, so `shown` is what the app has by now
        session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
          const shown = writes[writes.length - 1]?.[PERSONA_ATTRIBUTE];
          if (ev.newState === 'speaking') spans.push({ start: Date.now(), shown });
          else if (ev.oldState === 'speaking') spans[spans.length - 1].end = Date.now();
        });
        cleanups.push(
          () => out.close(),
          () => s.close().catch(() => undefined)
        );
        await session.start({ agent });
      }
      const live = session as voice.AgentSession;
      return {
        id: `${personaId}-${(built += 1)}`,
        personaId,
        isActive: false,
        session: live,
        userData,
        agent,
        ownsSession: !context.callSession,
        release: async () => undefined,
        cleanup: async () => undefined,
        say: (text: string, opts?: { allowInterruptions?: boolean }) => {
          live.say(text, { allowInterruptions: opts?.allowInterruptions ?? true });
        },
        setMuted: () => undefined,
        interrupt: () => live.interrupt(),
      } as never;
    },
  } as never);

  const writesAtStart = () => writes.map((w) => w[PERSONA_ATTRIBUTE]);
  await orchestrator.start('ferni');
  const afterStart = writesAtStart();
  await until(() => Boolean(spans[0]?.end), "Ferni's opening line");
  await sleep(300);

  const decidedAt = Date.now();
  const result = await handleHandoffFromDataChannel(orchestrator, 'maya-santos', 'tap', {
    sessionId: SESSION,
    userId: 'u1',
  } as never);
  const spoken = () => spans.filter((s) => s.start > decidedAt);
  await until(() => Boolean(spoken()[1]?.end), `goodbye then greeting (${JSON.stringify(result)})`);
  await sleep(300);
  const [goodbye, greeting] = spoken();
  return { result, afterStart, writes, goodbye, greeting, decidedAt, room, spans };
}

describe('the persona attribute on a real handoff (AgentSession + orchestrator)', () => {
  beforeAll(async () => {
    initializeLogger({ pretty: false, level: 'silent' });
    await AgentDirectory.getEntry('ferni'); // the alias table, for canonical ids
  });
  beforeEach(() => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    vi.stubEnv('BRIEFED_HANDOFF', 'off');
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', 'maya');
    vi.stubEnv('DISABLE_VAD', 'true');
    vi.stubEnv('INTERRUPTION_MODE', 'vad'); // no barge-in model to reach
    vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
    vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret');
    vi.stubEnv('LIVEKIT_INFERENCE_URL', 'http://127.0.0.1:9');
    const lines = AgentOrchestrator.prototype as unknown as Record<string, () => string>;
    vi.spyOn(lines, 'getGoodbyePhrase').mockReturnValue(GOODBYE);
    vi.spyOn(lines, 'getGreetingPhrase').mockReturnValue(GREETING);
  });
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: Ferni at call start and through the goodbye, Maya exactly when her voice starts', async () => {
    vi.stubEnv('PERSONA_SPEAKING_ATTRIBUTE', 'on');
    const r = await tapHandoffToMaya();

    expect(r.result.success).toBe(true);
    expect(r.afterStart).toEqual(['ferni']); // call start, before any audio
    expect(r.goodbye.shown).toBe('ferni'); // the goodbye still carries the old name
    expect(r.greeting.shown).toBe('maya-santos'); // the new name with the new voice
    const maya = r.writes[1];
    expect(maya).toMatchObject({
      [PERSONA_ATTRIBUTE]: 'maya-santos',
      [PERSONA_NAME_ATTRIBUTE]: 'Maya',
    });
    // Written as Maya's audio starts: after the goodbye ended, not when the handoff was decided
    expect(maya.at).toBeGreaterThanOrEqual(r.goodbye.end as number);
    expect(Math.abs(maya.at - r.greeting.start)).toBeLessThan(50);
    expect(maya.at - r.decidedAt).toBeGreaterThan(500);
  }, 30_000);

  it('on: written once per change, though Ferni started speaking twice', async () => {
    vi.stubEnv('PERSONA_SPEAKING_ATTRIBUTE', 'on');
    const r = await tapHandoffToMaya();

    expect(r.spans.length).toBeGreaterThanOrEqual(3); // opening line, goodbye, greeting
    expect(r.writes.map((w) => w[PERSONA_ATTRIBUTE])).toEqual(['ferni', 'maya-santos']);
    expect(r.room.localParticipant.setAttributes).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('off (the default): the same handoff never writes an attribute', async () => {
    const r = await tapHandoffToMaya();

    expect(r.result.success).toBe(true);
    expect(r.spans.length).toBeGreaterThanOrEqual(3);
    expect(r.room.localParticipant.setAttributes).not.toHaveBeenCalled();
  }, 30_000);
});
