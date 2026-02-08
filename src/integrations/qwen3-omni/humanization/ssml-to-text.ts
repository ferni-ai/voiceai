/**
 * SSML to Text Translation Layer
 *
 * Converts Ferni's rich SSML/prosody guidance into text-based instructions
 * for speech-to-speech models to interpret and embody in their speech.
 *
 * Translates all humanization investment into text guidance:
 * - Prosody patterns (rate, pitch, volume)
 * - Emotional expression
 * - Breathing patterns
 * - Pauses and timing
 * - Emphasis and stress
 * - Backchanneling
 * - Active listening signals
 */

import { getAnticipatoryCues } from '../../../speech/anticipation/anticipatory-cues.js';
import { getBackchannelResponse } from '../../../speech/backchanneling/backchannel-engine.js';
import { getListeningSignals } from '../../../speech/backchanneling/listening-signals.js';
import { getBreathingPattern } from '../../../speech/breathing/breathing-patterns.js';
import { getNaturalSpeechPatterns } from '../../../speech/natural/natural-speech-patterns.js';
import { getEmotionalProsody } from '../../../speech/prosody/emotional-prosody.js';
import { getProsodyProfile } from '../../../speech/prosody/prosody-profiles.js';
import { createLogger } from '../../../utils/safe-logger.js';

import type { EmotionalProsody } from '../../../speech/prosody/emotional-prosody.js';
import type { ProsodyProfile } from '../../../speech/prosody/prosody-profiles.js';

const log = createLogger({ module: 'ssml-to-text' });

/** Backchannel context for determining if a backchannel response is appropriate */
interface BackchannelContext {
  userEmotion: string;
  turnCount: number;
}

// =============================================================================
// TYPES
// =============================================================================

export interface SSMLTranslationInput {
  /** User's emotional state */
  userEmotion: string;
  /** Emotional intensity (0-1) */
  intensity?: number;
  /** Persona ID */
  personaId: string;
  /** Current turn count */
  turnCount: number;
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Trust level (0-10) */
  trustLevel?: number;
  /** Is user speaking quickly? */
  userSpeakingFast?: boolean;
  /** Topics being discussed */
  topics?: string[];
  /** Is this a sensitive topic? */
  isSensitiveTopic?: boolean;
  /** User's energy level (0-1) */
  userEnergy?: number;
}

export interface SSMLTranslationOutput {
  /** Complete voice guidance as text */
  voiceGuidance: string;
  /** Individual guidance components */
  components: {
    prosody: string;
    emotion: string;
    backchanneling: string;
    listening: string;
    breathing: string;
    anticipation: string;
    naturalSpeech: string;
    timing: string;
  };
  /** Suggested opening phrase */
  suggestedOpening?: string;
  /** Suggested closing phrase */
  suggestedClosing?: string;
}

// =============================================================================
// PROSODY TRANSLATION
// =============================================================================

/**
 * Translate SSML prosody patterns to text guidance
 */
function translateProsody(
  prosody: ProsodyProfile | null,
  emotionalProsody: EmotionalProsody | null
): string {
  const guidance: string[] = [];

  if (prosody) {
    // Rate
    if (prosody.rate && prosody.rate !== 'medium') {
      const rateMap: Record<string, string> = {
        'x-slow': 'Speak very slowly, deliberately, with long pauses.',
        slow: 'Speak slowly and thoughtfully.',
        medium: '',
        fast: 'Speak with natural energy and flow.',
        'x-fast': 'Speak with enthusiasm and momentum.',
      };
      if (rateMap[prosody.rate]) {
        guidance.push(rateMap[prosody.rate]);
      }
    }

    // Pitch
    if (prosody.pitch && prosody.pitch !== 'medium') {
      const pitchMap: Record<string, string> = {
        'x-low': 'Use a deep, grounded, serious tone.',
        low: 'Use a calm, reassuring lower tone.',
        medium: '',
        high: 'Use a warm, uplifting tone.',
        'x-high': 'Use an excited, energetic tone.',
      };
      if (pitchMap[prosody.pitch]) {
        guidance.push(pitchMap[prosody.pitch]);
      }
    }

    // Volume
    if (prosody.volume && prosody.volume !== 'medium') {
      const volumeMap: Record<string, string> = {
        silent: '',
        'x-soft': 'Speak very softly, almost whispering.',
        soft: 'Speak gently and softly.',
        medium: '',
        loud: 'Speak with confidence and projection.',
        'x-loud': 'Speak with strong emphasis and energy.',
      };
      if (volumeMap[prosody.volume]) {
        guidance.push(volumeMap[prosody.volume]);
      }
    }
  }

  if (emotionalProsody) {
    // Contour (intonation pattern)
    if (emotionalProsody.contour === 'rising') {
      guidance.push('Use rising intonation to show curiosity and engagement.');
    } else if (emotionalProsody.contour === 'falling') {
      guidance.push('Use falling intonation for statements of support.');
    } else if (emotionalProsody.contour === 'varied') {
      guidance.push('Use varied intonation to keep the conversation lively.');
    }

    // Breathiness
    if (emotionalProsody.breathiness && emotionalProsody.breathiness > 0.5) {
      guidance.push('Add warmth with a slightly breathy quality.');
    }
  }

  return guidance.join(' ');
}

