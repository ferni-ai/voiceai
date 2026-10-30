/**
 * Call-level crisis risk counts only when confirmed (CRISIS_CONFIRMED_CALL_RISK =
 * off | shadow | on, off by default).
 *
 * Prod, the 7 days to 2026-10-30: crisis handling fired on about one caller turn
 * in six, on 10 of 23 calls, and 163 of 165 decisions came from the classifier
 * alone. Once one read flagged a call, later turns kept reading as risk: the
 * classifier reads each turn with the caller's earlier lines and Ferni's line
 * before it, and after an alarm that line is Ferni's own safety talk. A caller
 * pushing back on it ("I'm fine", "it's not a crisis") then reads as risk too, so
 * one read nothing confirmed becomes many turns of guidance or the script.
 *
 * With the flag on, each call keeps a ledger: the turns where only the classifier
 * escalated (an alarm), and whether anything confirmed risk. A LATER turn on an
 * alarmed, unconfirmed call that only the classifier flags gets one more read,
 * the after-check read: the classifier's model on the same input with its own
 * prompt (AFTER_CHECK_PROMPT), told that Ferni's safety talk came from a check
 * nothing confirmed and that pushback against it is not risk, while a yes or a
 * hedge to a safety question, an earlier line that carried risk in its own words,
 * and anything the caller adds are judged as before. Not a word list: the model
 * decides. It runs only on such turns, whose reply is already held for the read.
 * - none: eased. A crisis read gets AFTER_CHECK_GUIDANCE (988 stays for any
 *   disclosure); an imminent read gets crisis guidance, never less.
 * - any risk: the decision stands, and the call is confirmed (two reads agree).
 * - no verdict (timeout, error): the decision stands.
 *
 * Never eases: an unknown call; the alarm turn itself; a call where anything
 * confirmed risk (a pattern on any turn or in any earlier caller line, two reads
 * of one turn agreeing on risk, an after-check read finding risk); a caller who
 * may be a minor; a turn the patterns flagged. Shadow runs the read off the
 * reply path and only logs. Logs carry decisions, never words.
 *
 * @module CrisisConfirmedRisk
 */

import { derivedHold, likelyMinor, statesUnder18 } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  classifyCrisis,
  createGeminiCrisisGenerate,
  resolveCrisisClassifierTimeoutMs,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from './crisis-classifier.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';

const log = createLogger({ module: 'CrisisConfirmedRisk' });

type Env = Record<string, string | undefined>;
export type ConfirmedRiskMode = 'off' | 'shadow' | 'on';

export function resolveConfirmedCallRisk(env: Env = process.env): ConfirmedRiskMode {
  const raw = env.CRISIS_CONFIRMED_CALL_RISK?.trim().toLowerCase();
  return raw === 'on' || raw === 'shadow' ? raw : 'off';
}

/**
 * The after-check read's prompt: its own, not the classifier's with a rule added (that read
 * as many everyday lines as risk as the classifier alone). Held-out synthetic calls, Ferni's
 * safety talk before every caller line, 3 reads each: the classifier's prompt read 46 of 231
 * everyday lines as risk and this one 14; both read all 111 risk lines as risk.
 */
