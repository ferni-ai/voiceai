/**
 * Voice Manager
 * 
 * Manages TTS voice switching between Jack Bogle and Peter Lynch.
 * Uses Cartesia's API to switch voices mid-session.
 */

import { log } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { PETER_LYNCH_VOICE_ID, JACK_BOGLE_VOICE_ID } from '../agents/peter-lynch.js';
import { handoffEvents, getCurrentAgent } from '../tools/handoff.js';

const getLogger = () => log();

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

export interface VoiceConfig {
  id: string;
  name: string;
  model: string;
  description: string;
}

export const VOICES: Record<'jack' | 'peter', VoiceConfig> = {
  jack: {
    id: JACK_BOGLE_VOICE_ID,
    name: 'Jack Bogle',
    model: 'sonic-3',
    description: 'Wise, calm, grandfatherly - the voice of index fund investing',
  },
  peter: {
    id: PETER_LYNCH_VOICE_ID,
    name: 'Peter Lynch',
    model: 'sonic-3',
    description: 'Energetic, animated - the voice of stock picking enthusiasm',
  },
};

// ============================================================================
// VOICE MANAGER
// ============================================================================

class VoiceManager {
  private currentVoice: 'jack' | 'peter' = 'jack';
  private ttsInstances: Map<string, cartesia.TTS> = new Map();
  private initialized = false;

  constructor() {
    // Listen for handoff events
    handoffEvents.on('voiceSwitch', (data: { newAgent: 'jack' | 'peter'; voiceId: string }) => {
      this.switchVoice(data.newAgent);
    });
  }

  /**
   * Initialize TTS instances for both voices
   */
  initialize(): void {
    if (this.initialized) return;

    // Create TTS instance for Jack
    this.ttsInstances.set('jack', new cartesia.TTS({
      model: VOICES.jack.model,
      voice: VOICES.jack.id,
    }));

    // Create TTS instance for Peter
    this.ttsInstances.set('peter', new cartesia.TTS({
      model: VOICES.peter.model,
      voice: VOICES.peter.id,
    }));

    this.initialized = true;
    getLogger().info('Voice manager initialized with Jack and Peter voices');
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
    return this.ttsInstances.get(this.currentVoice)!;
  }

  /**
   * Switch to a different voice
   */
  switchVoice(agent: 'jack' | 'peter'): void {
    if (this.currentVoice === agent) {
      getLogger().debug({ agent }, 'Already using this voice');
      return;
    }

    const oldVoice = this.currentVoice;
    this.currentVoice = agent;

    getLogger().info({
      from: VOICES[oldVoice].name,
      to: VOICES[agent].name,
      voiceId: VOICES[agent].id,
    }, '🎤 Voice switched');

    console.log(`\n🎤 [VOICE SWITCH] ${VOICES[oldVoice].name} → ${VOICES[agent].name}`);
  }

  /**
   * Get the voice ID for the current agent
   */
  getVoiceId(): string {
    return VOICES[this.currentVoice].id;
  }

  /**
   * Check if we should use Peter's voice
   */
  isPeter(): boolean {
    return this.currentVoice === 'peter' || getCurrentAgent() === 'peter';
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
  voiceManagerInstance = null;
}

export default getVoiceManager;

