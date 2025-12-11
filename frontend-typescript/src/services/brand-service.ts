/**
 * Brand Service - Client-side brand validation
 *
 * Preloads brand rules for fast client-side validation.
 * Used for real-time content checking before submission.
 *
 * @module @ferni/frontend/brand-service
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('BrandService');

// ============================================================================
// TYPES
// ============================================================================

interface BrandRules {
  bannedPhrases: string[];
  wordsToAvoid: string[];
  wordsToUse: string[];
}

interface ValidationResult {
  isCompliant: boolean;
  issues: string[];
  suggestions: string[];
}

// ============================================================================
// STATE
// ============================================================================

let brandRules: BrandRules | null = null;
let loadPromise: Promise<BrandRules> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the brand service by preloading rules
 */
export async function initBrandService(): Promise<void> {
  log.info('Initializing brand service');

  try {
    await loadBrandRules();
    log.info('Brand rules loaded', { 
      bannedPhrases: brandRules?.bannedPhrases.length,
      wordsToAvoid: brandRules?.wordsToAvoid.length 
    });
  } catch (error) {
    log.warn('Failed to preload brand rules, will retry on demand', { error });
  }
}

/**
 * Load brand rules from API
 */
async function loadBrandRules(): Promise<BrandRules> {
  if (brandRules) return brandRules;

  if (loadPromise) return loadPromise;

  loadPromise = fetch('/api/brand/rules')
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load brand rules: ${res.status}`);
      const data = (await res.json()) as BrandRules;
      brandRules = data;
      return data;
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Quick validate content against brand rules (client-side)
 */
export function quickValidate(content: string): ValidationResult {
  if (!brandRules) {
    // Rules not loaded yet, assume compliant
    return { isCompliant: true, issues: [], suggestions: [] };
  }

  const issues: string[] = [];
  const suggestions: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check banned phrases
  for (const phrase of brandRules.bannedPhrases) {
    if (lowerContent.includes(phrase.toLowerCase())) {
      issues.push(`Contains banned phrase: "${phrase}"`);
      suggestions.push(`Remove "${phrase}"`);
    }
  }

  // Check avoided words
  for (const word of brandRules.wordsToAvoid) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    if (regex.test(content)) {
      issues.push(`Contains avoided word: "${word}"`);
      suggestions.push(`Consider removing or replacing "${word}"`);
    }
  }

  return {
    isCompliant: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Check if content uses brand-preferred words
 */
export function checkPreferredWords(content: string): string[] {
  if (!brandRules) return [];

  const found: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const word of brandRules.wordsToUse) {
    if (lowerContent.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return found;
}

/**
 * Get brand compliance score (0-100)
 */
export function getComplianceScore(content: string): number {
  const result = quickValidate(content);
  
  // Start at 100, subtract for issues
  const criticalCount = result.issues.filter((i) => i.includes('banned')).length;
  const warningCount = result.issues.filter((i) => i.includes('avoided')).length;

  return Math.max(0, 100 - criticalCount * 25 - warningCount * 10);
}

/**
 * Full validation via API (more thorough)
 */
export async function validateContent(
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
      body: JSON.stringify({ content, ...options }),
    });

    if (!response.ok) {
      throw new Error(`Validation failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log.error('Brand validation failed', { error });
    // Fallback to client-side validation
    const result = quickValidate(content);
    return {
      isCompliant: result.isCompliant,
      score: getComplianceScore(content),
      violations: result.issues.map((issue) => ({
        type: issue.includes('banned') ? 'critical' : 'warning',
        text: issue,
        suggestion: result.suggestions[result.issues.indexOf(issue)] || '',
      })),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if rules are loaded
 */
export function isReady(): boolean {
  return brandRules !== null;
}

/**
 * Get banned phrases list
 */
export function getBannedPhrases(): string[] {
  return brandRules?.bannedPhrases || [];
}

/**
 * Get words to avoid list
 */
export function getWordsToAvoid(): string[] {
  return brandRules?.wordsToAvoid || [];
}

/**
 * Get preferred words list
 */
export function getWordsToUse(): string[] {
  return brandRules?.wordsToUse || [];
}

/**
 * Force reload brand rules
 */
export async function reloadRules(): Promise<void> {
  brandRules = null;
  loadPromise = null;
  await loadBrandRules();
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const brandService = {
  init: initBrandService,
  quickValidate,
  validateContent,
  checkPreferredWords,
  getComplianceScore,
  isReady,
  getBannedPhrases,
  getWordsToAvoid,
  getWordsToUse,
  reloadRules,
};
