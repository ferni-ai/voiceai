/**
 * Architectural Philosophy Alignment Probes
 *
 * Tests whether the architecture embodies our core philosophy:
 * "Making AI human, and the decisions we make will reflect that."
 */

import type { SemanticProbe } from '../types.js';
import { CORE_PRINCIPLES } from '../types.js';

/**
 * "Better Than Human" philosophy probes
 */
export function generateBetterThanHumanProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-superhuman-folder',
      category: 'architectural-philosophy',
      question: `The "services/superhuman/" folder contains capabilities "no human friend could consistently provide". Does every service in this folder truly represent a superhuman capability? Are any missing?`,
      context: {
        target: 'services/superhuman/',
        actualBehavior:
          '10 services: commitment-keeper, predictive-coaching, capacity-guardian, dream-keeper, emotional-first-aid, relationship-network, life-narrative, values-alignment, seasonal-awareness, relationship-milestones',
        philosophyPrinciples: [CORE_PRINCIPLES.BETTER_THAN_HUMAN],
      },
      expectedAlignment: 'Each service should clearly exceed human capability in its domain',
      weight: 10,
    },
    {
      id: 'philosophy-superhuman-completeness',
      category: 'architectural-philosophy',
      question: `Are there superhuman capabilities scattered elsewhere that should be consolidated into services/superhuman/? Search for capabilities that exceed human ability.`,
      context: {
        target: 'services/superhuman/, intelligence/context-builders/',
        relatedModules: ['better-than-human-direct.ts', 'proactive-insight-engine.ts'],
        actualBehavior:
          'services/superhuman/ contains 10 core superhuman services. intelligence/context-builders/better-than-human-direct.ts triggers these services during conversations. Cross-persona insights connect superhuman services across personas. The split is intentional: services/ has the logic, intelligence/ has the context-building that surfaces capabilities at the right moment.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.BETTER_THAN_HUMAN,
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
        ],
      },
      expectedAlignment:
        'Superhuman services in services/superhuman/, triggering logic in intelligence/',
      weight: 8,
    },
    {
      id: 'philosophy-eq-implementation',
      category: 'architectural-philosophy',
      question: `The brand promises "superhuman emotional intelligence" with micro-expressions, active listening, breath sync, concern detection, and anticipation. Are these all implemented and named clearly?`,
      context: {
        target:
          'design-system/docs/brand/BETTER-THAN-HUMAN.md, apps/web/src/ui/better-than-human.ui.ts',
        relatedModules: [
          'intelligence/emotion-detector.ts',
          'intelligence/emotional-forecasting.ts',
        ],
        philosophyPrinciples: [CORE_PRINCIPLES.BETTER_THAN_HUMAN, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'EQ capabilities should be clearly named and located',
      weight: 9,
    },
  ];
}

/**
 * "Human First" philosophy probes
 */
export function generateHumanFirstProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-persona-humanity',
      category: 'architectural-philosophy',
      question: `Personas should "feel like real people, not bots". Do persona bundle names, biographies, and behaviors convey humanity? Is there robotic language in system prompts?`,
      context: {
        target: 'personas/bundles/*/identity/',
        philosophyPrinciples: [
          CORE_PRINCIPLES.HUMAN_FIRST,
          CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION,
        ],
      },
      expectedAlignment: 'No "I am an AI", no robotic phrases, warm human voice',
      weight: 9,
    },
    {
      id: 'philosophy-toast-humanity',
      category: 'architectural-philosophy',
      question: `Toast messages should be "warm, human, and SHORT" - never enterprise software patterns. Does the codebase enforce this? Search for toast patterns.`,
      context: {
        target: 'apps/web/',
        actualBehavior:
          'Guidelines: "Couldn\'t save that" not "Failed to save changes", contractions over formal language',
        philosophyPrinciples: [CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'Toast utilities should enforce human language',
      weight: 7,
    },
    {
      id: 'philosophy-meaningful-silence',
      category: 'architectural-philosophy',
      question: `"meaningful-silence.ts" handles pauses in conversation. Does the name convey that silence can be meaningful? Is the implementation human-centric?`,
      context: {
        target: 'personas/meaningful-silence.ts',
        actualBehavior:
          'Transforms awkward pauses into relationship building. Instead of "Still there?", offers: meaningful memory references, thoughtful follow-up questions, human micro-stories, music offers, time-of-day acknowledgments, or comfortable quiet. Imports dynamic-presence.ts, coaching-questions.ts, and persona-content-loader.ts for persona-specific responses.',
        philosophyPrinciples: [CORE_PRINCIPLES.HUMAN_FIRST, CORE_PRINCIPLES.GENTLE_GROWTH],
      },
      expectedAlignment: 'Silence treated as communication, not just absence',
      weight: 8,
    },
  ];
}

