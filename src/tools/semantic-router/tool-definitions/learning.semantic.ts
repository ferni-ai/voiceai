/**
 * Learning Tool Definitions for Semantic Router
 *
 * Routes education and learning queries - explain concepts, study help, languages.
 *
 * @module tools/semantic-router/tool-definitions/learning
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// EXPLAIN CONCEPT
// ============================================================================

export const explainConceptTool: SemanticToolDefinition = {
  id: 'learning_explain',
  name: 'Explain Concept',
  description: 'Explain concepts, topics, or ideas in simple terms.',
  shortDescription: 'explain something',
  category: 'learning',

  triggers: {
    phrases: [
      'explain',
      'what is',
      "what's",
      'tell me about',
      'how does',
      'why does',
      'can you explain',
      'teach me about',
    ],
    patterns: [
      /^(?:explain|describe)\s+(?:to\s+me\s+)?(?:what\s+)?(.+)/i,
      /^what\s+(?:is|are|was|were)\s+(.+)/i,
      /^how\s+does\s+(.+)\s+work/i,
      /^why\s+(?:does|do|is|are)\s+(.+)/i,
      /^(?:teach|tell)\s+me\s+(?:about\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'explain', weight: 1.0 },
      { word: 'what is', weight: 0.9 },
      { word: 'how does', weight: 0.9 },
      { word: 'why', weight: 0.6 },
      { word: 'teach', weight: 0.8 },
      { word: 'learn', weight: 0.7 },
    ],
    antiKeywords: ['weather', 'time', 'calendar', 'play', 'remind'],
  },

  examples: [
    'Explain quantum physics',
    'What is machine learning?',
    'How does the stock market work?',
    'Why is the sky blue?',
    'Teach me about philosophy',
    'Tell me about the Renaissance',
  ],

  counterExamples: ["What's the weather?", "What's on my calendar?", "What's the time?"],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'Topic to explain',
      required: false,
      extractionPatterns: [
        /explain\s+(?:to\s+me\s+)?(.+?)$/i,
        /what\s+is\s+(?:a\s+)?(.+?)$/i,
        /teach\s+me\s+(?:about\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'level',
      type: 'string',
      description: 'Explanation depth',
      required: false,
      enumValues: ['simple', 'intermediate', 'detailed'],
      extractionPatterns: [
        /(?:explain\s+)?(?:in\s+)?(simple|basic|detailed|advanced)\s+terms?/i,
        /(?:like\s+i(?:'m| am))\s+(\d+)/i, // "explain like I'm 5"
      ],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'explainConcept',
      args,
      delegateTo: 'domains/learning',
    };
  },
};

// ============================================================================
// LANGUAGE LEARNING
// ============================================================================

export const languageLearningTool: SemanticToolDefinition = {
  id: 'learning_language',
  name: 'Language Learning',
  description: 'Help with language learning - translations, practice, vocabulary.',
  shortDescription: 'learn a language',
  category: 'learning',

  triggers: {
    phrases: [
      'translate',
      'how do you say',
      'learn spanish',
      'practice french',
      'what does this mean',
      'language practice',
      'vocabulary',
    ],
    patterns: [
      /^(?:translate|how\s+(?:do\s+you|to)\s+say)\s+(.+)/i,
      /^(?:help\s+me\s+)?(?:learn|practice|study)\s+(?:my\s+)?(?:spanish|french|german|italian|japanese|chinese|korean)/i,
      /^what\s+does\s+["\']?(.+?)["\']?\s+mean\s+(?:in\s+\w+)?/i,
      /^(?:practice|quiz\s+me\s+on)\s+(?:my\s+)?vocabulary/i,
    ],
    keywords: [
      { word: 'translate', weight: 1.0 },
      { word: 'translation', weight: 1.0 },
      { word: 'language', weight: 0.9 },
      { word: 'spanish', weight: 0.9 },
      { word: 'french', weight: 0.9 },
      { word: 'vocabulary', weight: 0.8 },
    ],
    antiKeywords: ['programming language', 'code'],
  },

  examples: [
    'Translate hello to Spanish',
    'How do you say thank you in French?',
    'Help me practice my German',
    'What does bonjour mean?',
    'Teach me Japanese phrases',
    'Quiz me on Spanish vocabulary',
  ],

  counterExamples: ['Programming language', 'What language is this code?'],

  arguments: [
    {
      name: 'language',
      type: 'string',
      description: 'Target language',
      required: false,
      enumValues: [
        'spanish',
        'french',
        'german',
        'italian',
        'japanese',
        'chinese',
        'korean',
        'portuguese',
      ],
      extractionPatterns: [
        /(?:in|to)\s+(spanish|french|german|italian|japanese|chinese|korean|portuguese)/i,
        /(?:learn|practice|study)\s+(?:my\s+)?(spanish|french|german|italian|japanese|chinese|korean)/i,
      ],
    },
    {
      name: 'phrase',
      type: 'string',
      description: 'Phrase to translate or learn',
      required: false,
      extractionPatterns: [
        /(?:translate|say)\s+["\']?(.+?)["\']?\s+(?:to|in)/i,
        /how\s+do\s+you\s+say\s+["\']?(.+?)["\']?/i,
      ],
    },
    {
      name: 'mode',
      type: 'string',
      description: 'Learning mode',
      required: false,
      enumValues: ['translate', 'practice', 'quiz', 'conversation'],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'languageLearning',
      args,
      delegateTo: 'domains/learning',
    };
  },
};

// ============================================================================
// STUDY HELP
// ============================================================================

export const studyHelpTool: SemanticToolDefinition = {
  id: 'learning_study',
  name: 'Study Help',
  description: 'Help with studying - flashcards, quizzes, exam prep.',
  shortDescription: 'study help',
  category: 'learning',

  triggers: {
    phrases: [
      'help me study',
      'quiz me',
      'flashcards',
      'test me',
      'exam prep',
      'study session',
      'review material',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:study|prepare)\s+(?:for\s+)?(.+)/i,
      /^(?:quiz|test)\s+me\s+(?:on\s+)?(.+)/i,
      /^(?:create|make|do)\s+(?:some\s+)?flashcards/i,
      /^(?:review|go\s+over)\s+(?:the\s+)?(?:material|chapter|notes)/i,
    ],
    keywords: [
      { word: 'study', weight: 1.0 },
      { word: 'quiz', weight: 0.9 },
      { word: 'exam', weight: 0.9 },
      { word: 'test', weight: 0.8 },
      { word: 'flashcards', weight: 1.0 },
      { word: 'review', weight: 0.7 },
    ],
    antiKeywords: ['blood test', 'covid test'],
  },

  examples: [
    'Help me study for my history exam',
    'Quiz me on biology',
    'Create flashcards for vocabulary',
    'Test me on the capitals',
    'Study session for chemistry',
    'Review the material with me',
  ],

  counterExamples: ['Get a blood test', 'Covid test results'],

  arguments: [
    {
      name: 'subject',
      type: 'string',
      description: 'Subject to study',
      required: false,
      extractionPatterns: [
        /(?:study|quiz\s+me\s+on|test\s+me\s+on)\s+(?:my\s+)?(.+?)(?:\s+exam)?$/i,
      ],
    },
    {
      name: 'mode',
      type: 'string',
      description: 'Study mode',
      required: false,
      enumValues: ['quiz', 'flashcards', 'review', 'explain'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'studyHelp',
      args,
      delegateTo: 'domains/learning',
    };
  },
};

// ============================================================================
// SKILL DEVELOPMENT
// ============================================================================

export const skillDevelopmentTool: SemanticToolDefinition = {
  id: 'learning_skills',
  name: 'Skill Development',
  description: 'Help with learning new skills - resources, roadmaps, practice.',
  shortDescription: 'learn new skills',
  category: 'learning',

  triggers: {
    phrases: [
      'learn to',
      'how to',
      'teach me',
      'want to learn',
      'learn coding',
      'learn guitar',
      'learn photography',
      'skill development',
    ],
    patterns: [
      /^(?:i\s+want\s+to|help\s+me)\s+learn\s+(?:how\s+to\s+)?(.+)/i,
      /^how\s+(?:do|can)\s+i\s+learn\s+(?:to\s+)?(.+)/i,
      /^teach\s+me\s+(?:how\s+)?(?:to\s+)?(.+)/i,
      /^(?:resources|roadmap)\s+(?:for|to)\s+(?:learning\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'learn', weight: 1.0 },
      { word: 'skill', weight: 0.9 },
      { word: 'teach', weight: 0.8 },
      { word: 'how to', weight: 0.7 },
      { word: 'resources', weight: 0.6 },
      { word: 'roadmap', weight: 0.7 },
    ],
    antiKeywords: ['learn about', 'learn what'],
  },

  examples: [
    'I want to learn coding',
    'How do I learn guitar?',
    'Teach me photography',
    'Resources for learning Python',
    'Roadmap to learn web development',
    'Help me learn to draw',
  ],

  counterExamples: [
    'Learn about history', // This is explain concept
    'What should I learn?',
  ],

  arguments: [
    {
      name: 'skill',
      type: 'string',
      description: 'Skill to learn',
      required: false,
      extractionPatterns: [
        /learn\s+(?:how\s+to\s+)?(.+?)$/i,
        /teach\s+me\s+(?:how\s+to\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'approach',
      type: 'string',
      description: 'Learning approach',
      required: false,
      enumValues: ['resources', 'roadmap', 'practice', 'basics'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'skillDevelopment',
      args,
      delegateTo: 'domains/learning',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const learningTools: SemanticToolDefinition[] = [
  explainConceptTool,
  languageLearningTool,
  studyHelpTool,
  skillDevelopmentTool,
];
