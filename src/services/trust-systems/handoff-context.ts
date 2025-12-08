/**
 * Team Handoff Context
 *
 * Passes trust context when handing off to other team members.
 * Maya should know about boundaries. Peter should know what topics are sensitive.
 *
 * Philosophy: When you introduce a friend to another friend, you might whisper
 * "hey, don't mention their ex" - this system does that automatically.
 *
 * @module HandoffContext
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getActiveBoundaries, getProbingDepth, type Boundary } from './boundary-memory.js';

import { getAvoidedTopics } from './reading-between-lines.js';

import {
  getGrowthPatterns,
  getUnreflectedGrowth,
  type GrowthPattern,
} from './growth-reflection.js';

import { getSharedMoments, getCallbackTraits, type SharedMoment } from './inside-jokes.js';

import {
  getPendingIntentions,
  getUncelebratedWins,
  type PendingIntention,
  type SmallWin,
} from './small-wins.js';

const log = createLogger({ module: 'HandoffContext' });

// ============================================================================
// TYPES
// ============================================================================

export interface HandoffTrustContext {
  userId: string;

  /** Persona receiving the handoff */
  targetPersonaId: string;

  /** Persona handing off */
  sourcePersonaId: string;

  /** Critical warnings - things to definitely avoid */
  criticalWarnings: Array<{
    type: 'boundary' | 'sensitive_topic' | 'recent_distress';
    topic: string;
    reason: string;
  }>;

  /** Things to be careful about */
  sensitiveAreas: Array<{
    topic: string;
    approach: string;
  }>;

  /** Helpful context for building rapport */
  rapportBuilders: Array<{
    type: 'shared_moment' | 'callback' | 'win' | 'growth';
    content: string;
    suggestion: string;
  }>;

  /** User's communication preferences */
  communicationStyle: {
    probingDepth: 'high' | 'medium' | 'low';
    celebrationStyle: 'enthusiastic' | 'understated' | 'reflective';
    preferredPace: 'quick' | 'thoughtful' | 'varies';
  };

  /** Pending things to follow up on */
  pendingFollowUps: Array<{
    type: 'intention' | 'win' | 'growth';
    description: string;
    whenStated?: Date;
  }>;

  /** Summary for LLM context injection */
  contextSummary: string;
}

export interface PersonaSpecificContext {
  /** What this persona should know */
  relevant: string[];

  /** What this persona probably doesn't need */
  irrelevant: string[];

  /** Special instructions for this persona */
  instructions: string[];
}

// ============================================================================
// PERSONA RELEVANCE MAPPING
// ============================================================================

/**
 * What topics are relevant to each persona
 */
const PERSONA_DOMAINS: Record<string, string[]> = {
  ferni: ['life', 'coaching', 'growth', 'relationships', 'decisions', 'emotions'],
  jack: ['wisdom', 'perspective', 'life lessons', 'big picture', 'legacy'],
  peter: ['research', 'analysis', 'planning', 'information', 'learning'],
  alex: ['communication', 'writing', 'messages', 'social', 'expression'],
  maya: ['habits', 'routines', 'wellness', 'consistency', 'health'],
  jordan: ['events', 'planning', 'logistics', 'celebrations', 'organizing'],
  nayan: ['deep work', 'strategy', 'long-term', 'complex problems'],
};

/**
 * Special handling instructions per persona
 */
