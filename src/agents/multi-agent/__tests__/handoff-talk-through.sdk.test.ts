/**
 * Talking through a handoff goodbye (HANDOFF_TALK_THROUGH, handoff-talk-through.ts), on a
 * real LiveKit AgentSession (@livekit/agents + Ferni's patch): the real handoff tool path
 * (the SDK runs the tool, which returns `llm.handoff` and is swapped in by the SDK), the
 * real orchestrator, swapPersona and LLM-handoff handler, and the real barge-in fast path.
 * Only the LLM, TTS, room audio and the caller's voice are scripted.
 *
 * The caller is the talk-through scenario's second handoff (voiceai-evidence/
 * handoff-warmth-2026-10-17/scenarios/talk-through.txt): "Can you take me back to Ferni?",
 * then, while Jordan says goodbye, "And tell Ferni my dentist moved my cleaning to Thursday
 * at four." Their STT hears a word only when LiveKit doesn't discard the audio
 * (shouldDiscardInputAudio: the SDK's gate for uninterruptible speech), and only the
 * activity that is on when they finish gets the transcript (main's SDK opens a new STT
 * stream per persona).
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import { handoffEvents } from '../../../handoff/index.js';
import { handoffToolResponse } from '../../../tools/handoff/handoff-tool-response.js';
import { holdHandoffThroughTalk } from '../../../tools/handoff/held-handoff-speech.js';
import { markSessionReady } from '../../shared/generate-reply-gateway.js';
import { createBargeInFastPath } from '../barge-in-fastpath.js';
import { interruptionOverrides } from '../interruption-config.js';
import { runLlmHandoff } from '../llm-handoff.js';
import { handleHandoffFromDataChannel } from '../multi-agent-entry.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';
import { PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

const SESSION = 'talk-through-sdk-test';
const REQUEST = 'Okay, thanks Jordan. Can you take me back to Ferni?';
const SENTENCE = 'And tell Ferni my dentist moved my cleaning to Thursday at four.';
/** The scenario's sentence took ~3.6 s (A1 CALLER#3); ~300 ms a word */
const WORD_MS = 300;
const LLM_MS = 300;

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

type Item = { type: string; role?: string; textContent?: string };

/** Who the LLM is speaking for (its instructions) and what it was last told */
interface LlmCall {
  who: 'Jordan' | 'Ferni' | '?';
  lastUser?: string;
  /** HANDOFF_FAILED_SAY_SO's note was in the chat (handoff-failed-say-so.ts) */
  noted?: boolean;
}

class ScriptLLM extends llm.LLM {
  calls: LlmCall[] = [];
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    const items = p.chatCtx.items as Item[];
    const system = items
      .filter((i) => i.type === 'message' && i.role !== 'user' && i.role !== 'assistant')
      .map((i) => i.textContent ?? '')
      .join(' ');
    const who = /You are Ferni/.test(system)
      ? 'Ferni'
      : /You are Jordan/.test(system)
        ? 'Jordan'
        : '?';
    const users = items.filter((i) => i.type === 'message' && i.role === 'user');
    const lastUser = users[users.length - 1]?.textContent;
    const answered = items.some((i) => i.type === 'function_call_output');
    this.calls.push({ who, lastUser, noted: system.includes("[HANDOFF DIDN'T GO THROUGH]") });
    const chunk: llm.ChatChunk =
      who === 'Jordan' && lastUser === REQUEST && !answered
        ? {
            id: 'r',
            delta: {
              role: 'assistant',
              toolCalls: [
                llm.FunctionCall.create({
                  callId: `call_${this.calls.length}`,
                  name: 'handoffToFerni',
                  args: JSON.stringify({ reason: 'asked to go back to Ferni' }),
                }),
              ],
            },
          }
        : { id: 'r', delta: { role: 'assistant', content: `${who} here. Got it.` } };
    return new OneChunkStream(this, chunk, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class OneChunkStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly chunk: llm.ChatChunk,
    o: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, o);
  }
  protected async run(): Promise<void> {
    await sleep(LLM_MS);
    this.queue.put(this.chunk);
  }
}

interface Activity {
  shouldDiscardInputAudio(): boolean;
  onStartOfSpeech(ev: { speechDuration: number; inferenceDuration: number }): void;
  onEndOfSpeech(ev: { silenceDuration: number; inferenceDuration: number }): void;
  onFinalTranscript(ev: unknown): void;
  onEndOfTurn(info: unknown): Promise<boolean>;
}

const cleanups: Array<() => Promise<void> | void> = [];

