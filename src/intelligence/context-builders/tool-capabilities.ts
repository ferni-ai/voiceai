/**
 * Tool Capabilities Context Builder
 *
 * CRITICAL: This builder injects a prominent "YOUR ACTIVE CAPABILITIES" section
 * at HIGH priority so LLMs (especially Gemini) know what tools they can use.
 *
 * Why this matters:
 * - LLMs often "forget" they have tools if not reminded prominently
 * - Gemini specifically benefits from explicit capability declarations early in context
 * - Dynamic tool hints only trigger on detection; this provides always-on awareness
 *
 * This runs on EVERY turn with high priority to ensure the LLM always knows
 * it can play music, search the web, check weather, etc.
 *
 * @module intelligence/context-builders/tool-capabilities
 */

import { createLogger } from '../../utils/safe-logger.js';
import { BuilderCategory } from './categories.js';
import {
  createInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'context:tool-capabilities' });

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * Core capabilities that should always be highlighted
 * These are the tools users most often expect agents to use
 */
interface CapabilityDef {
  id: string;
  emoji: string;
  name: string;
  toolNames: string[];
  description: string;
  whenToUse: string;
}

const CORE_CAPABILITIES: CapabilityDef[] = [
  {
    id: 'music',
    emoji: '🎵',
    name: 'MUSIC',
    toolNames: ['playMusic', 'musicControl', 'musicInfo', 'pauseMusic', 'resumeMusic'],
    description: 'Play music for users - works for everyone with free previews!',
    whenToUse:
      'When user asks for music, seems stressed/anxious, needs a mood shift, or mentions an artist/song. Quick DJ intro then call playMusic.',
  },
  {
    id: 'weather',
    emoji: '🌤️',
    name: 'WEATHER',
    toolNames: ['getWeather'],
    description: 'Get current weather and forecasts.',
    whenToUse: 'When user asks about weather, temperature, or if they should bring an umbrella.',
  },
  {
    id: 'search',
    emoji: '🔍',
    name: 'SEARCH',
    toolNames: ['searchWeb'],
    description: 'Search the web for information.',
    whenToUse:
      "When user asks to look something up, wants to know current info, or asks a factual question you're unsure about.",
  },
  {
    id: 'news',
    emoji: '📰',
    name: 'NEWS',
    toolNames: ['getNews'],
    description: 'Get current news and headlines.',
    whenToUse: "When user asks what's happening in the news or current events.",
  },
  {
    id: 'memory',
    emoji: '🧠',
    name: 'MEMORY',
    toolNames: [
      'rememberAboutMe',
      'whatDoYouKnowAboutMe',
      'getRecentConversations',
      'getUserContext',
    ],
    description: 'Remember and recall information about the user.',
    whenToUse:
      'When user tells you something important about themselves, or asks what you remember.',
  },
  {
    id: 'games',
    emoji: '🎮',
    name: 'GAMES',
    toolNames: ['startGame', 'playGame', 'startTextGame'],
    description: 'Play interactive games with the user.',
    whenToUse:
      "During lighter moments, when user seems bored, or they ask to play. Music games like 'Name That Tune' are great!",
  },
];

/**
 * Team handoff capabilities (only for personas with handoff ability)
 */
const TEAM_CAPABILITIES: CapabilityDef[] = [
  {
    id: 'team-maya',
    emoji: '📊',
    name: 'MAYA (Habits & Budgets)',
    toolNames: ['handoffToMaya'],
    description: 'Specialist in habits, budgets, spending tracking, and financial routines.',
    whenToUse:
      'When user needs help with habits, budgets, spending, or wants detailed financial tracking.',
  },
  {
    id: 'team-alex',
    emoji: '📅',
    name: 'ALEX (Calendar & Email)',
    toolNames: ['handoffToAlex'],
    description: 'Specialist in calendar management, email, scheduling, and communication.',
    whenToUse: 'When user needs help with calendar, scheduling, email management, or meeting prep.',
  },
  {
    id: 'team-peter',
    emoji: '📈',
    name: 'PETER (Research & Investing)',
    toolNames: ['handoffToPeter'],
    description: 'Specialist in investment research, market analysis, and portfolio review.',
    whenToUse: 'When user asks about stocks, investments, market research, or portfolio analysis.',
  },
  {
    id: 'team-jordan',
    emoji: '🎉',
    name: 'JORDAN (Life Events)',
    toolNames: ['handoffToJordan'],
    description: 'Specialist in life milestones, celebrations, event planning.',
    whenToUse:
      'When user is planning a wedding, birthday, graduation, or other life milestone event.',
  },
  {
    id: 'team-nayan',
    emoji: '🧘',
    name: 'NAYAN (Wisdom & Philosophy)',
    toolNames: ['handoffToNayan'],
    description: 'Specialist in philosophical questions, wisdom, meaning, and deeper reflection.',
    whenToUse:
      "When user asks deep philosophical questions, seeks wisdom, or wants to explore life's meaning.",
  },
];

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build the capabilities section based on what tools are actually available
 */
