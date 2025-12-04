/**
 * Context Builder Orchestrator
 *
 * Modular system for building conversational context injections.
 *
 * NOTE: This is a simplified implementation that provides basic
 * context building functionality.
 */

import type { UserProfile } from '../../types/user-profile.js';
import type { PersonaConfig } from '../../personas/types.js';

// Safe logger that returns a no-op if not initialized yet (module load time)
const getLogger = () => {
  try {
    const { log } = require('@livekit/agents');
    return log();
  } catch {
    // Logger not initialized yet, return no-op logger
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }
};

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationAnalysis {
  emotion: {
    primary: string;
    intensity: number;
    secondaryEmotions?: string[];
    needsSupport?: boolean;
    isVenting?: boolean;
    isProcessing?: boolean;
    mentalHealthSignals?: string[];
    confidence?: number;
    distressLevel?: number;
    valence?: 'positive' | 'negative' | 'neutral';
    markers?: string[];
    suggestedTone?: string;
  };
  intent: {
    primary: string;
    confidence: number;
    entities?: Record<string, unknown>;
    isQuestion?: boolean;
    isFollowUp?: boolean;
    requiresEmpathy?: boolean;
    requiresAction?: boolean;
    suggestedApproach?: string;
  };
  topics: {
    detected: string[];
    primary?: string | null;
    trending?: string[];
    sentiment?: Record<string, number>;
    isTopicShift?: boolean;
  };
  state: {
    phase: string;
    trustLevel?: number;
    engagementLevel?: number;
    distressLevel?: number;
    currentMood?: string;
  };
}

/**
 * Minimal SessionServices interface for context builders.
 *
 * This is a SUBSET of the full SessionServices from services/index.ts.
 * Context builders only need these fields to operate. The full SessionServices
 * interface is structurally compatible with this, so passing the real
 * SessionServices object works due to TypeScript's structural typing.
 *
 * @see services/index.ts for the full SessionServices interface
 */
export interface SessionServices {
  sessionId: string;
  userId?: string;
  sessionStartTime: number;
  userProfile: UserProfile | null;

  // Methods used by context builders
  searchKnowledge?: (query: string) => Promise<string | null>;
  searchPastConversations?: (query: string) => Promise<string | null>;
  getEnhancedPromptContext?: () => string;
  trackResponseQuality?: (response: string, reaction: 'positive' | 'neutral' | 'negative') => void;

  // Learning engine access (for memory context builder)
  learningEngine?: {
    getProactiveInsight: (profile: UserProfile | null, turnCount: number) => string | null;
  };

  // History tracker (for memory context builder)
  historyTracker?: {
    getSimpleTurns: () => Array<{ role: string; content: string }>;
    getTurnCount: () => number;
  };

  // Current persona ID (for persona memory context builder)
  personaId?: string;
}

export interface VoiceEmotionResult {
  emotion: string;
  confidence: number;
  speechRate?: number;
  pitch?: number;
}

export interface SessionRecoveryState {
  wasDisconnected?: boolean;
  disconnectedAt?: Date | null; // Match conversation-quality.ts definition
  recoveryGreeting?: string;
}

export interface ExtractedDetail {
  type:
    | 'user_name'
    | 'person_name'
    | 'pet_name'
    | 'place'
    | 'company'
    | 'date'
    | 'amount'
    | 'other';
  value: string;
}

export interface ContextUserData {
  userName?: string;
  name?: string;
  isReturningUser?: boolean;
  sessionDurationMs?: number;
  turnCount?: number;
  lastTopic?: string;
  recentTopics?: string[];
  currentPersona?: string;
  keyMoments?: Array<{ summary: string; timestamp: Date }>;
  lastPacingScore?: number;
  sessionRecoveryState?: SessionRecoveryState;
  storiesShared?: string[];
  lastPhysicalNote?: string;
  extractedDetails?: ExtractedDetail[];
  lastNameUsed?: number;
}

