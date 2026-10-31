/**
 * Delete a custom agent and everything made from it.
 *
 * deleteCustomAgent removes the Firestore doc (memories and journal live on it),
 * but the agent's cloned voice stayed in our Cartesia account and its voice
 * samples, journal recordings and previews stayed in GCS. This deletes all three.
 *
 * Only the agent's own clone is deleted at Cartesia: a voice the clone route
 * wrote (`type: 'cloned'`), never a stock library voice, a Ferni persona's
 * voice or a retired clone, since those are shared and would break every
 * agent or persona that speaks in them.
 *
 * The doc goes first, so a failed cleanup never leaves an agent the owner
 * can't delete; cleanup failures are logged with ids for removal by hand.
 *
 * @module services/custom-agent/custom-agent-erase
 */

import type { CustomAgentVoice } from '../../types/custom-agent-api.js';
import { createLogger } from '../../utils/safe-logger.js';
import { deleteCartesiaVoice, type CartesiaVoiceDeleteResult } from './cartesia-voice-delete.js';
import { deleteCustomAgent, getCustomAgent } from './custom-agent-persistence-service.js';
import {
  isForbiddenCustomAgentVoiceId,
  isStockCustomAgentVoiceId,
} from './custom-agent-voice-policy.js';
import { deleteAgentAudioFiles } from './gcs-storage-service.js';

const log = createLogger({ module: 'CustomAgentErase' });

export interface CustomAgentEraseDeps {
  getCustomAgent: typeof getCustomAgent;
  deleteCustomAgent: typeof deleteCustomAgent;
  deleteCartesiaVoice: (voiceId: string) => Promise<CartesiaVoiceDeleteResult>;
  deleteAgentAudioFiles: typeof deleteAgentAudioFiles;
}

const productionDeps: CustomAgentEraseDeps = {
  getCustomAgent,
  deleteCustomAgent,
  deleteCartesiaVoice: async (voiceId) => deleteCartesiaVoice(voiceId),
  deleteAgentAudioFiles,
};

/** The agent's own clone id, if its voice is one Cartesia should forget. */
export function ownCloneVoiceId(voice: Partial<CustomAgentVoice> | undefined): string | null {
  const voiceId = voice?.voiceId;
  if (voice?.type !== 'cloned' || typeof voiceId !== 'string' || !voiceId) return null;
  if (isStockCustomAgentVoiceId(voiceId) || isForbiddenCustomAgentVoiceId(voiceId)) return null;
  return voiceId;
}

export interface CustomAgentEraseResult {
  found: boolean;
  clone: CartesiaVoiceDeleteResult | 'none';
  audioFilesDeleted: number;
}

/** Delete the agent, its own Cartesia clone and its GCS audio. `found: false` when there's no such agent. */
export async function eraseCustomAgent(
  userId: string,
  agentId: string,
  deps: CustomAgentEraseDeps = productionDeps
): Promise<CustomAgentEraseResult> {
  const agent = await deps.getCustomAgent(userId, agentId);
  if (!agent) return { found: false, clone: 'none', audioFilesDeleted: 0 };

  if (!(await deps.deleteCustomAgent(userId, agentId))) {
    return { found: false, clone: 'none', audioFilesDeleted: 0 };
  }

  const cloneId = ownCloneVoiceId(agent.voice);
  const [clone, audioFilesDeleted] = await Promise.all([
    cloneId ? deps.deleteCartesiaVoice(cloneId) : Promise.resolve('none' as const),
    deps.deleteAgentAudioFiles(userId, agentId),
  ]);
  if (clone === 'failed') {
    log.error(
      { userId, agentId, voiceId: cloneId },
      'Agent deleted but its Cartesia clone was not'
    );
  }
  log.info({ userId, agentId, clone, audioFilesDeleted }, 'Custom agent erased');
  return { found: true, clone, audioFilesDeleted };
}
