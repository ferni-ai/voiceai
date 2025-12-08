/**
 * Socratic Questioning Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Guides users to discover insights through questions rather than lectures.
 * Based on the Socratic Method used in CBT (Cognitive Behavioral Therapy).
 *
 * PHILOSOPHY:
 * The best insights come from within. Our job isn't to tell people
 * what to think—it's to ask questions that help them examine their
 * thinking for themselves. A good question is worth a thousand lectures.
 *
 * This engine provides:
 * - Distortion-specific question sequences
 * - Persona-adapted delivery styles
 * - Progressive questioning (not all at once)
 * - Context-aware question selection
 *
 * @module CognitiveIntelligence/SocraticEngine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CognitiveDistortion, SocraticSequence, SocraticContext } from './types.js';

const log = createLogger({ module: 'SocraticEngine' });

// ============================================================================
// SOCRATIC SEQUENCES
// ============================================================================

/**
 * Complete Socratic questioning sequences for each cognitive distortion.
 * Questions are designed to guide discovery, not lecture.
 */
export const SOCRATIC_SEQUENCES: Record<CognitiveDistortion, SocraticSequence> = {
  // -------------------------------------------------------------------------
  // CATASTROPHIZING
  // -------------------------------------------------------------------------
  catastrophizing: {
    distortion: 'catastrophizing',

    evidenceFor: [
      'What makes you certain it will go that badly?',
      "What's happened before that makes you expect the worst?",
      'Is there evidence that this outcome is likely?',
    ],

    evidenceAgainst: [
      "What's the most likely outcome, if you had to bet on it?",
      "When you've worried like this before, how often did the worst actually happen?",
      'What evidence suggests it might not be as bad as you fear?',
    ],

    alternativeViews: [
      'What would someone less worried than you say about this?',
      'If a friend was in this exact situation, what would you tell them?',
      "What's another way to look at this situation?",
    ],

    realityTest: [
      'On a scale of 1-10, how likely is the worst case? What would move it down by 1?',
      'What would you need to see to feel less certain about the worst case?',
      'Has anything like this worked out okay before?',
    ],

    decatastrophize: [
      "Okay, let's say the worst happens. Then what? What would you actually do?",
      'If the worst happened, would you eventually be able to handle it?',
      'What resources would you have to cope if the worst case came true?',
    ],

    ferniIntro: 'I hear the worry. Let me ask you something that might help...',
    peterApproach: "Let's look at the actual probability here...",
    mayaApproach: 'When this feeling comes up, what does it do to your body?',
  },

  // -------------------------------------------------------------------------
  // MIND READING
  // -------------------------------------------------------------------------
  mind_reading: {
    distortion: 'mind_reading',

    evidenceFor: [
      'What specifically makes you think they feel that way?',
      'Have they said something that gave you that impression?',
      'What behaviors are you interpreting?',
    ],

    evidenceAgainst: [
      'Is there another way to interpret their behavior?',
      "Have you ever misread someone's thoughts or intentions before?",
      'What if their reaction has nothing to do with you at all?',
    ],

    alternativeViews: [
      'If you asked them directly, what might they say?',
      'What would someone else make of that same behavior?',
      "Is it possible they're just having their own day?",
    ],

    realityTest: [
      "How sure are you—like percentage-wise—that's what they're thinking?",
      "What would change your mind about what they're thinking?",
      'Have they ever surprised you by thinking differently than you assumed?',
    ],

    decatastrophize: [
      'Even if they did think that, what would it actually mean for you?',
      "Would one person's opinion define who you are?",
      'If they did judge you, would you survive that?',
    ],

    ferniIntro: "It sounds like you're trying to read their mind. Can I explore that with you?",
    peterApproach: "What's the data here versus the interpretation?",
    mayaApproach: 'Where in your body do you feel that worry about what they think?',
  },

  // -------------------------------------------------------------------------
  // ALL-OR-NOTHING THINKING
  // -------------------------------------------------------------------------
  all_or_nothing: {
    distortion: 'all_or_nothing',

    evidenceFor: [
      'What makes this feel like a total failure versus a partial setback?',
      "Where does the 'all or nothing' rule come from?",
      'What standard are you measuring this against?',
    ],

    evidenceAgainst: [
      'Is there any middle ground between complete success and total failure?',
      'What parts of this actually went okay?',
      'On a scale of 1-10, where would this really land?',
    ],

    alternativeViews: [
      "What would 'good enough' look like here?",
      'If a friend did this, would you call it a complete failure?',
      'What would a neutral observer say about this?',
    ],

    realityTest: [
      'Is anything really ALL one thing or another?',
      "What's the gray area that you might be missing?",
      'What would partial success look like?',
    ],

    decatastrophize: [
      "If this isn't perfect, does it have to be worthless?",
      "What can you learn from the parts that didn't go well?",
      'Does imperfect mean bad, or just human?',
    ],

    ferniIntro: "I'm noticing some all-or-nothing thinking there. Can we look at the gray area?",
    peterApproach: 'If we measured this objectively, what would the data show?',
    mayaApproach: 'Perfectionism can be heavy. How does this standard feel in your body?',
  },

  // -------------------------------------------------------------------------
  // FORTUNE TELLING
  // -------------------------------------------------------------------------
  fortune_telling: {
    distortion: 'fortune_telling',

    evidenceFor: [
      'What makes you so certain about how this will go?',
      'What past experience makes you expect this outcome?',
      'How do you know it will definitely happen that way?',
    ],

    evidenceAgainst: [
      'Have you been wrong about predictions like this before?',
      'What could happen that would surprise you?',
      'Is the future really that predictable?',
    ],

    alternativeViews: [
      "What if it doesn't go the way you're predicting?",
      "What's an equally possible alternative outcome?",
      'What would someone optimistic predict here?',
    ],

    realityTest: [
      'How accurate have your negative predictions been historically?',
      'What evidence would you need to change your prediction?',
      'Is this a prediction or a fear?',
    ],

    decatastrophize: [
      'If it does go badly, what would you do then?',
      'Are you trying to prepare or trying to protect yourself from hoping?',
      'What if you allowed for the possibility of a good outcome?',
    ],

    ferniIntro: 'You sound pretty certain about how this will go. What if we examined that?',
    peterApproach: "What's our track record on predictions like these?",
    mayaApproach: 'Trying to control the future is exhausting. What would letting go feel like?',
  },

  // -------------------------------------------------------------------------
  // PERSONALIZATION
  // -------------------------------------------------------------------------
  personalization: {
    distortion: 'personalization',

    evidenceFor: [
      'What makes you think this is all because of you?',
      'What control did you actually have over this outcome?',
      'How much of this was really in your power?',
    ],

    evidenceAgainst: [
      'What other factors contributed to this outcome?',
      'Who else was involved and what choices did they make?',
      'What was outside your control entirely?',
    ],

    alternativeViews: [
      'If a friend was in your shoes, would you blame them entirely?',
      'What role did circumstances play?',
      "What's a more balanced view of responsibility?",
    ],

    realityTest: [
      'If you had to assign percentages, how much was actually you?',
      "Are you taking responsibility for things you couldn't have changed?",
      'Is there a difference between influence and control?',
    ],

    decatastrophize: [
      'Even if you did contribute, does that make you a bad person?',
      'What would self-compassion look like here?',
      'Can you be imperfect and still be okay?',
    ],

    ferniIntro:
      "You're taking a lot of responsibility there. Let's look at what was actually in your control...",
    peterApproach: "Let's map out all the factors that contributed to this outcome...",
    mayaApproach: "That's a heavy load you're carrying. Where do you feel it?",
  },

  // -------------------------------------------------------------------------
  // OVERGENERALIZATION
  // -------------------------------------------------------------------------
  overgeneralization: {
    distortion: 'overgeneralization',

    evidenceFor: [
      "What experiences make you feel like this 'always' happens?",
      'What pattern are you noticing?',
      'How many times has this actually happened?',
    ],

    evidenceAgainst: [
      'Can you think of any exceptions to this pattern?',
      'When has it gone differently?',
      "Is 'always' or 'never' literally true, or does it feel that way?",
    ],

    alternativeViews: [
      "What's different about this time compared to other times?",
      'Are there circumstances that might change the outcome?',
      'What would make this time different?',
    ],

    realityTest: [
      'If you looked at the actual data, what would the pattern show?',
      'What percentage of the time does this really happen?',
      'Is one experience enough to predict all future experiences?',
    ],

    decatastrophize: [
      "Even if there's a pattern, does that mean it can never change?",
      'What would it take to create a different outcome?',
      'Does the past have to equal the future?',
    ],

    ferniIntro: "I'm hearing 'always' or 'never' there. Let's check if that's literally true...",
    peterApproach: "Let's look at the actual frequency data...",
    mayaApproach: 'Feeling stuck in a pattern is exhausting. How does that hopelessness feel?',
  },

  // -------------------------------------------------------------------------
  // MENTAL FILTERING
  // -------------------------------------------------------------------------
  mental_filtering: {
    distortion: 'mental_filtering',

    evidenceFor: [
      "What specifically is the negative part you're focusing on?",
      'Why does that part feel most important?',
      'What draws your attention to that piece?',
    ],

    evidenceAgainst: [
      'What were the positive parts your mind is skipping over?',
      'If you had to name three things that went well, what would they be?',
      'What would someone who loves you notice about this situation?',
    ],

    alternativeViews: [
      'Is the negative part getting more attention than it deserves?',
      'What would a balanced view include?',
      "If you took a step back, what's the whole picture?",
    ],

    realityTest: [
      'Is this one negative as big as your focus on it suggests?',
      'What percentage of the whole experience was actually negative?',
      'Are you filtering out the good?',
    ],

    decatastrophize: [
      'If you allowed the positive parts in, what would change?',
      'Why is it harder to hold onto the good parts?',
      'What would you miss if you only saw the negative?',
    ],

    ferniIntro: "I notice you're focused on one part. What about the rest of the picture?",
    peterApproach: "Let's inventory everything that happened, not just the low point...",
    mayaApproach: 'Our brains are wired to spot threats. What if you actively looked for good?',
  },

  // -------------------------------------------------------------------------
  // DISQUALIFYING THE POSITIVE
  // -------------------------------------------------------------------------
  disqualifying_positive: {
    distortion: 'disqualifying_positive',

    evidenceFor: [
      "What makes this positive thing 'not count'?",
      'Where does that rule come from?',
      'Why is the bar so high for something to matter?',
    ],

    evidenceAgainst: [
      'What if the compliment/success was actually true?',
      "Why does negative feedback count but positive doesn't?",
      'Would you dismiss this if it happened to someone you respect?',
    ],

    alternativeViews: [
      'What would it mean if you let this positive thing count?',
      'How would you feel if you accepted this as real?',
      'What are you protecting yourself from by dismissing it?',
    ],

    realityTest: [
      'If someone you trusted said the same thing, would you believe them?',
      "Is 'just being nice' really the only explanation?",
      'What evidence would you need to accept something positive?',
    ],

    decatastrophize: [
      "What's the risk of accepting that something good is true about you?",
      'If you let this in, what would change?',
      'What are you afraid of if you accept the compliment?',
    ],

    ferniIntro: 'You just dismissed something positive. What made you do that?',
    peterApproach: "Let's examine why positive data gets filtered out...",
    mayaApproach: 'Receiving good things can be uncomfortable. What comes up for you?',
  },

  // -------------------------------------------------------------------------
  // SHOULD STATEMENTS
  // -------------------------------------------------------------------------
  should_statements: {
    distortion: 'should_statements',

    evidenceFor: [
      "Where does this 'should' come from?",
      'Who decided this was the rule?',
      "What happens if you don't meet this should?",
    ],

    evidenceAgainst: [
      "Is this standard one you'd hold a friend to?",
      "Is this 'should' helping you or hurting you?",
      "What would happen if you changed 'should' to 'would like to'?",
    ],

    alternativeViews: [
      "What if 'should' became 'could' or 'might'?",
      'What would a compassionate version of this expectation look like?',
      'Who says it has to be this way?',
    ],

    realityTest: [
      'Is this should realistic given your circumstances?',
      'Are you shoulding on yourself or on reality?',
      "What if there's no 'should' at all, just preferences?",
    ],

    decatastrophize: [
      "What's the worst that happens if you don't meet this should?",
      'Can you be okay even if you fall short of this standard?',
      'What would self-compassion say about this should?',
    ],

    ferniIntro: "I hear a 'should' in there. Let's examine where it comes from...",
    peterApproach: 'Is this a fact-based rule or an arbitrary one?',
    mayaApproach: 'Shoulds can feel like a cage. What would freedom from this one feel like?',
  },

  // -------------------------------------------------------------------------
  // EMOTIONAL REASONING
  // -------------------------------------------------------------------------
  emotional_reasoning: {
    distortion: 'emotional_reasoning',

    evidenceFor: [
      "What's making you feel this way?",
      'What triggered this feeling?',
      'What situation led to feeling like this?',
    ],

    evidenceAgainst: [
      'Is feeling something the same as it being true?',
      "What's the evidence outside of how you feel?",
      'Have you felt this way before when it turned out not to be true?',
    ],

    alternativeViews: [
      'If you felt differently tomorrow, would the facts change?',
      'What would you say if a friend felt this way about themselves?',
      'Is it possible to feel one thing and the truth be another?',
    ],

    realityTest: [
      'What would an outside observer say about this situation?',
      'If we looked at just the facts, without feelings, what would we see?',
      'What evidence would change how you feel?',
    ],

    decatastrophize: [
      "What if the feeling passes but you've acted on it?",
      'Can you feel like a failure and still have succeeded?',
      'What would it mean to feel this way AND know it might not be accurate?',
    ],

    ferniIntro: "I hear you feeling something strongly. Let's look at the facts underneath...",
    peterApproach: 'Feelings are data, but not the only data. What else is there?',
    mayaApproach: "That feeling is real. And feelings and facts aren't always the same thing.",
  },

  // -------------------------------------------------------------------------
  // LABELING
  // -------------------------------------------------------------------------
  labeling: {
    distortion: 'labeling',

    evidenceFor: [
      'What happened that made you put this label on yourself?',
      'Where did this label come from originally?',
      'How long have you been calling yourself this?',
    ],

    evidenceAgainst: [
      'Is one event enough to define who you are?',
      'What evidence contradicts this label?',
      'Would the people who know you best agree with this label?',
    ],

    alternativeViews: [
      'What would you call a friend who did the same thing?',
      'Is there a difference between doing something and being something?',
      'What label would be more accurate and complete?',
    ],

    realityTest: [
      'Does this label capture all of who you are?',
      'Is anyone really just ONE thing?',
      'What parts of you does this label miss?',
    ],

    decatastrophize: [
      'Even if this label was true, could you still be okay?',
      'What if labels are just shortcuts that miss nuance?',
      'Can you have done something wrong without being a bad person?',
    ],

    ferniIntro: "That's a harsh label. Let's see if it's really accurate...",
    peterApproach: "A single data point doesn't define a pattern. What's the full picture?",
    mayaApproach: 'The names we call ourselves matter. Is this one serving you?',
  },

  // -------------------------------------------------------------------------
  // MAGNIFICATION
  // -------------------------------------------------------------------------
  magnification: {
    distortion: 'magnification',

    evidenceFor: [
      'What specifically makes this feel so big?',
      'Why does this feel more important than other things?',
      "What's at stake here that makes it feel huge?",
    ],

    evidenceAgainst: [
      'How big will this feel in a week? A month? A year?',
      'Is this truly the worst, or does it feel that way right now?',
      'What would someone less invested say about the size of this?',
    ],

    alternativeViews: [
      'On a scale of life problems, where does this actually rank?',
      'What perspective might you have on this later?',
      'How would future you look back at this moment?',
    ],

    realityTest: [
      'Is the size of your reaction matching the size of the problem?',
      "What's your emotion adding to your assessment?",
      'If you were calmer, how big would this be?',
    ],

    decatastrophize: [
      'Even if this is big, can you handle it?',
      'What resources do you have to deal with this?',
      'What have you gotten through that was actually worse?',
    ],

    ferniIntro: "This sounds really big to you. Let's see how big it actually is...",
    peterApproach: "Let's calibrate: how does this compare to other challenges you've faced?",
    mayaApproach:
      'Strong feelings can magnify things. What would this look like in a calmer moment?',
  },

  // -------------------------------------------------------------------------
  // MINIMIZATION
  // -------------------------------------------------------------------------
  minimization: {
    distortion: 'minimization',

    evidenceFor: [
      'What makes you want to downplay this?',
      'Why is it uncomfortable to accept this as significant?',
      'What happens when you let things feel important?',
    ],

    evidenceAgainst: [
      'If your best friend did this, would you minimize it?',
      'What does this achievement actually say about you?',
      "What effort did this take that you're not acknowledging?",
    ],

    alternativeViews: [
      'What would change if you let yourself feel good about this?',
      'Why are you more comfortable dismissing this than accepting it?',
      'What would someone who loves you say about this?',
    ],

    realityTest: [
      "Is this really 'nothing,' or is that a protective move?",
      'What would it mean to let this count?',
      'Are you being accurate or just modest?',
    ],

    decatastrophize: [
      "What's the risk of accepting that you did something good?",
      'What are you protecting yourself from by minimizing?',
      'Is humility serving you here, or holding you back?',
    ],

    ferniIntro: 'Hold on—you just did something and immediately dismissed it. Why?',
    peterApproach: 'The data says you accomplished something. Why filter that out?',
    mayaApproach: 'Taking in good things can feel weird. What comes up when you try?',
  },

  // -------------------------------------------------------------------------
  // JUMPING TO CONCLUSIONS
  // -------------------------------------------------------------------------
  jumping_to_conclusions: {
    distortion: 'jumping_to_conclusions',

    evidenceFor: [
      'What led you to that conclusion?',
      'What information are you basing that on?',
      'How did you arrive at that interpretation?',
    ],

    evidenceAgainst: [
      "What's the actual evidence for that conclusion?",
      'Is there another way to interpret this?',
      'What would you need to know to be sure?',
    ],

    alternativeViews: [
      'What else could this mean?',
      "What's an alternative explanation?",
      'If you gave the benefit of the doubt, what would you think?',
    ],

    realityTest: [
      'How certain can you really be without more information?',
      'Have you jumped to conclusions before that turned out wrong?',
      "What's the difference between a conclusion and an assumption?",
    ],

    decatastrophize: [
      'Even if your conclusion is right, what then?',
      "What if you're wrong? How would things look different?",
      'Can you sit with not knowing for now?',
    ],

    ferniIntro: "That's a pretty quick conclusion. What if we slowed down and examined it?",
    peterApproach: "What's the evidence trail that led to this conclusion?",
    mayaApproach: "Uncertainty is uncomfortable. Is that what's driving the quick conclusion?",
  },

  // -------------------------------------------------------------------------
  // BLAME
  // -------------------------------------------------------------------------
  blame: {
    distortion: 'blame',

    evidenceFor: [
      'What specifically did they do that contributed to this?',
      'What role did they play in what happened?',
      "Why do you feel they're responsible?",
    ],

    evidenceAgainst: [
      'What part of this, if any, was in your control?',
      'Is it possible both people contributed something?',
      "What factors were outside anyone's control?",
    ],

    alternativeViews: [
      "Even if they're partly responsible, what can you do from here?",
      'Does blaming change anything about the situation?',
      'What would moving forward look like?',
    ],

    realityTest: [
      'Is anyone 100% responsible in any situation?',
      'What might their perspective be?',
      'If you had to assign percentages, how would it break down?',
    ],

    decatastrophize: [
      'Even if they did wrong you, what now?',
      'Does staying in blame help you or keep you stuck?',
      'What would letting go of this blame give you?',
    ],

    ferniIntro: 'I hear a lot of blame there. What can you control from here?',
    peterApproach: "Let's look at all the contributing factors objectively...",
    mayaApproach: 'Blame can feel satisfying but heavy. What does holding it cost you?',
  },
};

