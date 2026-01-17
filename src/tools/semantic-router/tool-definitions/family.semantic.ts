/**
 * Family Semantic Routing
 *
 * Routes for parenting, family dynamics, elder care, and family traditions.
 * Supports users through the full spectrum of family life challenges and joys.
 *
 * Routes to: domains/family
 * Tools: coachParentingChallenge, navigateDiscipline, suggestAgeAppropriateActivity,
 *        trackChildMilestone, celebrateFamilyMoment, supportFamilyTransition,
 *        navigateFamilyConflict, planFamilyMeeting, coordinateElderCare,
 *        createFamilyTradition, discussValues
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// PARENTING CHALLENGE COACHING
// ============================================================================

export const coachParentingChallengeTool: SemanticToolDefinition = {
  id: 'family_parenting_challenge',
  name: 'Coach Parenting Challenge',
  description: 'Provide coaching for parenting challenges.',
  shortDescription: 'parenting help',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      "my kid won't",
      "my child won't",
      'struggling with my kids',
      "I don't know how to parent",
      'parenting is so hard',
      'what do I do with my teenager',
      "my son won't listen",
      "my daughter won't",
      'toddler tantrums',
      'kids are driving me crazy',
    ],
    patterns: [
      /\bmy\s+(kid|child|son|daughter|toddler|teen)\s+(won't|doesn't|refuses)\b/i,
      /\bstruggling\s+(with|as)\s+(a\s+)?parent\b/i,
      /\bparenting\s+(is\s+)?(so\s+)?(hard|difficult|exhausting)\b/i,
      /\bwhat\s+do\s+I\s+do\s+with\s+my\s+(kid|child|teen)\b/i,
    ],
    keywords: [
      { word: 'parenting', weight: 1.0 },
      { word: 'kids', weight: 0.9 },
      { word: 'children', weight: 0.9 },
      { word: 'tantrum', weight: 0.85 },
      { word: 'teenager', weight: 0.85 },
      { word: 'toddler', weight: 0.85 },
      { word: 'discipline', weight: 0.8 },
    ],
    antiKeywords: ['pet', 'dog', 'cat', 'plant'],
  },

  examples: [
    "My toddler won't stop having tantrums",
    "I'm struggling with my teenager",
    'What do I do when my kid refuses to listen?',
  ],

  counterExamples: ["My dog won't listen to commands"],

  arguments: [
    { name: 'childAge', type: 'string', required: false, description: 'Age of child' },
    { name: 'challenge', type: 'string', required: false, description: 'The specific challenge' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'coachParentingChallenge',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// DISCIPLINE NAVIGATION
// ============================================================================

export const navigateDisciplineTool: SemanticToolDefinition = {
  id: 'family_discipline',
  name: 'Navigate Discipline',
  description: 'Help navigate discipline approaches.',
  shortDescription: 'discipline guidance',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'how do I discipline',
      'should I punish',
      'consequences for my child',
      'time out not working',
      'grounding my teenager',
      'taking away privileges',
      'natural consequences',
      'positive discipline',
    ],
    patterns: [
      /\bhow\s+(do|should)\s+I\s+discipline\b/i,
      /\bshould\s+I\s+(punish|ground)\b/i,
      /\b(time\s+out|grounding)\s+(isn't|not)\s+working\b/i,
      /\bconsequences\s+for\s+(my\s+)?(child|kid|teen)\b/i,
    ],
    keywords: [
      { word: 'discipline', weight: 1.0 },
      { word: 'punish', weight: 0.9 },
      { word: 'consequences', weight: 0.9 },
      { word: 'time out', weight: 0.85 },
      { word: 'grounding', weight: 0.85 },
      { word: 'boundaries', weight: 0.8 },
    ],
    antiKeywords: ['self-discipline', 'work discipline'],
  },

  examples: [
    'How should I discipline my 5 year old?',
    'Time outs are not working anymore',
    'What consequences should I give for lying?',
  ],

  counterExamples: ['I need more self-discipline'],

  arguments: [
    { name: 'behavior', type: 'string', required: false, description: 'Behavior to address' },
    {
      name: 'currentApproach',
      type: 'string',
      required: false,
      description: 'What they have tried',
    },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'navigateDiscipline',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// AGE-APPROPRIATE ACTIVITIES
// ============================================================================

export const suggestAgeAppropriateActivityTool: SemanticToolDefinition = {
  id: 'family_activities',
  name: 'Suggest Age-Appropriate Activity',
  description: 'Suggest activities appropriate for child age.',
  shortDescription: 'kid activities',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'activities for my kid',
      'what can I do with my toddler',
      'games for a 5 year old',
      'keep my kids entertained',
      'rainy day activities',
      'family activities this weekend',
      'educational activities',
      'fun things to do with kids',
    ],
    patterns: [
      /\bactivities\s+for\s+(my\s+)?(kid|child|toddler|baby)\b/i,
      /\bwhat\s+can\s+I\s+do\s+with\s+(my\s+)?\d+\s+year\s+old\b/i,
      /\bgames\s+for\s+(a\s+)?\d+\s+year\s+old\b/i,
      /\bkeep\s+(my\s+)?kids?\s+entertained\b/i,
    ],
    keywords: [
      { word: 'activities', weight: 1.0 },
      { word: 'games', weight: 0.9 },
      { word: 'play', weight: 0.85 },
      { word: 'entertain', weight: 0.85 },
      { word: 'fun', weight: 0.8 },
      { word: 'educational', weight: 0.8 },
      { word: 'kids', weight: 0.9 },
    ],
    antiKeywords: ['adult activities', 'dating activities'],
  },

  examples: [
    'What activities can I do with my 3 year old?',
    'Need some rainy day activities for kids',
    'Games for a 10 year old birthday party',
  ],

  counterExamples: ['Fun activities for my date night'],

  arguments: [
    { name: 'age', type: 'string', required: false, description: 'Child age' },
    { name: 'context', type: 'string', required: false, description: 'Indoor/outdoor, occasion' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'suggestAgeAppropriateActivity',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// CHILD MILESTONE TRACKING
// ============================================================================

export const trackChildMilestoneTool: SemanticToolDefinition = {
  id: 'family_milestones',
  name: 'Track Child Milestone',
  description: 'Track and celebrate child developmental milestones.',
  shortDescription: 'child milestones',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'first steps',
      'first words',
      'baby milestone',
      'when should my baby',
      "my child isn't crawling",
      'developmental milestone',
      'is my child behind',
      'track my baby development',
    ],
    patterns: [
      /\b(first\s+)?(steps|words|tooth|crawl)\b/i,
      /\bbaby\s+milestone\b/i,
      /\bwhen\s+should\s+(my\s+)?(baby|child)\b/i,
      /\b(child|baby)\s+(isn't|not)\s+(crawling|walking|talking)\b/i,
    ],
    keywords: [
      { word: 'milestone', weight: 1.0 },
      { word: 'development', weight: 0.9 },
      { word: 'first', weight: 0.8 },
      { word: 'crawling', weight: 0.85 },
      { word: 'walking', weight: 0.85 },
      { word: 'talking', weight: 0.85 },
      { word: 'baby', weight: 0.9 },
    ],
    antiKeywords: ['career milestone', 'project milestone'],
  },

  examples: [
    'My baby just took their first steps!',
    'When should my child start talking?',
    "I'm worried my baby isn't crawling yet",
  ],

  counterExamples: ['We hit a major project milestone'],

  arguments: [
    { name: 'milestone', type: 'string', required: false, description: 'The milestone' },
    { name: 'childAge', type: 'string', required: false, description: 'Child age' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'trackChildMilestone',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// FAMILY MOMENT CELEBRATION
// ============================================================================

export const celebrateFamilyMomentTool: SemanticToolDefinition = {
  id: 'family_celebrate',
  name: 'Celebrate Family Moment',
  description: 'Celebrate special family moments and achievements.',
  shortDescription: 'celebrate family',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      "my kid's graduation",
      'family achievement',
      'celebrate with family',
      'proud of my child',
      'my son made the team',
      'my daughter got into college',
      'family celebration',
      'big family news',
    ],
    patterns: [
      /\b(proud\s+of|celebrate)\s+(my\s+)?(kid|child|son|daughter|family)\b/i,
      /\bmy\s+(son|daughter|child)\s+(made|got|won|achieved)\b/i,
      /\bfamily\s+(achievement|celebration|news)\b/i,
    ],
    keywords: [
      { word: 'celebrate', weight: 1.0 },
      { word: 'proud', weight: 0.95 },
      { word: 'achievement', weight: 0.9 },
      { word: 'graduation', weight: 0.9 },
      { word: 'family', weight: 0.85 },
      { word: 'won', weight: 0.8 },
    ],
    antiKeywords: ['work achievement', 'personal achievement'],
  },

  examples: [
    'My daughter got into her dream college!',
    "I'm so proud of my son, he made the varsity team",
    'Want to celebrate this family milestone',
  ],

  counterExamples: ['Celebrate my work promotion'],

  arguments: [
    { name: 'achievement', type: 'string', required: false, description: 'What to celebrate' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'celebrateFamilyMoment',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// FAMILY TRANSITION SUPPORT
// ============================================================================

export const supportFamilyTransitionTool: SemanticToolDefinition = {
  id: 'family_transition',
  name: 'Support Family Transition',
  description: 'Support family through major transitions.',
  shortDescription: 'family transition help',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      'new baby coming',
      'expecting another child',
      'kid going to college',
      'empty nest',
      'moving with kids',
      'divorce affecting kids',
      'blending families',
      'becoming a stepparent',
      'adopting a child',
    ],
    patterns: [
      /\b(new\s+)?baby\s+(coming|on the way)\b/i,
      /\b(kid|child)\s+going\s+to\s+college\b/i,
      /\bempty\s+nest\b/i,
      /\bblending\s+families\b/i,
      /\bdivorce\s+affecting\s+(the\s+)?kids\b/i,
    ],
    keywords: [
      { word: 'transition', weight: 1.0 },
      { word: 'new baby', weight: 0.95 },
      { word: 'empty nest', weight: 0.95 },
      { word: 'blending', weight: 0.9 },
      { word: 'stepparent', weight: 0.9 },
      { word: 'adoption', weight: 0.9 },
      { word: 'moving', weight: 0.8 },
    ],
    antiKeywords: ['career transition', 'job transition'],
  },

  examples: [
    "We're expecting another baby, how do I prepare the older kids?",
    'My last child is going to college, feeling empty nest syndrome',
    'How do I help kids adjust to the divorce?',
  ],

  counterExamples: ["I'm going through a career transition"],

  arguments: [
    { name: 'transition', type: 'string', required: false, description: 'Type of transition' },
    { name: 'concerns', type: 'string', required: false, description: 'Main concerns' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'supportFamilyTransition',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// FAMILY CONFLICT NAVIGATION
// ============================================================================

export const navigateFamilyConflictTool: SemanticToolDefinition = {
  id: 'family_conflict',
  name: 'Navigate Family Conflict',
  description: 'Help navigate conflicts within the family.',
  shortDescription: 'family conflict help',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      'fighting with my parents',
      'siblings always fighting',
      'family drama',
      'my in-laws',
      "don't get along with my family",
      'family conflict',
      'toxic family member',
      'cut off family',
      'family not speaking',
    ],
    patterns: [
      /\bfighting\s+with\s+(my\s+)?(parents|siblings|in-laws|family)\b/i,
      /\bfamily\s+(drama|conflict|tension)\b/i,
      /\btoxic\s+(family|parent|sibling)\b/i,
      /\bcut\s+off\s+(my\s+)?family\b/i,
    ],
    keywords: [
      { word: 'conflict', weight: 1.0 },
      { word: 'fighting', weight: 0.95 },
      { word: 'drama', weight: 0.9 },
      { word: 'toxic', weight: 0.9 },
      { word: 'in-laws', weight: 0.85 },
      { word: 'estranged', weight: 0.85 },
      { word: 'not speaking', weight: 0.85 },
    ],
    antiKeywords: ['work conflict', 'friend conflict'],
  },

  examples: [
    'My siblings are always fighting',
    'I have so much family drama with my in-laws',
    'Should I cut off my toxic family member?',
  ],

  counterExamples: ['Having conflict with a coworker'],

  arguments: [
    {
      name: 'relationship',
      type: 'string',
      required: false,
      description: 'Who the conflict is with',
    },
    { name: 'issue', type: 'string', required: false, description: 'The core issue' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'navigateFamilyConflict',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// FAMILY MEETING PLANNING
// ============================================================================

export const planFamilyMeetingTool: SemanticToolDefinition = {
  id: 'family_meeting',
  name: 'Plan Family Meeting',
  description: 'Help plan and facilitate family meetings.',
  shortDescription: 'family meeting',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'family meeting',
      'talk to the whole family',
      'discuss as a family',
      'family discussion',
      'get everyone on the same page',
      'announce to family',
      'family conversation',
    ],
    patterns: [
      /\bfamily\s+meeting\b/i,
      /\b(discuss|talk)\s+(as|with)\s+(the\s+)?family\b/i,
      /\bget\s+(the\s+)?family\s+(on\s+the\s+same\s+page|together)\b/i,
    ],
    keywords: [
      { word: 'family meeting', weight: 1.0 },
      { word: 'discuss', weight: 0.85 },
      { word: 'family conversation', weight: 0.9 },
      { word: 'together', weight: 0.8 },
    ],
    antiKeywords: ['team meeting', 'work meeting'],
  },

  examples: [
    'I need to plan a family meeting to discuss something important',
    'How do I get the whole family on the same page?',
    'Want to have a family discussion about our vacation plans',
  ],

  counterExamples: ['Schedule a team meeting'],

  arguments: [
    { name: 'topic', type: 'string', required: false, description: 'Meeting topic' },
    { name: 'participants', type: 'string', required: false, description: 'Who will attend' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'planFamilyMeeting',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// ELDER CARE COORDINATION
// ============================================================================

export const coordinateElderCareTool: SemanticToolDefinition = {
  id: 'family_elder_care',
  name: 'Coordinate Elder Care',
  description: 'Help coordinate care for elderly family members.',
  shortDescription: 'elder care help',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      'caring for my aging parent',
      'elderly parent needs help',
      'nursing home',
      'assisted living',
      "my mom can't live alone",
      'parent has dementia',
      "dad's getting older",
      'sandwich generation',
      'caregiver burnout',
    ],
    patterns: [
      /\bcaring\s+for\s+(my\s+)?(aging|elderly)\s+(parent|mother|father)\b/i,
      /\b(nursing\s+home|assisted\s+living)\b/i,
      /\bparent\s+(has|with)\s+(dementia|alzheimer)\b/i,
      /\bcaregiver\s+(burnout|stress)\b/i,
    ],
    keywords: [
      { word: 'aging', weight: 1.0 },
      { word: 'elderly', weight: 0.95 },
      { word: 'caregiver', weight: 0.95 },
      { word: 'nursing home', weight: 0.9 },
      { word: 'assisted living', weight: 0.9 },
      { word: 'dementia', weight: 0.9 },
    ],
    antiKeywords: ['childcare', 'babysitter'],
  },

  examples: [
    "My mom can't live alone anymore, what are my options?",
    "I'm experiencing caregiver burnout from caring for my dad",
    'Should we consider assisted living for my parent?',
  ],

  counterExamples: ['Need a babysitter for my kids'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'Current care situation' },
    { name: 'concerns', type: 'string', required: false, description: 'Main concerns' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'coordinateElderCare',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// FAMILY TRADITION CREATION
// ============================================================================

export const createFamilyTraditionTool: SemanticToolDefinition = {
  id: 'family_traditions',
  name: 'Create Family Tradition',
  description: 'Help create and maintain family traditions.',
  shortDescription: 'family traditions',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'family tradition',
      'start a tradition',
      'holiday traditions',
      'Sunday dinners',
      'family rituals',
      'make memories',
      'create family moments',
      'family bonding activities',
    ],
    patterns: [
      /\bfamily\s+tradition\b/i,
      /\bstart\s+(a\s+)?(new\s+)?tradition\b/i,
      /\bholiday\s+traditions\b/i,
      /\bfamily\s+(rituals?|bonding)\b/i,
    ],
    keywords: [
      { word: 'tradition', weight: 1.0 },
      { word: 'ritual', weight: 0.9 },
      { word: 'holiday', weight: 0.85 },
      { word: 'bonding', weight: 0.85 },
      { word: 'memories', weight: 0.8 },
      { word: 'family time', weight: 0.85 },
    ],
    antiKeywords: ['cultural tradition', 'work tradition'],
  },

  examples: [
    'I want to start a new family tradition',
    'Ideas for holiday traditions with the kids',
    'How can we create more family bonding moments?',
  ],

  counterExamples: ['Our company has a tradition of Friday lunches'],

  arguments: [
    { name: 'occasion', type: 'string', required: false, description: 'Holiday or recurring' },
    { name: 'familySize', type: 'string', required: false, description: 'Family composition' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'createFamilyTradition',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// VALUES DISCUSSION
// ============================================================================

export const discussValuesTool: SemanticToolDefinition = {
  id: 'family_values',
  name: 'Discuss Family Values',
  description: 'Guide discussions about family values with children.',
  shortDescription: 'teach values',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'teach my kids values',
      'instill values',
      'talk to kids about honesty',
      'raise good kids',
      'character building',
      'moral development',
      'teach right from wrong',
      'family values',
    ],
    patterns: [
      /\bteach\s+(my\s+)?kids?\s+(about\s+)?values\b/i,
      /\binstill\s+values\b/i,
      /\braise\s+(good|kind|honest)\s+kids\b/i,
      /\bteach\s+(right\s+from\s+wrong|morals)\b/i,
    ],
    keywords: [
      { word: 'values', weight: 1.0 },
      { word: 'morals', weight: 0.95 },
      { word: 'character', weight: 0.9 },
      { word: 'honesty', weight: 0.85 },
      { word: 'kindness', weight: 0.85 },
      { word: 'right and wrong', weight: 0.9 },
    ],
    antiKeywords: ['company values', 'stock value'],
  },

  examples: [
    'How do I teach my kids about honesty?',
    'I want to raise kind and empathetic children',
    'Tips for instilling good values in my kids',
  ],

  counterExamples: ['What are the company values?'],

  arguments: [
    { name: 'value', type: 'string', required: false, description: 'Specific value to discuss' },
    { name: 'childAge', type: 'string', required: false, description: 'Child age' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'discussValues',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const familyTools: SemanticToolDefinition[] = [
  coachParentingChallengeTool,
  navigateDisciplineTool,
  suggestAgeAppropriateActivityTool,
  trackChildMilestoneTool,
  celebrateFamilyMomentTool,
  supportFamilyTransitionTool,
  navigateFamilyConflictTool,
  planFamilyMeetingTool,
  coordinateElderCareTool,
  createFamilyTraditionTool,
  discussValuesTool,
];
