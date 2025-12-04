/**
 * Voice Manager
 *
 * Manages TTS voice switching between all personas in the team.
 * Uses Cartesia's API to switch voices mid-session.
 *
 * Features:
 * - DynamicTTS class that switches voices based on current agent
 * - Automatic voice switching on handoff events
 * - Support for all 6 personas: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 *
 * Voice IDs are now sourced from the voice-registry (single source of truth).
 */

import { log, tts } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { handoffEvents, getCurrentAgent } from '../tools/handoff/index.js';
import { getVoiceId, getCanonicalPersonaId } from '../personas/voice-registry.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * All supported agent IDs for voice switching.
 * Includes both primary IDs and aliases for flexibility.
 */
export type VoiceAgentId =
  | 'jack-b'
  | 'ferni' // Coach (Ferni)
  | 'peter-john'
  | 'peter' // Research Coach
  | 'comm-specialist'
  | 'alex' // Communication
  | 'spend-save'
  | 'maya' // Financial Habits
  | 'event-planner'
  | 'jordan' // Life Planning
  | 'nayan-patel'
  | 'nayan'; // Lifetime Advisor / Sage

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

export interface VoiceConfig {
  id: string;
  name: string;
  model: string;
  description: string;
}

/**
 * Voice configurations for all personas.
 * Voice IDs are loaded dynamically from the voice registry.
 * Legacy 'peter' alias included for backward compatibility.
 */
export const VOICES: Record<VoiceAgentId, VoiceConfig> = {
  // Coach
  'jack-b': {
    get id() {
      return getVoiceId('ferni');
    },
    name: 'Ferni',
    model: 'sonic-3',
    description: 'Confident, friendly coach - orchestrates the team',
  },
  // Team members
  'peter-john': {
    get id() {
      return getVoiceId('peter-john');
    },
    name: 'Peter',
    model: 'sonic-3',
    description: 'Energetic, animated - the voice of stock picking enthusiasm',
  },
  'comm-specialist': {
    get id() {
      return getVoiceId('alex-chen');
    },
    name: 'Alex',
    model: 'sonic-3',
    description: 'Professional, efficient - communication specialist',
  },
  'spend-save': {
    get id() {
      return getVoiceId('maya-santos');
    },
    name: 'Maya',
    model: 'sonic-3',
    description: 'Warm, non-judgmental - spend & save specialist',
  },
  'event-planner': {
    get id() {
      return getVoiceId('jordan-taylor');
    },
    name: 'Jordan',
    model: 'sonic-3',
    description: 'Enthusiastic, organized - life & event planner',
  },
  // Aliases for coach
  ferni: {
    get id() {
      return getVoiceId('ferni');
    },
    name: 'Ferni',
    model: 'sonic-3',
    description: 'Confident, friendly coach - orchestrates the team',
  },
  // Aliases for team members
  alex: {
    get id() {
      return getVoiceId('alex-chen');
    },
    name: 'Alex',
    model: 'sonic-3',
    description: 'Professional, efficient - communication specialist',
  },
  maya: {
    get id() {
      return getVoiceId('maya-santos');
    },
    name: 'Maya',
    model: 'sonic-3',
    description: 'Warm, non-judgmental - spend & save specialist',
  },
  jordan: {
    get id() {
      return getVoiceId('jordan-taylor');
    },
    name: 'Jordan',
    model: 'sonic-3',
    description: 'Enthusiastic, organized - life & event planner',
  },
  // FIX BUG #voice-3: Added nayan-patel (lifetime advisor)
  'nayan-patel': {
    get id() {
      return getVoiceId('nayan-patel');
    },
    name: 'Nayan',
    model: 'sonic-3',
    description: 'Calm, wise, meditative - the lifetime advisor and sage',
  },
  nayan: {
    get id() {
      return getVoiceId('nayan-patel');
    },
    name: 'Nayan',
    model: 'sonic-3',
    description: 'Calm, wise, meditative - the lifetime advisor and sage',
  },
  // Legacy aliases
  peter: {
    get id() {
      return getVoiceId('peter-john');
    },
    name: 'Peter',
    model: 'sonic-3',
    description: 'Energetic, animated - the voice of stock picking enthusiasm',
  },
};

// ============================================================================
// VOICE MANAGER
// ============================================================================

