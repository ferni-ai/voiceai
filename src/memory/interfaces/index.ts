/**
 * Memory System Interfaces (Clean Architecture)
 *
 * This is the CANONICAL IMPORT POINT for all memory system types.
 * Defines contracts for all memory subsystems.
 * Enables dependency injection, testing, and loose coupling.
 *
 * ARCHITECTURE:
 * - entity-store/types.ts: Core entity types (Person, Place, Event, etc.)
 * - knowledge-graph/types.ts: Graph types (Relationship, Fact, Correlation)
 * - This file: Service interfaces and orchestration contracts
 *
 * Philosophy: The memory system should feel like a caring friend's mind -
 * naturally surfacing relevant context without feeling like a database query.
 *
 * @module memory/interfaces
 */

import type { UserProfile, ConversationSummary, KeyMoment } from '../../types/user-profile.js';
import type { HumanMemory } from '../../types/human-memory.js';

// ============================================================================
// RE-EXPORTS: ENTITY STORE TYPES (Core Entity System)
// ============================================================================

export type {
  // Core entity types
  Entity,
  EntityType,
  EntitySource,
  EntityAttributes,
  EntityProperties,
  ContactInfo,
  TemporalContext,
  // Type-specific attributes
  PersonAttributes,
  PlaceAttributes,
  EventAttributes,
  CommitmentAttributes,
  ValueAttributes,
  DreamAttributes,
  PatternAttributes,
  PreferenceAttributes,
  MemoryAttributes,
  TopicAttributes,
  EmotionAttributes,
  GoalAttributes,
  // Relationships
  RelationshipType as EntityRelationshipType,
  FamilyRelation,
  EdgeType,
  EntityRelationship,
  // Mentions
  EntityMention as EntityStoreMention,
  Mention,
  MentionType,
  ExtractedFact,
  // Search
  EntitySearchOptions,
  EntitySearchResult,
  EntityQuery as EntityStoreQuery,
  EntityQueryResult as EntityStoreQueryResult,
  // Capture
  PersonCaptureInput,
  CaptureContext,
  CaptureResult,
  // Surfacing
  SurfacingOpportunity,
  // Consolidation
  ConsolidationReport,
  // Migration
  MigrationResult,
  LegacyContact,
  LegacyRelationshipPerson,
} from '../entity-store/types.js';

export { createEntity, entityToText, tokenize } from '../entity-store/types.js';

// ============================================================================
// RE-EXPORTS: KNOWLEDGE GRAPH TYPES (Graph Intelligence)
// ============================================================================

export type {
  // Relationship and fact types
  Relationship,
  RelationshipType as KGRelationshipType,
  Fact,
  FactSource,
  // Temporal
  TemporalMention,
  // Correlation
  Correlation,
  CorrelationType,
  // Query types
  EntityQuery as KGEntityQuery,
  EntityQueryResult as KGEntityQueryResult,
  EntityProfile,
  // Consolidation
  ConsolidationResult,
  DecayConfig as KGDecayConfig,
  // Surfacing
  SurfacingRecommendation,
  SurfacingReason,
  // Insights
  InsightType,
  Insight,
  // Threads
  ThreadStatus,
  ThreadSession,
  Thread,
  // Input types
  MentionInput,
  EntityMentionInput,
} from '../knowledge-graph/types.js';

// ============================================================================
// CORE MEMORY TYPES
// ============================================================================

/**
 * A memory item that can be retrieved
 */
export interface MemoryItem {
  id: string;
  type: 'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event';
  content: string;
  timestamp: Date;

  // Scoring factors
  emotionalWeight: number; // 0-1, how emotionally significant
  relevanceDecay: number; // 0-1, how much time has decayed relevance
  baseImportance: number; // 0-1, inherent importance

  // Context
  topics?: string[];
  relatedPersonas?: string[];
  personMentioned?: string;
  commitment?: boolean;

  // Embedding for semantic search
  embedding?: number[];

  // Source reference
  source: {
    collection: string;
    documentId: string;
  };
}

/**
 * Retrieved memory with scoring breakdown
 */
