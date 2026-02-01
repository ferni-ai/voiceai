/**
 * Input Sanitizer - Phase 5 Adversarial Defense
 *
 * Protects against prompt injection, homoglyph attacks, and malformed input.
 * Normalizes input before semantic routing for consistent behavior.
 *
 * @module tools/semantic-router/defense/input-sanitizer
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'input-sanitizer' });

// ============================================================================
// TYPES
// ============================================================================

export interface SanitizationResult {
  /** Sanitized text */
  sanitized: string;
  /** Original text (for comparison) */
  original: string;
  /** Whether any modifications were made */
  wasModified: boolean;
  /** Detected threats */
  threats: DetectedThreat[];
  /** Risk score (0-1, higher = more suspicious) */
  riskScore: number;
}

export interface DetectedThreat {
  type: ThreatType;
  description: string;
  severity: 'low' | 'medium' | 'high';
  /** Position in original text where threat was found */
  position?: number;
}

export type ThreatType =
  | 'prompt_injection'
  | 'homoglyph'
  | 'invisible_chars'
  | 'context_hijack'
  | 'encoding_attack'
  | 'excessive_length'
  | 'gibberish';

// ============================================================================
// UNICODE NORMALIZATION
// ============================================================================

/**
 * Homoglyph mappings - visually similar characters that could be used to bypass filters.
 * Maps confusable characters to their ASCII equivalents.
 */
const HOMOGLYPH_MAP: Map<string, string> = new Map([
  // Cyrillic lookalikes
  ['\u0410', 'A'], // А -> A
  ['\u0412', 'B'], // В -> B
  ['\u0421', 'C'], // С -> C
  ['\u0415', 'E'], // Е -> E
  ['\u041D', 'H'], // Н -> H
  ['\u0406', 'I'], // І -> I
  ['\u041A', 'K'], // К -> K
  ['\u041C', 'M'], // М -> M
  ['\u041E', 'O'], // О -> O
  ['\u0420', 'P'], // Р -> P
  ['\u0422', 'T'], // Т -> T
  ['\u0425', 'X'], // Х -> X
  ['\u0430', 'a'], // а -> a
  ['\u0435', 'e'], // е -> e
  ['\u043E', 'o'], // о -> o
  ['\u0440', 'p'], // р -> p
  ['\u0441', 'c'], // с -> c
  ['\u0445', 'x'], // х -> x
  ['\u0443', 'y'], // у -> y
  // Greek lookalikes
  ['\u0391', 'A'], // Α -> A
  ['\u0392', 'B'], // Β -> B
  ['\u0395', 'E'], // Ε -> E
  ['\u0397', 'H'], // Η -> H
  ['\u0399', 'I'], // Ι -> I
  ['\u039A', 'K'], // Κ -> K
  ['\u039C', 'M'], // Μ -> M
  ['\u039D', 'N'], // Ν -> N
  ['\u039F', 'O'], // Ο -> O
  ['\u03A1', 'P'], // Ρ -> P
  ['\u03A4', 'T'], // Τ -> T
  ['\u03A7', 'X'], // Χ -> X
  ['\u03A5', 'Y'], // Υ -> Y
  ['\u0396', 'Z'], // Ζ -> Z
  ['\u03B1', 'a'], // α -> a (if used deceptively)
  ['\u03BF', 'o'], // ο -> o
  // Mathematical/special
  ['\u2212', '-'], // − -> -
  ['\u2010', '-'], // ‐ -> -
  ['\u2011', '-'], // ‑ -> -
  ['\u2013', '-'], // – -> -
  ['\u2014', '-'], // — -> -
  ['\u2018', "'"], // ' -> '
  ['\u2019', "'"], // ' -> '
  ['\u201C', '"'], // " -> "
  ['\u201D', '"'], // " -> "
  ['\uFF01', '!'], // ！ -> !
  ['\uFF1F', '?'], // ？ -> ?
]);

/**
 * Invisible characters that could be used to hide content.
 */
const INVISIBLE_CHARS = new Set([
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\uFEFF', // BOM / zero-width no-break space
  '\u00AD', // Soft hyphen
  '\u2060', // Word joiner
  '\u2061', // Function application
  '\u2062', // Invisible times
  '\u2063', // Invisible separator
  '\u2064', // Invisible plus
  '\u180E', // Mongolian vowel separator
  '\u034F', // Combining grapheme joiner
]);

/**
 * Normalize Unicode using NFKC and apply homoglyph mapping.
 */