export interface ContextBuilderInput {
  userText: string;
  analysis: ConversationAnalysis;
  services: SessionServices;
  userData: ContextUserData;
  userProfile: UserProfile | null;
  persona: PersonaConfig;
  voiceEmotion?: VoiceEmotionResult;
  /** Bundle runtime for accessing rich persona content (quirks, inner world, etc.) */
  bundleRuntime?: import('../../personas/bundles/runtime.js').BundleRuntimeEngine;
}

export type ContextPriority = 'critical' | 'high' | 'standard' | 'hint';

export interface ContextInjection {
  id: string;
  source: string;
  content: string;
  priority: ContextPriority;
  category?: string;
  confidence?: number;
}

export interface ContextBuilder {
  name: string;
  description: string;
  priority: number;
  build: (input: ContextBuilderInput) => Promise<ContextInjection[]>;
}

export interface ContextBuilderMetrics {
  name: string;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  injectionsProduced: number;
  lastCallTimestamp?: number;
}

// Re-export imported types
export type { UserProfile, PersonaConfig };

// ============================================================================
// REGISTRY
// ============================================================================

const builders: Map<string, ContextBuilder> = new Map();

/**
 * Register a context builder.
 *
 * Supports two call signatures for backward compatibility:
 * 1. registerContextBuilder(builder: ContextBuilder) - new style
 * 2. registerContextBuilder(name: string, buildFn: Function) - legacy style
 */
export function registerContextBuilder(
  builderOrName: ContextBuilder | string,
  buildFn?: (input: ContextBuilderInput) => Promise<ContextInjection[]> | ContextInjection[]
): void {
  if (typeof builderOrName === 'string') {
    // Legacy call: registerContextBuilder('name', buildFn)
    if (!buildFn) {
      throw new Error(`registerContextBuilder('${builderOrName}') called without a build function`);
    }
    const legacyBuilder: ContextBuilder = {
      name: builderOrName,
      description: `Context builder: ${builderOrName}`,
      priority: 50, // Default priority
      build: async (input) => {
        const result = buildFn(input);
        return result instanceof Promise ? result : Promise.resolve(result);
      },
    };
    builders.set(builderOrName, legacyBuilder);
    getLogger().debug(`Registered context builder (legacy): ${builderOrName}`);
  } else {
    // New style: registerContextBuilder(builder)
    builders.set(builderOrName.name, builderOrName);
    getLogger().debug(`Registered context builder: ${builderOrName.name}`);
  }
}

export function getRegisteredBuilders(): ContextBuilder[] {
  return Array.from(builders.values()).sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// INJECTION HELPERS
// ============================================================================

let counter = 0;

export function createInjection(
  source: string,
  content: string,
  priority: ContextPriority,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return {
    id: `${source}_${++counter}`,
    source,
    content,
    priority,
    category: options?.category,
    confidence: options?.confidence ?? 1.0,
  };
}

export function createCriticalInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'critical', options);
}

export function createStandardInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'standard', options);
}

export function createHintInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'hint', options);
}

// ============================================================================
// FORMATTING
// ============================================================================

const PRIORITY_ORDER: Record<ContextPriority, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  hint: 1,
};

export function formatContextForPrompt(
  injections: ContextInjection[],
  options?: { maxLength?: number; includeHints?: boolean }
): string {
  const maxLength = options?.maxLength ?? 4000;
  const includeHints = options?.includeHints ?? true;

  let filtered = injections.filter((i) => includeHints || i.priority !== 'hint');
  filtered.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);

  const sections: string[] = [];
  let currentLength = 0;

  for (const injection of filtered) {
    const section = injection.content.trim();
    if (currentLength + section.length + 2 > maxLength) {
      if (injection.priority === 'hint') continue;
      break;
    }
    sections.push(section);
    currentLength += section.length + 2;
  }

  return sections.join('\n\n');
}

// ============================================================================
// MAIN CONTEXT BUILDING
// ============================================================================

/**
 * Build conversation context from all registered builders
 */
