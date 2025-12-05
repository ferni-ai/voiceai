/**
 * Cognitive Question Templates
 *
 * Each persona asks different kinds of questions based on their
 * cognitive style. This creates truly differentiated conversations.
 */

import type { ReasoningStyle } from '../personas/cognitive-types.js';
import { getCognitiveProfile } from '../personas/cognitive-profiles.js';

// ============================================================================
// COGNITIVE QUESTION TYPES
// ============================================================================

export interface CognitiveQuestion {
  text: string;
  purpose: string;
  style: ReasoningStyle;
  depth: 'surface' | 'moderate' | 'deep';
  expectedResponse: 'factual' | 'emotional' | 'reflective' | 'action' | 'exploratory';
}

// ============================================================================
// QUESTION TEMPLATES BY COGNITIVE STYLE
// ============================================================================

const COGNITIVE_QUESTION_TEMPLATES: Record<ReasoningStyle, CognitiveQuestion[]> = {
  analytical: [
    // Data-seeking questions
    {
      text: 'What does the data show?',
      purpose: 'Get concrete information',
      style: 'analytical',
      depth: 'surface',
      expectedResponse: 'factual',
    },
    {
      text: 'How does that compare to before?',
      purpose: 'Establish baseline and trends',
      style: 'analytical',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'What patterns have you noticed?',
      purpose: 'Surface recurring themes',
      style: 'analytical',
      depth: 'moderate',
      expectedResponse: 'reflective',
    },
    {
      text: "What's the evidence for that?",
      purpose: 'Ground assertions in facts',
      style: 'analytical',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'If we break this down, what are the components?',
      purpose: 'Decompose complex issues',
      style: 'analytical',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'What would success look like, quantitatively?',
      purpose: 'Define measurable outcomes',
      style: 'analytical',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'What variables are we not considering?',
      purpose: 'Expand analytical frame',
      style: 'analytical',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'How confident are you in that number?',
      purpose: 'Assess certainty',
      style: 'analytical',
      depth: 'surface',
      expectedResponse: 'factual',
    },
  ],

  empathetic: [
    // Feeling-focused questions
    {
      text: 'How does that feel?',
      purpose: 'Surface emotional experience',
      style: 'empathetic',
      depth: 'moderate',
      expectedResponse: 'emotional',
    },
    {
      text: 'What comes up for you when you think about that?',
      purpose: 'Explore emotional associations',
      style: 'empathetic',
      depth: 'deep',
      expectedResponse: 'emotional',
    },
    {
      text: "What's the hardest part of this for you?",
      purpose: 'Identify core struggles',
      style: 'empathetic',
      depth: 'deep',
      expectedResponse: 'emotional',
    },
    {
      text: 'How are you taking care of yourself through this?',
      purpose: 'Check on self-care',
      style: 'empathetic',
      depth: 'moderate',
      expectedResponse: 'reflective',
    },
    {
      text: 'What would feel supportive right now?',
      purpose: 'Understand support needs',
      style: 'empathetic',
      depth: 'moderate',
      expectedResponse: 'emotional',
    },
    {
      text: 'Who else knows about this?',
      purpose: 'Assess support network',
      style: 'empathetic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'What does your gut tell you?',
      purpose: 'Access intuitive wisdom',
      style: 'empathetic',
      depth: 'deep',
      expectedResponse: 'emotional',
    },
    {
      text: "Is there anything you haven't said out loud yet?",
      purpose: 'Create space for vulnerability',
      style: 'empathetic',
      depth: 'deep',
      expectedResponse: 'emotional',
    },
  ],

  narrative: [
    // Story-seeking questions
    {
      text: "What's the story behind that?",
      purpose: 'Understand context and journey',
      style: 'narrative',
      depth: 'moderate',
      expectedResponse: 'exploratory',
    },
    {
      text: 'When did this start mattering to you?',
      purpose: 'Find origin moment',
      style: 'narrative',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'If you could rewrite this chapter, what would change?',
      purpose: 'Explore alternative narratives',
      style: 'narrative',
      depth: 'deep',
      expectedResponse: 'exploratory',
    },
    {
      text: 'What would future you say about this moment?',
      purpose: 'Shift temporal perspective',
      style: 'narrative',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'Who are the characters in this story?',
      purpose: 'Map relationships',
      style: 'narrative',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'What metaphor comes to mind?',
      purpose: 'Access symbolic understanding',
      style: 'narrative',
      depth: 'deep',
      expectedResponse: 'exploratory',
    },
    {
      text: "What's the lesson you're learning here?",
      purpose: 'Extract meaning',
      style: 'narrative',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'How would you tell this story to someone else?',
      purpose: 'Clarify narrative',
      style: 'narrative',
      depth: 'moderate',
      expectedResponse: 'exploratory',
    },
  ],

  systematic: [
    // Process-oriented questions
    {
      text: 'Walk me through your process.',
      purpose: 'Understand current approach',
      style: 'systematic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: "What's the first step?",
      purpose: 'Identify starting point',
      style: 'systematic',
      depth: 'surface',
      expectedResponse: 'action',
    },
    {
      text: 'What happens after that?',
      purpose: 'Map sequence',
      style: 'systematic',
      depth: 'surface',
      expectedResponse: 'action',
    },
    {
      text: 'Where does this fit in your overall system?',
      purpose: 'Understand context',
      style: 'systematic',
      depth: 'moderate',
      expectedResponse: 'reflective',
    },
    {
      text: "What's the bottleneck?",
      purpose: 'Identify constraints',
      style: 'systematic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'How do you track this?',
      purpose: 'Understand measurement',
      style: 'systematic',
      depth: 'surface',
      expectedResponse: 'factual',
    },
    {
      text: 'What triggers this to happen?',
      purpose: 'Identify dependencies',
      style: 'systematic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'If we organized this differently, what would improve?',
      purpose: 'Explore optimization',
      style: 'systematic',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
  ],

  pragmatic: [
    // Action-oriented questions
    {
      text: 'What needs to happen next?',
      purpose: 'Identify immediate action',
      style: 'pragmatic',
      depth: 'surface',
      expectedResponse: 'action',
    },
    {
      text: "What's stopping you from doing that today?",
      purpose: 'Surface blockers',
      style: 'pragmatic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: "What's the simplest solution?",
      purpose: 'Cut through complexity',
      style: 'pragmatic',
      depth: 'moderate',
      expectedResponse: 'action',
    },
    {
      text: 'What would make the biggest difference?',
      purpose: 'Prioritize impact',
      style: 'pragmatic',
      depth: 'moderate',
      expectedResponse: 'reflective',
    },
    {
      text: 'When will you do this?',
      purpose: 'Create commitment',
      style: 'pragmatic',
      depth: 'surface',
      expectedResponse: 'action',
    },
    {
      text: "What's worked before?",
      purpose: 'Leverage past success',
      style: 'pragmatic',
      depth: 'moderate',
      expectedResponse: 'factual',
    },
    {
      text: 'What would it take to just get started?',
      purpose: 'Reduce friction',
      style: 'pragmatic',
      depth: 'surface',
      expectedResponse: 'action',
    },
    {
      text: 'If you had to decide right now, what would you choose?',
      purpose: 'Force clarity',
      style: 'pragmatic',
      depth: 'moderate',
      expectedResponse: 'action',
    },
  ],

  intuitive: [
    // Big-picture questions
    {
      text: "What's your sense of this overall?",
      purpose: 'Access holistic understanding',
      style: 'intuitive',
      depth: 'moderate',
      expectedResponse: 'exploratory',
    },
    {
      text: "What's the deeper pattern here?",
      purpose: 'See connections',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: "What's trying to emerge?",
      purpose: 'Sense direction',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'exploratory',
    },
    {
      text: 'If you trusted yourself completely, what would you do?',
      purpose: 'Access inner wisdom',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'What possibilities are we not seeing?',
      purpose: 'Expand vision',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'exploratory',
    },
    {
      text: "What's the essence of this?",
      purpose: 'Distill to core',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'reflective',
    },
    {
      text: 'Where is this leading?',
      purpose: 'Sense trajectory',
      style: 'intuitive',
      depth: 'moderate',
      expectedResponse: 'exploratory',
    },
    {
      text: 'What would peace look like?',
      purpose: 'Envision resolution',
      style: 'intuitive',
      depth: 'deep',
      expectedResponse: 'exploratory',
    },
  ],
};

// ============================================================================
// PERSONA-SPECIFIC QUESTION SIGNATURES
// ============================================================================

interface PersonaQuestionSignature {
  prefix?: string;
  suffix?: string;
  style: ReasoningStyle;
  favorites: string[]; // Specific questions this persona loves to ask
}

const PERSONA_QUESTION_SIGNATURES: Record<string, PersonaQuestionSignature> = {
  ferni: {
    prefix: undefined,
    suffix: undefined,
    style: 'narrative',
    favorites: [
      "What's the story behind that?",
      'What would it mean for you if that changed?',
      'Who do you want to become through this?',
      "What's the question underneath the question?",
      "What does your heart know that your head hasn't caught up to?",
    ],
  },
  'peter-john': {
    prefix: "Here's what I'm wondering -",
    suffix: undefined,
    style: 'analytical',
    favorites: [
      'What does the data show?',
      'How does that compare historically?',
      'What patterns are you seeing?',
      "What's the trend over time?",
      'If we run the numbers, what does that look like?',
    ],
  },
  'alex-chen': {
    prefix: undefined,
    suffix: undefined,
    style: 'systematic',
    favorites: [
      "What's the first step?",
      'Walk me through your current process.',
      "What's on your plate right now?",
      'How do you want to organize this?',
      'What would make this easier to manage?',
    ],
  },
  'maya-santos': {
    prefix: undefined,
    suffix: '- be honest with yourself.',
    style: 'empathetic',
    favorites: [
      'How does that really feel?',
      "What's the hardest part?",
      'What would self-compassion look like here?',
      'What small win could you celebrate?',
      'What does sustainable look like for you?',
    ],
  },
  'jordan-taylor': {
    prefix: undefined,
    suffix: undefined,
    style: 'pragmatic',
    favorites: [
      'What are we making happen?',
      "When's the deadline?",
      'What would make this special?',
      "What's the vision?",
      "What's the budget?",
    ],
  },
  'nayan-patel': {
    prefix: 'Consider this -',
    suffix: undefined,
    style: 'intuitive',
    favorites: [
      "What's the deeper question here?",
      'What does your silence tell you?',
      'What would wisdom suggest?',
      "What's trying to emerge?",
      'Where does peace reside in this?',
    ],
  },
};

// ============================================================================
// QUESTION GENERATION
// ============================================================================

export interface CognitiveQuestionContext {
  personaId: string;
  topic: string;
  userCognitiveStyle?: string;
  emotionalWeight: number;
  conversationDepth: 'surface' | 'moderate' | 'deep';
  recentQuestions?: string[];
}

/**
 * Generate a cognitive-appropriate question for a persona
 */
export function generateCognitiveQuestion(
  context: CognitiveQuestionContext
): CognitiveQuestion | null {
  const profile = getCognitiveProfile(context.personaId);
  const signature = PERSONA_QUESTION_SIGNATURES[context.personaId];

  if (!profile) {
    return null;
  }

  // Get questions for this persona's style
  const primaryQuestions = COGNITIVE_QUESTION_TEMPLATES[profile.reasoningStyle] || [];
  const secondaryQuestions = profile.secondaryReasoning
    ? COGNITIVE_QUESTION_TEMPLATES[profile.secondaryReasoning] || []
    : [];

  // High emotional weight → use empathetic questions even if not primary style
  let questionPool: CognitiveQuestion[] = [];
  if (context.emotionalWeight > 0.7 && profile.reasoningStyle !== 'empathetic') {
    questionPool = [...COGNITIVE_QUESTION_TEMPLATES.empathetic.slice(0, 3), ...primaryQuestions];
  } else {
    questionPool = [...primaryQuestions, ...secondaryQuestions.slice(0, 3)];
  }

  // Filter by conversation depth
  questionPool = questionPool.filter((q) => {
    if (context.conversationDepth === 'surface') {
      return q.depth !== 'deep';
    }
    if (context.conversationDepth === 'deep') {
      return q.depth !== 'surface';
    }
    return true;
  });

  // Avoid recently asked questions
  if (context.recentQuestions && context.recentQuestions.length > 0) {
    questionPool = questionPool.filter(
      (q) =>
        !context.recentQuestions!.some((recent) =>
          recent.toLowerCase().includes(q.text.toLowerCase().slice(0, 20))
        )
    );
  }

  // Check for persona favorites
  if (signature && Math.random() < 0.4) {
    const favorite = signature.favorites[Math.floor(Math.random() * signature.favorites.length)];
    const matchingQuestion = questionPool.find((q) => q.text === favorite);
    if (matchingQuestion) {
      return formatQuestion(matchingQuestion, signature);
    }
  }

  // Random selection from filtered pool
  if (questionPool.length === 0) {
    questionPool = primaryQuestions;
  }

  const selected = questionPool[Math.floor(Math.random() * questionPool.length)];
  return formatQuestion(selected, signature);
}

function formatQuestion(
  question: CognitiveQuestion,
  signature?: PersonaQuestionSignature
): CognitiveQuestion {
  if (!signature) return question;

  let { text } = question;
  if (signature.prefix) {
    text = `${signature.prefix} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  if (signature.suffix) {
    text = `${text.replace(/[.?]$/, '')} ${signature.suffix}`;
  }

  return { ...question, text };
}

/**
 * Get all question templates for a reasoning style
 */
export function getQuestionsForStyle(style: ReasoningStyle): CognitiveQuestion[] {
  return COGNITIVE_QUESTION_TEMPLATES[style] || [];
}

/**
 * Get persona's favorite questions
 */
export function getPersonaFavoriteQuestions(personaId: string): string[] {
  return PERSONA_QUESTION_SIGNATURES[personaId]?.favorites || [];
}

export default {
  generateCognitiveQuestion,
  getQuestionsForStyle,
  getPersonaFavoriteQuestions,
  COGNITIVE_QUESTION_TEMPLATES,
};
