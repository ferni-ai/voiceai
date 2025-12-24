/**
 * Legal & Administrative Semantic Routing
 *
 * Routes for document organization, estate planning, insurance, and
 * annual administrative tasks. Helps users stay on top of important paperwork.
 *
 * Routes to: domains/legal-admin
 * Tools: organizeDocuments, locateDocument, promptEstatePlanning,
 *        reviewBeneficiaries, reviewInsuranceCoverage, prepareForTaxSeason,
 *        reminderAnnualTasks
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DOCUMENT ORGANIZATION
// ============================================================================

export const organizeDocumentsTool: SemanticToolDefinition = {
  id: 'legal_organize_docs',
  name: 'Organize Documents',
  description: 'Help organize important documents.',
  shortDescription: 'organize documents',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'organize my documents',
      'important papers',
      'filing system',
      'where to keep documents',
      'document organization',
      'paperwork pile',
      'sort through documents',
      'file important papers',
    ],
    patterns: [
      /\borganize\s+(my\s+)?(documents|paperwork|papers)\b/i,
      /\bfiling\s+system\b/i,
      /\bwhere\s+to\s+keep\s+(important\s+)?(documents|papers)\b/i,
      /\bsort\s+through\s+(my\s+)?(documents|paperwork)\b/i,
    ],
    keywords: [
      { word: 'documents', weight: 1.0 },
      { word: 'filing', weight: 0.9 },
      { word: 'organize', weight: 0.9 },
      { word: 'paperwork', weight: 0.9 },
      { word: 'papers', weight: 0.85 },
      { word: 'records', weight: 0.8 },
    ],
    antiKeywords: ['google docs', 'word document', 'document camera'],
  },

  examples: [
    'I need to organize my important documents',
    'Help me set up a filing system',
    'Where should I keep important papers?',
  ],

  counterExamples: ['Create a Google Doc'],

  arguments: [
    { name: 'documentTypes', type: 'string', required: false, description: 'Types of documents' },
    { name: 'currentSystem', type: 'string', required: false, description: 'Current organization' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'organizeDocuments',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// LOCATE DOCUMENT
// ============================================================================

export const locateDocumentTool: SemanticToolDefinition = {
  id: 'legal_locate_doc',
  name: 'Locate Document',
  description: 'Help locate specific important documents.',
  shortDescription: 'find document',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      "where's my birth certificate",
      "can't find my passport",
      'find my social security card',
      'locate my deed',
      'where did I put my will',
      "can't find the title",
      'need my marriage certificate',
    ],
    patterns: [
      /\bwhere's\s+(my\s+)?(birth\s+certificate|passport|social\s+security)\b/i,
      /\b(can't|cannot)\s+find\s+(my\s+)?(passport|deed|title|will)\b/i,
      /\blocate\s+(my\s+)?(documents?|papers?)\b/i,
      /\bneed\s+(my\s+)?(birth|marriage|death)\s+certificate\b/i,
    ],
    keywords: [
      { word: 'find', weight: 0.9 },
      { word: 'locate', weight: 0.95 },
      { word: 'where', weight: 0.8 },
      { word: 'certificate', weight: 0.9 },
      { word: 'passport', weight: 0.95 },
      { word: 'deed', weight: 0.9 },
      { word: 'title', weight: 0.85 },
      { word: 'will', weight: 0.85 },
    ],
    antiKeywords: ['find a file', 'locate a restaurant'],
  },

  examples: [
    "I can't find my passport",
    'Where is my birth certificate?',
    'I need to locate my deed to the house',
  ],

  counterExamples: ["Can't find the file on my computer"],

  arguments: [
    { name: 'document', type: 'string', required: false, description: 'Which document' },
    { name: 'urgency', type: 'string', required: false, description: 'Why needed' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'locateDocument',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// ESTATE PLANNING
// ============================================================================

export const promptEstatePlanningTool: SemanticToolDefinition = {
  id: 'legal_estate_planning',
  name: 'Prompt Estate Planning',
  description: 'Guide estate planning conversations.',
  shortDescription: 'estate planning',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      'make a will',
      'estate planning',
      'need a trust',
      'power of attorney',
      'living will',
      'healthcare directive',
      'what happens when I die',
      'leave something to my kids',
      'inheritance planning',
    ],
    patterns: [
      /\b(make|create|write)\s+(a\s+)?will\b/i,
      /\bestate\s+planning\b/i,
      /\b(need|set\s+up)\s+(a\s+)?trust\b/i,
      /\bpower\s+of\s+attorney\b/i,
      /\b(living\s+will|healthcare\s+directive)\b/i,
    ],
    keywords: [
      { word: 'will', weight: 0.9 },
      { word: 'trust', weight: 0.95 },
      { word: 'estate', weight: 1.0 },
      { word: 'inheritance', weight: 0.9 },
      { word: 'power of attorney', weight: 0.95 },
      { word: 'directive', weight: 0.85 },
    ],
    antiKeywords: ['free will', 'will power', 'strong will'],
  },

  examples: [
    'I should probably make a will',
    'Help me with estate planning',
    'Do I need a living trust?',
  ],

  counterExamples: ['I will do it tomorrow', 'I have strong will power'],

  arguments: [
    { name: 'assets', type: 'string', required: false, description: 'Types of assets' },
    { name: 'familySituation', type: 'string', required: false, description: 'Family structure' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'promptEstatePlanning',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// BENEFICIARY REVIEW
// ============================================================================

export const reviewBeneficiariesTool: SemanticToolDefinition = {
  id: 'legal_beneficiaries',
  name: 'Review Beneficiaries',
  description: 'Remind to review beneficiary designations.',
  shortDescription: 'review beneficiaries',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'update my beneficiaries',
      'who is my beneficiary',
      '401k beneficiary',
      'life insurance beneficiary',
      'change beneficiary',
      'beneficiary designation',
      'ex still beneficiary',
      'add beneficiary',
    ],
    patterns: [
      /\b(update|change|review)\s+(my\s+)?beneficiar(y|ies)\b/i,
      /\bwho\s+is\s+(my\s+)?beneficiary\b/i,
      /\b(401k|IRA|life\s+insurance)\s+beneficiary\b/i,
      /\bex\s+(still|is)\s+(my\s+)?beneficiary\b/i,
    ],
    keywords: [
      { word: 'beneficiary', weight: 1.0 },
      { word: 'beneficiaries', weight: 1.0 },
      { word: 'designation', weight: 0.85 },
      { word: '401k', weight: 0.9 },
      { word: 'IRA', weight: 0.9 },
      { word: 'life insurance', weight: 0.9 },
    ],
    antiKeywords: ['benefit', 'beneficial'],
  },

  examples: [
    'I need to update my beneficiaries',
    'My ex is still my 401k beneficiary',
    'How do I change my life insurance beneficiary?',
  ],

  counterExamples: ['This would be beneficial for me'],

  arguments: [
    { name: 'accountType', type: 'string', required: false, description: 'Type of account' },
    { name: 'reason', type: 'string', required: false, description: 'Why updating' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'reviewBeneficiaries',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// INSURANCE COVERAGE REVIEW
// ============================================================================

export const reviewInsuranceCoverageTool: SemanticToolDefinition = {
  id: 'legal_insurance',
  name: 'Review Insurance Coverage',
  description: 'Help review and understand insurance coverage.',
  shortDescription: 'insurance review',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'review my insurance',
      'am I underinsured',
      'do I have enough insurance',
      'life insurance amount',
      'insurance coverage check',
      'homeowners insurance',
      'umbrella policy',
      'insurance needs',
    ],
    patterns: [
      /\breview\s+(my\s+)?insurance\b/i,
      /\bam\s+I\s+(under|over)insured\b/i,
      /\bdo\s+I\s+have\s+enough\s+insurance\b/i,
      /\b(life|home|auto|umbrella)\s+insurance\s+(coverage|needs)\b/i,
    ],
    keywords: [
      { word: 'insurance', weight: 1.0 },
      { word: 'coverage', weight: 0.95 },
      { word: 'policy', weight: 0.85 },
      { word: 'underinsured', weight: 0.9 },
      { word: 'premium', weight: 0.8 },
      { word: 'umbrella', weight: 0.85 },
    ],
    antiKeywords: ['health insurance', 'car insurance claim'],
  },

  examples: [
    'Should I review my insurance coverage?',
    'Do I have enough life insurance?',
    'What is an umbrella policy?',
  ],

  counterExamples: ['File a car insurance claim'],

  arguments: [
    { name: 'insuranceType', type: 'string', required: false, description: 'Type of insurance' },
    { name: 'lifeChanges', type: 'string', required: false, description: 'Recent changes' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'reviewInsuranceCoverage',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// TAX SEASON PREPARATION
// ============================================================================

export const prepareForTaxSeasonTool: SemanticToolDefinition = {
  id: 'legal_tax_prep',
  name: 'Prepare for Tax Season',
  description: 'Help prepare for tax season.',
  shortDescription: 'tax prep',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'prepare for taxes',
      'tax season',
      'gather tax documents',
      'tax preparation checklist',
      'what do I need for taxes',
      'organize for taxes',
      'deductions to track',
      'tax filing',
    ],
    patterns: [
      /\b(prepare|get\s+ready)\s+for\s+taxes\b/i,
      /\btax\s+(season|preparation|filing)\b/i,
      /\bgather\s+tax\s+documents\b/i,
      /\bwhat\s+(do\s+)?I\s+need\s+for\s+taxes\b/i,
    ],
    keywords: [
      { word: 'taxes', weight: 1.0 },
      { word: 'tax', weight: 0.95 },
      { word: 'deductions', weight: 0.9 },
      { word: 'W-2', weight: 0.9 },
      { word: '1099', weight: 0.9 },
      { word: 'filing', weight: 0.85 },
      { word: 'preparation', weight: 0.85 },
    ],
    antiKeywords: ['income tax question', 'tax advice'],
  },

  examples: [
    'Help me prepare for tax season',
    'What documents do I need for taxes?',
    'Tax preparation checklist please',
  ],

  counterExamples: ['Give me tax advice on capital gains'],

  arguments: [
    {
      name: 'filingType',
      type: 'string',
      required: false,
      description: 'Single/married/self-employed',
    },
    { name: 'timeline', type: 'string', required: false, description: 'When filing' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'prepareForTaxSeason',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// ANNUAL TASK REMINDERS
// ============================================================================

export const reminderAnnualTasksTool: SemanticToolDefinition = {
  id: 'legal_annual_tasks',
  name: 'Reminder Annual Tasks',
  description: 'Remind about annual administrative tasks.',
  shortDescription: 'annual tasks',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'annual tasks',
      'yearly to-dos',
      'annual review checklist',
      'things to do every year',
      'annual financial checkup',
      'yearly admin tasks',
      'end of year tasks',
      'beginning of year tasks',
    ],
    patterns: [
      /\b(annual|yearly)\s+(tasks|to-dos|checklist)\b/i,
      /\bthings\s+to\s+do\s+every\s+year\b/i,
      /\b(annual|yearly)\s+(financial\s+)?checkup\b/i,
      /\b(end|beginning)\s+of\s+year\s+tasks\b/i,
    ],
    keywords: [
      { word: 'annual', weight: 1.0 },
      { word: 'yearly', weight: 0.95 },
      { word: 'every year', weight: 0.9 },
      { word: 'checkup', weight: 0.85 },
      { word: 'review', weight: 0.8 },
      { word: 'tasks', weight: 0.75 },
    ],
    antiKeywords: ['annual report', 'annual meeting'],
  },

  examples: [
    'What annual tasks should I remember?',
    'Yearly financial checkup reminder',
    'Things to do at the end of every year',
  ],

  counterExamples: ['Read the company annual report'],

  arguments: [
    { name: 'timeOfYear', type: 'string', required: false, description: 'When in the year' },
    { name: 'domain', type: 'string', required: false, description: 'Financial, home, health' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/legal-admin',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'reminderAnnualTasks',
      args,
      delegateTo: 'domains/legal-admin',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const legalAdminTools: SemanticToolDefinition[] = [
  organizeDocumentsTool,
  locateDocumentTool,
  promptEstatePlanningTool,
  reviewBeneficiariesTool,
  reviewInsuranceCoverageTool,
  prepareForTaxSeasonTool,
  reminderAnnualTasksTool,
];
