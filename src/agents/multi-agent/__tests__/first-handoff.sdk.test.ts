/**
 * The first handoff of a call (HANDOFF_FIRST_FIX, missed-greeting-end.ts), on a real
 * LiveKit AgentSession: the real orchestrator (opening greeting, goodbye, swap, arrival),
 * the real speech coordinator every scripted line goes through (agent-setup.ts `say` is
 * coordinatedSay), the real deferred wiring after the greeting (GREETING_WIRE_AFTER=on,
 * as on dev) of the real session-state handler, the real live-call behaviors (the turn
 * keeper among them), and the real handoff tool path (the SDK runs the tool and swaps
 * the persona in). Only the LLM, TTS, room audio, the greeting's words and the caller's
 * voice are scripted.
 *
 * The caller is handoff-every-teammate's first line (voiceai-evidence/
 * release-check-2026-10-18, AJ_BaQpMifqtn6c): after Ferni's greeting, "Hey Ferni, can I
 * talk to Maya about my mornings?", which Ferni answers with softTeamIntro, then
 * handoffToMaya. On dev the goodbye never played, 11 s passed before Maya spoke, and
 * Maya arrived twice.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../resume-after-drop.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../resume-after-drop.js')>()),
  greetingOrResume: async () => "Hey Sam, good evening. What's on your mind tonight?",
}));

import { AgentDirectory } from '../../../personas/agent-directory.js';
import { handoffEvents } from '../../../handoff/index.js';
import {
  cleanupSpeechCoordination,
  coordinatedSay,
  initializeSpeechCoordination,
} from '../../../speech/coordination/session-integration.js';
import { resetSpeechCoordinator } from '../../../speech/coordination/speech-coordinator.js';
import { handoffToolResponse } from '../../../tools/handoff/handoff-tool-response.js';
import { holdHandoffThroughTalk } from '../../../tools/handoff/held-handoff-speech.js';
import {
  setupSessionStateHandlers,
  type SessionStateContext,
} from '../../voice-agent/session-state-handler.js';
import { markSessionReady } from '../../shared/generate-reply-gateway.js';
import { interruptionOverrides } from '../interruption-config.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';
import { runLlmHandoff } from '../llm-handoff.js';
import { handleHandoffFromDataChannel } from '../multi-agent-entry.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';
import { PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

const SESSION = 'first-handoff-sdk-test';
const REQUEST = 'Hey Ferni, can I talk to Maya about my mornings?';
const WORD_MS = 300;
const LLM_MS = 300;
/** Dead air the caller may hear between asking and Maya's first line */
const GAP_BUDGET_MS = 2_000;
/** Dev's lines on that call (the orchestrator picks among several) */
const GOODBYE = "Let me get Maya for you. <break time='300ms'/> She's wonderful with mornings.";
const GREETING = "Hi! Maya. Tell me where you're at.";
const RECOVERED = 'Maya: mornings can be rough.'; // what the turn keeper's replay gets

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

type Item = { type: string; role?: string; textContent?: string; name?: string };

class ScriptLLM extends llm.LLM {
  calls: Array<'Ferni' | 'Maya' | '?'> = [];
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    const items = p.chatCtx.items as Item[];
    const system = items
      .filter((i) => i.type === 'message' && i.role !== 'user' && i.role !== 'assistant')
      .map((i) => i.textContent ?? '')
      .join(' ');
    const who = /You are Ferni/.test(system) ? 'Ferni' : /You are Maya/.test(system) ? 'Maya' : '?';
    this.calls.push(who);
    const called = (name: string) =>
      items.some((i) => i.type === 'function_call' && i.name === name);
    const tool = (name: string, args: object): llm.ChatChunk => ({
      id: 'r',
      delta: {
        role: 'assistant',
        toolCalls: [
          llm.FunctionCall.create({
            callId: `call_${this.calls.length}`,
            name,
            args: JSON.stringify(args),
          }),
        ],
      },
    });
    // As on dev: Ferni answers the request with tools only
    const chunk: llm.ChatChunk =
      who === 'Ferni' && !called('softTeamIntro')
        ? tool('softTeamIntro', { teammate_specialty: 'habits' })
        : who === 'Ferni' && !called('handoffToMaya')
          ? tool('handoffToMaya', { reason: 'Sam asked to talk to Maya about mornings' })
          : { id: 'r', delta: { role: 'assistant', content: `${who}: mornings can be rough.` } };
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
  onStartOfSpeech(ev: { speechDuration: number; inferenceDuration: number }): void;
  onEndOfSpeech(ev: { silenceDuration: number; inferenceDuration: number }): void;
  onFinalTranscript(ev: unknown): void;
  onEndOfTurn(info: unknown): Promise<boolean>;
}