async function call(caller: 'talks' | 'waits' = 'talks') {
  const script = new ScriptLLM();
  const userData: { personaId?: string } = {};
  const session = new voice.AgentSession({
    llm: script,
    tts: new PacedTTS(),
    userData,
    turnHandling: { interruption: interruptionOverrides({}) },
  } as never);
  const out = new RoomLikeAudioOutput(1000);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  cleanups.push(
    () => out.close(),
    () => session.close().catch(() => undefined)
  );
  const activity = () => (session as unknown as { _activity: Activity })._activity;
  const said: Array<{ text: string; interrupted: boolean }> = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const it = ev.item as Item & { interrupted?: boolean };
    if (it.type === 'message' && it.role === 'assistant')
      said.push({ text: it.textContent ?? '', interrupted: Boolean(it.interrupted) });
  });

  // The barge-in fast path, wired as live-call-behaviors.ts wires it
  const refused: string[] = [];
  const fast = createBargeInFastPath({
    interrupt: () => {
      try {
        session.interrupt();
      } catch (error) {
        refused.push(String(error));
      }
    },
  });
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, fast.onAgentState);
  session.on(voice.AgentSessionEventTypes.UserStateChanged, fast.onUserState);
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, fast.onTranscript);

  // The handoff results the LLM-handoff handler got from the orchestrator
  const results: Array<{ success: boolean; error?: string }> = [];
  const made: { orchestrator?: AgentOrchestrator } = {};
  const handoffCall = {
    get orchestrator() {
      return made.orchestrator as AgentOrchestrator;
    },
    services: { sessionId: SESSION, userId: 'u1' } as never,
    lock: { acquire: async () => true, release: () => undefined },
    publish: async () => undefined,
    runHandoff: (async (...args: Parameters<typeof handleHandoffFromDataChannel>) => {
      const result = await handleHandoffFromDataChannel(...args);
      results.push(result);
      return result;
    }) as typeof handleHandoffFromDataChannel,
  };
  // As handoff-factory.ts: the executor emits voiceSwitch and waits for the handler
  const handoffToFerni = llm.tool({
    description: 'Hand the caller to Ferni',
    parameters: z.object({ reason: z.string() }),
    execute: holdHandoffThroughTalk(async () => {
      const handled = new Promise<{ success: boolean; error?: string }>((resolve) => {
        const done = (ev: { success: boolean; error?: string }) => {
          handoffEvents.off('handoffHandlerComplete', done);
          resolve(ev);
        };
        handoffEvents.on('handoffHandlerComplete', done);
      });
      void runLlmHandoff(handoffCall, { persona: { id: 'ferni' } });
      const ev = await handled;
      return handoffToolResponse(
        { ...ev, targetAgent: 'ferni', targetAgentName: 'Ferni' } as never,
        'Ferni',
        SESSION
      );
    }),
  });

  const agents: Record<string, voice.Agent> = {};
  let built = 0;
  const orchestrator = createAgentOrchestrator({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: SESSION,
    createPersonaAgent: async (personaId: string, context: { callSession?: unknown }) => {
      const jordan = personaId === 'jordan-taylor';
      const agent = new voice.Agent({
        instructions: `You are ${jordan ? 'Jordan' : 'Ferni'}.`,
        tools: jordan ? { handoffToFerni } : {},
      });
      agents[personaId] = agent;
      if (!context.callSession) {
        userData.personaId = personaId;
        await session.start({ agent });
      }
      return {
        id: `${personaId}-${(built += 1)}`,
        personaId,
        isActive: false,
        session,
        userData,
        agent,
        ownsSession: !context.callSession,
        release: async () => undefined,
        cleanup: async () => undefined,
        say: (text: string, opts?: { allowInterruptions?: boolean }) => {
          session.say(text, opts);
        },
        setMuted: () => undefined,
        interrupt: () => session.interrupt(),
      } as never;
    },
  } as never);
  made.orchestrator = orchestrator;
  await orchestrator.start('jordan-taylor');
  markSessionReady(SESSION);

  /** The caller speaks; the STT hears only the words LiveKit lets through */
  const speak = async (text: string) => {
    const heardBy = new Map<Activity, string[]>();
    activity().onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 });
    for (const word of text.split(' ')) {
      // eslint-disable-next-line no-await-in-loop -- the caller's pace
      await sleep(WORD_MS);
      const on = activity();
      if (on.shouldDiscardInputAudio()) continue;
      heardBy.set(on, [...(heardBy.get(on) ?? []), word]);
    }
    activity().onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
    await sleep(300); // the STT's final, after the end of speech
    const on = activity();
    const heard = heardBy.get(on)?.join(' ') ?? '';
    if (heard) {
      const now = Date.now();
      on.onFinalTranscript({
        type: 'final_transcript',
        alternatives: [{ text: heard, language: 'en', startTime: 0, endTime: 0, confidence: 1 }],
      });
      await on.onEndOfTurn({
        newTranscript: heard,
        transcriptConfidence: 1,
        transcriptionDelay: 0,
        endOfUtteranceDelay: 0,
        startedSpeakingAt: now - text.split(' ').length * WORD_MS,
        stoppedSpeakingAt: now,
      });
    }
    return heard;
  };

  // The request; the caller goes on as soon as Jordan's goodbye starts playing
  const goodbyeStarts = new Promise<void>((resolve) => {
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.newState === 'speaking') resolve();
    });
  });
  session.generateReply({ userInput: REQUEST });
  await goodbyeStarts;
  const heard = caller === 'talks' ? await speak(SENTENCE) : '';
  const started = Date.now();
  while (results.length === 0 && Date.now() - started < 15_000) await sleep(50);
  await sleep(caller === 'talks' ? 1500 : 4500); // the arrival reply, or greeting
  const ferniTalk = (agents.ferni?.chatCtx.items ?? []) as Item[];
  return { results, refused, heard, session, agents, calls: script.calls, ferniTalk, said };
}