export const AFTER_CHECK_PROMPT = `You re-check one turn of a voice call between a caller and a companion app, after an automated safety check. Earlier in this call that check flagged one of the caller's lines as suicide or self-harm risk, and nothing else confirmed it: it may have been a misread of everyday words. Because of it, the companion may have raised safety on its own (asked if the caller is safe, gave a crisis line or emergency numbers). Decide whether the caller's LATEST message shows suicide or self-harm risk.

The input has LATEST (the caller's message), EARLIER (the caller's earlier messages, oldest first) and may have COMPANION (what the companion said just before LATEST).

How to judge:
- The companion's safety talk is the companion's, not a sign of risk. The caller reacting to it (pushing back, denying, being confused, annoyed or amused by it, or going back to what the call was about) is risk "none".
- An EARLIER line counts as risk only if its own words were about dying, not being alive or around, killing or hurting oneself, means of doing so, a plan or time to do it, or giving things away or saying goodbye for after one is gone. Everyday plans, errands, chores, trips, games, shows, jobs, moves, gifts, cooking and goodbyes at the end of a call are not risk, whatever words they use. When an EARLIER line carries risk in its own words, judge LATEST in its light: short replies ("still waiting", "go ahead", "yes") then take their meaning from it.
- LATEST carries risk of its own when its own words are about dying, not wanting to wake up or be here, killing or hurting oneself, means, a plan or time, hopelessness about living, feeling like a burden, or saying goodbye for good. A yes, a maybe, a hedge or "I don't know" in answer to the companion asking whether they are thinking of hurting themselves or are safe is risk "crisis". A caller who says they are fine and then adds something heavy is judged on what they added.

risk = "imminent": an attempt underway or just made, means in hand or at the location with intent, intent with a plan or a time, ongoing self-harm happening now, or a final goodbye or last request for after they are gone.
risk = "crisis": passive ideation, hopelessness about living, burdensomeness, feeling trapped, indirect preparation, method-seeking, a past attempt with current distress, risk language framed as a joke or condition, coded language, or worry that someone else is at risk (subject "third_party").
risk = "none": everything else.

Messages may be in any language; judge the meaning. When unsure between imminent and crisis choose crisis. When the caller's own words might be about dying or self-harm and you are unsure, choose crisis; the companion's safety talk alone is never a reason to.

Return JSON only: {"risk":"imminent"|"crisis"|"none","subject":"self"|"third_party"}`;

/** The guidance for an eased turn: take them at their word, keep 988 for any disclosure. */
export const AFTER_CHECK_GUIDANCE = `[SAFETY - AFTER A CHECK]
Earlier in this call an automatic safety check raised safety talk that nothing confirmed, and a second read of the caller's last words found no sign of risk.
1. Take them at their word. If they pushed back, own it briefly and kindly and go back to what you were talking about
2. Do not repeat crisis lines or ask again whether they are safe on this alone
3. If they say anything about hurting themselves, not wanting to be here, or a plan, take it seriously and offer the 988 Suicide & Crisis Lifeline`;

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 2000;
const READ_TTL_MS = 30_000;

/** Per call: the turns only the classifier escalated, and whether risk was confirmed. */
interface CallRisk {
  at: number;
  confirmed: boolean;
  alarms: Set<string>;
}
const ledger = new Map<string, CallRisk>();
/** One after-check read per call and turn, shared by the reply gate and the turn pipeline. */
const reads = new Map<string, { at: number; read: Promise<CrisisVerdict | null> }>();

const turnOf = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function entry(call: string, now: number): CallRisk {
  for (const [id, kept] of ledger) if (now - kept.at > TTL_MS) ledger.delete(id);
  let kept = ledger.get(call);
  if (!kept) {
    if (ledger.size >= MAX_CALLS) {
      const oldest = ledger.keys().next().value;
      if (oldest !== undefined) ledger.delete(oldest);
    }
    kept = { at: now, confirmed: false, alarms: new Set() };
  }
  ledger.delete(call);
  kept.at = now;
  ledger.set(call, kept);
  return kept;
}

/** Risk on this call that something besides one classifier read found: never eased again. */
export function noteConfirmedRisk(call: string | undefined, env: Env = process.env): void {
  if (call && resolveConfirmedCallRisk(env) !== 'off') entry(call, Date.now()).confirmed = true;
}

/** Only the classifier escalated this turn: later turns on this call may get the after-check read. */
export function noteClassifierAlarm(
  call: string | undefined,
  latest: string,
  env: Env = process.env
): void {
  if (call && resolveConfirmedCallRisk(env) !== 'off') {
    entry(call, Date.now()).alarms.add(turnOf(latest));
  }
}

export interface AfterCheckArgs {
  call: string | undefined;
  input: CrisisClassifierInput;
  /** This turn's classifier verdict, which escalated it. */
  verdict: CrisisVerdict | null;
  /** The patterns' reading of this turn. */
  detection: CrisisDetectionResult;
  /** Whether the patterns (or a screen answer) decided anything this turn. */
  patterned: boolean;
  source: 'gate' | 'pipeline';
  env?: Env;
  generate?: CrisisGenerateFn;
}

/** keep: the decision as before. ease: AFTER_CHECK_GUIDANCE. step_down: crisis guidance. */
export type AfterCheck = 'keep' | 'ease' | 'step_down';

