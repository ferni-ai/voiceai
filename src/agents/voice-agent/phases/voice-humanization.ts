/**
 * Voice Humanization Setup Phase
 *
 * Initializes voice humanization features that make the agent feel more human.
 * This includes prosody variation, micro-interruption detection, and laughter recognition.
 *
 * @module voice-agent/phases/voice-humanization
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceHumanizationConfig {
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Session object with interrupt capability */
  session: { interrupt: () => void };
}

export interface VoiceHumanizationResult {
  /** Cleanup function for voice humanization */
  cleanup: (() => void) | null;
  /** Whether humanization was successfully initialized */
  enabled: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Sets up voice humanization features for the session.
 *
 * Voice humanization makes the agent feel more human through:
 * - Prosody variation (pitch, speed, emphasis)
 * - Micro-interruption detection (user tries to interject)
 * - Laughter recognition (detects user laughter type)
 *
 * This is a non-critical feature - failures are logged but don't break the session.
 *
 * @param config - Voice humanization configuration
 * @returns Result with cleanup function
 */
export async function setupVoiceHumanization(
  config: VoiceHumanizationConfig
): Promise<VoiceHumanizationResult> {
  const { sessionId, personaId, session } = config;

  try {
    const { getEmotionalArcTracker } = await import('../../../conversation/index.js');
    const { quickSetupVoiceHumanization } =
      await import('../../integrations/voice-humanization-integration.js');

    const emotionalArcTracker = getEmotionalArcTracker();

    const voiceHumanization = quickSetupVoiceHumanization(
      sessionId,
      personaId,
      emotionalArcTracker,
      {
        onInterrupt: () => {
          // When micro-interruption detected, interrupt the agent
          process.stderr.write(`[voice-humanization] 🛑 Micro-interruption detected\n`);
          try {
            session.interrupt();
          } catch {
            // Ignore interrupt errors
          }
        },
        onLaughter: (laughType: string) => {
          process.stderr.write(`[voice-humanization] 😄 User laughter detected: ${laughType}\n`);
        },
      }
    );

    process.stderr.write(`[voice-humanization] 🎤 Voice humanization initialized\n`);

    return {
      cleanup: voiceHumanization.cleanup,
      enabled: true,
    };
  } catch (err) {
    process.stderr.write(`[voice-humanization] Init failed (non-fatal): ${err}\n`);
    return {
      cleanup: null,
      enabled: false,
    };
  }
}
