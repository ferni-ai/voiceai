/**
 * Core Types for Voice Agent Architecture
 *
 * These types form the foundation of the clean architecture.
 * All components depend on these abstractions, not concrete implementations.
 *
 * @module agents/core/types
 */

// ============================================================================
// SESSION CONTEXT (Immutable)
// ============================================================================

/**
 * Immutable session context passed to all handlers and pipeline steps.
 *
 * This is the "read-only" view of the session - use SessionState for mutations.
 * Context is built once at session start and enriched through the pipeline.
 */
export interface SessionContext {
  // Identity
  readonly sessionId: string;
  readonly jobId: string;
  readonly roomName: string;

  // User
  readonly userId: string | null;
  readonly userName: string | null;
  readonly userAccent: AccentType;
  readonly isReturningUser: boolean;
  readonly isTrialUser: boolean;

  // Persona
  readonly persona: PersonaConfig;
  readonly systemPrompt: string;

  // Adapters (interfaces, not implementations)
  readonly room: RoomAdapter;
  readonly tts: TTSAdapter;
  readonly llm: LLMAdapter;

  // State (mutable)
  readonly state: SessionState;

  // Services
  readonly services: SessionServices;

  // Feature flags
  readonly flags: SessionFlags;
}

/**
 * Builder pattern for constructing SessionContext incrementally.
 * Used by pipeline steps to add context progressively.
 */
export interface SessionContextBuilder {
  sessionId: string;
  jobId: string;
  roomName: string;

  userId?: string | null;
  userName?: string | null;
  userAccent?: AccentType;
  isReturningUser?: boolean;
  isTrialUser?: boolean;

  persona?: PersonaConfig;
  systemPrompt?: string;

  room?: RoomAdapter;
  tts?: TTSAdapter;
  llm?: LLMAdapter;

  state?: SessionState;
  services?: SessionServices;
  flags?: SessionFlags;

  build: () => SessionContext;
}

// ============================================================================
// SESSION STATE (Mutable)
// ============================================================================

/**
 * Mutable session state - the "single source of truth" for runtime state.
 *
 * All state updates go through this interface, making state changes
 * explicit and trackable. Integrates with SessionStateManager.
 */
export interface SessionState {
  // Turn tracking
  turnCount: number;
  lastUserMessage: string | null;
  lastAgentMessage: string | null;
  lastUserMessageTime: number | null;
  lastAgentMessageTime: number | null;

  // Emotional state
  emotion: EmotionAnalysis | null;
  mood: MoodState | null;

  // Conversation tracking
  currentTopic: string | null;
  mentionedTopics: Set<string>;
  relationshipStage: RelationshipStage;

  // Music state
  musicPlaying: boolean;
  currentTrack: string | null;

  // Feature flags (runtime toggles)
  flags: Map<string, boolean>;

  // Methods
  update: (changes: Partial<Omit<SessionState, 'update' | 'snapshot' | 'flags'>>) => void;
  snapshot: () => Readonly<SessionStateSnapshot>;
  setFlag: (key: string, value: boolean) => void;
  getFlag: (key: string) => boolean;
}

/**
 * Immutable snapshot of session state for serialization/logging.
 */
export interface SessionStateSnapshot {
  turnCount: number;
  lastUserMessage: string | null;
  lastAgentMessage: string | null;
  emotion: EmotionAnalysis | null;
  mood: MoodState | null;
  currentTopic: string | null;
  mentionedTopics: string[];
  relationshipStage: RelationshipStage;
  musicPlaying: boolean;
}

// ============================================================================
// ADAPTER INTERFACES (Ports)
// ============================================================================

/**
 * Room adapter - abstracts LiveKit room operations.
 */
export interface RoomAdapter {
  readonly name: string;
  readonly isConnected: boolean;
  readonly localParticipant: ParticipantAdapter | null;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publishData: (data: Uint8Array, options: { reliable: boolean }) => Promise<void>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
}

/**
 * Participant adapter - abstracts LiveKit participant.
 */
export interface ParticipantAdapter {
  readonly identity: string;
  readonly name: string;
  readonly metadata: string;
}

/**
 * TTS adapter - abstracts text-to-speech operations.
 */
export interface TTSAdapter {
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  switchVoice: (name: string, voiceId: string) => void;
  setSpeed: (multiplier: number) => void;
  getLatency: () => number;
  warmConnection: () => Promise<void>;
}

/**
 * LLM adapter - abstracts language model operations.
 */
