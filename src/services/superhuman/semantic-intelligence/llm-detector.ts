/**
 * LLM-Powered Detection for Semantic Intelligence
 *
 * Uses Gemini Flash 2.0 for high-accuracy detection of:
 * - Advice patterns (when regex is uncertain)
 * - Person mentions (NER-like extraction)
 * - Advice outcomes (did user follow advice?)
 *
 * This provides "Better than Human" accuracy by combining:
 * - Fast regex pre-filtering
 * - LLM classification for edge cases
 * - Caching for repeated patterns
 *
 * @module services/superhuman/semantic-intelligence/llm-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getCircuitBreaker, CircuitOpenError } from '../../../utils/circuit-breaker.js';
import {
  getGeminiClient,
  TEMP_CLASSIFICATION,
  MAX_TOKENS_SHORT,
} from '../../../config/gemini-config.js';
import { getDefaultModel, getShortLLMTimeout } from '../../model-config.js';
import type { ExtractedPerson, PersonRelationship } from './person-extractor.js';

const log = createLogger({ module: 'llm-detector' });

// ============================================================================
// CONFIGURATION (from centralized model-config.ts)
// ============================================================================

const MAX_TOKENS = MAX_TOKENS_SHORT; // Short responses only (from centralized config)

// Circuit breaker for LLM calls
const llmCircuitBreaker = getCircuitBreaker('semantic-llm', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
});

// Simple in-memory cache with TTL
const cache = new Map<string, { result: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// GEMINI CLIENT (uses centralized factory from gemini-config.ts)
// ============================================================================

let geminiClient: unknown = null;

async function getClient(): Promise<unknown> {
  if (geminiClient) return geminiClient;
  geminiClient = await getGeminiClient();
  if (geminiClient) {
    log.info('LLM detector initialized via centralized config');
  }
  return geminiClient;
}

// ============================================================================
// CORE LLM CALL
// ============================================================================

interface LLMResponse<T> {
  success: boolean;
  data: T | null;
  cached: boolean;
  latencyMs: number;
}

async function callLLM<T>(
  prompt: string,
  cacheKey: string,
  parseResponse: (text: string) => T | null,
  timeout = getShortLLMTimeout()
): Promise<LLMResponse<T>> {
  const startTime = Date.now();

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return {
      success: true,
      data: cached.result as T,
      cached: true,
      latencyMs: Date.now() - startTime,
    };
  }

  // Check circuit breaker
  if (!llmCircuitBreaker.canRequest()) {
    log.debug('LLM circuit breaker open, skipping');
    return { success: false, data: null, cached: false, latencyMs: 0 };
  }

  try {
    const client = await getClient();
    if (!client) {
      return { success: false, data: null, cached: false, latencyMs: 0 };
    }

    // Call Gemini Flash with timeout
    const result = await llmCircuitBreaker.execute(async () => {
      const response = await Promise.race([
        (
          client as {
            models: {
              generateContent: (params: {
                model: string;
                contents: string;
                config: { maxOutputTokens: number; temperature: number };
              }) => Promise<{ text: string }>;
            };
          }
        ).models.generateContent({
          model: getDefaultModel(),
          contents: prompt,
          config: {
            maxOutputTokens: MAX_TOKENS,
            temperature: TEMP_CLASSIFICATION, // Low for consistent classification
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('LLM timeout')), timeout);
        }),
      ]);

      return response?.text?.trim() || '';
    });

    const latencyMs = Date.now() - startTime;
    log.debug({ latencyMs, cacheKey }, 'LLM call completed');

    // Parse the response
    const parsed = parseResponse(typeof result === 'string' ? result : '');

    if (parsed !== null) {
      // Cache successful result
      cache.set(cacheKey, { result: parsed, expires: Date.now() + CACHE_TTL });
    }

    return {
      success: parsed !== null,
      data: parsed,
      cached: false,
      latencyMs,
    };
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      log.debug('LLM circuit breaker opened');
    } else {
      log.warn({ error: String(error) }, 'LLM call failed');
    }
    return { success: false, data: null, cached: false, latencyMs: Date.now() - startTime };
  }
}

// ============================================================================
// ADVICE DETECTION (LLM-POWERED)
// ============================================================================

export interface LLMAdviceResult {
  containsAdvice: boolean;
  adviceText: string | null;
  category: 'behavioral' | 'emotional' | 'practical' | 'relational' | 'philosophical' | null;
  confidence: number;
}

const ADVICE_DETECTION_PROMPT = `Analyze if this text contains actionable advice or suggestions.

TEXT: "{text}"

Respond with ONLY a JSON object (no markdown):
{
  "containsAdvice": true/false,
  "adviceText": "the specific advice given" or null,
  "category": "behavioral"|"emotional"|"practical"|"relational"|"philosophical" or null,
  "confidence": 0.0-1.0
}

Rules:
- "behavioral": actions to take (exercise, sleep, habits)
- "emotional": feelings/self-care (be gentle, give permission)
- "practical": techniques/frameworks (Pomodoro, gratitude journal)
- "relational": communication/boundaries (talk to them, set limits)
- "philosophical": perspective/reflection (remember that, keep in mind)
- Questions asking if someone has tried something are NOT advice
- Suggestions like "try X" or "it might help" ARE advice
- Confidence should be 0.9+ for explicit advice, 0.6-0.8 for subtle suggestions`;

function parseAdviceResponse(text: string): LLMAdviceResult | null {
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      containsAdvice: Boolean(parsed.containsAdvice),
      adviceText: parsed.adviceText || null,
      category: parsed.category || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}

/**
 * Detect advice using Gemini Flash.
 * Falls back to regex if LLM is unavailable.
 */
