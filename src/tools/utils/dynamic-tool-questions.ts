/**
 * Dynamic Tool Questions
 *
 * Provides contextual, persona-grounded questions for domain tools.
 * Replaces hardcoded question arrays with intelligent generation.
 *
 * Used by: stories, relationships, grief, meaning, crisis, curiosity domains
 *
 * @module tools/utils/dynamic-tool-questions
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getCognitiveDifferentiation } from '../../personas/cognitive-differentiation.js';
import type { CognitiveDifferentiation } from '../../personas/cognitive-differentiation.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type QuestionDomain =
  | 'stories'
  | 'relationships'
  | 'grief'
  | 'meaning'
  | 'crisis'
  | 'curiosity'
  | 'vulnerability'
  | 'presence';

export type QuestionFocus =
  // Stories
  | 'childhood'
  | 'defining-moments'
  | 'relationships'
  | 'challenges'
  | 'joys'
  | 'lessons'
  | 'legacy'
  // Relationships
  | 'trust'
  | 'communication'
  | 'conflict'
  | 'connection'
  | 'boundaries'
  // Grief
  | 'fresh-loss'
  | 'grief-waves'
  | 'chronic-grief'
  | 'anticipatory'
  | 'anniversary'
  // Meaning
  | 'purpose'
  | 'values'
  | 'spirituality'
  | 'mortality'
  // General
  | 'exploration'
  | 'reflection'
  | 'action';

export interface ToolQuestionContext {
  personaId: string;
  domain: QuestionDomain;
  focus: QuestionFocus;
  specificContext?: string; // e.g., person's name, what was lost
  emotionalTone?: 'gentle' | 'direct' | 'supportive' | 'curious';
  maxQuestions?: number;
}

export interface GeneratedToolQuestions {
  intro?: string;
  questions: string[];
  closingPrompt: string;
  personaStyle: string;
}

// ============================================================================
// CORE QUESTION FRAMEWORKS
// ============================================================================

/**
 * Base questions organized by domain and focus.
 * These are frameworks that get personalized by persona voice.
 */
const QUESTION_FRAMEWORKS: Record<QuestionDomain, Record<string, string[]>> = {
  stories: {
    childhood: [
      "What's your earliest clear memory?",
      'What was the feeling of your childhood home?',
      'Who shaped who you became?',
      'What did you dream of being?',
    ],
    'defining-moments': [
      "What moments divided your life into 'before' and 'after'?",
      'When did you become who you are today?',
      'What decision changed everything?',
    ],
    relationships: [
      'Who has loved you most in your life?',
      'Which relationship taught you the most?',
      'What relationship are you most proud of?',
    ],
    challenges: [
      "What's the hardest thing you've overcome?",
      'What failure taught you the most?',
      'How did difficulty shape your strength?',
    ],
    joys: [
      'What are the happiest moments of your life?',
      'When have you felt most alive?',
      'What brings you the deepest joy?',
    ],
    lessons: [
      "What do you know now that you wish you'd known earlier?",
      "What's the most important thing life taught you?",
      'What advice would you give your younger self?',
    ],
    legacy: [
      'What do you want to be remembered for?',
      'What would you want your children to know about you?',
      'What values do you most want to pass on?',
    ],
  },

  relationships: {
    trust: [
      'How much do you trust each other?',
      'What would deepen the trust between you?',
      'Has trust been broken? How?',
    ],
    communication: [
      'How openly can you communicate?',
      'Are there topics you avoid?',
      'What do you wish you could say?',
    ],
    conflict: [
      'What patterns emerge when you disagree?',
      'How do you repair after conflict?',
      'What underlying needs drive your conflicts?',
    ],
    connection: [
      'When do you feel most connected?',
      "What's been missing lately?",
      'How do you show love to each other?',
    ],
    boundaries: [
      'Where do you need clearer boundaries?',
      'What boundaries are being crossed?',
      'How can you honor both your needs?',
    ],
  },

  grief: {
    'fresh-loss': [
      'What do you need right now?',
      'Would you like to talk about them?',
      'What feels true in this moment?',
    ],
    'grief-waves': [
      'What triggered this wave?',
      'What would help you ride it?',
      'Would you rather talk or sit together quietly?',
    ],
    'chronic-grief': [
      'How has your grief changed over time?',
      'What do you need from it now?',
      'How have you built a life that holds the grief?',
    ],
    anticipatory: [
      'What are you facing?',
      'What needs to be said while there is time?',
      'How can you make the most of the time you have?',
    ],
    anniversary: [
      'How would you like to honor this day?',
      'What do you want to remember?',
      'What would they want for you today?',
    ],
  },

  meaning: {
    purpose: [
      'What makes you feel most alive?',
      'What would you do even if no one paid you?',
      'What breaks your heart that you could help heal?',
    ],
    values: [
      'What do you stand for?',
      'When have you felt most aligned with your values?',
      'Where are you living out of alignment?',
    ],
    spirituality: [
      'What do you believe about what matters?',
      'What practices connect you to something larger?',
      'Where do you find transcendence?',
    ],
    mortality: [
      'If you had one year left, what would you change?',
      'What regrets are you carrying?',
      'What matters most in the end?',
    ],
  },

  crisis: {
    exploration: [
      "What's happening right now?",
      'Are you safe?',
      'Who can be with you?',
    ],
    reflection: [
      'What brought you to this point?',
      "What's worked before when things were hard?",
      'What small thing might help right now?',
    ],
    action: [
      'What one thing can you do in the next hour?',
      'Who can you reach out to?',
      "What's the smallest step toward safety?",
    ],
  },

  curiosity: {
    exploration: [
      'What are you curious about right now?',
      'What question have you been sitting with?',
      'What would you love to understand better?',
    ],
    reflection: [
      'What surprised you recently?',
      'What assumption are you questioning?',
      'What are you learning about yourself?',
    ],
    action: [
      'What would you love to explore?',
      'What experiment could you try?',
      'What would make you feel more alive?',
    ],
  },

  vulnerability: {
    exploration: [
      'What are you afraid to admit?',
      'What do you hide from others?',
      'What would it feel like to be fully seen?',
    ],
    reflection: [
      'Where did you learn to hide that part of yourself?',
      'What would compassion look like here?',
      'What if that part of you was welcomed?',
    ],
    action: [
      'What small act of vulnerability might you try?',
      'Who might you trust with this?',
      'What would self-acceptance look like?',
    ],
  },

  presence: {
    exploration: [
      "What's alive in you right now?",
      'What do you notice in your body?',
      'What wants your attention?',
    ],
    reflection: [
      'What brings you into the present?',
      'Where do you tend to escape?',
      'What would it mean to fully arrive here?',
    ],
    action: [
      'What grounding practice helps you?',
      'How can you stay present with discomfort?',
      'What would presence look like in your daily life?',
    ],
  },
};

