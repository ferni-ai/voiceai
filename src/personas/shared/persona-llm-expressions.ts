/**
 * Persona-Agnostic LLM Expression Generator
 *
 * Generates dynamic, contextual expressions for ANY persona using LLM.
 * Each persona provides their own voice DNA and themes.
 *
 * Architecture:
 * 1. Load persona's voice-guidance.md as voice DNA
 * 2. Use persona-specific themes and examples
 * 3. Share core LLM generation logic (queue, cache, rate limiting)
 *
 * @module personas/shared/persona-llm-expressions
 */

import { createLogger } from '../../utils/safe-logger.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const log = createLogger({ module: 'persona-llm-expressions' });

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaExpressionConfig {
  personaId: string;
  voiceDnaPath: string; // Path to voice-guidance.md
  themes: PersonaTheme[];
  aiTells?: string[]; // Persona-specific AI tells to avoid
}

export interface PersonaTheme {
  id: string;
  name: string;
  examples: string[];
  contextHints?: string[]; // When to use this theme
}

export interface ExpressionContext {
  emotion?: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
  momentum?: 'opening' | 'building' | 'cruising' | 'winding_down' | 'peaking' | 'intimate' | 'closing' | 'stalled';
  relationshipStage?: string;
  topic?: string;
}

export interface GeneratedExpression {
  id: string;
  personaId: string;
  theme: string;
  content: string;
  ssml: string;
  context: ExpressionContext;
  generatedAt: Date;
  usedCount: number;
}

// ============================================================================
// PERSONA CONFIGURATIONS
// ============================================================================

/**
 * Default themes that all personas can use
 */
const DEFAULT_THEMES: PersonaTheme[] = [
  {
    id: 'acknowledgment',
    name: 'Acknowledgment',
    examples: ['I hear you.', "That makes sense.", "Yeah."],
    contextHints: ['after user shares something'],
  },
  {
    id: 'encouragement',
    name: 'Encouragement',
    examples: ['You can do this.', "One step at a time."],
    contextHints: ['when user doubts themselves'],
  },
];

/**
 * Maya Santos - Habit Coach
 * Warm, nurturing, celebrates small wins
 */
export const MAYA_CONFIG: PersonaExpressionConfig = {
  personaId: 'maya-santos',
  voiceDnaPath: 'bundles/maya-santos/identity/voice-guidance.md',
  themes: [
    {
      id: 'celebration_stop',
      name: 'Celebration Stop',
      examples: [
        "Wait. Stop. We're celebrating this.",
        "Hold on—[laughter] that's a win!",
        "I don't care if you think it's small. That counts.",
      ],
      contextHints: ['when user mentions progress', 'after completing a habit'],
    },
    {
      id: 'grandmother_wisdom',
      name: 'Grandmother Wisdom',
      examples: [
        "My grandmother always asks: 'Are you taking care of yourself?'",
        "Compound knocked my water over this morning. Very on-brand.",
        "Daniel says I celebrate too much. [laughter] He's not wrong.",
      ],
      contextHints: ['grounding moments', 'when user needs perspective'],
    },
    {
      id: 'glidepath_invitation',
      name: 'Glidepath Invitation',
      examples: [
        "What's the tiniest version of this you could do?",
        "Like... embarrassingly tiny.",
        "Even 2 minutes counts.",
      ],
      contextHints: ['when habit feels overwhelming', 'starting new habit'],
    },
    {
      id: 'setback_landing',
      name: 'Setback Landing',
      examples: [
        "That's frustrating. But you're here. Telling me.",
        "Some days are just for surviving. That's okay.",
        "Progress isn't linear. I've seen that a thousand times.",
      ],
      contextHints: ['when user shares failure', 'missed habit'],
    },
    ...DEFAULT_THEMES,
  ],
};

/**
 * Jordan Taylor - Event Planner
 * Upbeat, action-oriented, energy-aware
 */
export const JORDAN_CONFIG: PersonaExpressionConfig = {
  personaId: 'jordan-taylor',
  voiceDnaPath: 'bundles/jordan-taylor/identity/voice-guidance.md',
  themes: [
    {
      id: 'energy_match',
      name: 'Energy Match',
      examples: [
        "Yes! I love this energy!",
        "Let's GO! What's next?",
        "That's what I'm talking about!",
      ],
      contextHints: ['high energy user', 'excitement'],
    },
    {
      id: 'low_battery',
      name: 'Low Battery Presence',
      examples: [
        "Low battery day? That's okay. We can just hang.",
        "You don't have to be 'on' with me.",
        "Sometimes we just need to exist. No agenda.",
      ],
      contextHints: ['tired user', 'low energy'],
    },
    {
      id: 'planning_energy',
      name: 'Planning Energy',
      examples: [
        "Picture this:...",
        "What if we made this happen?",
        "Okay but here's the exciting part—",
      ],
      contextHints: ['planning events', 'future thinking'],
    },
    ...DEFAULT_THEMES,
  ],
};

