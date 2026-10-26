/**
 * The session persona for a live call to a custom agent (CUSTOM_AGENT_LIVE=on).
 *
 * Built from an allowlist, never a spread of the loaded agent: every consumer of
 * the session persona (context builders, greetings, silence fillers, story
 * pickers, handoff briefs) reads these fields, and none may see the owner's raw
 * text. So each field is one of:
 * - system-made (id, voice provider, defaults, numbers clamped to their range);
 * - owner-written and short (name, traits, values), through sanitizeOwnerText;
 * - left out. The owner's description, stories, wisdom, catchphrases, greetings
 *   and story themes reach the model only inside the prompt's profile block
 *   (custom-agent-live-prompt.ts). The persona's `description` is a fixed line.
 *   Stories and catchphrases are omitted on the live path for now, so nothing
 *   speaks them verbatim (meaningful silence, story selection).
 *
 * The voice is the agent's stock voice, or the custom-agent default when the
 * stored one isn't a stock voice (never a clone, never a persona's voice).
 *
 * @module services/custom-agent/custom-agent-live-persona
 */

import type { HumorStyle, PersonaConfig, SpeechCharacteristics } from '../../personas/types.js';
import { buildLiveCustomAgentPrompt } from './custom-agent-live-prompt.js';
import { sanitizeOwnerList, sanitizeOwnerText } from './custom-agent-owner-text.js';
import { DEFAULT_COMMUNICATION, DEFAULT_KNOWLEDGE } from './custom-agent-runtime-service.js';
import {
  isStockCustomAgentVoiceId,
  SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID,
} from './custom-agent-voice-policy.js';

/** Every key a live custom-agent session persona may have. */
export const LIVE_PERSONA_KEYS = [
  'id',
  'name',
  'displayName',
  'description',
  'voice',
  'speechCharacteristics',
  'identity',
  'communication',
  'personality',
  'knowledge',
  'systemPrompt',
] as const;

export const NAME_MAX = 40;
const SHORT_MAX = 40;
const LINE_MAX = 120;
const LIST_MAX = 8;
const HUMOR: readonly HumorStyle[] = ['gentle-teasing', 'observational'];

function unit(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, n));
}

function within(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function speech(s: SpeechCharacteristics | undefined): SpeechCharacteristics {
  return {
    baseSpeedMultiplier: within(s?.baseSpeedMultiplier, 0.7, 1.1, 0.9),
    pauseMultiplier: within(s?.pauseMultiplier, 0.8, 1.4, 1),
    speedVariation: within(s?.speedVariation, 0, 0.3, 0.15),
    thinkingSoundFrequency: unit(s?.thinkingSoundFrequency, 0.3),
    emphasisStyle:
      (['subtle', 'moderate', 'pronounced'] as const).find((v) => v === s?.emphasisStyle) ??
      'moderate',
    sentenceEndingStyle:
      (['falling', 'rising', 'natural'] as const).find((v) => v === s?.sentenceEndingStyle) ??
      'natural',
    minimumEnergy: within(s?.minimumEnergy, 0.5, 1, 0.7),
    maximumEnergy: within(s?.maximumEnergy, 1, 1.5, 1.2),
  };
}

/** `loaded` (customAgentToPersonaConfig's output) as an allowlisted, sanitized live-call persona. */
export function liveCallPersona(loaded: PersonaConfig): PersonaConfig {
  const id = sanitizeOwnerText(loaded.id, 80);
  const name = sanitizeOwnerText(loaded.displayName || loaded.name, NAME_MAX) || 'your character';
  const stored = loaded.voice?.voiceId;
  const voiceId = isStockCustomAgentVoiceId(stored) ? stored : SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID;
  const p = loaded.personality;

  return {
    id,
    name,
    displayName: name,
    description: `${name}, a character the caller created.`,
    voice: {
      voiceId,
      provider: 'cartesia',
      defaultRate: within(loaded.voice?.defaultRate, -1, 1, 0),
      language: 'en',
    },
    speechCharacteristics: speech(loaded.speechCharacteristics),
    identity: {
      id,
      selfReference: name,
      coreValues: sanitizeOwnerList(loaded.identity?.coreValues, SHORT_MAX, LIST_MAX),
      role: sanitizeOwnerText(loaded.identity?.role, SHORT_MAX * 2) || 'supportive companion',
      priorities: sanitizeOwnerList(loaded.identity?.priorities, SHORT_MAX, LIST_MAX),
      desiredUserExperience: sanitizeOwnerText(loaded.identity?.desiredUserExperience, LINE_MAX),
    },
    communication: {
      ...structuredClone(DEFAULT_COMMUNICATION),
      formalityLevel: unit(loaded.communication?.formalityLevel, 0.4),
    },
    personality: {
      warmth: unit(p?.warmth, 0.7),
      humorLevel: unit(p?.humorLevel, 0.3),
      humorStyle: [...HUMOR],
      directness: unit(p?.directness, 0.5),
      energy: unit(p?.energy, 0.5),
      tangentFrequency: unit(p?.tangentFrequency, 0.2),
      traits: sanitizeOwnerList(p?.traits, SHORT_MAX, LIST_MAX),
      boundaries: [],
      moodsByTime: [],
    },
    knowledge: structuredClone(DEFAULT_KNOWLEDGE),
    systemPrompt: buildLiveCustomAgentPrompt(loaded),
  };
}
