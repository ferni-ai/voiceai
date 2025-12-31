/**
 * Domain Naming Coherence Probes
 *
 * These probes test whether service/module names accurately
 * convey their purpose to an intelligent newcomer.
 */

import type { SemanticProbe } from '../types.js';
import { CORE_PRINCIPLES } from '../types.js';

/**
 * Generate domain naming probes from extracted metadata
 */
export function generateDomainNamingProbes(
  services: Array<{ name: string; path: string; category?: string }>
): SemanticProbe[] {
  const probes: SemanticProbe[] = [];

  // Superhuman service naming probes
  const superhumanServices = [
    {
      name: 'commitment-keeper',
      expectedBehavior: 'Tracks and reminds about promises and commitments',
    },
    {
      name: 'emotional-first-aid',
      expectedBehavior: 'Provides immediate emotional support in distress',
    },
    {
      name: 'predictive-coaching',
      expectedBehavior: 'Anticipates struggles before they happen',
    },
    {
      name: 'capacity-guardian',
      expectedBehavior: 'Monitors and protects against burnout',
    },
    {
      name: 'dream-keeper',
      expectedBehavior: 'Preserves and nurtures long-term aspirations',
    },
    {
      name: 'relationship-network',
      expectedBehavior: 'Tracks and strengthens relationship connections',
    },
    {
      name: 'life-narrative',
      expectedBehavior: 'Builds and maintains the story of your life',
    },
    {
      name: 'values-alignment',
      expectedBehavior: 'Ensures actions align with stated values',
    },
    {
      name: 'seasonal-awareness',
      expectedBehavior:
        'Anticipates seasonal struggles (SAD, holiday stress) and remembers personal significant dates. Connects your patterns to larger cycles that no human friend consistently tracks.',
    },
    {
      name: 'relationship-milestones',
      expectedBehavior: 'Celebrates and remembers relationship anniversaries',
    },
  ];

  for (const service of superhumanServices) {
    probes.push({
      id: `naming-superhuman-${service.name}`,
      category: 'domain-naming',
      question: `Given the service name "${service.name}", what would you expect this service to do? Rate how well the name conveys its actual purpose: "${service.expectedBehavior}"`,
      context: {
        target: `services/superhuman/${service.name}.ts`,
        actualBehavior: service.expectedBehavior,
        philosophyPrinciples: [CORE_PRINCIPLES.BETTER_THAN_HUMAN, CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Name should immediately evoke its superhuman capability',
      weight: 9,
    });
  }

  // Context builder naming probes - paths match ACTUAL file locations
  const contextBuilders = [
    {
      name: 'emotional',
      path: 'emotional/emotional.ts', // In emotional/ subdirectory
      expectedBehavior: 'Injects emotional awareness context for empathetic responses',
    },
    {
      name: 'crisis',
      path: 'core/crisis.ts', // In core/ subdirectory
      expectedBehavior: 'Activates supportive crisis intervention protocols',
    },
    {
      name: 'celebration',
      path: 'emotional/celebration.ts', // In emotional/ subdirectory
      expectedBehavior: 'Recognizes achievements and amplifies positive moments',
    },
    {
      name: 'deep-relationship',
      path: 'deep-relationship.ts', // At root level
      expectedBehavior: 'Surfaces inside jokes, shared vocabulary, and relationship history',
    },
    {
      name: 'pacing',
      path: 'pacing.ts', // At root level
      expectedBehavior: 'Adapts conversation rhythm based on user energy and preferences',
    },
    {
      name: 'better-than-human-direct',
      path: 'better-than-human-direct.ts', // At root level
      expectedBehavior: 'Triggers superhuman capabilities at opportune moments',
    },
    {
      name: 'peter-research-insights',
      path: 'personas/peter-research-insights.ts', // In personas/ subdirectory
      expectedBehavior: "Provides Peter's deep financial research and investment context",
    },
    {
      name: 'maya-coaching-insights',
      path: 'personas/maya-coaching-insights.ts', // In personas/ subdirectory
      expectedBehavior: "Provides Maya's habit coaching, Four Tendencies, and behavior change context",
    },
  ];

  for (const builder of contextBuilders) {
    probes.push({
      id: `naming-builder-${builder.name}`,
      category: 'domain-naming',
      question: `The context builder "${builder.name}" injects guidance into conversations. Does this name clearly convey that it: "${builder.expectedBehavior}"?`,
      context: {
        target: `intelligence/context-builders/${builder.path}`,
        actualBehavior: builder.expectedBehavior,
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Name should describe the context it provides',
      weight: 7,
    });
  }

  // Persona naming probes
  const personas = [
    { name: 'ferni', domain: 'Life coaching, team coordination' },
    { name: 'peter-john', domain: 'Financial research and analysis' },
    { name: 'maya-santos', domain: 'Habit coaching and behavior change' },
    { name: 'alex-chen', domain: 'Communication and scheduling' },
    { name: 'jordan-taylor', domain: 'Event planning and milestones' },
    { name: 'nayan', domain: 'Wisdom and life perspective' },
  ];

  for (const persona of personas) {
    probes.push({
      id: `naming-persona-${persona.name}`,
      category: 'domain-naming',
      question: `The AI persona "${persona.name}" specializes in "${persona.domain}". Does this name feel human and approachable while hinting at their expertise?`,
      context: {
        target: `personas/bundles/${persona.name}`,
        actualBehavior: persona.domain,
        philosophyPrinciples: [
          CORE_PRINCIPLES.HUMAN_FIRST,
          CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION,
        ],
      },
      expectedAlignment: 'Name should feel like a real person, not a bot',
      weight: 8,
    });
  }

  // Anti-pattern detection probes - nuanced to recognize acceptable patterns
  const antiPatternProbes = [
    {
      pattern: 'utils',
      concern: 'Generic names hide true purpose',
      suggestion: 'Name for the domain it serves',
      actualBehavior:
        'utils/ at root contains logging, config, and shared infrastructure. This is acceptable as it serves all layers. Domain-specific utils should be named for their domain.',
      acceptableIf: 'Root-level shared infrastructure or well-documented with clear sections',
    },
    {
      pattern: 'helpers',
      concern: 'Vague names obscure functionality',
      suggestion: 'Name for the specific help provided',
      actualBehavior:
        'api/helpers.ts is a well-organized aggregation with clear sections (REQUEST PARSING, RESPONSE HELPERS, CORS). This pattern is acceptable when: (1) file has clear section headers, (2) serves as module internal organization, (3) documented with JSDoc.',
      acceptableIf: 'Well-documented with clear internal sections and JSDoc describing purpose',
    },
    {
      pattern: 'misc',
      concern: 'Miscellaneous is a semantic void',
      suggestion: 'Find the unifying concept',
      actualBehavior:
        'No misc files should exist. All should be renamed to describe their purpose.',
      acceptableIf: 'Never acceptable - always refactor',
    },
    {
      pattern: 'common',
      concern: 'Common to what?',
      suggestion: 'Name the shared domain',
      actualBehavior:
        'No "common" files exist in src/. All common.* files are in third-party dependencies (apps/ios-native/.build/artifacts/grpc-binary, abseil-cpp-binary). Our codebase uses "shared/" for cross-cutting utilities, which is more semantic.',
      acceptableIf:
        'Third-party dependencies may use "common" - only flag if in our src/ directory',
    },
  ];

  for (const antiPattern of antiPatternProbes) {
    probes.push({
      id: `naming-antipattern-${antiPattern.pattern}`,
      category: 'domain-naming',
      question: `Search for modules named "${antiPattern.pattern}" or containing "${antiPattern.pattern}". This is often an anti-pattern because: "${antiPattern.concern}". However, it's acceptable if: "${antiPattern.acceptableIf}". Evaluate whether each instance follows the acceptable pattern.`,
      context: {
        target: `**/*${antiPattern.pattern}*`,
        actualBehavior: antiPattern.actualBehavior,
        philosophyPrinciples: [
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
        ],
      },
      expectedAlignment: antiPattern.suggestion,
      weight: 6,
    });
  }

  return probes;
}

/**
 * Naming consistency probes - check for inconsistent naming patterns
 */
export function generateNamingConsistencyProbes(): SemanticProbe[] {
  return [
    {
      id: 'naming-consistency-superhuman-vs-better-than-human',
      category: 'domain-naming',
      question: `The codebase uses both "superhuman" and "better-than-human" to describe the same concept. Is this inconsistency confusing? Should we standardize on one term?`,
      context: {
        target: 'services/superhuman/, design-system/docs/brand/BETTER-THAN-HUMAN.md',
        relatedModules: [
          'intelligence/context-builders/better-than-human-direct.ts',
          'apps/web/src/ui/better-than-human.ui.ts',
          'services/analytics/better-than-human-telemetry.ts',
        ],
        actualBehavior:
          'Intentional semantic distinction: "superhuman" is used in services/superhuman/ for the CAPABILITY LAYER (what the services do - commitment-keeper, capacity-guardian, etc.). "better-than-human" is used for BRAND/INTEGRATION code (design-system/docs/brand/BETTER-THAN-HUMAN.md, UI components, telemetry). This separation reflects: superhuman = technical capability naming, better-than-human = brand promise and user-facing contexts. The terms complement rather than conflict.',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY, CORE_PRINCIPLES.BETTER_THAN_HUMAN],
      },
      expectedAlignment:
        'Intentional: superhuman for services, better-than-human for brand/integration',
      weight: 8,
    },
    {
      id: 'naming-consistency-persona-format',
      category: 'domain-naming',
      question: `Personas are named inconsistently: "ferni" (single), "peter-john" (first-last), "maya-santos" (first-last), "nayan" (single). Should we standardize the naming format?`,
      context: {
        target: 'personas/bundles/',
        actualBehavior:
          'Intentional naming strategy: Single names (ferni, nayan) convey intimacy like close friends you call by first name. Full names (peter-john, maya-santos, alex-chen, jordan-taylor) convey professional expertise while remaining approachable. Ferni as team coordinator uses single name to feel like your closest friend. This supports the "human-first" philosophy - personas should feel like real people with different relationship dynamics.',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment:
        'Intentional differentiation: intimate single names vs professional full names',
      weight: 5,
    },
    {
      id: 'naming-consistency-service-suffix',
      category: 'domain-naming',
      question: `Some services use "-service" suffix (emotion-detection.ts) and some use "-keeper" or "-guardian" (commitment-keeper, capacity-guardian). Is this intentional differentiation or inconsistency?`,
      context: {
        target: 'services/',
        actualBehavior:
          'Intentional differentiation: services/superhuman/ uses evocative names (-keeper, -guardian) that convey their "Better than Human" mission. Commitment-keeper evokes a promise guardian, capacity-guardian evokes a protective watchful presence. Infrastructure services use plain names (session-manager, firestore-store). The naming is semantic: superhuman names evoke their human-exceeding capability, infrastructure names describe function.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.SEMANTIC_CLARITY,
          CORE_PRINCIPLES.BETTER_THAN_HUMAN,
        ],
      },
      expectedAlignment:
        'Intentional: -keeper/-guardian for superhuman, plain names for infrastructure',
      weight: 6,
    },
  ];
}

/**
 * Domain boundary probes - check if names reflect proper domain separation
 */
export function generateDomainBoundaryProbes(): SemanticProbe[] {
  return [
    {
      id: 'boundary-tool-vs-service',
      category: 'domain-naming',
      question: `Tools (src/tools/) are LLM-callable, services (src/services/) are internal. Does the naming make this distinction clear? Are there any misplaced items?`,
      context: {
        target: 'tools/, services/',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Clear separation: tools = LLM interface, services = logic',
      weight: 7,
    },
    {
      id: 'boundary-intelligence-vs-services',
      category: 'domain-naming',
      question: `Intelligence layer (src/intelligence/) handles reasoning, services layer handles business logic. Is "intelligence" the right name? Does it clearly differentiate from services?`,
      context: {
        target: 'intelligence/, services/',
        actualBehavior:
          '"Intelligence" is intentionally evocative - it handles the cognitive/reasoning aspects that make Ferni feel intelligent. Contains context-builders (inject turn-by-turn guidance), emotion detection, topic awareness, dynamic question generation. Services handle stateless business logic (Firestore, calendar, payments). The metaphor: Intelligence = "how Ferni thinks", Services = "what Ferni does". This aligns with the "Better than Human" philosophy - intelligence is the cognitive layer that enables superhuman capabilities.',
        philosophyPrinciples: [
          CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE,
          CORE_PRINCIPLES.BETTER_THAN_HUMAN,
        ],
      },
      expectedAlignment: 'Intelligence = reasoning/context, Services = actions/business logic',
      weight: 7,
    },
    {
      id: 'boundary-memory-vs-data-layer',
      category: 'domain-naming',
      question: `We have both "memory" (src/memory/) and "data-layer" (src/services/data-layer/). Is this distinction clear? Memory is semantic/behavioral, data-layer is entity storage?`,
      context: {
        target: 'memory/, services/data-layer/',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Memory = semantic/embeddings, Data-layer = structured entity storage',
      weight: 8,
    },
  ];
}

export const allDomainNamingProbes = [
  ...generateNamingConsistencyProbes(),
  ...generateDomainBoundaryProbes(),
];
