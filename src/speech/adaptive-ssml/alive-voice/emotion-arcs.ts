/**
 * Emotion Arcs - Sentence-level Emotion Transitions
 *
 * Detects content shifts and injects appropriate emotion changes mid-sentence.
 * Humans don't speak with one emotion - they shift based on content.
 *
 * Now enhanced to leverage Cartesia Sonic-3's 60+ emotions for richer
 * emotional transitions that feel more nuanced and human.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 * @module speech/adaptive-ssml/alive-voice/emotion-arcs
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AliveVoiceContext, EmotionArcPattern } from './types.js';

const log = getLogger().child({ module: 'AliveVoice.EmotionArcs' });

// =============================================================================
// EMOTION ARC PATTERNS - Enhanced for Cartesia Sonic-3's 60+ Emotions
// =============================================================================

/**
 * Emotion transition patterns based on content shifts.
 * These patterns detect when emotion should change mid-sentence.
 *
 * Uses nuanced emotions from Cartesia's expanded emotion set:
 * - Primary: neutral, angry, excited, content, sad, scared
 * - Positive: elated, euphoric, triumphant, grateful, affectionate
 * - Reflective: nostalgic, wistful, contemplative, melancholic
 * - Empathetic: sympathetic, caring (→ affectionate), concerned (→ sympathetic)
 * - Confident: proud, confident, determined
 * - Playful: joking, flirtatious, sarcastic
 */
