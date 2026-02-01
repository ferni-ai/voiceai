/**
 * UI Navigation Tools
 *
 * Allows users to open UI panels and dashboards via voice commands.
 * Enables voice-activated navigation throughout the app.
 *
 * Examples:
 * - "Show me my story"
 * - "Open memory lane"
 * - "Take me to the music dashboard"
 * - "Show my calendar"
 * - "Open settings"
 *
 * @module tools/domains/ui-navigation/navigation-tools
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// PANEL DEFINITIONS
// ============================================================================

/**
 * Panel IDs that can be opened via voice commands.
 * Maps to frontend event names and human-readable labels.
 */
const PANELS = {
  'your-story': {
    label: 'Your Story',
    aliases: ['my story', 'your story', 'story', 'about me'],
  },
  'memory-lane': {
    label: 'Memory Lane',
    aliases: ['memory lane', 'memories', 'our memories', 'shared memories'],
  },
  history: {
    label: 'Conversation History',
    aliases: ['history', 'conversation history', 'past conversations', 'our conversations'],
  },
  patterns: {
    label: 'Pattern Insights',
    aliases: ['patterns', 'my patterns', 'pattern insights', 'insights'],
  },
  quiz: {
    label: 'Knowledge Quiz',
    aliases: ['quiz', 'knowledge quiz', 'how well do you know me', 'the quiz'],
  },
  music: {
    label: 'Music Dashboard',
    aliases: ['music', 'music dashboard', 'my music', 'musical me', 'our songs'],
  },
  calendar: {
    label: 'Calendar',
    aliases: ['calendar', 'my calendar', 'schedule', "what's ahead", 'upcoming'],
  },
  contacts: {
    label: 'Your People',
    aliases: ['contacts', 'my contacts', 'people', 'your people', 'my people', 'relationships'],
  },
  journal: {
    label: 'Journal',
    aliases: ['journal', 'my journal', 'chronicle', 'journaling'],
  },
  'year-with-ferni': {
    label: 'Your Year with Ferni',
    aliases: ['year with ferni', 'my year', 'year review', 'year summary', 'annual review'],
  },
  settings: {
    label: 'Settings',
    aliases: ['settings', 'menu', 'preferences', 'options'],
  },
  'guided-practices': {
    label: 'Guided Practices',
    aliases: ['practices', 'guided practices', 'rituals', 'sanctuary'],
  },
  'household-members': {
    label: 'Household Members',
    aliases: ['household', 'household members', 'family members', 'my household'],
  },
  'voice-id': {
    label: 'Voice ID Settings',
    aliases: ['voice id', 'voice enrollment', 'voice settings', 'my voice'],
  },
  notifications: {
    label: 'Notification Settings',
    aliases: ['notifications', 'notification settings', 'alerts'],
  },
} as const;

type PanelId = keyof typeof PANELS;

/**
 * Parse natural language panel request to standard panel ID
 */
function parsePanel(input: string): PanelId | null {
  const normalized = input.toLowerCase().trim();

  // Direct match on panel ID
  if (normalized in PANELS) {
    return normalized as PanelId;
  }

  // Check aliases
  for (const [panelId, config] of Object.entries(PANELS)) {
    for (const alias of config.aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return panelId as PanelId;
      }
    }
  }

  return null;
}

/**
 * Get human-readable label for a panel
 */
function getPanelLabel(panelId: PanelId): string {
  return PANELS[panelId]?.label || panelId;
}

// ============================================================================
// OPEN PANEL TOOL
// ============================================================================

const openPanelDef: ToolDefinition = {
  id: 'openPanel',
  name: 'Open Panel',
  description:
    'Opens a UI panel or dashboard by voice command. Use this when users want to see specific parts of the app.',
  domain: 'ui-navigation',
  tags: ['navigation', 'ui', 'panels', 'dashboard', 'show', 'open'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Opens a UI panel or dashboard. Call this when the user says things like:
- "Show me my story" / "Open your story"
- "Take me to memory lane" / "Show our memories"
- "Open conversation history" / "Show past conversations"
- "Show my patterns" / "Open pattern insights"
- "Let's do the quiz" / "How well do you know me"
- "Open the music dashboard" / "Show my music"
- "Show my calendar" / "What's ahead"
- "Open contacts" / "Show my people"
- "Open my journal" / "Show journaling"
- "Show my year with Ferni" / "Year review"
- "Open settings" / "Show menu"
- "Open guided practices" / "Show rituals"

The panel parameter should be what the user said (e.g., "my story", "memory lane", "calendar").`,
      parameters: z.object({
        panel: z
          .string()
          .describe(
            'The panel the user wants to open. Can be natural language like "my story", "memory lane", "calendar", "contacts"'
          ),
      }),
      execute: async ({ panel }) => {
        try {
          const panelId = parsePanel(panel);

          if (!panelId) {
            log.warn({ userId: ctx.userId, requested: panel }, '🧭 Unknown panel requested');
            return `I'm not sure which panel you mean by "${panel}". You can ask me to show things like "my story", "memory lane", "calendar", "music dashboard", or "settings".`;
          }

          // Import broadcast service dynamically to avoid circular deps
          const { broadcastUserEvent } = await import('../../../services/user-events/index.js');

          // Broadcast panel open event to UI
          if (ctx.userId) {
            await broadcastUserEvent(ctx.userId, 'show_view', {
              view: panelId,
            });
          }

          const label = getPanelLabel(panelId);
          log.info(
            { userId: ctx.userId, panelId, label, requested: panel },
            '🧭 Opening panel via voice'
          );

          // Human-friendly confirmations
          const confirmations: Record<PanelId, string> = {
            'your-story': "Here's your story - everything I know about you.",
            'memory-lane': "Opening Memory Lane - let's take a walk through our shared history.",
            history: 'Here are our past conversations.',
            patterns: "I'll show you the patterns I've noticed about you.",
            quiz: "Let's see how well I know you! Opening the quiz.",
            music: "Here's your music dashboard - our musical journey together.",
            calendar: "Here's what's ahead on your calendar.",
            contacts: "Opening Your People - everyone important to you.",
            journal: 'Here is your journal.',
            'year-with-ferni': "Here's your year with me - what a journey!",
            settings: 'Opening settings.',
            'guided-practices': "Here are your guided practices and rituals.",
            'household-members': "Here's your household.",
            'voice-id': 'Opening Voice ID settings.',
            notifications: 'Opening notification settings.',
          };

          return confirmations[panelId] || `Opening ${label}...`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, panel },
            '🧭 Failed to open panel'
          );
          return "I had trouble opening that. You can also find it in the menu if you'd like.";
        }
      },
    });
  },
};

// ============================================================================
// CLOSE PANEL TOOL
// ============================================================================

const closePanelDef: ToolDefinition = {
  id: 'closePanel',
  name: 'Close Panel',
  description: 'Closes the currently open panel. Use this when users want to dismiss a view.',
  domain: 'ui-navigation',
  tags: ['navigation', 'ui', 'close', 'dismiss'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Closes the currently open panel or modal. Call this when the user says:
- "Close this"
- "Go back"
- "Never mind"
- "Dismiss"`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { broadcastUserEvent } = await import('../../../services/user-events/index.js');

          if (ctx.userId) {
            await broadcastUserEvent(ctx.userId, 'show_view', {
              view: 'close',
            });
          }

          log.info({ userId: ctx.userId }, '🧭 Closing panel via voice');

          return 'Done.';
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, '🧭 Failed to close panel');
          return 'You can tap the X to close it.';
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const navigationToolDefinitions = [openPanelDef, closePanelDef];
