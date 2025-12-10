/**
 * Cognitive Distortion Detection Engine
 *
 * Phase 18: Detect cognitive distortions in real-time and guide users
 * toward clearer thinking—like having a CBT therapist in your pocket.
 *
 * Detects 15 common cognitive distortions:
 * - Catastrophizing, Mind-Reading, All-or-Nothing
 * - Fortune-Telling, Personalization, Overgeneralization
 * - Mental Filtering, Disqualifying Positive, Should Statements
 * - Emotional Reasoning, Labeling, Magnification
 * - Minimization, Jumping to Conclusions, Blame
 *
 * @module CognitiveDistortionDetector
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'distortion-detector' });

// ============================================================================
// TYPES
// ============================================================================

export type CognitiveDistortion =
  | 'catastrophizing'
  | 'mind_reading'
  | 'all_or_nothing'
  | 'fortune_telling'
  | 'personalization'
  | 'overgeneralization'
  | 'mental_filtering'
  | 'disqualifying_positive'
  | 'should_statements'
  | 'emotional_reasoning'
  | 'labeling'
  | 'magnification'
  | 'minimization'
  | 'jumping_to_conclusions'
  | 'blame';

export interface DistortionDetection {
  type: CognitiveDistortion;
  confidence: number; // 0-1
  triggerPhrase: string;
  userMessage: string;

  // Therapeutic response options
  gentleChallenge: string; // Socratic question
  reframe: string; // Alternative perspective
  validation: string; // Acknowledge the feeling

  // Learning
  patternCount: number; // How often this user does this
  relatedDistortions: CognitiveDistortion[];
}

export interface ConversationContext {
  recentTopics?: string[];
  emotionalState?: string;
  relationshipStage?: string;
  previousDistortions?: DistortionDetection[];
}

export interface DistortionPattern {
  patterns: RegExp[];
  keywords: string[];
  contextClues: string[];
  gentleChallenges: string[];
  reframes: string[];
  validations: string[];
  relatedDistortions: CognitiveDistortion[];
}

// ============================================================================
// DISTORTION PATTERNS
// ============================================================================

const DISTORTION_PATTERNS: Record<CognitiveDistortion, DistortionPattern> = {
  catastrophizing: {
    patterns: [
      /\b(disaster|catastrophe|end of|ruined|destroyed|worst thing|life is over)\b/i,
      /\b(everything is|nothing will ever|always going to be)\b.*\b(terrible|awful|horrible)\b/i,
      /\b(can't survive|can't handle|can't cope|can't bear)\b/i,
      /\bwhat if.*(terrible|horrible|awful|disaster)/i,
    ],
    keywords: ['disaster', 'catastrophe', 'ruined', 'destroyed', 'unbearable', 'worst'],
    contextClues: ['extreme outcome', 'worst case', 'end of'],
    gentleChallenges: [
      "I hear the fear in that. Can I ask - what's the evidence this will definitely happen?",
      'That sounds really scary. What would you tell a friend who was thinking this?',
      "I'm curious - when you've worried like this before, how often did the worst actually happen?",
      "Let's slow down. What's the most likely outcome, if you had to bet on it?",
    ],
    reframes: [
      'Even if something goes wrong, it might not be the end - what could you do then?',
      "This feels huge right now. What's one small thing that could go okay?",
      "You've gotten through hard things before. What helped you then?",
    ],
    validations: [
      "It makes sense that you're worried - this matters to you.",
      "The fear feels very real right now, and that's okay.",
      'Your mind is trying to protect you by preparing for the worst.',
    ],
    relatedDistortions: ['fortune_telling', 'magnification', 'all_or_nothing'],
  },

  mind_reading: {
    patterns: [
      /\b(they think|everyone thinks|people think|she thinks|he thinks)\b.*\b(I'm|I am)\b/i,
      /\b(they must|they probably|they definitely)\b.*\b(think|believe|feel)\b/i,
      /\bI know (they|she|he|everyone)\b.*\b(thinks|feels|believes)\b/i,
      /\b(judging me|looking at me|talking about me)\b/i,
    ],
    keywords: ['they think', 'everyone knows', 'they must', 'judging', 'looking at me'],
    contextClues: ['assumed thoughts', "others' opinions", 'judgment'],
    gentleChallenges: [
      "How do you actually know what they're thinking?",
      'What evidence do you have for that versus against it?',
      'Have you ever been wrong about what someone was thinking?',
      'If you asked them directly, what might they actually say?',
    ],
    reframes: [
      'People are often more focused on themselves than we realize.',
      'There might be other explanations for their behavior.',
      "You can't know for sure without asking - and that's okay.",
    ],
    validations: [
      "It's natural to wonder what others think of us.",
      "Social situations can feel uncertain and that's uncomfortable.",
      'Your brain is trying to predict social outcomes to keep you safe.',
    ],
    relatedDistortions: ['jumping_to_conclusions', 'personalization', 'fortune_telling'],
  },

  all_or_nothing: {
    patterns: [
      /\b(either|or)\b.*\b(completely|totally|entirely|perfectly)\b/i,
      /\b(always|never|everyone|no one|nothing|everything)\b/i,
      /\b(perfect|failure|worthless|completely|totally)\b/i,
      /\bif.*(not perfect|not 100%|don't|can't).*then.*(worthless|failure|pointless)\b/i,
    ],
    keywords: ['always', 'never', 'everyone', 'no one', 'perfect', 'failure', 'worthless'],
    contextClues: ['extremes', 'binary thinking', 'absolutes'],
    gentleChallenges: [
      'Is it really always or never? Can you think of any exceptions?',
      "What would 'good enough' look like here?",
      "What's in between perfect and failure?",
      'Are there any shades of gray we might be missing?',
    ],
    reframes: [
      'Most things exist on a spectrum, not at extremes.',
      "Progress isn't perfect - and that's still progress.",
      'Partial success is still success.',
    ],
    validations: [
      "It's tempting to see things in black and white - it feels simpler.",
      'You have high standards, which shows you care.',
      "All-or-nothing thinking is really common when we're stressed.",
    ],
    relatedDistortions: ['catastrophizing', 'labeling', 'should_statements'],
  },

  fortune_telling: {
    patterns: [
      /\b(definitely|certainly|for sure)\b.*\b(will|going to|won't)\b/i,
      /\bit's (going to|gonna)\b.*\b(fail|go wrong|be bad)\b/i,
      /\bI know\b.*\b(will|won't)\b.*\b(work|happen|succeed)\b/i,
      /\bthere's no (way|chance|point)\b/i,
    ],
    keywords: ['definitely will', 'going to fail', 'no point', 'know it will'],
    contextClues: ['certain future', 'negative prediction', 'predetermined outcome'],
    gentleChallenges: [
      'How certain are you, really? What might surprise you?',
      'Can you predict the future with 100% accuracy? Has that worked before?',
      'What would need to happen for a different outcome?',
      'What evidence supports this prediction versus contradicts it?',
    ],
    reframes: [
      "The future is uncertain - that's scary but also means things could go better.",
      "You can influence outcomes even if you can't control them.",
      "Past patterns don't always predict future results.",
    ],
    validations: [
      "Wanting to know what's coming is natural - uncertainty is hard.",
      "Your brain is trying to prepare you, even if it's being a bit pessimistic.",
      'It feels safer to expect the worst sometimes.',
    ],
    relatedDistortions: ['catastrophizing', 'mind_reading', 'jumping_to_conclusions'],
  },

  personalization: {
    patterns: [
      /\b(my fault|because of me|I caused|I made)\b/i,
      /\bif (only )?I (had|hadn't|didn't)\b/i,
      /\b(blame myself|blaming myself|it's on me)\b/i,
      /\bthey.*(because|since).*(I|me)\b/i,
    ],
    keywords: ['my fault', 'because of me', 'I caused', 'blame myself'],
    contextClues: ['self-blame', 'taking responsibility', 'causation'],
    gentleChallenges: [
      'How much of this was actually in your control?',
      'What other factors might have contributed?',
      'Would you blame someone else this much if they were in your situation?',
      "Are you taking on responsibility that isn't yours?",
    ],
    reframes: [
      "You're one factor among many - not the only one.",
      "Taking responsibility is good; taking all the blame isn't fair to yourself.",
      "Others have agency too - their choices aren't your fault.",
    ],
    validations: [
      "Caring about your impact shows you're conscientious.",
      "It's hard when things go wrong and we want to understand why.",
      "Looking for what you could have done differently isn't bad - just be gentle.",
    ],
    relatedDistortions: ['should_statements', 'blame', 'all_or_nothing'],
  },

  overgeneralization: {
    patterns: [
      /\bthis always happens\b/i,
      /\bnothing (ever )?goes right\b/i,
      /\beveryone (always )?treats me\b/i,
      /\b(every time|each time)\b.*\b(same|always|never)\b/i,
    ],
    keywords: ['always happens', 'every time', 'nothing ever', 'everyone always'],
    contextClues: ['pattern assumption', 'sweeping conclusion', 'single event to all'],
    gentleChallenges: [
      'Does it really happen every single time? Any exceptions?',
      'What about the times it went differently?',
      'Is this a pattern, or is this one event feeling really big right now?',
      "How would you describe this if you couldn't use 'always' or 'never'?",
    ],
    reframes: [
      "This happened once (or a few times) - it's not a universal law.",
      'Each situation is actually a bit different.',
      "Past patterns can change - the future isn't written yet.",
    ],
    validations: [
      "When something bad happens, it's natural to look for patterns.",
      "It feels like a pattern even if it isn't - that's how our brains work.",
      "You're trying to make sense of something frustrating.",
    ],
    relatedDistortions: ['all_or_nothing', 'fortune_telling', 'mental_filtering'],
  },

  mental_filtering: {
    patterns: [
      /\b(but|however|except)\b.*\b(one thing|that part|the negative)\b/i,
      /\bthe only thing.*(that matters|I remember|I see)\b/i,
      /\bI can't stop thinking about\b/i,
      /\beverything was (good|fine|okay)\b.*\b(but|except|until)\b/i,
    ],
    keywords: ['but', 'except', 'only thing', "can't stop thinking"],
    contextClues: ['dismissing positives', 'focus on negative', 'filtering out good'],
    gentleChallenges: [
      'What else happened that you might be overlooking?',
      'If you had to name three good things about this, what would they be?',
      'Is this one thing the whole picture, or just part of it?',
      'What would someone who loves you notice about this situation?',
    ],
    reframes: [
      "The negative stands out, but it's not the whole story.",
      "Your brain is designed to notice threats - but threats aren't everything.",
      'Both the good and the bad can be true at the same time.',
    ],
    validations: [
      'It makes sense that this part feels biggest right now.',
      "Problems demand attention - that's why they're hard to ignore.",
      'Focusing on what went wrong can help us learn, but not if it crowds out everything else.',
    ],
    relatedDistortions: ['disqualifying_positive', 'magnification', 'overgeneralization'],
  },

  disqualifying_positive: {
    patterns: [
      /\b(doesn't count|doesn't matter|anyone could)\b/i,
      /\b(just luck|pure luck|only because)\b/i,
      /\byes,? but\b/i,
      /\b(that's not|it's not)\b.*\b(impressive|special|good|real)\b/i,
    ],
    keywords: ["doesn't count", 'just luck', 'anyone could', 'yes but'],
    contextClues: ['dismissing compliments', 'rejecting positives', 'minimizing success'],
    gentleChallenges: [
      "Why doesn't this count? What would have to be different for it to count?",
      "If a friend did the same thing, would you say it doesn't matter?",
      "What if it's not 'just luck' - what if you actually earned it?",
      "I noticed you said 'but' - what would happen if you left that out?",
    ],
    reframes: [
      "You did something - that's real, even if it felt easy.",
      'Luck might have helped, but you still showed up.',
      "Accepting a win doesn't mean you're arrogant.",
    ],
    validations: [
      'It can feel uncomfortable to accept praise.',
      "You have high standards for yourself, which is why this feels like 'not enough.'",
      'Deflecting compliments is really common - but you deserve to hear them.',
    ],
    relatedDistortions: ['mental_filtering', 'minimization', 'should_statements'],
  },

  should_statements: {
    patterns: [
      /\bI (should|shouldn't|must|have to|ought to|need to)\b/i,
      /\b(should've|shouldn't have|must have|had to)\b/i,
      /\bI'm supposed to\b/i,
      /\b(they should|you should|people should)\b/i,
    ],
    keywords: ['should', "shouldn't", 'must', 'have to', 'ought to', 'supposed to'],
    contextClues: ['obligation', 'rules', 'expectations', 'demands'],
    gentleChallenges: [
      "Says who? Where does this 'should' come from?",
      "What would happen if you didn't? Would it really be that bad?",
      "Is this a 'should' or a 'want'? Is there a difference for you?",
      "What if you replaced 'should' with 'would like to'?",
    ],
    reframes: [
      "'Should' can become 'I'd prefer' - same goal, less pressure.",
      'Rules are guides, not laws. You can question them.',
      "Being human means sometimes not meeting expectations - and that's okay.",
    ],
    validations: [
      "You care about doing things right, and that's admirable.",
      'Shoulds come from wanting to be good - but they can be heavy.',
      "External expectations feel real even when they're not serving you.",
    ],
    relatedDistortions: ['all_or_nothing', 'personalization', 'labeling'],
  },

  emotional_reasoning: {
    patterns: [
      /\bI feel.*(so|like).*(must be|it's|that's|I am)\b/i,
      /\b(feel|feels) (stupid|worthless|like a failure|like I'm)\b/i,
      /\bbecause I feel.*(means|so)\b/i,
      /\bif I feel.*(then|so|must)\b/i,
    ],
    keywords: ['feel like I am', 'feels like', 'because I feel', 'I feel so'],
    contextClues: ['emotion as evidence', 'feeling as fact', 'mood determines reality'],
    gentleChallenges: [
      "Feeling something and it being true are different things. What's the evidence outside your feelings?",
      'Have you ever felt this way before and it turned out to not be true?',
      'If your feelings changed tomorrow, would the facts change too?',
      'What would you think about this on a day when you felt differently?',
    ],
    reframes: [
      "Feelings are real, but they're not always accurate reporters of reality.",
      "Emotions give us information, but they're not the whole picture.",
      "You can feel something strongly and still question if it's the full truth.",
    ],
    validations: [
      "Your feelings are valid - they're just not the only source of truth.",
      "When emotions are intense, they can feel like facts. That's normal.",
      'Trusting our gut is usually good, but sometimes our gut needs a reality check.',
    ],
    relatedDistortions: ['labeling', 'catastrophizing', 'mind_reading'],
  },

  labeling: {
    patterns: [
      /\bI('m| am) (a |an )?(failure|loser|idiot|stupid|worthless|bad person)\b/i,
      /\b(they are|she's|he's) (a |an )?(jerk|narcissist|terrible|awful)\b/i,
      /\b(this makes me|that makes me) (a |an )?\w+\b/i,
      /\bI('m| am) (just|always|nothing but) (a |an )?\w+\b/i,
    ],
    keywords: ['I am a', 'failure', 'loser', 'idiot', 'worthless', 'bad person'],
    contextClues: ['identity statement', 'defining self by behavior', 'global label'],
    gentleChallenges: [
      "Is that a label you'd put on someone else for the same thing?",
      'Does one action define who you are as a person?',
      'What would you say to a friend who called themselves that?',
      "If you're a '[label]', what does that make all the good things you've done?",
    ],
    reframes: [
      "You did a thing - that's different from being a thing.",
      "One action doesn't erase everything else about you.",
      'People are complex - no single label captures anyone.',
    ],
    validations: [
      "It's easier to slap a label on than to sit with complexity.",
      "When we're hurting, harsh words feel deserved. They're usually not.",
      'Self-criticism comes from a place of wanting to be better. But there are gentler ways.',
    ],
    relatedDistortions: ['all_or_nothing', 'overgeneralization', 'emotional_reasoning'],
  },

  magnification: {
    patterns: [
      /\b(huge|enormous|massive|terrible|devastating|crushing)\b/i,
      /\b(worst|biggest|most embarrassing|most terrible)\b/i,
      /\b(can never|will never|completely|totally|utterly)\b/i,
      /\b(everyone saw|the whole world|entire|absolutely)\b/i,
    ],
    keywords: ['huge', 'devastating', 'worst', 'absolutely', 'completely'],
    contextClues: ['exaggeration', 'extreme language', 'inflated importance'],
    gentleChallenges: [
      'On a scale of 1-10, where does this really sit?',
      'Will this matter in a week? A month? A year?',
      'Is this the biggest thing, or does it just feel that way right now?',
      'What would someone outside the situation say about its size?',
    ],
    reframes: [
      'This feels big right now. It might look smaller from a distance.',
      'Problems often shrink when we step back.',
      'Real but not as huge as it seems.',
    ],
    validations: [
      "When something matters, it feels enormous. That's human.",
      'Your feelings are amplifying this because you care.',
      "It's hard to have perspective when you're in the middle of it.",
    ],
    relatedDistortions: ['catastrophizing', 'all_or_nothing', 'mental_filtering'],
  },

  minimization: {
    patterns: [
      /\b(no big deal|doesn't matter|not important|not a big)\b/i,
      /\b(it's (just|only|nothing)|that's (just|only|nothing))\b/i,
      /\b(anyone could|it's easy|not that hard)\b/i,
      /\b(whatever|doesn't even|not really)\b/i,
    ],
    keywords: ['no big deal', "doesn't matter", 'just', 'only', 'whatever'],
    contextClues: ['downplaying', 'dismissing', 'shrinking importance'],
    gentleChallenges: [
      'What if it does matter? What would be different?',
      "If someone else did this, would you say it's 'no big deal'?",
      'What are you protecting yourself from by making it smaller?',
      'Is minimizing this helping or hurting you?',
    ],
    reframes: [
      'Something can be manageable and still matter.',
      "Acknowledging difficulty isn't the same as complaining.",
      'Your efforts and experiences deserve recognition.',
    ],
    validations: [
      "Minimizing can feel protective - it's a coping strategy.",
      "It's okay to let things be what they are, without shrinking them.",
      "You might be used to not taking up space. That's okay to notice.",
    ],
    relatedDistortions: ['disqualifying_positive', 'should_statements', 'mental_filtering'],
  },

  jumping_to_conclusions: {
    patterns: [
      /\b(obviously|clearly|must be|has to be)\b.*\b(because|since|means)\b/i,
      /\bthat (means|proves|shows) that\b/i,
      /\bI (just )?know that\b/i,
      /\b(without|before).*(evidence|proof|asking)\b/i,
    ],
    keywords: ['obviously', 'clearly', 'must be', 'that means', 'I just know'],
    contextClues: ['assumption', 'inference without evidence', 'certainty without facts'],
    gentleChallenges: [
      "What's the evidence for that conclusion?",
      'Are there other possible explanations?',
      'How would you test if this is actually true?',
      'What would you need to know to be sure?',
    ],
    reframes: [
      "There might be information you don't have yet.",
      'Multiple explanations can fit the same facts.',
      'Being uncertain is uncomfortable but more accurate.',
    ],
    validations: [
      "Our brains love to fill in gaps - it's how we make sense of things.",
      "Making assumptions saves mental energy, even if they're sometimes wrong.",
      'Wanting answers quickly is natural.',
    ],
    relatedDistortions: ['mind_reading', 'fortune_telling', 'personalization'],
  },

  blame: {
    patterns: [
      /\b(all (their|his|her|your) fault|entirely (their|his|her|your))\b/i,
      /\b(because (they|he|she|you)|they made me)\b/i,
      /\b(wouldn't have|never would have).*(if (they|he|she|you))\b/i,
      /\b(their|his|her) (problem|fault|responsibility)\b/i,
    ],
    keywords: ['their fault', 'made me', 'because they', 'their problem'],
    contextClues: ['external attribution', 'no personal responsibility', 'other-directed'],
    gentleChallenges: [
      'What part of this, if any, was in your control?',
      'Even if they contributed, is it entirely on them?',
      'What would change if you took back some agency here?',
      'Is blaming helping you move forward or keeping you stuck?',
    ],
    reframes: [
      'They may have contributed, but you still have choices.',
      'Shared responsibility is usually more accurate than full blame.',
      "Understanding others' faults doesn't mean ignoring your own power.",
    ],
    validations: [
      "When we're hurt, it's natural to look for who did this.",
      "Other people do affect our lives - that's real.",
      "Anger at others can be protective. Just make sure it's not a trap.",
    ],
    relatedDistortions: ['personalization', 'all_or_nothing', 'jumping_to_conclusions'],
  },
};

// ============================================================================
// USER PATTERN STORAGE
// ============================================================================

interface UserDistortionHistory {
  distortionCounts: Map<CognitiveDistortion, number>;
  recentDetections: DistortionDetection[];
  lastUpdated: Date;
}

const userHistories = new Map<string, UserDistortionHistory>();

function getUserHistory(userId: string): UserDistortionHistory {
  if (!userHistories.has(userId)) {
    userHistories.set(userId, {
      distortionCounts: new Map(),
      recentDetections: [],
      lastUpdated: new Date(),
    });
  }
  return userHistories.get(userId)!;
}

function updateUserHistory(userId: string, detection: DistortionDetection): void {
  const history = getUserHistory(userId);
  const currentCount = history.distortionCounts.get(detection.type) || 0;
  history.distortionCounts.set(detection.type, currentCount + 1);
  history.recentDetections.push(detection);

  // Keep only last 100 detections
  if (history.recentDetections.length > 100) {
    history.recentDetections = history.recentDetections.slice(-100);
  }

  history.lastUpdated = new Date();
}

// ============================================================================
// DETECTION ENGINE
// ============================================================================

/**
 * Detect cognitive distortions in a user message.
 */
