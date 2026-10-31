/**
 * One caller turn through every production crisis setter, the way a live voice
 * turn runs them (full-path-sim.ts drives the calls):
 *
 * - the turn pipeline, startTurnCrisis (process-turn.ts), and the reply gate,
 *   gatedReply (persona llmNode), started together on one session id so the
 *   agreement gate pools both paths' reads as it does live. Between them they
 *   run the patterns, the live classifier, the everyday double read, the
 *   agreement gate, the imminent split, and the guard's 911/988 replacement;
 * - performSafetyCheck through its builder, buildSafetyInjections;
 * - the human-transfer detector and the crisis follow-up note.
 *
 * Two seams, both because the production builder writes or reads Firestore:
 * buildHumanTransferInjections writes crisis_signals, so its three calls
 * (detectCrisisSignals, evaluateTransferNeed, buildTransferAwarenessContext)
 * are made here and the signal is kept in memory on the call; and
 * buildCrisisHistoryInjection reads them back, so the note is decided here
 * from that memory with the production crisisFromSignal and followUpCrisis.
 * The reply model is a stub. Ferni's line back into the call is the script when
 * the reply was replaced; on a guided turn (crisis guidance added by the gate or
 * the pipeline), the guard's own guided-level 988 text, which is what a guided
 * prod reply says and what then reaches the classifier's COMPANION field and the
 * agreement scan; otherwise a short neutral line. `guidedReply: 'neutral'` gives
 * guided turns the neutral line instead, for comparison.
 */

import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { gatedReply } from '../../src/agents/personas/crisis-gate.js';
import { buildSafetyInjections } from '../../src/agents/processors/injection-builders/safety-coaching-builders.js';
import type { InjectionBuilderContext } from '../../src/agents/processors/injection-builders/types.js';
import { startTurnCrisis } from '../../src/agents/processors/turn-processor/turn-crisis.js';
import { isAcknowledgementOnly } from '../../src/agents/voice-agent/agent-reply-recorder.js';
import {
  applyClassifierVerdict,
  buildCrisisGuidance,
} from '../../src/agents/safety/crisis-guard.js';
import { flagOn } from '../../src/config/env-flag.js';
import {
  buildTransferAwarenessContext,
  humanTransfer,
  type CrisisSignals,
} from '../../src/services/human-transfer/index.js';
import {
  crisisFromSignal,
  followUpCrisis,
} from '../../src/services/human-transfer/crisis-signals.js';
import type { CrisisGenerateFn } from '../../src/services/safety/crisis-classifier.js';
import { NEUTRAL_REPLIES } from './full-path-corpus.js';
import type { FiredPath, LineState } from './full-path-summary.js';

type Line = { role: 'user' | 'assistant'; text: string };

/** One call's state between turns: what prod keeps on userData and in the chat context. */
export interface SimCall {
  sessionId: string;
  history: Line[];
  /** userData.recentTranscripts: the caller's last 10 lines, this turn last (transcript-handler.ts). */
  recent: string[];
  lastAgentResponse?: string;
  callerTurn: number;
  /** The call's crisis_signals docs, newest first, as logCrisisSignal writes them. */
  signals: Array<Record<string, unknown>>;
  activations: number;
  /** A member keeps recentTranscripts; an anon or held caller has none (#2615). */
  anon: boolean;
}

export function newCall(sessionId: string, anon: boolean): SimCall {
  return { sessionId, history: [], recent: [], callerTurn: 0, signals: [], activations: 0, anon };
}

/** A line said before the scored turns: context only, never run through the setters. */
export function addContext(call: SimCall, who: 'caller' | 'ferni', text: string): void {
  if (who === 'caller') {
    call.history.push({ role: 'user', text });
    call.recent = [...call.recent, text].slice(-10);
  } else {
    call.history.push({ role: 'assistant', text });
    if (!isAcknowledgementOnly(text)) call.lastAgentResponse = text;
  }
}

function chatOf(lines: Line[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const l of lines) ctx.addMessage({ role: l.role, content: l.text });
  return ctx;
}

const textOf = (req: llm.ChatContext): string =>
  req.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

const stream = (text: string) =>
  new ReadableStream<unknown>({
    start(c) {
      c.enqueue(text);
      c.close();
    },
  });

const CRISIS_GUIDE = '[CRITICAL - USER SAFETY]';
const MENTIONS_988 = /\b988\b|nine eight eight|crisis line|lifeline/i;
const MENTIONS_911 = /\b911\b|emergency room/i;

export interface TurnOutcome {
  activated: boolean;
  paths: FiredPath[];
  replaced: boolean;
  soft: boolean;
  note: boolean;
  line988: LineState;
  line911: LineState;
  repeat: boolean;
}

/**
 * Run one caller turn and fold Ferni's reply back into the call: the script
 * when the reply was replaced, else the model stub's line. `ferni`, when a
 * corpus row gives it, is what Ferni said instead (a crisis line before a
 * denial, a direct safety question before an answer).
 */