export async function buildConversationContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  // Ensure all builder modules are loaded (lazy loading)
  await ensureBuildersLoaded();

  const injections: ContextInjection[] = [];

  // Basic emotional context
  if (
    input.analysis.emotion.needsSupport ||
    (input.analysis.emotion.distressLevel && input.analysis.emotion.distressLevel > 0.6)
  ) {
    injections.push(
      createCriticalInjection(
        'emotional',
        `User seems to be going through something difficult. Be extra supportive and empathetic.`,
        { category: 'emotional' }
      )
    );
  }

  // User name context
  const userName = input.userData.userName || input.userData.name || input.userProfile?.name;
  if (userName) {
    injections.push(
      createHintInjection(
        'personalization',
        `User's name is ${userName}. Use it occasionally but naturally.`,
        { category: 'personalization' }
      )
    );
  }

  // Returning user context
  if (input.userData.isReturningUser && input.userProfile) {
    const lastTopic = input.userProfile.lastConversationSummary;
    if (lastTopic) {
      injections.push(
        createHintInjection('memory', `Returning user. Last time you talked about: ${lastTopic}`, {
          category: 'memory',
        })
      );
    }
  }

  // Run any registered builders
  const registeredBuilders = getRegisteredBuilders();
  for (const builder of registeredBuilders) {
    try {
      const builderInjections = await builder.build(input);
      injections.push(...builderInjections);
    } catch (error) {
      getLogger().warn({ builder: builder.name, error }, 'Context builder failed');
    }
  }

  return injections;
}

/**
 * Build context with metrics tracking
 */
export async function buildConversationContextWithMetrics(
  input: ContextBuilderInput
): Promise<{ injections: ContextInjection[]; metrics: Record<string, number> }> {
  const start = Date.now();
  const injections = await buildConversationContext(input);
  const duration = Date.now() - start;

  return {
    injections,
    metrics: {
      totalDurationMs: duration,
      injectionCount: injections.length,
      builderCount: builders.size,
    },
  };
}

// ============================================================================
// AUTO-LOAD ALL CONTEXT BUILDERS
// ============================================================================
// Dynamic imports to avoid initialization order issues.
// Each module calls registerContextBuilder() when loaded.

let buildersLoaded = false;

/**
 * Lazily load all context builder modules.
 * Called on first buildConversationContext() invocation.
 */
async function ensureBuildersLoaded(): Promise<void> {
  if (buildersLoaded) return;
  buildersLoaded = true;

  try {
    await Promise.all([
      import('./celebration.js'),
      import('./community-learning.js'), // Collective learning from all users
      import('./conversation-recap.js'), // "Where were we?" memory
      import('./crisis.js'),
      import('./discovery.js'),
      import('./emotional.js'),
      import('./energy-awareness.js'), // Time-of-day energy levels
      import('./engagement.js'),
      import('./goodbye.js'),
      import('./handoff.js'),
      import('./humanizing.js'),
      import('./intent.js'),
      import('./memory.js'),
      import('./music.js'),
      import('./pacing.js'),
      import('./persona-memory.js'), // Persona-specific memories
      import('./persona-quirks.js'), // Quirks surface naturally in conversation
      import('./persona-playful.js'),
      import('./personal.js'),
      import('./physical-presence.js'), // Embodied persona presence
      import('./proactive-memory.js'), // Spontaneous memory recall & voice recognition
      import('./rag.js'),
      import('./situational-awareness.js'), // "What's going on?" awareness
      import('./storytelling.js'),
      import('./tasks.js'),
      import('./team-dynamics.js'), // Cross-persona team awareness
      import('./topics.js'),
    ]);

    getLogger().info(`Context builders loaded: ${builders.size} registered`);
  } catch (error) {
    getLogger().warn({ error }, 'Some context builders failed to load');
  }
}

// ============================================================================
// CONVERSATION HUMANIZING CONTEXT BUILDER
// ============================================================================
// Export for direct use in voice-agent.ts

export {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
  getHumanizingSummary as getConversationHumanizingSummary,
} from './conversation-humanizing.js';
