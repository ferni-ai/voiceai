/**
 * Whether the reply a TTS node is voicing will be played: the gate for a
 * preemptive reply synthesized before the caller's turn is committed.
 *
 * PREEMPTIVE_TTS=on (multi-agent/preemptive-tts.ts) has LiveKit run our
 * ttsNode, and so the gateway and Cartesia, for its preemptive reply as soon
 * as the LLM starts. The SDK plays that audio only once the reply is
 * scheduled, at the commit, and drops it unheard when the final transcript
 * differs. The gateway can't tell: its first audio is marked when Cartesia
 * answers (first-audio-observer.ts), so a dropped reply would set the turn
 * receipt's ttsTtfbMs and the reply-activity marks, and its Cartesia context
 * would run to the end of the reply although nobody hears it.
 *
 * LiveKit runs each reply's ttsNode inside its SpeechHandle's async context
 * (agent_activity.js pipelineReplyTask: speechHandleStorage.enterWith). The
 * storage is not exported, so it is read from the SDK's own module file, the
 * one its index imports. The gate is null for a reply that is already
 * scheduled, which is every reply when PREEMPTIVE_TTS is off: nothing waits.
 *
 * @module speech/tts-gateway/preemptive-reply-gate
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { flagOn, type Env } from '../../config/env-flag.js';
import { setReplySideEffectGate } from '../../utils/reply-side-effects.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PreemptiveReplyGate' });

/** The slice of LiveKit's SpeechHandle the gate reads. */
interface ReplySpeech {
  readonly scheduled: boolean;
  readonly interrupted: boolean;
  waitIfNotInterrupted: (aw: Array<Promise<unknown>>) => Promise<void>;
  addDoneCallback: (callback: () => void) => void;
  _waitForScheduled: () => Promise<void>;
}

interface SpeechStorage {
  getStore: () => ReplySpeech | undefined;
}

let storage: SpeechStorage | null = null;
let loading: Promise<void> | undefined;

/** Load LiveKit's speech-handle storage once. A failure leaves every reply ungated. */
export async function loadReplySpeech(): Promise<void> {
  loading ??= (async () => {
    try {
      const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
      const agentModule = (await import(pathToFileURL(join(dist, 'voice', 'agent.js')).href)) as {
        speechHandleStorage?: SpeechStorage;
      };
      storage = agentModule.speechHandleStorage ?? null;
    } catch (error) {
      log.warn({ error: String(error) }, 'speech handle storage not loaded');
    }
    if (!storage) log.warn({}, 'PREEMPTIVE_TTS: replies are not gated on the commit');
  })();
  return loading;
}

if (flagOn('PREEMPTIVE_TTS')) void loadReplySpeech();

/** One gate per reply, however many side effects wait on it. */
const gates = new WeakMap<ReplySpeech, Promise<boolean>>();

/**
 * For the reply this async context is voicing: null when it is already
 * scheduled (or PREEMPTIVE_TTS is off), else a promise that resolves true
 * once LiveKit schedules it and false when it is dropped first.
 */
export function preemptiveReplyGate(env: Env = process.env): Promise<boolean> | null {
  if (!flagOn('PREEMPTIVE_TTS', env)) return null;
  const speech = storage?.getStore();
  if (!speech || speech.scheduled) return null;
  let gate = gates.get(speech);
  if (!gate) {
    gate = new Promise<boolean>((resolve) => {
      const settle = (): void => resolve(speech.scheduled && !speech.interrupted);
      speech.addDoneCallback(settle);
      speech.waitIfNotInterrupted([speech._waitForScheduled()]).then(settle, settle);
    });
    gates.set(speech, gate);
  }
  return gate;
}

/**
 * Run a side effect of voicing a reply: now, or for a preemptive reply once
 * LiveKit schedules it, and never if LiveKit drops it. Installed behind the
 * utils/reply-side-effects.ts port, which speech code calls.
 */
export function gateReplySideEffect(effect: () => void, env: Env = process.env): void {
  const gate = preemptiveReplyGate(env);
  if (!gate) {
    effect();
    return;
  }
  void gate.then((plays) => {
    if (!plays) return;
    try {
      effect();
    } catch (error) {
      log.warn({ error: String(error) }, 'deferred reply side effect failed');
    }
  });
}

setReplySideEffectGate(gateReplySideEffect);