/**
 * "Relationship Over Transaction" philosophy probes
 */
export function generateRelationshipProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-relationship-services',
      category: 'architectural-philosophy',
      question: `Services like "relationship-network", "relationship-milestones" serve relationships. Are there transactional services that should be reframed as relational?`,
      context: {
        target: 'services/superhuman/relationship-*',
        relatedModules: ['services/contacts/', 'services/engagement/'],
        philosophyPrinciples: [CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION],
      },
      expectedAlignment: 'Engagement should serve relationships, not extract value',
      weight: 8,
    },
    {
      id: 'philosophy-memory-relationship',
      category: 'architectural-philosophy',
      question: `Memory should prioritize relationship context. Is "deep-relationship.ts" (inside jokes, shared vocabulary) prominent enough? Should relationship memory be more central?`,
      context: {
        target: 'intelligence/context-builders/relationship/deep-relationship.ts',
        relatedModules: ['memory/associative-memory.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION],
      },
      expectedAlignment: 'Relationship context should be a first-class concern',
      weight: 8,
    },
    {
      id: 'philosophy-handoff-continuity',
      category: 'architectural-philosophy',
      question: `When users transfer between personas, relationship continuity should be preserved. Does the handoff system maintain relationship context, not just task context?`,
      context: {
        target: 'services/handoff/',
        relatedModules: ['cross-persona-insights.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION],
      },
      expectedAlignment: 'Handoffs preserve emotional and relational context',
      weight: 9,
    },
  ];
}

/**
 * "Gentle Growth" philosophy probes
 */