function buildCapabilitiesSection(availableTools: Set<string>, personaId: string): string {
  const lines: string[] = [];

  lines.push('## 🛠️ YOUR ACTIVE CAPABILITIES - USE THESE!');
  lines.push('');
  lines.push(
    "You have real tools that do real things. Don't just talk about helping - ACTUALLY USE YOUR TOOLS:"
  );
  lines.push('');

  // Add core capabilities that are available
  for (const cap of CORE_CAPABILITIES) {
    const hasCapability = cap.toolNames.some((t) => availableTools.has(t));
    if (hasCapability) {
      lines.push(`${cap.emoji} **${cap.name}**: ${cap.description}`);
      lines.push(`   → When to use: ${cap.whenToUse}`);
      lines.push('');
    }
  }

  // Add team capabilities for coordinators (like Ferni)
  const isCoordinator = personaId === 'ferni' || availableTools.has('handoffToMaya');
  if (isCoordinator) {
    lines.push('### 👥 YOUR TEAM (Hand off for specialized help):');
    for (const cap of TEAM_CAPABILITIES) {
      const hasCapability = cap.toolNames.some((t) => availableTools.has(t));
      if (hasCapability) {
        lines.push(`${cap.emoji} **${cap.name}**: ${cap.whenToUse}`);
      }
    }
    lines.push('');
  }

  // Add critical reminder
  lines.push('### ⚡ CRITICAL TOOL USAGE RULES:');
  lines.push('- When calling a tool, do NOT announce it. Just call it silently.');
  lines.push('- For music: Brief DJ intro ("Got you..." or "Good choice...") then call playMusic.');
  lines.push('- For handoffs: Call the handoff tool IMMEDIATELY - do NOT speak first.');
  lines.push("- Process tool results naturally - don't read them verbatim.");
  lines.push('');

  return lines.join('\n');
}

export const toolCapabilitiesBuilder: ContextBuilder = {
  name: 'tool-capabilities',
  description: 'Injects prominent tool capabilities section so LLM knows what it can do',
  priority: 95, // Very high priority - should run early
  category: BuilderCategory.CONTEXT,

  // eslint-disable-next-line @typescript-eslint/require-await
  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData } = input;

    // Only inject on first few turns and then periodically to remind
    // This prevents bloating every single turn
    const turnCount = typeof userData?.turnCount === 'number' ? userData.turnCount : 1;
    const shouldInject = turnCount <= 3 || turnCount % 10 === 0;

    if (!shouldInject) {
      return [];
    }

    // Get available tools from the persona's manifest
    // We need to infer from the persona config what tools are available
    const personaId = persona?.identity?.id || 'unknown';

    // Build a set of likely available tools based on persona domains
    // In reality, this should come from the actual loaded tools, but we approximate here
    const availableTools = new Set<string>();

    // All agents have these core tools
    availableTools.add('playMusic');
    availableTools.add('musicControl');
    availableTools.add('musicInfo');
    availableTools.add('getWeather');
    availableTools.add('searchWeb');
    availableTools.add('getNews');
    availableTools.add('rememberAboutMe');
    availableTools.add('whatDoYouKnowAboutMe');

    // Ferni and coordinators have team handoffs
    if (personaId === 'ferni') {
      availableTools.add('handoffToMaya');
      availableTools.add('handoffToAlex');
      availableTools.add('handoffToPeter');
      availableTools.add('handoffToJordan');
      availableTools.add('handoffToNayan');
      availableTools.add('startGame');
    }

    const capabilitiesSection = buildCapabilitiesSection(availableTools, personaId);

    log.debug(
      { personaId, turnCount, toolCount: availableTools.size },
      '🛠️ Injecting tool capabilities section'
    );

    return [
      createInjection('tool-capabilities', capabilitiesSection, 'high', {
        category: 'tool-guidance',
        confidence: 1.0,
      }),
    ];
  },
};

// Register on module load
registerContextBuilder(toolCapabilitiesBuilder);

export default toolCapabilitiesBuilder;