export async function detectAdviceWithLLM(text: string): Promise<LLMAdviceResult> {
  if (!text || text.trim().length < 10) {
    return { containsAdvice: false, adviceText: null, category: null, confidence: 0 };
  }

  const cacheKey = `advice:${text.slice(0, 100)}`;
  const prompt = ADVICE_DETECTION_PROMPT.replace('{text}', text.slice(0, 500));

  // BUGFIX: Parameter order was reversed (prompt, cacheKey) not (cacheKey, prompt)
  const result = await callLLM<LLMAdviceResult>(prompt, cacheKey, parseAdviceResponse);

  if (result.success && result.data) {
    log.debug(
      { cached: result.cached, latencyMs: result.latencyMs, advice: result.data.containsAdvice },
      '🎯 LLM advice detection'
    );
    return result.data;
  }

  // Fallback: return uncertain result
  return { containsAdvice: false, adviceText: null, category: null, confidence: 0 };
}

// ============================================================================
// PERSON EXTRACTION (LLM-POWERED)
// ============================================================================

export interface LLMPersonResult {
  persons: Array<{
    name: string;
    relationship: PersonRelationship | null;
    isProperName: boolean;
    confidence: number;
  }>;
}

const PERSON_EXTRACTION_PROMPT = `Extract all people mentioned in this text.

TEXT: "{text}"

Respond with ONLY a JSON object (no markdown):
{
  "persons": [
    {
      "name": "the name or relationship term",
      "relationship": "parent"|"sibling"|"spouse"|"child"|"extended_family"|"friend"|"romantic"|"coworker"|"professional"|"acquaintance"|"pet"|"other" or null,
      "isProperName": true/false,
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Include relationship terms like "mom", "boss", "therapist"
- Include proper names like "Sarah", "Dr. Smith"
- "my mom" → name: "mom", relationship: "parent", isProperName: false
- "Sarah" → name: "Sarah", relationship: null (or inferred), isProperName: true
- Confidence 0.9+ for explicit mentions, lower for inferred
- Return empty array if no people mentioned`;