const PERSONA_INSTRUCTIONS: Record<string, string[]> = {
  ferni: [
    'Primary coach - has full context',
    'Can address any topic',
    'Default for emotional support',
  ],
  jack: [
    'Elder wisdom perspective',
    'Good for existential questions',
    'Avoid rushing - let him take his time',
  ],
  peter: [
    'Analytical mindset',
    'Good for research tasks',
    'May not be best for purely emotional support',
  ],
  alex: [
    'Communication specialist',
    'Good for drafting messages',
    'Can help with difficult conversations',
  ],
  maya: [
    'Habits and routines expert',
    'Encouraging and consistent',
    'Good for accountability check-ins',
  ],
  jordan: [
    'Event planning specialist',
    'High energy, organized',
    'Good for logistics and coordination',
  ],
  nayan: ['Premium tier only', 'Deep strategic thinking', 'For complex, long-term challenges'],
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build handoff context for a specific persona
 */
export function buildHandoffContext(
  userId: string,
  sourcePersonaId: string,
  targetPersonaId: string
): HandoffTrustContext {
  const criticalWarnings: HandoffTrustContext['criticalWarnings'] = [];
  const sensitiveAreas: HandoffTrustContext['sensitiveAreas'] = [];
  const rapportBuilders: HandoffTrustContext['rapportBuilders'] = [];
  const pendingFollowUps: HandoffTrustContext['pendingFollowUps'] = [];

  // 1. Get boundaries
  const boundaries = getActiveBoundaries(userId);
  for (const boundary of boundaries) {
    if (boundary.strength === 'absolute') {
      criticalWarnings.push({
        type: 'boundary',
        topic: boundary.topic,
        reason: `User explicitly said not to discuss "${boundary.topic}"`,
      });
    } else if (boundary.strength === 'strong') {
      sensitiveAreas.push({
        topic: boundary.topic,
        approach: `Be careful with "${boundary.topic}" - caused distress before`,
      });
    }
  }

  // 2. Get avoided topics
  const avoidedTopics = getAvoidedTopics(userId);
  for (const topic of avoidedTopics) {
    if (!criticalWarnings.some((w) => w.topic === topic)) {
      sensitiveAreas.push({
        topic,
        approach: `User tends to avoid discussing "${topic}"`,
      });
    }
  }

  // 3. Get shared moments for rapport (filtered by persona relevance)
  const targetDomains = PERSONA_DOMAINS[targetPersonaId] || PERSONA_DOMAINS.ferni;
  const moments = getSharedMoments(userId);
  const relevantMoments = moments.filter((m) =>
    m.triggers.some((t) => targetDomains.some((d) => t.includes(d) || d.includes(t)))
  );

  for (const moment of relevantMoments.slice(0, 3)) {
    rapportBuilders.push({
      type: 'shared_moment',
      content: moment.content.slice(0, 100),
      suggestion: `Can reference: "${moment.content.slice(0, 50)}..."`,
    });
  }

  // 4. Get callback traits
  const traits = getCallbackTraits(userId);
  for (const trait of traits.slice(0, 2)) {
    rapportBuilders.push({
      type: 'callback',
      content: trait,
      suggestion: `Known trait: ${trait}`,
    });
  }

  // 5. Get unreflected growth
  const growth = getUnreflectedGrowth(userId);
  for (const pattern of growth.slice(0, 1)) {
    rapportBuilders.push({
      type: 'growth',
      content: pattern.after.pattern,
      suggestion: `Consider reflecting: ${pattern.type} - they've shown growth here`,
    });
    pendingFollowUps.push({
      type: 'growth',
      description: `Unreflected growth: ${pattern.type}`,
    });
  }

  // 6. Get uncelebrated wins
  const wins = getUncelebratedWins(userId);
  for (const win of wins.slice(0, 2)) {
    rapportBuilders.push({
      type: 'win',
      content: win.description.slice(0, 100),
      suggestion: `Uncelebrated: ${win.type} - "${win.description.slice(0, 50)}..."`,
    });
    pendingFollowUps.push({
      type: 'win',
      description: win.description,
    });
  }

  // 7. Get pending intentions
  const intentions = getPendingIntentions(userId);
  for (const intention of intentions.slice(0, 3)) {
    pendingFollowUps.push({
      type: 'intention',
      description: intention.intention,
      whenStated: intention.statedAt,
    });
  }

  // 8. Get communication style
  const probingDepth = getProbingDepth(userId);

  // Build context summary
  const contextSummary = buildContextSummary(
    targetPersonaId,
    criticalWarnings,
    sensitiveAreas,
    rapportBuilders,
    pendingFollowUps,
    probingDepth
  );

  log.info(
    {
      userId,
      sourcePersonaId,
      targetPersonaId,
      warnings: criticalWarnings.length,
      sensitive: sensitiveAreas.length,
      rapport: rapportBuilders.length,
    },
    '🤝 Handoff context built'
  );

  return {
    userId,
    targetPersonaId,
    sourcePersonaId,
    criticalWarnings,
    sensitiveAreas,
    rapportBuilders,
    communicationStyle: {
      probingDepth,
      celebrationStyle: 'understated', // Default, could be learned
      preferredPace: 'thoughtful',
    },
    pendingFollowUps,
    contextSummary,
  };
}

/**
 * Build a summary suitable for LLM context injection
 */
function buildContextSummary(
  targetPersonaId: string,
  criticalWarnings: HandoffTrustContext['criticalWarnings'],
  sensitiveAreas: HandoffTrustContext['sensitiveAreas'],
  rapportBuilders: HandoffTrustContext['rapportBuilders'],
  pendingFollowUps: HandoffTrustContext['pendingFollowUps'],
  probingDepth: 'high' | 'medium' | 'low'
): string {
  const lines: string[] = [];

  lines.push(`[🤝 HANDOFF CONTEXT FOR ${targetPersonaId.toUpperCase()}]`);
  lines.push('');

  // Critical warnings first
  if (criticalWarnings.length > 0) {
    lines.push('⛔ DO NOT MENTION:');
    for (const warning of criticalWarnings) {
      lines.push(`  • ${warning.topic} (${warning.reason})`);
    }
    lines.push('');
  }

  // Sensitive areas
  if (sensitiveAreas.length > 0) {
    lines.push('⚠️ BE CAREFUL WITH:');
    for (const area of sensitiveAreas) {
      lines.push(`  • ${area.topic}`);
    }
    lines.push('');
  }

  // Rapport builders
  if (rapportBuilders.length > 0) {
    lines.push('💡 RAPPORT OPPORTUNITIES:');
    for (const builder of rapportBuilders) {
      lines.push(`  • ${builder.suggestion}`);
    }
    lines.push('');
  }

  // Pending follow-ups
  if (pendingFollowUps.length > 0) {
    lines.push('📋 THINGS TO FOLLOW UP ON:');
    for (const followUp of pendingFollowUps) {
      lines.push(`  • ${followUp.type}: ${followUp.description.slice(0, 60)}`);
    }
    lines.push('');
  }

  // Communication style
  lines.push(`📊 COMMUNICATION STYLE:`);
  lines.push(`  • Probing depth: ${probingDepth}`);
  if (probingDepth === 'low') {
    lines.push(`  • Note: Keep questions light, don't push too deep`);
  }

  // Persona-specific instructions
  const instructions = PERSONA_INSTRUCTIONS[targetPersonaId];
  if (instructions) {
    lines.push('');
    lines.push('📌 YOUR ROLE:');
    for (const instruction of instructions) {
      lines.push(`  • ${instruction}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// INTEGRATION WITH HANDOFF SYSTEM
// ============================================================================

/**
 * Get minimal handoff warnings (for quick context)
 */
export function getHandoffWarnings(userId: string): string[] {
  const warnings: string[] = [];

  // Absolute boundaries
  const boundaries = getActiveBoundaries(userId);
  for (const boundary of boundaries.filter((b) => b.strength === 'absolute')) {
    warnings.push(`Don't mention: ${boundary.topic}`);
  }

  // Avoided topics
  const avoided = getAvoidedTopics(userId);
  for (const topic of avoided) {
    if (!warnings.some((w) => w.includes(topic))) {
      warnings.push(`Sensitive: ${topic}`);
    }
  }

  return warnings;
}

/**
 * Format handoff context for injection into LLM instructions
 */
export function formatHandoffForLLM(context: HandoffTrustContext): string {
  return context.contextSummary;
}

/**
 * Create a brief handoff note for the receiving persona
 */
export function createHandoffNote(context: HandoffTrustContext): string {
  const parts: string[] = [];

  parts.push(`Taking over from ${context.sourcePersonaId}.`);

  if (context.criticalWarnings.length > 0) {
    const topics = context.criticalWarnings.map((w) => w.topic).join(', ');
    parts.push(`Avoid: ${topics}.`);
  }

  if (context.pendingFollowUps.length > 0) {
    const first = context.pendingFollowUps[0];
    parts.push(`Might want to follow up on: ${first.description.slice(0, 50)}.`);
  }

  return parts.join(' ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildHandoffContext,
  getHandoffWarnings,
  formatHandoffForLLM,
  createHandoffNote,
};
