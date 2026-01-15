/**
 * Clarifying Questions
 *
 * Generates clarifying questions for deeper understanding.
 *
 * @module conversation/active-listening/clarification
 */

import { getContentWithFallback, type ContentContext } from '../../services/llm/llm-dynamic-content.js';
import { seededIndex } from '../utils/rng.js';

import type { ClarifyingQuestion } from './types.js';

// ============================================================================
// CLARIFYING QUESTIONS
// ============================================================================

const CLARIFYING_QUESTIONS: Record<
  ClarifyingQuestion['type'],
  Array<{ q: string; ssml: string }>
> = {
  understanding: [
    {
      q: 'Let me make sure I understand...',
      ssml: '<break time="100ms"/>Let me make sure I understand...',
    },
    {
      q: "So what you're saying is...",
      ssml: '<break time="100ms"/>So what you\'re saying is...',
    },
    { q: 'Do you mean...', ssml: 'Do you mean...' },
    { q: 'Help me understand—', ssml: 'Help me understand—' },
  ],
  elaboration: [
    { q: 'Can you tell me more about that?', ssml: 'Can you tell me more about that?' },
    { q: 'What do you mean by that?', ssml: 'What do you mean by that?' },
    { q: 'How so?', ssml: '<break time="100ms"/>How so?' },
    {
      q: "What's behind that thought?",
      ssml: '<break time="100ms"/>What\'s behind that thought?',
    },
    { q: 'Say more about that.', ssml: 'Say more about that.' },
  ],
  confirmation: [
    { q: 'Is that right?', ssml: 'Is that right?' },
    { q: 'Did I get that right?', ssml: 'Did I get that right?' },
    {
      q: "Does that match what you're thinking?",
      ssml: "Does that match what you're thinking?",
    },
    { q: 'Am I understanding correctly?', ssml: 'Am I understanding correctly?' },
  ],
  emotion: [
    {
      q: 'How does that make you feel?',
      ssml: '<break time="150ms"/>How does that make you feel?',
    },
    {
      q: "What's the emotion behind that?",
      ssml: '<break time="100ms"/>What\'s the emotion behind that?',
    },
    { q: 'How are you feeling about all this?', ssml: 'How are you feeling about all this?' },
    { q: "What's your gut saying?", ssml: '<break time="100ms"/>What\'s your gut saying?' },
  ],
};

/**
 * Generate a clarifying question
 */
export function generateClarifyingQuestion(
  type: ClarifyingQuestion['type'],
  context?: { topic?: string; previousStatement?: string }
): ClarifyingQuestion {
  // Try LLM-generated clarification first (from cache)
  const llmContext: ContentContext = {
    contentType: 'clarification',
    topic: context?.topic,
    userMessage: context?.previousStatement,
    metadata: {
      clarificationType: type,
      wantsUnderstanding: type === 'understanding',
      wantsElaboration: type === 'elaboration',
    },
  };

  const llmContent = getContentWithFallback(llmContext);
  if (llmContent.source === 'llm' && llmContent.content) {
    return {
      question: llmContent.content,
      ssml: llmContent.ssml || `<break time="100ms"/>${llmContent.content}`,
      type,
    };
  }

  // Fallback to templates
  const options = CLARIFYING_QUESTIONS[type];
  const seed = `clarify:${type}:${context?.topic ?? ''}:${context?.previousStatement ?? ''}`;
  const selected = options[seededIndex(seed, options.length)] ?? options[0];

  return {
    question: selected.q,
    ssml: selected.ssml,
    type,
  };
}
