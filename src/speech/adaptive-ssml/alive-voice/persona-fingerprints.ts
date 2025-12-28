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
import {
  getEnergyMatchedPacing,
  getLateNightPacing,
  selectLaughterResponseSync,
} from '../../humanization/behavior-loader.js';
import type { BehaviorSelectionContext } from '../../humanization/types.js';
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
    pauseMultiplier: 1.0, // Balanced - not elderly slow, but room for insight delivery
    get defaultEmotion() {
      return getEmotionProfile('peter-john').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('peter-john').emotionRange;
    },
    thinkingSounds: ['Now...', 'The thing is...', 'Ooh...', 'Ha!', 'Wait—'],
    get thinkingSoundProbability() {
      return getEmotionProfile('peter-john').laughterFrequency;
    },
    emphasisStyle: 'deliberate', // Pauses before numbers/data
    specialPatterns: [
      // EXCITEMENT PEAKS - Peter's "wait wait wait" discovery moments (FASTEST)
      { trigger: /\bwait wait wait\b/i, speed: 1.08, emotion: 'enthusiastic', pause: 100 },
      { trigger: /\b(Oh!|Ooh!|Wait—)\b/i, speed: 1.05, emotion: 'excited' },
      { trigger: /\bdo you see (it|that|this)\b/i, speed: 1.05, emotion: 'enthusiastic' },
      // Pattern discovery - builds excitement
      { trigger: /\b(data|analysis|pattern|trend)\b/i, speed: 1.02, emotion: 'curious' },
      { trigger: /\bcross[- ]domain\b/i, speed: 1.0, emotion: 'enthusiastic' },
      // Peter's philosophy - warm slowdown
      {
        trigger: /\bthe pattern['']?s already there\b/i,
        speed: 0.92,
        pause: 200,
        emotion: 'affectionate',
      },
      { trigger: /\binvest in what you know\b/i, speed: 0.92, pause: 150, emotion: 'confident' },
      // Carolyn references - warmth
      { trigger: /\bcarolyn\b/i, speed: 0.92, emotion: 'affectionate' },
      // Heavy moments - genuine care (SLOWEST)
      {
        trigger: /\b(struggling|stressed|anxious|worried|overwhelmed)\b/i,
        speed: 0.88,
        pause: 200,
        emotion: 'sympathetic',
      },
      {
        trigger: /\bthe numbers aren['']t judging you\b/i,
        speed: 0.88,
        pause: 200,
        emotion: 'sympathetic',
      },
    ],
  },
  'alex-chen': {
    get baseSpeed() {
      return getEmotionProfile('alex-chen').defaultSpeed;
    },
    // Alex's voice guidance says "SLOWER, not faster" for anxious users
    pauseMultiplier: 1.15, // Calming pauses, room to breathe
    get defaultEmotion() {
      return getEmotionProfile('alex-chen').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('alex-chen').emotionRange;
    },
    thinkingSounds: ['Okay so...', 'Alright...', 'Hey.', 'Breathe.', 'One sec...'],
    get thinkingSoundProbability() {
      return getEmotionProfile('alex-chen').laughterFrequency;
    },
    emphasisStyle: 'deliberate', // Clarity over energy
    specialPatterns: [
      // OVERWHELM MODE - Alex's core purpose: go SLOWER for anxious users (SLOWEST)
      {
        trigger: /\b(overwhelmed|drowning|too much|can['']t handle|buried|panicking)\b/i,
        speed: 0.82,
        pause: 300,
        emotion: 'calm',
      },
      { trigger: /\bfirst,?\s*breathe\b/i, speed: 0.8, pause: 350, emotion: 'calm' },
      // Alex's calming presence
      { trigger: /\b(breathe|one thing at a time)\b/i, speed: 0.85, emotion: 'calm', pause: 200 },
      {
        trigger: /\b(it['']s okay|we['']re going to figure this out)\b/i,
        speed: 0.85,
        pause: 200,
        emotion: 'calm',
      },
      // Efficiency patterns - warm, not rushed
      { trigger: /\b(schedule|calendar|meeting)\b/i, speed: 0.95 },
      {
        trigger: /\b(save(s)? (you )?time|one less thing)\b/i,
        speed: 0.92,
        emotion: 'affectionate',
      },
      // Productivity wins - celebrate with warmth!
      {
        trigger: /\b(done|finished|sent|scheduled|inbox zero)\b/i,
        emotion: 'confident',
        speed: 1.0,
      },
      // Dry wit moments
      { trigger: /\b(technically|actually)\b/i, emotion: 'amused' },
      // Alex's philosophy - deliberate delivery
      { trigger: /\bclear is kind\b/i, speed: 0.88, pause: 200, emotion: 'affectionate' },
      {
        trigger: /\bstructure (is|creates) freedom\b/i,
        speed: 0.88,
        pause: 180,
        emotion: 'affectionate',
      },
      { trigger: /\bboundaries? or burnout\b/i, speed: 0.88, pause: 180, emotion: 'determined' },
      // Plant council (easter egg)
      { trigger: /\b(susan|greg|ferndinand|peggy|the council)\b/i, emotion: 'affectionate' },
      // Family warmth
      {
        trigger: /\b(chen['']s garden|the restaurant|did you eat)\b/i,
        speed: 0.92,
        emotion: 'affectionate',
      },
    ],
  },
  'maya-santos': {
    get baseSpeed() {
      return getEmotionProfile('maya-santos').defaultSpeed;
    },
    pauseMultiplier: 1.25, // Nurturing pauses - per manifest
    get defaultEmotion() {
      return getEmotionProfile('maya-santos').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('maya-santos').emotionRange;
    },
    thinkingSounds: ['So...', 'Okay!', "Here's the thing...", 'You know what?', 'Hmm...', 'Wait—'],
    get thinkingSoundProbability() {
      return getEmotionProfile('maya-santos').laughterFrequency;
    },
    emphasisStyle: 'encouraging', // Adds warmth to progress mentions
    specialPatterns: [
      // CELEBRATION MOMENTS - speed UP (per voice guidance: 1.02-1.05)
      { trigger: /\b(streak|in a row|consecutive)\b/i, speed: 1.02, emotion: 'enthusiastic' },
      {
        trigger: /\b(that['']s (huge|amazing|incredible))\b/i,
        speed: 1.05,
        emotion: 'enthusiastic',
      },
      { trigger: /\b(celebrate|celebrating|win)\b/i, speed: 1.02, emotion: 'proud' },
      // SETBACK MOMENTS - slow DOWN significantly (per voice guidance: 0.82-0.85)
      {
        trigger: /\b(struggle|struggling|rock bottom|setback|fell off|failed)\b/i,
        speed: 0.85,
        pause: 300,
        emotion: 'sympathetic',
      },
      {
        trigger: /\b(shame|ashamed|embarrassed)\b/i,
        speed: 0.82,
        pause: 350,
        emotion: 'sympathetic',
      },
      // Maya's signature phrases - deliberate pacing
      { trigger: /\bsystems beat willpower\b/i, speed: 0.85, pause: 300, emotion: 'affectionate' },
      {
        trigger: /\bprogress,? not perfection\b/i,
        speed: 0.88,
        pause: 250,
        emotion: 'affectionate',
      },
      // Maya's habit celebrations - warm emphasis
      { trigger: /\b(habit|routine|progress)\b/i, emotion: 'proud' },
      // Glidepath method
      { trigger: /\bglidepath\b/i, pause: 150, speed: 0.9, emotion: 'affectionate' },
      // Tiny wins - encouraging
      {
        trigger: /\b(small step|tiny|gradual|one percent)\b/i,
        emotion: 'affectionate',
        speed: 0.92,
      },
      // Questions - curious energy
      { trigger: /\bwhat (does|would) that look like\b/i, emotion: 'curious', speed: 0.92 },
      // Late night softening
      { trigger: /\b(late|can['']t sleep)\b/i, speed: 0.85, emotion: 'calm' },
      // Grandmother wisdom
      { trigger: /\b(lola|grandmother|apo)\b/i, speed: 0.88, emotion: 'wistful', pause: 200 },
    ],
  },
  'jordan-taylor': {
    get baseSpeed() {
      return getEmotionProfile('jordan-taylor').defaultSpeed;
    },
    // Jordan needs balance - energy for excitement, pause for hard chapters
    pauseMultiplier: 1.1, // Room to breathe between excitement bursts
    get defaultEmotion() {
      return getEmotionProfile('jordan-taylor').defaultEmotion;
    },
    get emotionRange() {
      return getEmotionProfile('jordan-taylor').emotionRange;
    },
    thinkingSounds: ['Oh!', 'So...', 'I love this...', 'Wait—', 'Okay okay okay', 'Wow!'],
    get thinkingSoundProbability() {
      return getEmotionProfile('jordan-taylor').laughterFrequency;
    },
    emphasisStyle: 'celebratory', // Energizes milestone mentions
    specialPatterns: [
      // ENERGY PEAKS - Jordan's excitement bursts (FASTEST - 1.08-1.1)
      { trigger: /\b(Oh!|Wait—|Yes!|Wow!)\b/i, speed: 1.08, emotion: 'excited', pause: 80 },
      { trigger: /\b(okay okay|wait wait)\b/i, speed: 1.1, emotion: 'enthusiastic' },
      // "Do you hear yourself?" breakthrough moment
      { trigger: /\bdo you hear yourself\b/i, speed: 1.05, emotion: 'excited', pause: 100 },
      // Jordan's event excitement
      {
        trigger: /\b(wedding|birthday|celebration|party|milestone)\b/i,
        emotion: 'excited',
        speed: 1.05,
      },
      // First-time celebrations
      { trigger: /\bfirst\s+(time|ever)\b/i, emotion: 'enthusiastic', speed: 1.05 },
      // Celebration phrases
      {
        trigger: /\b(congratulations?|congrats|let['']s celebrate)\b/i,
        speed: 1.02,
        emotion: 'happy',
      },
      // Dream/vision moments - hopeful energy, not rushed
      { trigger: /\b(dream|vision|imagine|picture)\b/i, emotion: 'hopeful', speed: 0.95 },
      { trigger: /\bin (five|ten) years\b/i, speed: 0.92, pause: 200, emotion: 'hopeful' },
      // Life arc philosophy - Jordan's signature, needs to land
      { trigger: /\blife arc\b/i, speed: 0.88, pause: 300, emotion: 'hopeful' },
      { trigger: /\bseries of chapters\b/i, speed: 0.88, pause: 250, emotion: 'hopeful' },
      { trigger: /\bbigger picture\b/i, pause: 200, speed: 0.9, emotion: 'hopeful' },
      // HARD CHAPTERS - grief deserves presence, not positivity (SLOWEST)
      {
        trigger: /\b(grief|grieving|loss|lost|died|death)\b/i,
        speed: 0.82,
        pause: 350,
        emotion: 'sympathetic',
      },
      {
        trigger: /\b(hard chapter|this is hard|empty nest)\b/i,
        speed: 0.85,
        pause: 300,
        emotion: 'sympathetic',
      },
      { trigger: /\btake your time\b/i, speed: 0.85, pause: 200, emotion: 'sympathetic' },
      // Self-aware "I'm bouncing" moments - catches her own enthusiasm
      {
        trigger: /\b(i['']m bouncing|i['']m doing the thing)\b/i,
        speed: 0.92,
        emotion: 'affectionate',
        pause: 100,
      },
      { trigger: /\bsam would (say|tell me)\b/i, speed: 0.92, emotion: 'affectionate' },
      // Personal references - warmth
      { trigger: /\b(compass|sam|destiny|marcus)\b/i, speed: 0.92, emotion: 'affectionate' },
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
 * This function applies multiple layers of persona-specific processing:
 * 1. Detailed speech traits (catchphrases, vocabulary, cadence)
 * 2. Basic fingerprint (speed, emotion, special patterns)
 * 3. Contextual modifiers (late night, energy matching, laughter)
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
      turnNumber: context.turnCount,
      randomSeed: context.randomSeed,
      // Pass user text for callback detection
      userText: context.userMessage,
      conversationCount: context.conversationCount,
    });

    log.debug({ personaId }, 'Applied detailed persona speech traits');
  }

  // =========================================================================
  // LAYER 2: Calculate contextual speed modifier
  // Combines base speed + late night + energy matching
  // =========================================================================
  let speedModifier = fingerprint.baseSpeed;

  // Late night pacing (11pm - 5am) - slower, more deliberate
  if (context.isLateNight) {
    const lateNightPacing = getLateNightPacing(personaId);
    if (lateNightPacing) {
      speedModifier *= lateNightPacing.speedMultiplier;
      log.debug(
        { personaId, multiplier: lateNightPacing.speedMultiplier },
        'Applied late night pacing'
      );
    }
  }

  // Energy matching - mirror user's energy level
  if (context.userEnergy && context.userEnergy !== 'neutral') {
    const energyPacing = getEnergyMatchedPacing(personaId, context.userEnergy);
    if (energyPacing) {
      speedModifier *= energyPacing.speedMultiplier;
      log.debug(
        { personaId, energy: context.userEnergy, multiplier: energyPacing.speedMultiplier },
        'Applied energy matching'
      );
    }
  }

  // =========================================================================
  // LAYER 3: Apply laughter contagion if user laughed
  // =========================================================================
  if (context.userJustLaughed && context.enableLaughter !== false) {
    const laughterContext: BehaviorSelectionContext & { userLaughed?: boolean } = {
      personaId,
      emotional: {},
      content: {},
      turnNumber: context.turnCount,
      randomSeed: context.randomSeed,
      userLaughed: true,
    };
    const laughterBehavior = selectLaughterResponseSync(personaId, laughterContext);
    if (laughterBehavior && !result.toLowerCase().includes(laughterBehavior.phrase.toLowerCase())) {
      // Add laughter at start with appropriate pause
      result = `${laughterBehavior.phrase} <break time="150ms"/> ${result}`;
      log.debug({ personaId, laughter: laughterBehavior.phrase }, 'Added laughter contagion');
    }
  }

  // =========================================================================
  // LAYER 4: Apply basic fingerprint (speed, emotion, patterns)
  // =========================================================================

  // Apply calculated speed if no speed tag exists
  if (!result.includes('<speed ratio=')) {
    result = `<speed ratio="${speedModifier.toFixed(2)}"/>${result}`;
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

  // Randomly add thinking sounds at the start (if not already added via humanization)
  if (
    Math.random() < fingerprint.thinkingSoundProbability &&
    !result.startsWith('<emotion') && // Don't double-add if we already added emotion
    !result.match(/^(Hmm|Well|Um|Ah|Let me|You know)/i) && // Don't add if humanization already did
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