function normalizeUnicode(text: string): { normalized: string; homoglyphsFound: number } {
  // First, apply NFKC normalization (decomposes + recomposes with compatibility)
  let normalized = text.normalize('NFKC');
  let homoglyphsFound = 0;

  // Then apply homoglyph mapping
  const chars = [...normalized];
  const result: string[] = [];

  for (const char of chars) {
    const replacement = HOMOGLYPH_MAP.get(char);
    if (replacement) {
      result.push(replacement);
      homoglyphsFound++;
    } else {
      result.push(char);
    }
  }

  return {
    normalized: result.join(''),
    homoglyphsFound,
  };
}

/**
 * Remove invisible characters.
 */
function removeInvisibleChars(text: string): { cleaned: string; removedCount: number } {
  const chars = [...text];
  const result: string[] = [];
  let removedCount = 0;

  for (const char of chars) {
    if (INVISIBLE_CHARS.has(char)) {
      removedCount++;
    } else {
      result.push(char);
    }
  }

  return {
    cleaned: result.join(''),
    removedCount,
  };
}

// ============================================================================
// PROMPT INJECTION DETECTION
// ============================================================================

/**
 * Patterns that indicate prompt injection attempts.
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  // System prompt override attempts
  { pattern: /\[SYSTEM\]/gi, severity: 'high' },
  { pattern: /\[ADMIN\]/gi, severity: 'high' },
  { pattern: /\[DEVELOPER\]/gi, severity: 'high' },
  { pattern: /system prompt/gi, severity: 'medium' },

  // Instruction override
  { pattern: /ignore .*(previous|above|all|prior).* instructions/gi, severity: 'high' },
  { pattern: /ignore (previous|above|all|prior) instructions/gi, severity: 'high' },
  { pattern: /disregard (previous|above|all|prior)/gi, severity: 'high' },
  { pattern: /forget (everything|your training)/gi, severity: 'high' },
  { pattern: /new instructions:/gi, severity: 'high' },
  { pattern: /override (safety|restrictions)/gi, severity: 'high' },

  // Role manipulation
  { pattern: /you are now/gi, severity: 'medium' },
  { pattern: /pretend (to be|you are)/gi, severity: 'medium' },
  { pattern: /act as if/gi, severity: 'low' },
  { pattern: /roleplay as/gi, severity: 'low' },

  // Jailbreak patterns
  { pattern: /DAN mode/gi, severity: 'high' },
  { pattern: /developer mode/gi, severity: 'medium' },
  { pattern: /unrestricted mode/gi, severity: 'high' },

  // XML/code injection
  { pattern: /<\/?system>/gi, severity: 'high' },
  { pattern: /<\/?admin>/gi, severity: 'high' },
  { pattern: /<\/?instruction>/gi, severity: 'medium' },
];

/**
 * Detect prompt injection attempts.
 */
function detectPromptInjection(text: string): DetectedThreat[] {
  const threats: DetectedThreat[] = [];

  for (const { pattern, severity } of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      threats.push({
        type: 'prompt_injection',
        description: `Potential prompt injection: "${match[0]}"`,
        severity,
        position: match.index,
      });
    }
  }

  return threats;
}

// ============================================================================
// CONTEXT HIJACK DETECTION
// ============================================================================

/**
 * Patterns that look like they're trying to inject system-level context.
 */
const CONTEXT_HIJACK_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  // Bracketed "system" messages
  { pattern: /^\s*\[.*?(system|admin|internal|debug).*?\]/gi, severity: 'high' },

  // Fake API responses
  { pattern: /\{\s*"error"\s*:/gi, severity: 'medium' },
  { pattern: /\{\s*"status"\s*:\s*"(error|success|ok)"/gi, severity: 'low' },

  // Fake tool outputs
  { pattern: /tool_result:/gi, severity: 'medium' },
  { pattern: /function_output:/gi, severity: 'medium' },
];

/**
 * Detect context hijacking attempts.
 */
function detectContextHijack(text: string): DetectedThreat[] {
  const threats: DetectedThreat[] = [];

  for (const { pattern, severity } of CONTEXT_HIJACK_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      threats.push({
        type: 'context_hijack',
        description: `Potential context hijack: "${match[0]}"`,
        severity,
        position: match.index,
      });
    }
  }

  return threats;
}

// ============================================================================
// ENCODING ATTACK DETECTION
// ============================================================================

/**
 * Detect potential encoding-based attacks.
 */
function detectEncodingAttacks(text: string): DetectedThreat[] {
  const threats: DetectedThreat[] = [];

  // Check for base64 encoded content (might be trying to hide instructions)
  const base64Pattern = /[A-Za-z0-9+/=]{50,}/g;
  let match: RegExpExecArray | null;
  while ((match = base64Pattern.exec(text)) !== null) {
    // Verify it's actually valid base64
    try {
      const decoded = Buffer.from(match[0], 'base64').toString('utf8');
      // If it decodes to readable text, it might be an attack
      if (/[a-zA-Z]{5,}/.test(decoded)) {
        threats.push({
          type: 'encoding_attack',
          description: 'Potential base64-encoded hidden content',
          severity: 'medium',
          position: match.index,
        });
      }
    } catch {
      // Not valid base64, ignore
    }
  }

  // Check for URL-encoded content
  const urlEncodedPattern = /%[0-9A-Fa-f]{2}(%[0-9A-Fa-f]{2}){5,}/g;
  while ((match = urlEncodedPattern.exec(text)) !== null) {
    threats.push({
      type: 'encoding_attack',
      description: 'Potential URL-encoded hidden content',
      severity: 'low',
      position: match.index,
    });
  }

  return threats;
}

