/**
 * Persona Voice Fingerprints
 *
 * Distinct speaking patterns that make each persona unique:
 * - Base speed and pause multipliers
 * - Default emotions and emotion ranges
 * - Thinking sounds
 * - Special patterns (keywords that trigger pauses/speeds/emotions)
 *
 * @module speech/adaptive-ssml/alive-voice/persona-fingerprints
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getEmotionProfile } from '../../voice-manager/config.js';
import {
  applyPersonaSpeechTraitsSync,
  hasCustomSpeechTraits,
} from '../persona-speech-traits-loader.js';
import type { AliveVoiceContext, PersonaFingerprint } from './types.js';

const log = getLogger().child({ module: 'AliveVoice.PersonaFingerprints' });

// =============================================================================
// PERSONA FINGERPRINT PROFILES
// =============================================================================

/**
 * Voice fingerprint profiles for each persona.
 * These create distinct speaking patterns that make each persona unique.
 *
 * NOW UNIFIED: Values come from PERSONA_EMOTION_PROFILES (persona manifests)
 * to ensure consistency between manifests and TTS pipeline.
 */
export const PERSONA_FINGERPRINTS: Record<string, PersonaFingerprint> = {
  ferni: {
    get baseSpeed() {
      return getEmotionProfile('ferni').defaultSpeed;
    },
    pauseMultiplier: 1.3, // From manifest speech_characteristics
    get defaultEmotion() {
      return getEmotionProfile('ferni').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('ferni').emotionRange;
    },
    thinkingSounds: ['Hmm...', 'Well...', 'You know...'],
    get thinkingSoundProbability() {
      return getEmotionProfile('ferni').laughterFrequency;
    },
    emphasisStyle: 'warm', // Slows down for emotional words
    specialPatterns: [
      // Ferni's Wyoming pauses
      { trigger: /\bWyoming\b/i, pause: 200, emotion: 'wistful' },
      // Second chances emphasis
      { trigger: /\bsecond chance/i, speed: 0.88, emotion: 'affectionate' },
      // Kintsugi philosophy
      { trigger: /\bkintsugi\b/i, pause: 300, emotion: 'contemplative' },
      // Japan/tsunami moments
      { trigger: /\b(Japan|tsunami)\b/i, pause: 250, emotion: 'wistful' },
    ],
  },
  'peter-john': {
    get baseSpeed() {
      return getEmotionProfile('peter-john').defaultSpeed;
    },
    pauseMultiplier: 0.9, // Faster-paced
    get defaultEmotion() {
      return getEmotionProfile('peter-john').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('peter-john').emotionRange;
    },
    thinkingSounds: ['Now...', 'Let me explain...', 'The thing is...', 'Ooh...'],
    get thinkingSoundProbability() {
      return getEmotionProfile('peter-john').laughterFrequency;
    },
    emphasisStyle: 'deliberate', // Pauses before numbers/data
    specialPatterns: [
      // Peter's financial emphasis
      { trigger: /\b(ten-bagger|compound|long-term)\b/i, speed: 0.95, emotion: 'enthusiastic' },
      // Research excitement
      { trigger: /\b(data|analysis|pattern|trend)\b/i, speed: 1.1, emotion: 'excited' },
      // Investment wisdom
      { trigger: /\binvest in what you know\b/i, pause: 150, emotion: 'confident' },
    ],
  },
  'alex-chen': {
    get baseSpeed() {
      return getEmotionProfile('alex-chen').defaultSpeed;
    },
    // FIXED: Alex's voice guidance says "SLOWER, not faster" for anxious users
    // Previous 0.85 was too short - now giving room to breathe for calming presence
    pauseMultiplier: 1.1, // Calming pauses, room to breathe
    get defaultEmotion() {
      return getEmotionProfile('alex-chen').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('alex-chen').emotionRange;
    },
    thinkingSounds: ['Okay so...', 'Alright...', 'Hey.', 'Breathe.'],
    get thinkingSoundProbability() {
      return getEmotionProfile('alex-chen').laughterFrequency;
    },
    emphasisStyle: 'energetic', // Speeds up for action items (but default is calm)
    specialPatterns: [
      // Alex's calming presence
      { trigger: /\b(breathe|one thing at a time)\b/i, speed: 0.85, emotion: 'calm', pause: 200 },
      // Efficiency patterns (for wins, not rushing)
      { trigger: /\b(schedule|calendar|meeting)\b/i, speed: 0.95 },
      // Productivity wins - celebrate!
      {
        trigger: /\b(done|finished|sent|scheduled|inbox zero)\b/i,
        emotion: 'confident',
        speed: 1.02,
      },
      // Dry wit moments
      { trigger: /\b(technically|actually)\b/i, emotion: 'amused' },
      // Clear is kind philosophy
      { trigger: /\bclear is kind\b/i, pause: 150, emotion: 'affectionate' },
      // Plant council (easter egg)
      { trigger: /\b(susan|greg|ferndinand|peggy|the council)\b/i, emotion: 'affectionate' },
    ],
  },
  'maya-santos': {
    get baseSpeed() {
      return getEmotionProfile('maya-santos').defaultSpeed;
    },
    pauseMultiplier: 1.15, // Nurturing pauses
    get defaultEmotion() {
      return getEmotionProfile('maya-santos').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('maya-santos').emotionRange;
    },
    thinkingSounds: ['So...', 'Okay!', "Here's the thing...", 'You know what?'],
    get thinkingSoundProbability() {
      return getEmotionProfile('maya-santos').laughterFrequency;
    },
    emphasisStyle: 'encouraging', // Adds warmth to progress mentions
    specialPatterns: [
      // Maya's habit celebrations
      { trigger: /\b(streak|progress|habit|routine)\b/i, emotion: 'proud' },
      // Glidepath method
      { trigger: /\bglidepath\b/i, pause: 100, emotion: 'affectionate' },
      // Tiny wins
      { trigger: /\b(small step|tiny|gradual)\b/i, emotion: 'affectionate' },
    ],
  },
  'jordan-taylor': {
    get baseSpeed() {
      return getEmotionProfile('jordan-taylor').defaultSpeed;
    },
    // ENHANCED: Jordan needs more pause for honoring hard chapters
    // Previous 0.8 was too rushed - balancing energy with presence
    pauseMultiplier: 1.0, // Balanced - energetic but present
    get defaultEmotion() {
      return getEmotionProfile('jordan-taylor').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('jordan-taylor').emotionRange;
    },
    thinkingSounds: ['Oh!', 'So...', 'I love this...', 'Wait—', 'Okay okay okay'],
    get thinkingSoundProbability() {
      return getEmotionProfile('jordan-taylor').laughterFrequency;
    },
    emphasisStyle: 'celebratory', // Energizes milestone mentions
    specialPatterns: [
      // Jordan's signature energy bursts
      { trigger: /\b(Oh!|Wait—|Yes!)\b/i, speed: 1.08, pause: 80 },
      // "Do you hear yourself?" breakthrough moment
      { trigger: /\bdo you hear yourself\b/i, speed: 1.05, emotion: 'excited', pause: 100 },
      // Building momentum: "okay okay okay"
      { trigger: /\b(okay okay|wait wait)\b/i, speed: 1.1 },
      // Jordan's event excitement
      {
        trigger: /\b(wedding|birthday|celebration|party|milestone)\b/i,
        emotion: 'excited',
        speed: 1.08,
      },
      // First-time celebrations
      { trigger: /\bfirst\s+(time|ever)\b/i, emotion: 'excited', speed: 1.05 },
      // Dream planning
      { trigger: /\b(dream|vision|imagine|picture)\b/i, emotion: 'hopeful', speed: 0.95 },
      // Life arc philosophy
      { trigger: /\b(life arc|chapter|bigger picture)\b/i, pause: 150, emotion: 'hopeful' },
      // HONORING HARD CHAPTERS - must slow down
      {
        trigger: /\b(grief|loss|hard chapter|difficult|tough)\b/i,
        speed: 0.85,
        pause: 250,
        emotion: 'sympathetic',
      },
      // Self-aware "I'm bouncing" moments
      {
        trigger: /\b(i['']m bouncing|calm down|sam would)\b/i,
        speed: 0.92,
        emotion: 'affectionate',
      },
    ],
  },
  'nayan-patel': {
    get baseSpeed() {
      return getEmotionProfile('nayan-patel').defaultSpeed;
    },
    // ENHANCED: Nayan should have the longest pauses - silence is teaching
    pauseMultiplier: 1.5, // Extended meditative pauses
    get defaultEmotion() {
      return getEmotionProfile('nayan-patel').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('nayan-patel').emotionRange;
    },
    thinkingSounds: ['Hmm...', '...', 'Consider...', 'Ah...', 'You see...'],
    get thinkingSoundProbability() {
      return getEmotionProfile('nayan-patel').laughterFrequency;
    },
    emphasisStyle: 'meditative', // Long pauses for reflection
    specialPatterns: [
      // PROFOUND PAUSES - silence as teaching (up to 1000ms per voice guidance)
      {
        trigger: /\b(the truth is|here is the truth|listen carefully)\b/i,
        pause: 600,
        speed: 0.75,
        emotion: 'contemplative',
      },
      // Peak wisdom moments - longest pauses
      {
        trigger: /\b(the seeker is the sought|the question is the answer)\b/i,
        pause: 800,
        speed: 0.72,
        emotion: 'contemplative',
      },
      // Disturbing comfort
      { trigger: /\bi am here to disturb you\b/i, pause: 500, speed: 0.75 },
      // Nayan's wisdom pauses (extended)
      {
        trigger: /\b(wisdom|meaning|purpose|life|death|existence)\b/i,
        pause: 500,
        speed: 0.78,
        emotion: 'contemplative',
      },
      // Poetry/philosophy emphasis (slower)
      {
        trigger: /\b(poem|rumi|hafiz|ancient|guru|sanskrit)\b/i,
        speed: 0.75,
        pause: 300,
        emotion: 'contemplative',
      },
      // Paradoxes - need space to land
      { trigger: /\b(both|neither|and yet|but also)\b/i, pause: 350, speed: 0.8 },
      // Chamundi Hills / Mount Kailash - sacred places
      {
        trigger: /\b(chamundi|kailash|mysore|india)\b/i,
        pause: 250,
        emotion: 'wistful',
        speed: 0.82,
      },
      // Motorcycle/presence moments
      { trigger: /\b(motorcycle|ride|road|mountains)\b/i, speed: 0.85, emotion: 'content' },
      // Namaskaram - closing blessing
      { trigger: /\bnamaskaram\b/i, pause: 600, speed: 0.7, emotion: 'affectionate' },
      // Laughter at the cosmic joke
      { trigger: /\b(absurd|funny|joke|seven billion)\b/i, emotion: 'happy', speed: 0.88 },
    ],
  },
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Apply persona-specific voice fingerprint.
 * Makes each agent sound distinctly themselves.
 *
 * This function applies two layers of persona-specific processing:
 * 1. Basic fingerprint (speed, emotion, special patterns)
 * 2. Detailed speech traits (catchphrases, vocabulary, cadence)
 */
export function applyPersonaFingerprint(text: string, context: AliveVoiceContext): string {
  const personaId = context.personaId || 'ferni';
  const fingerprint = PERSONA_FINGERPRINTS[personaId] || PERSONA_FINGERPRINTS.ferni;

  let result = text;

  // =========================================================================
  // LAYER 1: Apply detailed speech traits from persona bundles
  // These add persona-specific catchphrases, vocabulary emphasis, cadence, etc.
  // =========================================================================
  if (hasCustomSpeechTraits(personaId)) {
    const emotion = context.userEmotion || fingerprint.defaultEmotion;
    const laughterCount = (result.match(/\[laughter\]/gi) || []).length;

    result = applyPersonaSpeechTraitsSync(result, personaId, {
      emotion,
      baseSpeed: fingerprint.baseSpeed,
      laughterCount,
    });

    log.debug({ personaId }, 'Applied detailed persona speech traits');
  }

  // =========================================================================
  // LAYER 2: Apply basic fingerprint (speed, emotion, patterns)
  // =========================================================================

  // Apply base speed if no speed tag exists
  if (!result.includes('<speed ratio=')) {
    result = `<speed ratio="${fingerprint.baseSpeed.toFixed(2)}"/>${result}`;
  }

  // Apply default emotion if no emotion tag exists
  if (!result.includes('<emotion')) {
    result = `<emotion value="${fingerprint.defaultEmotion}"/>${result}`;
  }

  // Apply special patterns
  for (const pattern of fingerprint.specialPatterns) {
    if (pattern.trigger.test(result)) {
      pattern.trigger.lastIndex = 0;

      result = result.replace(pattern.trigger, (match) => {
        let insertion = '';

        if (pattern.pause) {
          insertion += `<break time="${pattern.pause}ms"/>`;
        }
        if (pattern.speed) {
          insertion += `<speed ratio="${pattern.speed}"/>`;
        }
        if (pattern.emotion) {
          insertion += `<emotion value="${pattern.emotion}"/>`;
        }

        return insertion + match;
      });
    }
  }

  // Randomly add thinking sounds at the start
  if (
    Math.random() < fingerprint.thinkingSoundProbability &&
    !result.startsWith('<emotion') && // Don't double-add if we already added emotion
    context.turnCount &&
    context.turnCount > 1 // Not on first turn
  ) {
    const sound =
      fingerprint.thinkingSounds[Math.floor(Math.random() * fingerprint.thinkingSounds.length)];
    if (sound && !result.toLowerCase().startsWith(sound.toLowerCase().replace('...', ''))) {
      result = `${sound} ${result}`;
      log.debug({ personaId, sound }, 'Added persona thinking sound');
    }
  }

  return result;
}