export function detectDistortions(
  userId: string,
  message: string,
  context?: ConversationContext
): DistortionDetection[] {
  const detections: DistortionDetection[] = [];
  const history = getUserHistory(userId);

  for (const [distortionType, pattern] of Object.entries(DISTORTION_PATTERNS)) {
    const type = distortionType as CognitiveDistortion;

    // Check regex patterns
    for (const regex of pattern.patterns) {
      const match = message.match(regex);
      if (match) {
        const confidence = calculateConfidence(message, pattern, context);

        if (confidence >= 0.5) {
          // Only report if reasonably confident
          const patternCount = history.distortionCounts.get(type) || 0;

          const detection: DistortionDetection = {
            type,
            confidence,
            triggerPhrase: match[0],
            userMessage: message,
            gentleChallenge: selectRandom(pattern.gentleChallenges),
            reframe: selectRandom(pattern.reframes),
            validation: selectRandom(pattern.validations),
            patternCount: patternCount + 1,
            relatedDistortions: pattern.relatedDistortions,
          };

          detections.push(detection);
          updateUserHistory(userId, detection);

          log.debug(
            { userId, type, confidence, trigger: match[0] },
            'Cognitive distortion detected'
          );

          break; // Only one detection per distortion type
        }
      }
    }

    // Also check keywords if no regex matched
    if (!detections.find((d) => d.type === type)) {
      const keywordMatch = checkKeywords(message, pattern.keywords);
      if (keywordMatch) {
        const confidence = calculateConfidence(message, pattern, context) * 0.8; // Lower confidence for keyword-only

        if (confidence >= 0.5) {
          const patternCount = history.distortionCounts.get(type) || 0;

          const detection: DistortionDetection = {
            type,
            confidence,
            triggerPhrase: keywordMatch,
            userMessage: message,
            gentleChallenge: selectRandom(pattern.gentleChallenges),
            reframe: selectRandom(pattern.reframes),
            validation: selectRandom(pattern.validations),
            patternCount: patternCount + 1,
            relatedDistortions: pattern.relatedDistortions,
          };

          detections.push(detection);
          updateUserHistory(userId, detection);
        }
      }
    }
  }

  // Sort by confidence descending
  detections.sort((a, b) => b.confidence - a.confidence);

  // Return top 3 most confident detections
  return detections.slice(0, 3);
}

