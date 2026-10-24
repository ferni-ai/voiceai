/**
 * Which voices a custom agent may speak in.
 *
 * A custom agent is private, but its voice id used to be whatever the client
 * sent: the agent PUT merged any `voice.voiceId`, select-premade stored any id
 * as ready, and the runtime spoke in it unchecked. The retired clones of real
 * people (RETIRED_CLONE_VOICE_IDS) and every Ferni persona's voice id are in
 * this public repo, so a crafted request could make an agent speak as them.
 *
 * An agent may use a stock library voice listed here, or its own clone (only
 * the clone route writes `type: 'cloned'`), and never a retired clone or a
 * persona's voice. Checked when the voice is written and again at runtime.
 *
 * @module services/custom-agent/custom-agent-voice-policy
 */

import {
  getVoiceIdForPersona,
  isValidVoiceId,
  LEGACY_FERNI_IVC_VOICE_ID,
  LESTER_PRO_V3_VOICE_ID,
  RETIRED_CLONE_VOICE_IDS,
  VOICE_IDS,
} from '../../config/voice-ids.js';
import type { CustomAgentVoice } from '../../types/custom-agent-api.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  CUSTOM_AGENT_VOICE_CATALOG,
  DEFAULT_CUSTOM_AGENT_VOICE_ID,
  LEGACY_CUSTOM_AGENT_VOICE_IDS,
} from './custom-agent-voice-catalog.js';

const log = createLogger({ module: 'CustomAgentVoicePolicy' });

/**
 * Stock Cartesia voices a custom agent may speak in: the catalog people pick from, plus
 * the voices offered before it (so agents already using one keep it). The old list's
 * "Dr. Chen" pointed at a voice Cartesia has archived; agents stored with it get the default.
 */
export const CUSTOM_AGENT_STOCK_VOICE_IDS: ReadonlySet<string> = new Set([
  ...CUSTOM_AGENT_VOICE_CATALOG.map((v) => v.voiceId),
  ...LEGACY_CUSTOM_AGENT_VOICE_IDS,
]);

/** What the runtime speaks in when an agent's stored voice isn't allowed. */
export const SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID = DEFAULT_CUSTOM_AGENT_VOICE_ID;

const PERSONA_IDS = [
  'ferni',
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
  'joel-dickson',
  'peter-lynch',
  'john-bogle',
  'generic-advisor',
];

/** A retired clone, or a voice a Ferni persona speaks in (env overrides included). */
export function isForbiddenCustomAgentVoiceId(voiceId: string): boolean {
  if (RETIRED_CLONE_VOICE_IDS.has(voiceId)) return true;
  const personaVoices = new Set<string>([
    ...Object.values(VOICE_IDS),
    LEGACY_FERNI_IVC_VOICE_ID,
    LESTER_PRO_V3_VOICE_ID,
    ...PERSONA_IDS.map((id) => getVoiceIdForPersona(id)),
  ]);
  return personaVoices.has(voiceId);
}

/** Whether select-premade may store this id. */
export function isStockCustomAgentVoiceId(voiceId: unknown): voiceId is string {
  return typeof voiceId === 'string' && CUSTOM_AGENT_STOCK_VOICE_IDS.has(voiceId);
}

/** Whether a custom agent may speak in its stored voice. */
export function customAgentVoiceAllowed(voice: Partial<CustomAgentVoice> | undefined): boolean {
  const voiceId = voice?.voiceId;
  if (!voiceId || !isValidVoiceId(voiceId) || isForbiddenCustomAgentVoiceId(voiceId)) return false;
  if (voice.type === 'cloned') return voice.status === 'ready';
  return CUSTOM_AGENT_STOCK_VOICE_IDS.has(voiceId);
}

/**
 * The voice the runtime speaks in: the stored one if allowed, else the default
 * (a stored voice may predate the write checks, or have been tampered with).
 */
export function runtimeVoiceId(
  agentId: string,
  voice: Partial<CustomAgentVoice> | undefined
): string {
  const voiceId = voice?.voiceId;
  if (voiceId && customAgentVoiceAllowed(voice)) return voiceId;
  log.warn(
    { agentId, voiceId: (voiceId ?? '').slice(0, 64), voiceType: voice?.type },
    'Custom agent voice not allowed, using the default voice'
  );
  return SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID;
}
