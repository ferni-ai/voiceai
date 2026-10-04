/**
 * Crisis Classifier - semantic second stage for the crisis guard
 *
 * The crisis guard's patterns are instant and precise but only recognise
 * phrasings someone thought to write down; indirect, messy real speech ("im
 * parked on the bridge, engine off, just sitting here deciding") gets past
 * them. This stage asks a small LLM to triage the same message with C-SSRS
 * style definitions.
 *
 * It only ever escalates the guard's decision (applyClassifierVerdict in
 * crisis-guard.ts); a timeout, an error or an unparseable reply leaves the
 * guard's decision as it was.
 *
 * Modes (env CRISIS_CLASSIFIER_MODE):
 *   off     — never called (default under tests, so tests make no network calls)
 *   shadow  — called in the background, verdict logged, turn unaffected
 *   live    — merged into the turn, bounded by CRISIS_CLASSIFIER_TIMEOUT_MS (DEFAULT).
 *             The voice reply is held until the verdict (personas/crisis-gate.ts).
 *
 * Privacy: logs carry the verdict, never the transcript text.
 *
 * @module CrisisClassifier
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisClassifier' });

export type CrisisClassifierMode = 'off' | 'shadow' | 'live';

export type ClassifierRisk = 'imminent' | 'crisis' | 'none';

export interface CrisisVerdict {
  risk: ClassifierRisk;
  subject: 'self' | 'third_party';
}

export interface CrisisClassifierInput {
  /** The caller's latest message. */
  latest: string;
  /** The caller's earlier messages this session, oldest first. */
  earlier: readonly string[];
}

/** Sends the prompt and input to a model and returns its raw text reply. */
export type CrisisGenerateFn = (
  systemPrompt: string,
  userContent: string,
  signal: AbortSignal
) => Promise<string>;

/**
 * Served from the global endpoint only (us-central1 returns 404). On the blind
 * set: 100% recall, 0/60 false positives, 40/40 imminent, p50 535ms, p95 ~0.7s.
 */
export const DEFAULT_CRISIS_CLASSIFIER_MODEL = 'gemini-3.5-flash-lite';
/** Above the measured p95; on voice the call overlaps the LLM's own first-token wait. */
export const DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS = 1000;
const MAX_EARLIER_MESSAGES = 5;

export const CRISIS_CLASSIFIER_PROMPT = `You triage suicide and self-harm risk for a voice companion app. Read the caller's LATEST message, using EARLIER messages from the same conversation only as context, and classify the LATEST message.

Return JSON only: {"risk":"imminent"|"crisis"|"none","subject":"self"|"third_party"}

risk = "imminent" when the latest message shows any of:
- an attempt underway or just made (took pills, drank something toxic, started cutting, car running in a closed garage)
- means in hand or at the location (pills lined up, gun loaded or unlocked, rope ready, standing at a bridge, edge, roof, river or tracks) together with intent
- stated intent with a plan or a time ("tonight", "after friday", "when everyone's asleep", "set the date")
- ongoing self-harm happening now or repeatedly (cut again last night and still bleeding, burning myself on purpose as a routine)
- a final goodbye or last request ("won't be here tomorrow", "tell my mom I love her after I'm gone")

risk = "crisis" when it shows, without the above:
- passive ideation (wish I wouldn't wake up, want to not exist, wouldn't mind if something hit me)
- hopelessness about living, perceived burdensomeness ("they'd be better off without me"), feeling trapped with no way out
- preparatory behavior said indirectly (giving things away, writing letters or passwords "just in case", stopping meds and cancelling therapy)
- method-seeking questions (lethal doses, unfenced bridges, how long carbon monoxide takes, whether a rope holds a person)
- a past attempt or self-harm mentioned together with current distress
- explicit language framed as a joke or a condition ("lol kms", "if this goes wrong I'll kill myself")
- coded language (kms, ctb, unalive, sewerslide)
- worry that SOMEONE ELSE is at risk (set subject to "third_party")

risk = "none" for everything else, including: idioms and hyperbole (this traffic is killing me, dying to see it, I'm dead lol), gaming, song lyrics, news, books, films or classes about suicide, grief about someone who died, recovery stories told with pride, benign medication or dosage questions for ordinary illness, explicit protective statements ("I'd never hurt myself", "not suicidal, just burnt out").

Messages may be in any language; judge the meaning. When unsure between imminent and crisis choose crisis. When unsure between crisis and none, choose crisis if a trained crisis counselor would want to check in.

subject is "third_party" only when the person at risk is someone other than the caller; otherwise "self".`;

export function resolveCrisisClassifierMode(
  env: Record<string, string | undefined> = process.env
): CrisisClassifierMode {
  const raw = env.CRISIS_CLASSIFIER_MODE?.trim().toLowerCase();
  if (raw === 'off' || raw === 'live' || raw === 'shadow') return raw;
  if (env.VITEST || env.NODE_ENV === 'test') return 'off';
  return 'live';
}

export function resolveCrisisClassifierTimeoutMs(
  env: Record<string, string | undefined> = process.env
): number {
  const ms = Number(env.CRISIS_CLASSIFIER_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS;
}

/** The model's JSON reply, or null when it is not a valid verdict. */
export function parseClassifierReply(reply: string): CrisisVerdict | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { risk?: unknown; subject?: unknown };
    const { risk } = parsed;
    if (risk !== 'imminent' && risk !== 'crisis' && risk !== 'none') return null;
    return { risk, subject: parsed.subject === 'third_party' ? 'third_party' : 'self' };
  } catch {
    return null;
  }
}

