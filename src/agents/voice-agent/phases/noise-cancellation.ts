/**
 * Noise Cancellation Setup Phase
 *
 * Configures Krisp-powered noise cancellation for voice sessions.
 * This improves STT accuracy by removing background noise appropriately
 * for different connection types.
 *
 * Noise Cancellation Types:
 * - Web: Uses Krisp BVC (Background Voice Cancellation) - removes AC, fans, keyboard
 * - Phone: Uses telephony-optimized noise cancellation
 *
 * Note: Connection type detection is in connect-room.ts (detectConnectionType)
 *
 * @module voice-agent/phases/noise-cancellation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NoiseCancellationConfig {
  /** Whether this is a phone call (use telephony NC) */
  isPhoneCall: boolean;
}

export interface NoiseCancellationResult {
  /** Input options for session.start() with noise cancellation */
  inputOptions: unknown;
  /** Whether noise cancellation was successfully configured */
  enabled: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Configure noise cancellation based on connection type.
 *
 * @param config - Noise cancellation configuration
 * @returns Input options for session.start()
 */
export async function setupNoiseCancellation(
  config: NoiseCancellationConfig
): Promise<NoiseCancellationResult> {
  const { isPhoneCall } = config;

  let inputOptions: unknown = undefined;
  let enabled = false;

  try {
    const noiseCancellation = await import('@livekit/noise-cancellation-node');

    if (isPhoneCall) {
      // Phone calls: Use telephony-optimized noise cancellation
      inputOptions = {
        noiseCancellation: noiseCancellation.TelephonyBackgroundVoiceCancellation(),
      };
      process.stderr.write(
        `[noise-cancellation] 📞 Phone call - telephony noise cancellation enabled\n`
      );
    } else {
      // Web connections: Use Krisp BVC (Background Voice Cancellation)
      // This is the BEST option for web - removes AC, fans, keyboard, etc.
      inputOptions = { noiseCancellation: noiseCancellation.BackgroundVoiceCancellation() };
      process.stderr.write(
        `[noise-cancellation] 🔇 Web connection - Krisp BVC noise cancellation enabled\n`
      );
    }
    enabled = true;
  } catch (err) {
    process.stderr.write(`[noise-cancellation] ⚠️ Noise cancellation not available: ${err}\n`);
  }

  return { inputOptions, enabled };
}
