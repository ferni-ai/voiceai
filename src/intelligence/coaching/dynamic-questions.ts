/**
 * Dynamic Question Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * CRITICAL: Every question Ferni asks should have a REASON. The agent must know:
 * - WHY it's asking this question
 * - What it expects to LEARN
 * - How to FOLLOW UP based on any answer
 *
 * This replaces all hardcoded question banks (meaningful-silence.ts, journaling-prompts.ts, etc.)
 * with LLM-generated, persona-grounded, context-aware questions.
 *
 * Two Modes:
 * 1. LLM Generation (preferred) - Dynamic, contextual, truly "Better than Human"
 * 2. Persona-Filtered Fallback - When LLM unavailable, uses cognitive profiles to filter
 *
 * Key Principles:
 * - Questions are PERSONA-GROUNDED (Ferni asks differently than Maya)
 * - Questions are CONTEXT-AWARE (based on what we know about them)
 * - Questions have PROVENANCE (we track why we asked)
 * - Questions are DEDUPLICATED (never repeat within a session)
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getCognitiveDifferentiation,
  type CognitiveDifferentiation,
  type QuestioningStyle,
} from '../../personas/cognitive-differentiation.js';
import { PERSONA_TRAIT_PROFILES, type PersonaVoiceTraits } from '../../personas/dynamic-responses.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * The reason we're asking this question - agent MUST know this
 */
export interface QuestionIntent {
  /** What we're trying to understand */
  seekingToUnderstand: string;
  /** Why NOW is the right time to ask */
  timingReason: string;
  /** What we expect to learn */
  expectedInsight: string;
  /** How this relates to what we already know */
  buildsOnContext?: string;
}

/**
 * Full context needed to generate a meaningful question
 */
export interface QuestionContext {
  /** Active persona */
  personaId: string;
  /** User we're talking to */
  userId: string;
  /** Session for deduplication */
  sessionId: string;

  // What we know about them
  knownFacts: string[];
  recentTopics: string[];
  currentStruggle?: string;
  currentWin?: string;

  // Relationship depth
  relationshipStage: 'new' | 'building' | 'established' | 'deep';
  conversationDepth: number; // 0-10

  // Emotional context
  emotionalState?: {
    primary: string;
    intensity: number;
  };
  recentEmotionalTone?: 'heavy' | 'light' | 'neutral';

  // Temporal context
  hourOfDay: number;
  isWeekend: boolean;

  // Conversation state
  lastUserMessage?: string;
  silenceReason?: 'processing' | 'distracted' | 'emotional' | 'thinking' | 'unknown';
  turnCount: number;

  // Boundaries - what NOT to ask about
  boundaries: string[];
  sensitiveTopics?: string[];
}

/**
 * A generated question with full provenance
 */
export interface GeneratedQuestion {
  /** The question text (plain) */
  text: string;
  /** SSML-formatted for speech */
  ssml: string;

  /** The intent behind this question - REQUIRED */
  intent: QuestionIntent;

  /** How to respond based on their answer */
  followUpStrategy: {
    ifPositive: string;
    ifNegative: string;
    ifDeflects: string;
    ifSilence: string;
  };

  /** Metadata */
  personaId: string;
  generatedAt: Date;
  generationMethod: 'llm' | 'filtered_fallback' | 'universal_fallback';

  /** For deduplication */
  contentHash: string;
}

/**
 * Question type categories
 */
export type QuestionType =
  | 'deepening' // Go deeper on current topic
  | 'checking_in' // General wellbeing check
  | 'curious' // Genuine curiosity about them
  | 'supportive' // When they're struggling
  | 'celebratory' // When something good happened
  | 'reflective' // Help them reflect
  | 'silence_break' // Break a meaningful silence
  | 'relationship_building'; // Building connection

// ============================================================================
// UNIVERSAL HUMAN QUESTIONS
// ============================================================================

