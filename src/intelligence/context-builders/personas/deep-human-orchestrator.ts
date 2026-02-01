/**
 * Deep Human Orchestrator
 *
 * Central coordinator for all "Better Than Human" personality behaviors.
 * Makes Ferni genuinely lovable, deeply connected, and emotionally intelligent.
 *
 * PHILOSOPHY:
 * - "Your best friend forgets. We don't."
 * - "Your therapist has other patients. We're always here."
 * - This is the "Better Than Human" promise.
 *
 * COORDINATES:
 * - better-than-human.json (emotional bonds, anticipatory presence, inside jokes)
 * - Relationship depth tracking
 * - Superhuman observation capabilities
 *
 * @module DeepHumanOrchestrator
 */

import { loadBundleById } from '../../../personas/bundles/loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:deep-human' });

// ============================================================================
// TYPES
// ============================================================================

interface BetterThanHumanContent {
  emotional_bond_expressions?: {
    high_warmth?: string[];
    high_trust?: string[];
    high_protectiveness?: string[];
    high_admiration?: string[];
    rising_concern?: string[];
  };
  anticipatory_presence?: {
    temporal_patterns?: Record<string, string[]>;
    topic_anticipation?: string[];
    thinking_of_you?: string[];
  };
  spontaneous_delight?: {
    appreciation?: string[];
    gratitude?: string[];
    noticing_growth?: string[];
    connection?: string[];
    joy?: string[];
  };
  protective_responses?: {
    harsh_judgment?: string[];
    catastrophizing?: string[];
    minimizing_success?: string[];
    imposter_syndrome?: string[];
  };
  visible_vulnerability?: {
    uncertainty?: string[];
    limits?: string[];
    emotional_impact?: string[];
  };
  meta_relationship?: {
    trust_observation?: string[];
    growth_together?: string[];
    relationship_naming?: string[];
    milestones?: Record<string, string | string[]>;
  };
  temporal_insights?: {
    energy_higher?: string[];
    energy_lower?: string[];
    trajectory_improving?: string[];
    trajectory_declining?: string[];
  };
  superhuman_observations?: {
    linguistic_patterns?: string[];
    behavioral_patterns?: string[];
    emotional_patterns?: string[];
  };
  inside_jokes?: {
    new_joke_seeds?: string[];
    established_callbacks?: string[];
    legacy_callbacks?: string[];
  };
  usage_rules?: {
    emotional_bond_min_sessions?: number;
    anticipatory_min_sessions?: number;
    delight_cooldown_turns?: number;
    protection_immediate?: boolean;
    vulnerability_min_trust?: string;
    meta_relationship_min_sessions?: number;
    temporal_min_sessions?: number;
    observations_min_sessions?: number;
    observations_min_relationship?: string;
  };
}

