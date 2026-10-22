/**
 * Crisis adjudicator (CRISIS_ADJUDICATOR = off | shadow | live, off by default).
 *
 * When the patterns pass a turn and only the classifier reads it as crisis,
 * the reply gets crisis guidance and the caller hears the 988 line. Prod,
 * 2026-10-16/17: everyday call business during a "call my mom" test ("Can I
 * give you her number?", "Go ahead, Ferni.", "I'm waiting.") read as crisis,
 * and after one false alarm Ferni's own check-in became the context that made
 * every next reply read as crisis too. Word lists cannot fix that: a short
 * reply's meaning comes from earlier turns ("I'm waiting." after "I took
 * something"). So those turns get a second model read of the call's recent
 * lines, marked by speaker, as a crisis counselor choosing "988 now" or "a warm
 * check-in, staying alert". Fail closed: only a classifier-only crisis (no
 * pattern match, no imminent or missing read) is read, and anything short of a
 * confident "checkin" with no caller risk quoted escalates as before.
 *
 * shadow: logs the decision, the reply is unchanged. live: "checkin" turns the
 * crisis guidance into the agreement gate's SOFT_CRISIS_CHECK; held back to
 * shadow for now (resolveCrisisAdjudicatorMode).
 *
 * Privacy: logs carry the decision and why, never the transcript or the reply.
 *
 * @module CrisisAdjudicator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import type { CrisisGenerateFn, CrisisVerdict, PatternOutcome } from './crisis-classifier.js';

const log = createLogger({ module: 'CrisisAdjudicator' });

export type CrisisAdjudicatorMode = 'off' | 'shadow' | 'live';
export type AdjudicatorDecision = 'escalate' | 'checkin';
/** Why a decision was made: only 'model' can be a checkin. */
export type AdjudicatorWhy =
  'model' | 'low_confidence' | 'risk_quoted' | 'unparsed' | 'timeout' | 'error' | 'no_context';

export interface AdjudicatorLine {
  speaker: 'caller' | 'ferni';
  text: string;
}

export interface AdjudicatorResult {
  decision: AdjudicatorDecision;
  why: AdjudicatorWhy;
}

/**
 * A different model from the classifier's (gemini-3.5-flash-lite), for an
 * independent read. gemini-3.5-flash was measured at p50 ~1.3 s, over budget.
 */
export const DEFAULT_CRISIS_ADJUDICATOR_MODEL = 'gemini-3.1-flash-lite';
/** The reply is already held for the classifier; past this the turn escalates. */
export const DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS = 1200;
/** About the caller's last six turns and Ferni's lines between them. */
const MAX_LINES = 12;
const MAX_LINE_CHARS = 400;

