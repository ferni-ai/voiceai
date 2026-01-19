/**
 * Micro-Moment Detection Rules
 *
 * Pattern definitions for detecting 8 types of micro-moments.
 *
 * @module @ferni/intelligence/deep-understanding/micro-moments/detection-rules
 */

import type { MicroMomentRule, MicroMomentType, MicroMomentAcknowledgment } from './types.js';

// ============================================================================
// DETECTION RULES
// ============================================================================

export const MICRO_MOMENT_RULES: MicroMomentRule[] = [
  // 1. Vulnerability Edge
  {
    type: 'vulnerability-edge',
    patterns: [
      /I('ve| have) never (told|shared|said) (anyone|anybody|this)/i,
      /I('ve| have) never (admitted|confessed)/i,
      /This is (hard|difficult|scary) (to say|to admit|to share)/i,
      /I('m| am) (scared|afraid|terrified) to (tell|say|admit)/i,
      /Please don't (judge|tell|think)/i,
      /I shouldn't (say|tell|admit) this/i,
      /Between (you and me|us)/i,
      /Can I (tell|ask|share) you something/i,
      /I trust you (enough|with)/i,
      /I('ve| have) been (hiding|keeping)/i,
    ],
    keywords: ['secret', 'hidden', 'shame', 'scared', 'trust', 'never told'],
    baseConfidence: 0.8,
    defaultAcknowledgment: 'presence',
    defaultTiming: 'immediate',
    defaultPauseMs: 500,
  },

  // 2. Small Win
  {
    type: 'small-win',
    patterns: [
      /I (almost|nearly|finally|actually) (did|made|got|finished|completed)/i,
      /I (managed|was able) to/i,
      /I did(n't think I could| it)/i,
      /For the first time,? I/i,
      /I('m| am) (proud|happy) (I|that I)/i,
      /It('s| is) not much,? but/i,
      /A small (step|victory|win)/i,
      /I('ve| have) been (working|trying) (on|hard)/i,
      /Progress (on|with)/i,
      /I (stuck|followed) (with|through)/i,
    ],
    keywords: ['progress', 'proud', 'finally', 'managed', 'first time', 'accomplished'],
    baseConfidence: 0.75,
    defaultAcknowledgment: 'celebration',
    defaultTiming: 'immediate',
    defaultPauseMs: 200,
  },

  // 3. Relationship Shift
  {
    type: 'relationship-shift',
    patterns: [
      // When they change how they refer to someone (detected contextually)
      /I (used to|always) (call|think of) (them|him|her)/i,
      /(My|The) (ex|former|old)/i,
      /I('m| am) (starting|beginning) to see (them|him|her)/i,
      /(They|He|She)('re|'s| are| is) not (who|what) I (thought|believed)/i,
      /I (realized|noticed) (they|he|she)/i,
      /We('re| are) (not|no longer)/i,
      /I('ve| have) started (calling|thinking of)/i,
      /(My|Our) relationship (has|is)/i,
    ],
    keywords: ['realized', 'changed', 'different', 'used to', 'now I see'],
    baseConfidence: 0.7,
    defaultAcknowledgment: 'gentle-mirror',
    defaultTiming: 'weave-in',
    defaultPauseMs: 300,
  },

  // 4. Language Change (We instead of I)
  {
    type: 'language-change',
    patterns: [
      // Detected primarily through context comparison
      /We (can|could|should|might|will)/i,
      /We('re| are) (going to|in this together)/i,
      /Together,? we/i,
      /Our (team|family|relationship|future)/i,
      /It('s| is) (not just me|both of us|all of us)/i,
      /We('ve| have) (been|got)/i,
    ],
    keywords: ['together', 'we', 'our', 'us', 'both'],
    baseConfidence: 0.65,
    defaultAcknowledgment: 'gentle-mirror',
    defaultTiming: 'weave-in',
    defaultPauseMs: 200,
  },

  // 5. Hope Glimmer
  {
    type: 'hope-glimmer',
    patterns: [
      /Maybe (things|it|I) could/i,
      /What if (things|I|we) (could|might)/i,
      /I('m| am) (starting|beginning) to (think|believe|hope)/i,
      /There('s| is) (a chance|hope|possibility)/i,
      /I (might|could) (be able|actually)/i,
      /Things (might|could) (get|be|turn)/i,
      /For the first time,? I (feel|think|believe)/i,
      /I('m| am) (not|no longer) (as|so) (hopeless|pessimistic)/i,
      /A (small|little|tiny) (part|piece) of me/i,
      /I (want|wish) to (believe|hope)/i,
    ],
    keywords: ['hope', 'maybe', 'might', 'could', 'possible', 'chance', 'believe'],
    baseConfidence: 0.75,
    defaultAcknowledgment: 'gentle-mirror',
    defaultTiming: 'weave-in',
    defaultPauseMs: 400,
  },

  // 6. Self-Compassion
  {
    type: 'self-compassion',
    patterns: [
      /I guess it('s| is) (okay|alright|fine) (that|if) I/i,
      /I('m| am) (doing|trying) (my|the) best/i,
      /It('s| is) okay (that|to|if)/i,
      /I('m| am) (only|just) human/i,
      /I (need|deserve) to (be|give myself)/i,
      /I('m| am) (learning|growing|improving)/i,
      /I (can|should) (forgive|be kind to) myself/i,
      /I('m| am) (being|was) (too|so) hard on myself/i,
      /Everyone (makes|has) (mistakes|struggles)/i,
      /I (don't|do not) have to be perfect/i,
    ],
    keywords: ['okay', 'human', 'forgive myself', 'deserve', 'kind to myself', 'learning'],
    baseConfidence: 0.8,
    defaultAcknowledgment: 'celebration',
    defaultTiming: 'immediate',
    defaultPauseMs: 300,
  },

  // 7. Boundary Attempt
  {
    type: 'boundary-attempt',
    patterns: [
      /I (said|told) (them|him|her) (no|I can't|I won't)/i,
      /I (need|have) to (set|establish|maintain)/i,
      /I('m| am) (not|no longer) (going to|willing to)/i,
      /I (drew|set) (a line|boundaries)/i,
      /I (stood up|spoke up) for (myself|my)/i,
      /I (told|asked) (them|him|her) to (stop|leave|give)/i,
      /I (finally|actually) (said|told)/i,
      /I (won't|can't) (let|allow) (them|myself)/i,
      /That('s| is) not (okay|acceptable) (with|for) me/i,
      /I (need|deserve) (space|time|respect)/i,
    ],
    keywords: ['boundary', 'no', 'stop', 'won\'t allow', 'need space', 'stood up'],
    baseConfidence: 0.75,
    defaultAcknowledgment: 'celebration',
    defaultTiming: 'immediate',
    defaultPauseMs: 200,
  },

  // 8. Growth Evidence
  {
    type: 'growth-evidence',
    patterns: [
      /I (used to|would have).*(but|however).*now/i,
      /I used to.*(but|however|,) now/i,
      /Before,? I (would|used to)/i,
      /I('ve| have) (changed|grown|learned)/i,
      /I (notice|see) (myself|the difference)/i,
      /I('m| am) (not|no longer) the same/i,
      /I (handle|respond|react) differently now/i,
      /Looking back,? I/i,
      /I('ve| have) (come|grown) (a long|so far)/i,
      /That (old|previous) (me|version|pattern)/i,
      /I (don't|do not) (do|think|feel) that (anymore|way)/i,
    ],
    keywords: ['used to', 'changed', 'grown', 'learned', 'differently', 'not anymore'],
    baseConfidence: 0.8,
    defaultAcknowledgment: 'celebration',
    defaultTiming: 'immediate',
    defaultPauseMs: 300,
  },
];

// ============================================================================
// ACKNOWLEDGMENT PHRASES
// ============================================================================

/**
 * Acknowledgment phrases by moment type
 */
export const ACKNOWLEDGMENT_PHRASES: Record<MicroMomentType, string[]> = {
  'vulnerability-edge': [
    "Thank you for trusting me with that.",
    "I hear you. That took courage.",
    "I'm honored you shared that.",
    "That's a big thing to say out loud.",
  ],
  'small-win': [
    "That's wonderful! How does that feel?",
    "Yes! That matters.",
    "I see you. That's not small at all.",
    "That's real progress.",
  ],
  'relationship-shift': [
    "I notice you're seeing them differently now.",
    "Something shifted in how you talk about them.",
    "That's a different lens.",
  ],
  'language-change': [
    "I notice you said 'we' there.",
    "You're including yourself in something bigger.",
    "That 'we' feels significant.",
  ],
  'hope-glimmer': [
    "I hear a little hope in that.",
    "That's a beautiful 'maybe'.",
    "Something is opening.",
    "Hold onto that possibility.",
  ],
  'self-compassion': [
    "Yes. You deserve that kindness.",
    "That's a gift you're giving yourself.",
    "Being gentle with yourself is growth.",
    "I love hearing you say that.",
  ],
  'boundary-attempt': [
    "That took strength.",
    "You're protecting something important.",
    "Good for you.",
    "That's honoring yourself.",
  ],
  'growth-evidence': [
    "You've come so far.",
    "I see the growth in you.",
    "That's not who you are anymore.",
    "Look how far you've traveled.",
  ],
};

/**
 * SSML templates for acknowledgments
 */
export const ACKNOWLEDGMENT_SSML: Record<MicroMomentType, string[]> = {
  'vulnerability-edge': [
    "<break time='300ms'/>Thank you<break time='200ms'/> for trusting me with that.",
    "<break time='400ms'/>I hear you.<break time='200ms'/> That took courage.",
  ],
  'small-win': [
    "That's wonderful!<break time='200ms'/> How does that feel?",
    "Yes!<break time='150ms'/> That matters.",
  ],
  'relationship-shift': [
    "<break time='200ms'/>I notice you're seeing them differently now.",
  ],
  'language-change': [
    "<break time='200ms'/>I notice you said 'we' there.",
  ],
  'hope-glimmer': [
    "<break time='300ms'/>I hear a little hope in that.",
    "That's a beautiful 'maybe'.",
  ],
  'self-compassion': [
    "<break time='200ms'/>Yes.<break time='150ms'/> You deserve that kindness.",
  ],
  'boundary-attempt': [
    "That took strength.",
    "<break time='200ms'/>Good for you.",
  ],
  'growth-evidence': [
    "You've come so far.",
    "<break time='200ms'/>I see the growth in you.",
  ],
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a random phrase for a moment type
 */
export function getRandomPhrase(type: MicroMomentType): string {
  const phrases = ACKNOWLEDGMENT_PHRASES[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a random SSML phrase for a moment type
 */
export function getRandomSsml(type: MicroMomentType): string {
  const phrases = ACKNOWLEDGMENT_SSML[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get rule for a moment type
 */
export function getRuleForType(type: MicroMomentType): MicroMomentRule | undefined {
  return MICRO_MOMENT_RULES.find((r) => r.type === type);
}