export async function simulateTurn(
  call: SimCall,
  text: string,
  options: {
    env: Record<string, string | undefined>;
    generate: CrisisGenerateFn;
    ferni?: string;
    guidedReply?: 'crisis-line' | 'neutral';
  }
): Promise<TurnOutcome> {
  const { env, generate } = options;
  call.callerTurn++;
  const turnCount = call.callerTurn * 2; // the live path steps it twice per utterance
  if (!call.anon) call.recent = [...call.recent, text].slice(-10);
  const userData = {
    services: { sessionId: call.sessionId },
    turnCount,
    ...(call.anon ? {} : { recentTranscripts: [...call.recent] }),
    lastAgentResponse: call.lastAgentResponse,
  };

  // The note reads the signals logged on earlier turns only (forgetRecentCrisis, next turn on).
  const crises = call.signals
    .map((d) => crisisFromSignal(call.sessionId, d))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const followUp = flagOn('CRISIS_SAME_CALL_NOTE_FADES', env)
    ? followUpCrisis(crises, call.sessionId, call.callerTurn)
    : crises[0];
  const note = crises.length > 0 && !!followUp;

  // Both paths at once, as the turn handler and the persona's llmNode run them.
  const pipeline = startTurnCrisis(text, userData, { sessionId: call.sessionId, env, generate });
  const requests: string[] = [];
  let modelLine = '';
  const session = Object.assign(new EventEmitter(), { userData });
  const reply = gatedReply(
    chatOf([...call.history, { role: 'user', text }]),
    session,
    (async (req: llm.ChatContext) => {
      requests.push(textOf(req));
      modelLine = NEUTRAL_REPLIES[(call.callerTurn - 1) % NEUTRAL_REPLIES.length];
      return stream(modelLine);
    }) as never,
    { wrap: (s: ReadableStream<unknown>) => s } as never,
    { env, generate }
  );
  const [summary, resolved, spoken] = await Promise.all([
    pipeline.summary(),
    pipeline.resolve(),
    reply.then(async (r) => {
      const out: unknown[] = [];
      if (r) for await (const chunk of r as unknown as AsyncIterable<unknown>) out.push(chunk);
      return out.join('');
    }),
  ]);

  // The legacy lexical detectors, every turn (context-injections.ts).
  const safety = await buildSafetyInjections({
    userText: text,
    services: { userId: undefined, sessionId: call.sessionId },
    userData: { relationshipStage: 'building' },
    persona: { id: 'ferni' },
  } as unknown as InjectionBuilderContext);
  const lexicalSafety = safety.filter(
    (i) => i.content.includes('crisis support NOW') || MENTIONS_988.test(i.content)
  );
  const signals: CrisisSignals = humanTransfer.detectCrisisSignals(text);
  if (signals.severity > 0) {
    call.signals.unshift({
      timestamp: new Date().toISOString(),
      signals: { ...signals },
      sessionId: call.sessionId,
      ...(flagOn('CRISIS_SAME_CALL_NOTE_FADES', env) ? { turn: call.callerTurn } : {}),
    });
  }
  const transfer = humanTransfer.evaluateTransferNeed(text);
  const transferCrisis =
    transfer.type === 'crisis_immediate' || transfer.type === 'crisis_support'
      ? (buildTransferAwarenessContext(transfer) ?? '')
      : null;

  // What fired.
  const paths: FiredPath[] = [];
  const { patterns } = pipeline;
  const pipelineOn = summary.shouldOverrideLLM || summary.isCrisis;
  if (pipeline.shouldBlock) paths.push('pattern-block');
  else if (patterns.isCrisis) paths.push('pattern-crisis');
  else if (summary.shouldOverrideLLM) paths.push('classifier-imminent');
  else if (summary.isCrisis)
    paths.push(resolved.subject === 'third_party' ? 'classifier-third-party' : 'classifier-crisis');
  const gateReplaced = !!spoken.trim() && (requests.length === 0 || !spoken.includes(modelLine));
  const gateGuided = requests.some((r) => r.includes(CRISIS_GUIDE));
  if ((gateReplaced || gateGuided) && !pipelineOn) paths.push('gate-classifier');
  if (lexicalSafety.length) paths.push('lexical-safety');
  if (transferCrisis !== null) paths.push('lexical-transfer');

  const required =
    !gateReplaced && summary.shouldOverrideLLM ? summary.suggestedResponse : undefined;
  const replaced = gateReplaced || !!required;
  const script = gateReplaced ? spoken : (required ?? '');
  const instructions = [
    ...requests.filter((r) => r.includes(CRISIS_GUIDE)),
    // The turn handler's crisis_response injection for a pipeline crisis (turn-handler.ts).
    ...(summary.isCrisis && !summary.shouldOverrideLLM ? [buildCrisisGuidance(resolved)] : []),
    ...lexicalSafety.map((i) => i.content),
    transferCrisis ?? '',
  ].join('\n');
  const lineState = (re: RegExp): LineState =>
    replaced && re.test(script) ? 'said' : re.test(instructions) ? 'instructed' : 'no';
  const softCheck = !!summary.softCheck || requests.some((r) => /\[SAFETY - (SOFT|DIRECT)/.test(r));
  const activated = paths.length > 0;
  const repeat = activated && call.activations > 0;
  if (activated) call.activations++;

  // Ferni's reply goes back into the call as prod records it.
  // A guided turn: the guard's guided-level text for this turn (crisis-guard.ts getCrisisResponse,
  // through applyClassifierVerdict), the pipeline's own when it read the turn as crisis.
  const guided = !replaced && (gateGuided || summary.isCrisis);
  const guidedLine =
    guided && options.guidedReply !== 'neutral'
      ? summary.isCrisis && resolved.suggestedResponse
        ? resolved.suggestedResponse
        : applyClassifierVerdict(patterns, { risk: 'crisis', subject: 'self' }).suggestedResponse
      : undefined;
  // A corpus `ferni` line is the shape under test (a 988 line before a denial), so it wins.
  const ferni = options.ferni ?? (replaced ? script : (guidedLine ?? spoken));
  call.history.push({ role: 'user', text }, { role: 'assistant', text: ferni });
  if (ferni.trim() && !isAcknowledgementOnly(ferni.trim())) call.lastAgentResponse = ferni.trim();

  return {
    activated,
    paths,
    replaced,
    soft: softCheck && !activated,
    note,
    line988: lineState(MENTIONS_988),
    line911: lineState(MENTIONS_911),
    repeat,
  };
}
