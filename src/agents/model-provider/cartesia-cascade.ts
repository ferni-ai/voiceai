/**
 * Cartesia cascade provider: Cartesia STT -> Gemini text LLM (Vertex) -> Cartesia TTS.
 *
 * Why a cascade: Ferni speaks in Cartesia persona voices, so the LLM must emit
 * TEXT. The Gemini Live text-output model Ferni was built on
 * (gemini-2.0-flash-live-preview-04-09) is retired on Vertex, and the current
 * Gemini Live models (gemini-live-2.5-flash-native-audio, gemini-3.8-live) are
 * audio-output only and reject TEXT. A cascade keeps the persona voices and
 * lets STT, LLM and TTS be chosen and measured independently.
 *
 * LLM defaults were measured (2026-09-27, Vertex global, streaming,
 * voice-length reply): gemini-3.5-flash at MINIMAL thinking reached first
 * text in 0.7-0.9s; LOW took 1.4-1.9s. gemini-3.8-flash rejects MINIMAL, so
 * it is not the default.
 *
 * Credentials: Vertex via Application Default Credentials
 * (GOOGLE_APPLICATION_CREDENTIALS on LiveKit Cloud); Cartesia via
 * CARTESIA_API_KEY.
 *
 * @module agents/model-provider/cartesia-cascade
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ThinkingLevel } from '@google/genai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';
import { createCachedDeclarationsLLM, sharedDeclarationCache } from './gemini-declarations.js';
import { FastLaneLLM, fastLaneEnabled } from './fast-lane.js';
import { HedgedLLM } from './hedged-llm.js';
import type {
  AgentSessionTurnDetection,
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'CartesiaCascadeProvider' });

type Env = Record<string, string | undefined>;

export interface CascadeLLMOptions {
  model: string;
  vertexai: true;
  project?: string;
  location: string;
  temperature?: number;
  thinkingConfig: { thinkingLevel: ThinkingLevel } | { thinkingBudget: number };
}

export interface InkTurnDetection {
  startThreshold: number;
  eagerEndThreshold: number;
  endThreshold: number;
  endTimeoutMs: number;
}

export interface CascadeSTTOptions {
  model: string;
  language: string;
  baseUrl?: string;
  keyterms?: string[];
  turnDetection?: InkTurnDetection;
}

/**
 * ink-2 turn-detection profiles from Cartesia's turns guide. Balanced (the
 * server default) waits up to 5.6 s to end a turn; Responsive ends turns
 * sooner and is Cartesia's pick for fast conversational back-and-forth. About
 * 2.4 s of a ~3.5 s reply delay was ink deciding the caller had finished.
 * Responsive keeps Cartesia's start and eager values but ends turns at 0.3
 * (Balanced's level) instead of 0.4: at 0.4 Ferni answered into callers'
 * thinking pauses (dev, 2026-10-04).
 */
export const INK_TURN_PROFILES: Record<'balanced' | 'responsive' | 'patient', InkTurnDetection> = {
  balanced: { startThreshold: 0.8, eagerEndThreshold: 0.6, endThreshold: 0.3, endTimeoutMs: 5600 },
  responsive: {
    startThreshold: 0.7,
    eagerEndThreshold: 0.6,
    endThreshold: 0.3,
    endTimeoutMs: 4500,
  },
  patient: { startThreshold: 0.8, eagerEndThreshold: 0.3, endThreshold: 0.1, endTimeoutMs: 8000 },
};

/**
 * CASCADE_TURN_PROFILE: responsive (default), balanced or patient.
 * CASCADE_TURN_EAGER overrides the eager-end threshold alone: LiveKit starts
 * its preemptive reply on ink-2's eager end, which at 0.6 came only ~170 ms
 * before the turn ended (dev, 2026-09-30), so it saved little. Ink ends a turn
 * when its speech probability falls below a threshold, so a HIGHER eager value
 * fires earlier. It must stay strictly between the end and start thresholds:
 * ink closes the socket on anything else (1008 "Invalid turn thresholds"),
 * which left every dev call deaf when 0.35 was tried. Out-of-range values are
 * ignored.
 *
 * CASCADE_TURN_END overrides the end threshold the same way (strictly between
 * 0 and the eager threshold). In stt turn detection ink alone decides when the
 * caller has finished, so this is the knob for "Ferni talks over my pauses":
 * LiveKit's max endpointing delay is never consulted in this mode. Lower waits
 * longer before taking the turn.
 */
