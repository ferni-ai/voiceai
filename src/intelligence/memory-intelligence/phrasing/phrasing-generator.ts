/**
 * Phrasing Generator
 *
 * Generates natural language for referencing memories.
 * Adapts to persona voice, trust level, and emotional context.
 *
 * @module intelligence/memory-intelligence/phrasing/phrasing-generator
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PhrasingStyle,
  PersonaId,
  TrustLevel,
  PhrasingResult,
  PhrasingTemplate,
  EmotionalState,
} from '../types.js';
import type { StoredMemory, MemoryType } from '../../../memory/unified-store/types.js';
import { findMatchingTemplates, selectRandomTemplate, PHRASING_TEMPLATES } from './templates.js';
import { getPersonaVoice, getBestStyleForPersona, getOpeningPhrase, type PersonaVoice } from './persona-voice.js';

const log = createLogger({ module: 'PhrasingGenerator' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PhrasingGeneratorConfig {
  /** Maximum phrase length (characters) */
  maxPhraseLength: number;

  /** Whether to include persona-specific vocabulary hints */
  usePersonaVocabulary: boolean;

  /** Whether to generate alternatives */
  generateAlternatives: boolean;

  /** Number of alternatives to generate */
  alternativeCount: number;
}

const DEFAULT_CONFIG: PhrasingGeneratorConfig = {
  maxPhraseLength: 200,
  usePersonaVocabulary: true,
  generateAlternatives: true,
  alternativeCount: 2,
};

// ============================================================================
// PHRASING GENERATOR
// ============================================================================

/**
 * Phrasing Generator
 *
 * Generates natural, persona-appropriate phrases for memory references.
 */
export class PhrasingGenerator {
  private config: PhrasingGeneratorConfig;
  private initialized = false;

  constructor(config: Partial<PhrasingGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    log.debug('PhrasingGenerator initialized');
  }

  /**
   * Generate natural phrasing for a memory reference
   */
  async generate(
    memory: StoredMemory,
    context: {
      persona: PersonaId;
      trustLevel: TrustLevel;
      emotionalState?: EmotionalState;
      preferredStyle?: PhrasingStyle;
    }
  ): Promise<PhrasingResult> {
    const startTime = Date.now();

    try {
      const voice = getPersonaVoice(context.persona);

      // Determine emotional context
      const emotionalContext = this.categorizeEmotional(context.emotionalState);

      // Determine style
      const style =
        context.preferredStyle ||
        getBestStyleForPersona(context.persona, {
          emotional: emotionalContext,
          trustLevel: context.trustLevel,
        });

      // Find matching templates
      const templates = findMatchingTemplates({
        style,
        persona: context.persona,
        memoryType: memory.type as MemoryType,
        trustLevel: context.trustLevel,
        emotionalContext,
      });

      // If no templates found, fall back to general
      let template: PhrasingTemplate | null = selectRandomTemplate(templates);
      if (!template) {
        template = selectRandomTemplate(
          findMatchingTemplates({ style, persona: context.persona })
        );
      }

      // If still no template, use default
      if (!template) {
        template = PHRASING_TEMPLATES.find((t) => t.id === 'warm_recall_general') || PHRASING_TEMPLATES[0];
      }

      // Fill in template
      const phrase = this.fillTemplate(template, memory, voice);

      // Generate alternatives if configured
      const alternatives = this.config.generateAlternatives
        ? await this.generateAlternatives(memory, context, style, template.id)
        : undefined;

      // Calculate confidence based on template match quality
      const confidence = this.calculateConfidence(template, memory, context);

      const duration = Date.now() - startTime;
      log.debug({ style, templateId: template.id, duration }, 'Phrasing generated');

      return {
        phrase,
        style,
        templateId: template.id,
        confidence,
        alternatives,
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Error generating phrasing');

      // Fallback to simple phrasing
      return {
        phrase: `I remember you mentioned ${this.summarizeContent(memory.content)}`,
        style: 'warm_recall',
        templateId: 'fallback',
        confidence: 0.3,
      };
    }
  }

  /**
   * Fill a template with memory content
   */
  private fillTemplate(template: PhrasingTemplate, memory: StoredMemory, voice: PersonaVoice): string {
    let phrase = template.template;

    // Extract key content from memory
    const contentSummary = this.summarizeContent(memory.content);
    const topic = memory.topics[0] || this.extractTopic(memory.content);
    const person = memory.peopleMentioned[0] || '';

    // Replace placeholders
    phrase = phrase.replace('{{content}}', contentSummary);
    phrase = phrase.replace('{{topic}}', topic);
    phrase = phrase.replace('{{person}}', person);
    phrase = phrase.replace('{{commitment}}', contentSummary);
    phrase = phrase.replace('{{context}}', contentSummary);
    phrase = phrase.replace('{{pattern}}', contentSummary);
    phrase = phrase.replace('{{past_success}}', contentSummary);
    phrase = phrase.replace('{{past_moment}}', contentSummary);
    phrase = phrase.replace('{{past_situation}}', contentSummary);
    phrase = phrase.replace('{{strength}}', 'strength');
    phrase = phrase.replace('{{past_state}}', 'where you started');
    phrase = phrase.replace('{{goal}}', contentSummary);
    phrase = phrase.replace('{{past_win}}', contentSummary);
    phrase = phrase.replace('{{observation1}}', contentSummary);
    phrase = phrase.replace('{{observation2}}', 'similar patterns');
    phrase = phrase.replace('{{analysis}}', contentSummary);
    phrase = phrase.replace('{{condition}}', contentSummary);
    phrase = phrase.replace('{{outcome}}', 'feel better');
    phrase = phrase.replace('{{fact}}', contentSummary);
    phrase = phrase.replace('{{past_topic}}', topic);

    // Ensure phrase doesn't exceed max length
    if (phrase.length > this.config.maxPhraseLength) {
      phrase = phrase.slice(0, this.config.maxPhraseLength - 3) + '...';
    }

    return phrase;
  }

  /**
   * Summarize memory content to key points
   */
  private summarizeContent(content: string): string {
    // Take first sentence or up to 80 characters
    const firstSentence = content.split(/[.!?]/)[0];
    if (firstSentence.length <= 80) {
      return firstSentence.toLowerCase();
    }

    // Truncate at word boundary
    const truncated = firstSentence.slice(0, 80);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 40) {
      return truncated.slice(0, lastSpace).toLowerCase() + '...';
    }

    return truncated.toLowerCase() + '...';
  }

