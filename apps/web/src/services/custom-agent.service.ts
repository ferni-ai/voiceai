/**
 * Custom Agent Service
 *
 * Frontend service for managing user-created custom agents.
 * Handles API communication for CRUD operations, voice cloning,
 * and memory management.
 *
 * @module custom-agent.service
 */

import { createLogger } from '../utils/logger.js';
import { getUserId } from '../utils/api.js';

const log = createLogger('CustomAgentService');

// ============================================================================
// TYPES
// ============================================================================

export type CustomAgentType = 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
export type CustomAgentStatus = 'draft' | 'active' | 'paused';
export type VoiceStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type PrivacySetting = 'private' | 'shared' | 'marketplace';
export type MemoryType = 'story' | 'wisdom' | 'sharedMoment' | 'journalEntry';

export interface CustomAgentVoice {
  type: 'cloned' | 'selected' | 'generated';
  voiceId: string;
  audioSampleUrl?: string;
  status: VoiceStatus;
  settings: {
    speed: number;
    stability: number;
    similarityBoost: number;
    emotion?: 'neutral' | 'friendly' | 'professional';
  };
  preferences?: {
    formality: 'casual' | 'professional' | 'match_context';
    greeting: string;
    signaturePhrases?: string[];
    avoidPhrases?: string[];
    traits: {
      patience: number;
      assertiveness: number;
      friendliness: number;
    };
  };
}

export interface CustomAgentPersonality {
  warmth: number;
  humorLevel: number;
  directness: number;
  energy: number;
  formality: number;
  traits: string[];
  values: string[];
  cognitiveProfile: 'empathetic' | 'analytical' | 'balanced';
  responsePatterns: Record<string, unknown>;
}

export interface CustomAgentMemory {
  id: string;
  type: MemoryType;
  content: string;
  audioUrl?: string;
  title?: string;
  phrase?: string;
  context?: string;
  themes: string[];
  emotions: string[];
  keywords: string[];
  mood?: string;
  createdAt: string;
  updatedAt: string;
  /** Source of the memory: 'manual' (user recorded), 'auto-capture' (from conversation) */
  source?: 'manual' | 'auto-capture';
  /** For auto-captured moments, the type of moment detected */
  momentType?: string;
  /** For auto-captured moments, the intensity/significance (0-1) */
  intensity?: number;
  /** For auto-captured moments, which conversation it came from */
  conversationId?: string;
  /** For auto-captured moments, which persona captured it */
  personaId?: string;
}

export interface CustomAgentBehaviors {
  greetings: string[];
  farewells: string[];
  catchphrases: string[];
  responsePatterns: Record<string, unknown>;
  superhumanInsights?: Record<string, unknown>;
}

export interface CustomAgent {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  description: string;
  type: CustomAgentType;
  status: CustomAgentStatus;
  createdAt: string;
  updatedAt: string;
  voice: CustomAgentVoice;
  personality: CustomAgentPersonality;
  memories: {
    stories: CustomAgentMemory[];
    wisdom: CustomAgentMemory[];
    sharedMoments: CustomAgentMemory[];
    journalEntries?: CustomAgentMemory[];
  };
  behaviors: CustomAgentBehaviors;
  privacy: PrivacySetting;
  marketplaceId?: string;
  category?: string;
  tags?: string[];
  icon?: string;
  colors?: {
    primary: string;
    secondary: string;
    gradient?: string;
    glow?: string;
  };
}

export interface CreateCustomAgentRequest {
  name: string;
  displayName?: string;
  description: string;
  type: CustomAgentType;
  category?: string;
  tags?: string[];
  icon?: string;
  colors?: CustomAgent['colors'];
}

export interface VoiceQualityAnalysis {
  qualityScore: number;
  feedback: string;
  durationSeconds: number;
}

export interface AddMemoryRequest {
  type: MemoryType;
  content: string;
  audioUrl?: string;
  title?: string;
  phrase?: string;
  context?: string;
  mood?: string;
  /** Transcription text for voice entries */
  transcript?: string;
  /** Duration in seconds for voice entries */
  durationSeconds?: number;
}

// ============================================================================
// API CLIENT
// ============================================================================

const API_BASE = '/api/custom-agents';

// User ID is now obtained via the shared getUserId() from utils/api.js
// which correctly handles Firebase auth and fallbacks

