/**
 * Gemini Client for Landing Intelligence
 *
 * Fast, low-latency Gemini client optimized for landing page use cases.
 * Uses Gemini 2.0 Flash for speed, with fallback to cached responses.
 *
 * NOTE: Uses dynamic import for @google/generative-ai to make it optional.
 * If the package is not installed, falls back to null responses.
 *
 * @module services/landing-intelligence/gemini-client
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getDefaultModel } from '../model-config.js';

// Dynamic import for optional Gemini dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleGenerativeAI: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HarmBlockThreshold: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HarmCategory: any;

// Try to load @google/generative-ai, but don't fail if not installed
async function loadGeminiSDK(): Promise<boolean> {
  try {
    // Use Function constructor to avoid TypeScript static analysis
    // This is a pattern for optional dependencies
    const importFn = new Function('specifier', 'return import(specifier)');
    const module = await importFn('@google/generative-ai');
    GoogleGenerativeAI = module.GoogleGenerativeAI;
    HarmBlockThreshold = module.HarmBlockThreshold;
    HarmCategory = module.HarmCategory;
    return true;
  } catch {
    log.warn('Gemini SDK not available - AI features will use fallbacks');
    return false;
  }
}

let sdkLoaded = false;
let sdkLoadPromise: Promise<boolean> | null = null;

async function ensureSDKLoaded(): Promise<boolean> {
  if (sdkLoaded) return !!GoogleGenerativeAI;
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = loadGeminiSDK().then((result) => {
    sdkLoaded = true;
    return result;
  });

  return sdkLoadPromise;
}

const log = createLogger({ module: 'LandingGemini' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY for backward compatibility
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// Use centralized model config (toggle via admin UI or model-config.json)
function getModelName(): string {
  return getDefaultModel();
}

// Safety settings - created dynamically when SDK is loaded
function getSafetySettings() {
  if (!HarmCategory || !HarmBlockThreshold) return [];

  return [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ];
}

// Generation config for fast responses
const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 500, // Keep responses short for speed
};

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

let genAI: any = null;

async function getClient(): Promise<any | null> {
  const hasSDK = await ensureSDKLoaded();
  if (!hasSDK || !GoogleGenerativeAI) {
    return null;
  }

  if (!genAI) {
    if (!GEMINI_API_KEY) {
      log.warn('GOOGLE_API_KEY or GEMINI_API_KEY not set');
      return null;
    }
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

// ============================================================================
// CACHING
// ============================================================================

interface CacheEntry {
  response: unknown;
  timestamp: number;
  ttl: number;
}

const responseCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(prompt: string, context: unknown): string {
  // Create a stable hash from prompt + context
  const input = JSON.stringify({ prompt, context });
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `gemini_${hash}`;
}

function getCachedResponse<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(key);
    return null;
  }

  return entry.response as T;
}

function setCachedResponse<T>(key: string, response: T, ttl = DEFAULT_CACHE_TTL): void {
  responseCache.set(key, {
    response,
    timestamp: Date.now(),
    ttl,
  });

  // Cleanup old entries
  if (responseCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now - v.timestamp > v.ttl) {
        responseCache.delete(k);
      }
    }
  }
}

// ============================================================================
// GENERATION
// ============================================================================

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  cacheTTL?: number;
  skipCache?: boolean;
  timeout?: number;
}

export async function generateJSON<T>(
  prompt: string,
  options: GenerationOptions = {}
): Promise<T | null> {
  const cacheKey = getCacheKey(prompt, options);

  // Check cache first
  if (!options.skipCache) {
    const cached = getCachedResponse<T>(cacheKey);
    if (cached) {
      log.debug({ cacheKey }, 'Cache hit');
      return cached;
    }
  }

  try {
    const client = await getClient();
    if (!client) {
      log.debug('Gemini client not available, returning null');
      return null;
    }

    const model = client.getGenerativeModel({
      model: getModelName(),
      safetySettings: getSafetySettings(),
      generationConfig: {
        ...GENERATION_CONFIG,
        maxOutputTokens: options.maxTokens || GENERATION_CONFIG.maxOutputTokens,
        temperature: options.temperature ?? GENERATION_CONFIG.temperature,
      },
    });

    // Add JSON instruction to prompt
    const fullPrompt = `${prompt}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, just the JSON object.`;

    const startTime = Date.now();

    // Generate with timeout
    const timeoutMs = options.timeout || 5000;
    const result = await Promise.race([
      model.generateContent(fullPrompt),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini timeout')), timeoutMs);
      }),
    ]);

    const { response } = result;
    const text = response.text();

    log.debug({ latency: Date.now() - startTime, textLength: text.length }, 'Generation complete');

    // Parse JSON from response
    const parsed = parseJSONResponse<T>(text);

    if (parsed) {
      setCachedResponse(cacheKey, parsed, options.cacheTTL);
    }

    return parsed;
  } catch (error) {
    log.error({ error }, 'Gemini generation failed');
    return null;
  }
}

export async function generateText(
  prompt: string,
  options: GenerationOptions = {}
): Promise<string | null> {
  try {
    const client = await getClient();
    if (!client) {
      log.debug('Gemini client not available, returning null');
      return null;
    }

    const model = client.getGenerativeModel({
      model: getModelName(),
      safetySettings: getSafetySettings(),
      generationConfig: {
        ...GENERATION_CONFIG,
        maxOutputTokens: options.maxTokens || 100, // Short for text
        temperature: options.temperature ?? 0.8,
      },
    });

    const startTime = Date.now();
    const timeoutMs = options.timeout || 3000; // Faster timeout for text

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini timeout')), timeoutMs);
      }),
    ]);

    const { response } = result;
    const text = response.text().trim();

    log.debug({ latency: Date.now() - startTime }, 'Text generation complete');

    return text;
  } catch (error) {
    log.error({ error }, 'Gemini text generation failed');
    return null;
  }
}

// ============================================================================
// JSON PARSING
// ============================================================================

function parseJSONResponse<T>(text: string): T | null {
  // Remove markdown code blocks if present
  let cleaned = text.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        log.warn({ text: cleaned.slice(0, 200) }, 'Failed to parse JSON from response');
        return null;
      }
    }

    log.warn({ text: cleaned.slice(0, 200) }, 'No JSON found in response');
    return null;
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function checkGeminiHealth(): Promise<boolean> {
  try {
    const result = await generateText('Say "ok"', { timeout: 2000 });
    return result !== null;
  } catch {
    return false;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function clearCache(): void {
  responseCache.clear();
  log.info('Cache cleared');
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: responseCache.size,
    keys: Array.from(responseCache.keys()),
  };
}