const cleanups: Array<() => Promise<void> | void> = [];

/** A no-op for every method the session-state handler calls on it */
const quietManager = new Proxy({}, { get: () => () => false });

async function firstHandoff() {
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
  const handlerCleanups: Array<() => void> = [];
  cleanups.push(
    () => handlerCleanups.forEach((c) => c()),
    () => out.close(),
    () => session.close().catch(() => undefined),
    () => cleanupSpeechCoordination(SESSION)
  );
  const activity = () => (session as unknown as { _activity: Activity })._activity;

  // What the caller heard: each span of agent speech, and each line, in order
  const spans: Array<{ start: number; end?: number }> = [];
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    if (ev.newState === 'speaking') spans.push({ start: Date.now() });
    else if (ev.oldState === 'speaking') spans[spans.length - 1].end = Date.now();
  });
  const said: Array<{ text: string; at: number }> = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const it = ev.item as Item;
    if (it.type === 'message' && it.role === 'assistant')
      said.push({ text: it.textContent ?? '', at: Date.now() });
  });

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
  const softTeamIntro = llm.tool({
    description: 'Introduce a teammate',
    parameters: z.object({ teammate_specialty: z.string() }),
    execute: async () => 'All teammates are already unlocked.',
  });
  // As handoff-factory.ts: the executor emits voiceSwitch and waits for the handler
  const handoffToMaya = llm.tool({
    description: 'Hand the caller to Maya',
    parameters: z.object({ reason: z.string() }),
    execute: holdHandoffThroughTalk(async () => {
      const handled = new Promise<{ success: boolean; error?: string }>((resolve) => {
        const done = (ev: { success: boolean; error?: string }) => {
          handoffEvents.off('handoffHandlerComplete', done);
          resolve(ev);
        };
        handoffEvents.on('handoffHandlerComplete', done);
      });
      void runLlmHandoff(handoffCall, { persona: { id: 'maya-santos' } });
      const ev = await handled;
      return handoffToolResponse(
        { ...ev, targetAgent: 'maya-santos', targetAgentName: 'Maya' } as never,
        'Maya',
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
      const ferni = personaId === 'ferni';
      const agent = new voice.Agent({
        instructions: `You are ${ferni ? 'Ferni' : 'Maya'}.`,
        tools: ferni ? { softTeamIntro, handoffToMaya } : {},
      });
      agents[personaId] = agent;
      if (!context.callSession) {
        userData.personaId = personaId;
        await session.start({ agent });
        // As agent-setup.ts: coordination and the live-call behaviors at setup...
        initializeSpeechCoordination({ session, sessionId: SESSION, personaId });
        const sessionEventHandlers: Array<{ event: string; handler: () => void }> = [];
        installLiveCallBehaviors({
          session,
          sessionWithEvents: session as never,
          sessionEventHandlers,
          cleanupFunctions: handlerCleanups,
          sessionId: SESSION,
          userId: 'u1',
        });
        const events = session as unknown as { off: (e: string, h: () => void) => void };
        handlerCleanups.push(() =>
          sessionEventHandlers.forEach(({ event, handler }) => events.off(event, handler))
        );
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
        // ...the agent's say is coordinatedSay...
        say: (text: string, opts?: { allowInterruptions?: boolean }) =>
          coordinatedSay(SESSION, text, { allowInterruptions: opts?.allowInterruptions ?? true }),
        // ...and the session-state handler is among the handlers wired after the greeting
        wireHandlers: context.callSession
          ? undefined
          : async () => {
              const state = setupSessionStateHandlers({
                session,
                sessionPersona: { id: personaId, name: 'Ferni' },
                conversationManager: quietManager,
                userData: {},
                sessionId: SESSION,
              } as unknown as SessionStateContext);
              handlerCleanups.push(() => state.clearTimers());
            },
        setMuted: () => undefined,
        interrupt: () => session.interrupt(),
      } as never;
    },
  } as never);
  made.orchestrator = orchestrator;

  // Ferni's greeting plays, and the deferred handlers are wired after it
  const greeted = new Promise<void>((resolve) => {
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.oldState === 'speaking') resolve();
    });
  });
  await orchestrator.start('ferni');
  markSessionReady(SESSION);
  await greeted;
  await sleep(1500); // the caller takes a moment

  // The caller's request, through the activity as the STT delivers it
  const words = REQUEST.split(' ').length;
  activity().onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 });
  await sleep(words * WORD_MS);
  activity().onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
  const askedAt = Date.now();
  await sleep(300); // the STT's final, after the end of speech
  activity().onFinalTranscript({
    type: 'final_transcript',
    alternatives: [{ text: REQUEST, language: 'en', startTime: 0, endTime: 0, confidence: 1 }],
  });
  await activity().onEndOfTurn({
    newTranscript: REQUEST,
    transcriptConfidence: 1,
    transcriptionDelay: 0,
    endOfUtteranceDelay: 0,
    startedSpeakingAt: askedAt - words * WORD_MS,
    stoppedSpeakingAt: askedAt,
  });

  const started = Date.now();
  while (results.length === 0 && Date.now() - started < 20_000) await sleep(50);
  await sleep(12_000); // past the turn keeper's grace, a recovered reply, and any late line

  // Dead air: from the caller's last word, between each line heard, up to Maya's first
  const after = spans.filter((s) => s.start > askedAt);
  const edges = [askedAt, ...after.flatMap((s) => [s.start, s.end ?? s.start])];
  const gaps = after.map((s, i) => s.start - edges[2 * i]);
  const lines = said.filter((s) => s.at > askedAt).map((s) => s.text);
  return { results, lines, gaps, calls: script.calls, session, agents };
}