/**
 * Makes an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add user ID for authentication (required by backend)
  // Using shared getUserId which handles Firebase auth properly
  const userId = getUserId();
  if (userId) {
    (headers as Record<string, string>)['X-User-Id'] = userId;
  } else {
    log.warn('No user ID available for custom agent API request');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API request failed: ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// CUSTOM AGENT CRUD OPERATIONS
// ============================================================================

/**
 * Creates a new custom agent
 */
export async function createCustomAgent(
  data: CreateCustomAgentRequest
): Promise<CustomAgent> {
  log.info('Creating custom agent:', data.name);
  return apiRequest<CustomAgent>('', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Gets a specific custom agent by ID
 */
export async function getCustomAgent(agentId: string): Promise<CustomAgent | null> {
  try {
    return await apiRequest<CustomAgent>(`/${agentId}`);
  } catch (error) {
    if ((error as Error).message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Lists all custom agents for the current user
 */
export async function listCustomAgents(): Promise<CustomAgent[]> {
  log.debug('Fetching custom agents list');
  return apiRequest<CustomAgent[]>('');
}

/**
 * Updates an existing custom agent
 */
export async function updateCustomAgent(
  agentId: string,
  data: Partial<CustomAgent>
): Promise<CustomAgent> {
  log.info('Updating custom agent:', agentId);
  return apiRequest<CustomAgent>(`/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Deletes a custom agent
 */
export async function deleteCustomAgent(agentId: string): Promise<void> {
  log.info('Deleting custom agent:', agentId);
  await apiRequest<void>(`/${agentId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// VOICE CLONING OPERATIONS
// ============================================================================

/**
 * Uploads a voice sample for cloning
 */
export async function uploadVoiceSample(
  agentId: string,
  audioBlob: Blob
): Promise<{ audioUrl: string; qualityScore: number; feedback: string }> {
  log.info('Uploading voice sample for agent:', agentId);
  
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice-sample.webm');

  const response = await fetch(`${API_BASE}/${agentId}/voice/upload`, {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('ferni_auth_token') || ''}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to upload voice sample');
  }

  return response.json();
}

/**
 * Initiates voice cloning with Cartesia
 */
export async function createVoiceClone(
  agentId: string,
  audioSampleUrl: string,
  userName: string
): Promise<CustomAgentVoice> {
  log.info('Creating voice clone for agent:', agentId);
  return apiRequest<{ message: string; voice: CustomAgentVoice }>(
    `/${agentId}/voice/clone`,
    {
      method: 'POST',
      body: JSON.stringify({ audioSampleUrl, userName }),
    }
  ).then((res) => res.voice);
}

/**
 * Generates a preview of the cloned voice
 */
export async function generateVoicePreview(
  agentId: string,
  text: string
): Promise<string> {
  log.debug('Generating voice preview for agent:', agentId);
  const result = await apiRequest<{ previewUrl: string }>(
    `/${agentId}/voice/preview`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  );
  return result.previewUrl;
}

/**
 * Selects a pre-made voice from the library
 */
export async function selectPreMadeVoice(
  agentId: string,
  voiceId: string
): Promise<CustomAgentVoice> {
  log.info('Selecting pre-made voice for agent:', agentId, voiceId);
  const result = await apiRequest<{ message: string; voice: CustomAgentVoice }>(
    `/${agentId}/voice/select-premade`,
    {
      method: 'PUT',
      body: JSON.stringify({ voiceId }),
    }
  );
  return result.voice;
}

/**
 * Polls voice clone status
 */
export interface VoiceCloneStatus {
  status: VoiceStatus;
  type: 'cloned' | 'selected' | 'none';
  voiceId: string | null;
  hasAudioSample: boolean;
  isReady: boolean;
  settings: Record<string, unknown>;
}

export async function getVoiceCloneStatus(agentId: string): Promise<VoiceCloneStatus> {
  return apiRequest<VoiceCloneStatus>(`/${agentId}/voice/status`);
}

/**
 * Polls voice clone status until ready or failed
 * Returns when status changes to 'ready' or 'failed'
 */
export async function waitForVoiceClone(
  agentId: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onProgress?: (status: VoiceCloneStatus) => void;
  } = {}
): Promise<VoiceCloneStatus> {
  const { maxAttempts = 30, intervalMs = 2000, onProgress } = options;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getVoiceCloneStatus(agentId);
    
    if (onProgress) {
      onProgress(status);
    }
    
    if (status.isReady || status.status === 'ready') {
      return status;
    }
    
    if (status.status === 'failed') {
      throw new Error('Voice clone failed');
    }
    
    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Voice clone timed out');
}

// ============================================================================
// AGENT STATUS OPERATIONS
// ============================================================================

/**
 * Changes agent status (active/paused/draft)
 */
export async function setAgentStatus(
  agentId: string,
  status: CustomAgentStatus
): Promise<{ message: string; status: CustomAgentStatus }> {
  log.info('Setting agent status:', agentId, status);
  return apiRequest<{ message: string; status: CustomAgentStatus }>(
    `/${agentId}/status`,
    {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }
  );
}

/**
 * Activates an agent (validates it's ready first)
 */
export async function activateAgent(
  agentId: string
): Promise<{ message: string; status: CustomAgentStatus }> {
  log.info('Activating agent:', agentId);
  return apiRequest<{ message: string; status: CustomAgentStatus }>(
    `/${agentId}/activate`,
    {
      method: 'POST',
    }
  );
}

/**
 * Pauses an agent
 */
export async function pauseAgent(
  agentId: string
): Promise<{ message: string; status: CustomAgentStatus }> {
  log.info('Pausing agent:', agentId);
  return setAgentStatus(agentId, 'paused');
}

// ============================================================================
// MEMORY MANAGEMENT OPERATIONS
// ============================================================================

/**
 * Adds a memory to a custom agent
 */
export async function addMemory(
  agentId: string,
  memory: AddMemoryRequest
): Promise<CustomAgentMemory> {
  log.info('Adding memory to agent:', agentId, memory.type);
  return apiRequest<CustomAgentMemory>(`/${agentId}/memories`, {
    method: 'POST',
    body: JSON.stringify(memory),
  });
}

/**
 * Lists all memories for a custom agent
 */
export async function listMemories(
  agentId: string,
  type?: MemoryType
): Promise<CustomAgentMemory[]> {
  const query = type ? `?type=${type}` : '';
  return apiRequest<CustomAgentMemory[]>(`/${agentId}/memories${query}`);
}

/**
 * Deletes a memory from a custom agent
 */
export async function deleteMemory(
  agentId: string,
  memoryId: string
): Promise<void> {
  log.info('Deleting memory from agent:', agentId, memoryId);
  await apiRequest<void>(`/${agentId}/memories/${memoryId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * Generates the system prompt and manifest for a custom agent
 */
export async function generatePrompt(
  agentId: string
): Promise<{ systemPrompt: string; personaManifest: Record<string, unknown> }> {
  log.debug('Generating prompt for agent:', agentId);
  return apiRequest<{ systemPrompt: string; personaManifest: Record<string, unknown> }>(
    `/${agentId}/generate-prompt`,
    {
      method: 'POST',
    }
  );
}

// ============================================================================
// VOICE LIBRARY (Pre-made voices)
// ============================================================================

export interface PreMadeVoice {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  gender: 'male' | 'female' | 'neutral';
  age: 'young' | 'middle' | 'mature';
  accent?: string;
  tags: string[];
}

const VOICE_LIBRARY: PreMadeVoice[] = [
  {
    id: 'cartesia-friendly-female',
    name: 'Emma',
    description: 'Warm and friendly voice, perfect for supportive conversations',
    previewUrl: '/assets/voice-previews/emma.mp3',
    gender: 'female',
    age: 'middle',
    tags: ['warm', 'friendly', 'supportive'],
  },
  {
    id: 'cartesia-professional-male',
    name: 'James',
    description: 'Clear and professional voice, ideal for mentors and advisors',
    previewUrl: '/assets/voice-previews/james.mp3',
    gender: 'male',
    age: 'mature',
    tags: ['professional', 'authoritative', 'clear'],
  },
  {
    id: 'cartesia-gentle-female',
    name: 'Sarah',
    description: 'Gentle and soothing voice, great for legacy personas',
    previewUrl: '/assets/voice-previews/sarah.mp3',
    gender: 'female',
    age: 'mature',
    tags: ['gentle', 'soothing', 'warm'],
  },
  {
    id: 'cartesia-energetic-male',
    name: 'Alex',
    description: 'Energetic and motivating voice, perfect for coaches',
    previewUrl: '/assets/voice-previews/alex.mp3',
    gender: 'male',
    age: 'young',
    tags: ['energetic', 'motivating', 'dynamic'],
  },
  {
    id: 'cartesia-calm-neutral',
    name: 'Morgan',
    description: 'Calm and balanced voice, suitable for any persona type',
    previewUrl: '/assets/voice-previews/morgan.mp3',
    gender: 'neutral',
    age: 'middle',
    tags: ['calm', 'balanced', 'neutral'],
  },
];

/**
 * Gets the list of available pre-made voices
 */
export function getVoiceLibrary(): PreMadeVoice[] {
  return VOICE_LIBRARY;
}

/**
 * Gets a specific voice from the library
 */
export function getVoiceFromLibrary(voiceId: string): PreMadeVoice | undefined {
  return VOICE_LIBRARY.find((v) => v.id === voiceId);
}

// ============================================================================
// AGENT TYPE HELPERS
// ============================================================================

export interface AgentTypeInfo {
  id: CustomAgentType;
  name: string;
  description: string;
  icon: string;
  features: string[];
  examples: string[];
}

const AGENT_TYPES: AgentTypeInfo[] = [
  {
    id: 'legacy',
    name: 'Legacy',
    description: 'Preserve the voice and wisdom of someone you cherish',
    icon: 'heart',
    features: [
      'Voice cloning from recordings',
      'Capture stories and memories',
      'Store wisdom and favorite sayings',
      'Share with family members',
    ],
    examples: [
      'Grandma Rose who always had the best advice',
      'Dad who told the best stories',
      'A mentor who shaped your life',
    ],
  },
  {
    id: 'mentor',
    name: 'Mentor',
    description: 'Create a coach based on an inspiring figure or expert',
    icon: 'graduation-cap',
    features: [
      'Based on public figures or experts',
      'Capture their teaching style',
      'Store their key principles',
      'Access their wisdom anytime',
    ],
    examples: [
      'Stoic philosophy mentor',
      'Business guru coach',
      'Fitness motivation expert',
    ],
  },
  {
    id: 'twin',
    name: 'Digital Twin',
    description: 'Your personal voice journal that grows with you',
    icon: 'user-circle',
    features: [
      'Record daily voice journals',
      'Talk to your past self',
      'Track your growth over time',
      'AI-generated insights',
    ],
    examples: [
      'Daily reflection companion',
      'Goal tracking journal',
      'Personal growth diary',
    ],
  },
  {
    id: 'fictional',
    name: 'Fictional',
    description: 'Bring a character to life with unique personality',
    icon: 'sparkles',
    features: [
      'Fully customizable personality',
      'Choose any voice style',
      'Define unique behaviors',
      'Creative interactions',
    ],
    examples: [
      'Fictional character coach',
      'Creative writing partner',
      'Storytelling companion',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Build a specialized assistant for work tasks',
    icon: 'briefcase',
    features: [
      'Task-focused interactions',
      'Domain expertise',
      'Productivity support',
      'Clear communication',
    ],
    examples: [
      'Specialized skill tutor',
      'Project planning assistant',
      'Research helper',
    ],
  },
];

/**
 * Gets all available agent types
 */
export function getAgentTypes(): AgentTypeInfo[] {
  return AGENT_TYPES;
}

/**
 * Gets info for a specific agent type
 */
export function getAgentTypeInfo(type: CustomAgentType): AgentTypeInfo | undefined {
  return AGENT_TYPES.find((t) => t.id === type);
}

// ============================================================================
// LOCAL STORAGE (for draft states)
// ============================================================================

const DRAFT_KEY = 'ferni_custom_agent_draft';

export interface AgentDraft {
  step: number;
  type?: CustomAgentType;
  name?: string;
  displayName?: string;
  description?: string;
  voiceOption?: 'clone' | 'library' | 'later';
  voiceSampleUrl?: string;
  selectedVoiceId?: string;
  personality?: Partial<CustomAgentPersonality>;
  memories?: AddMemoryRequest[];
  icon?: string;
  colors?: CustomAgent['colors'];
  updatedAt: string;
}

/**
 * Saves wizard draft to local storage
 */
export function saveAgentDraft(draft: AgentDraft): void {
  draft.updatedAt = new Date().toISOString();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  log.debug('Saved agent draft:', draft);
}

/**
 * Loads wizard draft from local storage
 */
export function loadAgentDraft(): AgentDraft | null {
  const data = localStorage.getItem(DRAFT_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    log.warn('Failed to parse agent draft');
    return null;
  }
}

/**
 * Clears the wizard draft
 */
export function clearAgentDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
  log.debug('Cleared agent draft');
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type CustomAgentEventType = 
  | 'custom-agent:created'
  | 'custom-agent:updated'
  | 'custom-agent:deleted'
  | 'custom-agent:voice-ready'
  | 'custom-agent:memory-added';

/**
 * Dispatches a custom agent event
 */
export function dispatchCustomAgentEvent(
  type: CustomAgentEventType,
  detail?: Record<string, unknown>
): void {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

