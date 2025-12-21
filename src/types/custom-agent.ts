/**
 * Custom Agent Types
 *
 * User-created agents that capture the essence of someone meaningful:
 * - Legacy Agent: Lost loved one
 * - Mentor Clone: Famous/admired figure
 * - Voice Twin: Digital self for journaling
 * - Custom: User-designed persona
 *
 * @module types/custom-agent
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Type of custom agent
 */
export type CustomAgentType =
  | 'legacy' // Lost loved one
  | 'mentor' // Famous/admired figure
  | 'twin' // Digital twin of self
  | 'fictional' // User-created persona
  | 'professional'; // Professional clone (coach, therapist style)

/**
 * Relationship to the agent
 */
export type AgentRelationship =
  | 'grandmother'
  | 'grandfather'
  | 'parent'
  | 'mother'
  | 'father'
  | 'sibling'
  | 'brother'
  | 'sister'
  | 'spouse'
  | 'partner'
  | 'child'
  | 'friend'
  | 'best_friend'
  | 'mentor'
  | 'teacher'
  | 'coach'
  | 'therapist'
  | 'public_figure'
  | 'historical_figure'
  | 'self'
  | 'fictional'
  | 'other';

/**
 * Privacy level for the agent
 */
export type AgentPrivacy =
  | 'private' // Only creator can use
  | 'shared' // Can share link with specific people
  | 'public'; // Listed in marketplace

/**
 * Status of the agent
 */
export type AgentStatus =
  | 'draft' // Still being created
  | 'active' // Ready for use
  | 'archived'; // Soft deleted

// ============================================================================
// VOICE TYPES
// ============================================================================

/**
 * Voice source type
 */
export type VoiceSource =
  | 'cloned' // Cloned from user audio
  | 'selected' // Selected from voice library
  | 'generated'; // AI-generated from description

/**
 * Cloned voice configuration
 */
export interface ClonedVoice {
  /** Cartesia voice ID */
  cartesiaVoiceId: string;

  /** When the clone was created */
  createdAt: Date;

  /** Total seconds of source audio used */
  sourceAudioDuration: number;

  /** Number of audio clips used */
  sourceAudioCount: number;

  /** Quality score from Cartesia (0-1) */
  qualityScore: number;

  /** Status of the clone */
  status: 'processing' | 'ready' | 'failed';
}

/**
 * Selected voice from library
 */
export interface SelectedVoice {
  /** Voice provider */
  provider: 'cartesia' | 'elevenlabs';

  /** Provider's voice ID */
  voiceId: string;

  /** Display name */
  name: string;

  /** Category */
  category?: string;
}

/**
 * AI-generated voice from description
 */
export interface GeneratedVoice {
  /** User's description of the voice */
  description: string;

  /** Generated Cartesia voice ID (once created) */
  cartesiaVoiceId?: string;

  /** Reference voice to modify */
  referenceVoiceId?: string;

  /** Generation status */
  status: 'pending' | 'processing' | 'ready' | 'failed';
}

/**
 * Voice characteristics
 */
export interface VoiceCharacteristics {
  /** Speed multiplier (0.8-1.2) */
  speed: number;

  /** Warmth level (0-1) */
  warmth: number;

  /** Energy level (0-1) */
  energy: number;

  /** Pitch category */
  pitch?: 'low' | 'medium' | 'high';

  /** Accent description */
  accent?: string;

  /** Additional voice traits */
  traits?: string[];
}

/**
 * Complete voice configuration for an agent
 */
export interface CustomAgentVoice {
  /** How the voice was sourced */
  source: VoiceSource;

  /** Cloned voice details (if source === 'cloned') */
  clone?: ClonedVoice;

  /** Selected voice details (if source === 'selected') */
  selectedVoice?: SelectedVoice;

  /** Generated voice details (if source === 'generated') */
  generatedVoice?: GeneratedVoice;

  /** Voice characteristics */
  characteristics: VoiceCharacteristics;
}

// ============================================================================
// PERSONALITY TYPES
// ============================================================================

