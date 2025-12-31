/**
 * Integration Wiring Validation Probes
 *
 * Tests whether the connections between components are
 * discoverable and logically organized.
 */

import type { SemanticProbe } from '../types.js';
import { CORE_PRINCIPLES } from '../types.js';

/**
 * Cross-persona integration probes
 */
export function generateCrossPersonaProbes(): SemanticProbe[] {
  return [
    {
      id: 'wiring-persona-handoff-discovery',
      category: 'integration-wiring',
      question: `If I want to understand how Ferni hands off to Peter, where do I look? Is the path "services/handoff/" intuitive? Can I trace the complete flow?`,
      context: {
        target:
          'services/handoff/handoff-state.ts, tools/handoff/handoff-coordinator.ts, tools/handoff/handoff-factory.ts',
        relatedModules: [
          'intelligence/context-builders/team-awareness.ts',
          'services/coaching/handoff-intelligence.ts',
          'agents/shared/tool-executors/handoff-executor.ts',
        ],
        actualBehavior:
          'Handoff flow: tools/handoff/ triggers handoff → services/handoff/handoff-state.ts packages context (conversation, mood, met personas) → agents/shared/tool-executors/handoff-executor.ts executes persona switch → intelligence/context-builders/team-awareness.ts injects awareness. Complete traceable pipeline with state preserved across personas.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment:
        'Handoff flow should be traceable: trigger → context package → persona switch',
      weight: 9,
    },
    {
      id: 'wiring-cross-persona-intelligence',
      category: 'integration-wiring',
      question: `"Cross-persona intelligence" allows personas to share insights. Is this feature discoverable? Can I find where Peter's insights flow to Ferni?`,
      context: {
        target:
          'services/cross-persona-insights.ts, docs/architecture/CROSS-PERSONA-INTELLIGENCE.md',
        relatedModules: [
          'intelligence/context-builders/personas/peter-research-insights.ts',
          'intelligence/context-builders/personas/maya-coaching-insights.ts',
          'services/coaching/cross-persona-context.ts',
          'personas/shared/cross-persona-learning.ts',
        ],
        actualBehavior:
          'Cross-persona intelligence flows through: (1) services/cross-persona-insights.ts as the central hub, (2) persona-specific builders in intelligence/context-builders/personas/ (peter-research-insights.ts, maya-coaching-insights.ts, etc.) that surface domain knowledge, (3) docs/architecture/CROSS-PERSONA-INTELLIGENCE.md documents the complete flow. Peter\'s insights flow to Ferni via the central insights service which aggregates and routes based on active persona.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Cross-persona data flow should be explicit, not implicit',
      weight: 8,
    },
    {
      id: 'wiring-team-coordination',
      category: 'integration-wiring',
      question: `Ferni is the "team coordinator". Where is this coordination logic? Is it properly split between content (bundle) and logic (service)?`,
      context: {
        target:
          'services/team-handler-registry/handlers/coordination.ts, personas/bundles/ferni/content/behaviors/team-coordination.json',
        relatedModules: [
          'intelligence/context-builders/ferni-coordinator-insights.ts',
          'services/team-engagement.ts',
        ],
        actualBehavior:
          'Correctly split: team-coordination.json contains persona-specific CONTENT (triggers, phrases, team introductions). services/team-handler-registry/handlers/coordination.ts contains shared SERVICE LOGIC (Firestore persistence, handler registration). This separation follows content-vs-logic best practices.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
        ],
      },
      expectedAlignment:
        'Content (triggers, phrases) in persona bundle, business logic in shared services',
      weight: 7,
    },
  ];
}

/**
 * Tool-to-service wiring probes
 */
export function generateToolServiceProbes(): SemanticProbe[] {
  return [
    {
      id: 'wiring-tool-service-connection',
      category: 'integration-wiring',
      question: `Tools in src/tools/ call services in src/services/. Is this connection pattern consistent? Can I predict which service a tool uses from its name?`,
      context: {
        target: 'tools/, services/',
        philosophyPrinciples: [
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
        ],
      },
      expectedAlignment: 'Tool names should mirror service names where applicable',
      weight: 7,
    },
    {
      id: 'wiring-tool-registration',
      category: 'integration-wiring',
      question: `How do tools get registered for LLM use? Is the registration pattern discoverable? Look for "registry" or "registration" patterns.`,
      context: {
        target: 'tools/, docs/architecture/TOOL-LOADING-SYSTEM.md',
        relatedModules: [
          'agents/shared/function-call-format.ts',
          'agents/shared/json-function-executor.ts',
        ],
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Clear registration pattern: tool → registry → LLM availability',
      weight: 8,
    },
    {
      id: 'wiring-tool-dependencies',
      category: 'integration-wiring',
      question: `Tools need dependencies (memory, services). Is dependency injection discoverable? How does a tool get access to session context?`,
      context: {
        target: 'services/di/, services/session-manager.ts',
        relatedModules: ['services/global-services.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'DI container pattern should be clearly documented',
      weight: 6,
    },
  ];
}

/**
 * Context builder integration probes
 */
export function generateContextBuilderWiringProbes(): SemanticProbe[] {
  return [
    {
      id: 'wiring-builder-loading',
      category: 'integration-wiring',
      question: `Context builders in intelligence/context-builders/ inject turn-by-turn guidance. How are they loaded and prioritized? Is this discoverable?`,
      context: {
        target:
          'intelligence/context-builders/index.ts, intelligence/context-builders/core/categories.ts, intelligence/context-builders/CLAUDE.md',
        actualBehavior:
          'Loading via index.ts with tiered execution. Categories defined in core/categories.ts with BuilderCategory enum. 70+ builders organized by priority.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Categories and priorities documented in core/categories.ts and CLAUDE.md',
      weight: 7,
    },
    {
      id: 'wiring-builder-to-persona',
      category: 'integration-wiring',
      question: `Some builders are persona-specific (peter-research-insights.ts), some are shared (emotional.ts). How do I know which builders apply to which persona?`,
      context: {
        target:
          'intelligence/context-builders/personas/, intelligence/context-builders/*-insights.ts, intelligence/context-builders/CLAUDE.md',
        actualBehavior:
          'Persona-specific builders use persona name prefix (peter-research-insights.ts, maya-coaching-insights.ts). Documented in CLAUDE.md Cross-Persona Intelligence section.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
        ],
      },
      expectedAlignment: 'Persona-specific builders clearly marked with persona name prefix',
      weight: 7,
    },
    {
      id: 'wiring-builder-categories',
      category: 'integration-wiring',
      question: `Builders have categories (SAFETY, EMOTIONAL, VOICE, etc.). Is the category system documented? Can I predict where a new builder should go?`,
      context: {
        target:
          'intelligence/context-builders/core/categories.ts, intelligence/context-builders/CLAUDE.md',
        actualBehavior:
          '13 categories with priority ranges defined in BuilderCategory enum. Each category has metadata with description and priority range. BUILDER_CATEGORIES maps builder names to categories.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment:
        'Category system is self-documenting in core/categories.ts with getCategoryMetadata()',
      weight: 6,
    },
  ];
}

/**
 * Memory-to-service integration probes
 */
export function generateMemoryIntegrationProbes(): SemanticProbe[] {
  return [
    {
      id: 'wiring-memory-to-superhuman',
      category: 'integration-wiring',
      question: `Superhuman services (commitment-keeper, etc.) need memory access. Is the integration path clear? Memory → Service → Persona?`,
      context: {
        target: 'services/superhuman/, memory/',
        relatedModules: ['services/data-layer/'],
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Superhuman services should have clear memory access patterns',
      weight: 8,
    },
    {
      id: 'wiring-data-layer-routing',
      category: 'integration-wiring',
      question: `The data-layer has 98 entity types. How does routing work? Can I add a new entity type easily?`,
      context: {
        target: 'services/data-layer/',
        actualBehavior: 'Entity-specific collections with domain signals and query routing',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Clear entity → collection → query pipeline',
      weight: 7,
    },
  ];
}

/**
 * External integration probes
 */
export function generateExternalIntegrationProbes(): SemanticProbe[] {
  return [
    {
      id: 'wiring-calendar-integration',
      category: 'integration-wiring',
      question: `Calendar integration supports Google, Outlook, Apple. Is the adapter pattern clear? Can I add a new calendar provider?`,
      context: {
        target: 'services/calendar/',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Clear adapter interface for calendar providers',
      weight: 6,
    },
    {
      id: 'wiring-payment-integration',
      category: 'integration-wiring',
      question: `Payment supports Stripe and Apple IAP. Is the payment flow traceable? services/stripe-* and services/apple-iap.ts?`,
      context: {
        target:
          'services/stripe-payments.ts, services/stripe-subscription.ts, services/apple-iap.ts',
        relatedModules: ['services/monetization/', 'services/premium/'],
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Unified payment interface regardless of provider',
      weight: 6,
    },
  ];
}

export const allIntegrationWiringProbes = [
  ...generateCrossPersonaProbes(),
  ...generateToolServiceProbes(),
  ...generateContextBuilderWiringProbes(),
  ...generateMemoryIntegrationProbes(),
  ...generateExternalIntegrationProbes(),
];
