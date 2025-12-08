/**
 * Cognitive Distortion Detector
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Real-time detection of cognitive distortions in user messages.
 * Based on CBT (Cognitive Behavioral Therapy) frameworks.
 *
 * PHILOSOPHY:
 * A great coach notices when someone is stuck in a thinking trap.
 * Not to lecture, but to gently invite curiosity about the thought.
 * The goal is never to dismiss feelings—it's to question thoughts
 * that may not be serving them.
 *
 * This detector identifies 15 common cognitive distortions and provides:
 * - Detection with confidence scoring
 * - Gentle Socratic challenges
 * - Alternative reframes
 * - Validation of underlying feelings
 *
 * @module CognitiveIntelligence/DistortionDetector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  CognitiveDistortion,
  DistortionDetection,
  DistortionMetadata,
  DistortionResponse,
  ResponseApproach,
  ANTProfile,
} from './types.js';

const log = createLogger({ module: 'DistortionDetector' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

/** User ANT profiles for tracking patterns */
const userProfiles = new Map<string, ANTProfile>();

/** Recent detections per user (for deduplication) */
const recentDetections = new Map<string, Array<{ type: CognitiveDistortion; timestamp: Date }>>();

// ============================================================================
// DISTORTION PATTERNS DATABASE
// ============================================================================

/**
 * Comprehensive patterns for detecting each cognitive distortion.
 * Based on CBT literature and clinical observation.
 */