/**
 * Core personality traits (0-1 scale)
 */
export interface PersonalityTraits {
  /** How warm and nurturing */
  warmth: number;

  /** How direct vs. gentle in communication */
  directness: number;

  /** How often they use humor */
  humor: number;

  /** How formal vs. casual */
  formality: number;

  /** Energy level (calm to energetic) */
  energy: number;

  /** How patient they are */
  patience: number;

  /** Perceived wisdom level */
  wisdom: number;

  /** How playful vs. serious */
  playfulness: number;
}

/**
 * Communication style preferences
 */
export interface CommunicationStyle {
  /** Speaks slowly and deliberately */
  speaksSlowly: boolean;

  /** Uses pauses for emphasis */
  usesPauses: boolean;

  /** Tends to ask questions */
  asksQuestions: boolean;

  /** Readily gives advice */
  givesAdvice: boolean;

  /** Often tells stories */
  tellsStories: boolean;

  /** Uses metaphors and analogies */
  usesMetaphors: boolean;

  /** Uses terms of endearment */
  usesEndearments: boolean;
}

/**
 * Complete personality configuration
 */
export interface CustomAgentPersonality {
  /** Core personality traits */
  traits: PersonalityTraits;

  /** Communication style */
  communicationStyle: CommunicationStyle;

  /** Core values */
  values: string[];

  /** Worldview or life philosophy */
  worldview?: string;

  /** How they express care and love */
  careExpressions: string[];

  /** What topics they're passionate about */
  passions?: string[];

  /** What gives them joy */
  joySources?: string[];
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * A story the agent told or experienced
 */
export interface AgentStory {
  /** Unique identifier */
  id: string;

  /** Story title */
  title: string;

  /** The full story content */
  content: string;

  /** Themes this story embodies */
  themes: string[];

  /** When to surface this story */
  whenToTell?: string;

  /** URL to original audio recording */
  audioUrl?: string;

  /** Vector embedding for semantic search */
  embedding?: number[];

  /** When this memory was added */
  createdAt: Date;
}

/**
 * A piece of wisdom or saying
 */
export interface AgentWisdom {
  /** Unique identifier */
  id: string;

  /** The saying or wisdom */
  saying: string;

  /** Context when they'd say this */
  context?: string;

  /** What it means to them */
  explanation?: string;

  /** Source attribution */
  source?: string;

  /** Vector embedding */
  embedding?: number[];

  /** When this memory was added */
  createdAt: Date;
}

/**
 * A significant life event
 */
export interface AgentLifeEvent {
  /** Unique identifier */
  id: string;

  /** When it happened (can be approximate) */
  date?: string;

  /** Event title */
  title: string;

  /** Description of the event */
  description: string;

  /** How it shaped them */
  impact?: string;

  /** People involved */
  peopleInvolved?: string[];

  /** When this memory was added */
  createdAt: Date;
}

/**
 * A person in the agent's life
 */
export interface AgentRelationshipMemory {
  /** Unique identifier */
  id: string;

  /** Person's name */
  personName: string;

  /** Relationship type */
  relationship: string;

  /** Description of the relationship */
  description?: string;

  /** Stories involving this person */
  storiesMentioned?: string[];

  /** When this memory was added */
  createdAt: Date;
}

/**
 * A shared moment between user and the person being memorialized
 */
export interface SharedMoment {
  /** Unique identifier */
  id: string;

  /** When it happened */
  date?: Date;

  /** Description of the moment */
  description: string;

  /** Emotional tone */
  emotion: string;

  /** Something they said */
  whatTheySaid?: string;

  /** What the user learned */
  whatILearned?: string;

  /** URL to user's audio recording of this memory */
  audioUrl?: string;

  /** Transcript if recorded */
  transcript?: string;

  /** Vector embedding */
  embedding?: number[];

  /** When this memory was added */
  createdAt: Date;
}

/**
 * Voice journal entry (for twin type agents)
 */
export interface JournalEntry {
  /** Unique identifier */
  id: string;

