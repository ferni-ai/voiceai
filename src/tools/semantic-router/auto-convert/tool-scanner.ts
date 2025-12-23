/**
 * Tool Scanner & Auto-Converter
 *
 * Scans existing tool definitions and converts them to semantic router format.
 * This allows us to leverage all 60+ domains without manual conversion.
 *
 * @module tools/semantic-router/auto-convert/tool-scanner
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  SemanticToolDefinition,
  SemanticTrigger,
  ToolArgument,
  ToolCategory,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

const log = createLogger({ module: 'semantic-router:auto-convert' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Existing tool definition format (from registry/types.ts)
 */
interface LegacyToolDefinition {
  id: string;
  name: string;
  description: string;
  domain: string;
  additionalDomains?: string[];
  tags?: string[];
  experimental?: boolean;
  deprecated?: boolean;
  create: (ctx: unknown) => {
    description: string;
    parameters?: unknown;
    execute: (params: unknown) => Promise<unknown>;
  };
}

// ============================================================================
// CATEGORY MAPPING
// ============================================================================

const DOMAIN_TO_CATEGORY: Record<string, ToolCategory> = {
  // Music & Entertainment
  music: 'music',
  podcasts: 'music',
  entertainment: 'entertainment',
  video: 'entertainment',

  // Information
  information: 'information',
  news: 'information',
  weather: 'information',
  search: 'information',
  research: 'information',
  books: 'recommendations',

  // Memory
  memory: 'memory',

  // Calendar & Tasks
  calendar: 'calendar',
  tasks: 'tasks',

  // Productivity
  productivity: 'productivity',

  // Communication
  communication: 'communication',
  telephony: 'telephony',

  // Wellness
  wellness: 'wellness',
  health: 'wellness',
  presence: 'wellness',
  'self-compassion': 'wellness',
  'chronic-conditions': 'wellness',
  'body-relationship': 'wellness',
  'digital-wellness': 'wellness',

  // Crisis (SAFETY-CRITICAL)
  crisis: 'crisis',
  'trauma-support': 'crisis',

  // Grief
  grief: 'grief',

  // Finance
  finance: 'finance',
  banking: 'finance',
  financial: 'finance',

  // Smart Home
  'smart-home': 'smart-home',
  home: 'smart-home',

  // Handoff
  handoff: 'handoff',
  personas: 'handoff',

  // Life Planning & Decisions
  'life-planning': 'decisions',
  'life-transitions': 'decisions',
  'life-thesis': 'decisions',
  decisions: 'decisions',
  midlife: 'decisions',

  // Career
  career: 'career',

  // Relationships & Family
  relationships: 'relationships',
  family: 'relationships',
  intimacy: 'relationships',

  // Habits
  habits: 'habits',
  'habit-persistence': 'habits',

  // Life Coaching
  boundaries: 'life-coaching',
  'social-skills': 'life-coaching',
  anger: 'life-coaching',
  procrastination: 'life-coaching',
  perfectionism: 'life-coaching',
  'burnout-recovery': 'life-coaching',
  neurodiversity: 'life-coaching',
  'life-coaching-shared': 'life-coaching',

  // Dating
  dating: 'dating',
  'breakup-recovery': 'dating',

  // Learning
  learning: 'learning',

  // Games
  games: 'games',
  engagement: 'games',

  // Recommendations
  recommendations: 'recommendations',

  // Other (keep as utility for now)
  creativity: 'utility',
  dreams: 'utility',
  meaning: 'utility',
  wisdom: 'utility',
  travel: 'utility',
  community: 'utility',
  connection: 'utility',
  curiosity: 'utility',
  play: 'utility',
  stories: 'utility',
  vulnerability: 'utility',
};

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Extract keywords from tool name and description
 */