/**
 * Get a gentle response for a detected distortion.
 */
export function getGentleResponse(detection: DistortionDetection): string {
  // Structure: Validation + Gentle Challenge
  return `${detection.validation} ${detection.gentleChallenge}`;
}

/**
 * Get distortion statistics for a user.
 */
export function getUserDistortionStats(userId: string): {
  topDistortions: Array<{ type: CognitiveDistortion; count: number }>;
  totalDetections: number;
  recentTrend: 'increasing' | 'stable' | 'decreasing';
} {
  const history = getUserHistory(userId);

  const topDistortions = Array.from(history.distortionCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalDetections = Array.from(history.distortionCounts.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  // Calculate trend from recent detections
  const recent = history.recentDetections;
  let recentTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';

  if (recent.length >= 10) {
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2)).length;
    const secondHalf = recent.slice(Math.floor(recent.length / 2)).length;

    if (secondHalf > firstHalf * 1.2) recentTrend = 'increasing';
    else if (secondHalf < firstHalf * 0.8) recentTrend = 'decreasing';
  }

  return { topDistortions, totalDetections, recentTrend };
}

/**
 * Get ANT (Automatic Negative Thoughts) profile for a user.
 * Alias for getUserDistortionStats with legacy-compatible return type.
 */
export function getANTProfile(userId: string): {
  totalDetected: number;
  topDistortions: Array<{ type: CognitiveDistortion; count: number }>;
  recentTrend: 'increasing' | 'stable' | 'decreasing';
} {
  const stats = getUserDistortionStats(userId);
  return {
    totalDetected: stats.totalDetections,
    topDistortions: stats.topDistortions,
    recentTrend: stats.recentTrend,
  };
}

