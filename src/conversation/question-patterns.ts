/**
 * Question Patterns
 *
 * Diverse question types for natural conversation:
 * - Open-ended questions (explore)
 * - Clarifying questions (understand)
 * - Confirming questions (validate)
 * - Rhetorical questions (engage)
 * - Echo questions (mirror)
 * - Leading questions (guide)
 * - Reflective questions (deepen)
 *
 * Different question types serve different conversational purposes.
 * Good conversationalists vary their question styles.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type QuestionType =
  | 'open_ended'      // "What do you think about...?"
  | 'clarifying'      // "When you say X, do you mean...?"
  | 'confirming'      // "So you're saying...?"
  | 'rhetorical'      // "Isn't that something?" (no real answer expected)
  | 'echo'            // "Worried about retirement?"
  | 'leading'         // "Don't you think it would be better to...?"
  | 'reflective'      // "What does that mean to you?"
  | 'scaling'         // "On a scale of 1-10, how...?"
  | 'hypothetical'    // "What would happen if...?"
  | 'follow_up';      // "And then what?"

export interface Question {
  type: QuestionType;
  text: string;
  ssml: string;
  purpose: string;
  expectedResponseType: 'detailed' | 'brief' | 'emotional' | 'factual' | 'none';
}

export interface QuestionContext {
  topic?: string;
  userEmotion?: string;
  previousUserStatement?: string;
  conversationDepth?: 'surface' | 'medium' | 'deep';
  personaId?: string;
  intent?: 'explore' | 'understand' | 'guide' | 'connect' | 'close';
}

// ============================================================================
// QUESTION TEMPLATES
// ============================================================================

const QUESTION_TEMPLATES: Record<QuestionType, Array<{
  template: string;
  purposeDescription: string;
  expectedResponse: Question['expectedResponseType'];
  contexts?: string[];
}>> = {
  open_ended: [
    {
      template: "What's your take on {topic}?",
      purposeDescription: 'Invites exploration and personal perspective',
      expectedResponse: 'detailed',
    },
    {
      template: "How do you feel about {topic}?",
      purposeDescription: 'Opens emotional exploration',
      expectedResponse: 'emotional',
    },
    {
      template: "What matters most to you about {topic}?",
      purposeDescription: 'Identifies values and priorities',
      expectedResponse: 'detailed',
    },
    {
      template: "What would success look like for you here?",
      purposeDescription: 'Clarifies goals and vision',
      expectedResponse: 'detailed',
    },
    {
      template: "What's been on your mind about {topic}?",
      purposeDescription: 'Creates space for sharing concerns',
      expectedResponse: 'detailed',
    },
    {
      template: "What brought you to think about this today?",
      purposeDescription: 'Explores motivation and context',
      expectedResponse: 'detailed',
    },
  ],
  clarifying: [
    {
      template: "When you say \"{statement}\", what do you mean exactly?",
      purposeDescription: 'Ensures accurate understanding',
      expectedResponse: 'detailed',
    },
    {
      template: "Help me understand—what do you mean by {topic}?",
      purposeDescription: 'Requests elaboration',
      expectedResponse: 'detailed',
    },
    {
      template: "Can you give me an example of what you're describing?",
      purposeDescription: 'Grounds abstract in concrete',
      expectedResponse: 'detailed',
    },
    {
      template: "What specifically are you referring to?",
      purposeDescription: 'Narrows down ambiguity',
      expectedResponse: 'factual',
    },
    {
      template: "Is that {interpretation}, or something else?",
      purposeDescription: 'Offers interpretation for validation',
      expectedResponse: 'brief',
    },
  ],
  confirming: [
    {
      template: "So what you're saying is {restatement}—is that right?",
      purposeDescription: 'Validates understanding',
      expectedResponse: 'brief',
    },
    {
      template: "Let me make sure I've got this: {restatement}?",
      purposeDescription: 'Confirms accuracy',
      expectedResponse: 'brief',
    },
    {
      template: "Does that sound right to you?",
      purposeDescription: 'Checks alignment',
      expectedResponse: 'brief',
    },
    {
      template: "Am I understanding correctly that {restatement}?",
      purposeDescription: 'Restates for confirmation',
      expectedResponse: 'brief',
    },
    {
      template: "Is that fair to say?",
      purposeDescription: 'Validates summary',
      expectedResponse: 'brief',
    },
  ],
  rhetorical: [
    {
      template: "Isn't that something?",
      purposeDescription: 'Creates connection through shared observation',
      expectedResponse: 'none',
    },
    {
      template: "You know what I mean?",
      purposeDescription: 'Assumes shared understanding',
      expectedResponse: 'none',
    },
    {
      template: "And who could blame you?",
      purposeDescription: 'Validates through implied agreement',
      expectedResponse: 'none',
    },
    {
      template: "What else would you expect?",
      purposeDescription: 'Normalizes experience',
      expectedResponse: 'none',
    },
    {
      template: "Right?",
      purposeDescription: 'Seeks agreement/connection',
      expectedResponse: 'none',
    },
    {
      template: "Makes sense, doesn't it?",
      purposeDescription: 'Validates reasoning',
      expectedResponse: 'none',
    },
  ],
  echo: [
    {
      template: "{keyword}?",
      purposeDescription: 'Prompts elaboration through reflection',
      expectedResponse: 'detailed',
    },
    {
      template: "{emotion_word}?",
      purposeDescription: 'Invites emotional exploration',
      expectedResponse: 'emotional',
    },
    {
      template: "{topic}—tell me more.",
      purposeDescription: 'Echoes topic to prompt expansion',
      expectedResponse: 'detailed',
    },
  ],
  leading: [
    {
      template: "Don't you think {suggestion} would help here?",
      purposeDescription: 'Guides toward specific consideration',
      expectedResponse: 'brief',
    },
    {
      template: "Wouldn't it make sense to {action}?",
      purposeDescription: 'Suggests direction while seeking buy-in',
      expectedResponse: 'brief',
    },
    {
      template: "Have you considered that {perspective}?",
      purposeDescription: 'Introduces new angle',
      expectedResponse: 'detailed',
    },
    {
      template: "What if {alternative} is actually the better path?",
      purposeDescription: 'Challenges current thinking gently',
      expectedResponse: 'detailed',
    },
  ],
  reflective: [
    {
      template: "What does {topic} mean to you personally?",
      purposeDescription: 'Deepens personal connection to topic',
      expectedResponse: 'emotional',
    },
    {
      template: "How does that sit with you?",
      purposeDescription: 'Explores internal reaction',
      expectedResponse: 'emotional',
    },
    {
      template: "What's the deeper thing here, do you think?",
      purposeDescription: 'Invites introspection',
      expectedResponse: 'detailed',
    },
    {
      template: "Where do you think that feeling comes from?",
      purposeDescription: 'Explores emotional roots',
      expectedResponse: 'emotional',
    },
    {
      template: "What would your future self say about this?",
      purposeDescription: 'Creates temporal perspective',
      expectedResponse: 'detailed',
    },
    {
      template: "If you could talk to yourself from five years ago, what would you say?",
      purposeDescription: 'Invites wisdom reflection',
      expectedResponse: 'detailed',
    },
  ],
  scaling: [
    {
      template: "On a scale of 1 to 10, how worried are you about {topic}?",
      purposeDescription: 'Quantifies emotional state',
      expectedResponse: 'factual',
    },
    {
      template: "How confident are you in that, from 1 to 10?",
      purposeDescription: 'Measures certainty',
      expectedResponse: 'factual',
    },
    {
      template: "If 10 is \"completely ready\" and 1 is \"not at all,\" where are you?",
      purposeDescription: 'Assesses readiness',
      expectedResponse: 'factual',
    },
  ],
  hypothetical: [
    {
      template: "What would happen if {scenario}?",
      purposeDescription: 'Explores possibilities',
      expectedResponse: 'detailed',
    },
    {
      template: "Imagine {scenario}—how would you handle it?",
      purposeDescription: 'Tests thinking in new context',
      expectedResponse: 'detailed',
    },
    {
      template: "If you woke up tomorrow and {change}, what would be different?",
      purposeDescription: 'Clarifies desired outcomes',
      expectedResponse: 'detailed',
    },
    {
      template: "What's the worst that could happen? And could you handle it?",
      purposeDescription: 'Stress-tests fears',
      expectedResponse: 'detailed',
    },
    {
      template: "If money weren't a factor, what would you do?",
      purposeDescription: 'Removes constraints to find true preferences',
      expectedResponse: 'detailed',
    },
  ],
  follow_up: [
    {
      template: "And then what?",
      purposeDescription: 'Continues narrative',
      expectedResponse: 'detailed',
    },
    {
      template: "What happened next?",
      purposeDescription: 'Advances story',
      expectedResponse: 'detailed',
    },
    {
      template: "How did that turn out?",
      purposeDescription: 'Seeks resolution',
      expectedResponse: 'detailed',
    },
    {
      template: "What did you do?",
      purposeDescription: 'Explores action taken',
      expectedResponse: 'detailed',
    },
    {
      template: "So...?",
      purposeDescription: 'Minimal prompt for continuation',
      expectedResponse: 'detailed',
    },
  ],
};

// ============================================================================
// PERSONA QUESTION PREFERENCES
// ============================================================================

const PERSONA_QUESTION_STYLES: Record<string, {
  preferredTypes: QuestionType[];
  avoidTypes: QuestionType[];
  customQuestions: Array<{ text: string; type: QuestionType; context?: string }>;
}> = {
  'nayan-patel': {
    preferredTypes: ['open_ended', 'rhetorical', 'leading'],
    avoidTypes: ['scaling'],
    customQuestions: [
      { text: "What's your time horizon here?", type: 'open_ended', context: 'investing' },
      { text: "Are you trying to get rich quick, or build wealth slowly?", type: 'leading' },
      { text: "Can you afford to lose this money?", type: 'clarifying', context: 'risk' },
      { text: "What would you do if the market dropped 40% tomorrow?", type: 'hypothetical' },
    ],
  },
  'ferni': {
    preferredTypes: ['reflective', 'open_ended', 'echo'],
    avoidTypes: ['leading', 'scaling'],
    customQuestions: [
      { text: "What's underneath that feeling?", type: 'reflective' },
      { text: "Where do you feel that in your body?", type: 'reflective' },
      { text: "What story are you telling yourself about this?", type: 'reflective' },
      { text: "What would compassion say here?", type: 'hypothetical' },
    ],
  },
  'peter-john': {
    preferredTypes: ['clarifying', 'hypothetical', 'open_ended'],
    avoidTypes: ['echo'],
    customQuestions: [
      { text: "Do you know what you own, and why you own it?", type: 'confirming' },
      { text: "What does this company actually do?", type: 'clarifying' },
      { text: "Have you visited the store? Talked to customers?", type: 'clarifying' },
      { text: "Is this a company you'd be happy to own for 10 years?", type: 'hypothetical' },
    ],
  },
  'maya-santos': {
    preferredTypes: ['open_ended', 'scaling', 'confirming'],
    avoidTypes: ['rhetorical'],
    customQuestions: [
      { text: "What's your 'why' behind this goal?", type: 'reflective' },
      { text: "How does this align with your values?", type: 'reflective' },
      { text: "What's one small step you could take today?", type: 'open_ended' },
      { text: "What would progress look like for you?", type: 'open_ended' },
    ],
  },
  'alex-chen': {
    preferredTypes: ['clarifying', 'confirming', 'follow_up'],
    avoidTypes: ['reflective'],
    customQuestions: [
      { text: "What's the deadline for this?", type: 'clarifying' },
      { text: "Who else needs to be involved?", type: 'clarifying' },
      { text: "What's the priority here?", type: 'clarifying' },
      { text: "Is there anything blocking you right now?", type: 'open_ended' },
    ],
  },
  'jordan-taylor': {
    preferredTypes: ['open_ended', 'hypothetical', 'echo'],
    avoidTypes: ['scaling'],
    customQuestions: [
      { text: "What's the vibe you're going for?", type: 'open_ended' },
      { text: "What would make this unforgettable?", type: 'hypothetical' },
      { text: "How do you want people to feel?", type: 'reflective' },
      { text: "What's the one thing we absolutely can't skip?", type: 'clarifying' },
    ],
  },
};

// ============================================================================
// QUESTION GENERATOR
// ============================================================================

export class QuestionPatternEngine {
  private recentQuestionTypes: QuestionType[] = [];
  private recentQuestions: string[] = [];

  constructor() {
    getLogger().debug('QuestionPatternEngine initialized');
  }

  /**
   * Generate a question appropriate for the context
   */
  generateQuestion(context: QuestionContext): Question {
    const type = this.selectQuestionType(context);
    const question = this.buildQuestion(type, context);

    // Track to avoid repetition
    this.recentQuestionTypes.push(type);
    if (this.recentQuestionTypes.length > 5) {
      this.recentQuestionTypes.shift();
    }

    this.recentQuestions.push(question.text);
    if (this.recentQuestions.length > 10) {
      this.recentQuestions.shift();
    }

    return question;
  }

  /**
   * Generate an echo question from user's statement
   */
  generateEchoQuestion(userStatement: string): Question {
    // Extract key word or phrase to echo
    const keywords = this.extractKeywords(userStatement);

    if (keywords.length === 0) {
      return {
        type: 'echo',
        text: 'Tell me more.',
        ssml: '<break time="100ms"/>Tell me more.',
        purpose: 'Prompts continuation',
        expectedResponseType: 'detailed',
      };
    }

    const keyword = keywords[0];
    const variations = [
      `${keyword}?`,
      `${keyword}—what do you mean?`,
      `${keyword}... how so?`,
    ];

    const text = variations[Math.floor(Math.random() * variations.length)];

    return {
      type: 'echo',
      text,
      ssml: `<break time="100ms"/>${text}`,
      purpose: 'Echoes to prompt elaboration',
      expectedResponseType: 'detailed',
    };
  }

  /**
   * Generate a follow-up question based on response type needed
   */
  generateFollowUp(
    intent: 'deepen' | 'clarify' | 'move_on' | 'validate',
    context: QuestionContext
  ): Question {
    const typeMap: Record<string, QuestionType> = {
      deepen: 'reflective',
      clarify: 'clarifying',
      move_on: 'open_ended',
      validate: 'confirming',
    };

    return this.generateQuestion({
      ...context,
      intent: intent === 'move_on' ? 'explore' : 'understand',
    });
  }

  /**
   * Get a quick conversational question tag
   * These are short additions like "right?" or "you know?"
   */
  getQuestionTag(): string {
    const tags = [
      ', right?',
      ', you know?',
      ", don't you think?",
      ', makes sense?',
      '—does that resonate?',
      '—what do you think?',
    ];
    return tags[Math.floor(Math.random() * tags.length)];
  }

  /**
   * Check if a question type would be appropriate given recent history
   */
  isTypeAppropriate(type: QuestionType): boolean {
    // Don't repeat the same type back to back
    if (this.recentQuestionTypes[this.recentQuestionTypes.length - 1] === type) {
      return false;
    }

    // Don't use scaling questions too often
    if (type === 'scaling') {
      const recentScaling = this.recentQuestionTypes.filter(t => t === 'scaling').length;
      if (recentScaling > 0) return false;
    }

    return true;
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.recentQuestionTypes = [];
    this.recentQuestions = [];
    getLogger().debug('QuestionPatternEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private selectQuestionType(context: QuestionContext): QuestionType {
    // Get persona preferences
    const personaStyle = context.personaId
      ? PERSONA_QUESTION_STYLES[context.personaId]
      : null;

    // Build candidate types
    let candidates: QuestionType[] = [];

    // Intent-based selection
    switch (context.intent) {
      case 'explore':
        candidates = ['open_ended', 'hypothetical', 'reflective'];
        break;
      case 'understand':
        candidates = ['clarifying', 'confirming', 'echo'];
        break;
      case 'guide':
        candidates = ['leading', 'hypothetical', 'scaling'];
        break;
      case 'connect':
        candidates = ['rhetorical', 'reflective', 'echo'];
        break;
      case 'close':
        candidates = ['confirming', 'follow_up'];
        break;
      default:
        candidates = ['open_ended', 'clarifying', 'follow_up', 'reflective'];
    }

    // Adjust based on conversation depth
    if (context.conversationDepth === 'deep') {
      candidates = candidates.filter(t => ['reflective', 'hypothetical', 'open_ended'].includes(t));
    } else if (context.conversationDepth === 'surface') {
      candidates = candidates.filter(t => ['clarifying', 'confirming', 'follow_up'].includes(t));
    }

    // Filter by persona preferences
    if (personaStyle) {
      candidates = candidates.filter(t => !personaStyle.avoidTypes.includes(t));
      // Boost preferred types
      for (const preferred of personaStyle.preferredTypes) {
        if (candidates.includes(preferred)) {
          candidates.push(preferred); // Doubles the chance
        }
      }
    }

    // Filter out recent types
    candidates = candidates.filter(t => this.isTypeAppropriate(t));

    // Fallback
    if (candidates.length === 0) {
      candidates = ['open_ended', 'follow_up'];
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private buildQuestion(type: QuestionType, context: QuestionContext): Question {
    // Check for persona-specific custom question first
    const personaStyle = context.personaId
      ? PERSONA_QUESTION_STYLES[context.personaId]
      : null;

    if (personaStyle && Math.random() < 0.3) {
      const customs = personaStyle.customQuestions.filter(q => q.type === type);
      if (customs.length > 0) {
        const custom = customs[Math.floor(Math.random() * customs.length)];
        return {
          type,
          text: custom.text,
          ssml: `<break time="100ms"/>${custom.text}`,
          purpose: 'Persona-specific question',
          expectedResponseType: this.getExpectedResponse(type),
        };
      }
    }

    // Use template
    const templates = QUESTION_TEMPLATES[type];
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Fill in template variables
    let text = template.template;
    text = text.replace('{topic}', context.topic || 'this');
    text = text.replace('{statement}', context.previousUserStatement || 'that');
    text = text.replace('{keyword}', context.topic || 'That');
    text = text.replace('{emotion_word}', context.userEmotion || 'feeling');

    // Avoid questions we've asked recently
    if (this.recentQuestions.includes(text)) {
      // Try another template
      const altTemplate = templates.find(t => !this.recentQuestions.includes(t.template));
      if (altTemplate) {
        text = altTemplate.template
          .replace('{topic}', context.topic || 'this')
          .replace('{statement}', context.previousUserStatement || 'that');
      }
    }

    return {
      type,
      text,
      ssml: `<break time="100ms"/>${text}`,
      purpose: template.purposeDescription,
      expectedResponseType: template.expectedResponse,
    };
  }

  private getExpectedResponse(type: QuestionType): Question['expectedResponseType'] {
    const map: Record<QuestionType, Question['expectedResponseType']> = {
      open_ended: 'detailed',
      clarifying: 'detailed',
      confirming: 'brief',
      rhetorical: 'none',
      echo: 'detailed',
      leading: 'brief',
      reflective: 'emotional',
      scaling: 'factual',
      hypothetical: 'detailed',
      follow_up: 'detailed',
    };
    return map[type];
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const words = text.split(/\s+/);
    const stopWords = new Set([
      'i', 'me', 'my', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'and', 'but', 'or', 'so', 'just', 'really', 'very', 'that', 'this',
    ]);

    return words
      .filter(w => w.length > 3)
      .filter(w => !stopWords.has(w.toLowerCase()))
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => w.length > 0)
      .slice(0, 3);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: QuestionPatternEngine | null = null;

export function getQuestionPatternEngine(): QuestionPatternEngine {
  if (!instance) {
    instance = new QuestionPatternEngine();
  }
  return instance;
}

export function resetQuestionPatternEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default QuestionPatternEngine;

