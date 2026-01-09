/**
 * Question Pattern Types
 *
 * Types for diverse question generation in natural conversation.
 *
 * @module @ferni/conversation/question-patterns/types
 */

export type QuestionType =
  | 'open_ended' // "What do you think about...?"
  | 'clarifying' // "When you say X, do you mean...?"
  | 'confirming' // "So you're saying...?"
  | 'rhetorical' // "Isn't that something?" (no real answer expected)
  | 'echo' // "Worried about retirement?"
  | 'leading' // "Don't you think it would be better to...?"
  | 'reflective' // "What does that mean to you?"
  | 'scaling' // "On a scale of 1-10, how...?"
  | 'hypothetical' // "What would happen if...?"
  | 'follow_up'; // "And then what?"

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
  /**
   * Optional seed for deterministic selection. If omitted, selection falls back
   * to process randomness (legacy behavior).
   */
  randomSeed?: string;
}

export interface QuestionTemplate {
  template: string;
  purposeDescription: string;
  expectedResponse: Question['expectedResponseType'];
  contexts?: string[];
}

export interface PersonaCustomQuestion {
  text: string;
  type: QuestionType;
  context?: string;
}

export interface PersonaQuestionStyle {
  preferredTypes: QuestionType[];
  avoidTypes: QuestionType[];
  customQuestions: PersonaCustomQuestion[];
}
