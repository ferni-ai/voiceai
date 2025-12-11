/**
 * Brand Validator Service
 *
 * Real-time validation of content against brand rules.
 * Checks for banned phrases, tone mismatches, and brand compliance.
 *
 * @module @ferni/brand/brand-validator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { loadBrandContext, getVoiceRules, getBannedPhrases, getWordsToAvoid } from './brand-context.js';
import { containsAntiPattern, getPersonaVoice } from './persona-voices.js';
import type {
  BrandContext,
  BrandViolation,
  ValidationResult,
  PersonaId,
  ContextType,
} from './types.js';

const log = createLogger({ module: 'BrandValidator' });

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate content against all brand rules
 */
export async function validateBrandCompliance(
  content: string,
  options: {
    persona?: PersonaId;
    context?: ContextType;
    strict?: boolean;
  } = {}
): Promise<ValidationResult> {
  const { persona = 'ferni', context = 'checkin', strict = false } = options;

  const violations: BrandViolation[] = [];
  const brandContext = await loadBrandContext();

  // 1. Check banned phrases (critical)
  const phraseViolations = checkBannedPhrases(content, brandContext);
  violations.push(...phraseViolations);

  // 2. Check avoided words (warning)
  const wordViolations = checkAvoidedWords(content, brandContext);
  violations.push(...wordViolations);

  // 3. Check persona anti-patterns
  const personaViolations = checkPersonaAntiPatterns(content, persona);
  violations.push(...personaViolations);

  // 4. Check tone (AI-assisted analysis)
  const toneViolations = analyzeTone(content, context);
  violations.push(...toneViolations);

  // 5. Check corporate language patterns
  const corporateViolations = checkCorporateLanguage(content);
  violations.push(...corporateViolations);

  // 6. Check saccharine patterns
  const saccharineViolations = checkSaccharineLanguage(content);
  violations.push(...saccharineViolations);

  // Calculate score
  const criticalCount = violations.filter((v) => v.severity === 'critical').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const suggestionCount = violations.filter((v) => v.severity === 'suggestion').length;

  // Score: start at 100, subtract for violations
  const score = Math.max(
    0,
    100 - criticalCount * 25 - warningCount * 10 - suggestionCount * 2
  );

  const isCompliant = strict ? violations.length === 0 : criticalCount === 0;

  log.debug(
    {
      contentLength: content.length,
      violations: violations.length,
      score,
      isCompliant,
    },
    'Brand validation complete'
  );

  return {
    isCompliant,
    score,
    violations,
    suggestions: violations.map((v) => v.suggestion),
  };
}

/**
 * Check for banned phrases
 */
function checkBannedPhrases(content: string, context: BrandContext): BrandViolation[] {
  const violations: BrandViolation[] = [];
  const lowerContent = content.toLowerCase();

  for (const phrase of context.voice.bannedPhrases) {
    const lowerPhrase = phrase.toLowerCase();
    const index = lowerContent.indexOf(lowerPhrase);

    if (index !== -1) {
      violations.push({
        type: 'banned_phrase',
        severity: 'critical',
        text: phrase,
        position: { start: index, end: index + phrase.length },
        suggestion: `Remove "${phrase}" - this phrase is absolutely banned`,
        rule: 'BRAND-VOICE-GUIDE.md: Banned Phrases',
      });
    }
  }

  return violations;
}

/**
 * Check for avoided words
 */
function checkAvoidedWords(content: string, context: BrandContext): BrandViolation[] {
  const violations: BrandViolation[] = [];

  for (const wordRule of context.voice.wordsToAvoid) {
    // Use word boundary matching
    const regex = new RegExp(`\\b${escapeRegex(wordRule.avoid)}\\b`, 'gi');
    const match = regex.exec(content);

    if (match) {
      violations.push({
        type: 'banned_word',
        severity: wordRule.severity,
        text: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        suggestion:
          wordRule.useInstead === "(just don't mention)" ||
          wordRule.useInstead === "(don't mention)" ||
          wordRule.useInstead === '(never use)'
            ? `Remove "${match[0]}" completely`
            : `Replace "${match[0]}" with "${wordRule.useInstead}"`,
        rule: 'BRAND-VOICE-GUIDE.md: Words We Avoid',
      });
    }
  }

  return violations;
}