export const CRISIS_ADJUDICATOR_PROMPT = `You are a trained crisis counselor reviewing a live voice call between a caller and Ferni, an AI companion. An automated screen flagged the caller's LAST line as possible suicide or self-harm risk. You decide what Ferni does next:
- "escalate": respond as to a person who may be at risk, and give the 988 Suicide & Crisis Lifeline now.
- "checkin": the flag was a false alarm from everyday conversation. Ferni stays in the conversation, checks in warmly once if it fits, and stays alert.

The input is the recent call, oldest first: lines marked "caller" are the caller's words; lines marked "ferni" are Ferni's. The last line is the flagged one.

How to read it:
1. A short reply ("I'm waiting", "go ahead", "do it", "call my mom", "text him", "ok", "yes") means what it means in context. If anything the caller said earlier in the call carries risk, the short reply belongs to that and you escalate.
2. Caller risk, anywhere in the call, includes: wanting to die or not be here, not waking up, no future, being a burden, hopelessness or feeling trapped; an attempt, taking something, means (pills, a weapon, a high place), a plan, a date or a time; saying goodbye or thanks as if for the last time, being at peace or calm because things are arranged or decided, giving things away or asking someone to look after a pet, child or belongings; funeral or burial wishes for themselves; wanting to join someone who died, or wishing they had died instead; apologies, love or farewells to pass on to someone ("tell her I'm sorry", "text my mom adios"); asking Ferni to reach a doctor, therapist, nurse, ambulance, emergency services or a crisis line, or saying a crisis number (988, 911, 1-800-273-8255), even with no reason given; worry that someone else is at risk; questions about lethal amounts or methods; agreeing with or echoing something dark Ferni said ("same", "me too", "honestly yeah"), which makes it the caller's own. Judge meaning, not keywords, in any language.
3. Ferni's lines are Ferni's, not the caller's state. A safety check-in or crisis line Ferni brought up is not by itself evidence of risk, and Ferni's reassurance never cancels risk the caller expressed. But when Ferni's last line asked about the caller's safety or gave a crisis line, escalate unless the caller's reply answers it by saying they are okay (or plainly yes to "are you okay?"); a reply that ignores it, even an everyday one, is escalate.
4. "checkin" only when every caller line in the call is plainly everyday: asking Ferni to call or text a friend or family member with an ordinary message ("say hi", "I'll be late"), giving a number, waiting for or asking about that call ("is it ringing?", "I'm waiting", "go ahead"), greetings, chit-chat, plans, remarks about the conversation or about Ferni, ordinary goodbyes. A counselor reading this call would be comfortable not mentioning the crisis line.
5. When you are unsure, escalate. A missed crisis is far worse than an unneeded check-in.

Return JSON only, in this order: {"caller_risk":"<the caller's words that suggest risk, quoted briefly, or empty>","decision":"escalate"|"checkin","confidence":"high"|"low"}`;

/**
 * Live is held back: on the 2026-10-17 replay (scripts/crisis-eval/
 * adjudicator-eval.ts) some labelled positives still read "checkin" in some
 * reads after three prompt iterations, so CRISIS_ADJUDICATOR=live runs as
 * shadow (logged liveHeld) until a replay shows none. Only tests lift it.
 */
let liveAllowed = false;

/** For tests only: let CRISIS_ADJUDICATOR=live soften turns. */
export function allowCrisisAdjudicatorLiveForTests(allowed: boolean): void {
  liveAllowed = allowed;
}

export function resolveCrisisAdjudicatorMode(
  env: Record<string, string | undefined> = process.env
): CrisisAdjudicatorMode {
  const raw = env.CRISIS_ADJUDICATOR?.trim().toLowerCase();
  if (raw === 'live') return liveAllowed ? 'live' : 'shadow';
  return raw === 'shadow' ? raw : 'off';
}

export function resolveCrisisAdjudicatorTimeoutMs(
  env: Record<string, string | undefined> = process.env
): number {
  const ms = Number(env.CRISIS_ADJUDICATOR_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS;
}

/** A checkin only for decision checkin, confidence high and no caller risk quoted. */
export function parseAdjudicatorReply(reply: string): AdjudicatorResult {
  const json = typeof reply === 'string' ? reply.match(/\{[\s\S]*\}/)?.[0] : undefined;
  if (!json) return { decision: 'escalate', why: 'unparsed' };
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const { decision, confidence } = parsed;
    const quoted = parsed.caller_risk;
    if (decision !== 'checkin' && decision !== 'escalate') {
      return { decision: 'escalate', why: 'unparsed' };
    }
    if (decision === 'escalate') return { decision, why: 'model' };
    if (typeof quoted !== 'string' || quoted.trim())
      return { decision: 'escalate', why: 'risk_quoted' };
    if (confidence !== 'high') return { decision: 'escalate', why: 'low_confidence' };
    return { decision: 'checkin', why: 'model' };
  } catch {
    return { decision: 'escalate', why: 'unparsed' };
  }
}

/**
 * Only a classifier-only crisis can be adjudicated: no pattern match, every
 * read present, none imminent, at least one crisis.
 */
