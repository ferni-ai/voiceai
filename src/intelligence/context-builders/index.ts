/**
 * Context Builder Orchestrator
 *
 * Modular system for building conversational context injections.
 *
 * NOTE: This is a simplified implementation that provides basic
 * context building functionality.
 */

import type { PersonaConfig } from '../../personas/types.js';
import type { UserProfile } from '../../types/user-profile.js';

// Logger interface for safe logging
interface SimpleLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Safe logger that returns a no-op if not initialized yet (module load time)
let cachedLog: SimpleLogger | null = null;
const getLogger = () => {
  if (cachedLog) return cachedLog;
  // Return no-op logger for synchronous access
  // The actual logger will be set asynchronously if available
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
};

// Try to initialize the logger asynchronously
void (async () => {
  try {
    const agents = await import('@livekit/agents');
    const agentLog = agents.log();
    // Wrap the agent logger to match our SimpleLogger interface
    cachedLog = {
      debug: (...args: unknown[]) => agentLog.debug(String(args[0]), ...(args.slice(1) as [])),
      info: (...args: unknown[]) => agentLog.info(String(args[0]), ...(args.slice(1) as [])),
      warn: (...args: unknown[]) => agentLog.warn(String(args[0]), ...(args.slice(1) as [])),
      error: (...args: unknown[]) => agentLog.error(String(args[0]), ...(args.slice(1) as [])),
    };
  } catch {
    // Logger not available
  }
})();

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
  /** Memory references already made this session (prevents repetition) */
  referencedMemories?: string[];
  /** Whether we've already referenced the last conversation topic */
  hasReferencedLastConversation?: boolean;
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
export type { PersonaConfig, UserProfile };

// ============================================================================
// REGISTRY
// ============================================================================

const builders = new Map<string, ContextBuilder>();

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

/**
 * BETTER-THAN-HUMAN: High priority for important trust signals
 * Use this for emotional mismatch detection and similar "superhuman" insights
 */
export function createHighInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'high', options);
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

/**
 * Format context injections for the LLM prompt
 *
 * BETTER-THAN-HUMAN: In high-emotion moments, we reduce noise by filtering out
 * lower-priority context. This helps the AI focus on what matters most.
 */