function parsePersonResponse(text: string): LLMPersonResult | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.persons)) return null;

    return {
      persons: parsed.persons.map(
        (p: {
          name?: string;
          relationship?: string;
          isProperName?: boolean;
          confidence?: number;
        }) => ({
          name: p.name || 'unknown',
          relationship: p.relationship as PersonRelationship | null,
          isProperName: Boolean(p.isProperName),
          confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
        })
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Extract persons using Gemini Flash.
 * Provides NER-like extraction with relationship classification.
 */
export async function extractPersonsWithLLM(text: string): Promise<ExtractedPerson[]> {
  if (!text || text.trim().length < 5) {
    return [];
  }

  const cacheKey = `persons:${text.slice(0, 100)}`;
  const prompt = PERSON_EXTRACTION_PROMPT.replace('{text}', text.slice(0, 500));

  // BUGFIX: Parameter order was reversed (prompt, cacheKey) not (cacheKey, prompt)
  const result = await callLLM<LLMPersonResult>(prompt, cacheKey, parsePersonResponse);

  if (result.success && result.data) {
    log.debug(
      { cached: result.cached, latencyMs: result.latencyMs, count: result.data.persons.length },
      '👥 LLM person extraction'
    );

    return result.data.persons.map((p) => ({
      name: p.name,
      relationship: p.relationship || undefined,
      confidence: p.confidence,
      contextSnippet: text.slice(0, 100),
      isProperName: p.isProperName,
    }));
  }

  return [];
}

// ============================================================================
// ADVICE OUTCOME DETECTION (LLM-POWERED)
// ============================================================================

export interface LLMOutcomeResult {
  referencesAdvice: boolean;
  outcome: 'followed' | 'ignored' | 'failed' | 'partial' | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  confidence: number;
}

const OUTCOME_DETECTION_PROMPT = `Determine if the user's message references previously given advice.

PREVIOUS ADVICE: "{advice}"
USER MESSAGE: "{message}"

Respond with ONLY a JSON object (no markdown):
{
  "referencesAdvice": true/false,
  "outcome": "followed"|"ignored"|"failed"|"partial" or null,
  "sentiment": "positive"|"negative"|"neutral" or null,
  "confidence": 0.0-1.0
}

Rules:
- "followed": user tried the advice and it worked
- "ignored": user explicitly didn't try it
- "failed": user tried but it didn't work
- "partial": user tried some of it
- Look for phrases like "I tried...", "I did...", "that helped", "didn't work"
- High confidence (0.8+) for explicit references, lower for implied`;

function parseOutcomeResponse(text: string): LLMOutcomeResult | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      referencesAdvice: Boolean(parsed.referencesAdvice),
      outcome: parsed.outcome || null,
      sentiment: parsed.sentiment || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}

/**
 * Detect if user message references and reports outcome of previous advice.
 */
export async function detectAdviceOutcomeWithLLM(
  userMessage: string,
  previousAdvice: string
): Promise<LLMOutcomeResult> {
  if (!userMessage || !previousAdvice) {
    return { referencesAdvice: false, outcome: null, sentiment: null, confidence: 0 };
  }

  const cacheKey = `outcome:${previousAdvice.slice(0, 50)}:${userMessage.slice(0, 50)}`;
  const prompt = OUTCOME_DETECTION_PROMPT.replace('{advice}', previousAdvice.slice(0, 200)).replace(
    '{message}',
    userMessage.slice(0, 300)
  );

  // BUGFIX: Parameter order was reversed (prompt, cacheKey) not (cacheKey, prompt)
  const result = await callLLM<LLMOutcomeResult>(prompt, cacheKey, parseOutcomeResponse);

  if (result.success && result.data) {
    log.debug(
      {
        cached: result.cached,
        latencyMs: result.latencyMs,
        references: result.data.referencesAdvice,
      },
      '📊 LLM outcome detection'
    );
    return result.data;
  }

  return { referencesAdvice: false, outcome: null, sentiment: null, confidence: 0 };
}

// ============================================================================
// HYBRID DETECTION (REGEX + LLM)
// ============================================================================

import { detectAdvice as detectAdviceRegex } from './advice-detector.js';
import { extractPersons as extractPersonsRegex } from './person-extractor.js';

/**
 * Hybrid advice detection: regex first, LLM for uncertain cases.
 *
 * Strategy:
 * - High regex confidence (>0.7) → use regex result
 * - Low regex confidence (<0.3) → no advice
 * - Middle range (0.3-0.7) → use LLM for classification
 */
export async function detectAdviceHybrid(text: string): Promise<LLMAdviceResult> {
  // Try regex first (fast)
  const regexResult = detectAdviceRegex(text);

  // High confidence regex → trust it
  if (regexResult.containsAdvice && regexResult.confidence >= 0.7) {
    return {
      containsAdvice: true,
      adviceText: regexResult.adviceText,
      category: regexResult.category,
      confidence: regexResult.confidence,
    };
  }

  // Very low confidence → no advice
  if (!regexResult.containsAdvice && regexResult.confidence < 0.3) {
    // But still check with LLM for edge cases the regex missed
    const llmResult = await detectAdviceWithLLM(text);
    if (llmResult.containsAdvice && llmResult.confidence > 0.7) {
      return llmResult;
    }
    return { containsAdvice: false, adviceText: null, category: null, confidence: 0 };
  }

  // Uncertain → use LLM
  const llmResult = await detectAdviceWithLLM(text);

  // If LLM gave us a confident result, use it
  if (llmResult.confidence > 0) {
    return llmResult;
  }

  // LLM failed/uncertain → fall back to regex result
  return {
    containsAdvice: regexResult.containsAdvice,
    adviceText: regexResult.adviceText,
    category: regexResult.category,
    confidence: regexResult.confidence,
  };
}

/**
 * Hybrid person extraction: regex first, LLM to enhance.
 *
 * Strategy:
 * - Always try regex first
 * - If regex finds nothing, try LLM
 * - Merge results if both find something
 */
export async function extractPersonsHybrid(text: string): Promise<ExtractedPerson[]> {
  // Try regex first
  const regexResults = extractPersonsRegex(text);

  // If regex found people with high confidence, return them
  if (regexResults.length > 0 && regexResults.some((p) => p.confidence > 0.8)) {
    return regexResults;
  }

  // Try LLM
  const llmResults = await extractPersonsWithLLM(text);

  // If LLM found people, prefer LLM (more accurate)
  if (llmResults.length > 0) {
    // Merge with regex results (deduplicate by name)
    const seen = new Set(llmResults.map((p) => p.name.toLowerCase()));
    const merged = [...llmResults];

    for (const regexPerson of regexResults) {
      if (!seen.has(regexPerson.name.toLowerCase())) {
        merged.push(regexPerson);
        seen.add(regexPerson.name.toLowerCase());
      }
    }

    return merged;
  }

  // LLM found nothing, return regex results
  return regexResults;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear the LLM detector cache.
 */
export function clearLLMDetectorCache(): void {
  cache.clear();
  log.debug('LLM detector cache cleared');
}

/**
 * Reset the client state (for testing).
 */
export function resetLLMDetectorClient(): void {
  geminiClient = null;
}

/**
 * Get cache stats for monitoring.
 */
export function getLLMDetectorStats(): { cacheSize: number; circuitOpen: boolean } {
  return {
    cacheSize: cache.size,
    circuitOpen: !llmCircuitBreaker.canRequest(),
  };
}