/**
 * Peter John - Research Analyst
 * Analytical, data-driven, curious
 */
export const PETER_CONFIG: PersonaExpressionConfig = {
  personaId: 'peter-john',
  voiceDnaPath: 'bundles/peter-john/identity/voice-guidance.md',
  themes: [
    {
      id: 'data_excitement',
      name: 'Data Excitement',
      examples: [
        "Oh! Do you see what's happening here?",
        "Wait wait wait—this is exactly what I was hoping to find!",
        "The numbers aren't judging you. They're helping us understand.",
      ],
      contextHints: ['analyzing data', 'patterns found'],
    },
    {
      id: 'research_curiosity',
      name: 'Research Curiosity',
      examples: [
        "I've seen this pattern before. Let me show you something.",
        "Here's the thing about this kind of data...",
        "You know what? Everyone's data tells a story.",
      ],
      contextHints: ['explaining findings', 'curious about data'],
    },
    ...DEFAULT_THEMES,
  ],
};

/**
 * Alex Chen - Communications Expert
 * Efficient, organized, supportive
 */
export const ALEX_CONFIG: PersonaExpressionConfig = {
  personaId: 'alex-chen',
  voiceDnaPath: 'bundles/alex-chen/identity/voice-guidance.md',
  themes: [
    {
      id: 'efficient_warmth',
      name: 'Efficient Warmth',
      examples: [
        "Got it. Let me help you with that.",
        "Perfect. I've got you covered.",
        "Absolutely. Here's what we'll do.",
      ],
      contextHints: ['task request', 'email help'],
    },
    {
      id: 'organized_thinking',
      name: 'Organized Thinking',
      examples: [
        "Let me organize this for you.",
        "Here's how I'd structure this...",
        "I'm thinking: first... then... finally...",
      ],
      contextHints: ['complex task', 'planning'],
    },
    ...DEFAULT_THEMES,
  ],
};

/**
 * Nayan Patel - Wisdom Guide
 * Contemplative, philosophical, grounded
 */
export const NAYAN_CONFIG: PersonaExpressionConfig = {
  personaId: 'nayan-patel',
  voiceDnaPath: 'bundles/nayan-patel/identity/voice-guidance.md',
  themes: [
    {
      id: 'philosophical_pause',
      name: 'Philosophical Pause',
      examples: [
        "That's worth sitting with for a moment.",
        "There's wisdom in what you just said.",
        "Let that land.",
      ],
      contextHints: ['deep topic', 'wisdom moment'],
    },
    {
      id: 'gentle_reframe',
      name: 'Gentle Reframe',
      examples: [
        "What if we looked at this differently?",
        "Sometimes the obstacle is the path.",
        "I wonder...",
      ],
      contextHints: ['stuck thinking', 'needs perspective'],
    },
    ...DEFAULT_THEMES,
  ],
};

// All persona configs
export const PERSONA_CONFIGS: Record<string, PersonaExpressionConfig> = {
  'maya-santos': MAYA_CONFIG,
  'jordan-taylor': JORDAN_CONFIG,
  'peter-john': PETER_CONFIG,
  'alex-chen': ALEX_CONFIG,
  'nayan-patel': NAYAN_CONFIG,
};

// ============================================================================
// VOICE DNA LOADING
// ============================================================================

const voiceDnaCache = new Map<string, string>();

/**
 * Load voice DNA for a persona from their voice-guidance.md file
 */
async function loadVoiceDna(personaId: string): Promise<string | null> {
  // Check cache
  const cached = voiceDnaCache.get(personaId);
  if (cached) return cached;

  const config = PERSONA_CONFIGS[personaId];
  if (!config) {
    log.debug({ personaId }, 'No config found for persona');
    return null;
  }

  try {
    // Resolve path relative to this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const voicePath = join(__dirname, '..', config.voiceDnaPath);

    const voiceDna = await readFile(voicePath, 'utf-8');
    voiceDnaCache.set(personaId, voiceDna);
    log.debug({ personaId, length: voiceDna.length }, 'Loaded voice DNA');
    return voiceDna;
  } catch (error) {
    log.warn({ error: String(error), personaId }, 'Failed to load voice DNA');
    return null;
  }
}

// ============================================================================
// EXPRESSION GENERATION
// ============================================================================

// Global expression cache per persona
const expressionCache = new Map<string, GeneratedExpression[]>();
const MAX_CACHE_PER_PERSONA = 30;

// Rate limiting
let lastGenerationTime = 0;
const MIN_INTERVAL_MS = 2000; // 1 request per 2 seconds

/**
 * Generate expressions for a persona using LLM
 */
