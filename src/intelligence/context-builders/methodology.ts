/**
 * Methodology Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Injects evidence-based coaching frameworks from methodology.json into the LLM context.
 * This enables agents to ground their responses in research-backed approaches while
 * maintaining their unique personality and voice.
 *
 * Features:
 * - Topic-aware injection (only surfaces methodology when relevant)
 * - Research framework surfacing with proper attribution
 * - Intervention technique suggestions
 * - Coaching principle reminders
 *
 * @module MethodologyContextBuilder
 */

import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { loadBundleById } from '../../personas/bundles/loader.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:methodology' });

// ============================================================================
// TOPIC MATCHING
// ============================================================================

/**
 * Keywords that trigger methodology injection for each domain
 * Maps conversation topics to methodology domains
 */
const TOPIC_TRIGGERS: Record<string, string[]> = {
  // Habits & Behavior Change (Maya Santos)
  habits: ['habit', 'routine', 'consistency', 'daily practice', 'building', 'breaking', 'change'],
  behavior_change: ['motivation', 'willpower', 'discipline', 'stick to', 'keep up with', 'fall off'],
  atomic_habits: ['small steps', 'tiny', '1%', 'compound', 'stack', 'cue', 'reward'],

  // Communication (Alex Chen)
  communication: ['conversation', 'talk to', 'tell them', 'say to', 'communicate'],
  conflict: ['conflict', 'argument', 'disagree', 'fight', 'confrontation'],
  boundaries: ['boundary', 'boundaries', 'limit', 'say no', 'push back'],
  assertiveness: ['assertive', 'speak up', 'voice', 'stand up for'],

  // Life Meaning & Grief (Ferni)
  meaning: ['meaning', 'purpose', 'why', 'point of', 'worth it'],
  grief: ['grief', 'loss', 'lost', 'death', 'died', 'mourning', 'passed away'],
  transition: ['change', 'transition', 'moving on', 'letting go', 'new chapter'],

  // Investing (Peter John)
  investing: ['invest', 'stock', 'market', 'portfolio', 'return'],
  financial: ['money', 'finance', 'wealth', 'savings', 'retire'],
  bias: ['bias', 'emotional', 'fear', 'greed', 'panic', 'fomo'],

  // Life Planning (Jordan Taylor)
  planning: ['plan', 'goal', 'milestone', 'future', 'vision'],
  life_stage: ['career', 'retire', 'empty nest', 'midlife', 'starting over'],
  decision: ['decision', 'choose', 'deciding', 'crossroads', 'what should I'],

  // Wisdom & Philosophy (Nayan Patel)
  wisdom: ['wisdom', 'philosophy', 'meaning of life', 'big picture'],
  patience: ['patience', 'wait', 'rushing', 'slow down', 'time'],
  simplicity: ['simplify', 'simple', 'complicated', 'overwhelmed', 'too much'],
};

/**
 * Check if user text matches any methodology trigger topics
 */
function detectMethodologyTriggers(userText: string, topics: string[]): string[] {
  const triggers: string[] = [];
  const lowerText = userText.toLowerCase();
  const lowerTopics = topics.map((t) => t.toLowerCase());

  for (const [domain, keywords] of Object.entries(TOPIC_TRIGGERS)) {
    const matched = keywords.some(
      (keyword) => lowerText.includes(keyword) || lowerTopics.some((t) => t.includes(keyword))
    );
    if (matched) {
      triggers.push(domain);
    }
  }

  return triggers;
}

// ============================================================================
// METHODOLOGY FORMATTING
// ============================================================================

