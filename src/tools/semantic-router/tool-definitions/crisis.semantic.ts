/**
 * Crisis Tool Definitions for Semantic Router
 *
 * SAFETY-CRITICAL: Routes urgent mental health and crisis queries
 * to appropriate support resources and personas.
 *
 * @module tools/semantic-router/tool-definitions/crisis
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CRISIS SUPPORT - IMMEDIATE HELP
// ============================================================================

export const crisisSupportTool: SemanticToolDefinition = {
  id: 'crisis_support',
  name: 'Crisis Support',
  description: 'Provide immediate crisis support resources and compassionate response.',
  shortDescription: 'get crisis help',
  category: 'crisis',
  priority: 100, // SAFETY-CRITICAL: Always prioritize crisis detection

  triggers: {
    phrases: [
      "i'm in crisis",
      'i need help',
      'i want to hurt myself',
      'i want to die',
      "i can't go on",
      "i don't want to live",
      'thinking about suicide',
      'suicidal thoughts',
      'end my life',
      'kill myself',
      "i'm not okay",
      'i need someone',
      'emergency',
      'urgent help',
    ],
    patterns: [
      /^i(?:'m| am)?\s+(?:in\s+)?(?:a\s+)?crisis/i,
      /^i\s+(?:want|need)\s+to\s+(?:hurt|harm)\s+(?:myself|me)/i,
      /^i\s+(?:want|wish)\s+(?:i\s+was|to\s+be)\s+dead/i,
      /^(?:thinking|thought)\s+(?:about|of)\s+(?:suicide|ending|killing)/i,
      /^i\s+(?:can(?:'t|not)|don(?:'t| not))\s+(?:go\s+on|take\s+it|handle)/i,
      /^(?:i\s+)?need\s+(?:help|someone)\s+(?:right\s+)?now/i,
      /^(?:i(?:'m| am)?\s+)?(?:not\s+)?(?:okay|ok|alright)/i,
    ],
    keywords: [
      { word: 'crisis', weight: 1.0 },
      { word: 'suicide', weight: 1.0 },
      { word: 'suicidal', weight: 1.0 },
      { word: 'hurt myself', weight: 1.0 },
      { word: 'kill myself', weight: 1.0 },
      { word: 'die', weight: 0.8 },
      { word: 'dead', weight: 0.8 },
      { word: 'emergency', weight: 0.9 },
      { word: 'urgent', weight: 0.7 },
      { word: "can't go on", weight: 0.9 },
      { word: 'end it', weight: 0.9 },
      { word: 'harm', weight: 0.8 },
    ],
    antiKeywords: [], // Never deprioritize crisis signals
  },

  examples: [
    "I'm in crisis right now",
    "I'm having suicidal thoughts",
    'I need help immediately',
    "I don't want to live anymore",
    "I can't take it anymore",
    'I want to hurt myself',
    "I'm not okay",
    'I need someone to talk to urgently',
  ],

  counterExamples: ["I'm feeling a bit down", 'Having a rough day', 'Work is stressful'],

  arguments: [
    {
      name: 'urgencyLevel',
      type: 'string',
      description: 'Detected urgency level',
      required: false,
      enumValues: ['immediate', 'high', 'moderate'],
    },
  ],

  confidence: {
    baseScore: 0.95, // High base score - prioritize safety
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.0,
    negativeKeywordPenalty: 0.0, // Never penalize
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'crisisSupport',
      args: { urgencyLevel: 'immediate', ...args },
      delegateTo: 'domains/crisis',
    };
  },
};

// ============================================================================
// SAFETY PLANNING
// ============================================================================

export const safetyPlanningTool: SemanticToolDefinition = {
  id: 'safety_planning',
  name: 'Safety Planning',
  description: 'Help create or review a safety plan for difficult moments.',
  shortDescription: 'safety planning help',
  category: 'crisis',

  triggers: {
    phrases: [
      'safety plan',
      'crisis plan',
      'what to do when',
      'coping strategies',
      'when i feel overwhelmed',
      'emergency contacts',
      'warning signs',
    ],
    patterns: [
      /^(?:help\s+(?:me\s+)?)?(?:create|make|build)\s+(?:a\s+)?safety\s+plan/i,
      /^(?:what|who)\s+(?:should|can)\s+i\s+(?:do|call)\s+(?:when|if)/i,
      /^(?:i\s+need|help\s+with)\s+(?:a\s+)?(?:safety|crisis|coping)\s+plan/i,
    ],
    keywords: [
      { word: 'safety plan', weight: 1.0 },
      { word: 'crisis plan', weight: 0.9 },
      { word: 'coping', weight: 0.7 },
      { word: 'emergency contacts', weight: 0.8 },
      { word: 'warning signs', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Help me create a safety plan',
    'What should I do when I feel overwhelmed?',
    'I need to set up emergency contacts',
    'What are my warning signs?',
    'Review my crisis plan with me',
  ],

  counterExamples: ['Plan my weekend', 'Safety features in cars'],

  arguments: [
    {
      name: 'planType',
      type: 'string',
      description: 'Type of safety planning needed',
      required: false,
      enumValues: ['create', 'review', 'update'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'safetyPlanning',
      args,
      delegateTo: 'domains/crisis',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const crisisTools: SemanticToolDefinition[] = [crisisSupportTool, safetyPlanningTool];