function extractKeywords(
  name: string,
  description: string,
  domain: string
): Array<{ word: string; weight: number }> {
  const keywords: Array<{ word: string; weight: number }> = [];
  const seen = new Set<string>();

  // Domain-specific high-weight keywords
  const domainKeywords: Record<string, string[]> = {
    entertainment: [
      'play',
      'music',
      'song',
      'playlist',
      'album',
      'artist',
      'spotify',
      'pause',
      'skip',
    ],
    calendar: ['calendar', 'schedule', 'appointment', 'meeting', 'event', 'remind', 'reminder'],
    communication: ['call', 'text', 'email', 'message', 'send', 'contact'],
    finance: ['money', 'budget', 'spending', 'bank', 'bill', 'payment'],
    wellness: ['meditation', 'breathe', 'calm', 'stress', 'anxiety', 'sleep', 'health'],
    memory: ['remember', 'recall', 'memory', 'forget', 'remind'],
    habits: ['habit', 'routine', 'track', 'streak', 'daily'],
    research: ['research', 'search', 'find', 'look up', 'information'],
    handoff: ['talk to', 'speak with', 'transfer', 'maya', 'peter', 'alex', 'jordan', 'nayan'],

    // Life Coaching Domains
    boundaries: [
      'boundary',
      'boundaries',
      'no',
      'limits',
      'say no',
      'people pleasing',
      'assertive',
      'self-respect',
    ],
    'social-skills': [
      'social',
      'conversation',
      'networking',
      'awkward',
      'small talk',
      'friends',
      'connection',
      'loneliness',
    ],
    anger: [
      'angry',
      'anger',
      'frustrated',
      'rage',
      'mad',
      'irritated',
      'annoyed',
      'temper',
      'cool down',
    ],
    procrastination: [
      'procrastinate',
      'procrastinating',
      'avoid',
      'putting off',
      "can't start",
      'stuck',
      'unmotivated',
      'lazy',
    ],
    perfectionism: [
      'perfect',
      'perfectionist',
      'good enough',
      'imposter',
      'failure',
      'standards',
      'high standards',
      'self-critical',
    ],
    'digital-wellness': [
      'screen',
      'phone',
      'social media',
      'doom scrolling',
      'digital',
      'detox',
      'notification',
      'distraction',
    ],
    'burnout-recovery': [
      'burnout',
      'exhausted',
      'overwhelmed',
      'tired',
      'depleted',
      'recovery',
      'rest',
      'overwork',
    ],
    'body-relationship': [
      'body',
      'weight',
      'appearance',
      'mirror',
      'diet',
      'eating',
      'self-image',
      'body image',
    ],
    dating: [
      'dating',
      'date',
      'relationship',
      'single',
      'love',
      'partner',
      'romance',
      'attraction',
      'attachment',
    ],
    intimacy: [
      'intimacy',
      'intimate',
      'vulnerable',
      'close',
      'emotional intimacy',
      'trust',
      'openness',
    ],
    'breakup-recovery': [
      'breakup',
      'ex',
      'heartbreak',
      'ended',
      'divorced',
      'separated',
      'moving on',
      'closure',
    ],
    neurodiversity: [
      'adhd',
      'autism',
      'neurodivergent',
      'focus',
      'executive function',
      'stimming',
      'sensory',
      'masking',
    ],
    'trauma-support': [
      'trauma',
      'triggered',
      'flashback',
      'ptsd',
      'past',
      'healing',
      'safe',
      'grounding',
    ],
    'chronic-conditions': [
      'chronic',
      'pain',
      'illness',
      'condition',
      'flare',
      'pacing',
      'energy',
      'spoons',
    ],
    midlife: [
      'midlife',
      'turning 40',
      'turning 50',
      'purpose',
      'legacy',
      'reinvention',
      'second act',
      'meaning',
    ],
  };

  // Add domain keywords with high weight
  const domainWords = domainKeywords[domain] || [];
  for (const word of domainWords) {
    if (!seen.has(word.toLowerCase())) {
      keywords.push({ word, weight: 0.9 });
      seen.add(word.toLowerCase());
    }
  }

  // Extract from name (high weight)
  const nameWords = name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((w) => w.length > 2);
  for (const word of nameWords) {
    if (!seen.has(word)) {
      keywords.push({ word, weight: 0.8 });
      seen.add(word);
    }
  }

  // Extract from description (medium weight)
  const stopWords = new Set([
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
    'shall',
    'can',
    'for',
    'and',
    'nor',
    'but',
    'or',
    'yet',
    'so',
    'in',
    'on',
    'at',
    'to',
    'from',
    'with',
    'by',
    'about',
    'as',
    'of',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'user',
    'tool',
    'function',
    'action',
    'data',
    'information',
  ]);

  const descWords = description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  for (const word of descWords) {
    if (!seen.has(word)) {
      keywords.push({ word, weight: 0.5 });
      seen.add(word);
    }
  }

  return keywords.slice(0, 15); // Limit keywords
}

/**
 * Generate example queries for a tool
 */