/**
 * COACHING-LEVEL QUESTIONS
 *
 * These questions follow the "Better Than Human" coaching philosophy:
 * - Make them PAUSE before answering
 * - Help them think DIFFERENTLY than they were
 * - Make them feel UNDERSTOOD, not interrogated
 * - Make them WANT to answer (not have to)
 *
 * The gold standard: "Huh. I never thought about it that way."
 */
const UNIVERSAL_QUESTIONS: Record<QuestionType, string[]> = {
  deepening: [
    // Don't just go deeper - help them see it differently
    'What would you tell them if you could?',
    "If this was someone else's story, what would you notice?",
    'What would you do if no one was watching?',
    'Where do you feel that in your body?',
    "What's the version of this you're not saying out loud?",
    'If that feeling had a voice, what would it say?',
    'What part of this do you already know the answer to?',
  ],
  checking_in: [
    // Not "how are you" - specific, opens doors
    "What's actually true for you today?",
    "What's taking up the most space in your head right now?",
    'What moment from today keeps coming back to you?',
    "What haven't you told anyone yet?",
    'What would make today feel worth it?',
    "What's one thing that went right that you didn't expect?",
  ],
  curious: [
    // Genuine curiosity that invites depth
    "What's something you've been avoiding thinking about?",
    'What would be different if you gave yourself permission?',
    "What's one thing you'd fight for?",
    'What would you be sad to never do?',
    'If you woke up tomorrow and everything was different, what changed?',
    "What do you know now that you wish you'd known sooner?",
  ],
  supportive: [
    // Not "that's hard" - help them find their own strength
    "What's the part of this that feels most unfair?",
    'What would you need to hear right now?',
    'If you could change just one thing about this, what would it be?',
    "What's keeping you going through this?",
    "What would 'good enough' look like here?",
    'Who in your life has been through something like this?',
  ],
  celebratory: [
    // Don't rush past wins - let them land
    'I want to stay here for a second. How does this actually feel?',
    'What made you the kind of person who could do this?',
    'Who do you want to tell first?',
    'What did past-you need to hear to believe this was possible?',
    'What does this change about how you see yourself?',
  ],
  reflective: [
    // Help them hear themselves
    'What part of what you just said surprised you?',
    'If you were giving advice to someone in your exact situation, what would you say?',
    "What's the pattern here that you keep bumping into?",
    'A year from now, what will you wish you had done?',
    'What would you tell yourself six months ago?',
  ],
  silence_break: [
    // Don't fill silence - honor it, then gently open
    'Where did your mind just go?',
    'Something shifted. What is it?',
    "Take your time. I'm not going anywhere.",
    'What just came up for you?',
    'You got quiet. That usually means something.',
  ],
  relationship_building: [
    // Build real connection, not small talk
    "What's something people don't usually ask you about?",
    "What's something you're proud of that you don't talk about?",
    "What's a question you wish someone would ask you?",
    "What's something you've changed your mind about?",
    'What do you wish you could spend more time on?',
    "What's something you're better at than most people realize?",
  ],
};

// ============================================================================
// USAGE TRACKING (deduplication)
// ============================================================================

const questionHistory = new Map<string, Set<string>>();

function getQuestionHistory(sessionId: string): Set<string> {
  if (!questionHistory.has(sessionId)) {
    questionHistory.set(sessionId, new Set());
  }
  return questionHistory.get(sessionId)!;
}

function recordQuestion(sessionId: string, contentHash: string): void {
  getQuestionHistory(sessionId).add(contentHash);
}

function wasRecentlyAsked(sessionId: string, contentHash: string): boolean {
  return getQuestionHistory(sessionId).has(contentHash);
}

function hashContent(text: string): string {
  // Simple hash for deduplication
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50);
}

/**
 * Clear session question history
 */
export function clearQuestionHistory(sessionId: string): void {
  questionHistory.delete(sessionId);
}

