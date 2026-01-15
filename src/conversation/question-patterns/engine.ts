/**
 * Question Pattern Engine
 *
 * Generates contextually appropriate questions for natural conversation.
 *
 * @module @ferni/conversation/question-patterns/engine
 */

import {
  generateContent,
  getContentWithFallback,
  type ContentContext,
} from '../../services/llm-dynamic-content.js';
import { createLogger } from '../../utils/safe-logger.js';
import { seededChance, seededPick } from '../utils/rng.js';

import type { Question, QuestionContext, QuestionType } from './types.js';
import { QUESTION_TEMPLATES } from './templates.js';
import { PERSONA_QUESTION_STYLES } from './persona-styles.js';

const log = createLogger({ module: 'QuestionPatternEngine' });

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'i',
  'me',
  'my',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'and',
  'but',
  'or',
  'so',
  'just',
  'really',
  'very',
  'that',
  'this',
]);

export class QuestionPatternEngine {
  private recentQuestionTypes: QuestionType[] = [];
  private recentQuestions: string[] = [];

  constructor() {
    log.debug('QuestionPatternEngine initialized');
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
    const variations = [`${keyword}?`, `${keyword}—what do you mean?`, `${keyword}... how so?`];

    const seed = `echo:${userStatement}:${keyword}`;
    const text = seededPick(seed, variations) ?? variations[0];

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
    return this.generateQuestion({
      ...context,
      intent: intent === 'move_on' ? 'explore' : 'understand',
    });
  }

  /**
   * Get a quick conversational question tag
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
    return seededPick('question-tag', tags) ?? tags[0];
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
      const recentScaling = this.recentQuestionTypes.filter((t) => t === 'scaling').length;
      if (recentScaling > 0) return false;
    }

    return true;
  }

  /**
   * Generate a question asynchronously with LLM
   */
  async generateQuestionAsync(context: QuestionContext): Promise<Question | null> {
    const type = this.selectQuestionType(context);

    const llmContext: ContentContext = {
      contentType: 'question_followup',
      personaId: context.personaId,
      emotion: context.userEmotion,
      topic: context.topic,
      userMessage: context.previousUserStatement,
      metadata: {
        questionType: type,
        conversationDepth: context.conversationDepth,
        intent: context.intent,
      },
    };

    const llmContent = await generateContent(llmContext);
    if (llmContent && llmContent.content) {
      const text = llmContent.content;
      this.recentQuestions.push(text);

      log.debug({ source: 'llm-async', type }, '❓ Generated async LLM question');
      return {
        type,
        text,
        ssml: llmContent.ssml || `<break time="100ms"/>${text}`,
        purpose: 'LLM-generated contextual question',
        expectedResponseType: this.getExpectedResponse(type),
      };
    }

    return this.generateQuestion(context);
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.recentQuestionTypes = [];
    this.recentQuestions = [];
    log.debug('QuestionPatternEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private selectQuestionType(context: QuestionContext): QuestionType {
    const personaStyle = context.personaId ? PERSONA_QUESTION_STYLES[context.personaId] : null;

    // Build candidate types based on intent
    let candidates: QuestionType[] = [];

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
      candidates = candidates.filter((t) =>
        ['reflective', 'hypothetical', 'open_ended'].includes(t)
      );
    } else if (context.conversationDepth === 'surface') {
      candidates = candidates.filter((t) => ['clarifying', 'confirming', 'follow_up'].includes(t));
    }

    // Filter by persona preferences
    if (personaStyle) {
      candidates = candidates.filter((t) => !personaStyle.avoidTypes.includes(t));
      // Boost preferred types
      for (const preferred of personaStyle.preferredTypes) {
        if (candidates.includes(preferred)) {
          candidates.push(preferred);
        }
      }
    }

    // Filter out recent types
    candidates = candidates.filter((t) => this.isTypeAppropriate(t));

    // Fallback
    if (candidates.length === 0) {
      candidates = ['open_ended', 'follow_up'];
    }

    const baseSeed =
      context.randomSeed ??
      `qtype:${context.personaId ?? 'unknown'}:${context.intent ?? 'default'}:${context.conversationDepth ?? 'medium'}:${context.topic ?? ''}:${context.previousUserStatement ?? ''}`;
    return (seededPick(`${baseSeed}:pick`, candidates) ?? candidates[0]) as QuestionType;
  }

  private buildQuestion(type: QuestionType, context: QuestionContext): Question {
    const personaStyle = context.personaId ? PERSONA_QUESTION_STYLES[context.personaId] : null;

    const baseSeed =
      context.randomSeed ??
      `qbuild:${context.personaId ?? 'unknown'}:${type}:${context.conversationDepth ?? 'medium'}:${context.topic ?? ''}:${context.previousUserStatement ?? ''}`;

    // Try LLM-generated question first
    const llmContext: ContentContext = {
      contentType: 'question_followup',
      personaId: context.personaId,
      emotion: context.userEmotion,
      topic: context.topic,
      userMessage: context.previousUserStatement,
      metadata: {
        questionType: type,
        conversationDepth: context.conversationDepth,
        intent: context.intent,
      },
    };

    const llmContent = getContentWithFallback(llmContext);
    if (llmContent.source === 'llm' && llmContent.content) {
      const text = llmContent.content;
      if (!this.recentQuestions.includes(text)) {
        log.debug({ source: 'llm', type }, '❓ Using LLM-generated question');
        return {
          type,
          text,
          ssml: llmContent.ssml || `<break time="100ms"/>${text}`,
          purpose: 'LLM-generated contextual question',
          expectedResponseType: this.getExpectedResponse(type),
        };
      }
    }

    // Try persona-specific custom question
    if (personaStyle && seededChance(`${baseSeed}:persona-custom`, 0.3)) {
      const customs = personaStyle.customQuestions.filter((q) => q.type === type);
      if (customs.length > 0) {
        const custom = seededPick(`${baseSeed}:custom`, customs) ?? customs[0];
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
    const template = seededPick(`${baseSeed}:template`, templates) ?? templates[0];

    // Fill in template variables
    let text = template.template;
    text = text.replace('{topic}', context.topic || 'this');
    text = text.replace('{statement}', context.previousUserStatement || 'that');
    text = text.replace('{keyword}', context.topic || 'That');
    text = text.replace('{emotion_word}', context.userEmotion || 'feeling');

    // Avoid questions we've asked recently
    if (this.recentQuestions.includes(text)) {
      const altTemplate = templates.find((t) => !this.recentQuestions.includes(t.template));
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
    const words = text.split(/\s+/);
    return words
      .filter((w) => w.length > 3)
      .filter((w) => !STOP_WORDS.has(w.toLowerCase()))
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter((w) => w.length > 0)
      .slice(0, 3);
  }
}

export default QuestionPatternEngine;
