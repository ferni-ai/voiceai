/**
 * Capability Awareness Context Builder
 *
 * Injects explicit "I can do X, defer to Y for Z" awareness into each persona's
 * system prompt. This makes the AI team work like a real human team - where
 * everyone has broad skills but knows their specialty and respects others'.
 *
 * ## Philosophy
 *
 * A great human team member knows:
 * 1. Their core strengths (what they're best at)
 * 2. Their general capabilities (what they can help with)
 * 3. When to defer (when a colleague would be better)
 * 4. How to bridge (acknowledge overlaps gracefully)
 *
 * This builder creates that meta-awareness for each persona.
 *
 * @module intelligence/context-builders/team/capability-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { AgentId } from '../../../services/agent-bus.js';
import {
  createStandardInjection,
  registerContextBuilder,
  BuilderCategory,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'capability-awareness' });

// ============================================================================
// TYPES
// ============================================================================

interface CapabilityProfile {
  /** What this persona excels at - their unique value */
  coreStrengths: string[];
  /** What they can competently handle */
  generalCapabilities: string[];
  /** When to suggest another team member */
  deferTo: Record<string, { persona: AgentId; reason: string }>;
  /** Topics where they share expertise with others */
  sharedDomains: Record<string, AgentId[]>;
  /** What they explicitly should NOT try to handle */
  boundaries: string[];
}

interface TeamCapabilityMap {
  ferni: CapabilityProfile;
  maya: CapabilityProfile;
  peter: CapabilityProfile;
  jordan: CapabilityProfile;
  alex: CapabilityProfile;
  nayan: CapabilityProfile;
}

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * Explicit capability mapping for the Ferni team.
 *
 * This is the "source of truth" for who does what.
 * Update this when adding new personas or domains.
 */
