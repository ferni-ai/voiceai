/**
 * EOT_CONTINUED_MERGE=on: fold Ink's late last words of turn 1 into that turn.
 *
 * FIRST_TURN_FAST ends turn 1 on local silence; Ink's last word can still
 * arrive later ("...kind of a long" then "day.", 140-1030 ms after the early
 * end on dev). Today those words open a new turn (first-turn-fast.ts): the
 * SDK interrupts the reply it is generating, the noise filter calls
 * session.interrupt() on the instant start/end, and a second request starts
 * ~270-370 ms later, answering the turn as two user messages. Dev 2026-10-11:
 * 2 of 2 early ends went this way, each time with one late word.
 *
 * When the late words are a short tail (MAX_LATE_WORDS, no question, no
 * negation, no crisis signal in the whole sentence) and Ferni has not started
 * speaking, they are appended to the turn's user message in the chat context
 * instead, and the reply already in flight continues. Anything else, once
 * Ferni speaks, or with a negative voice reading, keeps the new-turn behaviour.
 *
 * The reply in flight was crisis-gated on the words before the tail, so the
 * merged sentence is gated again in the background with CrisisGate's own
 * patterns and classifier (startCrisisGate). Anything but 'pass' interrupts
 * that reply: the crisis script is spoken, or a reply with crisis guidance is
 * generated (the crisis reply wins).
 *
 * @module agents/personas/late-words
 */

import { llm } from '@livekit/agents';
import type { CrisisGenerateFn } from '../../services/safety/crisis-classifier.js';
import { createLogger } from '../../utils/safe-logger.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { toGuardVoiceEmotion, type ProsodyEmotionLike } from '../safety/crisis-shadow.js';
import { LATE_WORDS_MERGED, type LateWordsMergedEvent } from '../shared/late-words-event.js';
import { callerWords, startCrisisGate } from './crisis-gate.js';
import { recordCrisisOnCall, replaceKind } from '../safety/crisis-event-record.js';
import { watchCheck } from '../../services/safety/crisis-classifier-check-turn.js';
import { sessionScope } from './crisis-gate-words.js';

const log = createLogger({ module: 'LateWords' });

/** Longer tails are the caller going on, not Ink catching up: they stay a new turn. */
export const MAX_LATE_WORDS = 3;

export function eotContinuedMergeEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.EOT_CONTINUED_MERGE === 'on';
}

/** Whether a tail could join the turn without changing what the reply must answer. */
export function isMergeableTail(tail: string[], said: string, voiceEmotion?: unknown): boolean {
  if (tail.length === 0 || tail.length > MAX_LATE_WORDS) return false;
  const text = tail.join(' ');
  if (/\?/.test(text) || /\b(not|no|never|nor)\b|n't\b/i.test(text)) return false;
  const voice = toGuardVoiceEmotion(voiceEmotion as ProsodyEmotionLike | undefined);
  const crisis = detectCrisis(`${said} ${text}`, voice);
  return !crisis.isCrisis && crisis.severity === 0 && crisis.indicators.length === 0;
}

interface VoiceReading {
  primary?: string;
  valence?: number;
  stressLevel?: number;
  anxietyMarkers?: boolean;
}

const NEGATIVE_VOICE = new Set(['sad', 'angry', 'fearful', 'anxious', 'contempt', 'disgusted']);

/** The caller sounds low, tense or afraid: their words are not merged quietly. */
export function negativeVoice(reading: unknown): boolean {
  const v = reading as VoiceReading | undefined;
  if (!v) return false;
  return (
    NEGATIVE_VOICE.has(v.primary ?? '') ||
    (v.valence ?? 0) < -0.3 ||
    (v.stressLevel ?? 0) >= 0.5 ||
    v.anxietyMarkers === true
  );
}

export interface LateWordsMerger {
  /** A tail may be held to join the turn: short, plain, calm, and Ferni not speaking. */
  mergeable: (tail: string[], said: string) => boolean;
  /** Appends `tail` to the user message `said`; false when it cannot (then: a new turn). */
  merge: (tail: string, said: string) => boolean;
}

interface ItemView {
  id: string;
  type?: string;
  role?: string;
  textContent?: string;
  createdAt?: number;
}

interface MergeAgent {
  readonly chatCtx: { copy(): { items: ItemView[] } };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/** The AgentSession calls a merge needs; all optional so a partial session degrades to no merge. */
export interface MergeSession {
  readonly agentState?: string;
  readonly userData?: unknown;
  interrupt?(): unknown;
  say?(text: string): unknown;
  generateReply?(options: { instructions: string }): unknown;
  emit?(event: string, ...args: unknown[]): unknown;
}

const normalized = (text: string | undefined): string =>
  (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function lateWordsMerger(
  agent: MergeAgent,
  session: MergeSession,
  options: { env?: Record<string, string | undefined>; generate?: CrisisGenerateFn } = {}
): LateWordsMerger {
  const voice = () => (session.userData as { voiceEmotion?: unknown } | undefined)?.voiceEmotion;
  const open = () => session.agentState !== 'speaking' && !negativeVoice(voice());

  /** Gate the merged sentence as CrisisGate would; a crisis replaces the reply in flight. */
  const regate = async (ctx: unknown): Promise<void> => {
    const gate = startCrisisGate(ctx as llm.ChatContext, session.userData, options);
    if (!gate) return;
    const decision =
      gate.decision.action !== 'pass' ? gate.decision : await gate.escalation?.catch(() => null);
    if (!decision || decision.action === 'pass') return;
    log.warn({ action: decision.action }, 'EOT_CONTINUED_MERGE re-gated the merged turn');
    session.interrupt?.();
    if (decision.action === 'replace') session.say?.(decision.script);
    else session.generateReply?.({ instructions: decision.guidance });
    // CRISIS_CLASSIFIER_CHECK: a check spoken here is followed by the script after silence.
    const call = sessionScope(session.userData);
    watchCheck(session, call, { decision, escalation: null }, callerWords);
    // CRISIS_EVENT_RECORD: after the script is queued, on a later tick; never throws
    const reader = decision === gate.decision ? 'pattern' : 'classifier';
    recordCrisisOnCall(session, decision.action, reader, replaceKind(decision));
  };

  return {
    mergeable: (tail, said) => open() && isMergeableTail(tail, said, voice()),
    merge(tail, said) {
      if (!open()) return false;
      const ctx = agent.chatCtx.copy();
      const items = ctx.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]!;
        if (item.type !== 'message') continue;
        if (item.role === 'assistant') return false; // the reply is already in
        if (item.role !== 'user' || normalized(item.textContent) !== normalized(said)) continue;
        const merged = `${item.textContent ?? ''} ${tail}`.trim();
        items[i] = llm.ChatMessage.create({
          role: 'user',
          content: merged,
          id: item.id,
          createdAt: item.createdAt,
        }) as unknown as ItemView;
        agent
          .updateChatCtx(ctx)
          .catch((error: unknown) => log.warn({ error: String(error) }, 'late words merge failed'));
        // Turn intelligence (and its crisis signals) reads final transcripts: give it the whole turn.
        const event: LateWordsMergedEvent = { transcript: merged, isFinal: true };
        session.emit?.(LATE_WORDS_MERGED, event);
        regate(ctx).catch((error: unknown) =>
          log.warn({ error: String(error) }, 'late words re-gate failed')
        );
        log.info({ words: tail.split(/\s+/).length }, 'EOT_CONTINUED_MERGE merged');
        return true;
      }
      return false; // the turn's message is not in the context yet
    },
  };
}