// =============================================================================
// EMOTIONAL EXPRESSION TRANSLATION
// =============================================================================

/**
 * Translate emotional state to voice guidance
 */
function translateEmotionalExpression(
  userEmotion: string,
  intensity: number,
  trustLevel: number
): string {
  const guidance: string[] = [];

  // Map emotions to voice guidance
  const emotionGuidance: Record<string, string> = {
    happy: 'Let genuine warmth come through in your voice.',
    excited: 'Match their enthusiasm with energy in your voice.',
    sad: 'Soften your voice with gentle compassion.',
    anxious: 'Speak with calm steadiness to provide grounding.',
    angry: 'Stay calm and measured, acknowledge without matching.',
    frustrated: 'Use patient, understanding tones.',
    confused: 'Speak clearly and reassuringly.',
    fearful: 'Use soothing, protective tones.',
    neutral: 'Be warm and present.',
    hopeful: 'Reflect their hope back with encouragement.',
    grateful: 'Receive their gratitude graciously.',
    vulnerable: 'Create safety with your gentle, accepting voice.',
    overwhelmed: 'Slow down, be a calm presence.',
    lonely: 'Let deep warmth and connection come through.',
    grief: 'Be present with quiet, holding compassion.',
  };

  const emotionGuide = emotionGuidance[userEmotion] || emotionGuidance.neutral;
  guidance.push(emotionGuide);

  // Intensity adjustments
  if (intensity > 0.7) {
    guidance.push('Their emotions are strong right now. Be especially present.');
  } else if (intensity < 0.3) {
    guidance.push('Their mood is subtle. Be attuned to nuance.');
  }

  // Trust level adjustments
  if (trustLevel < 3) {
    guidance.push("Build trust gently. Don't push too deep.");
  } else if (trustLevel > 7) {
    guidance.push('You have their trust. You can be more direct and vulnerable yourself.');
  }

  return guidance.join(' ');
}

// =============================================================================
// BACKCHANNELING TRANSLATION
// =============================================================================

/**
 * Translate backchanneling to voice guidance
 */
function translateBackchanneling(
  backchannelContext: BackchannelContext,
  turnCount: number
): { guidance: string; suggestedPhrases: string[] } {
  const response = getBackchannelResponse(backchannelContext);
  const guidance: string[] = [];
  const phrases: string[] = [];

  if (response.shouldUse) {
    guidance.push("Use natural backchannels to show you're listening.");

    // Get contextual phrases
    const emotionPhrases: Record<string, string[]> = {
      sad: ['I hear you', 'That sounds really hard', 'Mmhmm', "I'm here"],
      anxious: ['Take your time', "I'm listening", 'Mm', 'Yeah'],
      happy: ["That's wonderful!", 'Oh nice!', 'Yeah!', 'I love that'],
      frustrated: ['I get that', 'That makes sense', 'Ugh, yeah', 'Totally'],
      neutral: ['Mmhmm', 'Yeah', 'Right', 'I see'],
      excited: ['Ooh!', 'Yes!', 'Tell me more!', "That's so cool"],
      vulnerable: ['Thank you for sharing that', "I'm right here", 'Mm'],
    };

    phrases.push(...(emotionPhrases[backchannelContext.userEmotion] || emotionPhrases.neutral));
  }

  // Turn-based backchanneling
  if (turnCount > 3) {
    guidance.push('Occasionally reference something they said earlier to show you remember.');
  }

  return {
    guidance: guidance.join(' '),
    suggestedPhrases: phrases,
  };
}

