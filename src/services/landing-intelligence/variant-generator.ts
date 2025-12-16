/**
 * Variant Generator
 *
 * Dynamically generates landing page variants using Gemini,
 * informed by winning A/B test patterns and visitor context.
 *
 * @module services/landing-intelligence/variant-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { quickValidate } from '../brand/index.js';
import type { ExperimentPattern } from '../experiments/hypothesis-generator.js';
import { generateJSON } from './gemini-client.js';
import type { VisitorIntent } from './intent-detector.js';
import type { TimeMode } from './time-aware.js';

const log = createLogger({ module: 'VariantGenerator' });

// ============================================================================
// TYPES
// ============================================================================

export interface VariantGenerationContext {
  /** Winning patterns from past experiments */
  winningPatterns?: ExperimentPattern[];

  /** Detected visitor intent */
  visitorIntent?: VisitorIntent;

  /** Time of day mode */
  timeMode?: TimeMode;

  /** Device type */
  device?: 'mobile' | 'tablet' | 'desktop';

  /** Referrer category */
  referrer?: string;

  /** Is returning visitor */
  isReturning?: boolean;

  /** Previous variant IDs shown */
  previousVariants?: string[];
}

export interface GeneratedVariant {
  /** Unique ID for this variant */
  id: string;

  /** Variant type */
  type: 'headline' | 'cta' | 'subhead' | 'full';

  /** Generated content */
  content: {
    tagline?: string;
    headline?: string;
    subhead?: string;
    ctaText?: string;
    ctaStyle?: 'primary' | 'secondary' | 'ghost';
  };

  /** Why this variant was generated */
  reasoning: string;

  /** Confidence in this variant (0-1) */
  confidence: number;

  /** Patterns this was based on */
  basedOnPatterns: string[];

  /** Generation timestamp */
  generatedAt: Date;
}

// ============================================================================
// BRAND RULES (Embedded for Gemini)
// ============================================================================

const BRAND_RULES = `
FERNI BRAND RULES (MANDATORY):

FORBIDDEN WORDS (never use):
- "chatbot", "AI assistant", "virtual assistant", "bot"
- "platform", "solution", "features", "functionality"
- "user", "utilize", "leverage"
- "therapist", "therapy", "advisor" (legal reasons)

VOICE:
- Warm, Grounded, Wise, Present, Human
- Compare to HUMANS, not other AI
- Lead with emotion, not features
- Use "you/your/we" not "user"

EXAMPLES OF GOOD HEADLINES:
- "Better than human."
- "Finally, someone who gets it."
- "What if someone actually understood?"
- "Someone who never forgets."

EXAMPLES OF GOOD TAGLINES:
- "Better than human."
- "Your AI life coach."
- "Beyond human limitations."
- "Always here for you."
`;

// ============================================================================
// HEADLINE GENERATION
// ============================================================================

const HEADLINE_PROMPT = `You are generating a landing page headline for Ferni, an AI life coach.

${BRAND_RULES}

CONTEXT:
{context}

WINNING PATTERNS FROM A/B TESTS:
{patterns}

Generate a headline that:
1. Incorporates winning patterns
2. Resonates with this specific visitor context
3. Follows brand rules STRICTLY
4. Is fresh and not a copy of existing variants

Return JSON:
{
  "tagline": "short tagline (3-5 words)",
  "headline": "main headline (5-10 words, can include <span class=\\"hero__headline-accent\\">accent</span> for emphasis)",
  "subhead": "supporting copy (15-25 words)",
  "reasoning": "why this will work",
  "confidence": 0.0-1.0
}`;

export async function generateHeadlineVariant(
  context: VariantGenerationContext
): Promise<GeneratedVariant | null> {
  const contextStr = formatContext(context);
  const patternsStr = formatPatterns(context.winningPatterns || []);

  const prompt = HEADLINE_PROMPT.replace('{context}', contextStr).replace(
    '{patterns}',
    patternsStr
  );

  const result = await generateJSON<{
    tagline: string;
    headline: string;
    subhead: string;
    reasoning: string;
    confidence: number;
  }>(prompt, {
    timeout: 4000,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
  });

  if (!result) {
    log.warn('Failed to generate headline variant');
    return null;
  }

  // Validate against brand rules
  const validation = quickValidate(`${result.tagline} ${result.headline} ${result.subhead}`);
  if (validation.hasBannedContent) {
    log.warn({ issues: validation.issues }, 'Generated variant failed brand validation');
    return null;
  }

  const variant: GeneratedVariant = {
    id: `headline_gen_${Date.now()}`,
    type: 'headline',
    content: {
      tagline: result.tagline,
      headline: result.headline,
      subhead: result.subhead,
    },
    reasoning: result.reasoning,
    confidence: result.confidence,
    basedOnPatterns: (context.winningPatterns || []).map((p) => p.attribute),
    generatedAt: new Date(),
  };

  log.info({ variantId: variant.id, confidence: variant.confidence }, 'Headline variant generated');

  return variant;
}

// ============================================================================
// CTA GENERATION
// ============================================================================

