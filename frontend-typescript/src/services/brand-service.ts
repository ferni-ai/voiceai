/**
 * Brand Service (Frontend)
 *
 * Client-side brand validation and content generation.
 * Fetches brand rules from the API and validates content locally.
 *
 * @module @ferni/frontend/brand-service
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('BrandService');

// ============================================================================
// TYPES
// ============================================================================

export interface BrandRules {
  bannedPhrases: string[];
  wordsToAvoid: string[];
  wordsToUse: string[];
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

export interface PersonaSummary {
  id: string;
  name: string;
  role: string;
  archetype: string;
  tone: string;
  colors: {
    primary: string;
    secondary: string;
    glow: string;
  };
}

// ============================================================================
// STATE
// ============================================================================

let cachedRules: BrandRules | null = null;
let cachedPersonas: PersonaSummary[] | null = null;
let rulesLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Load brand rules from API (cached)
 */
export async function loadBrandRules(): Promise<BrandRules> {
  // Return cached if fresh
  if (cachedRules && Date.now() - rulesLoadedAt < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const response = await fetch('/api/brand/rules');
    if (!response.ok) {
      throw new Error(`Failed to load brand rules: ${response.status}`);
    }

    cachedRules = (await response.json()) as BrandRules;
    rulesLoadedAt = Date.now();

    log.debug('Brand rules loaded', { 
      bannedCount: cachedRules.bannedPhrases.length,
      avoidCount: cachedRules.wordsToAvoid.length,
    });

    return cachedRules;
  } catch (error) {
    log.error('Failed to load brand rules', error);
    // Return minimal fallback rules
    return {
      bannedPhrases: ['As an AI', "I'm an AI", 'chatbot', 'bot'],
      wordsToAvoid: ['AI', 'artificial', 'virtual assistant'],
      wordsToUse: ['companion', 'present', 'notice', 'remember'],
    };
  }
}

/**
 * Load personas from API (cached)
 */
export async function loadPersonas(): Promise<PersonaSummary[]> {
  if (cachedPersonas) {
    return cachedPersonas;
  }

  try {
    const response = await fetch('/api/brand/personas');
    if (!response.ok) {
      throw new Error(`Failed to load personas: ${response.status}`);
    }

    const data = (await response.json()) as { personas: PersonaSummary[] };
    cachedPersonas = data.personas;

    log.debug('Personas loaded', { count: cachedPersonas.length });

    return cachedPersonas;
  } catch (error) {
    log.error('Failed to load personas', error);
    return [];
  }
}

/**
 * Get a specific persona
 */
export async function getPersona(personaId: string): Promise<PersonaSummary | null> {
  const personas = await loadPersonas();
  return personas.find((p) => p.id === personaId) || null;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate content against brand rules (local, fast)
 */
export async function validateContent(content: string): Promise<ValidationResult> {
  const rules = await loadBrandRules();
  const issues: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check banned phrases
  for (const phrase of rules.bannedPhrases) {
    if (lowerContent.includes(phrase.toLowerCase())) {
      issues.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // Check avoided words
  for (const word of rules.wordsToAvoid) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    if (regex.test(content)) {
      issues.push(`Contains avoided word: "${word}"`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Quick sync validation (for real-time checking)
 */
export function quickValidateSync(content: string): ValidationResult {
  if (!cachedRules) {
    // Rules not loaded yet - assume valid
    return { isValid: true, issues: [] };
  }

  const issues: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check banned phrases only (fast)
  for (const phrase of cachedRules.bannedPhrases) {
    if (lowerContent.includes(phrase.toLowerCase())) {
      issues.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Full validation via API (more thorough)
 */
export async function validateContentFull(
  content: string,
  options: { persona?: string; context?: string } = {}
): Promise<{
  isCompliant: boolean;
  score: number;
  violations: Array<{ type: string; text: string; suggestion: string }>;
}> {
  try {
    const response = await fetch('/api/brand/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        persona: options.persona,
        context: options.context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Validation failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log.error('Brand validation API error', error);
    return {
      isCompliant: true,
      score: 100,
      violations: [],
    };
  }
}

// ============================================================================
// CONTENT HELPERS
// ============================================================================

/**
 * Check if content contains any words we should use
 */
export async function hasGoodBrandWords(content: string): Promise<boolean> {
  const rules = await loadBrandRules();
  const lowerContent = content.toLowerCase();

  return rules.wordsToUse.some((word) => 
    lowerContent.includes(word.toLowerCase())
  );
}

/**
 * Get persona colors
 */
export async function getPersonaColors(
  personaId: string
): Promise<{ primary: string; secondary: string; glow: string } | null> {
  const persona = await getPersona(personaId);
  return persona?.colors || null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize brand service (preload rules)
 */
export async function initBrandService(): Promise<void> {
  log.info('Initializing brand service');
  
  // Preload rules and personas in parallel
  await Promise.all([loadBrandRules(), loadPersonas()]);
  
  log.info('Brand service initialized');
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape regex special characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clear cache (for testing or forced refresh)
 */
export function clearBrandCache(): void {
  cachedRules = null;
  cachedPersonas = null;
  rulesLoadedAt = 0;
}
