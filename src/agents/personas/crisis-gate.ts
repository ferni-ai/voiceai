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
  agreementOutcome,
  resolveCrisisAgreementGate,
  SOFT_CRISIS_CHECK,
} from '../../services/safety/crisis-agreement.js';
import {
  adjudicatedCheckin,
  resolveCrisisAdjudicatorMode,
  shadowAdjudication,
  startCrisisAdjudicator,
  type AdjudicatorLine,
} from '../../services/safety/crisis-adjudicator.js';
import {
  startCrisisClassifier,
  turnVerdicts,
  type CrisisGenerateFn,
} from '../../services/safety/crisis-classifier.js';
import { crisisRiskThisCall, noteCrisisRisk } from '../../services/safety/crisis-call-risk.js';
import {
  GROUNDED_LIGHT_TOUCH,
  groundedPriorRisk,
  groundedRelease,
} from '../../services/safety/crisis-grounded-release.js';
import {
  SCREEN_GENTLE_OFFER,
  screenAnswer,
  screenIdeation,
  withScreenPositive,
  screenReply,
} from '../../services/safety/crisis-grounded-screen.js';
import { transferRequestIsEveryday } from '../../services/safety/crisis-transfer-request.js';
import { startWhoRead } from '../../services/safety/crisis-who.js'; // THIRD_PARTY_SELF_HARM
import {
  callRiskBeforeTurn,
  loneImminentGoodbye,
} from '../../services/safety/crisis-lone-imminent.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
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
import { replyOpenedBySound } from '../integrations/turn-opening-sound.js';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../safety/crisis-gate-signal.js';
import { holdCommitmentInvite } from './commitment-invite.js';
import { withoutListenOffer } from './listen-offer.js';
import { withInviteReplyCheck } from './commitment-invite-reply.js';
import { getDeliberator } from './deliberation.js';
import { brightOpenerInvited } from './ferni-playful.js';
import { noteTurn } from './move-log.js';
import { firstNameOf, withNameGate, type HistoryItem } from './name-gate.js';
import { withoutPastLeadIns, withToolLeadIn } from './tool-lead-in.js';
import { withLookupBridge } from './lookup-bridge.js';
import { tapToolCalls, withTurnReminder } from './turn-request.js';
import { withTurnStyleReminder } from './turn-style.js';
import { burstAllowed } from './vocal-bursts.js';
import { isAcknowledgementOnly } from '../voice-agent/agent-reply-recorder.js';

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
  /** The caller went quiet after a release: this reply asks the direct question again. */
  reask?: boolean;
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
  /** All of Ferni's lines since the caller's earlier words (a tool follow-up comes last). */
  ferni: string[];
} {
  const said: string[] = [];
  const latest: string[] = [];
  const ferni: string[] = [];
  let companion: string | undefined;
  let answering = true;
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i] as MessageView;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') {
      const line = item.textContent?.trim() || undefined;
      if (answering) companion = line;
      if (line && said.length === 0 && !isAcknowledgementOnly(line)) ferni.unshift(line);
      answering = false;
      continue;
    }
    const text = item.textContent?.trim();
    if (item.role !== 'user' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    (answering ? latest : said).unshift(text);
  }
  return { latest: latest.join(' '), earlier: said, companion, ferni };
}

/** The call's recent lines, oldest first, marked by speaker (crisis-adjudicator.ts trims them). */
function callTranscript(chatCtx: llm.ChatContext): AdjudicatorLine[] {
  const lines: AdjudicatorLine[] = [];
  for (const raw of chatCtx.items) {
    const item = raw as MessageView;
    const text = item.textContent?.trim();
    if (item.type !== 'message' || !text) continue;
    if (item.role === 'assistant') lines.push({ speaker: 'ferni', text });
    else if (item.role === 'user' && !text.startsWith(TURN_CONTEXT_HEADER))
      lines.push({ speaker: 'caller', text });
  }
  return lines;
}

/** The call's session id, which the reply gate and the turn pipeline share. */
function sessionScope(userData: unknown): string | undefined {
  return (
    (userData as { services?: { sessionId?: string } } | undefined)?.services?.sessionId ||
    undefined
  );
}

const guide = (guidance: string): CrisisGateDecision => ({ action: 'guide', guidance });