/**
 * Check persona-specific anti-patterns
 */
function checkPersonaAntiPatterns(content: string, personaId: PersonaId): BrandViolation[] {
  const violations: BrandViolation[] = [];
  const matchedPattern = containsAntiPattern(content, personaId);

  if (matchedPattern) {
    const persona = getPersonaVoice(personaId);
    violations.push({
      type: 'persona_mismatch',
      severity: 'warning',
      text: matchedPattern,
      position: {
        start: content.toLowerCase().indexOf(matchedPattern.toLowerCase()),
        end:
          content.toLowerCase().indexOf(matchedPattern.toLowerCase()) + matchedPattern.length,
      },
      suggestion: `"${matchedPattern}" doesn't fit ${persona.name}'s voice. Try using their signature phrases instead.`,
      rule: `Persona Voice Profile: ${persona.name}`,
    });
  }

  return violations;
}

/**
 * Analyze tone for context appropriateness
 */
function analyzeTone(content: string, context: ContextType): BrandViolation[] {
  const violations: BrandViolation[] = [];

  // Check for excessive punctuation (suggests over-enthusiasm)
  const exclamationCount = (content.match(/!/g) || []).length;
  if (exclamationCount > 2) {
    violations.push({
      type: 'too_saccharine',
      severity: 'warning',
      text: '! (multiple)',
      position: { start: 0, end: content.length },
      suggestion: 'Reduce exclamation marks - genuine warmth doesn\'t need emphasis',
      rule: 'Voice Principle: Warm, Not Saccharine',
    });
  }

  // Check for all caps (shouting)
  const capsWords = content.match(/\b[A-Z]{4,}\b/g);
  if (capsWords && capsWords.length > 0) {
    violations.push({
      type: 'too_saccharine',
      severity: 'warning',
      text: capsWords[0],
      position: { start: 0, end: content.length },
      suggestion: `Remove all-caps "${capsWords[0]}" - we don't shout`,
      rule: 'Voice Principle: Warm, Not Saccharine',
    });
  }

  // Check energy level vs context
  const highEnergyPatterns = [
    /amazing/i,
    /incredible/i,
    /absolutely/i,
    /definitely/i,
    /totally/i,
    /super\s/i,
    /so\s+happy/i,
    /love\s+that/i,
  ];

  const isHighEnergy = highEnergyPatterns.some((p) => p.test(content));
  const contextNeedsCalm = ['support', 'error', 'notification'].includes(context);

  if (isHighEnergy && contextNeedsCalm) {
    violations.push({
      type: 'tone_mismatch',
      severity: 'suggestion',
      text: content,
      position: { start: 0, end: content.length },
      suggestion: `The ${context} context calls for steadier, calmer energy`,
      rule: `Tone by Context: ${context}`,
    });
  }

  return violations;
}

/**
 * Check for corporate/jargon language
 */
function checkCorporateLanguage(content: string): BrandViolation[] {
  const violations: BrandViolation[] = [];

  const corporatePatterns = [
    { pattern: /\bsynergy\b/i, term: 'synergy' },
    { pattern: /\bstakeholder\b/i, term: 'stakeholder' },
    { pattern: /\bactionable\b/i, term: 'actionable' },
    { pattern: /\bbest-in-class\b/i, term: 'best-in-class' },
    { pattern: /\bindustry-leading\b/i, term: 'industry-leading' },
    { pattern: /\bworld-class\b/i, term: 'world-class' },
    { pattern: /\bcutting-edge\b/i, term: 'cutting-edge' },
    { pattern: /\bstate-of-the-art\b/i, term: 'state-of-the-art' },
    { pattern: /\bgame-chang/i, term: 'game-changing' },
    { pattern: /\bscalable\b/i, term: 'scalable' },
    { pattern: /\boptimize\b/i, term: 'optimize' },
    { pattern: /\bmaximize\b/i, term: 'maximize' },
    { pattern: /\bimpactful\b/i, term: 'impactful' },
    { pattern: /\binnovative\b/i, term: 'innovative' },
    { pattern: /\brevolutionary\b/i, term: 'revolutionary' },
    { pattern: /\bdisruptive\b/i, term: 'disruptive' },
    { pattern: /\bseamless\b/i, term: 'seamless' },
    { pattern: /\bholistic\b/i, term: 'holistic' },
    { pattern: /\bpersonalized experience\b/i, term: 'personalized experience' },
    { pattern: /\bdata-driven\b/i, term: 'data-driven' },
  ];

  for (const { pattern, term } of corporatePatterns) {
    const match = pattern.exec(content);
    if (match) {
      violations.push({
        type: 'too_corporate',
        severity: 'warning',
        text: term,
        position: { start: match.index, end: match.index + match[0].length },
        suggestion: `"${term}" sounds corporate - use simpler, warmer language`,
        rule: 'Brand Anti-Patterns: Not corporate',
      });
    }
  }

  return violations;
}