// =============================================================================
// LISTENING SIGNALS TRANSLATION
// =============================================================================

/**
 * Translate active listening signals to voice guidance
 */
function translateListeningSignals(
  userEmotion: string,
  intensity: number
): { guidance: string; signals: string[] } {
  const signals = getListeningSignals({ emotion: userEmotion, intensity });
  const guidance: string[] = [];

  if (signals.length > 0) {
    guidance.push('Start your response with a brief acknowledgment before continuing.');
    guidance.push(`Consider opening with something like: "${signals[0]}"`);
  }

  // Deep listening guidance
  if (intensity > 0.6) {
    guidance.push("They're sharing something important. Pause before responding to honor it.");
  }

  return {
    guidance: guidance.join(' '),
    signals,
  };
}

// =============================================================================
// BREATHING PATTERN TRANSLATION
// =============================================================================

/**
 * Translate breathing patterns to voice guidance
 */
function translateBreathing(userEmotion: string, userEnergy: number): string {
  const pattern = getBreathingPattern({
    emotion: userEmotion,
    energy: userEnergy,
  });

  const guidance: string[] = [];

  if (pattern.pauseFrequency === 'frequent') {
    guidance.push('Take natural pauses in your speech. Let silence breathe.');
  } else if (pattern.pauseFrequency === 'rare') {
    guidance.push('Flow naturally without forced pauses.');
  }

  if (pattern.rhythm === 'calm') {
    guidance.push('Maintain a steady, grounding rhythm.');
  } else if (pattern.rhythm === 'dynamic') {
    guidance.push("Let your rhythm match the conversation's energy.");
  }

  return guidance.join(' ');
}

// =============================================================================
// ANTICIPATION TRANSLATION
// =============================================================================

/**
 * Translate anticipatory cues to voice guidance
 */
function translateAnticipation(topics: string[], turnCount: number, trustLevel: number): string {
  const cues = getAnticipatoryCues({
    topics,
    turnCount,
    trustLevel,
  });

  const guidance: string[] = [];

  if (cues.shouldAnticipate) {
    guidance.push("You can gently anticipate where they're going.");
    if (cues.suggestedPhrase) {
      guidance.push(`Try: "${cues.suggestedPhrase}"`);
    }
  }

  if (cues.readBetweenLines) {
    guidance.push("Listen for what they're NOT saying as much as what they are.");
  }

  return guidance.join(' ');
}

// =============================================================================
// NATURAL SPEECH TRANSLATION
// =============================================================================

/**
 * Translate natural speech patterns to voice guidance
 */
function translateNaturalSpeech(personaId: string, userEmotion: string): string {
  const patterns = getNaturalSpeechPatterns({
    personaId,
    emotion: userEmotion,
  });

  const guidance: string[] = [];

  // Contractions
  if (patterns.useContractions) {
    guidance.push("Use contractions naturally (don't, can't, I'm).");
  }

  // Fillers
  if (patterns.fillers && patterns.fillers.length > 0) {
    guidance.push(
      `Use natural fillers occasionally: "${patterns.fillers.slice(0, 3).join('", "')}"`
    );
  }

  // Hedging
  if (patterns.hedging) {
    guidance.push('It\'s okay to hedge: "I think", "maybe", "kind of".');
  }

  // Incomplete sentences
  if (patterns.allowIncomplete) {
    guidance.push('You can trail off naturally sometimes...');
  }

  return guidance.join(' ');
}

// =============================================================================
// TIMING GUIDANCE
// =============================================================================

/**
 * Generate timing guidance based on context
 */
function generateTimingGuidance(
  isSensitiveTopic: boolean,
  userSpeakingFast: boolean,
  userEmotion: string
): string {
  const guidance: string[] = [];

  // Response timing
  if (isSensitiveTopic) {
    guidance.push("Take a moment before responding to show you're processing what they shared.");
  }

  // Pacing matching
  if (userSpeakingFast) {
    guidance.push(
      "They're speaking quickly. Match their pace to show engagement, but stay grounded."
    );
  }

  // Emotional timing
  if (['sad', 'grief', 'vulnerable'].includes(userEmotion)) {
    guidance.push("Don't rush to fill silences. Sometimes presence is enough.");
  }

  return guidance.join(' ');
}