const userLines = (items: Item[]) =>
  items.filter((i) => i.type === 'message' && i.role === 'user').map((i) => i.textContent ?? '');

describe('talking through a handoff goodbye (real AgentSession)', () => {
  beforeAll(async () => {
    initializeLogger({ pretty: false, level: 'silent' });
    await AgentDirectory.getEntry('ferni'); // the alias table, for canonical ids
  });
  beforeEach(() => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    vi.spyOn(
      AgentOrchestrator.prototype as unknown as { generateInitialGreeting: () => Promise<void> },
      'generateInitialGreeting'
    ).mockResolvedValue(undefined);
  });
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('HANDOFF_TALK_THROUGH off: the swap misses its deadline and the words are lost (the dev A/B)', async () => {
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
    const r = await call();

    expect(r.results).toEqual([
      { success: false, error: "Error: The handoff tool didn't swap within 8000ms" },
    ]);
    // The fast path's interrupt was "refused" by the goodbye, after it had cut the tool's speech
    expect(r.refused).toEqual(['Error: This generation handle does not allow interruptions']);
    expect(r.session.currentAgent).toBe(r.agents['jordan-taylor']); // Jordan stays
    expect(r.heard).not.toBe(SENTENCE); // audio discarded under the uninterruptible goodbye
    expect(userLines(r.ferniTalk).join(' ')).not.toContain('dentist');
    expect(r.calls.some((c) => c.noted)).toBe(false); // Jordan is never told (#2935)
  }, 40_000);

  it('off, with HANDOFF_FAILED_SAY_SO on: Jordan is told Ferni never joined, and says so (#2935)', async () => {
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
    vi.stubEnv('HANDOFF_FAILED_SAY_SO', 'on');
    const r = await call();

    expect(r.results).toEqual([
      { success: false, error: "Error: The handoff tool didn't swap within 8000ms" },
    ]);
    expect(r.session.currentAgent).toBe(r.agents['jordan-taylor']);
    // A reply after the failure, by Jordan, written with the note in the chat
    expect(r.calls.filter((c) => c.noted).map((c) => c.who)).toEqual(['Jordan']);
  }, 40_000);

  it('on: the handoff completes, the caller is heard in full, and Ferni (not Jordan) answers', async () => {
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'on');
    const r = await call();

    expect(r.results).toEqual([{ success: true, error: undefined }]);
    expect(r.refused).toEqual([]);
    expect(r.session.currentAgent).toBe(r.agents.ferni);
    expect(r.heard).toBe(SENTENCE); // the goodbye no longer discards their audio
    expect(userLines(r.ferniTalk)).toContain(SENTENCE); // in the new persona's context
    const toSentence = r.calls.filter((c) => c.lastUser === SENTENCE).map((c) => c.who);
    expect(toSentence).toEqual(['Ferni']); // Ferni answers it, once; Jordan never does
    // Jordan's goodbye stopped for the caller (never played out over them)
    const goodbye = r.said.filter((s) => s.text.startsWith("Ferni's perfect"));
    expect(goodbye.every((s) => s.interrupted)).toBe(true);
  }, 40_000);

  it('on, with a caller who waits: the goodbye plays out and the usual greeting follows', async () => {
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'on');
    const r = await call('waits');

    expect(r.results).toEqual([{ success: true, error: undefined }]);
    expect(r.session.currentAgent).toBe(r.agents.ferni);
    expect(r.said.map((s) => s.interrupted)).toEqual([false, false]); // goodbye, greeting
    expect(r.calls.map((c) => c.who)).toEqual(['Jordan']); // the greeting is the scripted one
  }, 40_000);
});