// ============================================================================
// PERSONA VOICE ADAPTATION
// ============================================================================

/**
 * Adapt questions to persona's questioning style
 */
function adaptToPersonaVoice(
  questions: string[],
  cognitiveDiff: CognitiveDifferentiation | undefined,
  emotionalTone: string
): string[] {
  if (!cognitiveDiff) {
    return questions;
  }

  const style = cognitiveDiff.questioning;

  return questions.map((q) => {
    let adapted = q;

    // Apply opening style from persona
    if (style.questionStarters.length > 0) {
      // See if we can use a natural starter
      const starterIdx = Math.floor(Math.random() * style.questionStarters.length);
      const starter = style.questionStarters[starterIdx];

      // Only apply if it flows naturally
      if (q.match(/^What|^How|^When|^Where|^Who|^Why/)) {
        // Sometimes replace the opening
        if (Math.random() < 0.3) {
          adapted = starter.replace(/\.\.\.$/, '') + ' ' + q.charAt(0).toLowerCase() + q.slice(1);
        }
      }
    }

    // Add softening for feeling-focused personas
    if (style.feelingVsData > 0.6 && emotionalTone === 'gentle') {
      if (!adapted.includes('feel') && Math.random() < 0.3) {
        adapted = adapted.replace('What ', 'What does it feel like when ');
      }
    }

    return adapted;
  });
}

/**
 * Generate a persona-appropriate intro
 */
function generateIntro(
  domain: QuestionDomain,
  focus: QuestionFocus,
  specificContext: string | undefined,
  cognitiveDiff: CognitiveDifferentiation | undefined
): string {
  // Base intros by domain
  const baseIntros: Record<QuestionDomain, string> = {
    stories: "Let's capture part of your story.",
    relationships: "Let's explore this relationship.",
    grief: "I'm here with you in this.",
    meaning: "Let's explore what matters to you.",
    crisis: "I'm here. Let's focus on right now.",
    curiosity: "Let's follow your curiosity.",
    vulnerability: "Thank you for trusting me with this.",
    presence: "Let's be here, right now.",
  };

  let intro = baseIntros[domain];

  // Add context if provided
  if (specificContext) {
    if (domain === 'relationships') {
      intro = `Let's explore your relationship with ${specificContext}.`;
    } else if (domain === 'grief') {
      intro = `I'm here with you as you think about ${specificContext}.`;
    } else if (domain === 'stories') {
      intro = `Let's explore ${specificContext} together.`;
    }
  }

  // Adapt to persona voice
  if (cognitiveDiff) {
    // Analytical personas might be more direct
    if (cognitiveDiff.approach.depth > 0.7) {
      intro += ' There are no right answers - just what\'s true for you.';
    }
  }

  return intro;
}