/**
 * Check if a specific distortion type is common for this user.
 */
export function isCommonDistortion(userId: string, type: CognitiveDistortion): boolean {
  const history = getUserHistory(userId);
  const count = history.distortionCounts.get(type) || 0;
  return count >= 3;
}

/**
 * Get context injection for LLM.
 */
export function getDistortionContextInjection(detections: DistortionDetection[]): string {
  if (detections.length === 0) return '';

  const primary = detections[0];

  return `[🧠 COGNITIVE PATTERN DETECTED]
Distortion: ${formatDistortionName(primary.type)}
Phrase: "${primary.triggerPhrase}"
This is pattern #${primary.patternCount} for this user.

Gentle challenge: "${primary.gentleChallenge}"

DO: Validate the feeling, then gently explore the thought
DON'T: Dismiss, lecture, or jump to reframes too fast

Remember: They need to discover the reframe, not be told it.`;
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateConfidence(
  message: string,
  pattern: DistortionPattern,
  context?: ConversationContext
): number {
  let confidence = 0.6; // Base confidence for regex match

  // Boost for keywords present
  const keywordsFound = pattern.keywords.filter((kw) =>
    message.toLowerCase().includes(kw.toLowerCase())
  ).length;
  confidence += keywordsFound * 0.1;

  // Boost for emotional context
  if (context?.emotionalState) {
    const emotionalStates = ['sad', 'anxious', 'angry', 'frustrated', 'overwhelmed'];
    if (emotionalStates.some((e) => context.emotionalState?.toLowerCase().includes(e))) {
      confidence += 0.1;
    }
  }

  // Boost for message length (longer = more context = more confident)
  if (message.length > 100) confidence += 0.05;

  // Cap at 0.95
  return Math.min(confidence, 0.95);
}

function checkKeywords(message: string, keywords: string[]): string | null {
  const lowerMessage = message.toLowerCase();
  for (const keyword of keywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

function selectRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDistortionName(type: CognitiveDistortion): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const distortionDetector = {
  detect: detectDistortions,
  getResponse: getGentleResponse,
  getStats: getUserDistortionStats,
  isCommon: isCommonDistortion,
  getContextInjection: getDistortionContextInjection,
};

export default distortionDetector;
