/**
 * Voice Configuration
 *
 * Voice configurations for all personas.
 * Voice IDs are loaded dynamically from the voice registry.
 * Model is imported from config/voice-ids.ts (single source of truth).
 */

import { CARTESIA_MODEL } from '../../config/voice-ids.js';
import { getVoiceId } from '../../personas/voice-registry.js';
import type { VoiceAgentId, VoiceConfig } from './types.js';

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