export const DISTORTION_PATTERNS: Record<CognitiveDistortion, DistortionMetadata> = {
  // -------------------------------------------------------------------------
  // CATASTROPHIZING
  // -------------------------------------------------------------------------
  catastrophizing: {
    type: 'catastrophizing',
    name: 'Catastrophizing',
    description: 'Expecting the worst possible outcome',
    gentleLabel: 'jumping to the worst case',

    indicatorPhrases: [
      'end of the world',
      'my life is over',
      'ruined everything',
      'disaster',
      'catastrophe',
      'worst thing ever',
      'never recover',
      'completely destroyed',
      'absolute worst',
      'everything is ruined',
      'total failure',
      "can't survive",
      'everything will fall apart',
    ],

    patterns: [
      /\b(this is|it's|that's) the end\b/i,
      /\bif .*? (then|,) .*(everything|my life|career|relationship).*(over|ruined|destroyed|done)/i,
      /\bwhat if .*(worst|terrible|horrible|disaster)/i,
      /\b(never|won't|can't) (recover|bounce back|be the same)/i,
      /\b(going to|will) (ruin|destroy|end) (everything|my life|career)/i,
      /\bi('ll| will) (die|lose everything|be alone forever)/i,
    ],

    contextTriggers: ['work', 'relationship', 'health', 'money', 'future'],
    associatedEmotions: ['fear', 'anxiety', 'panic', 'dread'],
  },

  // -------------------------------------------------------------------------
  // MIND READING
  // -------------------------------------------------------------------------
  mind_reading: {
    type: 'mind_reading',
    name: 'Mind Reading',
    description: 'Assuming you know what others think without evidence',
    gentleLabel: 'assuming what others are thinking',

    indicatorPhrases: [
      'they think i',
      'everyone thinks',
      'they must think',
      'they probably think',
      'they all think',
      'people think i',
      'i know they think',
      'they see me as',
      'they must see me',
      'judging me',
      'looking at me like',
    ],

    patterns: [
      /\b(they|everyone|people|she|he) (think|thinks|thought|must think|probably think)(s)? (i'm|i am|that i)/i,
      /\b(they|everyone) (see|sees|saw) me as\b/i,
      /\bi know (they|everyone|she|he) (think|thinks|thought)/i,
      /\b(they're|everyone's) (judging|laughing at|looking down on) me\b/i,
      /\bi can tell (they|everyone|she|he) (think|thinks|doesn't like|hates)/i,
      /\b(they|she|he) must (hate|despise|be annoyed|be angry)/i,
    ],

    contextTriggers: ['social', 'work', 'relationship', 'family', 'presentation'],
    associatedEmotions: ['anxiety', 'shame', 'embarrassment', 'insecurity'],
  },

  // -------------------------------------------------------------------------
  // ALL-OR-NOTHING THINKING
  // -------------------------------------------------------------------------
  all_or_nothing: {
    type: 'all_or_nothing',
    name: 'All-or-Nothing Thinking',
    description: 'Seeing things in black and white, with no middle ground',
    gentleLabel: 'all-or-nothing thinking',

    indicatorPhrases: [
      'complete failure',
      'total disaster',
      'completely worthless',
      'absolutely perfect',
      'entirely my fault',
      'nothing ever works',
      'always mess up',
      'never do anything right',
      'either perfect or',
      'all or nothing',
    ],

    patterns: [
      /\bi('m| am) (a )?(complete|total|utter|absolute) (failure|disaster|mess|idiot|loser)/i,
      /\b(everything|nothing) (is|was|will be) (perfect|terrible|ruined|great)/i,
      /\bi (always|never) (succeed|fail|mess up|do well|get it right)/i,
      /\bif (it's|i'm) not perfect,? (it's|i'm) (worthless|a failure|garbage|trash)/i,
      /\bthere's no (middle ground|in between|gray area)/i,
      /\b(either|must be) .* or .* (nothing|worthless|complete failure)/i,
    ],

    contextTriggers: ['achievement', 'work', 'performance', 'self-worth'],
    associatedEmotions: ['frustration', 'shame', 'disappointment', 'anger'],
  },

  // -------------------------------------------------------------------------
  // FORTUNE TELLING
  // -------------------------------------------------------------------------
  fortune_telling: {
    type: 'fortune_telling',
    name: 'Fortune Telling',
    description: 'Predicting negative outcomes with certainty',
    gentleLabel: 'predicting the future',

    indicatorPhrases: [
      "it's going to fail",
      "it won't work",
      "they won't like",
      "i'll never",
      "it's definitely going to",
      "there's no way it'll",
      'guaranteed to fail',
      'bound to go wrong',
      "i know it'll be",
    ],

    patterns: [
      /\b(it's|this is) (definitely|certainly|absolutely|100%) going to (fail|go wrong|be terrible)/i,
      /\bi (know|just know|already know) (it|this|that) (will|won't|is going to) (fail|work out|go well)/i,
      /\bthere's no (way|chance|possibility) (it|this|that) (will|could) (work|succeed|go well)/i,
      /\bi('ll| will) (definitely|never|always) (fail|succeed|mess up|get rejected)/i,
      /\b(guaranteed|bound|destined|fated) to (fail|go wrong|be bad)/i,
    ],

    contextTriggers: ['future', 'plans', 'decisions', 'opportunities', 'change'],
    associatedEmotions: ['anxiety', 'fear', 'hopelessness', 'dread'],
  },

  // -------------------------------------------------------------------------
  // PERSONALIZATION
  // -------------------------------------------------------------------------
  personalization: {
    type: 'personalization',
    name: 'Personalization',
    description: 'Taking responsibility for things outside your control',
    gentleLabel: 'taking on too much responsibility',

    indicatorPhrases: [
      "it's all my fault",
      'i made this happen',
      'because of me',
      'i caused this',
      "if i hadn't",
      'i should have prevented',
      'i ruined',
      'i drove them to',
      'my fault they',
    ],

    patterns: [
      /\b(it's|this is) (all|entirely|completely) my fault\b/i,
      /\bif (i|i'd|i had) (just|only|hadn't) .*(this wouldn't|none of this)/i,
      /\bi (caused|created|made|forced) (this|them|everyone|it)/i,
      /\b(because of|thanks to) me,? .*(ruined|failed|happened)/i,
      /\bi should have (stopped|prevented|seen|known|done something)/i,
      /\bthey .* because (i|of me|of what i)/i,
    ],

    contextTriggers: ['conflict', 'failure', 'others emotions', 'family', 'relationship'],
    associatedEmotions: ['guilt', 'shame', 'responsibility', 'regret'],
  },

  // -------------------------------------------------------------------------
  // OVERGENERALIZATION
  // -------------------------------------------------------------------------
  overgeneralization: {
    type: 'overgeneralization',
    name: 'Overgeneralization',
    description: 'Drawing broad conclusions from a single event',
    gentleLabel: 'generalizing from one experience',

    indicatorPhrases: [
      'this always happens',
      'it never works',
      'everyone always',
      'nobody ever',
      'i always fail',
      'things never go',
      'every time i try',
      'nothing ever changes',
    ],

    patterns: [
      /\bthis (always|never) happens( to me)?\b/i,
      /\bi (always|never) (fail|succeed|mess up|get it right|do well)/i,
      /\b(everyone|nobody|no one) (always|ever|never) (likes|helps|supports|understands)/i,
      /\b(everything|nothing) (always|ever|never) (works|goes right|changes)/i,
      /\bevery (time|single time) (i|this) .*(fail|wrong|bad|mess)/i,
      /\bi('ll| will) (always|never) be .*(alone|failure|rejected|good enough)/i,
    ],

    contextTriggers: ['setback', 'rejection', 'failure', 'disappointment'],
    associatedEmotions: ['hopelessness', 'frustration', 'sadness', 'resignation'],
  },

  // -------------------------------------------------------------------------
  // MENTAL FILTERING
  // -------------------------------------------------------------------------
  mental_filtering: {
    type: 'mental_filtering',
    name: 'Mental Filtering',
    description: 'Focusing only on negatives while ignoring positives',
    gentleLabel: 'filtering out the positive',

    indicatorPhrases: [
      'but the bad part',
      'but then they said',
      "doesn't matter because",
      'yeah but',
      'the only thing that matters is',
      'all i can think about',
      "i can't stop thinking about",
      'even though .* but',
    ],

    patterns: [
      /\b(yeah|yes|okay|sure|it was good) but .*(then|also|except|however|the problem)/i,
      /\b(doesn't|didn't|won't) matter (because|since|that) .*(said|happened|did)/i,
      /\bi (can't|cannot) (stop|quit|help) (thinking|focusing|dwelling) (about|on) (the|that|this) (one|bad|negative)/i,
      /\bthe only thing (that|i can) (matters|see|think about) is .*(bad|wrong|negative|mistake)/i,
      /\beven though .*(good|positive|well).* but .*(one|that|this) (thing|part|moment)/i,
    ],

    contextTriggers: ['feedback', 'evaluation', 'reflection', 'achievement'],
    associatedEmotions: ['disappointment', 'sadness', 'dissatisfaction', 'negativity'],
  },

  // -------------------------------------------------------------------------
  // DISQUALIFYING THE POSITIVE
  // -------------------------------------------------------------------------
  disqualifying_positive: {
    type: 'disqualifying_positive',
    name: 'Disqualifying the Positive',
    description: 'Dismissing positive experiences as not counting',
    gentleLabel: 'dismissing the positive',

    indicatorPhrases: [
      "that doesn't count",
      'it was just luck',
      'anyone could do that',
      'they were just being nice',
      "they didn't mean it",
      "it's not a big deal",
      'they have to say that',
      "doesn't really mean anything",
      'they were just being polite',
    ],

    patterns: [
      /\bthat (doesn't|didn't|won't) (count|mean anything|matter)/i,
      /\b(it was|that was) (just|only) (luck|fluke|coincidence|chance)/i,
      /\b(anyone|everybody) could (do|have done) that\b/i,
      /\bthey (were|are|was) (just|only) being (nice|polite|kind)/i,
      /\bthey (have|had|has) to say that\b/i,
      /\b(it's|that's) not (really|actually) (a big deal|important|special|an achievement)/i,
    ],

    contextTriggers: ['compliment', 'achievement', 'success', 'praise', 'recognition'],
    associatedEmotions: ['low self-worth', 'insecurity', 'imposter syndrome', 'embarrassment'],
  },

  // -------------------------------------------------------------------------
  // SHOULD STATEMENTS
  // -------------------------------------------------------------------------
  should_statements: {
    type: 'should_statements',
    name: 'Should Statements',
    description: 'Rigid rules about how things should be',
    gentleLabel: 'shoulding on yourself',

    indicatorPhrases: [
      'i should have',
      'i should be',
      'i must be',
      'i ought to',
      'i have to be',
      'they should have',
      "shouldn't have",
      "shouldn't feel",
      'must not',
      'have to be perfect',
    ],

    patterns: [
      /\bi (should|must|ought to|have to) (be|have|do|feel|know) .*(better|more|less|perfect)/i,
      /\bi (shouldn't|should not|mustn't) (feel|be|have|want)/i,
      /\b(they|he|she|people) (should|shouldn't|must|mustn't) (have|be|do)/i,
      /\bi (should|must) have (known|done|seen|been|said)/i,
      /\bwhy (can't|couldn't|didn't) i (just|be|do|have)/i,
    ],

    contextTriggers: ['expectations', 'self-criticism', 'comparison', 'performance'],
    associatedEmotions: ['guilt', 'shame', 'frustration', 'anger', 'inadequacy'],
  },

  // -------------------------------------------------------------------------
  // EMOTIONAL REASONING
  // -------------------------------------------------------------------------
  emotional_reasoning: {
    type: 'emotional_reasoning',
    name: 'Emotional Reasoning',
    description: 'Believing feelings are facts',
    gentleLabel: 'letting feelings become facts',

    indicatorPhrases: [
      'i feel like a failure so i am',
      'i feel stupid so i must be',
      'i feel worthless',
      'i feel like a burden',
      "i feel like they don't like me",
      'i feel like a loser',
      'i feel incompetent',
      'i feel unwanted',
    ],

    patterns: [
      /\bi feel (like )?(a )?(failure|loser|burden|idiot|worthless|stupid|incompetent)/i,
      /\bi feel .* so (i must be|i am|it must be true)/i,
      /\bi feel like (they|everyone|nobody|people) (don't|doesn't|hate|dislike)/i,
      /\bif i feel .* then (it|i) must be\b/i,
      /\bi feel (unwanted|unloved|rejected) so (i am|i must be|they must)/i,
    ],

    contextTriggers: ['self-worth', 'relationships', 'performance', 'social'],
    associatedEmotions: ['sadness', 'shame', 'insecurity', 'fear'],
  },

  // -------------------------------------------------------------------------
  // LABELING
  // -------------------------------------------------------------------------
  labeling: {
    type: 'labeling',
    name: 'Labeling',
    description: 'Attaching global negative labels based on specific events',
    gentleLabel: 'labeling yourself',

    indicatorPhrases: [
      "i'm a failure",
      "i'm an idiot",
      "i'm a loser",
      "i'm worthless",
      "i'm pathetic",
      "i'm stupid",
      "i'm unlovable",
      "they're a jerk",
      "she's a terrible person",
    ],

    patterns: [
      /\bi('m| am) (a )?(complete |total |such a )?(failure|loser|idiot|moron|disaster|mess|screw-?up|worthless|pathetic|stupid)/i,
      /\bi('m| am) (just )?(so )?(dumb|stupid|incompetent|useless|hopeless)/i,
      /\bi('m| am) (un)?lov(e)?able\b/i,
      /\b(they|she|he) (is|are) (a )?(jerk|idiot|terrible person|monster|narcissist)/i,
      /\bi('m| am) (the|such a) worst\b/i,
    ],

    contextTriggers: ['mistake', 'failure', 'conflict', 'rejection'],
    associatedEmotions: ['shame', 'self-loathing', 'anger', 'despair'],
  },

  // -------------------------------------------------------------------------
  // MAGNIFICATION
  // -------------------------------------------------------------------------
  magnification: {
    type: 'magnification',
    name: 'Magnification',
    description: 'Blowing things out of proportion',
    gentleLabel: 'making things bigger than they are',

    indicatorPhrases: [
      'this is huge',
      'this is massive',
      'the biggest mistake',
      'the worst thing',
      'absolutely terrible',
      'completely unbearable',
      'totally unacceptable',
      'the most embarrassing',
    ],

    patterns: [
      /\bthis is (the )?(biggest|worst|most terrible|most embarrassing|most horrible)/i,
      /\b(absolutely|completely|totally|utterly) (terrible|unbearable|unacceptable|devastating|catastrophic)/i,
      /\bthe (absolute )?(worst|biggest|most) (thing|mistake|failure|embarrassment)/i,
      /\b(so|extremely|incredibly) (bad|terrible|horrible|embarrassing) that\b/i,
    ],

    contextTriggers: ['mistake', 'problem', 'setback', 'conflict'],
    associatedEmotions: ['anxiety', 'shame', 'fear', 'overwhelm'],
  },

  // -------------------------------------------------------------------------
  // MINIMIZATION
  // -------------------------------------------------------------------------
  minimization: {
    type: 'minimization',
    name: 'Minimization',
    description: 'Downplaying achievements or positive traits',
    gentleLabel: 'minimizing your achievements',

    indicatorPhrases: [
      "it's nothing",
      "it's no big deal",
      'anyone could have',
      'it was easy',
      "doesn't really matter",
      "i didn't do much",
      'it was nothing special',
      'barely anything',
    ],

    patterns: [
      /\b(it's|that's|this is) (nothing|no big deal|not a big deal|not important)/i,
      /\b(anyone|everybody|most people) could (have )?(done|do) (that|this|it)/i,
      /\bi (didn't|don't) (really )?(do|did) (much|anything special|anything important)/i,
      /\b(it|that) (was|is) (just|only|barely) (luck|coincidence|easy|nothing)/i,
      /\b(doesn't|didn't|won't) (really |actually )?(matter|mean anything|count)/i,
    ],

    contextTriggers: ['achievement', 'success', 'compliment', 'recognition'],
    associatedEmotions: ['insecurity', 'imposter syndrome', 'low self-worth'],
  },

  // -------------------------------------------------------------------------
  // JUMPING TO CONCLUSIONS
  // -------------------------------------------------------------------------
  jumping_to_conclusions: {
    type: 'jumping_to_conclusions',
    name: 'Jumping to Conclusions',
    description: 'Reaching conclusions without sufficient evidence',
    gentleLabel: 'jumping to conclusions',

    indicatorPhrases: [
      'i just know',
      'obviously they',
      "it's clear that",
      'they definitely',
      'they must have',
      'obviously means',
      'clearly they',
    ],

    patterns: [
      /\bi (just )?(know|knew) (that )?(they|it|this|she|he) (will|won't|did|didn't|is|isn't)/i,
      /\b(obviously|clearly|definitely) (they|it|this|she|he|means|shows)/i,
      /\bit('s| is) (obvious|clear) that\b/i,
      /\bthey (must have|definitely|obviously|clearly) (did|said|think|thought|meant)/i,
      /\bthat (must|obviously|clearly) mean(s)?\b/i,
    ],

    contextTriggers: ['social', 'communication', 'relationship', 'interpretation'],
    associatedEmotions: ['anxiety', 'suspicion', 'fear', 'insecurity'],
  },

  // -------------------------------------------------------------------------
  // BLAME
  // -------------------------------------------------------------------------
  blame: {
    type: 'blame',
    name: 'Blame',
    description: 'Holding others entirely responsible for problems',
    gentleLabel: 'placing all the blame elsewhere',

    indicatorPhrases: [
      "it's their fault",
      "it's all because of them",
      'they made me',
      'they caused this',
      "if they hadn't",
      'they ruined',
      'they did this to me',
      'because of them',
    ],

    patterns: [
      /\b(it's|this is) (all )?(their|his|her|your) fault\b/i,
      /\b(they|he|she) (made|forced|caused) me (to )?\b/i,
      /\bif (they|he|she) (hadn't|didn't|wouldn't),? .*(this wouldn't|none of this)/i,
      /\b(they|he|she) (ruined|destroyed|messed up) (everything|my life|this)/i,
      /\b(because of|thanks to) (them|him|her),? .*(ruined|failed|happened)/i,
    ],

    contextTriggers: ['conflict', 'failure', 'disappointment', 'relationship'],
    associatedEmotions: ['anger', 'resentment', 'frustration', 'victimization'],
  },
};

// ============================================================================
// RESPONSE TEMPLATES
// ============================================================================

/**
 * Gentle challenges and reframes for each distortion type.
 * These are designed to invite curiosity, not lecture.
 */
const RESPONSE_TEMPLATES: Record<
  CognitiveDistortion,
  {
    gentleChallenges: string[];
    reframes: string[];
    validations: string[];
  }
> = {
  catastrophizing: {
    gentleChallenges: [
      "What's the evidence that the absolute worst will happen?",
      "What's the most likely outcome, if you had to bet on it?",
      'If the worst happened, what would you actually do? Could you cope?',
      "When you've worried like this before, how often did the worst case actually happen?",
    ],
    reframes: [
      'The worst case is possible, but probable is different from possible.',
      'Even difficult outcomes are usually survivable—and you have more resources than you think.',
      "Your mind is trying to protect you by preparing for the worst, but that's not the only future.",
    ],
    validations: [
      'I hear how scary this feels.',
      "It makes sense you're worried—this matters to you.",
      'The fear is real, even if the prediction might not be.',
    ],
  },

  mind_reading: {
    gentleChallenges: [
      "What's the actual evidence they think that?",
      'Have they said that directly, or are you interpreting?',
      'Is there another explanation for their behavior?',
      'What would you need to see to change your mind about what they think?',
    ],
    reframes: [
      "People's reactions are often about their own stuff, not about you.",
      "We're usually much harder on ourselves than others are.",
      'Most people are too focused on their own worries to judge us as harshly as we fear.',
    ],
    validations: [
      "It's natural to wonder what people think.",
      'Social anxiety can make us hyper-attuned to perceived judgment.',
      'I understand wanting to know where you stand with people.',
    ],
  },

  all_or_nothing: {
    gentleChallenges: [
      'Is there a middle ground between perfect and failure?',
      "What would 'good enough' look like here?",
      'If a friend did this, would you call it a total failure?',
      'On a scale of 1-10, where does this actually fall?',
    ],
    reframes: [
      'Most of life happens in the gray area between perfect and terrible.',
      "Progress isn't linear—small steps still count.",
      "Being human means being imperfect. That's not failure, that's normal.",
    ],
    validations: [
      "I hear how frustrating it is when things aren't how you wanted.",
      'High standards can be a gift, but they can also be heavy.',
      "It's hard when reality doesn't match the vision.",
    ],
  },

  fortune_telling: {
    gentleChallenges: [
      'What makes you certain it will go that way?',
      'Have you been wrong about predictions like this before?',
      "What if it doesn't go the way you're predicting?",
      'What evidence would change your prediction?',
    ],
    reframes: [
      "The future isn't written yet—uncertainty goes both ways.",
      'Our brains are better at generating worry than at predicting outcomes.',
      'Not knowing is uncomfortable, but it also means good outcomes are possible.',
    ],
    validations: [
      'Uncertainty is genuinely uncomfortable.',
      "It's natural to try to prepare for what might come.",
      "I understand wanting to know what's ahead.",
    ],
  },

  personalization: {
    gentleChallenges: [
      'What other factors contributed to this outcome?',
      'How much control did you actually have?',
      'If a friend was in this situation, would you blame them entirely?',
      'What part of this was actually in your power?',
    ],
    reframes: [
      "Other people's choices are their responsibility, not yours.",
      'You can only control your own actions, not outcomes.',
      "Taking responsibility is healthy; taking all the blame usually isn't accurate.",
    ],
    validations: [
      'Caring about others can make us feel responsible for their feelings.',
      "It shows you care that you're thinking about your impact.",
      "It's hard when we wish we could have changed something.",
    ],
  },

  overgeneralization: {
    gentleChallenges: [
      "Is 'always' or 'never' literally true, or does it feel that way?",
      'Can you think of any exceptions?',
      "What's different about this time versus other times?",
      'If you looked at the data, what would the pattern actually show?',
    ],
    reframes: [
      "One experience—even a few—doesn't define a pattern forever.",
      "The past can inform, but it doesn't have to dictate.",
      'Each situation is at least a little different.',
    ],
    validations: [
      "When something keeps happening, it's natural to see a pattern.",
      'Repeated disappointments are genuinely hard.',
      'I understand why it feels like this always happens.',
    ],
  },

  mental_filtering: {
    gentleChallenges: [
      'What were the positive parts that your mind is skipping over?',
      'If you had to name three things that went well, what would they be?',
      'What would someone who loves you notice about this situation?',
      'Is the negative part getting more attention than it deserves?',
    ],
    reframes: [
      'The negative parts are real, but so are the positive ones.',
      'Our brains are wired to focus on threats—sometimes we have to consciously notice the good.',
      'A balanced view includes both what went wrong and what went right.',
    ],
    validations: [
      "It's natural to focus on what needs fixing.",
      "The negative part clearly affected you, and that's valid.",
      'I hear that this one thing is weighing on you.',
    ],
  },

  disqualifying_positive: {
    gentleChallenges: [
      'What if the compliment/success was actually true?',
      "Why doesn't this count, but negative things do?",
      'What would it mean if you let this positive thing count?',
      'Would you dismiss this if it happened to someone you respect?',
    ],
    reframes: [
      'You deserve to take in the good things, not just the hard ones.',
      "Accepting a compliment isn't arrogant - it's accurate.",
      'Success is still success, even if it felt easier than expected.',
    ],
    validations: [
      'It can be uncomfortable to accept praise.',
      'I hear that this feels different to you than it looks from outside.',
      'Imposter feelings are really common, especially for capable people.',
    ],
  },

  should_statements: {
    gentleChallenges: [
      "Where does this 'should' come from?",
      "Is this standard one you'd hold a friend to?",
      "What would happen if you replaced 'should' with 'could' or 'would like to'?",
      'Who decided this was the rule?',
    ],
    reframes: [
      "'Should' often comes from old rules that may not fit anymore.",
      "There's a difference between preferences and requirements.",
      'You can have high standards without making them demands.',
    ],
    validations: [
      'High expectations of yourself show you care about doing well.',
      "It's hard when you're not meeting your own standards.",
      "I hear the self-criticism in that 'should.'",
    ],
  },

  emotional_reasoning: {
    gentleChallenges: [
      'Is feeling something the same as it being true?',
      "What's the evidence outside of how you feel?",
      'Have you felt this way before when it turned out not to be true?',
      'If you felt differently tomorrow, would the facts change?',
    ],
    reframes: [
      "Feelings are real and valid, but they're not always accurate reporters of reality.",
      'You can feel like a failure and still have succeeded.',
      'Emotions are weather - they pass, even when they feel permanent.',
    ],
    validations: [
      'That feeling sounds really strong right now.',
      "It makes sense you'd feel that way given what happened.",
      'I hear how painful this feels.',
    ],
  },

  labeling: {
    gentleChallenges: [
      'Is one event enough to define who you are?',
      'What would you call a friend who did the same thing?',
      'Does this label capture all of who you are?',
      'Would the people who know you best agree with that label?',
    ],
    reframes: [
      'You are more than any single moment or mistake.',
      'Behavior is something you do, not something you are.',
      'Labels are shortcuts that miss the complexity of who you actually are.',
    ],
    validations: [
      "I hear how hard you're being on yourself.",
      "It sounds like you're really disappointed in yourself right now.",
      'Self-criticism this strong usually comes from caring a lot.',
    ],
  },

  magnification: {
    gentleChallenges: [
      'How big will this feel in a week? A month? A year?',
      "Is this the worst thing that's ever happened, or does it feel that way?",
      'What would someone less invested say about the size of this?',
      'On a scale of life problems, where does this actually rank?',
    ],
    reframes: [
      'This is hard, but it may not be as big as it feels right now.',
      'Strong emotions can make things seem larger than they are.',
      "Just because something feels huge doesn't mean it is.",
    ],
    validations: [
      'It clearly feels really big to you right now.',
      'In the moment, this is weighing heavily.',
      'I hear how overwhelming this feels.',
    ],
  },

  minimization: {
    gentleChallenges: [
      'If your best friend did this, would you minimize it?',
      'What does it say about you that you achieved this?',
      'Why are you more comfortable dismissing this than accepting it?',
      'What would change if you let yourself feel good about this?',
    ],
    reframes: [
      'Your achievements count, even if they felt easy.',
      "Dismissing your wins doesn't make you humble—it makes you inaccurate.",
      "You're allowed to feel good about things you've done.",
    ],
    validations: [
      'I hear you not wanting to make a big deal of it.',
      'It can feel uncomfortable to acknowledge success.',
      'Modesty is one thing, but you did do this.',
    ],
  },

  jumping_to_conclusions: {
    gentleChallenges: [
      "What's the actual evidence for that conclusion?",
      'Is there another way to interpret this?',
      'What would you need to know to be sure?',
      'Have you jumped to conclusions before that turned out wrong?',
    ],
    reframes: [
      "There might be information you don't have yet.",
      'Uncertainty is uncomfortable, but filling gaps with assumptions can mislead.',
      "Your first interpretation isn't always the right one.",
    ],
    validations: [
      "It's natural to try to make sense of things.",
      'Ambiguity is genuinely uncomfortable.',
      "I understand wanting to know what's going on.",
    ],
  },

  blame: {
    gentleChallenges: [
      'What part of this, if any, was in your control?',
      'Is it possible both people contributed something?',
      "Even if they're partly responsible, what can you do from here?",
      'Does blaming change anything about the situation?',
    ],
    reframes: [
      'Understanding what others did wrong is different from being stuck there.',
      'You can acknowledge their role while still focusing on what you can control.',
      "Blame explains the past but doesn't fix the future.",
    ],
    validations: [
      'It sounds like you feel really wronged.',
      'Being hurt by others is genuinely painful.',
      'I hear how frustrated you are with them.',
    ],
  },
};

// ============================================================================
// CORE DETECTION FUNCTIONS
// ============================================================================

/**
 * Get or create an ANT profile for a user.
 */
function getOrCreateProfile(userId: string): ANTProfile {
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      totalDetected: 0,
      byDistortion: new Map(),
      topDistortions: [],
      byTimeOfDay: new Map(),
      byDayOfWeek: new Map(),
      topicTriggers: new Map(),
      emotionCorrelations: new Map(),
      trend: 'stable',
      reframeSuccessRate: 0,
      lastUpdated: new Date(),
    };
    userProfiles.set(userId, profile);
  }
  return profile;
}

/**
 * Check if we've recently detected the same distortion to avoid repetition.
 */
function isDuplicateDetection(
  userId: string,
  type: CognitiveDistortion,
  windowMs: number = 5 * 60 * 1000 // 5 minutes
): boolean {
  const recent = recentDetections.get(userId) || [];
  const now = new Date();

  // Clean old entries
  const filtered = recent.filter((d) => now.getTime() - d.timestamp.getTime() < windowMs);
  recentDetections.set(userId, filtered);

  // Check for duplicate
  return filtered.some((d) => d.type === type);
}

/**
 * Record a detection to prevent duplicate alerts.
 */
function recordDetection(userId: string, type: CognitiveDistortion): void {
  const recent = recentDetections.get(userId) || [];
  recent.push({ type, timestamp: new Date() });
  recentDetections.set(userId, recent);
}

/**
 * Detect cognitive distortions in a user message.
 *
 * @param userId - User identifier
 * @param message - The user's message to analyze
 * @param context - Additional context about the conversation
 * @returns Array of detected distortions with confidence scores
 */
export function detectDistortions(
  userId: string,
  message: string,
  context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    recentTopics?: string[];
  }
): DistortionDetection[] {
  const detections: DistortionDetection[] = [];
  const lowerMessage = message.toLowerCase();
  const profile = getOrCreateProfile(userId);

  // Check each distortion pattern
  for (const [type, metadata] of Object.entries(DISTORTION_PATTERNS)) {
    const distortionType = type as CognitiveDistortion;

    // Skip if we just detected this one
    if (isDuplicateDetection(userId, distortionType)) {
      continue;
    }

    let confidence = 0;
    let triggerPhrase = '';

    // Check indicator phrases
    for (const phrase of metadata.indicatorPhrases) {
      if (lowerMessage.includes(phrase.toLowerCase())) {
        confidence = Math.max(confidence, 0.7);
        triggerPhrase = phrase;
      }
    }

    // Check regex patterns
    for (const pattern of metadata.patterns) {
      const match = message.match(pattern);
      if (match) {
        confidence = Math.max(confidence, 0.8);
        triggerPhrase = match[0];
      }
    }

    // Boost confidence if context matches
    if (context?.topic && metadata.contextTriggers.includes(context.topic.toLowerCase())) {
      confidence += 0.1;
    }
    if (context?.emotion && metadata.associatedEmotions.includes(context.emotion.toLowerCase())) {
      confidence += 0.1;
    }

    // If confident enough, create detection
    if (confidence >= 0.6) {
      const templates = RESPONSE_TEMPLATES[distortionType];
      const patternCount = (profile.byDistortion.get(distortionType) || 0) + 1;

      const detection: DistortionDetection = {
        type: distortionType,
        confidence: Math.min(confidence, 1.0),
        triggerPhrase,
        userMessage: message,
        detectedAt: new Date(),

        // Therapeutic response
        gentleChallenge:
          templates.gentleChallenges[Math.floor(Math.random() * templates.gentleChallenges.length)],
        reframe: templates.reframes[Math.floor(Math.random() * templates.reframes.length)],
        validation: templates.validations[Math.floor(Math.random() * templates.validations.length)],

        // Context
        topic: context?.topic,
        emotion: context?.emotion,
        emotionIntensity: context?.emotionIntensity,

        // Learning
        patternCount,
        relatedDistortions: findRelatedDistortions(distortionType),
        isRecurring: patternCount >= 3,
      };

      detections.push(detection);

      // Update profile
      profile.byDistortion.set(distortionType, patternCount);
      profile.totalDetected++;
      profile.lastUpdated = new Date();

      // Record to prevent duplicates
      recordDetection(userId, distortionType);

      log.debug(
        {
          userId,
          type: distortionType,
          confidence: detection.confidence,
          triggerPhrase,
          patternCount,
        },
        '🧠 Cognitive distortion detected'
      );
    }
  }

  // Sort by confidence (highest first)
  detections.sort((a, b) => b.confidence - a.confidence);

  return detections;
}

/**
 * Find distortions that commonly occur together.
 */
function findRelatedDistortions(type: CognitiveDistortion): CognitiveDistortion[] {
  const relationships: Record<CognitiveDistortion, CognitiveDistortion[]> = {
    catastrophizing: ['fortune_telling', 'magnification', 'all_or_nothing'],
    mind_reading: ['jumping_to_conclusions', 'personalization', 'emotional_reasoning'],
    all_or_nothing: ['labeling', 'should_statements', 'overgeneralization'],
    fortune_telling: ['catastrophizing', 'mind_reading', 'jumping_to_conclusions'],
    personalization: ['blame', 'should_statements', 'emotional_reasoning'],
    overgeneralization: ['all_or_nothing', 'labeling', 'mental_filtering'],
    mental_filtering: ['disqualifying_positive', 'magnification', 'overgeneralization'],
    disqualifying_positive: ['mental_filtering', 'minimization', 'emotional_reasoning'],
    should_statements: ['all_or_nothing', 'personalization', 'labeling'],
    emotional_reasoning: ['mind_reading', 'labeling', 'fortune_telling'],
    labeling: ['all_or_nothing', 'overgeneralization', 'should_statements'],
    magnification: ['catastrophizing', 'mental_filtering', 'emotional_reasoning'],
    minimization: ['disqualifying_positive', 'should_statements', 'emotional_reasoning'],
    jumping_to_conclusions: ['mind_reading', 'fortune_telling', 'blame'],
    blame: ['personalization', 'jumping_to_conclusions', 'all_or_nothing'],
  };

  return relationships[type] || [];
}

// ============================================================================
// RESPONSE RECOMMENDATION
// ============================================================================

/**
 * Determine how to respond to a detected distortion.
 */
export function getDistortionResponse(
  detection: DistortionDetection,
  context: {
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    emotionalIntensity?: number;
    recentReframes?: number;
    userReceptivity?: 'high' | 'medium' | 'low' | 'unknown';
  }
): DistortionResponse {
  const {
    relationshipStage = 'new',
    emotionalIntensity = 0.5,
    recentReframes = 0,
    userReceptivity = 'unknown',
  } = context;

  // If emotional intensity is very high, just validate
  if (emotionalIntensity > 0.8) {
    return {
      approach: 'validate',
      reason: 'User is in high emotional distress—validate first',
      suggestion: detection.validation,
      injectIntoContext: true,
      priority: 90,
    };
  }

  // If we've done many reframes recently, wait
  if (recentReframes >= 2) {
    return {
      approach: 'wait',
      reason: "We've challenged several thoughts recently—give them space",
      injectIntoContext: false,
      priority: 0,
    };
  }

  // If low receptivity, be gentler
  if (userReceptivity === 'low') {
    return {
      approach: 'validate',
      reason: 'User seems less receptive—lead with validation',
      suggestion: detection.validation,
      injectIntoContext: true,
      priority: 70,
    };
  }

  // For established relationships, can be more direct
  if (relationshipStage === 'established' || relationshipStage === 'deep') {
    return {
      approach: 'gentle_name',
      reason: 'Strong relationship allows gentle naming of pattern',
      suggestion: `${detection.validation} Can I gently push back on something? ${detection.gentleChallenge}`,
      injectIntoContext: true,
      priority: 80,
    };
  }

  // Default: Socratic questioning
  return {
    approach: 'socratic',
    reason: 'Guide them to discover the pattern themselves',
    suggestion: `${detection.validation} ${detection.gentleChallenge}`,
    injectIntoContext: true,
    priority: 75,
  };
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get the ANT profile for a user.
 */
export function getANTProfile(userId: string): ANTProfile | null {
  return userProfiles.get(userId) || null;
}

/**
 * Get the top distortions for a user.
 */
export function getTopDistortions(userId: string, limit = 3): CognitiveDistortion[] {
  const profile = userProfiles.get(userId);
  if (!profile) return [];

  const sorted = [...profile.byDistortion.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type]) => type);

  return sorted;
}

/**
 * Record whether a reframe attempt was successful.
 */
export function recordReframeOutcome(
  userId: string,
  distortionType: CognitiveDistortion,
  outcome: 'receptive' | 'resistant' | 'neutral' | 'breakthrough'
): void {
  const profile = getOrCreateProfile(userId);

  // Update reframe success rate
  const isSuccess = outcome === 'receptive' || outcome === 'breakthrough';
  const currentRate = profile.reframeSuccessRate;
  const totalAttempts = profile.totalDetected;

  // Exponential moving average
  profile.reframeSuccessRate = currentRate * 0.9 + (isSuccess ? 0.1 : 0);
  profile.lastUpdated = new Date();

  log.debug(
    {
      userId,
      distortionType,
      outcome,
      newSuccessRate: profile.reframeSuccessRate,
    },
    '📊 Reframe outcome recorded'
  );
}

/**
 * Get distortion metadata for display/explanation.
 */
export function getDistortionMetadata(type: CognitiveDistortion): DistortionMetadata {
  return DISTORTION_PATTERNS[type];
}

/**
 * Get all distortion types.
 */
export function getAllDistortionTypes(): CognitiveDistortion[] {
  return Object.keys(DISTORTION_PATTERNS) as CognitiveDistortion[];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { RESPONSE_TEMPLATES };