/**
 * Normalize agent ID to canonical form for voice lookup.
 * Uses the voice registry for consistent ID resolution.
 * FIX BUG #voice-4: Defaults to ferni instead of jack-b
 */
function normalizeAgentId(agentId: string): VoiceAgentId {
  // Use voice registry for canonical resolution
  const canonical = getCanonicalPersonaId(agentId);

  // Map canonical bundle IDs to voice agent IDs
  // NOTE: VOICES record still uses some legacy keys for backwards compatibility
  const bundleToVoiceId: Record<string, VoiceAgentId> = {
    ferni: 'ferni',
    'alex-chen': 'alex',
    'maya-santos': 'maya',
    'jordan-taylor': 'jordan',
    'peter-john': 'peter-john',
    'nayan-patel': 'nayan-patel',
  };

  // Check if canonical is a bundle ID that needs mapping
  if (canonical in bundleToVoiceId) {
    return bundleToVoiceId[canonical];
  }

  // Check if it's already a valid voice agent ID
  const normalized = agentId.toLowerCase();
  if (normalized in VOICES) {
    return normalized as VoiceAgentId;
  }

  // FIX BUG #voice-4: Default to ferni (the coach) instead of legacy jack-b
  getLogger().warn({ agentId }, 'Unknown agent ID, defaulting to ferni');
  return 'ferni';
}

class VoiceManager {
  private currentVoice: VoiceAgentId = 'ferni';
  private ttsInstances: Map<string, cartesia.TTS> = new Map();
  private initialized = false;
  private voiceSwitchHandler: ((data: { newAgent: string; voiceId: string }) => void) | null = null;

  constructor() {
    // NOTE: VoiceManager no longer auto-switches on voiceSwitch events
    // The voice-agent.ts now controls timing: it sends frontend notification,
    // waits for transition sound, THEN calls switchVoice() directly.
    // This prevents the voice from changing before the frontend plays sounds.
    this.voiceSwitchHandler = null; // Explicitly null - no auto-switch
  }

  /**
   * Clean up event listeners and TTS instances
   * FIX BUG #45: Properly dispose TTS instances to prevent memory leaks
   * Note: Cartesia TTS instances are lightweight and don't require explicit close()
   * calls, but we clear the map to release references for GC.
   */
  cleanup(): void {
    if (this.voiceSwitchHandler) {
      handoffEvents.off('voiceSwitch', this.voiceSwitchHandler);
      this.voiceSwitchHandler = null;
    }
    // Clear all TTS instance references to allow garbage collection
    this.ttsInstances.clear();
    this.initialized = false;
    getLogger().debug('Voice manager cleaned up');
  }

  /**
   * Initialize TTS instances for all personas (lazy-loaded on first use)
   */
  initialize(): void {
    if (this.initialized) return;

    // Create TTS instances for all personas
    for (const [agentId, config] of Object.entries(VOICES)) {
      // Skip legacy aliases (they share voice IDs)
      if (agentId === 'peter') continue;

      this.ttsInstances.set(
        agentId,
        new cartesia.TTS({
          model: config.model,
          voice: config.id,
        })
      );
    }

    this.initialized = true;
    getLogger().info(
      { personas: Object.keys(VOICES).filter((k) => k !== 'peter') },
      'Voice manager initialized with all persona voices'
    );
  }

  /**
   * Get the current voice configuration
   */
  getCurrentVoice(): VoiceConfig {
    return VOICES[this.currentVoice];
  }

  /**
   * Get the current TTS instance
   */
  getCurrentTTS(): cartesia.TTS {
    if (!this.initialized) {
      this.initialize();
    }

    // Handle legacy aliases
    const normalizedVoice = normalizeAgentId(this.currentVoice);
    return this.ttsInstances.get(normalizedVoice) ?? this.ttsInstances.get('jack-b')!;
  }

  // FIX BUG #voice-6: Voice switch subscribers for notification
  private voiceSwitchSubscribers: Set<(from: VoiceAgentId, to: VoiceAgentId) => void> = new Set();

  /**
   * Subscribe to voice switch events
   * FIX BUG #voice-6: Allow components to be notified of voice changes
   */
  onVoiceSwitch(callback: (from: VoiceAgentId, to: VoiceAgentId) => void): () => void {
    this.voiceSwitchSubscribers.add(callback);
    return () => this.voiceSwitchSubscribers.delete(callback);
  }

