/**
 * Coaching Questions - "Better Than Human" Question Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module generates questions that make users think "How did you know to ask that?"
 *
 * Key capabilities:
 * 1. MEMORY-GROUNDED - References things they've shared before
 * 2. PATTERN-SURFACING - Notices recurring themes they can't see
 * 3. THE MIRROR - Reflects their words back meaningfully
 * 4. ANTICIPATORY - Asks what they need before they know they need it
 *
 * A great coaching question should make them:
 * - PAUSE before answering
 * - THINK differently than they were
 * - Feel UNDERSTOOD, not interrogated
 * - WANT to answer (not have to)
 */

import { getLogger } from '../utils/safe-logger.js';
import { generateQuestion, type QuestionContext, type GeneratedQuestion } from './dynamic-questions.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryGroundedQuestion extends GeneratedQuestion {
  groundedIn?: {
    memory: string;
    daysAgo: number;
    connection: string;
    originalContext?: string;
  };
}

export interface PatternObservation {
  pattern: string;
  occurrences: number;
  contexts: string[];
  surfacingQuestion: string;
  intent: string;
}

export interface MirrorReflection {
  observed: string;
  reflection: string;
  question: string;
  gentleness: 'soft' | 'direct' | 'curious';
}

export interface AnticipatedNeed {
  signal: string;
  anticipated: string;
  checkQuestion: string;
  ifConfirmed: string;
  ifDenied: string;
}

// ============================================================================
// PATTERN TEMPLATES
// ============================================================================

/**
 * Patterns to watch for and questions to surface them
 */
const PATTERN_TEMPLATES: Array<{
  signal: string;
  detector: (context: QuestionContext) => boolean;
  questions: string[];
  intent: string;
}> = [
  {
    signal: 'deflects_with_humor',
    detector: (ctx) => ctx.recentTopics.some((t) => t.includes('joke') || t.includes('laugh')),
    questions: [
      "You laughed just now. What's actually under that?",
      'You made that into a joke. What would the serious version sound like?',
      "There's usually something real underneath the humor. What is it?",
    ],
    intent: 'Surface what they\'re protecting with humor',
  },
  {
    signal: 'uses_should_frequently',
    detector: (ctx) => ctx.recentTopics.some((t) => t.toLowerCase().includes('should')),
    questions: [
      "You've said 'should' a few times. Whose voice is that—yours or someone else's?",
      "What would happen if you didn't have to?",
      "If 'should' wasn't in your vocabulary, what would you say instead?",
    ],
    intent: 'Help them distinguish their voice from external expectations',
  },
  {
    signal: 'mentions_being_fine',
    detector: (ctx) => ctx.recentTopics.some((t) => t.toLowerCase().includes('fine') || t.toLowerCase().includes('okay')),
    questions: [
      "You said 'fine'. If that word wasn't available, what would you say?",
      "'Fine' is often a placeholder. What's the real word?",
      "When you say 'fine'—what are you not saying?",
    ],
    intent: 'Get past the social script to what\'s real',
  },
  {
    signal: 'energy_dropped',
    detector: (ctx) => ctx.emotionalState?.primary === 'subdued' || ctx.emotionalState?.primary === 'low',
    questions: [
      'Your energy shifted just now. Where did you go?',
      'Something changed. What came up for you?',
      'You got quieter. What is it?',
    ],
    intent: 'Acknowledge and explore the shift',
  },
  {
    signal: 'talking_about_others',
    detector: (ctx) => ctx.recentTopics.length > 2 && !ctx.recentTopics.some((t) => t.includes('I ') || t.includes('me')),
    questions: [
      "You've been talking about what others think. What do YOU think?",
      "We've talked a lot about them. What about you?",
      'If you took everyone else out of this story, what would you want?',
    ],
    intent: 'Redirect from external focus to internal truth',
  },
  {
    signal: 'recurring_topic',
    detector: (ctx) => {
      const topicCounts = new Map<string, number>();
      ctx.recentTopics.forEach((t) => topicCounts.set(t, (topicCounts.get(t) || 0) + 1));
      return Array.from(topicCounts.values()).some((count) => count >= 2);
    },
    questions: [
      'You keep coming back to this. What is it about that?',
      "This isn't the first time you've mentioned this. What's pulling you here?",
      'There might be a reason this keeps coming up. What do you think it is?',
    ],
    intent: 'Surface the recurring pattern they might not see',
  },
];

