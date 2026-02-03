/**
 * PersonaPlex Integration Types
 *
 * Type definitions for PersonaPlex voice-to-voice integration.
 */

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface PersonaPlexConfig {
  /** WebSocket URL for PersonaPlex server */
  url: string;
  /** Directory containing voice prompt files */
  voicePromptDir: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs?: number;
  /** Audio sample rate (default: 24000) */
  sampleRate?: number;
}

export interface PersonaPlexConnectionOptions {
  /** Voice prompt filename (e.g., 'ferni.pt' or 'NATM1.pt') */
  voicePrompt: string;
  /** Text prompt for persona/role */
  textPrompt: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Audio temperature (0-1) */
  audioTemperature?: number;
  /** Text temperature (0-1) */
  textTemperature?: number;
  /** Text top-k sampling */
  textTopK?: number;
  /** Audio top-k sampling */
  audioTopK?: number;
}

// =============================================================================
// VOICE EMBEDDING TYPES
// =============================================================================

export interface VoiceEmbeddingConfig {
  /** Persona ID */
  personaId: string;
  /** Cartesia voice ID for generating samples */
  cartesiaVoiceId: string;
  /** Output filename for .pt embedding */
  embeddingFilename: string;
  /** Fallback PersonaPlex voice if embedding not available */
  fallbackVoice: PersonaPlexVoice;
  /** Sample text to generate for voice embedding */
  sampleText: string;
}

export type PersonaPlexVoice =
  | 'NATF0'
  | 'NATF1'
  | 'NATF2'
  | 'NATF3' // Natural female
  | 'NATM0'
  | 'NATM1'
  | 'NATM2'
  | 'NATM3' // Natural male
  | 'VARF0'
  | 'VARF1'
  | 'VARF2'
  | 'VARF3'
  | 'VARF4' // Variety female
  | 'VARM0'
  | 'VARM1'
  | 'VARM2'
  | 'VARM3'
  | 'VARM4'; // Variety male

export interface VoiceEmbeddingResult {
  personaId: string;
  embeddingPath: string;
  duration: number;
  success: boolean;
  error?: string;
}

// =============================================================================
// CLIENT TYPES
// =============================================================================

export type PersonaPlexConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'handshake'
  | 'connected'
  | 'error';

export interface PersonaPlexMessage {
  type: 'audio' | 'text' | 'handshake' | 'error';
  data?: Uint8Array | string;
  timestamp: number;
}

export interface PersonaPlexClientEvents {
  /** Connection state changed */
  onStateChange?: (state: PersonaPlexConnectionState) => void;
  /** Audio data received from model */
  onAudio?: (data: Uint8Array) => void;
  /** Text token received from model */
  onText?: (text: string) => void;
  /** Handshake completed, ready for conversation */
  onReady?: () => void;
  /** Error occurred */
  onError?: (error: Error) => void;
  /** Connection closed */
  onClose?: () => void;
}

// =============================================================================
// PROMPT BUILDER TYPES
// =============================================================================

export interface PromptContext {
  /** User ID for memory retrieval */
  userId: string;
  /** Session context (recent conversation) */
  sessionContext?: string;
  /** Memory context (user facts, preferences) */
  memoryContext?: string;
  /** Available tool descriptions */
  availableTools?: ToolDescription[];
  /** Current emotional state */
  emotionalState?: string;
  /** Time of day context */
  timeContext?: string;
}

export interface ToolDescription {
  /** Tool name */
  name: string;
  /** Natural language trigger phrase */
  triggerPhrase: string;
  /** Brief description */
  description: string;
}

export interface BuiltPrompt {
  /** The full text prompt for PersonaPlex */
  textPrompt: string;
  /** The voice embedding filename */
  voicePrompt: string;
  /** Token count estimate */
  estimatedTokens: number;
}

// =============================================================================
// TOOL EXECUTION TYPES
// =============================================================================

export interface ToolTrigger {
  /** Tool name */
  toolName: string;
  /** Regex pattern to detect trigger */
  pattern: RegExp;
  /** Function to execute */
  execute: (args: ToolExecutionArgs) => Promise<ToolResult>;
}

export interface ToolExecutionArgs {
  userId: string;
  sessionId: string;
  matchedText: string;
  context: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  /** Text to inject into context for next turn */
  contextInjection?: string;
  error?: string;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

export interface PersonaPlexSession {
  /** Session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Active persona ID */
  personaId: string;
  /** Connection state */
  state: PersonaPlexConnectionState;
  /** Session start time */
  startedAt: Date;
  /** Accumulated transcript */
  transcript: TranscriptEntry[];
  /** Tool execution history */
  toolExecutions: ToolExecutionRecord[];
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface ToolExecutionRecord {
  toolName: string;
  triggeredAt: Date;
  result: ToolResult;
  durationMs: number;
}
