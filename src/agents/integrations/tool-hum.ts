/**
 * Ferni hums softly while a tool is working.
 *
 * A weather lookup or a music search can leave the line silent for a few
 * seconds. A person looking something up hums to themselves. Once a tool has
 * been running for a beat with nobody speaking, he hums quietly; the moment he
 * starts talking, the caller speaks, or the result is in, the hum stops. At
 * most twice a call, never on two tool calls in a row, never when their voice
 * read heavy or what they said lately was (presence-heavy.ts).
 *
 * TOOL_HUM=on turns it on (off until it has been listened to on dev).
 *
 * "A tool is running" comes from the SDK itself (@livekit/agents 1.5.1): every
 * reply's SpeechHandle is announced by SpeechCreated, and the SDK hands each
 * FunctionCall to that handle's item callbacks the moment it starts executing
 * it (performToolExecutions → onToolExecutionStarted, dist/voice/generation.js
 * :797 → speechHandle._itemAdded, dist/voice/agent_activity.js:2208), then its
 * FunctionCallOutput when it completes. FunctionToolsExecuted and the handle
 * finishing are the backstops for "done".
 *
 * @module agents/integrations/tool-hum
 */

import { voice, type llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { synthHum } from './presence-sounds.js';
import { stayQuietOn } from '../shared/call-farewell.js';
import { presenceSilenceIsHeavy } from './presence-heavy.js';
import { isHeavyMood } from './presence-watcher.js';
import { voicedHumFor, voicedPresenceEnabled, type VoicedHum } from './voiced-presence.js';

const log = createLogger({ module: 'ToolHum' });

export function toolHumEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TOOL_HUM === 'on';
}

/** Quiet with a tool running before he hums. */
export const TOOL_HUM_DELAY_MS = 1200;
export const TOOL_HUM_MAX_PER_CALL = 2;
/** Under his breath: quieter than the idle whistle/hum (0.5). */
const TOOL_HUM_VOLUME = 0.35;
/** 24 kHz s16le: 48 bytes per millisecond. */
const PCM_BYTES_PER_MS = 48;

export interface ToolHumDeps {
  play: () => boolean;
  stop: () => void;
  /** The caller's voice this turn (userData.voiceEmotion), if read. */
  mood: () => string | undefined;
  /** What they said lately was heavy, or the call has crisis risk (presence-heavy.ts). */
  serious?: () => boolean;
  /** The call has said its goodbyes or is closing (call-farewell.ts). */
  quiet?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createToolHumWatcher(deps: ToolHumDeps) {
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const running = new Set<string>();
  let agent = 'initializing';
  let user = 'listening';
  let hums = 0;
  let hummedThisRun = false;
  let hummedLastRun = false;
  let playing = false;
  let timer: unknown = null;

  const allowed = () =>
    running.size > 0 &&
    agent !== 'speaking' &&
    user !== 'speaking' &&
    !hummedThisRun &&
    !hummedLastRun &&
    hums < TOOL_HUM_MAX_PER_CALL;

  const cancel = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const hush = () => {
    cancel();
    if (playing) deps.stop();
    playing = false;
  };
  const update = () => {
    if (!allowed()) return cancel();
    if (timer !== null) return;
    timer = setT(() => {
      timer = null;
      if (!allowed() || isHeavyMood(deps.mood()) || deps.serious?.() || deps.quiet?.()) return;
      if (deps.play()) {
        hums++;
        hummedThisRun = true;
        playing = true;
      }
    }, TOOL_HUM_DELAY_MS);
  };

  return {
    toolStarted(callId: string): void {
      if (running.size === 0) {
        hummedLastRun = hummedThisRun;
        hummedThisRun = false;
      }
      running.add(callId);
      update();
    },
    toolFinished(callId: string): void {
      if (!running.delete(callId) || running.size > 0) return;
      hush();
    },
    onAgentState(state: string): void {
      agent = state;
      if (state === 'speaking') hush();
      else update();
    },
    onUserState(state: string): void {
      user = state;
      if (state === 'speaking') hush();
      else update();
    },
    get hums(): number {
      return hums;
    },
    close: cancel,
  };
}

/** The slice of ClipPlayer the hum needs (kept structural: clip-player imports this module). */
export interface HumPlayer {
  play: (pcm: ArrayBuffer, volume?: number) => boolean;
  stop: () => void;
}

/**
 * Wire the tool hum to a session's clip track. Returns the cleanup; a no-op
 * unless TOOL_HUM=on. VOICED_PRESENCE=on: a voiced take on its track, or nothing.
 * `onPlayed` hears each hum that starts, and whether it is the voiced take (sound-signal.ts).
 */
export function startToolHum(
  session: voice.AgentSession,
  player: HumPlayer,
  env: Record<string, string | undefined> = process.env,
  voiced: () => VoicedHum | undefined = () => voicedHumFor(session),
  onPlayed: (voicedTake: boolean) => void = () => {}
): () => void {
  if (!toolHumEnabled(env)) return () => {};
  let humEndsAt = 0;
  let out: HumPlayer = player;
  const watcher = createToolHumWatcher({
    play: () => {
      // VOICED_PRESENCE: a kept take or nothing; Seth rejected the synthesized hum.
      const hum = voicedPresenceEnabled(env) ? voiced() : undefined;
      if (voicedPresenceEnabled(env) && !hum) return false;
      out = hum ?? player;
      const pcm = hum ? hum.next() : synthHum();
      if (!pcm || !out.play(pcm, TOOL_HUM_VOLUME)) return false;
      humEndsAt = Date.now() + pcm.byteLength / PCM_BYTES_PER_MS;
      log.info({ voiced: Boolean(hum) }, 'TOOL_HUM');
      onPlayed(Boolean(hum));
      return true;
    },
    // Only stop our own hum, never a backchannel that started after it ended.
    stop: () => {
      if (Date.now() < humEndsAt) out.stop();
      humEndsAt = 0;
    },
    mood: () =>
      (session.userData as { voiceEmotion?: { primary?: string } } | undefined)?.voiceEmotion
        ?.primary,
    serious: () => presenceSilenceIsHeavy(session),
    quiet: () => stayQuietOn(session),
  });

  const onSpeech = (ev: voice.SpeechCreatedEvent) => {
    const handle = ev.speechHandle;
    const mine = new Set<string>();
    const onItem = (item: llm.ChatItem) => {
      if (item.type === 'function_call') {
        mine.add(item.callId);
        watcher.toolStarted(item.callId);
      } else if (item.type === 'function_call_output') {
        mine.delete(item.callId);
        watcher.toolFinished(item.callId);
      }
    };
    handle._addItemAddedCallback(onItem);
    handle.addDoneCallback(() => {
      handle._removeItemAddedCallback(onItem);
      mine.forEach((id) => watcher.toolFinished(id));
    });
  };
  const onToolsDone = (ev: voice.FunctionToolsExecutedEvent) =>
    ev.functionCalls.forEach((c) => watcher.toolFinished(c.callId));
  const onAgent = (ev: { newState?: string }) => watcher.onAgentState(ev.newState ?? '');
  const onUser = (ev: { newState?: string }) => watcher.onUserState(ev.newState ?? '');

  session.on(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, onToolsDone);
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
  session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  return () => {
    watcher.close();
    session.off(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
    session.off(voice.AgentSessionEventTypes.FunctionToolsExecuted, onToolsDone);
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
    session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  };
}