describe('the first handoff of a call (real AgentSession + coordinator)', () => {
  beforeAll(async () => {
    initializeLogger({ pretty: false, level: 'silent' });
    await AgentDirectory.getEntry('ferni'); // the alias table, for canonical ids
  });
  beforeEach(() => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    vi.stubEnv('GREETING_WIRE_AFTER', 'on'); // as on dev
    vi.stubEnv('BRIEFED_HANDOFF', 'off'); // scripted lines, no director call
    vi.stubEnv('TURN_KEEPER', 'on');
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', 'maya'); // the eval caller's tier unlocks her on dev
    const lines = AgentOrchestrator.prototype as unknown as Record<string, () => string>;
    vi.spyOn(lines, 'getGoodbyePhrase').mockReturnValue(GOODBYE);
    vi.spyOn(lines, 'getGreetingPhrase').mockReturnValue(GREETING);
  });
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
    resetSpeechCoordinator();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('HANDOFF_FIRST_FIX off: seconds of silence, Maya answers first, then a stale handoff line (dev)', async () => {
    vi.stubEnv('HANDOFF_FIRST_FIX', 'off');
    const r = await firstHandoff();

    expect(r.results).toEqual([{ success: true, error: undefined }]);
    expect(r.session.currentAgent).toBe(r.agents['maya-santos']);
    expect(r.gaps[0]).toBeGreaterThan(GAP_BUDGET_MS); // nothing until the turn keeper
    expect(r.calls).toEqual(['Ferni', 'Ferni', 'Maya']); // ...replays the caller's turn on Maya
    expect(r.lines[0]).toBe(RECOVERED); // the first voice is Maya's, not Ferni's goodbye
    // Then whichever scripted line hasn't expired in the coordinator's queue (10 s): on dev
    // the greeting (a second arrival), here the goodbye, after Maya has already spoken
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    for (const late of r.lines.slice(1)) expect(late).toMatch(/^(Let me get Maya|Hi! Maya)/);
  }, 60_000);

  it('on: Ferni says goodbye before the swap, no gap reaches 2 s, and Maya arrives once', async () => {
    vi.stubEnv('HANDOFF_FIRST_FIX', 'on');
    const r = await firstHandoff();

    expect(r.results).toEqual([{ success: true, error: undefined }]);
    expect(r.session.currentAgent).toBe(r.agents['maya-santos']);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatch(/^Let me get Maya for you\b/); // Ferni's goodbye, first
    expect(r.lines[1]).toBe(GREETING); // one arrival
    expect(r.calls).toEqual(['Ferni', 'Ferni']); // nothing replayed the caller's turn
    expect(r.gaps).toHaveLength(2); // asked -> goodbye, goodbye -> greeting
    expect(Math.max(...r.gaps)).toBeLessThan(GAP_BUDGET_MS);
  }, 60_000);
});