  /**
   * Extract main topic from content
   */
  private extractTopic(content: string): string {
    // Simple extraction - first noun-like word after common patterns
    const patterns = [
      /about (\w+)/i,
      /regarding (\w+)/i,
      /with (\w+)/i,
      /your (\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fallback: first significant word
    const words = content.split(/\s+/).filter((w) => w.length > 4);
    return words[0]?.toLowerCase() || 'that';
  }

  /**
   * Categorize emotional state
   */
  private categorizeEmotional(state?: EmotionalState): 'positive' | 'challenging' | 'neutral' {
    if (!state) return 'neutral';

    if (state.valence > 0.3 && state.intensity < 0.7) {
      return 'positive';
    }
    if (state.valence < -0.3 || state.isVulnerable || state.intensity > 0.7) {
      return 'challenging';
    }
    return 'neutral';
  }

  /**
   * Generate alternative phrasings
   */
  private async generateAlternatives(
    memory: StoredMemory,
    context: { persona: PersonaId; trustLevel: TrustLevel },
    currentStyle: PhrasingStyle,
    excludeTemplateId: string
  ): Promise<string[]> {
    const alternatives: string[] = [];
    const voice = getPersonaVoice(context.persona);

    // Get templates for same style but different template
    const sameStyleTemplates = findMatchingTemplates({
      style: currentStyle,
      persona: context.persona,
      trustLevel: context.trustLevel,
    }).filter((t) => t.id !== excludeTemplateId);

    // Also try different styles from persona's preferences
    const otherStyles = voice.preferredStyles.filter((s) => s !== currentStyle).slice(0, 2);

    for (const style of [currentStyle, ...otherStyles]) {
      if (alternatives.length >= this.config.alternativeCount) break;

      const templates = style === currentStyle
        ? sameStyleTemplates
        : findMatchingTemplates({ style, persona: context.persona, trustLevel: context.trustLevel });

      const template = selectRandomTemplate(templates);
      if (template && template.id !== excludeTemplateId) {
        const phrase = this.fillTemplate(template, memory, voice);
        if (!alternatives.includes(phrase)) {
          alternatives.push(phrase);
        }
      }
    }

    return alternatives;
  }

  /**
   * Calculate confidence in the phrasing
   */
  private calculateConfidence(
    template: PhrasingTemplate,
    memory: StoredMemory,
    context: { persona: PersonaId; trustLevel: TrustLevel }
  ): number {
    let confidence = 0.7; // Base confidence

    // Boost if template matches persona
    if (template.personas.includes(context.persona)) {
      confidence += 0.15;
    }

    // Boost if template matches trust level
    if (template.useWhen.trustLevels?.includes(context.trustLevel)) {
      confidence += 0.1;
    }

    // Boost if template matches memory type
    if (template.useWhen.memoryTypes?.includes(memory.type as MemoryType)) {
      confidence += 0.1;
    }

    // Reduce if content is very short or long
    if (memory.content.length < 20 || memory.content.length > 500) {
      confidence -= 0.1;
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let generatorInstance: PhrasingGenerator | null = null;

export function getPhrasingGenerator(config?: Partial<PhrasingGeneratorConfig>): PhrasingGenerator {
  if (!generatorInstance) {
    generatorInstance = new PhrasingGenerator(config);
  }
  return generatorInstance;
}

export function resetPhrasingGenerator(): void {
  generatorInstance = null;
}