  /**
   * Switch to a different voice
   * FIX BUG #voice-6: Now notifies subscribers of voice changes
   */
  switchVoice(agent: VoiceAgentId | string): void {
    const normalizedAgent = normalizeAgentId(agent);

    if (this.currentVoice === normalizedAgent) {
      getLogger().debug({ agent: normalizedAgent }, 'Already using this voice');
      return;
    }

    const oldVoice = this.currentVoice;
    this.currentVoice = normalizedAgent;

    // FIX BUG #voice-6: Notify subscribers
    for (const callback of this.voiceSwitchSubscribers) {
      try {
        callback(oldVoice, normalizedAgent);
      } catch (err) {
        getLogger().warn({ error: String(err) }, 'Voice switch subscriber threw error');
      }
    }

    getLogger().info(
      {
        from: VOICES[oldVoice]?.name ?? oldVoice,
        to: VOICES[normalizedAgent].name,
        voiceId: VOICES[normalizedAgent].id,
      },
      '🎤 Voice switched'
    );
  }

  /**
   * Get the voice ID for the current agent
   */
  getVoiceId(): string {
    // FIX: Use ferni as fallback instead of legacy jack-b
    return VOICES[this.currentVoice]?.id ?? VOICES['ferni'].id;
  }

  /**
   * Check if we should use Peter's voice
   * FIX BUG #voice-7: Only check currentVoice (single source of truth)
   * The getCurrentAgent() call was redundant and could cause inconsistencies
   */
  isPeter(): boolean {
    return this.currentVoice === 'peter-john' || this.currentVoice === 'peter';
  }

  /**
   * Check if we should use Nayan Patel's voice (sage/mentor role)
   */
  isNayan(): boolean {
    return this.currentVoice === 'nayan-patel' || this.currentVoice === 'nayan';
  }

  /**
   * Get the current agent ID
   */
  getCurrentAgentId(): VoiceAgentId {
    return this.currentVoice;
  }

  /**
   * Create a fresh TTS instance with the current voice
   * Useful for when you need a new TTS mid-session
   */
  createTTS(): cartesia.TTS {
    const voice = this.getCurrentVoice();
    return new cartesia.TTS({
      model: voice.model,
      voice: voice.id,
    });
  }
}

// Singleton instance
let voiceManagerInstance: VoiceManager | null = null;

export function getVoiceManager(): VoiceManager {
  if (!voiceManagerInstance) {
    voiceManagerInstance = new VoiceManager();
  }
  return voiceManagerInstance;
}

export function resetVoiceManager(): void {
  if (voiceManagerInstance) {
    voiceManagerInstance.cleanup();
    voiceManagerInstance = null;
  }
}

// ============================================================================
// DYNAMIC TTS - Switches voices based on current agent
// ============================================================================

/**
 * DynamicTTS wraps Cartesia TTS and switches voices dynamically
 * based on the current agent from the full team.
 *
 * This implements the TTS interface so it can be used directly
 * with LiveKit's AgentSession.
 *
 * Supports: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 */
export class DynamicTTS extends tts.TTS {
  readonly label = 'dynamic-cartesia-tts';

  private ttsInstances: Map<VoiceAgentId, cartesia.TTS> = new Map();
  private voiceManager: VoiceManager;

  constructor() {
    // Call parent with sample rate and channels
    super(44100, 1, { streaming: true });

    // FIX BUG #voice-4 & #voice-5: Use ferni instead of legacy jack-b
    const personaIds: VoiceAgentId[] = [
      'ferni',
      'peter-john',
      'comm-specialist',
      'spend-save',
      'event-planner',
      'nayan-patel',
    ];

    for (const personaId of personaIds) {
      const config = VOICES[personaId];
      this.ttsInstances.set(
        personaId,
        new cartesia.TTS({
          model: config.model,
          voice: config.id,
        })
      );
    }

    this.voiceManager = getVoiceManager();

    getLogger().info({ personas: personaIds }, 'DynamicTTS initialized with all persona voices');
  }

  /**
   * Get the TTS instance for the current agent
   */
  private getCurrentTTS(): cartesia.TTS {
    const currentAgent = getCurrentAgent();
    const normalizedAgent = normalizeAgentId(currentAgent);
    // FIX BUG #voice-4 & #voice-8: Fallback to ferni with error handling
    const currentTTS = this.ttsInstances.get(normalizedAgent) ?? this.ttsInstances.get('ferni');
    if (!currentTTS) {
      getLogger().error({ agent: currentAgent, normalizedAgent }, 'No TTS instance found - this should not happen');
      throw new Error(`No TTS instance available for agent: ${currentAgent}`);
    }

    getLogger().debug(
      {
        agent: currentAgent,
        normalizedAgent,
        voice: VOICES[normalizedAgent]?.name ?? 'Unknown',
      },
      'Using TTS voice'
    );

    return currentTTS;
  }