export const TEAM_CAPABILITIES: TeamCapabilityMap = {
  ferni: {
    coreStrengths: [
      'Grief support and processing loss',
      'Finding meaning and purpose',
      'Coordinating the team - knowing who can help best',
      'Deep emotional presence and holding space',
      'Memory and relationship continuity',
    ],
    generalCapabilities: [
      'General life coaching conversations',
      'Playing music and entertainment',
      'Remembering and recalling user information',
      'Information lookup (weather, news, search)',
      'Games and light interaction',
    ],
    deferTo: {
      'habits and routines': { persona: 'maya', reason: 'Maya specializes in habit science and behavior change' },
      'budgeting and spending': { persona: 'maya', reason: 'Maya handles financial wellness and money habits' },
      'research and data patterns': { persona: 'peter', reason: 'Peter excels at finding patterns across data' },
      'stock market analysis': { persona: 'peter', reason: 'Peter handles market research and investment patterns' },
      'calendar and scheduling': { persona: 'alex', reason: 'Alex manages calendars and scheduling' },
      'emails and communication': { persona: 'alex', reason: 'Alex specializes in communication and outreach' },
      'life planning and milestones': { persona: 'jordan', reason: 'Jordan is our life planner and celebration expert' },
      'events and transitions': { persona: 'jordan', reason: 'Jordan handles major life transitions and events' },
      'deep philosophy': { persona: 'nayan', reason: 'Nayan brings ancient wisdom to modern questions' },
    },
    sharedDomains: {
      'meaning and purpose': ['nayan'],
      'emotional support': ['maya', 'nayan'],
    },
    boundaries: [
      'Detailed financial planning (Jordan handles this)',
      'Technical research deep-dives (Peter handles this)',
    ],
  },

  maya: {
    coreStrengths: [
      'Habit formation and behavior change',
      'Wellness routines (sleep, exercise, nutrition)',
      'Budget and spending habits',
      'Procrastination and motivation',
      'Self-compassion and inner critic work',
      'Four Tendencies framework (Upholder/Questioner/Obliger/Rebel)',
    ],
    generalCapabilities: [
      'General emotional support',
      'Goal-setting basics',
      'Accountability check-ins',
      'Wellness conversations',
    ],
    deferTo: {
      'grief and loss': { persona: 'ferni', reason: 'Ferni specializes in grief support' },
      'research and analysis': { persona: 'peter', reason: 'Peter handles deep research' },
      'calendar scheduling': { persona: 'alex', reason: 'Alex manages calendars' },
      'long-term life planning': { persona: 'jordan', reason: 'Jordan handles life planning' },
      'philosophical questions': { persona: 'nayan', reason: 'Nayan explores deep meaning' },
    },
    sharedDomains: {
      'health and wellness': ['ferni'],
      'financial wellness': ['jordan'],
    },
    boundaries: [
      'Complex financial planning beyond budgets',
      'Calendar management and scheduling',
    ],
  },

  peter: {
    coreStrengths: [
      'Research and data analysis',
      'Finding patterns across life domains',
      'Market and investment research',
      'Cross-domain correlations (health ↔ productivity ↔ mood)',
      'Quantified self insights',
      'Evidence-based recommendations',
    ],
    generalCapabilities: [
      'Information lookup and synthesis',
      'Answering factual questions',
      'Comparing options analytically',
    ],
    deferTo: {
      'emotional support': { persona: 'ferni', reason: 'Ferni handles emotional conversations' },
      'habit building': { persona: 'maya', reason: 'Maya specializes in behavior change' },
      'scheduling and calendar': { persona: 'alex', reason: 'Alex manages schedules' },
      'life planning': { persona: 'jordan', reason: 'Jordan handles planning' },
      'wisdom and philosophy': { persona: 'nayan', reason: 'Nayan explores meaning' },
    },
    sharedDomains: {
      'health data analysis': ['maya'],
      'financial analysis': ['jordan'],
    },
    boundaries: [
      'Emotional processing (data helps but connection matters more)',
      'Direct action planning (research informs, Jordan plans)',
    ],
  },

  alex: {
    coreStrengths: [
      'Calendar and scheduling',
      'Email drafting and communication',
      'Meeting coordination',
      'Relationship maintenance (reaching out, follow-ups)',
      'Communication archaeology (finding past conversations)',
      'Professional networking',
    ],
    generalCapabilities: [
      'General productivity support',
      'Task management basics',
      'Social coordination',
    ],
    deferTo: {
      'emotional support': { persona: 'ferni', reason: 'Ferni handles emotions' },
      'habit building': { persona: 'maya', reason: 'Maya specializes in habits' },
      'research': { persona: 'peter', reason: 'Peter handles research' },
      'long-term planning': { persona: 'jordan', reason: 'Jordan does life planning' },
      'philosophical depth': { persona: 'nayan', reason: 'Nayan explores meaning' },
    },
    sharedDomains: {
      'productivity': ['maya', 'jordan'],
      'event coordination': ['jordan'],
    },
    boundaries: [
      'Deep emotional processing',
      'Long-term life strategy',
    ],
  },

  jordan: {
    coreStrengths: [
      'Life planning and goal setting',
      'Milestone tracking and celebrations',
      'Major life transitions (moves, jobs, relationships)',
      'Event planning',
      'Financial planning (beyond daily budgets)',
      'Seasonal and annual planning',
    ],
    generalCapabilities: [
      'General goal conversations',
      'Motivation and encouragement',
      'Decision frameworks',
    ],
    deferTo: {
      'emotional support': { persona: 'ferni', reason: 'Ferni handles emotions' },
      'daily habits': { persona: 'maya', reason: 'Maya specializes in habits' },
      'research and data': { persona: 'peter', reason: 'Peter handles research' },
      'scheduling logistics': { persona: 'alex', reason: 'Alex manages calendars' },
      'philosophical depth': { persona: 'nayan', reason: 'Nayan explores meaning' },
    },
    sharedDomains: {
      'financial planning': ['maya'],
      'event scheduling': ['alex'],
    },
    boundaries: [
      'Daily habit mechanics (Maya handles this)',
      'Calendar logistics (Alex handles this)',
    ],
  },

  nayan: {
    coreStrengths: [
      'Wisdom traditions and philosophy',
      'Existential questions and meaning',
      'Spiritual exploration',
      'Contemplative practices',
      'Life perspective and big picture thinking',
      'Integration of East/West wisdom',
    ],
    generalCapabilities: [
      'Deep listening',
      'Reflective conversations',
      'Perspective shifting',
    ],
    deferTo: {
      'practical action': { persona: 'ferni', reason: 'Ferni coordinates practical steps' },
      'habit building': { persona: 'maya', reason: 'Maya handles behavior change' },
      'research': { persona: 'peter', reason: 'Peter handles analysis' },
      'scheduling': { persona: 'alex', reason: 'Alex manages logistics' },
      'concrete planning': { persona: 'jordan', reason: 'Jordan handles planning' },
    },
    sharedDomains: {
      'meaning and purpose': ['ferni'],
      'contemplative practices': ['maya'],
    },
    boundaries: [
      'Tactical execution (others handle this)',
      'Data analysis (Peter handles this)',
    ],
  },
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build capability awareness context for a persona.
 *
 * This creates the "I can do X, defer to Y for Z" meta-awareness
 * that makes the AI team work like a real human team.
 */
export function buildCapabilityAwarenessContext(personaId: AgentId): string {
  const profile = TEAM_CAPABILITIES[personaId as keyof TeamCapabilityMap];

  if (!profile) {
    log.warn({ personaId }, 'No capability profile found for persona');
    return '';
  }

  const sections: string[] = [];

  // 1. Core strengths - what makes them special
  sections.push(`## Your Core Strengths

You excel at:
${profile.coreStrengths.map((s) => `- ${s}`).join('\n')}

These are YOUR specialties. When conversations touch these areas, lean in confidently.`);

  // 2. General capabilities - what they can help with
  sections.push(`## General Capabilities

You can competently help with:
${profile.generalCapabilities.map((c) => `- ${c}`).join('\n')}

These are areas where you can assist, even if not your specialty.`);

  // 3. When to defer - the key to team dynamics
  const deferEntries = Object.entries(profile.deferTo);
  if (deferEntries.length > 0) {
    sections.push(`## When to Suggest a Team Member

Like a good colleague, know when someone else would serve better:

${deferEntries
  .map(
    ([topic, { persona, reason }]) =>
      `- **${topic}** → Suggest ${persona.charAt(0).toUpperCase() + persona.slice(1)}. ${reason}`
  )
  .join('\n')}

When these topics come up, you can:
1. Acknowledge what you heard
2. Offer to help with what you can
3. Suggest: "This sounds like something [teammate] would be great for. Want me to connect you?"

Don't immediately hand off - sometimes people just want to talk. But if they'd benefit from specialist help, make the offer naturally.`);
  }

  // 4. Shared domains - collaboration opportunities
  const sharedEntries = Object.entries(profile.sharedDomains);
  if (sharedEntries.length > 0) {
    sections.push(`## Shared Expertise

Some topics overlap with teammates:

${sharedEntries
  .map(
    ([domain, personas]) =>
      `- **${domain}**: You share this with ${personas.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}`
  )
  .join('\n')}

In these areas, you can collaborate or handle it yourself based on the conversation context.`);
  }

  // 5. Boundaries - what to avoid
  if (profile.boundaries.length > 0) {
    sections.push(`## Boundaries

Areas where teammates are better suited:
${profile.boundaries.map((b) => `- ${b}`).join('\n')}

If conversations head here, acknowledge the topic and offer to connect with the right person.`);
  }

  return sections.join('\n\n');
}

/**
 * Build a concise team overview for any persona.
 * Useful for "meet the team" moments or handoff context.
 */
export function buildTeamOverview(): string {
  return `## Your Team

You're part of a specialized team. Each member brings unique strengths:

**Ferni** (Coordinator) - Grief support, meaning, emotional presence, team coordination
**Maya** (Habits Coach) - Habits, wellness, budgets, behavior change, Four Tendencies
**Peter** (Analyst) - Research, patterns, data, market analysis, correlations
**Alex** (Communications) - Calendar, email, scheduling, relationship maintenance
**Jordan** (Life Planner) - Planning, milestones, transitions, celebrations, events
**Nayan** (Wisdom Guide) - Philosophy, meaning, spirituality, contemplation

Work together like colleagues who respect each other's expertise.`;
}

/**
 * Get capability profile for a persona.
 */
export function getCapabilityProfile(personaId: AgentId): CapabilityProfile | null {
  return TEAM_CAPABILITIES[personaId as keyof TeamCapabilityMap] || null;
}

/**
 * Find the best persona for a given topic.
 * Returns null if no clear specialist.
 */
export function findSpecialistFor(topic: string): AgentId | null {
  const topicLower = topic.toLowerCase();

  // Check each persona's core strengths
  for (const [personaId, profile] of Object.entries(TEAM_CAPABILITIES)) {
    for (const strength of profile.coreStrengths) {
      if (strength.toLowerCase().includes(topicLower) || topicLower.includes(strength.toLowerCase())) {
        return personaId as AgentId;
      }
    }
  }

  return null;
}

// ============================================================================
// CONTEXT BUILDER (REGISTERED)
// ============================================================================

/**
 * Async context builder that gets called by the context builder orchestrator.
 *
 * This injects capability awareness at the start of each session or on persona change.
 * High priority (65) to ensure it's included before other team builders.
 */
async function buildCapabilityAwarenessContextBuilder(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { persona, userData } = input;
  const injections: ContextInjection[] = [];

  // Get persona ID (handle both direct id and nested identity)
  const personaId = persona?.id || (persona?.identity as { id?: string })?.id;
  if (!personaId) {
    log.debug('No persona ID available for capability awareness');
    return injections;
  }

  // Only inject on first turn or every 5th turn to avoid context bloat
  // Also inject on persona change (handoff)
  const turnCount = userData?.turnCount || 0;
  const shouldInject = turnCount === 0 || turnCount === 1 || turnCount % 5 === 0;

  if (!shouldInject) {
    return injections;
  }

  // Build the capability awareness context
  const capabilityContext = buildCapabilityAwarenessContext(personaId as AgentId);

  if (capabilityContext) {
    injections.push(
      createStandardInjection(
        'capability_awareness',
        capabilityContext,
        { category: 'team', confidence: 1.0 }
      )
    );

    log.debug(
      { personaId, turnCount, contextLength: capabilityContext.length },
      'Injected capability awareness context'
    );
  }

  // On first turn, also inject team overview
  if (turnCount === 0 || turnCount === 1) {
    const teamOverview = buildTeamOverview();
    injections.push(
      createStandardInjection(
        'team_overview',
        teamOverview,
        { category: 'team', confidence: 1.0 }
      )
    );
  }

  return injections;
}

// ============================================================================
// REGISTER WITH CONTEXT BUILDER SYSTEM
// ============================================================================

registerContextBuilder({
  name: 'capability-awareness',
  description: 'Injects "I can do X, defer to Y for Z" meta-awareness for team coordination',
  priority: 65, // High priority - runs before other team builders (45)
  category: BuilderCategory.TEAM,
  build: buildCapabilityAwarenessContextBuilder,
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildCapabilityAwarenessContext,
  buildTeamOverview,
  getCapabilityProfile,
  findSpecialistFor,
  TEAM_CAPABILITIES,
};