export function formatContextForPrompt(
  injections: ContextInjection[],
  options?: {
    maxLength?: number;
    includeHints?: boolean;
    /** BETTER-THAN-HUMAN: If true, only include critical/high priority context */
    highEmotionMode?: boolean;
  }
): string {
  const maxLength = options?.maxLength ?? 4000;
  const includeHints = options?.includeHints ?? true;
  const highEmotionMode = options?.highEmotionMode ?? false;

  // BETTER-THAN-HUMAN: In high emotion mode, filter aggressively
  // Only keep critical and high priority context
  let filtered: ContextInjection[];
  if (highEmotionMode) {
    filtered = injections.filter((i) => i.priority === 'critical' || i.priority === 'high');
  } else {
    filtered = injections.filter((i) => includeHints || i.priority !== 'hint');
  }

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

/**
 * BETTER-THAN-HUMAN: Determine if we should use high-emotion mode
 *
 * High emotion mode reduces context noise when the user needs focused support.
 */
export function shouldUseHighEmotionMode(analysis: ConversationAnalysis): boolean {
  // High emotion mode triggers:
  // 1. User needs support
  // 2. High distress level (> 0.7)
  // 3. High emotion intensity (> 0.8)
  // 4. Mental health signals detected
  return Boolean(
    analysis.emotion.needsSupport ||
    (analysis.emotion.distressLevel && analysis.emotion.distressLevel > 0.7) ||
    analysis.emotion.intensity > 0.8 ||
    (analysis.emotion.mentalHealthSignals && analysis.emotion.mentalHealthSignals.length > 0)
  );
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

  // NOTE: Removed duplicate lastConversationSummary injection here.
  // This is now handled ONLY in memory.ts context builder to prevent
  // the LLM from seeing the same information multiple times and
  // repeatedly referencing it. See memory.ts getCrossSessionMemory().

  // Run all registered builders IN PARALLEL for better performance
  // Each builder is independent and can run concurrently
  const registeredBuilders = getRegisteredBuilders();
  const builderResults = await Promise.allSettled(
    registeredBuilders.map((builder) => builder.build(input))
  );

  // Collect results, logging any failures
  builderResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      injections.push(...result.value);
    } else {
      getLogger().warn(
        { builder: registeredBuilders[index].name, error: result.reason },
        'Context builder failed'
      );
    }
  });

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
      import('./cognitive.js'), // Persona-specific cognitive intelligence
      import('./cognitive-quirks.js'), // Cognitive quirks, mental habits, thought patterns
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
      import('./advanced-memory.js'), // Semantic memory with temporal decay & emotional salience
      import('./trust-context.js'), // "Better than human" trust: unsaid signals, boundaries, growth, callbacks
      import('./rag.js'),
      import('./situational-awareness.js'), // "What's going on?" awareness
      import('./storytelling.js'),
      import('./tasks.js'),
      import('./team-availability.js'), // Which team members are unlocked for this user
      import('./team-dynamics.js'), // Cross-persona team awareness
      import('./cameo-opportunities.js'), // Team member "pop-in" cameo suggestions
      import('./topics.js'),
      import('./engagement-context.js'), // Daily rituals, games, team engagement
      import('./voice-emotion.js'), // Voice emotion → cognitive state integration
      import('./cognitive-insights.js'), // Shareable cognitive insights for transparency
      import('./game-context.js'), // 🎮 Active game state for music games
      // 🧠 Humanizing behaviors - make Ferni feel more human
      import('./natural-uncertainty.js'), // "I'm not sure", "let me think" - genuine uncertainty
      import('./response-length.js'), // Sometimes brief, sometimes elaborate
      import('./energy-mirroring.js'), // Match user's energy level
      import('./ferni-personality.js'), // Genuine preferences, opinions, quirks
      import('./lovable-presence.js'), // 💕 Orchestrates charm, delight, personality surprises
      // 🎓 Better-than-PhD capabilities
      import('./cognitive-distortions.js'), // Detect cognitive distortions, Socratic intervention
      import('./somatic-context.js'), // Grounding & breathing when distressed
      import('./wellbeing-context.js'), // Continuous wellbeing tracking & alerts
      import('./therapeutic-frameworks.js'), // ACT, DBT, MI frameworks
      import('./behavioral-economics.js'), // Implementation intentions, commitment devices
      // ============================================================================
      // 🚀 FERNI 200% - Superhuman capabilities
      // ============================================================================
      import('./superhuman-insights.js'), // Pattern surfacing, the mirror, emotional weather, anticipation
      import('./persona-identity.js'), // Core persona identity injection
      import('./meta-conversation.js'), // Topic repetition, emotional shifts
      import('./cross-session-reflection.js'), // Cross-session continuity
      import('./cross-session-threading.js'), // Open threads/promises from previous sessions
      import('./role-boundaries.js'), // Domain ownership and handoff triggers
      import('./spontaneous-vulnerability.js'), // Spontaneous vulnerability moments
      import('./persona-vulnerability.js'), // 200% persona vulnerability (self-doubt, fears, mortality)
      import('./voice-emotion-intelligence.js'), // Voice emotion → cognitive state (enhanced)
      import('./relationship-behaviors.js'), // Relationship-aware behaviors
      import('./persona-mood.js'), // Persona mood state
      import('./alive-awareness.js'), // "Alive" presence features
      import('./inner-world-injector.js'), // Inner world/self-talk
      // 📊 Cross-user learning (privacy-preserving)
      import('./wisdom-synthesis.js'), // Population-level wisdom from anonymized patterns
      // 🎧 Better-than-human listening
      import('./human-listening.js'), // Voice tremor, breath patterns, cognitive load, hedging
      // ============================================================================
      // 🎭 DEEP HUMANIZATION - Make Ferni feel ALIVE
      // ============================================================================
      import('./deep-humanization.js'), // Arc-awareness, artifacts, monologue, vocabulary
      // ============================================================================
      // 🦸 BETTER-THAN-HUMAN APIs - Superhuman awareness from external data
      // ============================================================================
      import('./biometrics.js'), // HRV, sleep, recovery from wearables
      import('./financial-prediction.js'), // Cash flow, spending anomalies, bill forecasting
      import('./advanced-voice-emotion.js'), // Hume AI precise emotion detection
      import('./anticipation.js'), // Location/calendar awareness, travel time, event prep
      import('./social-relationships.js'), // Social graph, relationship patterns, important dates
      // ============================================================================
      // 🧑‍🏫 LIFE COACHING CAPABILITIES
      // ============================================================================
      import('./coaching-context.js'), // Goals, actions, obstacles, values, style, journey, team
      import('./life-coaching-context.js'), // Second chances, connection, difficult conversations, transitions, quiet growth
      // ============================================================================
      // 🎉 BETTER-THAN-HUMAN: CELEBRATION & GROWTH
      // ============================================================================
      import('./celebration-growth.js'), // Systematic celebration & growth visibility
      import('./pattern-surfacing.js'), // Surface patterns user can't see about themselves
      // ============================================================================
      // 🌍 WORLD AWARENESS - "Better Than Human" knows the world
      // ============================================================================
      import('./world-awareness.js'), // Weather, news, sports, holidays - pre-fetched
      // ============================================================================
      // 🌟 PERSONAL JOURNEY - "Better Than Human" remembers YOUR journey
      // ============================================================================
      import('./personal-journey.js'), // Rhythm, milestones, seasonal memory, chapters
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
