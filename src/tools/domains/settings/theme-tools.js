/**
 * Theme Preference Tools
 *
 * Allows users to switch visual themes via voice commands.
 *
 * Examples:
 * - "Switch to dark mode"
 * - "Make it lighter"
 * - "Use system theme"
 * - "Night mode please"
 *
 * @module tools/domains/settings/theme-tools
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
const THEME_ALIASES = {
    // Dark mode
    dark: 'dark',
    'dark mode': 'dark',
    night: 'dark',
    'night mode': 'dark',
    darker: 'dark',
    dim: 'dark',
    // Light mode
    light: 'light',
    'light mode': 'light',
    day: 'light',
    'day mode': 'light',
    bright: 'light',
    brighter: 'light',
    lighter: 'light',
    // Auto/system
    auto: 'auto',
    automatic: 'auto',
    system: 'auto',
    'system theme': 'auto',
    default: 'auto',
};
/**
 * Parse natural language theme request to standard theme value
 */
function parseTheme(input) {
    const normalized = input.toLowerCase().trim();
    // Direct match
    if (THEME_ALIASES[normalized]) {
        return THEME_ALIASES[normalized];
    }
    // Fuzzy match
    if (normalized.includes('dark') || normalized.includes('night')) {
        return 'dark';
    }
    if (normalized.includes('light') || normalized.includes('day') || normalized.includes('bright')) {
        return 'light';
    }
    if (normalized.includes('auto') || normalized.includes('system')) {
        return 'auto';
    }
    // Default to auto if unclear
    return 'auto';
}
// ============================================================================
// SET THEME TOOL
// ============================================================================
const setThemeDef = {
    id: 'setTheme',
    name: 'Set Theme',
    description: 'Changes the visual theme (dark/light/auto) for the app. Call this when the user wants to change the app appearance.',
    domain: 'settings',
    tags: ['theme', 'preferences', 'accessibility', 'dark-mode', 'appearance'],
    create: (ctx) => {
        return llm.tool({
            description: `Set the visual theme for the app. Call this when the user says things like:
- "Switch to dark mode"
- "Make it lighter" / "light mode"
- "Use system theme" / "auto"
- "Night mode" / "day mode"
- "Turn on dark theme"
- "I want it darker/brighter"

The theme parameter should be what the user said (e.g., "dark mode", "lighter", "system").`,
            parameters: z.object({
                theme: z
                    .string()
                    .describe('The theme the user requested. Can be natural language like "darker", "night mode", "system theme"'),
            }),
            execute: async ({ theme }) => {
                try {
                    const normalizedTheme = parseTheme(theme);
                    // Import broadcast service dynamically to avoid circular deps
                    const { broadcastUserEvent, persistThemePreference } = await import('../../../services/user-events/index.js');
                    // Broadcast theme change to UI
                    if (ctx.userId) {
                        await broadcastUserEvent(ctx.userId, 'theme_change', {
                            theme: normalizedTheme,
                            source: 'voice',
                        });
                        // Persist preference
                        await persistThemePreference(ctx.userId, normalizedTheme);
                    }
                    log.info({ userId: ctx.userId, theme: normalizedTheme, requested: theme }, '🎨 Theme switched via voice');
                    // Human-friendly confirmations
                    const confirmations = {
                        dark: "Done! I've switched to dark mode. Easier on the eyes, especially at night.",
                        light: 'There we go - light mode activated. Nice and bright!',
                        auto: "Got it - I'll follow your system settings now, so it'll match whatever your device is using.",
                    };
                    return confirmations[normalizedTheme];
                }
                catch (error) {
                    log.error({ error: String(error), userId: ctx.userId, theme }, '🎨 Failed to switch theme');
                    return "I had trouble switching themes. You can also change it in the settings menu if you'd like.";
                }
            },
        });
    },
};
// ============================================================================
// GET CURRENT THEME TOOL
// ============================================================================
const getCurrentThemeDef = {
    id: 'getCurrentTheme',
    name: 'Get Current Theme',
    description: 'Gets the current theme setting. Call this when the user asks about their current theme.',
    domain: 'settings',
    tags: ['theme', 'preferences', 'status'],
    create: (ctx) => {
        return llm.tool({
            description: `Get the current theme setting. Call this when the user asks:
- "What theme am I using?"
- "Is dark mode on?"
- "What's my current theme?"`,
            parameters: z.object({}),
            execute: async () => {
                try {
                    const { getThemePreference } = await import('../../../services/user-events/index.js');
                    const theme = ctx.userId ? await getThemePreference(ctx.userId) : 'auto';
                    log.info({ userId: ctx.userId, theme }, '🎨 Reporting current theme');
                    const descriptions = {
                        dark: "You're currently using dark mode.",
                        light: "You're using light mode right now.",
                        auto: "You're set to auto, which follows your device's system theme.",
                    };
                    return `${descriptions[theme]} Would you like to change it?`;
                }
                catch (error) {
                    log.error({ error: String(error), userId: ctx.userId }, '🎨 Failed to get current theme');
                    return "I'm not sure what theme you're using. You can check in the settings menu.";
                }
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const themeToolDefinitions = [setThemeDef, getCurrentThemeDef];
export const { getToolDefinitions, domain, definitions } = createDomainExport('settings', themeToolDefinitions);
//# sourceMappingURL=theme-tools.js.map