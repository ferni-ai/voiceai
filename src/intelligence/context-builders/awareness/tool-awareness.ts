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

import { isCoach } from '../../../personas/persona-ids.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import {
  createInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

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
    name: 'MUSIC → playMusic(query)',
    toolNames: ['playMusic', 'musicControl', 'musicInfo', 'pauseMusic', 'resumeMusic'],
    description: 'Play music for users - works for everyone with free 30-second previews!',
    whenToUse:
      'TRIGGERS: "play some music", "play [artist]", "play [song]", "I\'m stressed", "help me relax", "put on something [mood]", user seems anxious/overwhelmed. → Brief DJ intro then call playMusic.',
  },
  {
    id: 'weather',
    emoji: '🌤️',
    name: 'WEATHER → getWeather(location)',
    toolNames: ['getWeather'],
    description: 'Get current weather and forecasts.',
    whenToUse:
      'TRIGGERS: "what\'s the weather", "is it going to rain", "should I bring umbrella", "how cold/hot is it", "weather forecast". → Ask for location if unclear.',
  },
  {
    id: 'search',
    emoji: '🔍',
    name: 'SEARCH → searchWeb(query)',
    toolNames: ['searchWeb'],
    description: 'Search the web for information.',
    whenToUse:
      'TRIGGERS: "look up", "search for", "what is [X]", "who is [X]", "when did [X]", "can you find", any factual question you\'re unsure about. → Don\'t guess facts, search instead.',
  },
  {
    id: 'news',
    emoji: '📰',
    name: 'NEWS → getNews(topic?)',
    toolNames: ['getNews'],
    description: 'Get current news and headlines.',
    whenToUse:
      'TRIGGERS: "what\'s in the news", "what\'s happening", "current events", "any news about [topic]".',
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
      'TRIGGERS: User shares important personal info (name, family, job, goals), "what do you remember about me", "do you know my [X]".',
  },
  {
    id: 'games',
    emoji: '🎮',
    name: 'GAMES → startGame(type)',
    toolNames: ['startGame', 'playGame', 'startTextGame'],
    description: 'Play interactive games with the user.',
    whenToUse:
      'TRIGGERS: "play a game", "I\'m bored", "name that tune", "tic tac toe", "desert island discs", lighter moments, lulls in conversation.',
  },
  {
    id: 'cameo',
    emoji: '🎬',
    name: 'CAMEO → inviteCameo(personaId, context)',
    toolNames: ['inviteCameo', 'checkCameoOpportunity'],
    description: 'Quick team pop-in (1-2 sentences) then back to you. Not a full handoff.',
    whenToUse:
      'TRIGGERS: Topic in someone\'s domain but doesn\'t need full handoff, "what would [name] say", want to celebrate (Jordan!), quick wisdom (Nayan), introduce a team member.',
  },
];

/**
 * Team handoff capabilities (only for personas with handoff ability)
 */
const TEAM_CAPABILITIES: CapabilityDef[] = [
  {
    id: 'team-maya',
    emoji: '📊',
    name: 'MAYA → handoffToMaya()',
    toolNames: ['handoffToMaya'],
    description: 'Specialist in habits, budgets, spending tracking, and financial routines.',
    whenToUse:
      'TRIGGERS: "budget", "spending", "habits", "saving money", "track expenses", "financial goals". → Call immediately, don\'t speak first.',
  },
  {
    id: 'team-alex',
    emoji: '📅',
    name: 'ALEX → handoffToAlex()',
    toolNames: ['handoffToAlex'],
    description: 'Specialist in calendar management, email, scheduling, and communication.',
    whenToUse:
      'TRIGGERS: "calendar", "schedule", "email", "meeting", "appointment", "time management". → Call immediately, don\'t speak first.',
  },
  {
    id: 'team-peter',
    emoji: '📈',
    name: 'PETER → handoffToPeter()',
    toolNames: ['handoffToPeter'],
    description: 'Specialist in investment research, market analysis, and portfolio review.',
    whenToUse:
      'TRIGGERS: "stocks", "investments", "portfolio", "market", "research [company]", "should I buy/sell". → Call immediately, don\'t speak first.',
  },
  {
    id: 'team-jordan',
    emoji: '🎉',
    name: 'JORDAN → handoffToJordan()',
    toolNames: ['handoffToJordan'],
    description: 'Specialist in life milestones, celebrations, event planning.',
    whenToUse:
      'TRIGGERS: "wedding", "birthday party", "graduation", "anniversary", "planning an event", "celebration". → Call immediately, don\'t speak first.',
  },
  {
    id: 'team-nayan',
    emoji: '🧘',
    name: 'NAYAN → handoffToNayan()',
    toolNames: ['handoffToNayan'],
    description: 'Specialist in philosophical questions, wisdom, meaning, and deeper reflection.',
    whenToUse:
      'TRIGGERS: "meaning of life", "philosophy", "wisdom", "why am I here", "existential", "deeper questions". → Call immediately, don\'t speak first.',
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

  lines.push('## 🛠️ YOUR ACTIVE TOOLS - USE THEM!');
  lines.push('');
  lines.push('You have function calling. When you see these TRIGGERS, call the tool:');
  lines.push('');

  // Add core capabilities that are available
  for (const cap of CORE_CAPABILITIES) {
    const hasCapability = cap.toolNames.some((t) => availableTools.has(t));
    if (hasCapability) {
      lines.push(`${cap.emoji} **${cap.name}**`);
      lines.push(`   ${cap.whenToUse}`);
      lines.push('');
    }
  }

  // Add team capabilities for coordinators (like Ferni)
  const isCoordinator = isCoach(personaId) || availableTools.has('handoffToMaya');
  if (isCoordinator) {
    lines.push("### 👥 TEAM HANDOFFS (call immediately, don't speak first):");
    for (const cap of TEAM_CAPABILITIES) {
      const hasCapability = cap.toolNames.some((t) => availableTools.has(t));
      if (hasCapability) {
        lines.push(`${cap.emoji} **${cap.name}** - ${cap.whenToUse}`);
      }
    }
    lines.push('');
  }

  // Add critical rules
  lines.push('### ⚡ RULES:');
  lines.push("1. Silent execution - don't announce tool calls");
  lines.push('2. Music exception - brief DJ intro ("Got you...") then call playMusic');
  lines.push("3. Handoffs - call tool IMMEDIATELY, don't speak first");
  lines.push('4. If ambiguous, ask for clarification before calling');
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

    // Coordinator persona has team handoffs and cameos
    if (isCoach(personaId)) {
      availableTools.add('handoffToMaya');
      availableTools.add('handoffToAlex');
      availableTools.add('handoffToPeter');
      availableTools.add('handoffToJordan');
      availableTools.add('handoffToNayan');
      availableTools.add('startGame');
      // Cameo tools for quick team pop-ins
      availableTools.add('inviteCameo');
      availableTools.add('checkCameoOpportunity');
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