export interface LLMAdapter {
  generate: (context: LLMContext) => Promise<LLMResponse>;
  stream: (context: LLMContext) => AsyncIterable<LLMChunk>;
  getModel: () => string;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Persona configuration.
 * Simplified view - full PersonaConfig is in personas/types.ts
 */
export interface PersonaConfig {
  id: string;
  name: string;
  voice: VoiceConfig;
  systemPrompt: string;
  personality?: PersonalityConfig;
  speechCharacteristics?: SpeechCharacteristics;
}

export interface VoiceConfig {
  voiceId: string;
  provider: string;
  speed?: number;
}

export interface PersonalityConfig {
  warmth: number;
  humor: number;
  directness: number;
  energy: number;
}

export interface SpeechCharacteristics {
  baseSpeedMultiplier: number;
  pauseMultiplier: number;
}

/**
 * Emotion analysis result.
 */
export interface EmotionAnalysis {
  primary: EmotionType;
  secondary?: EmotionType;
  intensity: number;
  valence: 'positive' | 'neutral' | 'negative';
  distressLevel: number;
  confidence: number;
}

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'surprised'
  | 'disgusted'
  | 'contemplative'
  | 'anxious'
  | 'excited';

/**
 * Mood state tracking.
 */
export interface MoodState {
  state: 'low' | 'neutral' | 'elevated' | 'high';
  energyLevel: number;
  trajectory: 'improving' | 'stable' | 'declining';
}

/**
 * Relationship stage with user.
 */
export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'trusted_advisor'
  | 'unknown';

/**
 * Supported accent types.
 */
export type AccentType =
  | 'american'
  | 'british'
  | 'australian'
  | 'indian'
  | 'spanish'
  | 'french'
  | 'german'
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'other';

/**
 * Session feature flags.
 */
export interface SessionFlags {
  voiceHumanizationEnabled: boolean;
  musicEnabled: boolean;
  trustSystemsEnabled: boolean;
  celebrationsEnabled: boolean;
  cameoEnabled: boolean;
  debugMode: boolean;
}

/**
 * TTS speak options.
 */
export interface SpeakOptions {
  allowInterruptions?: boolean;
  priority?: 'low' | 'normal' | 'high';
  speed?: number;
}

/**
 * LLM context for generation.
 */
export interface LLMContext {
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  finishReason: 'stop' | 'length' | 'error';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMChunk {
  text: string;
  isComplete: boolean;
}

/**
 * Session services container.
 * Provides access to external services (user profiles, trust systems, etc.)
 *
 * Note: This is the minimal interface. The full SessionServices from
 * services/types.ts includes additional methods like analyze, addTurn, etc.
 * Handlers should check for method existence before calling.
 */
export interface SessionServices {
  userId: string | null;
  sessionId: string;
  userProfile: UserProfile | null;
  trialStatus: TrialStatus | null;

  // Core methods
  captureInsight: (type: string, key: string, value: unknown, confidence: number) => void;
  saveState: () => Promise<void>;

  // Optional methods (may be present on full services object)
  analyze?: (message: string) => unknown;
  addTurn?: (role: 'user' | 'assistant', content: string, durationMs?: number) => void;
  getRecentTurns?: (count?: number) => unknown[];
  getPromptContext?: () => unknown;
  getDynamicContext?: () => unknown;
  getEnhancedPromptContext?: () => string;
  getSpeechContext?: (text?: string, userEmotion?: string) => unknown;
  tagWithSsml?: (text: string, options?: { voiceEmotion?: unknown }) => string;
}

export interface UserProfile {
  userId: string;
  totalConversations: number;
  relationshipStage: RelationshipStage;
  humanizingState?: HumanizingState;
  customData?: Record<string, unknown>;
}

export interface HumanizingState {
  perPersonaMeetingCounts?: Record<string, number>;
  perPersonaLastTopic?: Record<string, string>;
}

export interface TrialStatus {
  isTrialUser: boolean;
  trialEndsAt?: Date;
  conversationsRemaining?: number;
}

// ============================================================================
// HANDLER TYPES
// ============================================================================

/**
 * Generic handler result type.
 * All handlers return this for consistent error handling.
 */
export interface HandlerResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
  cleanup?: () => Promise<void> | void;
}

/**
 * Handler context base - what all handlers receive.
 */
export interface HandlerContext {
  session: SessionContext;
  logger: Logger;
}

/**
 * Logger interface for handlers.
 */
export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, data?: Record<string, unknown>) => void;
}