export function adjudicatorEligible(
  pattern: PatternOutcome,
  verdicts: ReadonlyArray<CrisisVerdict | null>
): boolean {
  if (pattern !== 'none' || !Array.isArray(verdicts) || verdicts.length === 0) return false;
  if (verdicts.some((v) => !v || (v.risk !== 'crisis' && v.risk !== 'none'))) return false;
  return verdicts.some((v) => v?.risk === 'crisis');
}

/**
 * Trimmed, SSML-free, the last MAX_LINES. Null (escalate) unless the last line
 * is the caller's and there is a Ferni line and an earlier caller line: a
 * short reply cannot be judged without what came before it.
 */
export function normalizeTranscript(lines: readonly AdjudicatorLine[]): AdjudicatorLine[] | null {
  if (!Array.isArray(lines)) return null;
  const kept = lines
    .map((l) => ({
      speaker: l?.speaker,
      text: (l?.speaker === 'ferni' ? stripSSML(String(l?.text ?? '')) : String(l?.text ?? ''))
        .trim()
        .slice(-MAX_LINE_CHARS),
    }))
    .filter(
      (l): l is AdjudicatorLine => (l.speaker === 'caller' || l.speaker === 'ferni') && !!l.text
    )
    .slice(-MAX_LINES);
  if (kept.at(-1)?.speaker !== 'caller' || !kept.some((l) => l.speaker === 'ferni')) return null;
  if (!kept.slice(0, -1).some((l) => l.speaker === 'caller')) return null;
  return kept;
}

/**
 * The call as the adjudicator sees it, from the turn pipeline's inputs: the
 * caller's earlier lines, Ferni's last line, then the latest.
 */
export function transcriptFrom(input: {
  latest: string;
  earlier?: readonly string[];
  companion?: string;
}): AdjudicatorLine[] {
  const latest = (input.latest ?? '').trim();
  const earlier = (input.earlier ?? [])
    .map((t) => t.trim())
    .filter((t, i, all) => t && !(i === all.length - 1 && t === latest));
  return [
    ...earlier.map((text) => ({ speaker: 'caller' as const, text })),
    ...(input.companion ? [{ speaker: 'ferni' as const, text: input.companion }] : []),
    { speaker: 'caller', text: latest },
  ];
}

