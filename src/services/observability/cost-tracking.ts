/**
 * Cost Tracking Metrics
 *
 * Tracks AI service costs:
 * - LLM token costs
 * - TTS synthesis costs
 * - STT transcription costs
 * - Total spending by service and model
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// PRICING (approximate $ per unit)
// ============================================================================

const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.000005, output: 0.000015 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'claude-3-opus': { input: 0.000015, output: 0.000075 },
  'claude-3-sonnet': { input: 0.000003, output: 0.000015 },
  'claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
  'gemini-1.5-pro': { input: 0.00000125, output: 0.000005 },
  'gemini-1.5-flash': { input: 0.000000075, output: 0.0000003 },
};

const TTS_PRICING: Record<string, number> = {
  cartesia: 0.000007, // per character
  'elevenlabs-standard': 0.00003, // per character
  'elevenlabs-turbo': 0.000018, // per character
  'google-wavenet': 0.000016, // per character
  'google-standard': 0.000004, // per character
};

const STT_PRICING: Record<string, number> = {
  deepgram: 0.0043, // per minute
  whisper: 0.006, // per minute
  'google-enhanced': 0.009, // per minute
  'google-standard': 0.006, // per minute
};

// ============================================================================
// TYPES
// ============================================================================

export interface CostEvent {
  id: string;
  timestamp: number;
  service: 'llm' | 'tts' | 'stt' | 'embedding';
  provider: string;
  model?: string;
  units: number; // tokens, characters, or seconds
  estimatedCost: number;
  userId?: string;
  sessionId?: string;
}

export interface CostSnapshot {
  // Totals
  totalCost: number;
  costLast24h: number;
  costLastHour: number;

  // By service
  llmCost: number;
  ttsCost: number;
  sttCost: number;
  embeddingCost: number;

  // By model/provider
  costByModel: Record<string, number>;
  costByProvider: Record<string, number>;

  // Usage
  tokensUsed: number;
  charactersSpoken: number;
  minutesTranscribed: number;

  // Rates
  costPerSession: number;
  costPerMinute: number;
  projectedMonthlyCost: number;
}

// ============================================================================
// STATE
// ============================================================================

const costEvents: CostEvent[] = [];
const MAX_EVENTS = 10000;

// ============================================================================
// RECORDING
// ============================================================================

export function recordLLMCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string,
  sessionId?: string
): void {
  const pricing = LLM_PRICING[model] || { input: 0.000005, output: 0.000015 };
  const cost = inputTokens * pricing.input + outputTokens * pricing.output;

  costEvents.push({
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    service: 'llm',
    provider: model.includes('gpt') ? 'openai' : model.includes('claude') ? 'anthropic' : 'google',
    model,
    units: inputTokens + outputTokens,
    estimatedCost: cost,
    userId,
    sessionId,
  });

  trimEvents();
  log.debug({ model, tokens: inputTokens + outputTokens, cost: cost.toFixed(6) }, 'LLM cost recorded');
}

export function recordTTSCost(
  provider: string,
  characters: number,
  userId?: string,
  sessionId?: string
): void {
  const pricePerChar = TTS_PRICING[provider] || 0.000007;
  const cost = characters * pricePerChar;

  costEvents.push({
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    service: 'tts',
    provider,
    units: characters,
    estimatedCost: cost,
    userId,
    sessionId,
  });

  trimEvents();
}

export function recordSTTCost(
  provider: string,
  durationSeconds: number,
  userId?: string,
  sessionId?: string
): void {
  const pricePerMinute = STT_PRICING[provider] || 0.006;
  const cost = (durationSeconds / 60) * pricePerMinute;

  costEvents.push({
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    service: 'stt',
    provider,
    units: durationSeconds,
    estimatedCost: cost,
    userId,
    sessionId,
  });

  trimEvents();
}

export function recordEmbeddingCost(
  provider: string,
  tokens: number,
  userId?: string,
  sessionId?: string
): void {
  // Approximate embedding cost
  const cost = tokens * 0.0000001;

  costEvents.push({
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    service: 'embedding',
    provider,
    units: tokens,
    estimatedCost: cost,
    userId,
    sessionId,
  });

  trimEvents();
}

function trimEvents(): void {
  if (costEvents.length > MAX_EVENTS) {
    costEvents.splice(0, costEvents.length - MAX_EVENTS);
  }
}

// ============================================================================
// SNAPSHOT
// ============================================================================

export function getSnapshot(): CostSnapshot {
  const now = Date.now();
  const lastHour = costEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
  const last24h = costEvents.filter((e) => e.timestamp > now - 24 * 60 * 60 * 1000);

  // Totals
  const totalCost = costEvents.reduce((sum, e) => sum + e.estimatedCost, 0);
  const costLast24h = last24h.reduce((sum, e) => sum + e.estimatedCost, 0);
  const costLastHour = lastHour.reduce((sum, e) => sum + e.estimatedCost, 0);

  // By service
  const byService = (service: string) =>
    costEvents.filter((e) => e.service === service).reduce((sum, e) => sum + e.estimatedCost, 0);

  // By model/provider
  const costByModel: Record<string, number> = {};
  const costByProvider: Record<string, number> = {};

  for (const event of costEvents) {
    if (event.model) {
      costByModel[event.model] = (costByModel[event.model] || 0) + event.estimatedCost;
    }
    costByProvider[event.provider] = (costByProvider[event.provider] || 0) + event.estimatedCost;
  }

  // Usage
  const tokensUsed = costEvents.filter((e) => e.service === 'llm').reduce((sum, e) => sum + e.units, 0);
  const charactersSpoken = costEvents.filter((e) => e.service === 'tts').reduce((sum, e) => sum + e.units, 0);
  const minutesTranscribed =
    costEvents.filter((e) => e.service === 'stt').reduce((sum, e) => sum + e.units, 0) / 60;

  // Unique sessions
  const uniqueSessions = new Set(costEvents.filter((e) => e.sessionId).map((e) => e.sessionId)).size;
  const costPerSession = uniqueSessions > 0 ? totalCost / uniqueSessions : 0;

  // Cost per minute (based on last hour)
  const costPerMinute = costLastHour / 60;

  // Project monthly cost
  const projectedMonthlyCost = costLast24h * 30;

  return {
    totalCost,
    costLast24h,
    costLastHour,

    llmCost: byService('llm'),
    ttsCost: byService('tts'),
    sttCost: byService('stt'),
    embeddingCost: byService('embedding'),

    costByModel,
    costByProvider,

    tokensUsed,
    charactersSpoken,
    minutesTranscribed,

    costPerSession,
    costPerMinute,
    projectedMonthlyCost,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export const costMetrics = {
  recordLLMCost,
  recordTTSCost,
  recordSTTCost,
  recordEmbeddingCost,
  getSnapshot,
};
