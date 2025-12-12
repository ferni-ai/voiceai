/**
 * Methodology Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Injects evidence-based coaching frameworks from methodology.json AND
 * world-class-coaching.json into the LLM context. This enables agents to
 * ground their responses in research-backed approaches from:
 *
 * Elite Coaches: Brené Brown, Tony Robbins, Esther Perel, Simon Sinek, BJ Fogg, Mel Robbins
 * Psychology Frameworks: ACT, Motivational Interviewing, Positive Psychology, SDT
 * Professional Standards: ICF Core Competencies, GROW Model
 *
 * Features:
 * - Topic-aware injection (only surfaces methodology when relevant)
 * - Research framework surfacing with proper attribution
 * - Intervention technique suggestions from elite coaches
 * - Coaching principle reminders
 * - "When to use what" situational matching
 *
 * @module MethodologyContextBuilder
 */

import { loadBundleById } from '../../personas/bundles/loader.js';
import { createLogger } from '../../utils/safe-logger.js';
import { BuilderCategory } from './categories.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'context:methodology' });

// ============================================================================
// METHODOLOGY CACHE
// ============================================================================

/**
 * Cache methodology content per persona to avoid repeated bundle loads.
 * This significantly improves performance for repeated calls.
 */
const methodologyCache = new Map<string, MethodologyContent | null>();
const worldClassCoachingCache = new Map<string, WorldClassCoachingContent | null>();
const cacheLoadTimes = new Map<string, number>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get methodology with caching
 */
async function getCachedMethodology(personaId: string): Promise<MethodologyContent | null> {
  const now = Date.now();
  const lastLoad = cacheLoadTimes.get(personaId);

  // Return cached if valid
  if (methodologyCache.has(personaId) && lastLoad && now - lastLoad < CACHE_TTL_MS) {
    return methodologyCache.get(personaId) ?? null;
  }

  // Load and cache
  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      methodologyCache.set(personaId, null);
      cacheLoadTimes.set(personaId, now);
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    const methodology = (behaviors.methodology as MethodologyContent) ?? null;

    methodologyCache.set(personaId, methodology);
    cacheLoadTimes.set(personaId, now);

    return methodology;
  } catch (error) {
    log.warn({ error: String(error), personaId }, 'Error loading methodology');
    methodologyCache.set(personaId, null);
    cacheLoadTimes.set(personaId, now);
    return null;
  }
}

/**
 * Get world-class coaching content with caching
 */
async function getCachedWorldClassCoaching(
  personaId: string
): Promise<WorldClassCoachingContent | null> {
  const cacheKey = `wcc:${personaId}`;
  const now = Date.now();
  const lastLoad = cacheLoadTimes.get(cacheKey);

  // Return cached if valid
  if (worldClassCoachingCache.has(personaId) && lastLoad && now - lastLoad < CACHE_TTL_MS) {
    return worldClassCoachingCache.get(personaId) ?? null;
  }

  // Load and cache
  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      worldClassCoachingCache.set(personaId, null);
      cacheLoadTimes.set(cacheKey, now);
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    const worldClassCoaching = (behaviors.world_class_coaching as WorldClassCoachingContent) ?? null;

    worldClassCoachingCache.set(personaId, worldClassCoaching);
    cacheLoadTimes.set(cacheKey, now);

    return worldClassCoaching;
  } catch (error) {
    log.warn({ error: String(error), personaId }, 'Error loading world-class coaching');
    worldClassCoachingCache.set(personaId, null);
    cacheLoadTimes.set(cacheKey, now);
    return null;
  }
}

/**
 * Clear methodology cache (useful for testing)
 */
export function clearMethodologyCache(): void {
  methodologyCache.clear();
  worldClassCoachingCache.clear();
  cacheLoadTimes.clear();
}

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
  behavior_change: [
    'motivation',
    'willpower',
    'discipline',
    'stick to',
    'keep up with',
    'fall off',
  ],
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

  // ============================================================================
  // MARKETPLACE PERSONAS
  // ============================================================================

  // Career Navigation (Atlas)
  career: ['career', 'job', 'promotion', 'interview', 'resume', 'networking'],
  negotiation: ['negotiate', 'salary', 'offer', 'raise', 'compensation'],
  job_search: ['job search', 'applying', 'hired', 'recruiter', 'linkedin'],

  // Sleep & Rest (Luna)
  sleep: ['sleep', 'insomnia', 'tired', 'rest', 'bedtime', 'wake up'],
  relaxation: ['relax', 'wind down', 'calm', 'peaceful', 'restless'],
  racing_thoughts: ['racing thoughts', "can't sleep", 'mind racing', 'anxious at night'],

  // Accountability (Moxie)
  accountability: ['accountable', 'follow through', 'commitment', 'promise', 'show up'],
  excuses: ['excuse', 'procrastinate', 'putting off', 'later', 'tomorrow'],
  streaks: ['streak', 'consecutive', 'miss', 'skipped', 'got back on'],

  // Tech Translation (Pixel)
  technology: ['tech', 'computer', 'phone', 'app', 'software', 'device'],
  troubleshooting: ['not working', 'broken', 'error', 'fix', 'help with'],
  digital_literacy: ['how does', 'what is', 'explain', 'confused about'],

  // Grief Companion (River)
  bereavement: ['grieving', 'bereaved', 'funeral', 'memorial', 'anniversary'],
  loss_types: ['lost my', 'passed', 'gone', 'miss them', 'without them'],
  grief_waves: ['wave of grief', 'hit me', 'out of nowhere', 'triggered'],

  // Relationship Navigation (Sage)
  relationships: ['relationship', 'partner', 'spouse', 'dating', 'marriage'],
  attachment: ['attached', 'clingy', 'avoidant', 'secure', 'anxious'],
  family_dynamics: ['family', 'parents', 'siblings', 'in-laws', 'kids'],

  // Creativity (Spark)
  creativity: ['creative', 'idea', 'brainstorm', 'stuck', 'block'],
  artistic: ['write', 'paint', 'draw', 'make', 'create', 'art'],
  inspiration: ['inspired', 'muse', 'flow', 'imagination', 'play'],

  // Mindfulness & Presence (Zen)
  mindfulness: ['mindful', 'present', 'aware', 'attention', 'focus'],
  meditation: ['meditate', 'breathe', 'center', 'ground', 'stillness'],
  overwhelm: ['overwhelmed', 'anxious', 'stressed', 'scattered', 'racing'],
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
function formatMethodologyInjection(methodology: MethodologyContent, triggers: string[]): string {
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
  parts.push(
    `Apply these frameworks naturally in your voice. Don't lecture or cite sources directly.`
  );
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
  category: BuilderCategory.COACHING,

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const { userText, analysis, persona } = input;
    const injections: ContextInjection[] = [];

    // Check if conversation triggers methodology injection FIRST (fast path)
    const detectedTopics = analysis.topics.detected || [];
    const triggers = detectMethodologyTriggers(userText, detectedTopics);

    if (triggers.length === 0) {
      // No triggers - don't load methodology (avoid unnecessary work)
      return injections;
    }

    // Only load methodology if we have triggers (optimized)
    const methodology = await getCachedMethodology(persona.id);
    if (!methodology) {
      log.debug({ personaId: persona.id }, 'No methodology found for persona');
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

    return injections;
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {};