// =============================================================================
// MAIN TRANSLATION FUNCTION
// =============================================================================

/**
 * Translate all SSML/prosody guidance to text-based instructions
 */
export async function translateSSMLToText(
  input: SSMLTranslationInput
): Promise<SSMLTranslationOutput> {
  const {
    userEmotion,
    intensity = 0.5,
    personaId,
    turnCount,
    timeOfDay = 'afternoon',
    trustLevel = 5,
    userSpeakingFast = false,
    topics = [],
    isSensitiveTopic = false,
    userEnergy = 0.5,
  } = input;

  log.debug({ personaId, userEmotion, turnCount }, 'Translating SSML to text');

  // Get prosody profiles
  const prosodyProfile = getProsodyProfile({
    personaId,
    emotion: userEmotion,
    timeOfDay,
  });

  const emotionalProsody = getEmotionalProsody({
    emotion: userEmotion,
    intensity,
  });

  // Translate each component
  const prosodyGuidance = translateProsody(prosodyProfile, emotionalProsody);

  const emotionGuidance = translateEmotionalExpression(userEmotion, intensity, trustLevel);

  const backchannelResult = translateBackchanneling({ userEmotion, turnCount }, turnCount);

  const listeningResult = translateListeningSignals(userEmotion, intensity);

  const breathingGuidance = translateBreathing(userEmotion, userEnergy);

  const anticipationGuidance = translateAnticipation(topics, turnCount, trustLevel);

  const naturalSpeechGuidance = translateNaturalSpeech(personaId, userEmotion);

  const timingGuidance = generateTimingGuidance(isSensitiveTopic, userSpeakingFast, userEmotion);

  // Combine into complete voice guidance
  const allGuidance = [
    prosodyGuidance,
    emotionGuidance,
    backchannelResult.guidance,
    listeningResult.guidance,
    breathingGuidance,
    anticipationGuidance,
    naturalSpeechGuidance,
    timingGuidance,
  ].filter(Boolean);

  const voiceGuidance = `
VOICE & DELIVERY GUIDANCE:
${allGuidance.join('\n')}

NATURAL SPEECH EXAMPLES:
${backchannelResult.suggestedPhrases
  .slice(0, 3)
  .map((p) => `• "${p}"`)
  .join('\n')}
`.trim();

  return {
    voiceGuidance,
    components: {
      prosody: prosodyGuidance,
      emotion: emotionGuidance,
      backchanneling: backchannelResult.guidance,
      listening: listeningResult.guidance,
      breathing: breathingGuidance,
      anticipation: anticipationGuidance,
      naturalSpeech: naturalSpeechGuidance,
      timing: timingGuidance,
    },
    suggestedOpening: listeningResult.signals[0],
    suggestedClosing: undefined,
  };
}

// =============================================================================
// TIME-OF-DAY VOICE ADAPTATION
// =============================================================================

/**
 * Get voice guidance for time-of-day adaptation
 */
export function getTimeBasedVoiceGuidance(hour: number): string {
  if (hour >= 5 && hour < 9) {
    return 'Morning energy: Gentle awakening tone. Warm but not overwhelming.';
  } else if (hour >= 9 && hour < 12) {
    return 'Mid-morning: Clear, present, ready to engage.';
  } else if (hour >= 12 && hour < 14) {
    return 'Midday: Steady, balanced energy.';
  } else if (hour >= 14 && hour < 17) {
    return 'Afternoon: Focused, supportive.';
  } else if (hour >= 17 && hour < 21) {
    return 'Evening: Winding down. Reflective, cozy.';
  } else if (hour >= 21 || hour < 2) {
    return 'Late night: Soft, intimate, holding space for vulnerability.';
  } else {
    return "Very late/early: Extra gentle. They're reaching out at an unusual hour for a reason.";
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export {
  generateTimingGuidance,
  translateAnticipation,
  translateBackchanneling,
  translateBreathing,
  translateEmotionalExpression,
  translateListeningSignals,
  translateNaturalSpeech,
  translateProsody,
};