  /** When recorded */
  date: Date;

  /** URL to audio recording */
  audioUrl: string;

  /** Transcription */
  transcript: string;

  /** Detected mood */
  mood?: string;

  /** Extracted themes */
  themes: string[];

  /** Key insights from the entry */
  keyInsights?: string[];

  /** Vector embedding */
  embedding?: number[];

  /** Duration in seconds */
  durationSeconds: number;
}

/**
 * All memories associated with an agent
 */
export interface CustomAgentMemories {
  /** Stories they told */
  stories: AgentStory[];

  /** Wisdom and sayings */
  wisdom: AgentWisdom[];

  /** Important life events */
  lifeEvents: AgentLifeEvent[];

  /** People in their life */
  relationships: AgentRelationshipMemory[];

  /** Shared moments with the user */
  sharedMoments: SharedMoment[];

  /** Voice journal entries (for 'twin' type) */
  journalEntries?: JournalEntry[];
}

// ============================================================================
// BEHAVIOR TYPES
// ============================================================================

/**
 * Response templates for different situations
 */
export interface ResponseTemplates {
  /** How they respond when user is sad */
  whenUserIsSad?: string[];

  /** How they respond when user is happy */
  whenUserIsHappy?: string[];

  /** How they give advice */
  whenUserNeedsAdvice?: string[];

  /** How they handle casual conversation */
  whenUserJustWantsToTalk?: string[];

  /** How they respond when user mentions the actual person (for legacy agents) */
  whenUserMentionsThem?: string[];

  /** How they respond when user is stressed */
  whenUserIsStressed?: string[];

  /** How they celebrate achievements */
  whenUserAchieves?: string[];
}

/**
 * Conversation patterns
 */
export interface ConversationPatterns {
  /** How they typically start conversations */
  startsConversationsWith?: string;

  /** How they typically end conversations */
  endsConversationsWith?: string;

  /** Topics they frequently discuss */
  frequentTopics: string[];

  /** Topics to avoid */
  avoidTopics?: string[];

  /** Transition phrases they use */
  transitionPhrases?: string[];
}

/**
 * Behavioral configuration for the agent
 */
export interface CustomAgentBehaviors {
  /** Signature phrases and catchphrases */
  catchphrases: string[];

  /** Various greetings */
  greetings: string[];

  /** How they comfort */
  comfortPhrases: string[];

  /** How they celebrate */
  celebrationPhrases: string[];

  /** Things they would never say */
  neverSay: string[];

  /** Conversation patterns */
  conversationPatterns: ConversationPatterns;

  /** Response templates by situation */
  responseTemplates: ResponseTemplates;
}

// ============================================================================
// MARKETPLACE TYPES
// ============================================================================

/**
 * Marketplace metadata for public agents
 */
export interface MarketplaceMetadata {
  /** Whether it's featured */
  featured: boolean;

  /** Category */
  category: string;

  /** Search tags */
  tags: string[];

  /** Number of installs */
  installCount: number;

  /** Average rating */
  rating?: number;

  /** Number of reviews */
  reviewCount?: number;

  /** Preview audio URL */
  previewAudioUrl?: string;

  /** Short tagline */
  tagline?: string;
}

// ============================================================================
// MAIN CUSTOM AGENT TYPE
// ============================================================================

/**
 * Complete custom agent definition
 */
export interface CustomAgent {
  // ─── Identity ───────────────────────────────────────────────────────────────
  /** Unique identifier */
  id: string;

  /** User who created this agent */
  ownerId: string;

  /** Agent's name */
  name: string;

  /** Casual display name */
  displayName: string;

  /** Relationship to the user */
  relationship: AgentRelationship;

  /** Brief description */
  description: string;

  // ─── Type ───────────────────────────────────────────────────────────────────
  /** Agent type */
  type: CustomAgentType;

  // ─── Voice ──────────────────────────────────────────────────────────────────
  /** Voice configuration */
  voice: CustomAgentVoice;

  // ─── Personality ────────────────────────────────────────────────────────────
  /** Personality configuration */
  personality: CustomAgentPersonality;

