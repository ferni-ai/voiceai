/**
 * Crisis gate for the live voice reply.
 *
 * Every persona reply goes through PersonaVoiceAgent.llmNode. Before the LLM is
 * asked, the crisis guard's patterns decide instantly:
 *   replace — speak the crisis script instead of the model's reply
 *   guide   — add crisis guidance to this request (buildCrisisGuidance)
 *   pass    — nothing to do
 *
 * The semantic classifier (services/safety/crisis-classifier.ts) starts at the
 * same moment, in parallel with the LLM. While its verdict is pending the
 * reply stream is held, not spoken; when it escalates the decision, the held
 * reply is dropped and the caller hears the script, or a reply regenerated
 * with guidance. Both take about the same time to first output, so a turn
 * without risk waits at most the difference.
 *
 * CRISIS_GUARD_MODE (crisis-shadow.ts) turns the gate off or to shadow;
 * CRISIS_CLASSIFIER_MODE governs the classifier stage. Logs carry the
 * decision, never the caller's words.
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import {
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../../services/safety/crisis-classifier.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import {
  applyClassifierVerdict,
  buildCrisisGuidance,
  detectCrisis,
  guardFromDetection,
  type CrisisDetectionResult,
} from '../safety/crisis-guard.js';
import {
  resolveCrisisGuardMode,
  toGuardVoiceEmotion,
  type ProsodyEmotionLike,
} from '../safety/crisis-shadow.js';
import { withToolLeadIn } from './tool-lead-in.js';
import { withTurnReminder } from './turn-request.js';
import { withTurnStyleReminder } from './turn-style.js';

const log = createLogger({ module: 'CrisisGate' });

export type CrisisGateDecision =
  | { action: 'pass' }
  | { action: 'guide'; guidance: string }
  | { action: 'replace'; script: string };

export interface CrisisGateTurn {
  /** What the patterns decided, before the LLM is asked. */
  decision: CrisisGateDecision;
  /** A stronger decision from the classifier, or null; absent when it cannot escalate. */
  escalation: Promise<CrisisGateDecision | null> | null;
}

type Chunk = llm.ChatChunk | string | object;

const RANK = { pass: 0, guide: 1, replace: 2 } as const;

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/**
 * The caller's words this reply answers, their earlier messages (oldest
 * first), and what Ferni said just before: the line those words answer.
 */
function callerWords(chatCtx: llm.ChatContext): {
  latest: string;
  earlier: string[];
  companion?: string;
} {
  const said: string[] = [];
  const latest: string[] = [];
  let companion: string | undefined;
  let answering = true;
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i] as MessageView;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') {
      if (answering) companion = item.textContent?.trim() || undefined;
      answering = false;
      continue;
    }
    const text = item.textContent?.trim();
    if (item.role !== 'user' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    (answering ? latest : said).unshift(text);
  }
  return { latest: latest.join(' '), earlier: said, companion };
}

export function decisionFor(crisis: CrisisDetectionResult): CrisisGateDecision {
  if (guardFromDetection(crisis).shouldBlock && crisis.suggestedResponse) {
    return { action: 'replace', script: crisis.suggestedResponse };
  }
  if (crisis.isCrisis) return { action: 'guide', guidance: buildCrisisGuidance(crisis) };
  return { action: 'pass' };
}

/**
 * Decide this reply's crisis handling from the request about to go to the LLM.
 * Null when the gate is off or in shadow, or there are no caller words.
 */
export function startCrisisGate(
  chatCtx: llm.ChatContext,
  userData: unknown,
  options: { env?: Record<string, string | undefined>; generate?: CrisisGenerateFn } = {}
): CrisisGateTurn | null {
  const { env = process.env, generate } = options;
  if (resolveCrisisGuardMode(env) !== 'live') return null;
  const { latest, earlier, companion } = callerWords(chatCtx);
  if (!latest) return null;

  const voiceEmotion = (userData as { voiceEmotion?: ProsodyEmotionLike } | undefined)
    ?.voiceEmotion;
  const detection = detectCrisis(latest, toGuardVoiceEmotion(voiceEmotion), {
    recentMessages: earlier,
  });
  const decision = decisionFor(detection);
  if (decision.action !== 'pass') {
    log.info(
      { action: decision.action, source: 'patterns', indicators: detection.indicators },
      'CRISIS_GATE'
    );
  }

  const pattern =
    decision.action === 'replace' ? 'block' : decision.action === 'guide' ? 'crisis' : 'none';
  const run = startCrisisClassifier({ latest, earlier, companion }, { pattern, env, generate });
  if (run?.mode !== 'live' || decision.action === 'replace') return { decision, escalation: null };

  const escalation = run.verdict.then((verdict): CrisisGateDecision | null => {
    const merged = applyClassifierVerdict(detection, verdict);
    if (merged === detection) return null;
    const stronger = decisionFor(merged);
    if (RANK[stronger.action] <= RANK[decision.action]) return null;
    log.info(
      { action: stronger.action, source: 'classifier', indicators: merged.indicators },
      'CRISIS_GATE'
    );
    return stronger;
  });
  return { decision, escalation };
}