/**
 * Generate a persona-appropriate closing prompt
 */
function generateClosingPrompt(
  domain: QuestionDomain,
  cognitiveDiff: CognitiveDifferentiation | undefined
): string {
  const baseClosings: Record<QuestionDomain, string[]> = {
    stories: [
      'Which question calls to you?',
      'Where would you like to start?',
      'What wants to be told first?',
    ],
    relationships: [
      'Which of these feels most important right now?',
      'Where would you like to focus?',
      'What feels most alive in this?',
    ],
    grief: [
      "What do you need right now?",
      'Would you like to explore any of these?',
      "I'm here—where would you like to go?",
    ],
    meaning: [
      'What resonates with you?',
      'Where would you like to start?',
      'What question feels most alive?',
    ],
    crisis: [
      "What's most important right now?",
      'What can we focus on first?',
      "What's the smallest step?",
    ],
    curiosity: [
      'What draws your attention?',
      'Where does your curiosity want to go?',
      'What would you like to explore?',
    ],
    vulnerability: [
      'What feels safe to explore?',
      'Where would you like to start?',
      "What's asking to be seen?",
    ],
    presence: [
      "What's here right now?",
      'What do you notice?',
      'Where would you like to focus?',
    ],
  };

  const options = baseClosings[domain];
  const idx = Math.floor(Math.random() * options.length);

  return options[idx];
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

/**
 * Generate contextual, persona-grounded questions for a tool
 */
export function generateToolQuestions(context: ToolQuestionContext): GeneratedToolQuestions {
  const { personaId, domain, focus, specificContext, emotionalTone = 'supportive', maxQuestions = 5 } = context;

  // Get persona's cognitive style
  const cognitiveDiff = getCognitiveDifferentiation(personaId);

  // Get base questions for this domain/focus
  const focusKey = focus as string;
  const domainFramework = QUESTION_FRAMEWORKS[domain];

  if (!domainFramework) {
    log.warn({ domain }, 'Unknown question domain');
    return {
      questions: ['What would you like to explore?'],
      closingPrompt: "I'm here to listen.",
      personaStyle: 'default',
    };
  }

  // Try exact match, then fall back to 'exploration'
  let baseQuestions = domainFramework[focusKey] || domainFramework.exploration || [];

  // Limit to max
  if (baseQuestions.length > maxQuestions) {
    // Shuffle and take first N
    baseQuestions = [...baseQuestions].sort(() => Math.random() - 0.5).slice(0, maxQuestions);
  }

  // Adapt to persona voice
  const adaptedQuestions = adaptToPersonaVoice(baseQuestions, cognitiveDiff, emotionalTone);

  // Generate intro and closing
  const intro = generateIntro(domain, focus, specificContext, cognitiveDiff);
  const closingPrompt = generateClosingPrompt(domain, cognitiveDiff);

  // Determine persona style description
  const personaStyle = cognitiveDiff?.identity?.shortDescription || 'thoughtful listener';

  log.debug(
    { personaId, domain, focus, questionCount: adaptedQuestions.length },
    'Generated tool questions'
  );

  return {
    intro,
    questions: adaptedQuestions,
    closingPrompt,
    personaStyle,
  };
}

/**
 * Format questions for tool response output
 */
export function formatQuestionsForResponse(
  generated: GeneratedToolQuestions,
  options?: {
    numbered?: boolean;
    includeIntro?: boolean;
    includeClosing?: boolean;
    boldQuestions?: boolean;
  }
): string {
  const { numbered = true, includeIntro = true, includeClosing = true, boldQuestions = false } = options || {};

  const parts: string[] = [];

  if (includeIntro && generated.intro) {
    parts.push(generated.intro);
    parts.push('');
  }

  if (boldQuestions) {
    parts.push('**Questions to explore:**');
  }

  generated.questions.forEach((q, i) => {
    if (numbered) {
      parts.push(`${i + 1}. ${q}`);
    } else {
      parts.push(`- ${q}`);
    }
  });

  if (includeClosing) {
    parts.push('');
    parts.push(generated.closingPrompt);
  }

  return parts.join('\n');
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick function to get questions for a domain
 */
export function getQuestions(
  personaId: string,
  domain: QuestionDomain,
  focus: QuestionFocus,
  specificContext?: string
): string {
  const generated = generateToolQuestions({
    personaId,
    domain,
    focus,
    specificContext,
  });

  return formatQuestionsForResponse(generated);
}