export interface RetrievedMemory {
  item: MemoryItem;
  score: number;
  scoreBreakdown: {
    semantic: number;
    temporal: number;
    emotional: number;
    contextual: number;
    associative?: number;
  };
  reason: string;
  /** How the memory was triggered */
  triggerType?: 'semantic' | 'associative' | 'temporal' | 'emotional' | 'commitment';
}

/**
 * Context for memory retrieval
 */
export interface RetrievalContext {
  query: string;
  currentTopic?: string;
  currentEmotion?: string;
  personaId?: string;
  conversationTurn?: number;
  recentTopics?: string[];
  userMood?: string;
  isSessionStart?: boolean;
  sessionCount?: number;
}

// ============================================================================
// VECTOR STORE INTERFACE
// ============================================================================

export interface VectorDocument {
  id: string;
  text: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  topK?: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

/**
 * Vector store interface for semantic search
 */
export interface VectorStoreContract {
  initialize(): Promise<void>;
  addDocument(doc: VectorDocument): Promise<void>;
  addDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  deleteDocument(id: string): Promise<void>;
  getStats(): Promise<{ documentCount: number; indexedCount: number }>;
}

// ============================================================================
// MEMORY DECAY INTERFACE
// ============================================================================

export interface DecayResult {
  currentStrength: number;
  effectiveHalfLife: number;
  daysSinceAccess: number;
  isProtected: boolean;
  shouldArchive: boolean;
}

export interface DecayConfig {
  baseHalfLifeDays: number;
  emotionalMultiplier: number;
  commitmentProtection: boolean;
  reactivationBoost: number;
  archivalThreshold: number;
}

/**
 * Memory decay manager interface
 */
export interface MemoryDecayService {
  calculateStrength(memory: MemoryItem): DecayResult;
  isProtected(memory: MemoryItem): boolean;
  reactivate(memory: MemoryItem): MemoryItem;
}

// ============================================================================
// RETRIEVAL EXPLAINER INTERFACE
// ============================================================================

export interface ExplainedMemory extends RetrievedMemory {
  naturalExplanation: string;
  connectionStrength: 'strong' | 'moderate' | 'subtle';
  connectionType: ConnectionType;
  suggestedReference: string;
}

export type ConnectionType =
  | 'topic_match'
  | 'emotional_echo'
  | 'person_related'
  | 'commitment'
  | 'continuation'
  | 'pattern'
  | 'milestone'
  | 'time_based'
  | 'associative';

/**
 * Generates natural language explanations for retrieved memories
 */
export interface RetrievalExplainer {
  explain(memory: RetrievedMemory, context: RetrievalContext): ExplainedMemory;
  explainAll(memories: RetrievedMemory[], context: RetrievalContext): ExplainedMemory[];
}

// ============================================================================
// HUMAN SIGNAL EXTRACTOR INTERFACE
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ExtractionContext {
  userId: string;
  personaId: string;
  userName?: string;
  existingMemory?: Partial<HumanMemory>;
  sessionEmotion?: string;
}

export interface ExtractedSignals {
  importantDates: Array<{
    type: string;
    label: string;
    month: number;
    day: number;
    year?: number;
    significance: string;
  }>;
  values: Array<{ value: string; evidence: string[] }>;
  dreams: Array<{ description: string; category: string }>;
  fears: Array<{ fear: string; sensitivity: string }>;
  growthMarkers: Array<{ description: string; before?: string; after?: string }>;
  challenges: Array<{ challenge: string; status: string }>;
  comfortPatterns: Array<{ type: string; effectiveFor: string }>;
  stressTriggers: Array<{ trigger: string; category: string }>;
  insideJokes: Array<{ reference: string; origin: string }>;
  avoidances: Array<{ topic: string; approach: string }>;
}

/**
 * Extracts human-centric memory signals from conversations
 */
export interface HumanSignalExtractor {
  extractSignals(turns: ConversationTurn[], context: ExtractionContext): Promise<ExtractedSignals>;
  mergeWithExisting(
    existing: Partial<HumanMemory>,
    extracted: ExtractedSignals
  ): Partial<HumanMemory>;
}

// ============================================================================
// EMOTIONAL MEMORY INTERFACE
// ============================================================================

export interface EmotionalState {
  recentEmotions: string[];
  unresolvedConcerns: string[];
  celebratableWins: string[];
  emotionalTrend: 'improving' | 'stable' | 'worsening' | 'unknown';
}

export interface BondState {
  warmth: number;
  trust: number;
  protectiveness: number;
  admiration: number;
  concern: number;
  sessionCount: number;
  stage: 'new' | 'building' | 'established' | 'deep';
}

/**
 * Unified emotional memory interface
 */
export interface EmotionalMemoryService {
  recordUserEmotion(
    emotion: string,
    topic: string,
    intensity: 'mild' | 'moderate' | 'strong'
  ): void;
  recordBondEvent(event: string, context?: Record<string, unknown>): void;
  getState(): { user: EmotionalState; bond: BondState };
  formatForPrompt(turnCount: number): string;
}

// ============================================================================
// SESSION PRIMING INTERFACE
// ============================================================================

export interface OpenThread {
  id: string;
  topic: string;
  lastMentioned: Date;
  context: string;
  suggestedOpener: string;
  priority: 'high' | 'medium' | 'low';
  emotionalWeight: number;
}

export interface PendingFollowUp {
  id: string;
  commitment: string;
  madeOn: Date;
  dueDate?: Date;
  naturalPrompt: string;
  urgency: 'overdue' | 'due_soon' | 'future';
}

export interface SessionPrimingResult {
  openThreads: OpenThread[];
  pendingFollowUps: PendingFollowUp[];
  emotionalContext: {
    lastSessionMood: string;
    sessionEndState: 'positive' | 'neutral' | 'heavy' | 'unresolved';
    suggestedTone: string;
    carePoints: string[];
  };
  relationshipContext: {
    sessionCount: number;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastSessionGap: number;
    connectionStrength: number;
  };
  suggestedOpener: string;
  sensitiveTopics: string[];
}

/**
 * Session priming interface for cross-session continuity
 */
export interface SessionPrimer {
  generatePrimingContext(
    profile: UserProfile,
    memories: MemoryItem[],
    recentSummaries: ConversationSummary[]
  ): Promise<SessionPrimingResult>;
}

// ============================================================================
// ASSOCIATIVE MEMORY INTERFACE (NEW)
// ============================================================================

export interface AssociativeTrigger {
  triggerId: string;
  triggerType: 'word' | 'topic' | 'emotion' | 'time' | 'person' | 'situation';
  triggerValue: string;
  linkedMemoryId: string;
  strength: number; // 0-1
  bidirectional: boolean;
  createdAt: Date;
  lastFired: Date;
  fireCount: number;
}

export interface TriggeredMemory {
  memory: MemoryItem;
  trigger: AssociativeTrigger;
  activationStrength: number;
  /** Natural way to reference this triggered memory */
  naturalReference: string;
}

/**
 * Associative memory - models human-like memory triggers
 */
export interface AssociativeMemoryService {
  registerTrigger(
    memoryId: string,
    triggers: Omit<AssociativeTrigger, 'triggerId' | 'createdAt' | 'lastFired' | 'fireCount'>[]
  ): Promise<void>;
  getTriggeredMemories(userText: string, context: RetrievalContext): Promise<TriggeredMemory[]>;
  recordTriggerFired(triggerId: string): Promise<void>;
  getStrongestTriggers(memoryId: string): Promise<AssociativeTrigger[]>;
}

// ============================================================================
// COMMUNICATION PREFERENCES INTERFACE (NEW)
// ============================================================================

export type PreferenceDimension =
  | 'depth' // deep vs light conversation
  | 'pace' // fast vs slow
  | 'directness' // direct questions vs gentle
  | 'humor' // humor when stressed vs seriousness
  | 'memory_callbacks' // likes surprise references vs finds intrusive
  | 'advice_timing' // wants advice immediately vs needs to vent first
  | 'emotional_expression' // explicit emotion talk vs implicit
  | 'structure' // structured advice vs flowing conversation
  | 'validation_first' // needs validation before problem-solving
  | 'check_in_frequency'; // frequent check-ins vs give space

export interface InteractionPreference {
  dimension: PreferenceDimension;
  /** -1 to 1 spectrum (e.g., -1 = very indirect, 1 = very direct) */
  observedPreference: number;
  confidence: number;
  evidence: Array<{
    situation: string;
    ourApproach: string;
    userResponse: 'positive' | 'negative' | 'neutral';
    timestamp: Date;
  }>;
  lastUpdated: Date;
}

export interface ApproachGuidance {
  /** Overall suggested approach */
  approach: 'supportive' | 'direct' | 'curious' | 'playful' | 'gentle' | 'energetic';
  /** Specific dimension guidance */
  dimensions: Record<
    PreferenceDimension,
    {
      suggestion: string;
      confidence: number;
    }
  >;
  /** Things to avoid based on past negative responses */
  avoid: string[];
  /** Things that have worked well */
  embrace: string[];
}

/**
 * Tracks how users prefer to be approached
 */
export interface CommunicationPreferencesService {
  observeInteraction(observation: {
    userId: string;
    dimension: PreferenceDimension;
    ourApproach: string;
    userResponse: string;
    situation: string;
  }): Promise<void>;
  getPreferences(userId: string): Promise<InteractionPreference[]>;
  getApproachGuidance(
    userId: string,
    context: { emotion?: string; topic?: string }
  ): Promise<ApproachGuidance>;
}

// ============================================================================
// BEHAVIORAL PATTERN INTERFACE (NEW)
// ============================================================================

export type PatternType =
  | 'pre_decision_doubt' // User doubts themselves before big decisions
  | 'deflection_processing' // Processes emotions by talking about practical matters
  | 'late_night_vulnerability' // More open late at night
  | 'progress_minimization' // Tends to minimize own progress
  | 'conflict_avoidance' // Avoids discussing conflicts
  | 'future_anxiety' // Gets anxious about future unknowns
  | 'comparison_trap' // Compares self to others negatively
  | 'perfectionism' // Sets impossibly high standards
  | 'help_resistance' // Struggles to accept help
  | 'celebration_deflection'; // Deflects when celebrated

export interface BehavioralPattern {
  patternType: PatternType;
  description: string;
  frequency: number; // times observed
  examples: Array<{
    context: string;
    behavior: string;
    timestamp: Date;
  }>;
  confidence: number;
  implication: string;
  suggestedResponse: string;
  firstObserved: Date;
  lastObserved: Date;
}

/**
 * Detects behavioral patterns across conversations
 */
export interface BehavioralPatternDetector {
  analyzeForPatterns(
    turns: ConversationTurn[],
    existingPatterns: BehavioralPattern[]
  ): Promise<BehavioralPattern[]>;
  getPatterns(userId: string): Promise<BehavioralPattern[]>;
  savePatterns(userId: string, patterns: BehavioralPattern[]): Promise<void>;
  getActivePatternGuidance(
    userId: string,
    currentContext: string
  ): Promise<{
    activePattern: BehavioralPattern | null;
    guidance: string;
  }>;
}

// ============================================================================
// EMOTIONAL THREADING INTERFACE (NEW)
// ============================================================================

export interface EmotionalThread {
  id: string;
  emotion: string;
  topic: string;
  intensity: number;
  status: 'unresolved' | 'processing' | 'resolved';
  firstMentioned: Date;
  lastMentioned: Date;
  sessionCount: number;
  progressNotes: string[];
}

export interface SessionEmotionalContext {
  /** How did last session end emotionally? */
  lastSessionEndState: 'positive' | 'neutral' | 'heavy' | 'unresolved' | 'hopeful';
  /** Active emotional threads */
  activeThreads: EmotionalThread[];
  /** User's emotional trajectory over recent sessions */
  recentTrajectory: 'improving' | 'stable' | 'declining' | 'volatile';
  /** Suggested emotional approach for this session */
  suggestedApproach: {
    openingTone: 'warm' | 'gentle' | 'energetic' | 'calm';
    checkInPriority: 'emotional' | 'practical' | 'connection';
    thingsToAvoid: string[];
    threadToAddress: EmotionalThread | null;
  };
}

/**
 * Tracks emotional continuity across sessions
 */
export interface EmotionalThreadingService {
  recordSessionEnd(context: {
    dominantEmotion: string;
    endState: SessionEmotionalContext['lastSessionEndState'];
    unresolvedTopics: string[];
  }): Promise<void>;
  getSessionContext(userId: string): Promise<SessionEmotionalContext>;
  updateThread(userId: string, threadId: string, update: Partial<EmotionalThread>): Promise<void>;
  resolveThread(userId: string, threadId: string, resolution: string): Promise<void>;
}

// ============================================================================
// MEMORY ORCHESTRATOR INTERFACE (NEW)
// ============================================================================

export interface OrchestratedMemory {
  /** Primary memories to inject into context */
  primaryMemories: ExplainedMemory[];
  /** Suggested callbacks (use naturally, not mechanically) */
  callbacks: Array<{
    memory: ExplainedMemory;
    suggestedReference: string;
    timing: 'opening' | 'when_relevant' | 'closing';
    priority: number;
  }>;
  /** Session priming (for session start) */
  priming: SessionPrimingResult | null;
  /** Emotional context */
  emotional: {
    userState: EmotionalState;
    bondState: BondState;
    threads: EmotionalThread[];
    approachGuidance: ApproachGuidance | null;
  };
  /** Active behavioral patterns to be aware of */
  activePatterns: BehavioralPattern[];
  /** Formatted context string ready for prompt injection */
  formattedContext: string;
}

export interface RecallContext extends RetrievalContext {
  userId: string;
  profile: UserProfile;
  /** Recent summaries for priming */
  recentSummaries?: ConversationSummary[];
}

/**
 * Unified memory orchestrator - single entry point for all memory operations
 */
export interface MemoryOrchestrator {
  recall(context: RecallContext): Promise<OrchestratedMemory>;
  recordInteraction(context: {
    userId: string;
    turns: ConversationTurn[];
    sessionEmotion?: string;
    personaId: string;
  }): Promise<void>;
  getMemoryHealth(userId: string): Promise<{
    totalMemories: number;
    recentMemories: number;
    strongMemories: number;
    emotionalMemories: number;
    commitments: number;
  }>;
}

// ============================================================================
// NATURAL REFERENCE GENERATOR INTERFACE (NEW)
// ============================================================================

export interface ReferenceStyle {
  style: 'casual' | 'warm' | 'gentle' | 'curious' | 'playful' | 'reflective';
  templates: string[];
}

export interface GeneratedReference {
  reference: string;
  style: ReferenceStyle['style'];
  confidence: number;
  alternatives: string[];
}

/**
 * Generates natural-sounding memory references
 */
export interface NaturalReferenceGenerator {
  generate(
    memory: RetrievedMemory,
    context: {
      userMood: string;
      relationshipStage: string;
      personaId: string;
      conversationTone: string;
    }
  ): GeneratedReference;
  getStyleForContext(context: {
    userMood: string;
    personaStyle: string;
    memoryType: MemoryItem['type'];
  }): ReferenceStyle['style'];
}

// ============================================================================
// MEMORY CONTAINER (DI)
// ============================================================================

export interface MemoryContainer {
  vectorStore: VectorStoreContract;
  decay: MemoryDecayService;
  explainer: RetrievalExplainer;
  signalExtractor: HumanSignalExtractor;
  emotionalMemory: EmotionalMemoryService;
  sessionPrimer: SessionPrimer;
  associativeMemory: AssociativeMemoryService;
  communicationPreferences: CommunicationPreferencesService;
  patternDetector: BehavioralPatternDetector;
  emotionalThreading: EmotionalThreadingService;
  referenceGenerator: NaturalReferenceGenerator;
  orchestrator: MemoryOrchestrator;
}

export interface MemoryContainerConfig {
  userId: string;
  personaId?: string;
  usePersistentStore?: boolean;
  decayConfig?: Partial<DecayConfig>;
}