/**
 * Check for saccharine/over-enthusiastic language
 */
function checkSaccharineLanguage(content: string): BrandViolation[] {
  const violations: BrandViolation[] = [];

  const saccharinePatterns = [
    { pattern: /\bOMG\b/i, term: 'OMG' },
    { pattern: /\bYay\b/i, term: 'Yay' },
    { pattern: /\bWow!\b/i, term: 'Wow!' },
    { pattern: /so\s+excited/i, term: 'so excited' },
    { pattern: /super\s+excited/i, term: 'super excited' },
    { pattern: /can't\s+wait/i, term: "can't wait" },
    { pattern: /\bamazing!!+/i, term: 'amazing!!' },
    { pattern: /\bawesome!!+/i, term: 'awesome!!' },
    { pattern: /\blove\s+love\s+love/i, term: 'love love love' },
    { pattern: /\bhuge\s+fan\b/i, term: 'huge fan' },
    { pattern: /\bsuper\s+happy\b/i, term: 'super happy' },
    { pattern: /💜|💕|🎉|✨|🙌|🤩/g, term: 'emoji' },
  ];

  for (const { pattern, term } of saccharinePatterns) {
    const match = pattern.exec(content);
    if (match) {
      violations.push({
        type: 'too_saccharine',
        severity: 'warning',
        text: term,
        position: { start: match.index, end: match.index + match[0].length },
        suggestion: `"${term}" is over-the-top - genuine warmth is quieter`,
        rule: 'Voice Principle: Warm, Not Saccharine',
      });
    }
  }

  return violations;
}

// ============================================================================
// QUICK VALIDATION HELPERS
// ============================================================================

/**
 * Quick check for banned content (no Firestore)
 */
export function quickValidate(content: string): {
  hasBannedContent: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const lowerContent = content.toLowerCase();

  // Check banned phrases
  const banned = getBannedPhrases();
  for (const phrase of banned) {
    if (lowerContent.includes(phrase.toLowerCase())) {
      issues.push(`Banned phrase: "${phrase}"`);
    }
  }

  // Check critical avoided words
  const avoided = getWordsToAvoid();
  for (const rule of avoided) {
    if (rule.severity === 'critical') {
      const regex = new RegExp(`\\b${escapeRegex(rule.avoid)}\\b`, 'i');
      if (regex.test(content)) {
        issues.push(`Banned word: "${rule.avoid}"`);
      }
    }
  }

  return {
    hasBannedContent: issues.length > 0,
    issues,
  };
}

/**
 * Auto-fix common brand violations
 */
export function autoFixViolations(content: string): {
  fixed: string;
  changes: string[];
} {
  let fixed = content;
  const changes: string[] = [];
  const avoided = getWordsToAvoid();

  for (const rule of avoided) {
    if (
      rule.useInstead &&
      !rule.useInstead.startsWith('(') &&
      rule.useInstead !== "(just don't mention)"
    ) {
      const regex = new RegExp(`\\b${escapeRegex(rule.avoid)}\\b`, 'gi');
      if (regex.test(fixed)) {
        fixed = fixed.replace(regex, rule.useInstead);
        changes.push(`"${rule.avoid}" → "${rule.useInstead}"`);
      }
    }
  }

  // Reduce excessive exclamation marks
  const excessiveExclamations = fixed.match(/!{2,}/g);
  if (excessiveExclamations) {
    fixed = fixed.replace(/!{2,}/g, '.');
    changes.push('Reduced excessive exclamation marks');
  }

  return { fixed, changes };
}

/**
 * Get a compliance score without full validation
 */
export function getQuickScore(content: string): number {
  const { issues } = quickValidate(content);
  return Math.max(0, 100 - issues.length * 25);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
