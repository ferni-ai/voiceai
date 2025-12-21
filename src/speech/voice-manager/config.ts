/**
 * Voice Configuration
 *
 * Voice configurations for all personas with Cartesia Sonic-3 expressiveness settings.
 * Voice IDs are loaded dynamically from the voice registry.
 * Model is imported from config/voice-ids.ts (single source of truth).
 *
 * Each persona has:
 * - defaultEmotion: Their baseline emotional state
 * - emotionRange: Natural emotions they express
 * - defaultSpeed: Speech pace (0.6-1.5)
 * - defaultVolume: Volume (0.5-2.0)
 * - laughterFrequency: How often they laugh
 */

import { CARTESIA_MODEL } from '../../config/voice-ids.js';
import { getVoiceId } from '../../personas/voice-registry.js';
import type { VoiceAgentId, VoiceConfig } from './types.js';

// ============================================================================
// PERSONA EMOTION PROFILES - Better than Human
// ============================================================================

export interface PersonaEmotionProfile {
  defaultEmotion: string;
  emotionRange: string[];
  defaultSpeed: number;
  defaultVolume: number;
  laughterFrequency: number;
  nonverbals: string[];
}

/**
 * Emotion profiles for each persona - makes their voice distinctly human
 */
export const PERSONA_EMOTION_PROFILES: Record<string, PersonaEmotionProfile> = {
  ferni: {
    defaultEmotion: 'affectionate',
    emotionRange: [
      'affectionate',
      'curious',
      'contemplative',
      'sympathetic',
      'proud',
      'wistful',
      'calm',
      'grateful',
    ],
    defaultSpeed: 0.95,
    defaultVolume: 1.0,
    laughterFrequency: 0.15,
    nonverbals: ['[laughter]', '<break time="400ms"/>'],
  },
  'peter-john': {
    defaultEmotion: 'enthusiastic',
    emotionRange: ['enthusiastic', 'curious', 'excited', 'confident', 'playful', 'satisfied'],
    defaultSpeed: 1.05,
    defaultVolume: 1.05,
    laughterFrequency: 0.12,
    nonverbals: ['[chuckle]', '[excited breath]'],
  },
  'alex-chen': {
    defaultEmotion: 'confident',
    emotionRange: ['confident', 'amused', 'helpful', 'calm', 'determined'],
    defaultSpeed: 1.0,
    defaultVolume: 1.0,
    laughterFrequency: 0.08,
    nonverbals: ['[dry chuckle]', '[brief pause]'],
  },
  'maya-santos': {
    defaultEmotion: 'affectionate',
    emotionRange: ['affectionate', 'proud', 'calm', 'grateful', 'sympathetic'],
    defaultSpeed: 0.92,
    defaultVolume: 0.95,
    laughterFrequency: 0.1,
    nonverbals: ['[soft laugh]', '<break time="300ms"/>'],
  },
  'jordan-taylor': {
    defaultEmotion: 'excited',
    emotionRange: ['excited', 'happy', 'affectionate', 'sympathetic', 'curious'],
    defaultSpeed: 1.08,
    defaultVolume: 1.05,
    laughterFrequency: 0.18,
    nonverbals: ['[excited gasp]', '[happy sigh]', '[laughter]'],
  },
  'nayan-patel': {
    defaultEmotion: 'contemplative',
    emotionRange: ['contemplative', 'calm', 'affectionate', 'amused', 'curious'],
    defaultSpeed: 0.85,
    defaultVolume: 0.92,
    laughterFrequency: 0.06,
    nonverbals: ['[thoughtful pause]', '[soft hmm]', '<break time="600ms"/>'],
  },
};

/**
 * Get emotion profile for a persona (with sensible defaults)
 */
export function getEmotionProfile(personaId: string): PersonaEmotionProfile {
  // Normalize persona ID
  const normalized = personaId.toLowerCase().replace(/[_\s]/g, '-');
  return PERSONA_EMOTION_PROFILES[normalized] || PERSONA_EMOTION_PROFILES.ferni;
}

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