// ============================================================================
// PERSONA-FILTERED FALLBACK
// ============================================================================

/**
 * When LLM generation isn't available, filter static questions by persona traits
 */
function getPersonaFilteredQuestion(
  context: QuestionContext,
  type: QuestionType
): GeneratedQuestion | null {
  const cognitiveDiff = getCognitiveDifferentiation(context.personaId);
  const traits = PERSONA_TRAIT_PROFILES[context.personaId];

  if (!cognitiveDiff && !traits) {
    log.warn({ personaId: context.personaId }, 'No cognitive profile for persona');
    return null;
  }

  // Get persona's question starters
  const questionStarters = cognitiveDiff?.questioning.questionStarters || [];
  const deepDiveQuestions = cognitiveDiff?.questioning.deepDiveQuestions || [];
  const silenceBreakers = cognitiveDiff?.silence.silenceBreakers || [];

  // Check boundaries
  const avoidQuestions = cognitiveDiff?.questioning.avoidQuestions || [];

  // Select based on type
  let candidates: string[] = [];

  switch (type) {
    case 'deepening':
      candidates = deepDiveQuestions;
      break;
    case 'silence_break':
      candidates = silenceBreakers;
      break;
    case 'checking_in':
    case 'curious':
    case 'relationship_building':
      candidates = questionStarters;
      break;
    default:
      candidates = [...questionStarters, ...UNIVERSAL_QUESTIONS[type]];
  }

  // Filter out recently asked questions
  const unused = candidates.filter((q) => !wasRecentlyAsked(context.sessionId, hashContent(q)));

  if (unused.length === 0) {
    // Fall back to universal
    candidates = UNIVERSAL_QUESTIONS[type] || UNIVERSAL_QUESTIONS.curious;
  }

  // Pick one
  const question = unused[Math.floor(Math.random() * unused.length)] || candidates[0];
  if (!question) return null;

  const contentHash = hashContent(question);
  recordQuestion(context.sessionId, contentHash);

  return {
    text: question,
    ssml: `<break time="400ms"/>${question}`,
    intent: {
      seekingToUnderstand: `User's ${type} in current conversation`,
      timingReason: `${type} question appropriate for conversation state`,
      expectedInsight: 'Deepen understanding or connection',
      buildsOnContext:
        context.recentTopics.length > 0 ? `Relates to: ${context.recentTopics[0]}` : undefined,
    },
    followUpStrategy: {
      ifPositive: 'Acknowledge and explore further',
      ifNegative: 'Validate feelings, offer support',
      ifDeflects: 'Notice deflection, give space, maybe circle back',
      ifSilence: 'Comfortable presence, no pressure',
    },
    personaId: context.personaId,
    generatedAt: new Date(),
    generationMethod: 'filtered_fallback',
    contentHash,
  };
}

// ============================================================================
// LLM GENERATION PROMPT BUILDER
// ============================================================================

/**
 * Build the system prompt for LLM question generation
 */
