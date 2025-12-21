/**
 * Dynamic Tool Guidance Context Builder
 *
 * Injects relevant tool usage hints based on conversation context.
 * Instead of having ALL tool instructions in the system prompt,
 * we inject only what's relevant to the current moment.
 *
 * This reduces prompt bloat and makes tool usage more likely
 * by surfacing the right tool at the right time.
 *
 * @module intelligence/context-builders/dynamic-tool-guidance
 */

import { createLogger } from '../../utils/safe-logger.js';
import { BuilderCategory } from './core/categories.js';
import {
  createInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  type ContextPriority,
} from './index.js';

const log = createLogger({ module: 'context:dynamic-tool-guidance' });

// ============================================================================
// TOOL TRIGGER PATTERNS
// ============================================================================

interface ToolTrigger {
  patterns: RegExp[];
  toolName: string;
  guidance: string;
  priority: ContextPriority;
}

const TOOL_TRIGGERS: ToolTrigger[] = [
  // MUSIC - High priority, often missed
  {
    patterns: [
      /\b(play|put on|listen to|hear)\b.*(music|song|track|album|artist)/i,
      /\b(play|put on)\b.*(jazz|rock|pop|classical|hip hop|country|r&b|indie)/i,
      /\bplay\b.*\b(bon iver|taylor swift|stevie wonder|beatles|fleetwood mac)/i,
      /\b(stressed|anxious|need.*calm|need.*relax|mood.*shift)/i,
      /\bsome (music|tunes|songs)\b/i,
      /\bput (something|music) on\b/i,
    ],
    toolName: 'playMusic',
    guidance: `[TOOL HINT: User wants music! Use playMusic tool. Brief DJ intro ("Oh, I got you...") then call the tool. Works for everyone - free previews!]`,
    priority: 'high',
  },

  // MUSIC CONTROL
  {
    patterns: [
      /\b(pause|stop|skip|next|volume|quiet|louder|softer)\b.*(music|song|that|this)/i,
      /\b(turn it|make it) (up|down|off)\b/i,
      /\bpause\b/i,
      /\bstop\b(?!.*stop.*ing)/i, // "stop" but not "stopping"
    ],
    toolName: 'musicControl',
    guidance: `[TOOL HINT: Control music with musicControl tool. Actions: pause, resume, stop, skip, volume.]`,
    priority: 'standard',
  },

  // WEATHER
  {
    patterns: [
      /\b(weather|forecast|temperature|rain|snow|sunny|cold|hot)\b/i,
      /\bwhat('s| is) it like (outside|out there)\b/i,
      /\bshould I (bring|wear|take)\b.*(jacket|umbrella|coat)/i,
    ],
    toolName: 'getWeather',
    guidance: `[TOOL HINT: Use getWeather tool for weather info.]`,
    priority: 'standard',
  },

  // SEARCH/LOOKUP
  {
    patterns: [
      /\b(look up|search|find out|google|what is|who is|when did)\b/i,
      /\bdo you know (about|if|when|where|why|how)\b/i,
      /\bcan you (find|check|look)\b/i,
    ],
    toolName: 'searchWeb',
    guidance: `[TOOL HINT: Use searchWeb tool to look things up.]`,
    priority: 'standard',
  },

  // NEWS
  {
    patterns: [
      /\b(news|happening|latest|current events)\b/i,
      /\bwhat('s| is) (going on|happening)\b.*(world|news|today)/i,
    ],
    toolName: 'getNews',
    guidance: `[TOOL HINT: Use getNews tool for current events.]`,
    priority: 'standard',
  },

  // TEAM HANDOFFS
  {
    patterns: [/\b(budget|spending|money|habits?|savings?)\b/i],
    toolName: 'handoffToMaya',
    guidance: `[TEAM HINT: Maya specializes in budgets, spending, and habits. Consider handoffToMaya if they need detailed help.]`,
    priority: 'standard',
  },
  {
    patterns: [/\b(calendar|schedule|appointment|email|meeting)\b/i],
    toolName: 'handoffToAlex',
    guidance: `[TEAM HINT: Alex handles calendar, email, and scheduling. Consider handoffToAlex for detailed help.]`,
    priority: 'standard',
  },
  {
    patterns: [/\b(invest|stock|market|portfolio|research)\b/i],
    toolName: 'handoffToPeter',
    guidance: `[TEAM HINT: Peter specializes in investments and market research. Consider handoffToPeter for detailed help.]`,
    priority: 'standard',
  },
  {
    patterns: [/\b(milestone|wedding|birthday|graduation|life event|planning)\b/i],
    toolName: 'handoffToJordan',
    guidance: `[TEAM HINT: Jordan helps with life events and milestone planning. Consider handoffToJordan for detailed help.]`,
    priority: 'standard',
  },
  {
    patterns: [
      /\b(wisdom|philosophy|meaning of life|purpose|existential|deeper questions)\b/i,
      /\bwhy (am i|are we|do we)\b/i,
      /\bwhat('s| is) the point\b/i,
    ],
    toolName: 'handoffToNayan',
    guidance: `[TEAM HINT: Nayan specializes in wisdom and philosophy. Consider handoffToNayan for deeper exploration.]`,
    priority: 'standard',
  },

  // CAMEOS - Quick pop-ins when full handoff isn't needed
  {
    patterns: [
      /\bwhat would (\w+) (say|think)\b/i,
      /\bquick (thought|insight|question) (about|on)\b/i,
      /\bhave (\w+) (weigh in|pop in|chime in)\b/i,
    ],
    toolName: 'inviteCameo',
    guidance: `[CAMEO HINT: A quick team pop-in might add value here! Use inviteCameo for a 1-2 sentence insight from a teammate, then they return to you automatically.]`,
    priority: 'standard',
  },
];

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const dynamicToolGuidanceBuilder: ContextBuilder = {
  name: 'dynamic-tool-guidance',
  description: 'Injects relevant tool usage hints based on conversation context',
  priority: 15, // Run early, high priority
  category: BuilderCategory.CONTEXT,

  // eslint-disable-next-line @typescript-eslint/require-await
  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userText } = input;

    if (!userText || userText.length < 3) {
      return [];
    }

    const injections: ContextInjection[] = [];
    const matchedTools = new Set<string>();

    // Check each trigger
    for (const trigger of TOOL_TRIGGERS) {
      // Skip if we already matched this tool
      if (matchedTools.has(trigger.toolName)) continue;

      // Check if any pattern matches
      const matches = trigger.patterns.some((pattern) => pattern.test(userText));

      if (matches) {
        matchedTools.add(trigger.toolName);

        log.debug(
          { tool: trigger.toolName, text: userText.slice(0, 50) },
          '🎯 Dynamic tool guidance triggered'
        );

        injections.push(
          createInjection(
            `tool_hint_${trigger.toolName}`,
            trigger.guidance,
            trigger.priority, // 'high' or 'normal'
            { category: 'tool-guidance' }
          )
        );
      }
    }

    // Log if music was triggered (for debugging)
    if (matchedTools.has('playMusic')) {
      log.info({ text: userText.slice(0, 100) }, '🎵 [DIAG] Music tool hint injected!');
    }

    return injections;
  },
};

// Register on module load
registerContextBuilder(dynamicToolGuidanceBuilder);

export default dynamicToolGuidanceBuilder;