// ============================================================================
// QUESTION SELECTION
// ============================================================================

/**
 * Select the best Socratic question for the current context.
 */
export function selectSocraticQuestion(context: SocraticContext): SocraticQuestion {
  const sequence = SOCRATIC_SEQUENCES[context.distortion];

  // Determine which category of questions to draw from
  const category = selectQuestionCategory(context);

  // Get available questions from that category
  const availableQuestions = sequence[category as keyof SocraticSequence] as string[];

  // Filter out questions already asked
  const unaskedQuestions = availableQuestions.filter((q) => !context.questionsAsked.includes(q));

  // If all questions asked, allow repetition
  const pool = unaskedQuestions.length > 0 ? unaskedQuestions : availableQuestions;

  // Select a question
  const question = pool[Math.floor(Math.random() * pool.length)];

  // Get persona-appropriate intro
  const intro = sequence.ferniIntro; // Default to Ferni

  log.debug(
    {
      userId: context.userId,
      distortion: context.distortion,
      category,
      questionCount: context.questionsAsked.length,
    },
    '❓ Socratic question selected'
  );

  return {
    question,
    intro,
    category,
    followUp: selectFollowUp(category),
  };
}

/**
 * Determine which category of questions to use.
 */
function selectQuestionCategory(context: SocraticContext): QuestionCategory {
  const { questionsAsked, emotionalIntensity = 0.5, relationshipStage, receptivity } = context;

  // If high distress, start with validation-oriented questions
  if (emotionalIntensity > 0.7) {
    return 'evidenceAgainst'; // Gentler start
  }

  // If new relationship, be more exploratory
  if (relationshipStage === 'new') {
    return 'evidenceFor'; // Understand their perspective first
  }

  // If low receptivity, don't challenge too hard
  if (receptivity === 'low') {
    return 'alternativeViews'; // Softer exploration
  }

  // Progress through categories based on conversation depth
  const questionCount = questionsAsked.length;

  if (questionCount === 0) return 'evidenceFor';
  if (questionCount === 1) return 'evidenceAgainst';
  if (questionCount === 2) return 'alternativeViews';
  if (questionCount === 3) return 'realityTest';
  return 'decatastrophize';
}

