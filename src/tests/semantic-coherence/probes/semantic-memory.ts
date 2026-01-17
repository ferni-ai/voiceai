/**
 * Semantic Memory Organization Probes
 *
 * Tests whether the memory system is organized in ways that
 * make semantic retrieval intuitive and effective.
 */

import type { SemanticProbe } from '../types.js';
import { CORE_PRINCIPLES } from '../types.js';

/**
 * Memory retrieval logic probes
 */
export function generateMemoryRetrievalProbes(): SemanticProbe[] {
  return [
    {
      id: 'memory-retrieval-by-emotion',
      category: 'semantic-memory',
      question: `If a user says "I feel like I did when my dog died", can the memory system retrieve emotionally similar past moments? Is this retrieval path intuitive in the code?`,
      context: {
        target: 'memory/emotional-memory-unified.ts, memory/emotional-threading.ts',
        relatedModules: ['semantic-rag.ts', 'advanced-retrieval.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.BETTER_THAN_HUMAN, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'Emotional retrieval should be a first-class operation',
      weight: 9,
    },
    {
      id: 'memory-retrieval-by-relationship',
      category: 'semantic-memory',
      question: `If a user mentions "my sister", can the system retrieve all memories involving that relationship? Is the path from mention → relationship → memories clear?`,
      context: {
        target: 'services/contacts/, memory/associative-memory.ts, services/relationship-network/',
        philosophyPrinciples: [CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION],
      },
      expectedAlignment: 'Relationship-centric memory retrieval',
      weight: 8,
    },
    {
      id: 'memory-retrieval-by-time-context',
      category: 'semantic-memory',
      question: `If a user says "that thing we talked about last Tuesday", is there a clear retrieval path? Does the naming make temporal retrieval discoverable?`,
      context: {
        target: 'memory/key-moment-retrieval.ts, memory/retrieval-explanations.ts',
        relatedModules: ['session-priming.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Temporal + context retrieval should be clear',
      weight: 7,
    },
    {
      id: 'memory-retrieval-by-topic',
      category: 'semantic-memory',
      question: `If a user wants to recall "everything about my career change", is there a semantic topic-based retrieval? Is it named intuitively?`,
      context: {
        target: 'memory/semantic-rag.ts, intelligence/topic-awareness.ts',
        relatedModules: ['life-chapter.ts'],
        philosophyPrinciples: [CORE_PRINCIPLES.BETTER_THAN_HUMAN],
      },
      expectedAlignment: 'Topic/theme-based memory clustering',
      weight: 8,
    },
  ];
}

/**
 * Memory organization structure probes
 */
export function generateMemoryOrganizationProbes(): SemanticProbe[] {
  return [
    {
      id: 'memory-org-vector-vs-structured',
      category: 'semantic-memory',
      question: `The system has both vector storage (embeddings) and structured storage (Firestore entities). Is the distinction clear? When would you use each?`,
      context: {
        target: 'memory/firestore-vector-store/, memory/firestore-store.ts',
        relatedModules: ['embeddings.ts', 'services/data-layer/'],
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Vector = semantic/fuzzy search, Structured = exact entity lookup',
      weight: 8,
    },
    {
      id: 'memory-org-consolidation',
      category: 'semantic-memory',
      question: `Memory consolidation merges related memories over time. Is "memory-consolidator.ts" the right name? Does the organization show the consolidation pipeline?`,
      context: {
        target:
          'memory/memory-consolidator.ts, memory/memory-deduplication.ts, memory/lsh-deduplication.ts',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Clear consolidation pipeline: raw → dedupe → merge',
      weight: 6,
    },
    {
      id: 'memory-org-decay',
      category: 'semantic-memory',
      question: `"memory-decay.ts" handles memory aging. Does this name accurately describe what it does? Is decay the right metaphor?`,
      context: {
        target: 'memory/memory-decay.ts',
        actualBehavior: 'Reduces relevance of older, less-accessed memories over time',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Decay implies gradual fading, not deletion',
      weight: 5,
    },
    {
      id: 'memory-org-priming',
      category: 'semantic-memory',
      question: `"session-priming.ts" prepares relevant memories at session start. Is "priming" the right cognitive metaphor? Would "preloading" or "warming" be clearer?`,
      context: {
        target: 'memory/session-priming.ts',
        actualBehavior: 'Preloads relevant memories and context before conversation',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY, CORE_PRINCIPLES.HUMAN_FIRST],
      },
      expectedAlignment: 'Priming is a cognitive science term - appropriate for AI system',
      weight: 4,
    },
  ];
}

/**
 * Memory-to-persona connection probes
 */
export function generateMemoryPersonaProbes(): SemanticProbe[] {
  return [
    {
      id: 'memory-persona-specialization',
      category: 'semantic-memory',
      question: `Each persona has specialized knowledge needs. Is there a clear path from persona → memory type? E.g., Peter needs financial history, Maya needs habit patterns.`,
      context: {
        target:
          'intelligence/context-builders/personas/peter-research-insights.ts, intelligence/context-builders/personas/maya-coaching-insights.ts',
        relatedModules: ['services/superhuman/', 'memory/behavioral-pattern-detector.ts'],
        actualBehavior:
          'Persona-specific context builders live in intelligence/context-builders/personas/ and are loaded based on active persona. Each builder retrieves domain-specific memory: Peter gets financial patterns, Maya gets habit health metrics, Jordan gets milestone data.',
        philosophyPrinciples: [CORE_PRINCIPLES.DISCOVERABLE_ARCHITECTURE],
      },
      expectedAlignment: 'Persona-specific memory retrieval paths',
      weight: 8,
    },
    {
      id: 'memory-persona-handoff',
      category: 'semantic-memory',
      question: `When a user transfers from Ferni to Peter, what memory context transfers? Is this "handoff memory" clearly represented in the codebase?`,
      context: {
        target:
          'services/handoff/handoff-state.ts, services/cross-persona-insights.ts, intelligence/context-builders/team-awareness.ts',
        actualBehavior:
          'HandoffState preserves: conversationContext, lastUserMessageForMood, lastEmotionAnalysisForMood, metPersonas, perPersonaLastTopic. Cross-persona-insights provides three insight types: HANDOFF INSIGHTS (what to tell receiving persona), PROACTIVE INSIGHTS (surfaced during conversations), CROSS-TEAM BRIEFINGS (background context). This ensures both task AND emotional/relational context transfer during handoffs.',
        philosophyPrinciples: [CORE_PRINCIPLES.RELATIONSHIP_OVER_TRANSACTION],
      },
      expectedAlignment:
        'Handoff preserves emotional and relational context, not just task context',
      weight: 7,
    },
  ];
}

/**
 * Memory performance and caching probes
 */
export function generateMemoryPerformanceProbes(): SemanticProbe[] {
  return [
    {
      id: 'memory-perf-cache-naming',
      category: 'semantic-memory',
      question: `We have "semantic-memory-cache.ts", "embedding-cache.ts", "predictive-cache-warming.ts". Is the caching strategy clear from these names?`,
      context: {
        target:
          'memory/semantic-memory-cache.ts, memory/embedding-cache.ts, memory/predictive-cache-warming.ts',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY],
      },
      expectedAlignment: 'Clear cache hierarchy and warming strategy',
      weight: 5,
    },
    {
      id: 'memory-perf-rust-accelerator',
      category: 'semantic-memory',
      question: `"rust-accelerator.ts" handles Rust-based optimization. Is this name descriptive enough? Should it be split or renamed?`,
      context: {
        target: 'memory/rust-accelerator.ts',
        relatedModules: ['memory/__tests__/rust-accelerator-advanced.test.ts'],
        actualBehavior:
          'rust-accelerator.ts (2310 lines) is a cohesive SIMD optimization module that bridges TypeScript to Rust native code via NAPI. It handles: (1) Cosine similarity operations, (2) LSH deduplication with parallel signature computation, (3) Batch text similarity with parallel shingle computation, (4) Batch tool scoring with parallel regex + SIMD embeddings. The file is appropriately sized for a single-purpose optimization layer, with clear type definitions and well-documented performance characteristics. Splitting would fragment the Rust bridge unnecessarily.',
        philosophyPrinciples: [CORE_PRINCIPLES.SEMANTIC_CLARITY, CORE_PRINCIPLES.BETTER_THAN_HUMAN],
      },
      expectedAlignment:
        'Name is semantic: "rust" = implementation, "accelerator" = purpose. File size is appropriate for cohesive optimization layer.',
      weight: 6,
    },
  ];
}

export const allSemanticMemoryProbes = [
  ...generateMemoryRetrievalProbes(),
  ...generateMemoryOrganizationProbes(),
  ...generateMemoryPersonaProbes(),
  ...generateMemoryPerformanceProbes(),
];