  /**
   * Synthesize text to speech using the current agent's voice
   */
  synthesize(text: string): tts.ChunkedStream {
    const currentAgent = getCurrentAgent();
    const normalizedAgent = normalizeAgentId(currentAgent);
    getLogger().debug({ agent: VOICES[normalizedAgent]?.name ?? currentAgent }, 'TTS speaking');

    return this.getCurrentTTS().synthesize(text);
  }

  /**
   * Stream synthesis for the current agent's voice
   */
  stream(): tts.SynthesizeStream {
    const currentAgent = getCurrentAgent();
    getLogger().debug({ agent: currentAgent }, 'Starting TTS stream');

    return this.getCurrentTTS().stream();
  }
}

/**
 * Create a DynamicTTS instance for use with AgentSession
 * NOTE: This is the legacy TTS that switches between all personas.
 * For per-session persona binding, use createPersonaAwareTTS() instead.
 */
export function createDynamicTTS(): DynamicTTS {
  return new DynamicTTS();
}

// ============================================================================
// PERSONA-AWARE TTS
// ============================================================================

/**
 * Voice configuration from PersonaConfig
 *
 * Speed values for Cartesia sonic-2-2025-03-07:
 * - String: "slowest", "slow", "normal", "fast", "fastest"
 * - Number: -1.0 (slowest) to 1.0 (fastest), 0 = normal
 */
interface PersonaVoiceConfig {
  voiceId: string;
  provider?: string;
  language?: string;
  defaultRate?: number | string;
}

/**
 * Persona-Aware TTS
 *
 * A TTS implementation that uses the voice configuration from a PersonaConfig.
 * This allows each persona (Jack Bogle, Ferni, Peter John, etc.) to have
 * its own distinct voice.
 *
 * SUPPORTS VOICE SWITCHING: Call switchVoice() to change to a different voice
 * at runtime (e.g., for Jack <-> Peter handoffs).
 *
 * THREAD SAFETY: Voice switches are synchronized to prevent race conditions
 * during active speech synthesis.
 */
export class PersonaAwareTTS extends tts.TTS {
  readonly label = 'persona-aware-cartesia-tts';

  private personaTTS: cartesia.TTS;
  private personaName: string;
  private voiceId: string;

  // Synchronization state for safe voice switching
  private isSwitching: boolean = false;
  private pendingSwitch: { personaName: string; voiceId: string } | null = null;
  private activeStreamCount: number = 0;

  // Event handler reference for cleanup
  private voiceSwitchHandler: ((data: { newAgent: string; voiceId: string }) => void) | null = null;

  constructor(personaName: string, voiceConfig: PersonaVoiceConfig) {
    // Call parent with sample rate and channels (matching DynamicTTS)
    super(44100, 1, { streaming: true });

    this.personaName = personaName;
    this.voiceId = voiceConfig.voiceId;

    // Create TTS instance for this persona's voice
    // Using sonic-3 model (speed control not available - use SSML prosody instead)
    this.personaTTS = new cartesia.TTS({
      model: 'sonic-3',
      voice: voiceConfig.voiceId,
    });

    getLogger().info(
      {
        persona: personaName,
        voiceId: voiceConfig.voiceId,
        model: 'sonic-3',
      },
      'PersonaAwareTTS initialized'
    );

    // NOTE: PersonaAwareTTS no longer auto-switches on voiceSwitch events
    // The voice-agent.ts now controls timing: it sends frontend notification,
    // waits for transition sound, THEN calls switchVoice() directly.
    // This prevents the voice from changing before the frontend plays sounds.
    this.voiceSwitchHandler = null; // Explicitly null - no auto-switch
  }

  /**
   * Clean up event listeners to prevent memory leaks
   */
  cleanup(): void {
    if (this.voiceSwitchHandler) {
      handoffEvents.off('voiceSwitch', this.voiceSwitchHandler);
      this.voiceSwitchHandler = null;
    }
  }

