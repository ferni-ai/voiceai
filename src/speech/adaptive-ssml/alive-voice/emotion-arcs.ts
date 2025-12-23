/**
 * Emotion Arcs - Sentence-level Emotion Transitions
 *
 * Detects content shifts and injects appropriate emotion changes mid-sentence.
 * Humans don't speak with one emotion - they shift based on content.
 *
 * @module speech/adaptive-ssml/alive-voice/emotion-arcs
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AliveVoiceContext, EmotionArcPattern } from './types.js';

const log = getLogger().child({ module: 'AliveVoice.EmotionArcs' });

// =============================================================================
// EMOTION ARC PATTERNS
// =============================================================================

/**
 * Emotion transition patterns based on content shifts.
 * These patterns detect when emotion should change mid-sentence.
 */
export const EMOTION_ARC_PATTERNS: EmotionArcPattern[] = [
  // Positive → concern transition
  {
    pattern: /\b(that's (?:great|wonderful|amazing))([^.!?]*?)(but|however|although|though)\b/gi,
    replacement: '<emotion value="happy"/>$1$2<emotion value="caring"/>$3',
    name: 'positive_to_concern',
  },
  // Excitement → grounding transition
  {
    pattern:
      /\b(I'm so (?:excited|happy|thrilled) for you)([^.!?]*?)(just (?:make sure|remember|be careful))/gi,
    replacement: '<emotion value="excited"/>$1$2<emotion value="caring"/>$3',
    name: 'excitement_to_grounding',
  },
  // Understanding → action transition
  {
    pattern:
      /\b(I (?:hear|understand|get) (?:you|that|what you're saying))([^.!?]*?)((?:let's|here's what|the thing is))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="curious"/>$3',
    name: 'understanding_to_action',
  },
  // Empathy → encouragement transition
  {
    pattern:
      /\b(that (?:sounds|must be) (?:really |so )?(?:hard|difficult|tough))([^.!?]*?)(but (?:you|I (?:believe|know)))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'empathy_to_encouragement',
  },
  // Surprise → curiosity transition
  {
    pattern: /\b(wow|oh|really|no way)([^.!?]{5,30}?)(tell me more|what happened|how did)/gi,
    replacement: '<emotion value="surprised"/>$1$2<emotion value="curious"/>$3',
    name: 'surprise_to_curiosity',
  },
  // Thinking → realization transition
  {
    pattern: /\b(hmm|well|let me think)([^.!?]{5,30}?)(actually|you know what|I think)/gi,
    replacement: '<emotion value="contemplative"/>$1$2<emotion value="curious"/>$3',
    name: 'thinking_to_realization',
  },
  // Sad acknowledgment → hope transition
  {
    pattern:
      /\b(I'm (?:so )?sorry|that's (?:really )?(?:sad|hard))([^.!?]*?)(but (?:remember|know that|you've))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'sad_to_hope',
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
