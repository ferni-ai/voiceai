/**
 * PersonaPlex Prompt Builder
 *
 * Builds text prompts for PersonaPlex from Ferni persona bundles and context.
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  CONVERSATION_STYLE_SUFFIX,
  getVoicePromptForPersona,
  MAX_PROMPT_LENGTH,
} from './config.js';
import type { BuiltPrompt, PromptContext, ToolDescription } from './types.js';

const log = createLogger({ module: 'PersonaPlexPromptBuilder' });

// =============================================================================
// PERSONA PROMPT TEMPLATES
// =============================================================================

/**
 * Core persona descriptions for PersonaPlex text prompts.
 * These are simplified versions of our full persona bundles, optimized for PersonaPlex.
 */
const PERSONA_PROMPTS: Record<string, string> = {
  ferni: `You are Ferni, a wise and friendly life coach. You help people navigate life's challenges with warmth, wisdom, and genuine care. You listen deeply, ask thoughtful questions, and offer gentle guidance. You believe in people's potential and help them see possibilities they might miss.`,

  'maya-santos': `You are Maya, a supportive habits and routines coach. You help people build positive habits and maintain healthy routines with patience and encouragement. You understand that change takes time and celebrate small wins. You're practical, warm, and focused on sustainable progress.`,

  'alex-chen': `You are Alex, a communications specialist who helps people express themselves clearly and confidently. You assist with writing, professional communication, and interpersonal skills. You're articulate, supportive, and help people find their authentic voice.`,

  'peter-john': `You are Peter, a research specialist who loves diving deep into topics. You help people understand complex subjects by breaking them down clearly. You're curious, thorough, and enjoy exploring ideas together. You cite sources and explain your reasoning.`,

  'jordan-taylor': `You are Jordan, an event planner and celebration coordinator. You help people plan meaningful events, milestones, and gatherings. You're organized, creative, and understand the importance of marking life's moments. You bring enthusiasm and attention to detail.`,

  'nayan-patel': `You are Nayan, a wisdom keeper and philosophical guide. You draw on ancient wisdom traditions to help people find meaning and perspective. You're thoughtful, calm, and help people see the bigger picture. You ask profound questions that encourage reflection.`,
};

// =============================================================================
// PROMPT BUILDING
// =============================================================================

/**
 * Build a PersonaPlex text prompt from persona and context
 */
export async function buildPersonaPlexPrompt(
  personaId: string,
  context?: PromptContext
): Promise<BuiltPrompt> {
  const normalizedId = personaId.toLowerCase();
  const basePrompt = PERSONA_PROMPTS[normalizedId] || PERSONA_PROMPTS['ferni'];

  const sections: string[] = [basePrompt];

  // Add context sections if provided
  if (context) {
    const contextSection = buildContextSection(context);
    if (contextSection) {
      sections.push(contextSection);
    }

    const toolsSection = buildToolsSection(context.availableTools);
    if (toolsSection) {
      sections.push(toolsSection);
    }
  }

  // Add conversation style suffix
  sections.push(CONVERSATION_STYLE_SUFFIX);

  // Join and truncate if needed
  let textPrompt = sections.join('\n\n');
  if (textPrompt.length > MAX_PROMPT_LENGTH) {
    log.warn(
      { originalLength: textPrompt.length, maxLength: MAX_PROMPT_LENGTH },
      'Prompt exceeds max length, truncating'
    );
    textPrompt = `${textPrompt.slice(0, MAX_PROMPT_LENGTH - 3)}...`;
  }

  // Get voice prompt
  const voicePrompt = getVoicePromptForPersona(personaId);

  // Estimate tokens (rough: ~4 chars per token)
  const estimatedTokens = Math.ceil(textPrompt.length / 4);

  return {
    textPrompt,
    voicePrompt,
    estimatedTokens,
  };
}

/**
 * Build context section from memory and session state
 */
function buildContextSection(context: PromptContext): string | null {
  const lines: string[] = [];

  if (context.memoryContext) {
    lines.push('IMPORTANT CONTEXT ABOUT THE USER:');
    lines.push(context.memoryContext);
  }

  if (context.sessionContext) {
    lines.push('RECENT CONVERSATION:');
    lines.push(context.sessionContext);
  }

  if (context.emotionalState) {
    lines.push(`USER'S CURRENT STATE: ${context.emotionalState}`);
  }

  if (context.timeContext) {
    lines.push(`TIME CONTEXT: ${context.timeContext}`);
  }

  if (lines.length === 0) return null;

  return lines.join('\n');
}

/**
 * Build tools section describing available actions
 */
function buildToolsSection(tools?: ToolDescription[]): string | null {
  if (!tools || tools.length === 0) return null;

  const lines = [
    'AVAILABLE ACTIONS (say these phrases naturally when appropriate):',
    ...tools.map((t) => `- "${t.triggerPhrase}" → ${t.description}`),
  ];

  return lines.join('\n');
}

// =============================================================================
// CONTEXT HELPERS
// =============================================================================

/**
 * Build memory context string from user facts and preferences
 */
export function buildMemoryContext(facts: string[]): string {
  if (facts.length === 0) return '';
  return facts.map((f) => `- ${f}`).join('\n');
}

/**
 * Build session context from recent transcript
 */
export function buildSessionContext(
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>,
  maxEntries = 5
): string {
  if (transcript.length === 0) return '';

  const recent = transcript.slice(-maxEntries);
  return recent.map((t) => `${t.role === 'user' ? 'User' : 'You'}: ${t.text}`).join('\n');
}

/**
 * Build time context string
 */
export function buildTimeContext(): string {
  const now = new Date();
  const hour = now.getHours();

  let timeOfDay: string;
  if (hour < 6) timeOfDay = 'late night';
  else if (hour < 12) timeOfDay = 'morning';
  else if (hour < 17) timeOfDay = 'afternoon';
  else if (hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  const day = now.toLocaleDateString('en-US', { weekday: 'long' });

  return `It's ${timeOfDay} on ${day}`;
}

/**
 * Get default tool descriptions for a persona
 */
export function getDefaultToolDescriptions(personaId: string): ToolDescription[] {
  // Core tools available to all personas
  const coreTools: ToolDescription[] = [
    {
      name: 'music',
      triggerPhrase: "I'll play some music",
      description: 'Play background music',
    },
    {
      name: 'timer',
      triggerPhrase: "I'll set a timer",
      description: 'Set a timer for focus or relaxation',
    },
  ];

  // Persona-specific tools
  const personaTools: Record<string, ToolDescription[]> = {
    'maya-santos': [
      {
        name: 'habit-check',
        triggerPhrase: 'Let me check your habits',
        description: 'Review habit progress',
      },
    ],
    'jordan-taylor': [
      {
        name: 'calendar',
        triggerPhrase: 'Let me check your calendar',
        description: 'Check calendar events',
      },
    ],
    'peter-john': [
      {
        name: 'research',
        triggerPhrase: 'Let me look that up',
        description: 'Search for information',
      },
    ],
  };

  return [...coreTools, ...(personaTools[personaId.toLowerCase()] || [])];
}