export function decisionFor(crisis: CrisisDetectionResult): CrisisGateDecision {
  if (guardFromDetection(crisis).shouldBlock && crisis.suggestedResponse) {
    return { action: 'replace', script: crisis.suggestedResponse };
  }
  if (crisis.isCrisis) return { action: 'guide', guidance: buildCrisisGuidance(crisis) };
  return { action: 'pass' };
}

export interface CrisisGateOptions {
  env?: Record<string, string | undefined>;
  /** The classifier's model call. */
  generate?: CrisisGenerateFn;
  /** The adjudicator's model call. */
  adjudicate?: CrisisGenerateFn;
  /** The grounded release's model calls (crisis-grounded-release.ts). */
  groundedReads?: readonly CrisisGenerateFn[];
}

/**
 * Decide this reply's crisis handling from the request about to go to the LLM.
 * Null when the gate is off or in shadow, or there are no caller words.
 */
export function startCrisisGate(
  chatCtx: llm.ChatContext,
  userData: unknown,
  options: CrisisGateOptions = {}
): CrisisGateTurn | null {
  const { env = process.env, generate } = options;
  if (resolveCrisisGuardMode(env) !== 'live') return null;
  const { latest, earlier, companion, ferni } = callerWords(chatCtx);
  if (!latest) return null;

  const voiceEmotion = (userData as { voiceEmotion?: ProsodyEmotionLike } | undefined)
    ?.voiceEmotion;
  const found = detectCrisis(latest, toGuardVoiceEmotion(voiceEmotion), {
    recentMessages: earlier,
  });
  // The answer to a grounded release's direct question: not a clear no is a gentle 988 offer,
  // or crisis guidance when the answer carries risk content (crisis-grounded-screen.ts).
  const screen = screenAnswer(sessionScope(userData), { latest, companion, ferni });
  const gentle = screen === 'positive' && !screenIdeation(found, latest);
  const detection = screen === 'positive' && !gentle ? withScreenPositive(found) : found;
  const reask = screen === 'reask';
  const decision = gentle ? guide(SCREEN_GENTLE_OFFER) : decisionFor(detection);
  if (decision.action !== 'pass') {
    noteCrisisRisk(sessionScope(userData)); // risk on this call (crisis-call-risk.ts)
    log.info(
      { action: decision.action, source: 'patterns', indicators: detection.indicators },
      'CRISIS_GATE'
    );
  }

  const pattern =
    decision.action === 'replace' ? 'block' : decision.action === 'guide' ? 'crisis' : 'none';
  // The agreement gate and the adjudicator weigh this read with the turn pipeline's.
  // Only the agreement gate and a live adjudicator hold the escalation for those
  // reads; a shadow adjudicator runs beside it and never delays the 988 line.
  const agreementGate = resolveCrisisAgreementGate(env);
  const adjudicatorMode = resolveCrisisAdjudicatorMode(env);
  const scope = agreementGate || adjudicatorMode !== 'off' ? sessionScope(userData) : undefined;
  const holdForReads = agreementGate || adjudicatorMode === 'live';
  const call = sessionScope(userData);
  // CRISIS_TRANSFER_EVERYDAY: decided before this turn's own read starts (crisis-transfer-request.ts).
  const transfer =
    adjudicatorMode !== 'live' &&
    transferRequestIsEveryday({ latest, earlier, companion }, pattern, call, env);
  // Taken before this turn's own read starts (crisis-lone-imminent.ts).
  const priorRisk = callRiskBeforeTurn(call, { latest, earlier, companion });
  const groundedPrior = groundedPriorRisk(call, latest);
  const run = startCrisisClassifier(
    { latest, earlier, companion },
    { pattern, env, generate, scope, call }
  );
  if (run?.mode !== 'live' || decision.action === 'replace') {
    return { decision, escalation: null, reask };
  }
  const who = startWhoRead({ latest, earlier, companion }, detection, { env, generate });

  const escalation = run.verdict.then(async (verdict): Promise<CrisisGateDecision | null> => {
    // A lone imminent read of a plain goodbye on a call with no risk: the soft check.
    if (loneImminentGoodbye({ detection, verdict, latest, earlier, companion, priorRisk })) {
      log.info({ action: 'guide', source: 'lone_imminent_goodbye' }, 'CRISIS_GATE');
      return { action: 'guide', guidance: SOFT_CRISIS_CHECK };
    }
    // CRISIS_GROUNDED_RELEASE: an imminent read the call plainly explains gets the soft check.
    const input = { latest, earlier, companion };
    const grounded = { input, priorRisk: groundedPrior, call, env, source: 'gate' as const };
    if (
      await groundedRelease({ ...grounded, detection, verdict, generates: options.groundedReads })
    ) {
      log.info({ action: 'guide', source: 'grounded_release' }, 'CRISIS_GATE');
      return { action: 'guide', guidance: GROUNDED_LIGHT_TOUCH };
    }
    const base = applyClassifierVerdict(detection, verdict);
    const merged = who?.live ? await who.resolve(base, verdict) : base;
    if (merged === detection) return null;
    const stronger = decisionFor(merged);
    const rerouted = !!who?.live && merged.subject !== detection.subject; // whom it is for changed
    if (RANK[stronger.action] <= RANK[decision.action] && !gentle && !rerouted) return null;
    // A bare "pass me to Nayan" (CRISIS_TRANSFER_EVERYDAY): a crisis read, never an imminent
    // one whoever it is about, gets the soft check-in once every other check below has run.
    let softTransfer = transfer && verdict?.risk === 'crisis' && stronger.action === 'guide';
    if (scope && !holdForReads) {
      const reads = turnVerdicts(scope, { latest, earlier, companion });
      shadowAdjudication(reads, callTranscript(chatCtx), {
        pattern,
        env,
        scope,
        source: 'gate',
        generate: options.adjudicate,
      });
    } else if (scope) {
      // Fail closed: a failed lookup counts as a missing read, which escalates.
      const verdicts = await turnVerdicts(scope, { latest, earlier, companion }).catch(() => [
        null,
      ]);
      const outcome = agreementGate
        ? agreementOutcome({ pattern, verdicts, latest, earlier, companion })
        : 'escalate';
      if (outcome !== 'escalate') {
        log.info({ action: outcome, source: 'agreement' }, 'CRISIS_GATE');
        return outcome === 'soft' ? { action: 'guide', guidance: SOFT_CRISIS_CHECK } : null;
      }
      // Reads of this turn that agree on risk are never eased.
      if (verdicts.filter((v) => v?.risk === 'crisis' || v?.risk === 'imminent').length >= 2) {
        softTransfer = false;
      }
      // Every read of the turn is in: a classifier-only crisis gets a fuller second read.
      const adjudicator = startCrisisAdjudicator(callTranscript(chatCtx), {
        pattern,
        verdicts,
        env,
        generate: options.adjudicate,
        source: 'gate',
        scope,
      });
      if (await adjudicatedCheckin(adjudicator)) {
        log.info({ action: 'guide', source: 'adjudicator' }, 'CRISIS_GATE');
        return { action: 'guide', guidance: SOFT_CRISIS_CHECK };
      }
    }
    noteCrisisRisk(call); // CRISIS_TRANSFER_EVERYDAY: risk on this call, soft or not
    if (softTransfer) {
      log.info({ action: 'guide', source: 'transfer-request' }, 'CRISIS_GATE');
      return { action: 'guide', guidance: SOFT_CRISIS_CHECK };
    }
    log.info(
      { action: stronger.action, source: 'classifier', indicators: merged.indicators },
      'CRISIS_GATE'
    );
    return stronger;
  });
  return { decision, escalation, reask };
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
 * A crisis turn: no background thought now or for the next few turns
 * (deliberation.ts), and no small-step invite for the rest of the call
 * (commitment-invite.ts).
 */
function holdAfterCrisis(session: object): void {
  getDeliberator(session)?.hold();
  holdCommitmentInvite(session);
}

/**
 * One persona reply through the gate: the crisis script instead of the model,
 * or the model asked with the turn reminder (plus crisis guidance when the
 * patterns call for it) and held until the classifier clears it. The opener
 * gate trims the model's words only, never a crisis script; a look-up the
 * model called without a word gets a short spoken lead-in (tool-lead-in.ts),
 * and the model never sees an earlier turn's lead-in.
 */
export async function gatedReply(
  request: llm.ChatContext,
  session: { userData: unknown },
  model: (ctx: llm.ChatContext) => Promise<ReadableStream<Chunk> | null>,
  openerGate: {
    wrap(
      stream: ReadableStream<Chunk>,
      openedBySound?: () => boolean,
      burst?: boolean,
      bright?: boolean
    ): ReadableStream<Chunk>;
  },
  options: CrisisGateOptions = {}
): Promise<ReadableStream<Chunk> | null> {
  const { env = process.env } = options;
  const chatCtx = withoutPastLeadIns(request, env);
  const askedAt = Date.now();
  // A turn-opening clip played after this request began: the reply follows it.
  const openedBySound = (): boolean => replyOpenedBySound(session, askedAt);
  const gate = startCrisisGate(chatCtx, session.userData, options);
  signalCrisisDecision(session, gate?.decision.action);
  gate?.escalation
    ?.then((decision) => signalCrisisDecision(session, decision?.action))
    .catch(() => undefined);
  if (gate?.escalation) noteCrisisVerdictPending(session, gate.escalation);
  if (gate && gate.decision.action !== 'pass') holdAfterCrisis(session);
  if (gate?.decision.action === 'replace') {
    // A turn with no moves, so the script isn't counted as the last reply's (move-log.ts).
    noteTurn(session, callerWords(chatCtx).latest, undefined);
    return textReply(gate.decision.script);
  }

  // A reply with crisis guidance keeps the plain style reminder: a per-turn shape ("six words at
  // most") must never hold it back, and no goodbye closes the loop on a plan (wrap-up.ts).
  const plain = (): llm.ChatContext =>
    withTurnReminder(chatCtx, session, { shape: false, closeLoop: false });
  const ctx =
    gate?.decision.action === 'guide'
      ? withTurnStyleReminder(plain(), gate.decision.guidance)
      : withTurnReminder(chatCtx, session);
  // A vocal burst only where this request invited one, never with crisis guidance.
  const burst = burstAllowed(session, gate?.decision.action === 'guide', env);
  const ask = async (
    request: llm.ChatContext,
    mayBurst = burst,
    guided = gate?.decision.action === 'guide'
  ): Promise<ReadableStream<Chunk> | null> => {
    // LISTEN_OFFER_STRIP: no "I'm here if you want to vent" (listen-offer.ts); never with crisis guidance.
    const stream = withoutListenOffer(tapToolCalls(await model(request), session), { guided, env });
    if (!stream) return stream;
    // FERNI_PLAYFUL: a bright turn's reminder invited a reaction word (ferni-playful.ts).
    const bright = brightOpenerInvited(request);
    const opened =
      env.OPENER_GATE !== 'off' ? openerGate.wrap(stream, openedBySound, mayBurst, bright) : stream;
    // NAME_GATE: the caller's name at hello, goodbye, and rarely between (name-gate.ts).
    const trimmed = withNameGate(opened, {
      name: firstNameOf((session.userData as { userName?: unknown } | undefined)?.userName),
      history: chatCtx.items as readonly HistoryItem[],
      env,
    });
    // COMMITMENT_INVITE: on the invite turn, no step named for them (commitment-invite-reply.ts).
    const led = withToolLeadIn(withInviteReplyCheck(trimmed, session), chatCtx, session, env);
    // LOOKUP_BRIDGE: no dead air before the answer to a look-up (lookup-bridge.ts); never on
    // a call with crisis risk noted, as THINK_ALOUD stays out of those (#2265).
    const call = sessionScope(session.userData);
    return call && crisisRiskThisCall(call) ? led : withLookupBridge(led, chatCtx, session, env);
  };
  // A grounded release, or a re-ask after it: code says the direct question, last (crisis-grounded-screen.ts).
  const asking = (s: ReadableStream<Chunk> | null, on = gate?.reask) => (on ? screenReply(s) : s);
  const reply = asking(await ask(ctx));
  if (!gate?.escalation) return reply;
  // No first reply: an empty one, so a release still speaks its question.
  return holdUntilCleared(reply ?? textReply(''), gate.escalation, async (decision) => {
    if (decision.action !== 'pass') holdAfterCrisis(session);
    if (decision.action === 'replace') return textReply(decision.script);
    if (decision.action === 'pass') return null;
    const guided = await ask(
      withTurnStyleReminder(plain(), decision.guidance),
      burst === undefined ? undefined : false,
      true
    );
    return asking(guided, decision.guidance === GROUNDED_LIGHT_TOUCH);
  });
}
