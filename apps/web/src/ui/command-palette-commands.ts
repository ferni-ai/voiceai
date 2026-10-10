/**
 * Default commands for the command palette.
 *
 * Every command here reaches behavior the app already has: either a direct call
 * (theme, shortcuts panel) or a `ferni:*` event that app.ts / a UI module listens for.
 *
 * @module command-palette-commands
 */

import { isTeamMemberUnlocked, type TeamMemberId } from '../services/team-unlock.service.js';
import { appState } from '../state/app.state.js';
import { toggleTheme } from '../theme/index.js';
import type { PersonaId } from '../types/persona.js';
import { showShortcutsPanel } from './keyboard-shortcuts.ui.js';

export type CommandCategory = 'actions' | 'team' | 'navigation' | 'settings';

export interface Command {
  /** Unique identifier */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Optional description */
  readonly description?: string;
  /** Trusted inline SVG markup (Lucide) */
  readonly icon?: string;
  /** Keyboard shortcut hint */
  readonly shortcut?: string;
  /** Category for grouping */
  readonly category?: CommandCategory;
  /** Action to execute */
  readonly action: () => void | Promise<void>;
  /** Keywords for fuzzy search */
  readonly keywords?: readonly string[];
  /** Whether command is available right now */
  readonly enabled?: boolean | (() => boolean);
}

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const PALETTE_ICONS = {
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  phone: svg(
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'
  ),
  phoneOff: svg(
    '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/>'
  ),
  users: svg(
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  ),
  user: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  map: svg(
    '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>'
  ),
  calendar: svg(
    '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>'
  ),
  settings: svg(
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  ),
  moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  keyboard: svg(
    '<rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/>'
  ),
  compass: svg(
    '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>'
  ),
} as const;

const emit = (name: string, detail?: unknown): void => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const isIdle = (): boolean => {
  const state = appState.get('connection');
  return state === 'disconnected' || state === 'error';
};

interface PersonaEntry {
  readonly id: PersonaId & TeamMemberId;
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

const TEAM: readonly PersonaEntry[] = [
  {
    id: 'ferni',
    name: 'Ferni',
    description: 'Your life coach',
    keywords: ['coach', 'life'],
  },
  {
    id: 'peter-john',
    name: 'Peter',
    description: 'Research & knowledge',
    keywords: ['research', 'facts'],
  },
  {
    id: 'maya-santos',
    name: 'Maya',
    description: 'Habits & routines',
    keywords: ['habits', 'routines', 'wellness'],
  },
  {
    id: 'alex-chen',
    name: 'Alex',
    description: 'Communication',
    keywords: ['communication', 'social'],
  },
  {
    id: 'jordan-taylor',
    name: 'Jordan',
    description: 'Events & milestones',
    keywords: ['events', 'planning'],
  },
  {
    id: 'nayan-patel',
    name: 'Nayan',
    description: 'Wisdom & meaning',
    keywords: ['wisdom', 'philosophy', 'meaning'],
  },
];

/** Builds the default command list. Called once per palette init. */
export function getDefaultCommands(): Command[] {
  const team: Command[] = TEAM.map((p) => ({
    id: `switch-${p.name.toLowerCase()}`,
    label: `Talk with ${p.name}`,
    description: p.description,
    icon: PALETTE_ICONS.user,
    category: 'team',
    keywords: [p.name.toLowerCase(), ...p.keywords],
    enabled: () => isTeamMemberUnlocked(p.id),
    action: () => emit('ferni:switch-persona', { persona: p.id }),
  }));

  return [
    {
      id: 'start-conversation',
      label: 'Start a conversation',
      description: 'Begin talking out loud',
      icon: PALETTE_ICONS.phone,
      shortcut: '↵',
      category: 'actions',
      keywords: ['call', 'voice', 'talk', 'connect', 'conversation'],
      enabled: isIdle,
      action: () => emit('ferni:toggle-call'),
    },
    {
      id: 'end-conversation',
      label: 'End conversation',
      icon: PALETTE_ICONS.phoneOff,
      shortcut: '↵',
      category: 'actions',
      keywords: ['hang up', 'stop', 'disconnect', 'end'],
      enabled: () => appState.get('connection') === 'connected',
      action: () => emit('ferni:toggle-call'),
    },
    ...team,
    {
      id: 'view-team',
      label: 'Meet your team',
      icon: PALETTE_ICONS.users,
      shortcut: '2',
      category: 'navigation',
      keywords: ['team', 'members', 'personas'],
      action: () => emit('ferni:open-team'),
    },
    {
      id: 'view-journey',
      label: 'Your journey',
      description: 'How far you have come',
      icon: PALETTE_ICONS.map,
      shortcut: '3',
      category: 'navigation',
      keywords: ['journey', 'progress', 'history', 'milestones'],
      action: () => emit('ferni:open-journey'),
    },
    {
      id: 'view-calendar',
      label: 'Calendar',
      icon: PALETTE_ICONS.calendar,
      category: 'navigation',
      keywords: ['calendar', 'schedule', 'events'],
      action: () => emit('ferni:open-calendar'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: PALETTE_ICONS.settings,
      shortcut: '⌘,',
      category: 'settings',
      keywords: ['settings', 'preferences', 'options'],
      action: () => emit('ferni:open-settings'),
    },
    {
      id: 'toggle-theme',
      label: 'Switch light / dark',
      icon: PALETTE_ICONS.moon,
      category: 'settings',
      keywords: ['dark', 'light', 'theme', 'mode', 'night'],
      action: () => {
        toggleTheme();
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: PALETTE_ICONS.keyboard,
      shortcut: '?',
      category: 'settings',
      keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys'],
      action: () => showShortcutsPanel(),
    },
    {
      id: 'tour',
      label: 'Take the tour',
      description: "A quick walk through what's here",
      icon: PALETTE_ICONS.compass,
      category: 'settings',
      keywords: ['help', 'tour', 'guide', 'onboarding', 'how'],
      action: () => emit('ferni:start-tour'),
    },
  ];
}