/** One adjudication. Never rejects: every failure is an escalation. */
export async function adjudicateCrisis(
  lines: readonly AdjudicatorLine[],
  generate: CrisisGenerateFn,
  timeoutMs: number = DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS,
  prompt: string = CRISIS_ADJUDICATOR_PROMPT
): Promise<AdjudicatorResult> {
  const transcript = normalizeTranscript(lines);
  if (!transcript) return { decision: 'escalate', why: 'no_context' };
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const reply = await Promise.race([
      generate(prompt, JSON.stringify(transcript), controller.signal),
      timeout,
    ]);
    if (reply === null) return { decision: 'escalate', why: 'timeout' };
    return parseAdjudicatorReply(reply);
  } catch {
    return { decision: 'escalate', why: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini-backed, tool-free JSON reads. '' (escalate) when Gemini is not configured. */
export function createGeminiAdjudicatorGenerate(
  model: string = process.env.CRISIS_ADJUDICATOR_MODEL || DEFAULT_CRISIS_ADJUDICATOR_MODEL,
  maxOutputTokens = 120
): CrisisGenerateFn {
  return async (systemPrompt, userContent, signal) => {
    const { getGeminiClient } = await import('../../config/gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: { generateContent: (req: unknown) => Promise<{ text?: string }> };
    } | null;
    if (!client) return '';
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        maxOutputTokens,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  };
}

export interface CrisisAdjudicatorRun {
  mode: 'shadow' | 'live';
  result: Promise<AdjudicatorResult>;
}

let defaultGenerate: CrisisGenerateFn | null = null;

/** A turn's preemptive and final requests share one adjudication. In memory only. */
const RECENT_TTL_MS = 30_000;
const RECENT_MAX = 32;
const recent = new Map<string, { at: number; run: CrisisAdjudicatorRun }>();

/** For tests: forget shared runs. */
export function resetCrisisAdjudicatorCache(): void {
  recent.clear();
}

/**
 * Start the adjudicator for a classifier-only crisis, or null when the mode
 * is off or the turn is not eligible (both escalate exactly as before). Logs
 * one CRISIS_ADJUDICATOR record per run: mode, decision, why, latency.
 */
export function startCrisisAdjudicator(
  lines: readonly AdjudicatorLine[],
  options: {
    pattern: PatternOutcome;
    verdicts: ReadonlyArray<CrisisVerdict | null>;
    env?: Record<string, string | undefined>;
    generate?: CrisisGenerateFn;
    source: 'gate' | 'pipeline';
    /** The call's session id: runs are shared within one call only. */
    scope?: string;
  }
): CrisisAdjudicatorRun | null {
  const env = options.env ?? process.env;
  const mode = resolveCrisisAdjudicatorMode(env);
  if (mode === 'off' || !adjudicatorEligible(options.pattern, options.verdicts)) return null;
  const startedAt = Date.now();
  const key = JSON.stringify([options.scope ?? '', mode, normalizeTranscript(lines)]);
  for (const [k, v] of recent) if (startedAt - v.at > RECENT_TTL_MS) recent.delete(k);
  const shared = recent.get(key)?.run;
  if (shared) return shared;

  const generate = options.generate ?? (defaultGenerate ??= createGeminiAdjudicatorGenerate());
  const result = adjudicateCrisis(lines, generate, resolveCrisisAdjudicatorTimeoutMs(env)).then(
    (r) => {
      const held = mode === 'shadow' && env.CRISIS_ADJUDICATOR?.trim().toLowerCase() === 'live';
      const stats = { latencyMs: Date.now() - startedAt, ...(held ? { liveHeld: true } : {}) };
      log.info({ mode, source: options.source, ...r, ...stats }, 'CRISIS_ADJUDICATOR');
      return r;
    }
  );
  const run: CrisisAdjudicatorRun = { mode, result };
  if (recent.size >= RECENT_MAX) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
  recent.set(key, { at: startedAt, run });
  return run;
}

/**
 * Shadow with nothing else holding the turn for its reads (no agreement gate):
 * gather the reads and adjudicate off the escalation path, for the log only.
 * The caller escalates without waiting. Never rejects.
 */
export function shadowAdjudication(
  reads: Promise<ReadonlyArray<CrisisVerdict | null>>,
  lines: readonly AdjudicatorLine[],
  options: Omit<Parameters<typeof startCrisisAdjudicator>[1], 'verdicts'>
): void {
  reads
    .then((verdicts) => adjudicatedCheckin(startCrisisAdjudicator(lines, { ...options, verdicts })))
    .catch((error: unknown) => {
      log.warn(
        { source: options.source, error: String(error) },
        'CRISIS_ADJUDICATOR shadow failed'
      );
    });
}

/** Live and a checkin: the turn gets the soft check. Anything else escalates as before. */
export async function adjudicatedCheckin(run: CrisisAdjudicatorRun | null): Promise<boolean> {
  if (!run) return false;
  // Shadow never changes the reply; its decision is only logged.
  if (run.mode !== 'live') {
    run.result.catch((error: unknown) => logRunFailure(run.mode, error));
    return false;
  }
  const r = await run.result.catch((error: unknown) => {
    logRunFailure(run.mode, error);
    return null;
  });
  return r?.decision === 'checkin';
}

/** A failed run escalates as before; log why (never the transcript). */
function logRunFailure(mode: CrisisAdjudicatorMode, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log.warn({ mode, error: message }, 'CRISIS_ADJUDICATOR run failed, escalating as before');
}