function buildQuestionGenerationPrompt(
  context: QuestionContext,
  type: QuestionType,
  cognitiveDiff: CognitiveDifferentiation | undefined
): string {
  const traits = PERSONA_TRAIT_PROFILES[context.personaId];

  // Persona voice constraints
  const questioningStyle = cognitiveDiff?.questioning;
  const voiceConstraints = [];

  if (questioningStyle) {
    if (questioningStyle.openVsClosed > 0.6) {
      voiceConstraints.push('Prefer open-ended questions');
    } else if (questioningStyle.openVsClosed < 0.4) {
      voiceConstraints.push('Can use more direct, closed questions');
    }

    if (questioningStyle.feelingVsData > 0.6) {
      voiceConstraints.push('Focus on feelings and experiences');
    } else if (questioningStyle.feelingVsData < 0.4) {
      voiceConstraints.push('Can focus on facts and data');
    }

    if (questioningStyle.whyVsHow > 0.6) {
      voiceConstraints.push('Ask about meaning and motivation (why)');
    } else if (questioningStyle.whyVsHow < 0.4) {
      voiceConstraints.push('Ask about process and steps (how)');
    }

    if (questioningStyle.questionStarters.length > 0) {
      voiceConstraints.push(
        `Use starters like: "${questioningStyle.questionStarters.slice(0, 3).join('", "')}"`
      );
    }

    if (questioningStyle.avoidQuestions.length > 0) {
      voiceConstraints.push(
        `NEVER ask questions like: "${questioningStyle.avoidQuestions.join('", "')}"`
      );
    }
  }

  if (traits) {
    if (traits.warmth > 0.7) voiceConstraints.push('Use warm, caring tone');
    if (traits.directness > 0.6) voiceConstraints.push('Be direct, not overly soft');
    if (traits.formality > 0.6) voiceConstraints.push('Keep professional tone');
    if (traits.formality < 0.4) voiceConstraints.push('Keep casual, conversational');
  }

  // Build context section
  const contextLines = [];
  if (context.knownFacts.length > 0) {
    contextLines.push(`What we know about them:\n- ${context.knownFacts.slice(0, 5).join('\n- ')}`);
  }
  if (context.recentTopics.length > 0) {
    contextLines.push(`Recent topics discussed: ${context.recentTopics.slice(0, 3).join(', ')}`);
  }
  if (context.currentStruggle) {
    contextLines.push(`They're currently struggling with: ${context.currentStruggle}`);
  }
  if (context.currentWin) {
    contextLines.push(`Recent win: ${context.currentWin}`);
  }
  if (context.emotionalState) {
    contextLines.push(
      `Emotional state: ${context.emotionalState.primary} (intensity: ${context.emotionalState.intensity})`
    );
  }
  if (context.lastUserMessage) {
    contextLines.push(`Their last message: "${context.lastUserMessage}"`);
  }

  // Build boundaries section
  const boundaryLines = [];
  if (context.boundaries.length > 0) {
    boundaryLines.push(`DO NOT ask about: ${context.boundaries.join(', ')}`);
  }
  if (context.sensitiveTopics && context.sensitiveTopics.length > 0) {
    boundaryLines.push(`Tread carefully around: ${context.sensitiveTopics.join(', ')}`);
  }

  return `You are generating a question for a voice AI life coach.

PERSONA: ${context.personaId}
QUESTION TYPE: ${type}
RELATIONSHIP STAGE: ${context.relationshipStage}
TIME: ${context.hourOfDay}:00 ${context.isWeekend ? '(weekend)' : '(weekday)'}

VOICE CONSTRAINTS (follow these exactly):
${voiceConstraints.map((c) => `- ${c}`).join('\n')}

CONTEXT:
${contextLines.join('\n')}

BOUNDARIES:
${boundaryLines.length > 0 ? boundaryLines.join('\n') : '- None specified'}

REQUIREMENTS:
1. Generate ONE question that feels natural for this persona
2. The question must be grounded in the context provided
3. The question should have a clear PURPOSE (you'll explain why you're asking)
4. The question should open conversation, not close it
5. Keep it SHORT - this is voice, not text

OUTPUT FORMAT (JSON):
{
  "question": "The question to ask",
  "intent": {
    "seekingToUnderstand": "What we're trying to learn",
    "timingReason": "Why now is the right time to ask this",
    "expectedInsight": "What we hope to learn from their answer"
  },
  "followUp": {
    "ifPositive": "How to respond if they share something positive",
    "ifNegative": "How to respond if they share something difficult",
    "ifDeflects": "How to respond if they avoid the question"
  }
}`;
}

// ============================================================================
// MAIN API
// ============================================================================

export interface GenerateQuestionOptions {
  /** Force LLM generation (skip fallback) */
  forceLLM?: boolean;
  /** Custom LLM call function */
  llmCall?: (prompt: string) => Promise<string>;
  /** Specific question intent override */
  specificIntent?: string;
}