/**
 * Voice configurations for all personas.
 * Voice IDs are loaded dynamically from the voice registry.
 * Legacy 'peter' alias included for backward compatibility.
 */
export const VOICES: Record<VoiceAgentId, VoiceConfig> = {
  // Coach
  'jack-b': {
    get id() {
      return getVoiceId('ferni');
    },
    name: 'Ferni',
    model: CARTESIA_MODEL,
    description: 'Confident, friendly coach - orchestrates the team',
  },
  // Team members
  'peter-john': {
    get id() {
      return getVoiceId('peter-john');
    },
    name: 'Peter',
    model: CARTESIA_MODEL,
    description: 'Energetic, animated - the voice of stock picking enthusiasm',
  },
  'comm-specialist': {
    get id() {
      return getVoiceId('alex-chen');
    },
    name: 'Alex',
    model: CARTESIA_MODEL,
    description: 'Professional, efficient - communication specialist',
  },
  'spend-save': {
    get id() {
      return getVoiceId('maya-santos');
    },
    name: 'Maya',
    model: CARTESIA_MODEL,
    description: 'Warm, non-judgmental - spend & save specialist',
  },
  'event-planner': {
    get id() {
      return getVoiceId('jordan-taylor');
    },
    name: 'Jordan',
    model: CARTESIA_MODEL,
    description: 'Enthusiastic, organized - life & event planner',
  },
  // Canonical ID for coach
  ferni: {
    get id() {
      return getVoiceId('ferni');
    },
    name: 'Ferni',
    model: CARTESIA_MODEL,
    description: 'Confident, friendly coach - orchestrates the team',
  },
  // Canonical IDs for team members
  'alex-chen': {
    get id() {
      return getVoiceId('alex-chen');
    },
    name: 'Alex',
    model: CARTESIA_MODEL,
    description: 'Professional, efficient - communication specialist',
  },
  'maya-santos': {
    get id() {
      return getVoiceId('maya-santos');
    },
    name: 'Maya',
    model: CARTESIA_MODEL,
    description: 'Warm, non-judgmental - spend & save specialist',
  },
  'jordan-taylor': {
    get id() {
      return getVoiceId('jordan-taylor');
    },
    name: 'Jordan',
    model: CARTESIA_MODEL,
    description: 'Enthusiastic, organized - life & event planner',
  },
  // Short aliases for team members
  alex: {
    get id() {
      return getVoiceId('alex-chen');
    },
    name: 'Alex',
    model: CARTESIA_MODEL,
    description: 'Professional, efficient - communication specialist',
  },
  maya: {
    get id() {
      return getVoiceId('maya-santos');
    },
    name: 'Maya',
    model: CARTESIA_MODEL,
    description: 'Warm, non-judgmental - spend & save specialist',
  },
  jordan: {
    get id() {
      return getVoiceId('jordan-taylor');
    },
    name: 'Jordan',
    model: CARTESIA_MODEL,
    description: 'Enthusiastic, organized - life & event planner',
  },
  // FIX BUG #voice-3: Added nayan-patel (lifetime advisor)
  'nayan-patel': {
    get id() {
      return getVoiceId('nayan-patel');
    },
    name: 'Nayan',
    model: CARTESIA_MODEL,
    description: 'Calm, wise, meditative - the lifetime advisor and sage',
  },
  nayan: {
    get id() {
      return getVoiceId('nayan-patel');
    },
    name: 'Nayan',
    model: CARTESIA_MODEL,
    description: 'Calm, wise, meditative - the lifetime advisor and sage',
  },
  // Legacy aliases
  peter: {
    get id() {
      return getVoiceId('peter-john');
    },
    name: 'Peter',
    model: CARTESIA_MODEL,
    description: 'Energetic, animated - the voice of stock picking enthusiasm',
  },
};