interface MethodologyContent {
  schema_version?: number;
  behavior_type?: string;
  persona_id?: string;
  description?: string;
  research_foundations?: {
    primary_model?: {
      name?: string;
      source?: string;
      citation?: string;
      core_insight?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  specialized_concepts?: Record<string, unknown>;
  intervention_techniques?: Record<string, unknown>;
  coaching_principles?: Record<string, string>;
}

/**
 * Format methodology content for LLM injection
 */
function formatMethodologyInjection(
  methodology: MethodologyContent,
  triggers: string[]
): string {
  const parts: string[] = [];

  // Add research foundation if available
  if (methodology.research_foundations?.primary_model) {
    const model = methodology.research_foundations.primary_model;
    parts.push(`[EVIDENCE-BASED APPROACH]`);
    parts.push(`Your methodology is grounded in ${model.name || 'research-backed frameworks'}.`);
    if (model.source) {
      parts.push(`Source: ${model.source}${model.citation ? ` (${model.citation})` : ''}`);
    }
    if (model.core_insight) {
      parts.push(`Core insight: "${model.core_insight}"`);
    }
  }

  // Add relevant coaching principles
  if (methodology.coaching_principles) {
    const principles = Object.entries(methodology.coaching_principles)
      .slice(0, 3)
      .map(([key, value]) => `• ${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n');

    if (principles) {
      parts.push(`\n[COACHING PRINCIPLES]`);
      parts.push(principles);
    }
  }

  // Add guidance on using methodology
  parts.push(`\n[GUIDANCE]`);
  parts.push(`Apply these frameworks naturally in your voice. Don't lecture or cite sources directly.`);
  parts.push(`Let the methodology inform your questions and reflections, not your vocabulary.`);

  return parts.join('\n');
}

/**
 * Format a specific intervention technique
 */
function formatInterventionTechnique(
  techniqueName: string,
  technique: Record<string, unknown>
): string {
  const parts: string[] = [];

  parts.push(`[INTERVENTION: ${techniqueName.replace(/_/g, ' ').toUpperCase()}]`);

  if (technique.description) {
    parts.push(`${technique.description}`);
  }

  if (technique.process && Array.isArray(technique.process)) {
    parts.push(`Steps: ${technique.process.slice(0, 3).join(' → ')}`);
  }

  if (technique.coaching_phrase) {
    parts.push(`Consider: "${technique.coaching_phrase}"`);
  }

  return parts.join('\n');
}

// ============================================================================
// METHODOLOGY CONTEXT BUILDER
// ============================================================================

registerContextBuilder({
  name: 'methodology',
  description: 'Evidence-based coaching frameworks from methodology.json',
  priority: 55, // Mid-priority - after core context, before polish

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const { userText, analysis, persona } = input;
    const injections: ContextInjection[] = [];

    try {
      // Load persona bundle
      const bundle = await loadBundleById(persona.id);
      if (!bundle) {
        log.debug({ personaId: persona.id }, 'No bundle found for persona');
        return injections;
      }

      // Get behaviors including methodology
      const behaviors = await bundle.getBehaviors();
      const methodology = behaviors.methodology as MethodologyContent | undefined;

      if (!methodology) {
        log.debug({ personaId: persona.id }, 'No methodology found in bundle');
        return injections;
      }

      // Check if conversation triggers methodology injection
      const detectedTopics = analysis.topics.detected || [];
      const triggers = detectMethodologyTriggers(userText, detectedTopics);

      if (triggers.length === 0) {
        // No triggers - don't inject methodology (avoid prompt bloat)
        return injections;
      }

      log.debug(
        { personaId: persona.id, triggers, topics: detectedTopics },
        'Methodology triggers detected'
      );

      // Inject main methodology context
      const methodologyContext = formatMethodologyInjection(methodology, triggers);
      injections.push(
        createStandardInjection('methodology', methodologyContext, {
          category: 'methodology',
          confidence: 0.8,
        })
      );

      // Check for specific intervention opportunities
      if (methodology.intervention_techniques) {
        // Match triggers to intervention techniques
        const techniques = methodology.intervention_techniques as Record<
          string,
          Record<string, unknown>
        >;

        for (const [techniqueName, technique] of Object.entries(techniques)) {
          // Check if any trigger matches this technique
          const techniqueKeywords = techniqueName.toLowerCase().split('_');
          const isRelevant = triggers.some((trigger) =>
            techniqueKeywords.some(
              (keyword) => trigger.includes(keyword) || keyword.includes(trigger)
            )
          );

          if (isRelevant) {
            const techniqueInjection = formatInterventionTechnique(techniqueName, technique);
            injections.push(
              createHintInjection('intervention', techniqueInjection, {
                category: 'intervention_technique',
                confidence: 0.6,
              })
            );
            break; // Only inject one technique per turn to avoid overload
          }
        }
      }
    } catch (error) {
      // Non-fatal - methodology is enhancement, not core
      log.warn({ error: String(error), personaId: persona.id }, 'Error loading methodology');
    }

    return injections;
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {};
