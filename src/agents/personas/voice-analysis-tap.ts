/**
 * Voice Analysis Tap
 *
 * Runs the background voice analysis for a persona agent on its branch of
 * the tee'd user audio (see PersonaVoiceAgent.sttNode in ferni-agent.ts).
 * It populates userData.voiceEmotion and userData.voiceBiomarkers, which
 * turn-handler.ts reads, and never delays transcription: every failure is
 * non-critical and only logged.
 *
 * Extracted from ferni-agent.ts; behavior is unchanged.
 *
 * @module agents/personas/voice-analysis-tap
 */

import type { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { loadVoiceBaseline } from '../../services/trust-systems/voice-prosody-learning.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { UserData } from '../shared/types.js';
import { processAudioStream, utteranceEndsOf } from '../voice-agent/audio-processor.js';

const log = createLogger({ module: 'FerniAgent' });

/** Start analyzing the caller's voice from this audio branch (fire and forget). */
export function startVoiceAnalysis<T>(
  audioForProcessor: NodeReadableStream<AudioFrame>,
  session: voice.AgentSession<T>
): void {
  const userData = session.userData as UserData | undefined;
  const sessionId = (userData?.services as { sessionId?: string } | undefined)?.sessionId ?? '';
  const userId = userData?.userId as string | undefined;

  const sendDataMessage = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    try {
      const { getFrontendPublisher } = await import('../realtime/index.js');
      const pub = getFrontendPublisher();
      if (pub?.isConnected()) await pub.sendData(type, payload);
    } catch {
      // Non-critical — frontend publisher may not be initialized yet
    }
  };

  // Background audio processing — populates userData.voiceEmotion and userData.voiceBiomarkers
  // The caller's own usual voice, to hear how they sound today against it
  if (userId) {
    void loadVoiceBaseline(userId).catch((e) =>
      log.debug({ error: String(e) }, 'Voice baseline load (non-critical)')
    );
  }

  void processAudioStream(audioForProcessor, {
    sessionId,
    userId,
    userData,
    sendDataMessage,
    utteranceEnds: utteranceEndsOf(session),
  }).catch((e) => log.debug({ error: String(e) }, 'Audio processor (non-critical)'));
}
