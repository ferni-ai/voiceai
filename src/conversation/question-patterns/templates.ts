/**
 * Question Templates
 *
 * Templates for different question types.
 * Each type serves different conversational purposes.
 *
 * @module @ferni/conversation/question-patterns/templates
 */

import type { QuestionTemplate, QuestionType } from './types.js';

export const QUESTION_TEMPLATES: Record<QuestionType, QuestionTemplate[]> = {
  open_ended: [
    {
      template: "What's your take on {topic}?",
      purposeDescription: 'Invites exploration and personal perspective',
      expectedResponse: 'detailed',
    },
    {
      template: 'How do you feel about {topic}?',
      purposeDescription: 'Opens emotional exploration',
      expectedResponse: 'emotional',
    },
    {
      template: 'What matters most to you about {topic}?',
      purposeDescription: 'Identifies values and priorities',
      expectedResponse: 'detailed',
    },
    {
      template: 'What would success look like for you here?',
      purposeDescription: 'Clarifies goals and vision',
      expectedResponse: 'detailed',
    },
    {
      template: "What's been on your mind about {topic}?",
      purposeDescription: 'Creates space for sharing concerns',
      expectedResponse: 'detailed',
    },
    {
      template: 'What brought you to think about this today?',
      purposeDescription: 'Explores motivation and context',
      expectedResponse: 'detailed',
    },
  ],
  clarifying: [
    {
      template: 'When you say "{statement}", what do you mean exactly?',
      purposeDescription: 'Ensures accurate understanding',
      expectedResponse: 'detailed',
    },
    {
      template: 'Help me understand—what do you mean by {topic}?',
      purposeDescription: 'Requests elaboration',
      expectedResponse: 'detailed',
    },
    {
      template: "Can you give me an example of what you're describing?",
      purposeDescription: 'Grounds abstract in concrete',
      expectedResponse: 'detailed',
    },
    {
      template: 'What specifically are you referring to?',
      purposeDescription: 'Narrows down ambiguity',
      expectedResponse: 'factual',
    },
    {
      template: 'Is that {interpretation}, or something else?',
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
      template: 'Does that sound right to you?',
      purposeDescription: 'Checks alignment',
      expectedResponse: 'brief',
    },
    {
      template: 'Am I understanding correctly that {restatement}?',
      purposeDescription: 'Restates for confirmation',
      expectedResponse: 'brief',
    },
    {
      template: 'Is that fair to say?',
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
      template: 'You know what I mean?',
      purposeDescription: 'Assumes shared understanding',
      expectedResponse: 'none',
    },
    {
      template: 'And who could blame you?',
      purposeDescription: 'Validates through implied agreement',
      expectedResponse: 'none',
    },
    {
      template: 'What else would you expect?',
      purposeDescription: 'Normalizes experience',
      expectedResponse: 'none',
    },
    {
      template: 'Right?',
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
      template: '{keyword}?',
      purposeDescription: 'Prompts elaboration through reflection',
      expectedResponse: 'detailed',
    },
    {
      template: '{emotion_word}?',
      purposeDescription: 'Invites emotional exploration',
      expectedResponse: 'emotional',
    },
    {
      template: '{topic}—tell me more.',
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
      template: 'Have you considered that {perspective}?',
      purposeDescription: 'Introduces new angle',
      expectedResponse: 'detailed',
    },
    {
      template: 'What if {alternative} is actually the better path?',
      purposeDescription: 'Challenges current thinking gently',
      expectedResponse: 'detailed',
    },
  ],
  reflective: [
    {
      template: 'What does {topic} mean to you personally?',
      purposeDescription: 'Deepens personal connection to topic',
      expectedResponse: 'emotional',
    },
    {
      template: 'How does that sit with you?',
      purposeDescription: 'Explores internal reaction',
      expectedResponse: 'emotional',
    },
    {
      template: "What's the deeper thing here, do you think?",
      purposeDescription: 'Invites introspection',
      expectedResponse: 'detailed',
    },
    {
      template: 'Where do you think that feeling comes from?',
      purposeDescription: 'Explores emotional roots',
      expectedResponse: 'emotional',
    },
    {
      template: 'What would your future self say about this?',
      purposeDescription: 'Creates temporal perspective',
      expectedResponse: 'detailed',
    },
    {
      template: 'If you could talk to yourself from five years ago, what would you say?',
      purposeDescription: 'Invites wisdom reflection',
      expectedResponse: 'detailed',
    },
  ],
  scaling: [
    {
      template: 'On a scale of 1 to 10, how worried are you about {topic}?',
      purposeDescription: 'Quantifies emotional state',
      expectedResponse: 'factual',
    },
    {
      template: 'How confident are you in that, from 1 to 10?',
      purposeDescription: 'Measures certainty',
      expectedResponse: 'factual',
    },
    {
      template: 'If 10 is "completely ready" and 1 is "not at all," where are you?',
      purposeDescription: 'Assesses readiness',
      expectedResponse: 'factual',
    },
  ],
  hypothetical: [
    {
      template: 'What would happen if {scenario}?',
      purposeDescription: 'Explores possibilities',
      expectedResponse: 'detailed',
    },
    {
      template: 'Imagine {scenario}—how would you handle it?',
      purposeDescription: 'Tests thinking in new context',
      expectedResponse: 'detailed',
    },
    {
      template: 'If you woke up tomorrow and {change}, what would be different?',
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
      template: 'And then what?',
      purposeDescription: 'Continues narrative',
      expectedResponse: 'detailed',
    },
    {
      template: 'What happened next?',
      purposeDescription: 'Advances story',
      expectedResponse: 'detailed',
    },
    {
      template: 'How did that turn out?',
      purposeDescription: 'Seeks resolution',
      expectedResponse: 'detailed',
    },
    {
      template: 'What did you do?',
      purposeDescription: 'Explores action taken',
      expectedResponse: 'detailed',
    },
    {
      template: 'So...?',
      purposeDescription: 'Minimal prompt for continuation',
      expectedResponse: 'detailed',
    },
  ],
};