/** A reply stream that speaks one fixed text. */
export function textReply(text: string): ReadableStream<Chunk> {
  return new ReadableStream<Chunk>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

/**
 * Hold the model's reply until the escalation settles. No escalation: release
 * what was held and pass the rest through. An escalation: drop the reply and
 * stream the replacement instead.
 */
export function holdUntilCleared(
  reply: ReadableStream<Chunk>,
  escalation: Promise<CrisisGateDecision | null>,
  replacement: (decision: CrisisGateDecision) => Promise<ReadableStream<Chunk> | null>
): ReadableStream<Chunk> {
  const reader = reply.getReader();
  let dropped = false;
  return new ReadableStream<Chunk>({
    async start(controller) {
      const held: Chunk[] = [];
      let firstHeldAt = 0;
      let released = false;
      let pumpError: unknown;
      const pump = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || dropped) return;
          if (released) controller.enqueue(value);
          else if (held.push(value) === 1) firstHeldAt = Date.now();
        }
      })().catch((error: unknown) => {
        pumpError = error;
      });

      try {
        const decision = await escalation.catch(() => null);
        if (!decision) {
          released = true;
          // How long a ready reply waited on the classifier: the latency this gate adds.
          log.info({ delayedMs: firstHeldAt ? Date.now() - firstHeldAt : 0 }, 'CRISIS_HOLD');
          for (const chunk of held) controller.enqueue(chunk);
          held.length = 0;
          await pump;
          if (pumpError !== undefined) throw pumpError;
          controller.close();
          return;
        }
        dropped = true;
        await reader.cancel().catch(() => undefined);
        const next = await replacement(decision);
        if (next)
          for await (const chunk of next as unknown as AsyncIterable<Chunk>)
            controller.enqueue(chunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      dropped = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

/**
 * One persona reply through the gate: the crisis script instead of the model,
 * or the model asked with the turn reminder (plus crisis guidance when the
 * patterns call for it) and held until the classifier clears it. The opener
 * gate trims the model's words only, never a crisis script; a look-up the
 * model called without a word gets a short spoken lead-in (tool-lead-in.ts).
 */
export async function gatedReply(
  chatCtx: llm.ChatContext,
  session: { userData: unknown },
  model: (ctx: llm.ChatContext) => Promise<ReadableStream<Chunk> | null>,
  openerGate: { wrap(stream: ReadableStream<Chunk>): ReadableStream<Chunk> },
  options: { env?: Record<string, string | undefined>; generate?: CrisisGenerateFn } = {}
): Promise<ReadableStream<Chunk> | null> {
  const { env = process.env } = options;
  const gate = startCrisisGate(chatCtx, session.userData, options);
  if (gate?.decision.action === 'replace') return textReply(gate.decision.script);

  // A reply with crisis guidance keeps the plain style reminder: a per-turn
  // shape ("six words at most") must never hold it back.
  const plain = (): llm.ChatContext => withTurnReminder(chatCtx, session, { shape: false });
  const ctx =
    gate?.decision.action === 'guide'
      ? withTurnStyleReminder(plain(), gate.decision.guidance)
      : withTurnReminder(chatCtx, session);
  const ask = async (request: llm.ChatContext): Promise<ReadableStream<Chunk> | null> => {
    const stream = await model(request);
    if (!stream) return stream;
    const trimmed = env.OPENER_GATE !== 'off' ? openerGate.wrap(stream) : stream;
    return withToolLeadIn(trimmed, chatCtx, session, env);
  };
  const reply = await ask(ctx);
  if (!reply || !gate?.escalation) return reply;
  return holdUntilCleared(reply, gate.escalation, async (decision) => {
    if (decision.action === 'replace') return textReply(decision.script);
    if (decision.action === 'pass') return null;
    return ask(withTurnStyleReminder(plain(), decision.guidance));
  });
}