/**
 * Mirror templates - reflect their words back meaningfully
 */
const MIRROR_TEMPLATES: Array<{
  trigger: (transcript: string) => string | null;
  createMirror: (observed: string) => MirrorReflection;
}> = [
  {
    trigger: (t) => {
      const shouldMatch = t.match(/should\s+(\w+)/gi);
      return shouldMatch && shouldMatch.length >= 2 ? `"should" ${shouldMatch.length} times` : null;
    },
    createMirror: (observed) => ({
      observed,
      reflection: "'Should' often carries someone else's voice",
      question: "Whose expectations are you trying to meet?",
      gentleness: 'curious',
    }),
  },
  {
    trigger: (t) => {
      const butMatch = t.match(/but\s/gi);
      return butMatch && butMatch.length >= 2 ? `"but" to redirect ${butMatch.length} times` : null;
    },
    createMirror: (observed) => ({
      observed,
      reflection: "What comes before 'but' is often what you really mean",
      question: 'What if you stopped at the first part?',
      gentleness: 'soft',
    }),
  },
  {
    trigger: (t) => {
      const justMatch = t.match(/I just\s|just a\s|it's just/gi);
      return justMatch && justMatch.length >= 2 ? `minimized with "just" ${justMatch.length} times` : null;
    },
    createMirror: (observed) => ({
      observed,
      reflection: "'Just' makes things smaller than they are",
      question: "What if it wasn't 'just'? What if it was actually a big deal?",
      gentleness: 'direct',
    }),
  },
];

/**
 * Anticipatory needs - detect signals and check in proactively
 */
const ANTICIPATORY_TEMPLATES: AnticipatedNeed[] = [
  {
    signal: 'Long pause before speaking',
    anticipated: 'Something difficult to say',
    checkQuestion: "There's something you're weighing whether to say. Am I reading that right?",
    ifConfirmed: 'Create safety for them to share',
    ifDenied: 'Accept and move on without pressure',
  },
  {
    signal: 'Voice dropped or slowed',
    anticipated: 'Entering emotional territory',
    checkQuestion: 'You sound different than you did a minute ago. What shifted?',
    ifConfirmed: 'Slow down, hold space',
    ifDenied: 'Trust their read, stay present',
  },
  {
    signal: 'Short answers after longer ones',
    anticipated: 'Pulling back or tired',
    checkQuestion: "I notice you're being more brief. Should we pause here?",
    ifConfirmed: 'Offer to hold space or end',
    ifDenied: 'Check if something specific',
  },
  {
    signal: 'Changed subject quickly',
    anticipated: 'Topic was uncomfortable',
    checkQuestion: "We moved away from something. Should we go back to it, or leave it?",
    ifConfirmed: 'Gently return',
    ifDenied: 'Respect the boundary',
  },
  {
    signal: 'Mentioned someone repeatedly',
    anticipated: 'Unresolved feelings about that person',
    checkQuestion: "They keep coming up. What is it about them that's on your mind?",
    ifConfirmed: 'Explore the relationship',
    ifDenied: 'Note for future reference',
  },
];

// ============================================================================
// QUESTION GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate a memory-grounded question
 *
 * This references something they've shared before to show we remember
 * and care about their story.
 */
export async function generateMemoryGroundedQuestion(
  context: QuestionContext,
  memories: Array<{ topic: string; daysAgo: number; summary: string }>,
  options?: { llmCall?: (prompt: string) => Promise<string> }
): Promise<MemoryGroundedQuestion> {
  log.info(
    { personaId: context.personaId, memoryCount: memories.length },
    '🧠 COACHING: Generating memory-grounded question'
  );

  // Find a relevant memory to reference
  const relevantMemory = findRelevantMemory(context, memories);

  if (relevantMemory) {
    // Generate a question that bridges past and present
    const bridgeQuestions = [
      `Last time you mentioned ${relevantMemory.topic}. How's that going?`,
      `Remember when you talked about ${relevantMemory.topic}? I've been thinking about that.`,
      `You said something about ${relevantMemory.topic} ${relevantMemory.daysAgo} days ago. Any update?`,
      `I keep thinking about what you said about ${relevantMemory.topic}. Has anything changed?`,
      `You mentioned ${relevantMemory.topic} a while back. Is that still on your mind?`,
    ];

    const question = bridgeQuestions[Math.floor(Math.random() * bridgeQuestions.length)];

    const baseQuestion = await generateQuestion(context, 'relationship_building', options);

    return {
      ...baseQuestion,
      text: question,
      ssml: `<break time="400ms"/>${question}`,
      groundedIn: {
        memory: relevantMemory.summary,
        daysAgo: relevantMemory.daysAgo,
        connection: `Referencing past conversation about ${relevantMemory.topic}`,
        originalContext: relevantMemory.summary,
      },
      intent: {
        ...baseQuestion.intent,
        seekingToUnderstand: `Following up on ${relevantMemory.topic} from ${relevantMemory.daysAgo} days ago`,
        buildsOnContext: relevantMemory.summary,
      },
    };
  }

  // Fall back to regular question generation
  const baseQuestion = await generateQuestion(context, 'curious', options);
  return baseQuestion;
}

/**
 * Detect and surface patterns in their conversation
 */
export function detectPatterns(context: QuestionContext): PatternObservation[] {
  const patterns: PatternObservation[] = [];

  for (const template of PATTERN_TEMPLATES) {
    if (template.detector(context)) {
      const question = template.questions[Math.floor(Math.random() * template.questions.length)];
      patterns.push({
        pattern: template.signal,
        occurrences: 1, // Would need more context to count
        contexts: context.recentTopics,
        surfacingQuestion: question,
        intent: template.intent,
      });
    }
  }

  return patterns;
}

/**
 * Generate a pattern-surfacing question
 */
export async function generatePatternQuestion(
  context: QuestionContext,
  options?: { llmCall?: (prompt: string) => Promise<string> }
): Promise<GeneratedQuestion | null> {
  const patterns = detectPatterns(context);

  if (patterns.length === 0) {
    log.debug({ personaId: context.personaId }, '🧠 COACHING: No patterns detected');
    return null;
  }

  const pattern = patterns[0];
  log.info(
    { personaId: context.personaId, pattern: pattern.pattern },
    '🧠 COACHING: Generating pattern-surfacing question'
  );

  const baseQuestion = await generateQuestion(context, 'reflective', options);

  return {
    ...baseQuestion,
    text: pattern.surfacingQuestion,
    ssml: `<break time="500ms"/>${pattern.surfacingQuestion}`,
    intent: {
      seekingToUnderstand: pattern.intent,
      timingReason: `Detected pattern: ${pattern.pattern}`,
      expectedInsight: 'Help them see the pattern they might not notice',
    },
  };
}

/**
 * Generate a mirror reflection - reflect their words back
 */
export function generateMirror(transcript: string): MirrorReflection | null {
  for (const template of MIRROR_TEMPLATES) {
    const observed = template.trigger(transcript);
    if (observed) {
      log.info({ observed }, '🪞 COACHING: Generating mirror reflection');
      return template.createMirror(observed);
    }
  }
  return null;
}

/**
 * Generate an anticipatory question based on signals
 */
export function getAnticipatoryQuestion(signals: {
  pauseBeforeSpeaking?: boolean;
  voiceDropped?: boolean;
  shortAnswers?: boolean;
  changedSubject?: boolean;
  repeatedPerson?: string;
}): AnticipatedNeed | null {
  if (signals.pauseBeforeSpeaking) {
    return ANTICIPATORY_TEMPLATES.find((t) => t.signal === 'Long pause before speaking') || null;
  }
  if (signals.voiceDropped) {
    return ANTICIPATORY_TEMPLATES.find((t) => t.signal === 'Voice dropped or slowed') || null;
  }
  if (signals.shortAnswers) {
    return ANTICIPATORY_TEMPLATES.find((t) => t.signal === 'Short answers after longer ones') || null;
  }
  if (signals.changedSubject) {
    return ANTICIPATORY_TEMPLATES.find((t) => t.signal === 'Changed subject quickly') || null;
  }
  if (signals.repeatedPerson) {
    return ANTICIPATORY_TEMPLATES.find((t) => t.signal === 'Mentioned someone repeatedly') || null;
  }
  return null;
}

/**
 * Get the best coaching question based on context
 *
 * This is the main entry point that decides which type of question to ask:
 * 1. Memory-grounded (if we have relevant memories)
 * 2. Pattern-surfacing (if we detect patterns)
 * 3. Mirror (if their language reveals something)
 * 4. Anticipatory (if we sense they need something)
 * 5. Regular dynamic question (fallback)
 */
export async function getCoachingQuestion(
  context: QuestionContext,
  options: {
    memories?: Array<{ topic: string; daysAgo: number; summary: string }>;
    transcript?: string;
    signals?: {
      pauseBeforeSpeaking?: boolean;
      voiceDropped?: boolean;
      shortAnswers?: boolean;
      changedSubject?: boolean;
      repeatedPerson?: string;
    };
    llmCall?: (prompt: string) => Promise<string>;
  } = {}
): Promise<GeneratedQuestion> {
  log.info(
    {
      personaId: context.personaId,
      hasMemories: !!options.memories?.length,
      hasTranscript: !!options.transcript,
      hasSignals: !!options.signals,
    },
    '🧠 COACHING: Selecting best question type'
  );

  // 1. Try anticipatory first (they might need support)
  if (options.signals) {
    const anticipated = getAnticipatoryQuestion(options.signals);
    if (anticipated) {
      log.info({ signal: anticipated.signal }, '🧠 COACHING: Using anticipatory question');
      const baseQuestion = await generateQuestion(context, 'supportive', { llmCall: options.llmCall });
      return {
        ...baseQuestion,
        text: anticipated.checkQuestion,
        ssml: `<break time="500ms"/>${anticipated.checkQuestion}`,
        intent: {
          seekingToUnderstand: anticipated.anticipated,
          timingReason: `Detected signal: ${anticipated.signal}`,
          expectedInsight: 'Check if they need support',
        },
      };
    }
  }

  // 2. Try mirror (if their language reveals something)
  if (options.transcript) {
    const mirror = generateMirror(options.transcript);
    if (mirror) {
      log.info({ observed: mirror.observed }, '🧠 COACHING: Using mirror reflection');
      const baseQuestion = await generateQuestion(context, 'reflective', { llmCall: options.llmCall });
      return {
        ...baseQuestion,
        text: mirror.question,
        ssml: `<break time="500ms"/>${mirror.question}`,
        intent: {
          seekingToUnderstand: mirror.reflection,
          timingReason: `Observed: ${mirror.observed}`,
          expectedInsight: 'Help them hear themselves',
        },
      };
    }
  }

  // 3. Try pattern surfacing
  const patternQuestion = await generatePatternQuestion(context, { llmCall: options.llmCall });
  if (patternQuestion) {
    return patternQuestion;
  }

  // 4. Try memory-grounded
  if (options.memories && options.memories.length > 0) {
    return generateMemoryGroundedQuestion(context, options.memories, { llmCall: options.llmCall });
  }

  // 5. Fall back to regular dynamic question
  return generateQuestion(context, 'curious', { llmCall: options.llmCall });
}

// ============================================================================
// HELPERS
// ============================================================================

function findRelevantMemory(
  context: QuestionContext,
  memories: Array<{ topic: string; daysAgo: number; summary: string }>
): { topic: string; daysAgo: number; summary: string } | null {
  if (memories.length === 0) return null;

  // Check if any memory relates to current topics
  for (const memory of memories) {
    for (const topic of context.recentTopics) {
      if (
        memory.topic.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(memory.topic.toLowerCase())
      ) {
        return memory;
      }
    }
  }

  // Return most recent memory if no topic match
  return memories.sort((a, b) => a.daysAgo - b.daysAgo)[0] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateMemoryGroundedQuestion,
  generatePatternQuestion,
  generateMirror,
  getAnticipatoryQuestion,
  getCoachingQuestion,
  detectPatterns,
};