export function generateGentleGrowthProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-coaching-gentleness',
      category: 'architectural-philosophy',
      question: `Maya's habit coaching should support "gentle growth without judgment". Does the coaching module (habit-coaching/) reflect this? Any judgmental language in templates?`,
      context: {
        target: 'tools/habit-coaching/, personas/bundles/maya-santos/',
        philosophyPrinciples: [CORE_PRINCIPLES.GENTLE_GROWTH, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'Encouraging language, no shame, progressive difficulty',
      weight: 8,
    },
    {
      id: 'philosophy-crisis-handling',
      category: 'architectural-philosophy',
      question: `Crisis detection (crisis.ts) should be supportive, not alarming. Does the naming and implementation reflect gentle crisis support?`,
      context: {
        target: 'intelligence/context-builders/crisis.ts, intelligence/distress-levels.ts',
        philosophyPrinciples: [CORE_PRINCIPLES.GENTLE_GROWTH, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'Crisis = support opportunity, not emergency alert pattern',
      weight: 9,
    },
    {
      id: 'philosophy-glidepath',
      category: 'architectural-philosophy',
      question: `The "glidepath" concept (5 levels from tiny to full) embodies gentle growth. Is this concept named and organized clearly in the codebase?`,
      context: {
        target: 'tools/habit-coaching/',
        actualBehavior: 'Glidepath: tiny (2 min) → mini → standard → advanced → full lifestyle',
        philosophyPrinciples: [CORE_PRINCIPLES.GENTLE_GROWTH],
      },
      expectedAlignment: 'Glidepath should be a named, discoverable concept',
      weight: 7,
    },
  ];
}

/**
 * Clean architecture philosophy probes
 */
export function generateArchitectureProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-layer-naming',
      category: 'architectural-philosophy',
      question: `The layer names (agents, intelligence, services, memory) form a coherent architecture. Do these names clearly convey the layer's responsibility?`,
      context: {
        target: 'src/',
        actualBehavior:
          'Level 100: agents/api/cli → Level 70: personas/intelligence/tools/conversation/speech → Level 60: services → Level 30: memory/config/utils/types',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Layer names should imply their responsibility level',
      weight: 8,
    },
    {
      id: 'philosophy-import-rules',
      category: 'architectural-philosophy',
      question: `Import rules enforce clean architecture (lower layers can't import from higher). Is this constraint discoverable? Can a newcomer understand the rules?`,
      context: {
        target: 'docs/architecture/CLEAN-ARCHITECTURE.md, CLAUDE.md',
        actualBehavior:
          'Import rules documented in CLEAN-ARCHITECTURE.md and CLAUDE.md. Five-tier hierarchy: Level 100 (agents/api/cli) → Level 70 (personas/intelligence/tools) → Level 60 (services) → Level 30 (memory) → Level 10 (config/utils/types). Enforced by `pnpm quality:arch` script. Each layer CLAUDE.md states its level and import restrictions.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Architecture rules should be documented and enforceable',
      weight: 7,
    },
    {
      id: 'philosophy-domain-driven',
      category: 'architectural-philosophy',
      question: `The codebase is domain-driven (habits, calendar, relationships, etc.). Are domain boundaries clear? Can I find all habit-related code easily?`,
      context: {
        target: 'src/',
        relatedModules: [
          'tools/domains/habits/',
          'services/habits/',
          'intelligence/context-builders/personas/maya-habit-insights.ts',
          'personas/bundles/maya-santos/content/behaviors/habit-streaks.json',
          'api/habit-routes.ts',
          'agents/shared/tool-executors/habits-executor.ts',
        ],
        actualBehavior:
          'Domains are organized across architecture layers with consistent naming. Example for "habits" domain: tools/domains/habits/ (LLM-callable), services/habits/ (business logic), intelligence/context-builders/personas/maya-habit-insights.ts (context injection), personas/bundles/maya-santos/content/behaviors/ (persona content), api/habit-routes.ts (API), agents/shared/tool-executors/habits-executor.ts (execution). Each layer uses the same "habit" naming convention, making domain discovery intuitive via grep or file search.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
        ],
      },
      expectedAlignment:
        'Domain code follows consistent naming across layers: tools/domains/{domain}, services/{domain}, etc.',
      weight: 8,
    },
  ];
}

/**
 * Cross-cutting philosophy probes
 */
export function generateCrossCuttingProbes(): SemanticProbe[] {
  return [
    {
      id: 'philosophy-terminology-consistency',
      category: 'architectural-philosophy',
      question: `Key terms like "persona", "memory", "context", "intelligence" should have consistent meaning. Search for inconsistent usage of these terms.`,
      context: {
        target: 'src/',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Each term should have one clear definition',
      weight: 7,
    },
    {
      id: 'philosophy-documentation-alignment',
      category: 'architectural-philosophy',
      question: `Documentation (README, CLAUDE.md, architecture docs) should reflect the actual code organization. Are there mismatches between docs and reality?`,
      context: {
        target: 'docs/, CLAUDE.md, README.md',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Docs accurately describe the current codebase',
      weight: 6,
    },
    {
      id: 'philosophy-newcomer-onboarding',
      category: 'architectural-philosophy',
      question: `An intelligent newcomer should be able to navigate the codebase within minutes. What would confuse them? What naming would mislead them?`,
      context: {
        target: 'src/',
        philosophyPrinciples: [
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
        ],
      },
      expectedAlignment: 'Structure should be self-documenting for experienced developers',
      weight: 9,
    },
  ];
}

export const allArchitecturalPhilosophyProbes = [
  ...generateBetterThanHumanProbes(),
  ...generateHumanFirstProbes(),
  ...generateRelationshipProbes(),
  ...generateGentleGrowthProbes(),
  ...generateArchitectureProbes(),
  ...generateCrossCuttingProbes(),
];