const CTA_PROMPT = `You are generating a CTA button for Ferni's landing page.

${BRAND_RULES}

CONTEXT:
{context}

WINNING CTA PATTERNS:
{patterns}

Good CTA examples:
- "Start Free" (action + value)
- "Meet Ferni" (personal)
- "Begin a Real Conversation" (emotional)
- "Try Ferni Now" (urgency)

Generate a CTA that:
1. Matches the visitor's buying stage
2. Incorporates winning patterns
3. Is 2-4 words

Return JSON:
{
  "ctaText": "button text",
  "ctaStyle": "primary" | "secondary",
  "reasoning": "why this will convert",
  "confidence": 0.0-1.0
}`;

export async function generateCTAVariant(
  context: VariantGenerationContext
): Promise<GeneratedVariant | null> {
  const contextStr = formatContext(context);
  const patternsStr = formatPatterns(
    (context.winningPatterns || []).filter((p) => p.attribute.startsWith('cta.'))
  );

  const prompt = CTA_PROMPT.replace('{context}', contextStr).replace('{patterns}', patternsStr);

  const result = await generateJSON<{
    ctaText: string;
    ctaStyle: 'primary' | 'secondary';
    reasoning: string;
    confidence: number;
  }>(prompt, {
    timeout: 3000,
    cacheTTL: 5 * 60 * 1000,
  });

  if (!result) {
    log.warn('Failed to generate CTA variant');
    return null;
  }

  // Validate
  const validation = quickValidate(result.ctaText);
  if (validation.hasBannedContent) {
    log.warn({ issues: validation.issues }, 'Generated CTA failed brand validation');
    return null;
  }

  const variant: GeneratedVariant = {
    id: `cta_gen_${Date.now()}`,
    type: 'cta',
    content: {
      ctaText: result.ctaText,
      ctaStyle: result.ctaStyle,
    },
    reasoning: result.reasoning,
    confidence: result.confidence,
    basedOnPatterns: (context.winningPatterns || [])
      .filter((p) => p.attribute.startsWith('cta.'))
      .map((p) => p.attribute),
    generatedAt: new Date(),
  };

  log.info({ variantId: variant.id, ctaText: result.ctaText }, 'CTA variant generated');

  return variant;
}

// ============================================================================
// FULL VARIANT GENERATION
// ============================================================================

export async function generatePersonalizedVariant(
  context: VariantGenerationContext
): Promise<GeneratedVariant | null> {
  // Generate headline and CTA together for coherence
  const fullPrompt = `You are generating a cohesive landing page hero for Ferni, an AI life coach.

${BRAND_RULES}

CONTEXT:
${formatContext(context)}

WINNING PATTERNS:
${formatPatterns(context.winningPatterns || [])}

Generate a COMPLETE, COHESIVE hero section that tells one story.

Return JSON:
{
  "tagline": "short tagline (3-5 words)",
  "headline": "main headline with <span class=\\"hero__headline-accent\\">emphasis</span>",
  "subhead": "supporting copy (15-25 words)",
  "ctaText": "button text (2-4 words)",
  "ctaStyle": "primary",
  "reasoning": "why this combination works",
  "confidence": 0.0-1.0
}`;

  const result = await generateJSON<{
    tagline: string;
    headline: string;
    subhead: string;
    ctaText: string;
    ctaStyle: 'primary' | 'secondary';
    reasoning: string;
    confidence: number;
  }>(fullPrompt, {
    timeout: 5000,
    cacheTTL: 5 * 60 * 1000,
  });

  if (!result) {
    log.warn('Failed to generate full variant');
    return null;
  }

  // Validate all content
  const allText = `${result.tagline} ${result.headline} ${result.subhead} ${result.ctaText}`;
  const validation = quickValidate(allText);
  if (validation.hasBannedContent) {
    log.warn({ issues: validation.issues }, 'Generated full variant failed brand validation');
    return null;
  }

  const variant: GeneratedVariant = {
    id: `full_gen_${Date.now()}`,
    type: 'full',
    content: {
      tagline: result.tagline,
      headline: result.headline,
      subhead: result.subhead,
      ctaText: result.ctaText,
      ctaStyle: result.ctaStyle,
    },
    reasoning: result.reasoning,
    confidence: result.confidence,
    basedOnPatterns: (context.winningPatterns || []).map((p) => p.attribute),
    generatedAt: new Date(),
  };

  log.info({ variantId: variant.id }, 'Full variant generated');

  return variant;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatContext(context: VariantGenerationContext): string {
  const lines: string[] = [];

  if (context.timeMode) {
    lines.push(`Time of day: ${context.timeMode}`);
  }

  if (context.visitorIntent) {
    lines.push(`Visitor concern: ${context.visitorIntent.primaryConcern}`);
    lines.push(`Buying stage: ${context.visitorIntent.buyingStage}`);
    lines.push(`Emotional state: ${context.visitorIntent.emotionalState}`);
  }

  if (context.device) {
    lines.push(`Device: ${context.device}`);
  }

  if (context.isReturning) {
    lines.push('Returning visitor: yes');
  }

  if (context.referrer) {
    lines.push(`Referrer: ${context.referrer}`);
  }

  return lines.join('\n') || 'No specific context';
}

function formatPatterns(patterns: ExperimentPattern[]): string {
  if (patterns.length === 0) {
    return 'No patterns available yet';
  }

  return patterns
    .map(
      (p) => `- ${p.attribute} = "${p.winningValue}" (${(p.confidence * 100).toFixed(0)}% win rate)`
    )
    .join('\n');
}
