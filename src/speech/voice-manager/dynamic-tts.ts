/**
 * Dynamic TTS
 *
 * TTS implementation that switches voices based on the current agent.
 */

import { tts } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { getCurrentAgent } from '../../tools/handoff/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { VOICES } from './config.js';
import { getVoiceManager, normalizeAgentId } from './manager.js';
import type { VoiceAgentId } from './types.js';

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

  private ttsInstances = new Map<VoiceAgentId, cartesia.TTS>();
  private voiceManager: ReturnType<typeof getVoiceManager>;

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
      getLogger().error(
        { agent: currentAgent, normalizedAgent },
        'No TTS instance found - this should not happen'
      );
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