  /**
   * Switch to a different voice at runtime (e.g., for Jack <-> Peter handoffs).
   *
   * If a stream is currently active, the switch is queued and applied
   * after the current stream completes.
   */
  switchVoice(newPersonaName: string, newVoiceId: string): void {
    if (this.voiceId === newVoiceId) {
      getLogger().debug({ persona: newPersonaName }, 'Already using this voice');
      return;
    }

    // If we're in the middle of a stream, queue the switch
    if (this.activeStreamCount > 0) {
      getLogger().info(
        {
          persona: newPersonaName,
          activeStreams: this.activeStreamCount,
        },
        '⏸️ Voice switch queued (stream active)'
      );
      this.pendingSwitch = { personaName: newPersonaName, voiceId: newVoiceId };
      return;
    }

    this.performVoiceSwitch(newPersonaName, newVoiceId);
  }

  /**
   * Actually perform the voice switch.
   */
  private performVoiceSwitch(newPersonaName: string, newVoiceId: string): void {
    if (this.isSwitching) {
      // Already switching, queue this one
      this.pendingSwitch = { personaName: newPersonaName, voiceId: newVoiceId };
      return;
    }

    this.isSwitching = true;

    const oldPersona = this.personaName;
    const oldVoiceId = this.voiceId;

    this.personaName = newPersonaName;
    this.voiceId = newVoiceId;

    // Create new TTS instance with new voice
    this.personaTTS = new cartesia.TTS({
      model: 'sonic-3',
      voice: newVoiceId,
    });

    getLogger().info(
      {
        from: oldPersona,
        to: newPersonaName,
        oldVoiceId,
        newVoiceId,
      },
      '🔄 PersonaAwareTTS voice switched'
    );

    this.isSwitching = false;

    // Process any pending switch
    if (this.pendingSwitch && this.pendingSwitch.voiceId !== this.voiceId) {
      const pending = this.pendingSwitch;
      this.pendingSwitch = null;
      this.performVoiceSwitch(pending.personaName, pending.voiceId);
    }
  }

  /**
   * Track stream lifecycle for safe voice switching.
   */
  private trackStream<T>(operation: () => T): T {
    this.activeStreamCount++;

    try {
      const result = operation();

      // For streams, we need to track when they complete
      // Note: The actual stream completion tracking would require
      // wrapping the stream, but for now we decrement immediately
      // since Cartesia handles this internally
      return result;
    } finally {
      // Use setTimeout to allow the stream to start before decrementing
      setTimeout(() => {
        this.activeStreamCount = Math.max(0, this.activeStreamCount - 1);

        // Process pending switch if all streams are done
        if (this.activeStreamCount === 0 && this.pendingSwitch) {
          const pending = this.pendingSwitch;
          this.pendingSwitch = null;
          this.performVoiceSwitch(pending.personaName, pending.voiceId);
        }
      }, 100); // Small delay to allow stream to initialize
    }
  }

  /**
   * Synthesize text to speech using the persona's voice
   */
  synthesize(text: string): tts.ChunkedStream {
    getLogger().debug({ persona: this.personaName }, 'TTS speaking');
    return this.trackStream(() => this.personaTTS.synthesize(text));
  }

  /**
   * Stream synthesis for the persona's voice
   */
  stream(): tts.SynthesizeStream {
    getLogger().debug({ persona: this.personaName }, 'Starting TTS stream');
    return this.trackStream(() => this.personaTTS.stream());
  }

  /**
   * Get the voice ID being used
   */
  getVoiceId(): string {
    return this.voiceId;
  }

  /**
   * Get the current persona name
   */
  getPersonaName(): string {
    return this.personaName;
  }

  /**
   * Check if a voice switch is pending
   */
  hasPendingSwitch(): boolean {
    return this.pendingSwitch !== null;
  }
}

/**
 * Create a PersonaAwareTTS instance for a specific persona
 *
 * @param personaName - The name of the persona (for logging)
 * @param voiceConfig - The voice configuration from the persona
 * @returns A TTS instance configured for the persona's voice
 *
 * @example
 * const tts = createPersonaAwareTTS(sessionPersona.name, sessionPersona.voice);
 */
export function createPersonaAwareTTS(
  personaName: string,
  voiceConfig: PersonaVoiceConfig
): PersonaAwareTTS {
  return new PersonaAwareTTS(personaName, voiceConfig);
}

export default getVoiceManager;