/**
 * Classify one message. Resolves to null on timeout, error or an unusable
 * reply, so a caller can always fall back to the pattern guard alone.
 */
export async function classifyCrisis(
  input: CrisisClassifierInput,
  generate: CrisisGenerateFn,
  timeoutMs: number = DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS
): Promise<CrisisVerdict | null> {
  const latest = input.latest.trim();
  if (!latest) return null;
  const earlier = input.earlier
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m !== latest)
    .slice(-MAX_EARLIER_MESSAGES);

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
      generate(CRISIS_CLASSIFIER_PROMPT, JSON.stringify({ latest, earlier }), controller.signal),
      timeout,
    ]);
    return reply === null ? null : parseClassifierReply(reply);
  } catch (error) {
    log.warn({ error: String(error) }, 'Crisis classifier failed; using pattern guard alone');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini-backed generate function. Resolves to '' when Gemini is not configured. */
export function createGeminiCrisisGenerate(
  model: string = process.env.CRISIS_CLASSIFIER_MODEL || DEFAULT_CRISIS_CLASSIFIER_MODEL
): CrisisGenerateFn {
  return async (systemPrompt, userContent, signal) => {
    const { getGlobalGeminiClient } = await import('../../config/gemini-global-client.js');
    const client = (await getGlobalGeminiClient()) as {
      models: {
        generateContent: (req: unknown) => Promise<{ text?: string }>;
      };
    } | null;
    if (!client) return '';
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        maxOutputTokens: 60,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  };
}

/** What the pattern guard decided for the same turn. */
export type PatternOutcome = 'block' | 'crisis' | 'none';

export interface CrisisClassifierRun {
  mode: 'shadow' | 'live';
  verdict: Promise<CrisisVerdict | null>;
}

export interface StartCrisisClassifierOptions {
  pattern: PatternOutcome;
  generate?: CrisisGenerateFn;
  env?: Record<string, string | undefined>;
}

let defaultGenerate: CrisisGenerateFn | null = null;

/**
 * One turn can reach the classifier more than once: a preemptive LLM request
 * and the final one, and the background turn handler. Identical input within
 * RECENT_RUN_TTL_MS shares one call. In memory only.
 */
const RECENT_RUN_TTL_MS = 30_000;
const RECENT_RUN_MAX = 32;
const recentRuns = new Map<string, { at: number; run: CrisisClassifierRun }>();

function cachedRun(key: string, now: number): CrisisClassifierRun | null {
  for (const [k, v] of recentRuns) if (now - v.at > RECENT_RUN_TTL_MS) recentRuns.delete(k);
  return recentRuns.get(key)?.run ?? null;
}

function rememberRun(key: string, now: number, run: CrisisClassifierRun): void {
  if (recentRuns.size >= RECENT_RUN_MAX) {
    const oldest = recentRuns.keys().next().value;
    if (oldest !== undefined) recentRuns.delete(oldest);
  }
  recentRuns.set(key, { at: now, run });
}

/** For tests: forget shared runs. */
export function resetCrisisClassifierCache(): void {
  recentRuns.clear();
}

export function verdictOutcome(verdict: CrisisVerdict): PatternOutcome {
  if (verdict.risk === 'none') return 'none';
  return verdict.risk === 'imminent' && verdict.subject === 'self' ? 'block' : 'crisis';
}

/**
 * Start the classifier for one turn, or return null when the mode is off or
 * (in live mode) the patterns already block — the classifier cannot escalate
 * past a block. Every completed run logs one CRISIS_CLASSIFIER record with the
 * verdict and the pattern outcome so agreement can be measured from logs.
 */
export function startCrisisClassifier(
  input: CrisisClassifierInput,
  options: StartCrisisClassifierOptions
): CrisisClassifierRun | null {
  const env = options.env ?? process.env;
  const mode = resolveCrisisClassifierMode(env);
  if (mode === 'off') return null;
  if (mode === 'live' && options.pattern === 'block') return null;

  const startedAt = Date.now();
  const key = JSON.stringify([input.latest.trim(), input.earlier.slice(-MAX_EARLIER_MESSAGES)]);
  const shared = cachedRun(key, startedAt);
  if (shared) return { mode, verdict: shared.verdict };

  const generate = options.generate ?? (defaultGenerate ??= createGeminiCrisisGenerate());
  const verdict = classifyCrisis(input, generate, resolveCrisisClassifierTimeoutMs(env)).then(
    (v) => {
      const classifier = v ? verdictOutcome(v) : null;
      log.info(
        {
          mode,
          risk: v?.risk ?? null,
          subject: v?.subject ?? null,
          classifier,
          pattern: options.pattern,
          agree: classifier === options.pattern,
          latencyMs: Date.now() - startedAt,
          noVerdict: v === null,
        },
        'CRISIS_CLASSIFIER'
      );
      return v;
    }
  );
  const run = { mode, verdict };
  rememberRun(key, startedAt, run);
  return run;
}

export default {
  startCrisisClassifier,
  classifyCrisis,
  parseClassifierReply,
  resolveCrisisClassifierMode,
  resolveCrisisClassifierTimeoutMs,
  createGeminiCrisisGenerate,
};