/**
 * Generate a contextual, persona-grounded question
 *
 * This is the main entry point. It will:
 * 1. Try LLM generation if available
 * 2. Fall back to persona-filtered static questions
 * 3. Fall back to universal questions if all else fails
 */
export async function generateQuestion(
  context: QuestionContext,
  type: QuestionType,
  options: GenerateQuestionOptions = {}
): Promise<GeneratedQuestion> {
  const startTime = Date.now();
  log.info(
    {
      personaId: context.personaId,
      type,
      sessionId: context.sessionId,
      turnCount: context.turnCount,
      recentTopics: context.recentTopics.slice(0, 3),
      relationshipStage: context.relationshipStage,
      silenceReason: context.silenceReason,
    },
    '🧠 DYNAMIC QUESTION: Starting generation'
  );

  const cognitiveDiff = getCognitiveDifferentiation(context.personaId);

  // Try LLM generation if provided
  if (options.llmCall && (options.forceLLM || Math.random() > 0.3)) {
    try {
      log.debug({ type }, '🧠 DYNAMIC QUESTION: Attempting LLM generation');
      const prompt = buildQuestionGenerationPrompt(context, type, cognitiveDiff);
      const response = await options.llmCall(prompt);

      // Parse JSON response
      const parsed = JSON.parse(response);
      const { question } = parsed;
      const contentHash = hashContent(question);

      // Check for duplicates
      if (!wasRecentlyAsked(context.sessionId, contentHash)) {
        recordQuestion(context.sessionId, contentHash);

        const result = {
          text: question,
          ssml: `<break time="400ms"/>${question}`,
          intent: {
            seekingToUnderstand: parsed.intent?.seekingToUnderstand || 'Understanding user better',
            timingReason: parsed.intent?.timingReason || 'Appropriate moment in conversation',
            expectedInsight: parsed.intent?.expectedInsight || 'Deepen connection',
            buildsOnContext: context.recentTopics[0],
          },
          followUpStrategy: {
            ifPositive: parsed.followUp?.ifPositive || 'Acknowledge and explore',
            ifNegative: parsed.followUp?.ifNegative || 'Validate and support',
            ifDeflects: parsed.followUp?.ifDeflects || 'Give space',
            ifSilence: 'Comfortable presence',
          },
          personaId: context.personaId,
          generatedAt: new Date(),
          generationMethod: 'llm' as const,
          contentHash,
        };

        log.info(
          {
            method: 'llm',
            question: question.slice(0, 100),
            intent: result.intent.seekingToUnderstand,
            durationMs: Date.now() - startTime,
          },
          '🧠 DYNAMIC QUESTION: LLM generated successfully'
        );

        return result;
      } else {
        log.debug(
          { contentHash },
          '🧠 DYNAMIC QUESTION: LLM question was duplicate, trying fallback'
        );
      }
    } catch (error) {
      log.warn(
        { error: String(error) },
        '🧠 DYNAMIC QUESTION: LLM generation failed, using fallback'
      );
    }
  }

  // Fallback to persona-filtered
  log.debug(
    { type, personaId: context.personaId },
    '🧠 DYNAMIC QUESTION: Trying persona-filtered fallback'
  );
  const filtered = getPersonaFilteredQuestion(context, type);
  if (filtered) {
    log.info(
      {
        method: 'filtered_fallback',
        question: filtered.text.slice(0, 100),
        durationMs: Date.now() - startTime,
      },
      '🧠 DYNAMIC QUESTION: Persona-filtered question generated'
    );
    return filtered;
  }

  // Final fallback to universal
  log.debug({ type }, '🧠 DYNAMIC QUESTION: Using universal fallback');
  const universalQuestions = UNIVERSAL_QUESTIONS[type] || UNIVERSAL_QUESTIONS.curious;
  const question = universalQuestions[Math.floor(Math.random() * universalQuestions.length)];
  const contentHash = hashContent(question);
  recordQuestion(context.sessionId, contentHash);

  const result: GeneratedQuestion = {
    text: question,
    ssml: `<break time="400ms"/>${question}`,
    intent: {
      seekingToUnderstand: 'General connection',
      timingReason: 'Fallback question',
      expectedInsight: 'Any insight is valuable',
    },
    followUpStrategy: {
      ifPositive: 'Acknowledge',
      ifNegative: 'Support',
      ifDeflects: 'Accept',
      ifSilence: 'Wait',
    },
    personaId: context.personaId,
    generatedAt: new Date(),
    generationMethod: 'universal_fallback',
    contentHash,
  };

  log.info(
    {
      method: 'universal_fallback',
      question: question.slice(0, 100),
      durationMs: Date.now() - startTime,
    },
    '🧠 DYNAMIC QUESTION: Universal fallback used'
  );

  return result;
}

