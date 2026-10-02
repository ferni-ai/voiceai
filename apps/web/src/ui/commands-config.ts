/**
 * Commands panel - types, copy and icon mapping. Extracted from commands.ui.ts.
 */

import { ICONS } from './engagement-components.js';

export interface Command {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  shortcut?: string;
  requiresConfirmation?: boolean;
  hasArguments?: boolean;
}

export interface CommandsUICallbacks {
  onClose?: () => void;
  onCommandSelected?: (command: Command, renderedPrompt: string) => void;
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

export const COMMANDS_COPY = {
  title: 'Guided Practices',
  intro: 'Choose a guided conversation to begin',
  emptyState: {
    title: 'No practices yet',
    message: "Guided practices will appear here based on who you're talking to",
  },
  loading: 'Finding practices...',
  error: {
    title: 'Something went wrong',
    message: "Couldn't load practices. Try again?",
    retry: 'Try again',
  },
  categories: {
    'check-in': 'Check-ins',
    reflection: 'Reflection',
    action: 'Take Action',
    review: 'Reviews',
    planning: 'Planning',
    default: 'Practices',
  },
  buttons: {
    close: 'Close',
    start: 'Start',
  },
};

// Icon mapping for command categories and icons
export const COMMAND_ICONS: Record<string, string> = {
  // Categories
  'check-in': ICONS.sunny,
  reflection: ICONS.cloudy,
  action: ICONS.flame,
  review: ICONS.calendar,
  planning: ICONS.calendar,
  // Specific icons
  sunrise: ICONS.sunny,
  moon: ICONS.cloudy,
  calendar: ICONS.calendar,
  lightbulb: ICONS.flame,
  heart: ICONS.heart,
  plus: ICONS.plus,
  clock: ICONS.clock,
};

export function getCommandIcon(command: Command): string {
  // Try specific icon first, then category, then default
  if (command.icon) {
    const iconMatch = COMMAND_ICONS[command.icon];
    if (iconMatch) return iconMatch;
  }
  const categoryIcon = COMMAND_ICONS[command.category];
  if (categoryIcon) return categoryIcon;
  return ICONS.clock;
}