  // ─── Memories ───────────────────────────────────────────────────────────────
  /** Stories, wisdom, and memories */
  memories: CustomAgentMemories;

  // ─── Behaviors ──────────────────────────────────────────────────────────────
  /** Behavioral patterns */
  behaviors: CustomAgentBehaviors;

  // ─── Status & Privacy ───────────────────────────────────────────────────────
  /** Current status */
  status: AgentStatus;

  /** Privacy level */
  privacy: AgentPrivacy;

  // ─── Timestamps ─────────────────────────────────────────────────────────────
  /** When created */
  createdAt: Date;

  /** Last updated */
  updatedAt: Date;

  /** Last conversation */
  lastConversation?: Date;

  /** Total conversations */
  conversationCount: number;

  // ─── Marketplace ────────────────────────────────────────────────────────────
  /** Marketplace metadata (if public) */
  marketplace?: MarketplaceMetadata;
}

// ============================================================================
// CREATION WIZARD TYPES
// ============================================================================

/**
 * Steps in the creation wizard
 */
export type CreationWizardStep = 'identity' | 'voice' | 'memories' | 'personality' | 'preview';

/**
 * State of the creation wizard
 */
export interface CreationWizardState {
  /** Current step */
  currentStep: CreationWizardStep;

  /** Partial agent being created */
  agent: Partial<CustomAgent>;

  /** Validation errors */
  errors: Record<string, string>;

  /** Whether each step is complete */
  completedSteps: Set<CreationWizardStep>;

  /** Temporary audio uploads */
  pendingAudioUploads: Array<{
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    url?: string;
  }>;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to create a custom agent
 */
export interface CreateCustomAgentRequest {
  name: string;
  displayName: string;
  relationship: AgentRelationship;
  type: CustomAgentType;
  description: string;
  personality?: Partial<CustomAgentPersonality>;
  behaviors?: Partial<CustomAgentBehaviors>;
  privacy?: AgentPrivacy;
}

/**
 * Request to upload voice audio
 */
export interface VoiceUploadRequest {
  agentId: string;
  files: File[];
}

/**
 * Response from voice upload
 */
export interface VoiceUploadResponse {
  uploadId: string;
  totalDuration: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  segments: Array<{
    filename: string;
    duration: number;
    speechDuration: number;
    qualityScore: number;
  }>;
}

/**
 * Request to create voice clone
 */
export interface CreateVoiceCloneRequest {
  agentId: string;
  uploadId: string;
  voiceName?: string;
}

/**
 * Response from voice clone creation
 */
export interface CreateVoiceCloneResponse {
  voiceId: string;
  status: 'processing' | 'ready' | 'failed';
  qualityScore?: number;
  estimatedWaitSeconds?: number;
}

/**
 * Request to add a memory
 */
export interface AddMemoryRequest {
  agentId: string;
  type: 'story' | 'wisdom' | 'shared_moment' | 'life_event';
  content: string;
  title?: string;
  themes?: string[];
  audioUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from adding a memory (with AI extraction)
 */
export interface AddMemoryResponse {
  memoryId: string;
  extracted: {
    title: string;
    themes: string[];
    emotions: string[];
    keyPhrases: string[];
    peopleNentioned: string[];
    suggestedWhenToSurface?: string;
  };
}

// ============================================================================
// SHARING TYPES
// ============================================================================

/**
 * Shared access to an agent
 */
export interface SharedAgentAccess {
  /** Agent ID */
  agentId: string;

  /** Users with access */
  sharedWith: string[];

  /** Unique share link */
  shareLink?: string;

  /** Access level */
  permissions: 'use' | 'view';

  /** Expiration date */
  expiresAt?: Date;

  /** When shared */
  sharedAt: Date;
}

// ============================================================================
// EXPORT
// ============================================================================

export type {
  CustomAgentType as AgentType,
  AgentRelationship as Relationship,
  AgentPrivacy as Privacy,
  AgentStatus as Status,
};