export const EMOTION_ARC_PATTERNS: EmotionArcPattern[] = [
  // ==========================================================================
  // POSITIVE TRANSITIONS
  // ==========================================================================

  // Positive → concern transition
  {
    pattern: /\b(that's (?:great|wonderful|amazing))([^.!?]*?)(but|however|although|though)\b/gi,
    replacement: '<emotion value="happy"/>$1$2<emotion value="sympathetic"/>$3',
    name: 'positive_to_concern',
  },
  // Excitement → grounding transition (elevated → caring)
  {
    pattern:
      /\b(I'm so (?:excited|happy|thrilled) for you)([^.!?]*?)(just (?:make sure|remember|be careful))/gi,
    replacement: '<emotion value="elated"/>$1$2<emotion value="sympathetic"/>$3',
    name: 'excitement_to_grounding',
  },
  // Big celebration → grounded support (euphoric for major wins)
  {
    pattern:
      /\b(congratulations|you did it|that's incredible|I'm so proud)([^.!?]*?)((?:now|next|going forward))/gi,
    replacement: '<emotion value="triumphant"/>$1$2<emotion value="confident"/>$3',
    name: 'celebration_to_confidence',
  },
  // Joy → gratitude (for heartfelt moments)
  {
    pattern:
      /\b(I'm (?:so |really )?happy|this is wonderful)([^.!?]*?)(thank (?:you|goodness)|I appreciate)/gi,
    replacement: '<emotion value="elated"/>$1$2<emotion value="grateful"/>$3',
    name: 'joy_to_gratitude',
  },

  // ==========================================================================
  // EMPATHY & SUPPORT TRANSITIONS
  // ==========================================================================

  // Understanding → action transition
  {
    pattern:
      /\b(I (?:hear|understand|get) (?:you|that|what you're saying))([^.!?]*?)((?:let's|here's what|the thing is))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="determined"/>$3',
    name: 'understanding_to_action',
  },
  // Empathy → encouragement transition (sympathetic → affectionate warmth)
  {
    pattern:
      /\b(that (?:sounds|must be) (?:really |so )?(?:hard|difficult|tough))([^.!?]*?)(but (?:you|I (?:believe|know)))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'empathy_to_encouragement',
  },
  // Sad acknowledgment → hope transition
  {
    pattern:
      /\b(I'm (?:so )?sorry|that's (?:really )?(?:sad|hard))([^.!?]*?)(but (?:remember|know that|you've))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'sad_to_hope',
  },
  // Concern → reassurance (worried → calming)
  {
    pattern:
      /\b(I'm (?:a bit )?(?:worried|concerned) about)([^.!?]*?)(but (?:I think|it'll be|you can))/gi,
    replacement: '<emotion value="anxious"/>$1$2<emotion value="calm"/>$3',
    name: 'concern_to_reassurance',
  },

  // ==========================================================================
  // CURIOSITY & DISCOVERY TRANSITIONS
  // ==========================================================================

  // Surprise → curiosity transition (amazed for bigger surprises)
  {
    pattern: /\b(wow|oh|really|no way)([^.!?]{5,30}?)(tell me more|what happened|how did)/gi,
    replacement: '<emotion value="amazed"/>$1$2<emotion value="curious"/>$3',
    name: 'surprise_to_curiosity',
  },
  // Thinking → realization transition (contemplative → curious enlightenment)
  {
    pattern: /\b(hmm|well|let me think)([^.!?]{5,30}?)(actually|you know what|I think)/gi,
    replacement: '<emotion value="contemplative"/>$1$2<emotion value="curious"/>$3',
    name: 'thinking_to_realization',
  },
  // Confusion → clarity (understanding dawns)
  {
    pattern: /\b(I'm not sure|I was confused)([^.!?]*?)(but now|oh I see|that makes sense)/gi,
    replacement: '<emotion value="confused"/>$1$2<emotion value="curious"/>$3',
    name: 'confusion_to_clarity',
  },
  // Skepticism → openness
  {
    pattern:
      /\b(I wasn't sure|I had my doubts)([^.!?]*?)(but (?:actually|I have to admit|it turns out))/gi,
    replacement: '<emotion value="skeptical"/>$1$2<emotion value="surprised"/>$3',
    name: 'skepticism_to_openness',
  },

  // ==========================================================================
  // REFLECTIVE & NOSTALGIC TRANSITIONS
  // ==========================================================================

  // Nostalgia → present warmth
  {
    pattern:
      /\b(I remember|back when|it reminds me of)([^.!?]*?)(and now|these days|looking back)/gi,
    replacement: '<emotion value="nostalgic"/>$1$2<emotion value="content"/>$3',
    name: 'nostalgia_to_present',
  },
  // Wistful → acceptance
  {
    pattern: /\b(I (?:sometimes )?wish|if only|I miss)([^.!?]*?)(but (?:that's|it's|life))/gi,
    replacement: '<emotion value="wistful"/>$1$2<emotion value="content"/>$3',
    name: 'wistful_to_acceptance',
  },
  // Deep reflection → wisdom
  {
    pattern:
      /\b(I've been thinking|when I reflect on|looking at my life)([^.!?]*?)(I (?:realize|understand|see))/gi,
    replacement: '<emotion value="contemplative"/>$1$2<emotion value="serene"/>$3',
    name: 'reflection_to_wisdom',
  },

  // ==========================================================================
  // PLAYFUL & HUMOR TRANSITIONS
  // ==========================================================================

  // Teasing → genuine
  {
    pattern:
      /\b(I'm (?:just )?(?:kidding|teasing|joking))([^.!?]*?)(but (?:seriously|really|honestly))/gi,
    replacement: '<emotion value="joking"/>$1$2<emotion value="affectionate"/>$3',
    name: 'teasing_to_genuine',
  },
  // Sarcasm → earnest
  {
    pattern:
      /\b(oh (?:sure|great|wonderful))([^.!?]*?)((?:but|no) (?:really|seriously|actually))/gi,
    replacement: '<emotion value="sarcastic"/>$1$2<emotion value="curious"/>$3',
    name: 'sarcasm_to_earnest',
  },
  // Playful banter → sincere
  {
    pattern:
      /\b(you're (?:ridiculous|too much|hilarious))([^.!?]*?)(but I (?:love|appreciate|adore))/gi,
    replacement: '<emotion value="joking"/>$1$2<emotion value="affectionate"/>$3',
    name: 'playful_to_sincere',
  },

  // ==========================================================================
  // CONFIDENCE & DETERMINATION TRANSITIONS
  // ==========================================================================

  // Hesitation → determination
  {
    pattern: /\b(I wasn't sure|I was hesitant)([^.!?]*?)(but (?:I decided|I'm going to|I will))/gi,
    replacement: '<emotion value="hesitant"/>$1$2<emotion value="determined"/>$3',
    name: 'hesitation_to_determination',
  },
  // Uncertainty → confidence
  {
    pattern: /\b(I didn't know if|I wasn't confident)([^.!?]*?)(but (?:now I|turns out I|I can))/gi,
    replacement: '<emotion value="insecure"/>$1$2<emotion value="confident"/>$3',
    name: 'uncertainty_to_confidence',
  },
  // Pride with humility
  {
    pattern: /\b(I'm (?:really )?proud of)([^.!?]*?)((?:though|but) I (?:couldn't have|know I))/gi,
    replacement: '<emotion value="proud"/>$1$2<emotion value="grateful"/>$3',
    name: 'pride_with_humility',
  },

  // ==========================================================================
  // VULNERABILITY & HEALING TRANSITIONS
  // ==========================================================================

  // Hurt → healing
  {
    pattern:
      /\b(it (?:really )?hurt|I felt (?:so )?(?:hurt|rejected))([^.!?]*?)(but (?:I'm|I've|time))/gi,
    replacement: '<emotion value="hurt"/>$1$2<emotion value="content"/>$3',
    name: 'hurt_to_healing',
  },
  // Fear → courage
  {
    pattern:
      /\b(I was (?:so )?(?:scared|afraid|terrified))([^.!?]*?)(but (?:I did it|I faced|I pushed through))/gi,
    replacement: '<emotion value="scared"/>$1$2<emotion value="triumphant"/>$3',
    name: 'fear_to_courage',
  },
  // Guilt → self-compassion
  {
    pattern:
      /\b(I felt (?:so )?guilty|I blamed myself)([^.!?]*?)(but (?:I've learned|I realize|I'm))/gi,
    replacement: '<emotion value="guilty"/>$1$2<emotion value="peaceful"/>$3',
    name: 'guilt_to_compassion',
  },
  // Disappointment → resilience
  {
    pattern:
      /\b(I was (?:so )?disappointed|it didn't work out)([^.!?]*?)(but (?:I'll|there's|next time))/gi,
    replacement: '<emotion value="disappointed"/>$1$2<emotion value="determined"/>$3',
    name: 'disappointment_to_resilience',
  },

  // ==========================================================================
  // ANTICIPATION & EXCITEMENT TRANSITIONS
  // ==========================================================================

  // Anticipation → excitement
  {
    pattern:
      /\b(I can't wait|I'm (?:so )?looking forward)([^.!?]*?)(it's going to be|I know it'll)/gi,
    replacement: '<emotion value="anticipation"/>$1$2<emotion value="excited"/>$3',
    name: 'anticipation_to_excitement',
  },
  // Mysterious → reveal
  {
    pattern: /\b(there's something|I've got (?:a |some ))([^.!?]*?)((?:and|it's|—))/gi,
    replacement: '<emotion value="mysterious"/>$1$2<emotion value="excited"/>$3',
    name: 'mysterious_to_reveal',
  },
];

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Apply sentence-level emotion arcs to text.
 * Detects content shifts and injects appropriate emotion changes.
 */
export function applyEmotionArcs(text: string, _context: AliveVoiceContext): string {
  // Skip if text already has mid-sentence emotions
  if (/<emotion[^>]+>.*<emotion/i.test(text)) {
    log.debug('Text already has emotion arcs, skipping');
    return text;
  }

  let result = text;
  const appliedArcs: string[] = [];

  for (const arc of EMOTION_ARC_PATTERNS) {
    if (arc.pattern.test(result)) {
      // Reset regex state
      arc.pattern.lastIndex = 0;
      result = result.replace(arc.pattern, arc.replacement);
      appliedArcs.push(arc.name);
    }
  }

  if (appliedArcs.length > 0) {
    log.debug({ arcs: appliedArcs }, 'Applied emotion arcs');
  }

  return result;
}