const found = (d: CrisisDetectionResult): boolean =>
  d.isCrisis || d.severity !== 0 || d.indicators.length > 0;

/** A caller who said they are under 18, or a call MINOR_CARE holds, is never eased. */
const mayBeMinor = (call: string, lines: readonly string[]): boolean =>
  likelyMinor(call) || derivedHold(call) || lines.some((line) => statesUnder18(line));

/** Why this turn gets no after-check read, or null when it does. Fails closed. */
function ineligible(args: AfterCheckArgs, call: string): string | null {
  const { verdict, input } = args;
  if (verdict?.risk !== 'crisis' && verdict?.risk !== 'imminent') return 'no_risk_read';
  if (args.patterned || found(args.detection)) return 'pattern';
  const kept = ledger.get(call);
  if (!kept || Date.now() - kept.at > TTL_MS) return 'no_alarm';
  if (kept.confirmed) return 'confirmed';
  const turn = turnOf(input.latest);
  if (![...kept.alarms].some((t) => t !== turn)) return 'no_alarm';
  const earlier: readonly unknown[] = input.earlier ?? [];
  if (![input.latest, ...earlier].every((line) => typeof line === 'string')) return 'error';
  if (mayBeMinor(call, [input.latest, ...(earlier as string[])])) return 'minor';
  if ((earlier as string[]).some((line) => found(detectCrisis(line)))) {
    kept.confirmed = true;
    return 'earlier_pattern';
  }
  return null;
}

async function afterCheckRead(
  args: AfterCheckArgs,
  call: string,
  env: Env
): Promise<CrisisVerdict | null> {
  const now = Date.now();
  for (const [k, v] of reads) if (now - v.at > READ_TTL_MS) reads.delete(k);
  const key = JSON.stringify([call, turnOf(args.input.latest)]);
  const shared = reads.get(key);
  if (shared) return shared.read;
  const generate = args.generate ?? createGeminiCrisisGenerate();
  const timeout = resolveCrisisClassifierTimeoutMs(env);
  const read = classifyCrisis(args.input, generate, timeout, AFTER_CHECK_PROMPT).catch(() => null);
  reads.set(key, { at: now, read });
  return read;
}

async function decide(args: AfterCheckArgs, call: string, env: Env): Promise<AfterCheck> {
  const read = await afterCheckRead(args, call, env);
  const mode = resolveConfirmedCallRisk(env);
  const from = args.verdict?.risk;
  if (!read) {
    log.info(
      { outcome: 'keep', why: 'no_verdict', from, mode, source: args.source },
      'CRISIS_CONFIRMED'
    );
    return 'keep';
  }
  if (read.risk !== 'none') {
    noteConfirmedRisk(call, env);
    log.info(
      { outcome: 'keep', why: 'reconfirmed', from, mode, source: args.source },
      'CRISIS_CONFIRMED'
    );
    return 'keep';
  }
  const outcome: AfterCheck = from === 'imminent' ? 'step_down' : 'ease';
  log.info({ outcome, from, mode, source: args.source }, 'CRISIS_CONFIRMED');
  return outcome;
}

/**
 * Whether this classifier-escalated turn is eased. 'keep' (as before) for
 * anything ineligible, in shadow (which reads off the reply path), and on any error.
 */
export async function afterCheck(args: AfterCheckArgs): Promise<AfterCheck> {
  try {
    const env = args.env ?? process.env;
    const mode = resolveConfirmedCallRisk(env);
    const { call } = args;
    if (mode === 'off' || !call) return 'keep';
    const why = ineligible(args, call);
    if (why !== null) {
      if (why !== 'no_risk_read' && why !== 'no_alarm') {
        log.info({ outcome: 'keep', why, mode, source: args.source }, 'CRISIS_CONFIRMED');
      }
      return 'keep';
    }
    if (mode === 'shadow') {
      void decide(args, call, env).catch(() => undefined);
      return 'keep';
    }
    return await decide(args, call, env);
  } catch {
    return 'keep';
  }
}

/** For tests. */
export function resetConfirmedCallRisk(): void {
  ledger.clear();
  reads.clear();
}