export function inkTurnProfile(env: Env = process.env): InkTurnDetection {
  const name = (env.CASCADE_TURN_PROFILE || 'responsive').toLowerCase();
  const base =
    INK_TURN_PROFILES[name as keyof typeof INK_TURN_PROFILES] ?? INK_TURN_PROFILES.responsive;
  const profile = withEndOverride(base, env.CASCADE_TURN_END);
  if (env.CASCADE_TURN_EAGER === undefined || env.CASCADE_TURN_EAGER === '') return profile;
  const eager = Number(env.CASCADE_TURN_EAGER);
  if (eager > profile.endThreshold && eager < profile.startThreshold) {
    return { ...profile, eagerEndThreshold: eager };
  }
  log.warn(
    { eager: env.CASCADE_TURN_EAGER, end: profile.endThreshold, start: profile.startThreshold },
    'CASCADE_TURN_EAGER ignored: must be between the end and start thresholds'
  );
  return profile;
}

function withEndOverride(profile: InkTurnDetection, raw: string | undefined): InkTurnDetection {
  if (raw === undefined || raw === '') return profile;
  const end = Number(raw);
  if (end > 0 && end < profile.eagerEndThreshold) return { ...profile, endThreshold: end };
  log.warn(
    { end: raw, eager: profile.eagerEndThreshold },
    'CASCADE_TURN_END ignored: must be between 0 and the eager threshold'
  );
  return profile;
}

/** First names of the team: made-up or uncommon names a general model has no prior for. */
const TEAM_NAMES = ['Ferni', 'Maya', 'Peter', 'Alex', 'Jordan', 'Nayan'];
const MAX_KEYTERMS = 100;
const MAX_KEYTERM_CHARS = 1200;

/**
 * Words to bias ink-2 toward: the team, the caller's name, and anything in
 * CASCADE_STT_KEYTERMS (comma-separated). Deduplicated and trimmed to
 * Cartesia's limits (100 terms, 1200 characters in total).
 */
export function buildCascadeKeyterms(
  context: { userName?: string },
  env: Env = process.env
): string[] {
  const name = context.userName?.trim();
  const candidates = [
    ...TEAM_NAMES,
    ...(name ? [name, name.split(/\s+/)[0]] : []),
    ...(env.CASCADE_STT_KEYTERMS ?? '').split(','),
  ];
  const terms: string[] = [];
  let chars = 0;
  for (const raw of candidates) {
    const term = raw.trim();
    if (!term || terms.includes(term)) continue;
    if (terms.length >= MAX_KEYTERMS || chars + term.length > MAX_KEYTERM_CHARS) break;
    terms.push(term);
    chars += term.length;
  }
  return terms;
}

/** LLM options for the cascade. Pure, so the defaults are pinned by tests. */
export function buildCascadeLLMOptions(
  env: Env = process.env,
  temperature?: number
): CascadeLLMOptions {
  const model = env.CASCADE_LLM_MODEL || 'gemini-3.5-flash';
  return {
    model,
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.CASCADE_LLM_LOCATION || 'global',
    temperature,
    thinkingConfig: cascadeThinking(model, env),
  };
}

/**
 * Gemini thinks by default and the hidden tokens delay the first word. Gemini 3
 * takes a thinking level (the plugin ignores a budget); 2.5 and earlier take a
 * budget and the plugin ignores a level, so a level alone left 2.5-flash
 * thinking dynamically. Budget 0 turns thinking off on 2.x.
 */
export function cascadeThinking(
  model: string,
  env: Env = process.env
): CascadeLLMOptions['thinkingConfig'] {
  return /^gemini-[12]\./.test(model)
    ? { thinkingBudget: 0 }
    : { thinkingLevel: cascadeThinkingLevel(model, env) };
}

/**
 * The lowest thinking level the model accepts, unless CASCADE_LLM_THINKING
 * names one. gemini-3.8-flash rejects MINIMAL with a 400 (measured
 * 2026-09-27); at LOW its first text took ~2.2s median vs ~0.9s for
 * gemini-3.5-flash at MINIMAL, with 64 tools and the full Ferni prompt.
 */