// ============================================================================
// GIBBERISH DETECTION
// ============================================================================

/**
 * Calculate entropy of a string (bits per character).
 * High entropy text may be gibberish or encoded content.
 */
function calculateEntropy(text: string): number {
  if (text.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const char of text) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Check if text appears to be gibberish.
 */
function detectGibberish(text: string): DetectedThreat | null {
  // Skip short texts
  if (text.length < 20) return null;

  // Calculate entropy
  const entropy = calculateEntropy(text);

  // Very high entropy (>4.5 bits/char) suggests random or encoded content
  // Normal English text has entropy around 1.0-1.5 bits/char
  if (entropy > 4.5) {
    return {
      type: 'gibberish',
      description: `High entropy text detected (${entropy.toFixed(2)} bits/char)`,
      severity: 'medium',
    };
  }

  // Check for lack of common words
  const commonWords = ['the', 'and', 'is', 'to', 'a', 'of', 'it', 'i', 'you', 'that'];
  const words = text.toLowerCase().split(/\s+/);
  const commonWordCount = words.filter((w) => commonWords.includes(w)).length;

  // If text has many words but no common words, might be gibberish
  if (words.length > 10 && commonWordCount === 0) {
    // Check if it's not a different language (has vowels)
    const vowelRatio = (text.match(/[aeiouAEIOU]/g)?.length || 0) / text.length;
    if (vowelRatio < 0.05) {
      return {
        type: 'gibberish',
        description: 'Text appears to lack natural language patterns',
        severity: 'low',
      };
    }
  }

  return null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Maximum allowed input length.
 */
const MAX_INPUT_LENGTH = 2000;

/**
 * Sanitize and analyze user input for security threats.
 *
 * @param input - Raw user input
 * @returns Sanitization result with cleaned text and threat analysis
 */
export function sanitizeInput(input: string): SanitizationResult {
  const threats: DetectedThreat[] = [];
  let sanitized = input;
  let riskScore = 0;

  // Check length
  if (input.length > MAX_INPUT_LENGTH) {
    sanitized = input.slice(0, MAX_INPUT_LENGTH);
    threats.push({
      type: 'excessive_length',
      description: `Input truncated from ${input.length} to ${MAX_INPUT_LENGTH} chars`,
      severity: 'low',
    });
    riskScore += 0.1;
  }

  // Remove invisible characters
  const { cleaned: noInvisible, removedCount } = removeInvisibleChars(sanitized);
  if (removedCount > 0) {
    sanitized = noInvisible;
    threats.push({
      type: 'invisible_chars',
      description: `Removed ${removedCount} invisible characters`,
      severity: removedCount > 3 ? 'medium' : 'low',
    });
    riskScore += Math.min(0.3, removedCount * 0.05);
  }

  // Normalize Unicode and fix homoglyphs
  const { normalized, homoglyphsFound } = normalizeUnicode(sanitized);
  if (homoglyphsFound > 0) {
    sanitized = normalized;
    threats.push({
      type: 'homoglyph',
      description: `Normalized ${homoglyphsFound} homoglyph characters`,
      severity: homoglyphsFound > 5 ? 'medium' : 'low',
    });
    riskScore += Math.min(0.3, homoglyphsFound * 0.05);
  } else {
    sanitized = normalized;
  }

  // Detect prompt injection
  const injectionThreats = detectPromptInjection(sanitized);
  threats.push(...injectionThreats);
  for (const threat of injectionThreats) {
    riskScore +=
      threat.severity === 'high' ? 0.4 : threat.severity === 'medium' ? 0.2 : 0.1;
  }

  // Detect context hijacking
  const hijackThreats = detectContextHijack(sanitized);
  threats.push(...hijackThreats);
  for (const threat of hijackThreats) {
    riskScore +=
      threat.severity === 'high' ? 0.3 : threat.severity === 'medium' ? 0.15 : 0.05;
  }

  // Detect encoding attacks
  const encodingThreats = detectEncodingAttacks(sanitized);
  threats.push(...encodingThreats);
  for (const threat of encodingThreats) {
    riskScore += threat.severity === 'medium' ? 0.15 : 0.05;
  }

  // Detect gibberish
  const gibberishThreat = detectGibberish(sanitized);
  if (gibberishThreat) {
    threats.push(gibberishThreat);
    riskScore += 0.2;
  }

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Cap risk score at 1.0
  riskScore = Math.min(1.0, riskScore);

  const result: SanitizationResult = {
    sanitized,
    original: input,
    wasModified: sanitized !== input,
    threats,
    riskScore,
  };

  if (threats.length > 0) {
    log.warn(
      {
        threatCount: threats.length,
        riskScore: riskScore.toFixed(2),
        types: threats.map((t) => t.type),
      },
      'Potential threats detected in input'
    );
  }

  return result;
}

/**
 * Check if input should be blocked based on risk score.
 *
 * @param result - Sanitization result
 * @param threshold - Risk threshold (default: 0.7)
 * @returns Whether the input should be blocked
 */
export function shouldBlockInput(result: SanitizationResult, threshold = 0.7): boolean {
  return result.riskScore >= threshold;
}

/**
 * Get a human-readable summary of threats.
 */
export function getThreatSummary(result: SanitizationResult): string {
  if (result.threats.length === 0) {
    return 'No threats detected';
  }

  const highThreats = result.threats.filter((t) => t.severity === 'high');
  const mediumThreats = result.threats.filter((t) => t.severity === 'medium');
  const lowThreats = result.threats.filter((t) => t.severity === 'low');

  const parts: string[] = [];
  if (highThreats.length > 0) {
    parts.push(`${highThreats.length} high-severity`);
  }
  if (mediumThreats.length > 0) {
    parts.push(`${mediumThreats.length} medium-severity`);
  }
  if (lowThreats.length > 0) {
    parts.push(`${lowThreats.length} low-severity`);
  }

  return `${parts.join(', ')} threat(s) detected. Risk score: ${(result.riskScore * 100).toFixed(0)}%`;
}

// Export for testing
export { calculateEntropy, normalizeUnicode, removeInvisibleChars };

// ============================================================================
// DEFENSE STATS TRACKING
// ============================================================================

interface DefenseStats {
  totalInputs: number;
  threatsDetected: number;
  inputsBlocked: number;
  threatsByType: Record<ThreatType, number>;
  threatsBySeverity: { high: number; medium: number; low: number };
  avgRiskScore: number;
  lastReset: Date;
}

const defenseStats: DefenseStats = {
  totalInputs: 0,
  threatsDetected: 0,
  inputsBlocked: 0,
  threatsByType: {
    prompt_injection: 0,
    homoglyph: 0,
    invisible_chars: 0,
    context_hijack: 0,
    encoding_attack: 0,
    excessive_length: 0,
    gibberish: 0,
  },
  threatsBySeverity: { high: 0, medium: 0, low: 0 },
  avgRiskScore: 0,
  lastReset: new Date(),
};

let totalRiskScore = 0;

/**
 * Record defense stats from a sanitization result.
 * Call this after sanitizing input to track metrics.
 */
export function recordDefenseStats(result: SanitizationResult, wasBlocked: boolean): void {
  defenseStats.totalInputs++;
  totalRiskScore += result.riskScore;
  defenseStats.avgRiskScore = totalRiskScore / defenseStats.totalInputs;

  if (result.threats.length > 0) {
    defenseStats.threatsDetected += result.threats.length;

    for (const threat of result.threats) {
      defenseStats.threatsByType[threat.type]++;
      defenseStats.threatsBySeverity[threat.severity]++;
    }
  }

  if (wasBlocked) {
    defenseStats.inputsBlocked++;
  }
}

/**
 * Get current defense statistics.
 */
export function getDefenseStats(): DefenseStats & {
  blockRate: number;
  threatRate: number;
} {
  const blockRate =
    defenseStats.totalInputs > 0 ? defenseStats.inputsBlocked / defenseStats.totalInputs : 0;
  const threatRate =
    defenseStats.totalInputs > 0 ? defenseStats.threatsDetected / defenseStats.totalInputs : 0;

  return {
    ...defenseStats,
    blockRate,
    threatRate,
  };
}

/**
 * Reset defense statistics.
 */
export function resetDefenseStats(): void {
  defenseStats.totalInputs = 0;
  defenseStats.threatsDetected = 0;
  defenseStats.inputsBlocked = 0;
  defenseStats.threatsByType = {
    prompt_injection: 0,
    homoglyph: 0,
    invisible_chars: 0,
    context_hijack: 0,
    encoding_attack: 0,
    excessive_length: 0,
    gibberish: 0,
  };
  defenseStats.threatsBySeverity = { high: 0, medium: 0, low: 0 };
  defenseStats.avgRiskScore = 0;
  defenseStats.lastReset = new Date();
  totalRiskScore = 0;
}