/**
 * Convenience function: Get a silence-breaking question
 */
export async function getSilenceQuestion(
  context: QuestionContext,
  options?: GenerateQuestionOptions
): Promise<GeneratedQuestion> {
  // Determine the best question type based on silence context
  let type: QuestionType = 'silence_break';

  if (context.silenceReason === 'emotional') {
    type = 'supportive';
  } else if (context.conversationDepth > 7) {
    type = 'deepening';
  } else if (context.relationshipStage === 'new') {
    type = 'relationship_building';
  }

  return generateQuestion(context, type, options);
}

/**
 * Convenience function: Get a checking-in question
 */
export async function getCheckInQuestion(
  context: QuestionContext,
  options?: GenerateQuestionOptions
): Promise<GeneratedQuestion> {
  return generateQuestion(context, 'checking_in', options);
}

/**
 * Convenience function: Get a deepening question
 */
export async function getDeepeningQuestion(
  context: QuestionContext,
  options?: GenerateQuestionOptions
): Promise<GeneratedQuestion> {
  return generateQuestion(context, 'deepening', options);
}

// ============================================================================
// QUESTION BANK ACCESS (for systems that need static fallbacks)
// ============================================================================

/**
 * Get available question types for a persona
 */
export function getPersonaQuestionCapabilities(personaId: string): {
  preferredTypes: QuestionType[];
  avoidTypes: QuestionType[];
  voiceStyle: string;
} {
  const cognitiveDiff = getCognitiveDifferentiation(personaId);
  const questioning = cognitiveDiff?.questioning;

  if (!questioning) {
    return {
      preferredTypes: ['curious', 'checking_in', 'relationship_building'],
      avoidTypes: [],
      voiceStyle: 'balanced',
    };
  }

  const preferredTypes: QuestionType[] = [];
  const avoidTypes: QuestionType[] = [];

  // Map cognitive profile to question types
  if (questioning.feelingVsData > 0.6) {
    preferredTypes.push('supportive', 'reflective');
  }
  if (questioning.whyVsHow > 0.6) {
    preferredTypes.push('deepening');
  }
  if (questioning.openVsClosed > 0.7) {
    preferredTypes.push('curious');
  }

  // Voice style description
  let voiceStyle = '';
  if (questioning.feelingVsData > 0.6) {
    voiceStyle = 'warm and feeling-focused';
  } else if (questioning.feelingVsData < 0.4) {
    voiceStyle = 'practical and data-focused';
  } else {
    voiceStyle = 'balanced';
  }

  return {
    preferredTypes: preferredTypes.length > 0 ? preferredTypes : ['curious'],
    avoidTypes,
    voiceStyle,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateQuestion,
  getSilenceQuestion,
  getCheckInQuestion,
  getDeepeningQuestion,
  clearQuestionHistory,
  getPersonaQuestionCapabilities,
};
