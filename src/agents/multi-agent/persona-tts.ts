/**
 * The text-to-speech engine a persona agent speaks with.
 *
 * @module agents/multi-agent/persona-tts
 */
import { voice } from '@livekit/agents';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import * as voiceManagerModule from '../../speech/voice-manager.js';
import { resolveVoiceId } from '../../tools/handoff/voice-id-resolver.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * Create TTS engine with persona's voice.
 * Uses the same PersonaAwareTTS pattern as voice-agent-entry.ts
 *
 * VOICE ID FIX: Use resolveVoiceId for single source of truth
 */
export async function createPersonaTTS(personaId: string) {
  // voiceManagerModule and resolveVoiceId now hoisted to module level
  // VOICE ID FIX: Use resolver as single source of truth
  const voiceIdResult = resolveVoiceId({ personaId }, { logLevel: 'info' });
  let voiceId: string;

  if (voiceIdResult.success) {
    voiceId = voiceIdResult.voiceId;
    log.info(
      { personaId, voiceId, source: voiceIdResult.source },
      '🎭 Voice ID resolved via single source of truth'
    );
  } else {
    // Fallback when voice ID resolution fails
    log.warn({ personaId }, '⚠️ Voice ID resolution failed - using fallback getVoiceId');
    voiceId = getVoiceId(personaId); // Emergency fallback
  }

  const voiceName = getPersonaDisplayName(personaId);

  // Log the voice ID we're using - this is critical for debugging
  log.info({ personaId, voiceId, voiceName }, '🎭 Creating TTS with Cartesia voice');

  // Use PersonaAwareTTS (supports voice switching)
  const baseTTS = voiceManagerModule.createPersonaAwareTTS(voiceName, {
    voiceId,
    accent: 'american',
    isLocalizedVoice: false,
  });

  log.info({ personaId, ttsVoiceId: baseTTS.getVoiceId?.() || 'N/A' }, '🎭 TTS created');

  // 🔊 E2E TRACING: Wrap TTS to log all synthesis calls
  // This shows exactly when and what text is sent to TTS
  const debugTTS =
    process.env.DEBUG_TTS_PIPELINE === 'true' || process.env.DEBUG_GEMINI_ALL === 'true';

  if (debugTTS) {
    // Create a proxy that logs all method calls
    const ttsProxy = new Proxy(baseTTS, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];

        // Wrap synthesize method
        if (prop === 'synthesize' && typeof value === 'function') {
          return async function (...args: unknown[]) {
            const text = String(args[0] || '');
            const timestamp = new Date().toISOString();
            process.stderr.write(`\n${'='.repeat(60)}\n`);
            process.stderr.write(`🔊 [TTS SYNTHESIZE] ${timestamp}\n`);
            process.stderr.write(
              `  📝 Text: "${text.slice(0, 200)}${text.length > 200 ? '...' : ''}"\n`
            );
            process.stderr.write(`  🎙️ Voice: ${voiceId}\n`);
            process.stderr.write(`  📏 Length: ${text.length} chars\n`);
            process.stderr.write(`${'='.repeat(60)}\n`);

            const startTime = Date.now();
            try {
              const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
              process.stderr.write(`  ✅ TTS synthesize completed: ${Date.now() - startTime}ms\n`);
              return result;
            } catch (err) {
              process.stderr.write(`  ❌ TTS synthesize FAILED: ${String(err)}\n`);
              throw err;
            }
          };
        }

        // Wrap stream method
        if (prop === 'stream' && typeof value === 'function') {
          return function (...args: unknown[]) {
            const timestamp = new Date().toISOString();
            process.stderr.write(`\n🔊 [TTS STREAM START] ${timestamp}\n`);
            process.stderr.write(`  🎙️ Voice: ${voiceId}\n`);

            try {
              const result = (value as (...a: unknown[]) => unknown).apply(target, args);
              process.stderr.write(`  ✅ TTS stream created\n`);
              return result;
            } catch (err) {
              process.stderr.write(`  ❌ TTS stream FAILED: ${String(err)}\n`);
              throw err;
            }
          };
        }

        // Return other properties as-is
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
    });

    log.info({ personaId }, '🔊 TTS wrapped with E2E tracing');
    return ttsProxy;
  }

  return baseTTS;
}
