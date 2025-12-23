/**
 * Career Tool Definitions for Semantic Router
 *
 * Routes career development, job search, and professional growth queries.
 *
 * @module tools/semantic-router/tool-definitions/career
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// JOB SEARCH
// ============================================================================

export const jobSearchTool: SemanticToolDefinition = {
  id: 'career_job_search',
  name: 'Job Search',
  description: 'Help with finding jobs, applications, and job market insights.',
  shortDescription: 'job search help',
  category: 'career',

  triggers: {
    phrases: [
      'looking for a job',
      'job hunting',
      'find a job',
      'job search',
      'apply for jobs',
      'job openings',
      'new job',
      'career change',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:looking|searching)\s+for\s+(?:a\s+)?(?:new\s+)?job/i,
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?job\s+(?:search|hunt)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:find|get)\s+(?:a\s+)?(?:new\s+)?job/i,
      /^(?:i\s+want|i\s+need)\s+(?:to\s+)?(?:find|get)\s+(?:a\s+)?(?:new\s+)?job/i,
    ],
    keywords: [
      { word: 'job', weight: 1.0 },
      { word: 'career', weight: 0.9 },
      { word: 'employment', weight: 0.9 },
      { word: 'hiring', weight: 0.8 },
      { word: 'position', weight: 0.7 },
      { word: 'apply', weight: 0.7 },
      { word: 'openings', weight: 0.8 },
    ],
    antiKeywords: ['quit', 'resign', 'fired'],
  },

  examples: [
    "I'm looking for a new job",
    'Help me with my job search',
    'How do I find jobs in tech?',
    'Job hunting tips',
    "I want to change careers",
    'Where should I apply?',
  ],

  counterExamples: [
    'I want to quit my job',
    'I got fired',
    'How do I resign?',
  ],

  arguments: [
    {
      name: 'field',
      type: 'string',
      description: 'Career field or industry',
      required: false,
      extractionPatterns: [
        /job\s+(?:in|for)\s+(.+?)$/i,
        /(?:career\s+in|field\s+of)\s+(.+?)$/i,
      ],
    },
    {
      name: 'level',
      type: 'string',
      description: 'Career level',
      required: false,
      enumValues: ['entry', 'mid', 'senior', 'executive'],
      extractionPatterns: [
        /(entry[\s-]level|junior|mid[\s-]level|senior|executive|manager)/i,
      ],
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
      toolId: 'jobSearch',
      args,
      delegateTo: 'domains/career',
    };
  },
};

// ============================================================================
// INTERVIEW PREP
// ============================================================================

export const interviewPrepTool: SemanticToolDefinition = {
  id: 'career_interview',
  name: 'Interview Prep',
  description: 'Help prepare for job interviews with practice and tips.',
  shortDescription: 'interview prep',
  category: 'career',

  triggers: {
    phrases: [
      'interview prep',
      'prepare for interview',
      'interview questions',
      'practice interview',
      'mock interview',
      'interview coming up',
      'interview tips',
      'behavioral interview',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:prepare|prep)\s+(?:for\s+)?(?:my\s+)?(?:an?\s+)?interview/i,
      /^(?:i\s+have|got)\s+(?:an?\s+)?interview\s+(?:coming\s+up|soon|tomorrow)/i,
      /^(?:practice|mock)\s+interview/i,
      /^(?:what|common)\s+interview\s+questions/i,
    ],
    keywords: [
      { word: 'interview', weight: 1.0 },
      { word: 'prep', weight: 0.7 },
      { word: 'practice', weight: 0.7 },
      { word: 'questions', weight: 0.5 },
      { word: 'behavioral', weight: 0.8 },
      { word: 'technical', weight: 0.7 },
    ],
    antiKeywords: ['podcast interview', 'news interview'],
  },

  examples: [
    'Help me prepare for my interview',
    "I have an interview tomorrow",
    'Practice behavioral questions with me',
    'Common interview questions',
    'Mock interview please',
    'Interview tips for Google',
  ],

  counterExamples: [
    'Watch an interview',
    'Podcast interview',
    'News interview',
  ],

  arguments: [
    {
      name: 'company',
      type: 'string',
      description: 'Company interviewing with',
      required: false,
      extractionPatterns: [
        /interview\s+(?:at|with|for)\s+(.+?)$/i,
      ],
    },
    {
      name: 'interviewType',
      type: 'string',
      description: 'Type of interview',
      required: false,
      enumValues: ['behavioral', 'technical', 'case', 'phone', 'panel'],
      extractionPatterns: [
        /(behavioral|technical|case\s+study|phone|panel)\s+interview/i,
      ],
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
      toolId: 'interviewPrep',
      args,
      delegateTo: 'domains/career',
    };
  },
};

// ============================================================================
// RESUME / CV HELP
// ============================================================================

export const resumeHelpTool: SemanticToolDefinition = {
  id: 'career_resume',
  name: 'Resume Help',
  description: 'Help with resume writing, review, and optimization.',
  shortDescription: 'resume help',
  category: 'career',

  triggers: {
    phrases: [
      'help with resume',
      'review my resume',
      'resume tips',
      'improve my cv',
      'write my resume',
      'resume advice',
      'update my resume',
    ],
    patterns: [
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?(?:resume|cv)/i,
      /^(?:review|improve|update|fix)\s+(?:my\s+)?(?:resume|cv)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:improve|write|update)\s+(?:my\s+)?(?:resume|cv)/i,
      /^(?:resume|cv)\s+(?:tips|advice|help)/i,
    ],
    keywords: [
      { word: 'resume', weight: 1.0 },
      { word: 'cv', weight: 1.0 },
      { word: 'curriculum vitae', weight: 1.0 },
      { word: 'cover letter', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Help me with my resume',
    'Review my CV',
    'Resume writing tips',
    'How do I improve my resume?',
    'Update my resume for tech jobs',
    'Cover letter help',
  ],

  counterExamples: [
    'Resume a video',
    'Resume playback',
  ],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'What to do with the resume',
      required: false,
      enumValues: ['review', 'write', 'improve', 'tailor'],
    },
    {
      name: 'targetRole',
      type: 'string',
      description: 'Target role or industry',
      required: false,
      extractionPatterns: [
        /(?:for|targeting)\s+(.+?)(?:\s+jobs?|\s+roles?|$)/i,
      ],
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
      toolId: 'resumeHelp',
      args,
      delegateTo: 'domains/career',
    };
  },
};

// ============================================================================
// CAREER DEVELOPMENT
// ============================================================================

export const careerDevelopmentTool: SemanticToolDefinition = {
  id: 'career_development',
  name: 'Career Development',
  description: 'Help with career growth, skills development, and professional goals.',
  shortDescription: 'career development',
  category: 'career',

  triggers: {
    phrases: [
      'career advice',
      'career path',
      'grow my career',
      'next steps in my career',
      'career goals',
      'professional development',
      'skill development',
      'get promoted',
    ],
    patterns: [
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?career\s+(?:growth|development|path)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:grow|advance|develop)\s+(?:my\s+)?career/i,
      /^(?:what|where)\s+(?:should|can)\s+(?:my\s+)?(?:career|i)\s+(?:go|do)\s+(?:next|from\s+here)/i,
      /^(?:i\s+want\s+to)\s+(?:get\s+)?promoted/i,
    ],
    keywords: [
      { word: 'career', weight: 0.9 },
      { word: 'promotion', weight: 0.9 },
      { word: 'growth', weight: 0.7 },
      { word: 'development', weight: 0.7 },
      { word: 'skills', weight: 0.6 },
      { word: 'advance', weight: 0.7 },
      { word: 'goals', weight: 0.5 },
    ],
    antiKeywords: ['job search', 'new job', 'quit'],
  },

  examples: [
    'Career advice for software engineers',
    'How do I grow my career?',
    'What skills should I develop?',
    'I want to get promoted',
    "What's the next step in my career?",
    'Professional development tips',
  ],

  counterExamples: [
    'Find a new job',
    'I want to quit',
    'Job search help',
  ],

  arguments: [
    {
      name: 'currentRole',
      type: 'string',
      description: 'Current job or role',
      required: false,
      extractionPatterns: [
        /(?:i(?:'m| am)\s+(?:a|an))\s+(.+?)$/i,
        /(?:as\s+(?:a|an))\s+(.+?)$/i,
      ],
    },
    {
      name: 'focus',
      type: 'string',
      description: 'Development focus area',
      required: false,
      enumValues: ['skills', 'promotion', 'leadership', 'pivot', 'general'],
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
      toolId: 'careerDevelopment',
      args,
      delegateTo: 'domains/career',
    };
  },
};

// ============================================================================
// WORKPLACE CHALLENGES
// ============================================================================

export const workplaceChallengesTool: SemanticToolDefinition = {
  id: 'career_workplace',
  name: 'Workplace Challenges',
  description: 'Help with workplace issues, difficult colleagues, and work stress.',
  shortDescription: 'workplace help',
  category: 'career',

  triggers: {
    phrases: [
      'problem at work',
      'difficult coworker',
      'toxic workplace',
      'work stress',
      'boss is difficult',
      'workplace conflict',
      "hate my job",
      'burnout at work',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+(?:a|been))\s+(?:having\s+)?(?:problems?|issues?)\s+(?:at|with)\s+work/i,
      /^(?:my\s+)?(?:boss|coworker|colleague|manager)\s+is\s+(?:difficult|toxic|mean)/i,
      /^(?:i(?:'m| am)?|feeling)\s+(?:stressed|burned\s+out|overwhelmed)\s+(?:at|from)\s+work/i,
      /^(?:i\s+)?(?:hate|don't\s+like)\s+my\s+(?:job|work)/i,
    ],
    keywords: [
      { word: 'workplace', weight: 0.9 },
      { word: 'coworker', weight: 0.8 },
      { word: 'boss', weight: 0.8 },
      { word: 'toxic', weight: 0.8 },
      { word: 'stress', weight: 0.6 },
      { word: 'burnout', weight: 0.9 },
      { word: 'conflict', weight: 0.7 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm having problems at work",
    'My boss is micromanaging me',
    'Dealing with a difficult coworker',
    "I'm burned out from work",
    'Workplace conflict advice',
    'I hate my job but need it',
  ],

  counterExamples: [
    'Find a new job',
    'Help with resume',
  ],

  arguments: [
    {
      name: 'issueType',
      type: 'string',
      description: 'Type of workplace issue',
      required: false,
      enumValues: ['conflict', 'stress', 'management', 'culture', 'burnout'],
    },
    {
      name: 'withWhom',
      type: 'string',
      description: 'Who the issue is with',
      required: false,
      extractionPatterns: [
        /(?:with\s+(?:my\s+)?)(boss|coworker|colleague|manager|team)/i,
      ],
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
      toolId: 'workplaceChallenges',
      args,
      delegateTo: 'domains/career',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const careerTools: SemanticToolDefinition[] = [
  jobSearchTool,
  interviewPrepTool,
  resumeHelpTool,
  careerDevelopmentTool,
  workplaceChallengesTool,
];