function cascadeThinkingLevel(model: string, env: Env): ThinkingLevel {
  const named = env.CASCADE_LLM_THINKING?.toUpperCase();
  if (named && named in ThinkingLevel) return ThinkingLevel[named as keyof typeof ThinkingLevel];
  return /^gemini-3\.8/.test(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
}

/**
 * Backup model for hedged replies (see hedged-llm.ts), or null when off.
 * gemini-3.5-flash-lite: the fastest 3.5 model, on the primary's location.
 * (gemini-3-flash-preview, the earlier backup, took p50 1.5 s to first text on
 * 2026-09-28 when the primary took 7.2 s; set CASCADE_LLM_BACKUP_MODEL to
 * hedge across model families instead.) CASCADE_LLM_HEDGE_MS=off disables.
 */
export function buildCascadeHedge(
  env: Env = process.env
): { backup: CascadeLLMOptions; hedgeAfterMs: number } | null {
  const raw = env.CASCADE_LLM_HEDGE_MS ?? '1300';
  if (raw === 'off') return null;
  const hedgeAfterMs = Number(raw);
  if (!Number.isFinite(hedgeAfterMs) || hedgeAfterMs < 0) return null;
  const model = env.CASCADE_LLM_BACKUP_MODEL || 'gemini-3.5-flash-lite';
  const primary = buildCascadeLLMOptions(env);
  if (model === primary.model) return null;
  return {
    hedgeAfterMs,
    backup: {
      ...primary,
      model,
      location: env.CASCADE_LLM_BACKUP_LOCATION || primary.location,
      thinkingConfig: cascadeThinking(model, env),
    },
  };
}

/**
 * Options for the fast lane (fast-lane.ts), or null when it is off.
 * gemini-3.5-flash-lite: first text ~650 ms vs ~1,030 ms for 3.5-flash with a
 * Ferni-sized prompt (2026-10-09). If it has said nothing after hedgeAfterMs,
 * the main model is started too.
 */
export function buildFastLane(
  env: Env,
  main: CascadeLLMOptions
): { options: CascadeLLMOptions; hedgeAfterMs: number } | null {
  if (!fastLaneEnabled(env)) return null;
  const model = env.CASCADE_FAST_LANE_MODEL || 'gemini-3.5-flash-lite';
  if (model === main.model) return null;
  const hedgeAfterMs = Number(env.CASCADE_FAST_LANE_HEDGE_MS ?? '900');
  return {
    options: { ...main, model, thinkingConfig: cascadeThinking(model, env) },
    hedgeAfterMs: Number.isFinite(hedgeAfterMs) && hedgeAfterMs >= 0 ? hedgeAfterMs : 900,
  };
}

/**
 * Log each STT stream the session opens. The caller's first turn waits ~1.1 s
 * for its transcript vs ~0.26 s later (prod, 13 calls, 2026-10-10); if a stream
 * is reopened just before that turn (an agent restart), its socket is new.
 */
export function logStreamOpens<T extends { stream: (...args: never[]) => unknown }>(stt: T): T {
  const open = stt.stream.bind(stt);
  const createdAt = Date.now();
  let opened = 0;
  stt.stream = ((...args: never[]) => {
    opened += 1;
    log.info({ stream: opened, sinceCreatedMs: Date.now() - createdAt }, 'STT_STREAM_OPEN');
    return open(...args);
  }) as T['stream'];
  return stt;
}

/** STT options for the cascade. ink-2 is Cartesia's English streaming model. */
export function buildCascadeSTTOptions(env: Env = process.env): CascadeSTTOptions {
  return {
    model: env.CASCADE_STT_MODEL || 'ink-2',
    language: env.CASCADE_STT_LANGUAGE || 'en',
    ...(env.CASCADE_STT_BASE_URL && { baseUrl: env.CASCADE_STT_BASE_URL }),
    turnDetection: inkTurnProfile(env),
  };
}

export class CartesiaCascadeProvider implements ModelProvider {
  readonly id: ModelProviderId = 'cartesia-cascade';
  readonly displayName = 'Cartesia Cascade (Cartesia STT + Gemini LLM + Cartesia TTS)';

  hasNativeFunctionCalling(): boolean {
    return true;
  }

  needsJsonWorkaround(): boolean {
    return false;
  }

  hasBuiltInTurnDetection(): boolean {
    return false;
  }

  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: false,
      includeFunctionCallingSpecialty: false,
      includeToolUsageGuidance: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: false,
      sparseSpeechMarkup: true,
      modelInstructionsInAgentPrompt: true,
    };
  }

  getTokenLimit(): number {
    return 32768;
  }

  getMinimalInstructions(): string {
    return [
      'You are a caring AI companion with superhuman emotional intelligence.',
      'Keep responses conversational and under 2 sentences for voice.',
      'Be present, warm, and genuinely supportive.',
    ].join('\n');
  }

  /**
   * The realtime model name in `config.model` does not apply to a text LLM and
   * is ignored; the cascade model comes from buildCascadeLLMOptions.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const opts = buildCascadeLLMOptions(process.env, config.temperature);
    const hedge = buildCascadeHedge(process.env);
    log.info(
      {
        model: opts.model,
        location: opts.location,
        backupModel: hedge?.backup.model ?? null,
        hedgeAfterMs: hedge?.hedgeAfterMs ?? null,
      },
      'Creating cascade Gemini text LLM'
    );
    // Both models share one declaration cache, so a hedge reuses the
    // primary's converted tool schemas.
    const declarations = await sharedDeclarationCache();
    const gemini = (o: CascadeLLMOptions): google.LLM =>
      declarations ? createCachedDeclarationsLLM(o, declarations) : new google.LLM(o);
    const primary = gemini(opts);
    const main = hedge
      ? new HedgedLLM(
          primary,
          gemini({ ...hedge.backup, temperature: config.temperature }),
          hedge.hedgeAfterMs
        )
      : primary;
    const fast = buildFastLane(process.env, opts);
    if (!fast) return main;
    log.info(fast, 'Cascade fast lane on');
    // A slow or failed fast model hands the turn to the main one.
    return new FastLaneLLM(new HedgedLLM(gemini(fast.options), main, fast.hedgeAfterMs), main);
  }

  createSTT(keyterms: string[] = []): unknown {
    const opts = { ...buildCascadeSTTOptions(), keyterms };
    log.info(
      {
        model: opts.model,
        language: opts.language,
        keyterms: keyterms.length,
        turnDetection: opts.turnDetection,
        // Keyterms and turn thresholds only reach ink if our plugin patch applied.
        pluginPatched: cartesiaPluginPatched(),
      },
      'Creating cascade Cartesia STT'
    );
    return logStreamOpens(new cartesia.STT(opts));
  }

  /**
   * ink-2 decides when the caller has finished (it emits turn start/end) from
   * what was said, not just silence. The VAD path ends a turn after a fixed
   * silence (endpointing 150-450ms), so a thinking pause can end it early.
   * CASCADE_TURN_DETECTION=vad restores the silence timer.
   */
  getSessionTurnDetection(): AgentSessionTurnDetection {
    return process.env.CASCADE_TURN_DETECTION === 'vad' ? 'vad' : 'stt';
  }

  needsPrewarm(): boolean {
    return false;
  }

  getLogPrefix(): string {
    return '🎛️';
  }
}

/**
 * STT for a provider that has no realtime model of its own. Returns the
 * cascade's Cartesia STT for cartesia-cascade and undefined for realtime
 * providers (their model transcribes internally). Used by both session
 * builders (voice-agent-entry and multi-agent) so a handoff keeps its STT.
 */
export function createProviderSTT(provider: { id: string }, keyterms: string[] = []): unknown {
  return provider instanceof CartesiaCascadeProvider ? provider.createSTT(keyterms) : undefined;
}

let pluginPatchedCache: boolean | undefined;

/** True when the installed Cartesia plugin carries our keyterm + turn-threshold patch. */
export function cartesiaPluginPatched(): boolean {
  if (pluginPatchedCache !== undefined) return pluginPatchedCache;
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@livekit/agents-plugin-cartesia');
    const stt = readFileSync(join(dirname(entry), 'stt.js'), 'utf8');
    pluginPatchedCache = stt.includes('turn_eager_end_threshold') && stt.includes('keyterm');
  } catch {
    pluginPatchedCache = false;
  }
  return pluginPatchedCache;
}