/**
 * Select a follow-up prompt based on question category.
 */
function selectFollowUp(category: QuestionCategory): string {
  const followUps: Record<QuestionCategory, string[]> = {
    evidenceFor: ['I hear you. And what else?', 'Say more about that.', 'What else comes up?'],
    evidenceAgainst: [
      'Interesting. What else might be true?',
      'And what else?',
      'Keep going with that thought.',
    ],
    alternativeViews: [
      "That's worth considering. What would that change?",
      'Hmm. How does that sit with you?',
      'What comes up when you think about that?',
    ],
    realityTest: [
      'What do you notice when you think about it that way?',
      'Does that change anything?',
      'How does that land?',
    ],
    decatastrophize: [
      "So what does that mean for how you're feeling now?",
      'Does that shift anything?',
      'What do you want to do with that?',
    ],
  };

  const options = followUps[category];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate a complete Socratic dialogue suggestion.
 */
export function generateSocraticDialogue(
  context: SocraticContext,
  includeValidation = true
): SocraticDialogue {
  const sequence = SOCRATIC_SEQUENCES[context.distortion];
  const question = selectSocraticQuestion(context);

  // Build the suggested dialogue
  const parts: string[] = [];

  // Start with validation if appropriate
  if (includeValidation) {
    const validations = [
      'I hear you.',
      "That makes sense that you'd feel that way.",
      "I can understand why that's weighing on you.",
      "That's a real feeling.",
    ];
    parts.push(validations[Math.floor(Math.random() * validations.length)]);
  }

  // Add intro if it's the first question
  if (context.questionsAsked.length === 0) {
    parts.push(question.intro);
  }

  // Add the question
  parts.push(question.question);

  return {
    fullResponse: parts.join(' '),
    validation: includeValidation ? parts[0] : undefined,
    intro: context.questionsAsked.length === 0 ? question.intro : undefined,
    question: question.question,
    followUp: question.followUp,
    category: question.category,
    sequence,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type QuestionCategory =
  | 'evidenceFor'
  | 'evidenceAgainst'
  | 'alternativeViews'
  | 'realityTest'
  | 'decatastrophize';

export interface SocraticQuestion {
  question: string;
  intro: string;
  category: QuestionCategory;
  followUp: string;
}

export interface SocraticDialogue {
  fullResponse: string;
  validation?: string;
  intro?: string;
  question: string;
  followUp: string;
  category: QuestionCategory;
  sequence: SocraticSequence;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SOCRATIC_SEQUENCES as socraticSequences };