function generateExamples(name: string, description: string, domain: string): string[] {
  const examples: string[] = [];

  // Domain-specific example templates
  const templates: Record<string, string[]> = {
    entertainment: ['play some music', 'play {name}', 'I want to listen to something'],
    calendar: [
      'add to my calendar',
      'schedule a meeting',
      'when is my next appointment',
      'remind me to {name}',
    ],
    communication: ['send a message', 'call someone', 'check my emails'],
    finance: ['check my balance', 'how much did I spend', 'show my budget'],
    wellness: ['I need to relax', 'help me meditate', "I'm feeling stressed"],
    memory: ['remember this', 'what did I say about', 'recall my notes'],
    habits: ['track my habit', 'how am I doing with', 'mark as done'],
    handoff: ['I want to talk to Maya', 'transfer me to Peter', 'can I speak with Alex'],

    // Life Coaching Domains
    boundaries: [
      "I can't say no",
      'people keep crossing my boundaries',
      'how do I set boundaries with my family',
      'I feel like a pushover',
    ],
    'social-skills': [
      "I don't know what to say in conversations",
      'I feel awkward at parties',
      'how do I make friends',
      "I'm lonely",
    ],
    anger: [
      "I'm so angry right now",
      'I keep losing my temper',
      'how do I control my anger',
      'I exploded at someone',
    ],
    procrastination: [
      "I can't seem to start this task",
      "I've been putting this off",
      'why do I procrastinate',
      'I feel stuck',
    ],
    perfectionism: [
      "I'm never good enough",
      'I feel like an imposter',
      "I'm afraid of failing",
      'my standards are too high',
    ],
    'digital-wellness': [
      "I'm on my phone too much",
      "I can't stop scrolling",
      'social media is affecting me',
      'I need a digital detox',
    ],
    'burnout-recovery': [
      "I'm completely burned out",
      "I can't keep going like this",
      "I'm exhausted all the time",
      'how do I recover from burnout',
    ],
    'body-relationship': [
      "I don't like how I look",
      'I have body image issues',
      "I can't stop thinking about my weight",
      'help me accept my body',
    ],
    dating: [
      "I'm ready to start dating again",
      'I keep attracting the wrong people',
      'how do I put myself out there',
      'dating apps make me anxious',
    ],
    intimacy: [
      'I have trouble being vulnerable',
      'I push people away',
      'how do I get closer to my partner',
      "I'm afraid of intimacy",
    ],
    'breakup-recovery': [
      'my partner and I just broke up',
      "I can't stop thinking about my ex",
      'how do I move on',
      'my heart is broken',
    ],
    neurodiversity: [
      'I think I have ADHD',
      "I can't focus on anything",
      'everything feels overwhelming',
      "I don't fit in anywhere",
    ],
    'trauma-support': [
      'I was triggered by something',
      "I'm having flashbacks",
      'something from my past is affecting me',
      'I need help processing trauma',
    ],
    'chronic-conditions': [
      'I have a chronic illness',
      "I'm always in pain",
      "I don't have enough energy",
      'how do I pace myself',
    ],
    midlife: [
      "I'm questioning my life choices",
      "I feel like I'm running out of time",
      "what's my purpose now",
      "I'm turning 50 and feeling lost",
    ],
  };

  const domainTemplates = templates[domain] || [`help with ${name}`, `I need ${name}`];

  for (const template of domainTemplates) {
    examples.push(template.replace('{name}', name.toLowerCase()));
  }

  // Add description-based example
  const firstSentence = description.split('.')[0];
  if (firstSentence && firstSentence.length < 100) {
    examples.push(`I want to ${firstSentence.toLowerCase()}`);
  }

  return examples.slice(0, 5);
}

/**
 * Generate trigger patterns from name
 */
function generatePatterns(name: string, domain: string): RegExp[] {
  const patterns: RegExp[] = [];

  // Convert name to regex-safe version
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
  const nameWords = safeName.split(/[\s\-_]+/).filter((w) => w.length > 2);

  // Pattern: exact name match
  patterns.push(new RegExp(`\\b${safeName}\\b`, 'i'));

  // Pattern: key words from name
  if (nameWords.length >= 2) {
    patterns.push(new RegExp(`\\b${nameWords.slice(0, 2).join('.*')}\\b`, 'i'));
  }

  // Domain-specific patterns
  const domainPatterns: Record<string, RegExp[]> = {
    entertainment: [/^play\s+/i, /^listen\s+to\s+/i],
    calendar: [/^schedule\s+/i, /^remind\s+me\s+/i, /^add\s+.*\s+to\s+calendar/i],
    communication: [/^(call|text|email)\s+/i, /^send\s+/i],
    habits: [/^track\s+/i, /^log\s+/i, /^mark\s+.*\s+done/i],
    handoff: [/^talk\s+to\s+/i, /^transfer\s+.*\s+to\s+/i],
  };

  if (domainPatterns[domain]) {
    patterns.push(...domainPatterns[domain]);
  }

  return patterns;
}