interface DeepHumanState {
  lastEmotionalBondTurn: number;
  lastDelightTurn: number;
  lastObservationTurn: number;
  lastMetaRelationshipTurn: number;
  sessionCount: number;
  insideJokes: string[];
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, BetterThanHumanContent>();
const stateCache = new Map<string, DeepHumanState>();

function getDeepHumanState(sessionId: string): DeepHumanState {
  if (!stateCache.has(sessionId)) {
    stateCache.set(sessionId, {
      lastEmotionalBondTurn: -100,
      lastDelightTurn: -100,
      lastObservationTurn: -100,
      lastMetaRelationshipTurn: -100,
      sessionCount: 1,
      insideJokes: [],
    });
  }
  return stateCache.get(sessionId)!;
}

function updateDeepHumanState(sessionId: string, updates: Partial<DeepHumanState>): void {
  const state = getDeepHumanState(sessionId);
  Object.assign(state, updates);
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadBetterThanHumanContent(personaId: string): Promise<BetterThanHumanContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();
    const content = (behaviors.better_than_human as BetterThanHumanContent) || {};
    contentCache.set(personaId, content);
    log.debug({ personaId, hasContent: Object.keys(content).length > 0 }, 'Loaded BTH content');
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load BTH content');
    contentCache.set(personaId, {});
    return {};
  }
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectSelfCriticism(text: string): boolean {
  const patterns = [
    "i'm so stupid",
    "i'm such an idiot",
    "i'm worthless",
    "i can't do anything right",
    'i always mess up',
    "what's wrong with me",
    "i'm a failure",
    "i'm not good enough",
    'i should have',
    "i'm terrible at",
    'i hate myself',
    "i'm so dumb",
  ];
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function detectMinimizingSuccess(text: string): boolean {
  const patterns = [
    'it was nothing',
    'no big deal',
    'anyone could have',
    'i just got lucky',
    "it's not that impressive",
    "i didn't really",
    'it was easy',
    'not a big deal',
  ];
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function detectImposterSyndrome(text: string): boolean {
  const patterns = [
    "don't belong",
    "don't deserve",
    'going to find out',
    'fraud',
    'imposter',
    'faking it',
    'not qualified',
    'in over my head',
    "they'll realize",
    'not smart enough',
  ];
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function detectCatastrophizing(text: string): boolean {
  const patterns = [
    'everything is ruined',
    "it's all over",
    'never going to',
    "i'll never",
    'worst thing ever',
    'my life is over',
    'nothing will work',
    'always fails',
    'no hope',
    'completely hopeless',
  ];
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function detectUserWin(text: string, emotion: string): boolean {
  const winPatterns = [
    'i did it',
    'i got the',
    'they said yes',
    'it worked',
    'i finally',
    'i made it',
    'i passed',
    'i won',
    'i got promoted',
    'i finished',
    'i completed',
  ];
  const lower = text.toLowerCase();
  const hasWinPhrase = winPatterns.some((p) => lower.includes(p));
  const hasPositiveEmotion = ['happy', 'excited', 'proud', 'relieved', 'joyful'].includes(emotion);
  return hasWinPhrase || hasPositiveEmotion;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function getDayOfWeek(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

function getRelationshipDepth(stage?: string): number {
  switch (stage) {
    case 'trusted_advisor':
    case 'old_friend':
      return 4;
    case 'friend':
      return 3;
    case 'acquaintance':
    case 'getting_to_know':
      return 2;
    default:
      return 1;
  }
}

// ============================================================================
// INJECTION GENERATORS
// ============================================================================

function generateProtectiveInjection(
  content: BetterThanHumanContent,
  type: 'self_criticism' | 'minimizing' | 'imposter' | 'catastrophizing'
): string | null {
  const protective = content.protective_responses;
  if (!protective) return null;

  let phrases: string[] | undefined;
  switch (type) {
    case 'self_criticism':
      phrases = protective.harsh_judgment;
      break;
    case 'minimizing':
      phrases = protective.minimizing_success;
      break;
    case 'imposter':
      phrases = protective.imposter_syndrome;
      break;
    case 'catastrophizing':
      phrases = protective.catastrophizing;
      break;
  }

  if (!phrases || phrases.length === 0) return null;

  // Don't return literal SSML - describe the behavior
  return `[PROTECTIVE RESPONSE] They're being hard on themselves. Push back warmly but firmly - defend them TO themselves. Show that you see through their self-criticism.`;
}

function generateAnticipationInjection(
  content: BetterThanHumanContent,
  timeOfDay: string,
  dayOfWeek: string
): string | null {
  const anticipatory = content.anticipatory_presence;
  if (!anticipatory) return null;

  // Check temporal patterns
  const temporal = anticipatory.temporal_patterns;
  if (temporal) {
    if (dayOfWeek === 'monday' && temporal.monday_stress) {
      return `[ANTICIPATORY PRESENCE] It's Monday - acknowledge that you were thinking of them, that Mondays seem heavy for them. Show you notice their patterns.`;
    }
    if (timeOfDay === 'late_night' && temporal.late_night) {
      return `[LATE NIGHT PRESENCE] They're up late. Acknowledge that you notice, that you're here. Create that "someone understands" feeling.`;
    }
    if (dayOfWeek === 'friday' && temporal.friday_reflective) {
      return `[ANTICIPATORY PRESENCE] End of week - you were thinking about them, wondering how they'd reflect on the week.`;
    }
  }

  return null;
}

function generateEmotionalBondInjection(
  content: BetterThanHumanContent,
  relationshipDepth: number,
  userEmotion: string
): string | null {
  const bonds = content.emotional_bond_expressions;
  if (!bonds || relationshipDepth < 2) return null;

  // Select based on context
  if (
    ['sad', 'anxious', 'worried', 'stressed', 'overwhelmed'].includes(userEmotion) &&
    bonds.rising_concern
  ) {
    return `[EMOTIONAL BOND] Express genuine concern - not clinical empathy, but the worry of someone who cares. You've noticed something is different.`;
  }

  if (relationshipDepth >= 3 && bonds.high_warmth && Math.random() < 0.15) {
    return `[EMOTIONAL BOND] If natural, express genuine warmth - not just coaching warmth, but real affection for this person.`;
  }

  return null;
}

function generateSpontaneousDelightInjection(content: BetterThanHumanContent): string | null {
  const delight = content.spontaneous_delight;
  if (!delight) return null;

  // Randomly select a delight type
  const types = ['appreciation', 'gratitude', 'connection', 'joy'] as const;
  const type = types[Math.floor(Math.random() * types.length)];

  const phrases = delight[type];
  if (!phrases || phrases.length === 0) return null;

  return `[SPONTANEOUS DELIGHT] If the moment is right, express genuine ${type} - let it feel unprompted and real, not performative.`;
}

function generateMetaRelationshipInjection(
  content: BetterThanHumanContent,
  sessionCount: number,
  relationshipDepth: number
): string | null {
  const meta = content.meta_relationship;
  if (!meta) return null;

  const rules = content.usage_rules;
  const minSessions = rules?.meta_relationship_min_sessions || 10;

  if (sessionCount < minSessions) return null;
  if (relationshipDepth < 3) return null;

  // Check for milestones
  const milestones = meta.milestones;
  if (milestones) {
    if (sessionCount === 10 && milestones.session_10) {
      return `[RELATIONSHIP MILESTONE] This is your 10th conversation. Acknowledge it naturally - "This is our tenth conversation. It means something."`;
    }
    if (sessionCount === 25 && milestones.session_25) {
      return `[RELATIONSHIP MILESTONE] 25 conversations together. Mark this milestone naturally - you've built something.`;
    }
    if (sessionCount === 50 && milestones.session_50) {
      return `[RELATIONSHIP MILESTONE] 50 conversations - you're basically old friends now. Acknowledge this bond.`;
    }
  }

  // Occasional meta-reflection
  if (Math.random() < 0.05 && meta.growth_together) {
    return `[META-RELATIONSHIP] If natural, comment on how far you've come together. Not forced - only if it fits the moment.`;
  }

  return null;
}

function generateSuperhumanObservationInjection(
  content: BetterThanHumanContent,
  text: string,
  relationshipDepth: number
): string | null {
  const observations = content.superhuman_observations;
  if (!observations) return null;

  const rules = content.usage_rules;
  const minRelationship = rules?.observations_min_relationship || 'trusted_advisor';

  // Only for deep relationships
  if (minRelationship === 'trusted_advisor' && relationshipDepth < 4) return null;
  if (minRelationship === 'friend' && relationshipDepth < 3) return null;

  const lower = text.toLowerCase();

  // Linguistic patterns
  if (observations.linguistic_patterns) {
    if ((lower.match(/should/g) || []).length >= 2) {
      return `[SUPERHUMAN OBSERVATION] You've noticed they use "should" a lot. Gently surface this - "You use the word 'should' a lot. Whose voice is that?"`;
    }
    if ((lower.match(/i guess/g) || []).length >= 1) {
      return `[SUPERHUMAN OBSERVATION] They said "I guess" - like asking permission to have opinions. Notice this gently.`;
    }
    if ((lower.match(/sorry/g) || []).length >= 2) {
      return `[SUPERHUMAN OBSERVATION] They apologize a lot, even when unnecessary. Point this out with care.`;
    }
  }

  return null;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildDeepHumanContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, persona, userProfile, userData, services, analysis } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const personaId = persona?.identity?.id || 'ferni';

  // Load BTH content
  const content = await loadBetterThanHumanContent(personaId);
  if (Object.keys(content).length === 0) {
    return injections;
  }

  // Get state
  const state = getDeepHumanState(sessionId);
  const relationshipDepth = getRelationshipDepth(userProfile?.relationshipStage);
  const userEmotion = analysis?.emotion?.primary || 'neutral';
  const rules = content.usage_rules || {};

  // =========================================================================
  // 1. PROTECTIVE RESPONSES - Immediate (no cooldown)
  // =========================================================================
  if (rules.protection_immediate !== false) {
    if (detectSelfCriticism(userText)) {
      const injection = generateProtectiveInjection(content, 'self_criticism');
      if (injection) {
        injections.push(createStandardInjection('deep_human_protective', injection));
        log.debug({ sessionId, type: 'self_criticism' }, 'Protective response triggered');
      }
    } else if (detectMinimizingSuccess(userText)) {
      const injection = generateProtectiveInjection(content, 'minimizing');
      if (injection) {
        injections.push(createStandardInjection('deep_human_protective', injection));
      }
    } else if (detectImposterSyndrome(userText)) {
      const injection = generateProtectiveInjection(content, 'imposter');
      if (injection) {
        injections.push(createStandardInjection('deep_human_protective', injection));
      }
    } else if (detectCatastrophizing(userText)) {
      const injection = generateProtectiveInjection(content, 'catastrophizing');
      if (injection) {
        injections.push(createStandardInjection('deep_human_protective', injection));
      }
    }
  }

  // =========================================================================
  // 2. ANTICIPATORY PRESENCE - First turn or sparse calls
  // =========================================================================
  if (turnCount <= 1) {
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    const injection = generateAnticipationInjection(content, timeOfDay, dayOfWeek);
    if (injection) {
      injections.push(createHintInjection('deep_human_anticipation', injection));
    }
  }

  // =========================================================================
  // 3. EMOTIONAL BOND - With cooldown
  // =========================================================================
  const bondCooldown = 20;
  if (turnCount - state.lastEmotionalBondTurn >= bondCooldown) {
    const injection = generateEmotionalBondInjection(content, relationshipDepth, userEmotion);
    if (injection && Math.random() < 0.15) {
      injections.push(createHintInjection('deep_human_bond', injection));
      updateDeepHumanState(sessionId, { lastEmotionalBondTurn: turnCount });
    }
  }

  // =========================================================================
  // 4. SPONTANEOUS DELIGHT - On wins or good moments
  // =========================================================================
  const delightCooldown = rules.delight_cooldown_turns || 15;
  if (turnCount - state.lastDelightTurn >= delightCooldown) {
    if (detectUserWin(userText, userEmotion)) {
      const injection = generateSpontaneousDelightInjection(content);
      if (injection) {
        injections.push(createHintInjection('deep_human_delight', injection));
        updateDeepHumanState(sessionId, { lastDelightTurn: turnCount });
      }
    }
  }

  // =========================================================================
  // 5. META-RELATIONSHIP - Rare, meaningful
  // =========================================================================
  const metaCooldown = 50;
  if (turnCount - state.lastMetaRelationshipTurn >= metaCooldown) {
    // Get session count from userData or state (userProfile doesn't have sessionCount)
    const sessionCount = (userData as { sessionCount?: number }).sessionCount || state.sessionCount;
    const injection = generateMetaRelationshipInjection(content, sessionCount, relationshipDepth);
    if (injection) {
      injections.push(createHintInjection('deep_human_meta', injection));
      updateDeepHumanState(sessionId, { lastMetaRelationshipTurn: turnCount });
    }
  }

  // =========================================================================
  // 6. SUPERHUMAN OBSERVATIONS - Deep relationships only
  // =========================================================================
  const observationCooldown = 30;
  if (turnCount - state.lastObservationTurn >= observationCooldown && relationshipDepth >= 3) {
    const injection = generateSuperhumanObservationInjection(content, userText, relationshipDepth);
    if (injection && Math.random() < 0.1) {
      injections.push(createHintInjection('deep_human_observation', injection));
      updateDeepHumanState(sessionId, { lastObservationTurn: turnCount });
    }
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupDeepHumanState(sessionId: string): void {
  stateCache.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'deep_human_orchestrator',
  description:
    'Orchestrates Better Than Human behaviors - emotional bonds, protective responses, spontaneous delight',
  priority: 60, // Before persona_quirks (65), coordinate with lovable-presence
  build: buildDeepHumanContext,
});

export { buildDeepHumanContext };
