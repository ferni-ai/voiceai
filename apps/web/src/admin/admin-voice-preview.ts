/**
 * Admin Voice Preview
 *
 * Plays a short sample of an agent's voice. There is no admin voice-sample
 * route; the server's persona TTS route (`POST /api/landing/tts`, Cartesia,
 * resolves the voice from `personaId`) is the one that exists, so we use it.
 *
 * @module AdminVoicePreview
 */

import { createLogger } from '../utils/logger.js';
import { toast } from '../ui/whisper.ui.js';

const log = createLogger('AdminVoicePreview');

/** The server route that turns text into a persona's voice (audio/mpeg). */
export const VOICE_PREVIEW_ROUTE = '/api/landing/tts';

export async function previewAgentVoice(agentId: string): Promise<void> {
  log.debug({ agentId }, 'Previewing agent voice');
  toast.info(`Playing ${agentId}'s voice`);

  try {
    const response = await fetch(VOICE_PREVIEW_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Hi there, I'm ${agentId}. How can I help you today?`,
        personaId: agentId,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      toast.success('Preview done');
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      toast.error("Couldn't play voice preview");
    };
    await audio.play();
  } catch (error) {
    log.error({ error, agentId }, 'Voice preview failed');
    toast.error('Voice not available for this agent');
  }
}