// ============================================================================
// CONVERTER
// ============================================================================

/**
 * Convert a legacy tool definition to semantic format
 */
export function convertToSemanticTool(
  legacy: LegacyToolDefinition,
  mockContext: unknown
): SemanticToolDefinition {
  const category = DOMAIN_TO_CATEGORY[legacy.domain] || 'utility';
  const keywords = extractKeywords(legacy.name, legacy.description, legacy.domain);
  const examples = generateExamples(legacy.name, legacy.description, legacy.domain);
  const patterns = generatePatterns(legacy.name, legacy.domain);

  // Create the tool to extract parameter info
  let parameters: ToolArgument[] = [];
  let executeWrapper: SemanticToolDefinition['execute'];

  try {
    const created = legacy.create(mockContext);

    // Convert Zod schema to arguments (basic extraction)
    // In production, we'd parse the Zod schema more thoroughly
    parameters = []; // Would extract from created.parameters

    // Wrap the execute function
    executeWrapper = async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<ToolExecutionResult> => {
      try {
        const result = await created.execute(args);
        return {
          success: true,
          data: result,
          naturalResponse: typeof result === 'string' ? result : JSON.stringify(result),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          naturalResponse: "I couldn't complete that action.",
        };
      }
    };
  } catch {
    // Tool creation failed, use stub
    executeWrapper = async (): Promise<ToolExecutionResult> => ({
      success: false,
      error: 'Tool not available',
      naturalResponse: 'This tool is not available right now.',
    });
  }

  const triggers: SemanticTrigger = {
    phrases: [legacy.name.toLowerCase()],
    patterns,
    keywords,
  };

  return {
    id: legacy.id,
    name: legacy.name,
    description: legacy.description,
    shortDescription: legacy.description.split('.')[0] || legacy.description,
    category,
    triggers,
    examples,
    arguments: parameters,
    execute: executeWrapper,
    tags: legacy.tags || [legacy.domain],
    priority: legacy.deprecated ? 10 : 50,
  };
}

/**
 * Batch convert multiple tools
 */
export function convertManyTools(
  legacyTools: LegacyToolDefinition[],
  mockContext: unknown
): SemanticToolDefinition[] {
  const converted: SemanticToolDefinition[] = [];
  const failed: string[] = [];

  for (const legacy of legacyTools) {
    try {
      const semantic = convertToSemanticTool(legacy, mockContext);
      converted.push(semantic);
    } catch (error) {
      failed.push(legacy.id);
      log.warn({ toolId: legacy.id, error: String(error) }, 'Failed to convert tool');
    }
  }

  log.info(
    {
      converted: converted.length,
      failed: failed.length,
      failedIds: failed,
    },
    'Tool conversion complete'
  );

  return converted;
}

// ============================================================================
// RUNTIME REGISTRATION
// ============================================================================

/**
 * Auto-register all domain tools with the semantic router
 */
export async function autoRegisterDomainTools(
  registry: { register: (def: SemanticToolDefinition) => void },
  mockContext: unknown
): Promise<{ registered: number; failed: string[] }> {
  const failed: string[] = [];
  let registered = 0;

  // Import domain index
  try {
    const domains = await import('../../domains/index.js');

    // Each domain exports getToolDefinitions()
    for (const [domainName, domainModule] of Object.entries(domains)) {
      if (typeof domainModule === 'object' && domainModule !== null) {
        const mod = domainModule as { getToolDefinitions?: () => Promise<LegacyToolDefinition[]> };
        if (typeof mod.getToolDefinitions === 'function') {
          try {
            const legacyTools = await mod.getToolDefinitions();
            const semanticTools = convertManyTools(legacyTools, mockContext);

            for (const tool of semanticTools) {
              registry.register(tool);
              registered++;
            }

            log.debug(
              { domain: domainName, count: semanticTools.length },
              'Domain tools registered'
            );
          } catch (error) {
            failed.push(domainName);
            log.warn({ domain: domainName, error: String(error) }, 'Failed to load domain');
          }
        }
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to import domains');
  }

  return { registered, failed };
}