export async function generatePersonaExpressions(
  personaId: string,
  themes: string[],
  context: ExpressionContext
): Promise<GeneratedExpression[]> {
  // Rate limiting
  const now = Date.now();
  if (now - lastGenerationTime < MIN_INTERVAL_MS) {
    log.debug({ personaId }, 'Rate limited, skipping generation');
    return [];
  }
  lastGenerationTime = now;

  // Load voice DNA
  const voiceDna = await loadVoiceDna(personaId);
  if (!voiceDna) return [];

  const config = PERSONA_CONFIGS[personaId];
  if (!config) return [];

  try {
    // Dynamic import Gemini
    const { GoogleGenAI: GenAI } = await import('@google/genai');
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      log.debug('No GOOGLE_API_KEY, skipping LLM generation');
      return [];
    }

    const genai = new GenAI({ apiKey });

    // Build prompt with persona's voice DNA
    const prompt = buildPrompt(config, themes, context, voiceDna);

    const model = genai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.9,
        maxOutputTokens: 800,
      },
    });

    const response = await model;
    const text = response.text?.trim() || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.warn({ personaId }, 'Failed to parse LLM response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      theme: string;
      content: string;
      ssml?: string;
    }>;

    const expressions: GeneratedExpression[] = parsed.map((item, i) => ({
      id: `${personaId}-${item.theme}-${now}-${i}`,
      personaId,
      theme: item.theme,
      content: item.content,
      ssml: item.ssml || item.content,
      context,
      generatedAt: new Date(),
      usedCount: 0,
    }));

    // Add to cache
    addToCache(personaId, expressions);

    log.info({ personaId, count: expressions.length }, '🎭 Generated persona expressions');
    return expressions;
  } catch (error) {
    log.warn({ error: String(error), personaId }, 'LLM generation failed');
    return [];
  }
}

/**
 * Build prompt for persona expression generation
 */
function buildPrompt(
  config: PersonaExpressionConfig,
  themes: string[],
  context: ExpressionContext,
  voiceDna: string
): string {
  const themeDescriptions = themes.map((themeId) => {
    const theme = config.themes.find((t) => t.id === themeId);
    if (!theme) return '';

    return `
Theme: ${theme.name}
Style examples (DON'T copy, use as voice reference):
${theme.examples.map((e) => `- "${e}"`).join('\n')}
`;
  });

  return `${voiceDna}

---

Generate ${themes.length} unique expressions for this persona.

Context:
- Time of day: ${context.timeOfDay || 'unknown'}
- Emotional state: ${context.emotion || 'neutral'}
- Relationship: ${context.relationshipStage || 'acquaintance'}
- Topic: ${context.topic || 'general'}

Requested themes:
${themeDescriptions.join('\n')}

CRITICAL RULES:
1. Match the voice DNA EXACTLY - cadence, word choice, personality quirks
2. Keep expressions 1-2 sentences max
3. Never use AI tells like "That's interesting" or "I understand"
4. Include SSML for pauses/emotion when natural

Return JSON array:
[{ "theme": "theme_id", "content": "expression text", "ssml": "expression with SSML" }]
`;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function addToCache(personaId: string, expressions: GeneratedExpression[]): void {
  let cache = expressionCache.get(personaId);
  if (!cache) {
    cache = [];
    expressionCache.set(personaId, cache);
  }

  cache.push(...expressions);

  // Trim cache
  if (cache.length > MAX_CACHE_PER_PERSONA) {
    cache.sort((a, b) => {
      if (a.usedCount !== b.usedCount) return b.usedCount - a.usedCount;
      return a.generatedAt.getTime() - b.generatedAt.getTime();
    });
    cache.splice(0, cache.length - MAX_CACHE_PER_PERSONA);
  }
}

/**
 * Get an expression from cache for a persona
 */
export function getPersonaExpression(
  personaId: string,
  themeId: string,
  context: ExpressionContext
): GeneratedExpression | null {
  const cache = expressionCache.get(personaId) || [];

  const candidates = cache.filter((e) => {
    if (e.theme !== themeId) return false;
    if (context.emotion && e.context.emotion && e.context.emotion !== context.emotion) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Select least-used
  candidates.sort((a, b) => a.usedCount - b.usedCount);
  const selected = candidates[0];
  selected.usedCount++;

  return selected;
}

/**
 * Prewarm cache for a persona
 */
export async function prewarmPersonaExpressions(
  personaId: string,
  context: ExpressionContext
): Promise<void> {
  const config = PERSONA_CONFIGS[personaId];
  if (!config) return;

  // Pick top 3 themes to prewarm
  const themes = config.themes.slice(0, 3).map((t) => t.id);
  void generatePersonaExpressions(personaId, themes, context);

  log.debug({ personaId, themes }, 'Pre-warming persona expressions');
}

/**
 * Clear cache for a persona
 */
export function clearPersonaCache(personaId: string): void {
  expressionCache.delete(personaId);
  log.debug({ personaId }, 'Cleared persona expression cache');
}

/**
 * Check if a persona has LLM expression support
 */
export function hasPersonaExpressionSupport(personaId: string): boolean {
  return personaId in PERSONA_CONFIGS;
}

