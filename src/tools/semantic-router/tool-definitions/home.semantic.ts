/**
 * Home Management Semantic Routing
 *
 * Routes for home maintenance, organization, moving, and projects.
 * Helps users manage the practical aspects of their living spaces.
 *
 * Routes to: domains/home
 * Tools: remindHomeMaintenance, trackRepair, coachDecluttering, organizeSpace,
 *        planMove, assessEmergencyPreparedness, planHomeProject, manageContractor
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// HOME MAINTENANCE REMINDERS
// ============================================================================

export const remindHomeMaintenanceTool: SemanticToolDefinition = {
  id: 'home_maintenance',
  name: 'Remind Home Maintenance',
  description: 'Remind about home maintenance tasks.',
  shortDescription: 'home maintenance',
  category: 'life-coaching',
  priority: 3,

  triggers: {
    phrases: [
      'change the air filter',
      'when to service HVAC',
      'home maintenance schedule',
      'furnace maintenance',
      'gutter cleaning',
      'water heater flush',
      'seasonal home tasks',
      'home upkeep checklist',
    ],
    patterns: [
      /\b(change|replace)\s+(the\s+)?(air\s+)?filter\b/i,
      /\bwhen\s+to\s+(service|maintain)\s+(the\s+)?(HVAC|furnace)\b/i,
      /\bhome\s+maintenance\s+(schedule|checklist|tasks)\b/i,
      /\b(gutter|chimney)\s+(cleaning|maintenance)\b/i,
    ],
    keywords: [
      { word: 'maintenance', weight: 1.0 },
      { word: 'filter', weight: 0.85 },
      { word: 'HVAC', weight: 0.9 },
      { word: 'furnace', weight: 0.9 },
      { word: 'gutter', weight: 0.85 },
      { word: 'upkeep', weight: 0.85 },
      { word: 'service', weight: 0.8 },
    ],
    antiKeywords: ['car maintenance', 'body maintenance'],
  },

  examples: [
    'When should I change my air filter?',
    'I need a home maintenance schedule',
    'What seasonal home maintenance tasks should I do?',
  ],

  counterExamples: ['Time for car maintenance'],

  arguments: [
    { name: 'task', type: 'string', required: false, description: 'Specific task' },
    { name: 'homeType', type: 'string', required: false, description: 'House/apartment/condo' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'remindHomeMaintenance',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// REPAIR TRACKING
// ============================================================================

export const trackRepairTool: SemanticToolDefinition = {
  id: 'home_repair',
  name: 'Track Repair',
  description: 'Track home repairs and their status.',
  shortDescription: 'track repairs',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'something broke',
      'need to fix',
      'repair the',
      'broken appliance',
      'leak in the',
      "dishwasher isn't working",
      "AC isn't working",
      'need a plumber',
      'call an electrician',
    ],
    patterns: [
      /\bsomething\s+(broke|broken|needs\s+fixing)\b/i,
      /\b(need\s+to|have\s+to)\s+(fix|repair)\b/i,
      /\b(leak|broken)\s+(in\s+)?(the\s+)?\b/i,
      /\b(dishwasher|washer|dryer|AC|heater|furnace)\s+(isn't|not|stopped)\s+working\b/i,
    ],
    keywords: [
      { word: 'repair', weight: 1.0 },
      { word: 'broken', weight: 0.95 },
      { word: 'fix', weight: 0.9 },
      { word: 'leak', weight: 0.9 },
      { word: 'plumber', weight: 0.85 },
      { word: 'electrician', weight: 0.85 },
      { word: 'appliance', weight: 0.8 },
    ],
    antiKeywords: ['relationship repair', 'car repair'],
  },

  examples: [
    'My dishwasher stopped working',
    "There's a leak in the bathroom",
    'I need to call a plumber',
  ],

  counterExamples: ['I need to repair my relationship'],

  arguments: [
    { name: 'item', type: 'string', required: false, description: 'What needs repair' },
    { name: 'urgency', type: 'string', required: false, description: 'How urgent' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'trackRepair',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// DECLUTTERING COACHING
// ============================================================================

export const coachDeclutteringTool: SemanticToolDefinition = {
  id: 'home_declutter',
  name: 'Coach Decluttering',
  description: 'Coach through decluttering process.',
  shortDescription: 'declutter help',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'declutter my house',
      'too much stuff',
      'get rid of things',
      'minimalism',
      'KonMari',
      'does this spark joy',
      'purge my closet',
      'clean out the garage',
      'downsizing',
    ],
    patterns: [
      /\bdeclutter\s+(my\s+)?(house|home|room|closet)\b/i,
      /\btoo\s+much\s+(stuff|clutter|junk)\b/i,
      /\bget\s+rid\s+of\s+(things|stuff)\b/i,
      /\b(purge|clean\s+out)\s+(my\s+)?(closet|garage|basement)\b/i,
    ],
    keywords: [
      { word: 'declutter', weight: 1.0 },
      { word: 'minimalism', weight: 0.9 },
      { word: 'KonMari', weight: 0.95 },
      { word: 'purge', weight: 0.9 },
      { word: 'downsizing', weight: 0.9 },
      { word: 'stuff', weight: 0.75 },
      { word: 'junk', weight: 0.8 },
    ],
    antiKeywords: ['digital declutter', 'email declutter'],
  },

  examples: [
    'I need to declutter my house',
    'We have too much stuff',
    'Help me purge my closet Marie Kondo style',
  ],

  counterExamples: ['I need to declutter my inbox'],

  arguments: [
    { name: 'area', type: 'string', required: false, description: 'Which area to declutter' },
    { name: 'motivation', type: 'string', required: false, description: 'Why decluttering' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'coachDecluttering',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// SPACE ORGANIZATION
// ============================================================================

export const organizeSpaceTool: SemanticToolDefinition = {
  id: 'home_organize',
  name: 'Organize Space',
  description: 'Help organize living spaces effectively.',
  shortDescription: 'organize space',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'organize my',
      'storage solutions',
      'pantry organization',
      'closet organization',
      'garage organization',
      'small space living',
      'maximize space',
      'organizing system',
    ],
    patterns: [
      /\borganize\s+(my\s+)?(pantry|closet|garage|kitchen|bathroom)\b/i,
      /\bstorage\s+(solutions|ideas|tips)\b/i,
      /\bmaximize\s+(my\s+)?space\b/i,
      /\bsmall\s+space\s+(living|solutions)\b/i,
    ],
    keywords: [
      { word: 'organize', weight: 1.0 },
      { word: 'storage', weight: 0.95 },
      { word: 'shelving', weight: 0.85 },
      { word: 'bins', weight: 0.8 },
      { word: 'containers', weight: 0.8 },
      { word: 'maximize', weight: 0.85 },
    ],
    antiKeywords: ['organize my thoughts', 'organize my schedule'],
  },

  examples: [
    'I need help organizing my pantry',
    'Storage solutions for a small apartment',
    'How do I maximize space in my closet?',
  ],

  counterExamples: ['Help me organize my schedule'],

  arguments: [
    { name: 'space', type: 'string', required: false, description: 'Which space' },
    {
      name: 'constraints',
      type: 'string',
      required: false,
      description: 'Size/budget constraints',
    },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'organizeSpace',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// MOVE PLANNING
// ============================================================================

export const planMoveTool: SemanticToolDefinition = {
  id: 'home_move',
  name: 'Plan Move',
  description: 'Help plan and organize a move.',
  shortDescription: 'moving help',
  category: 'life-coaching',
  priority: 1,

  triggers: {
    phrases: [
      "I'm moving",
      'planning a move',
      'moving checklist',
      'packing tips',
      'moving company',
      'change of address',
      'relocating',
      'moving to a new place',
      'first apartment',
    ],
    patterns: [
      /\b(I'm|we're)\s+moving\b/i,
      /\b(planning|organizing)\s+(a\s+)?move\b/i,
      /\bmoving\s+(checklist|tips|company)\b/i,
      /\b(relocating|relocation)\b/i,
    ],
    keywords: [
      { word: 'moving', weight: 1.0 },
      { word: 'relocating', weight: 0.95 },
      { word: 'packing', weight: 0.9 },
      { word: 'movers', weight: 0.9 },
      { word: 'boxes', weight: 0.8 },
      { word: 'new place', weight: 0.85 },
      { word: 'apartment', weight: 0.75 },
    ],
    antiKeywords: ['moving on emotionally', 'career move'],
  },

  examples: [
    "I'm moving next month, help me plan",
    'I need a moving checklist',
    'Tips for packing for a move',
  ],

  counterExamples: ['Making a career move', 'Moving on after a breakup'],

  arguments: [
    { name: 'timeline', type: 'string', required: false, description: 'When moving' },
    { name: 'distance', type: 'string', required: false, description: 'Local or long-distance' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'planMove',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// EMERGENCY PREPAREDNESS
// ============================================================================

export const assessEmergencyPreparednessTool: SemanticToolDefinition = {
  id: 'home_emergency',
  name: 'Assess Emergency Preparedness',
  description: 'Assess and improve home emergency preparedness.',
  shortDescription: 'emergency prep',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'emergency kit',
      'disaster preparedness',
      'earthquake kit',
      'hurricane prep',
      'power outage',
      'emergency supplies',
      'fire escape plan',
      'smoke detectors',
      'carbon monoxide detector',
    ],
    patterns: [
      /\b(emergency|disaster)\s+(kit|preparedness|supplies)\b/i,
      /\b(earthquake|hurricane|tornado)\s+(kit|prep|preparedness)\b/i,
      /\bfire\s+(escape|safety)\s+plan\b/i,
      /\b(smoke|carbon\s+monoxide)\s+detector\b/i,
    ],
    keywords: [
      { word: 'emergency', weight: 1.0 },
      { word: 'disaster', weight: 0.95 },
      { word: 'preparedness', weight: 0.95 },
      { word: 'safety', weight: 0.85 },
      { word: 'supplies', weight: 0.85 },
      { word: 'evacuation', weight: 0.9 },
    ],
    antiKeywords: ['financial emergency', 'medical emergency'],
  },

  examples: [
    'I need to put together an emergency kit',
    'How do I prepare for a power outage?',
    'When should I replace smoke detector batteries?',
  ],

  counterExamples: ['I have a financial emergency'],

  arguments: [
    { name: 'emergencyType', type: 'string', required: false, description: 'Type of emergency' },
    { name: 'location', type: 'string', required: false, description: 'Geographic region' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'assessEmergencyPreparedness',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// HOME PROJECT PLANNING
// ============================================================================

export const planHomeProjectTool: SemanticToolDefinition = {
  id: 'home_project',
  name: 'Plan Home Project',
  description: 'Help plan home improvement projects.',
  shortDescription: 'home project',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'home improvement',
      'renovating',
      'remodeling',
      'DIY project',
      'bathroom renovation',
      'kitchen remodel',
      'paint the house',
      'new flooring',
      'home upgrade',
    ],
    patterns: [
      /\bhome\s+(improvement|renovation|project|upgrade)\b/i,
      /\b(renovating|remodeling)\s+(the\s+)?(kitchen|bathroom|basement)\b/i,
      /\bDIY\s+project\b/i,
      /\b(paint|repaint)\s+(the\s+)?(house|room|walls)\b/i,
    ],
    keywords: [
      { word: 'renovation', weight: 1.0 },
      { word: 'remodel', weight: 0.95 },
      { word: 'DIY', weight: 0.9 },
      { word: 'improvement', weight: 0.9 },
      { word: 'upgrade', weight: 0.85 },
      { word: 'project', weight: 0.75 },
    ],
    antiKeywords: ['work project', 'side project'],
  },

  examples: [
    'Planning a kitchen remodel',
    'DIY project ideas for the weekend',
    'I want to renovate my bathroom',
  ],

  counterExamples: ['Working on a side project at work'],

  arguments: [
    { name: 'project', type: 'string', required: false, description: 'Type of project' },
    { name: 'budget', type: 'string', required: false, description: 'Budget range' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'planHomeProject',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// CONTRACTOR MANAGEMENT
// ============================================================================

export const manageContractorTool: SemanticToolDefinition = {
  id: 'home_contractor',
  name: 'Manage Contractor',
  description: 'Help find and manage home contractors.',
  shortDescription: 'contractor help',
  category: 'life-coaching',
  priority: 2,

  triggers: {
    phrases: [
      'find a contractor',
      'hire a plumber',
      'good electrician',
      'get quotes',
      'contractor not responding',
      'contractor problems',
      'handyman needed',
      'roofer recommendations',
    ],
    patterns: [
      /\b(find|hire|need)\s+(a\s+)?(contractor|plumber|electrician|handyman)\b/i,
      /\bget\s+(contractor\s+)?quotes\b/i,
      /\bcontractor\s+(not\s+responding|problems|issues)\b/i,
      /\b(good|reliable)\s+(plumber|electrician|contractor)\b/i,
    ],
    keywords: [
      { word: 'contractor', weight: 1.0 },
      { word: 'plumber', weight: 0.95 },
      { word: 'electrician', weight: 0.95 },
      { word: 'handyman', weight: 0.9 },
      { word: 'quotes', weight: 0.85 },
      { word: 'hire', weight: 0.8 },
    ],
    antiKeywords: ['independent contractor', 'work contract'],
  },

  examples: [
    'I need to find a good plumber',
    'How do I get contractor quotes?',
    'My contractor is not responding',
  ],

  counterExamples: ["I'm an independent contractor"],

  arguments: [
    { name: 'tradeType', type: 'string', required: false, description: 'Type of contractor' },
    { name: 'issue', type: 'string', required: false, description: 'Current issue' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/home',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'manageContractor',
      args,
      delegateTo: 'domains/home',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const homeTools: SemanticToolDefinition[] = [
  remindHomeMaintenanceTool,
  trackRepairTool,
  coachDeclutteringTool,
  organizeSpaceTool,
  planMoveTool,
  assessEmergencyPreparednessTool,
  planHomeProjectTool,
  manageContractorTool,
];
