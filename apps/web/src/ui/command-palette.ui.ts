/**
 * Command Palette (⌘K / Ctrl+K)
 *
 * Linear/Vercel-style fuzzy search command palette.
 * Quick access to everything in Ferni.
 *
 * @module @ferni/command-palette
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { trapFocus, announce } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CommandPalette');

// ============================================================================
// TYPES
// ============================================================================

export interface Command {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Lucide icon name or SVG */
  icon?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Category for grouping */
  category?: 'navigation' | 'actions' | 'team' | 'settings' | 'dev';
  /** Action to execute */
  action: () => void | Promise<void>;
  /** Keywords for fuzzy search */
  keywords?: string[];
  /** Whether command is available */
  enabled?: boolean | (() => boolean);
}

export interface CommandPaletteOptions {
  /** Custom commands to add */
  commands?: Command[];
  /** Placeholder text */
  placeholder?: string;
  /** Max results to show */
  maxResults?: number;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  map: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  help: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ============================================================================
// DEFAULT COMMANDS
// ============================================================================

function getDefaultCommands(): Command[] {
  return [
    {
      id: 'call-ferni',
      label: 'Talk to Ferni',
      description: 'Start a voice conversation',
      icon: ICONS.phone,
      shortcut: 'Enter',
      category: 'actions',
      keywords: ['call', 'voice', 'talk', 'chat', 'conversation'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:start-call'));
      },
    },
    {
      id: 'switch-ferni',
      label: 'Switch to Ferni',
      description: 'Your life coach',
      icon: ICONS.user,
      category: 'team',
      keywords: ['ferni', 'coach', 'life'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'ferni' } }));
      },
    },
    {
      id: 'switch-peter',
      label: 'Switch to Peter',
      description: 'Research & knowledge',
      icon: ICONS.user,
      category: 'team',
      keywords: ['peter', 'research', 'knowledge', 'facts'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'peter' } }));
      },
    },
    {
      id: 'switch-maya',
      label: 'Switch to Maya',
      description: 'Habits & routines',
      icon: ICONS.user,
      category: 'team',
      keywords: ['maya', 'habits', 'routines', 'wellness'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'maya' } }));
      },
    },
    {
      id: 'switch-alex',
      label: 'Switch to Alex',
      description: 'Communication coach',
      icon: ICONS.user,
      category: 'team',
      keywords: ['alex', 'communication', 'social'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'alex' } }));
      },
    },
    {
      id: 'switch-jordan',
      label: 'Switch to Jordan',
      description: 'Event planning & milestones',
      icon: ICONS.user,
      category: 'team',
      keywords: ['jordan', 'events', 'planning', 'milestones'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'jordan' } }));
      },
    },
    {
      id: 'switch-nayan',
      label: 'Switch to Nayan',
      description: 'Wisdom & philosophy',
      icon: ICONS.user,
      category: 'team',
      keywords: ['nayan', 'wisdom', 'philosophy', 'meaning'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'nayan' } }));
      },
    },
    {
      id: 'view-team',
      label: 'View your team',
      description: 'See all team members',
      icon: ICONS.users,
      category: 'navigation',
      keywords: ['team', 'members', 'personas'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:open-team'));
      },
    },
    {
      id: 'view-journey',
      label: 'View your journey',
      description: 'See your progress',
      icon: ICONS.map,
      category: 'navigation',
      keywords: ['journey', 'progress', 'history', 'milestones'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:open-journey'));
      },
    },
    {
      id: 'view-calendar',
      label: 'View calendar',
      icon: ICONS.calendar,
      category: 'navigation',
      keywords: ['calendar', 'schedule', 'events'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:open-calendar'));
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: ICONS.settings,
      shortcut: ',',
      category: 'navigation',
      keywords: ['settings', 'preferences', 'options', 'config'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:open-settings'));
      },
    },
    {
      id: 'toggle-theme',
      label: 'Toggle dark mode',
      icon: ICONS.moon,
      category: 'settings',
      keywords: ['dark', 'light', 'theme', 'mode', 'color'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:toggle-theme'));
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: ICONS.keyboard,
      shortcut: '?',
      category: 'settings',
      keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:show-shortcuts'));
      },
    },
    {
      id: 'help',
      label: 'Get help',
      icon: ICONS.help,
      category: 'settings',
      keywords: ['help', 'support', 'faq', 'contact'],
      action: () => {
        window.dispatchEvent(new CustomEvent('ferni:open-help'));
      },
    },
  ];
}

// ============================================================================
// STATE
// ============================================================================

let palette: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let searchInput: HTMLInputElement | null = null;
let resultsContainer: HTMLElement | null = null;
let commands: Command[] = [];
let filteredCommands: Command[] = [];
let selectedIndex = 0;
let isOpen = false;
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;

const options: CommandPaletteOptions = {
  placeholder: 'Type a command or search...',
  maxResults: 8,
};

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  if (typeof document === 'undefined') return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-command-palette';
  styleElement.textContent = `
    /* ============================================
       COMMAND PALETTE
       ============================================ */

    .command-palette {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
      opacity: 0;
      visibility: hidden;
      transition: 
        opacity ${DURATION.FAST}ms ${EASING.STANDARD},
        visibility ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .command-palette--open {
      opacity: 1;
      visibility: visible;
    }

    .command-palette__backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-light, rgba(44, 37, 32, 0.3));
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .command-palette__container {
      position: relative;
      width: 100%;
      max-width: 560px;
      margin: 0 var(--space-4, 16px);
      background: var(--color-background-elevated, white);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-xl, 16px);
      box-shadow: 
        0 20px 40px rgba(0, 0, 0, 0.15),
        0 8px 16px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      transform: translateY(-20px) scale(0.98);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .command-palette--open .command-palette__container {
      transform: translateY(0) scale(1);
    }

    /* Search input */
    .command-palette__search {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .command-palette__search-icon {
      color: var(--color-text-muted, #756A5E);
      flex-shrink: 0;
    }

    .command-palette__input {
      flex: 1;
      border: none;
      background: transparent;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-primary, #2C2520);
      outline: none;
    }

    .command-palette__input::placeholder {
      color: var(--color-text-muted, #756A5E);
    }

    .command-palette__shortcut {
      font-family: var(--font-mono, monospace);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-sm, 4px);
    }

    /* Results */
    .command-palette__results {
      max-height: 320px;
      overflow-y: auto;
      padding: var(--space-2, 8px);
    }

    .command-palette__empty {
      padding: var(--space-8, 32px);
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--text-sm, 14px);
    }

    /* Category group */
    .command-palette__category {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Command item */
    .command-palette__item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .command-palette__item:hover,
    .command-palette__item--selected {
      background: var(--color-background-secondary, #F5F1E8);
    }

    .command-palette__item--selected {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }

    .command-palette__item-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary, #5C544A);
      flex-shrink: 0;
    }

    .command-palette__item--selected .command-palette__item-icon {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .command-palette__item-content {
      flex: 1;
      min-width: 0;
    }

    .command-palette__item-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-primary, #2C2520);
    }

    .command-palette__item-description {
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted);
      margin-top: 2px;
    }

    .command-palette__item-shortcut {
      font-family: var(--font-mono, monospace);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted);
      padding: 2px var(--space-2, 8px);
      background: var(--color-background-tertiary, #E8E0D5);
      border-radius: var(--radius-sm, 4px);
    }

    /* Footer */
    .command-palette__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border-top: 1px solid var(--color-border-subtle);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted);
    }

    .command-palette__footer-hints {
      display: flex;
      gap: var(--space-4, 16px);
    }

    .command-palette__footer-hint {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
    }

    .command-palette__footer-hint kbd {
      font-family: var(--font-mono, monospace);
      padding: 2px 6px;
      background: var(--color-background-secondary);
      border-radius: var(--radius-xs, 2px);
    }

    /* Dark theme */
    [data-theme="midnight"] .command-palette__backdrop {
      background: var(--backdrop-heavy, rgba(20, 18, 16, 0.6));
    }

    [data-theme="midnight"] .command-palette__container {
      background: var(--color-background-elevated, #70605a);
      border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    [data-theme="midnight"] .command-palette__item:hover,
    [data-theme="midnight"] .command-palette__item--selected {
      background: var(--color-background-secondary, #60504a);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .command-palette,
      .command-palette__container {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
  log.debug('Command palette styles injected');
}

// ============================================================================
// FUZZY SEARCH
// ============================================================================

function fuzzyMatch(query: string, text: string): boolean {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Direct match
  if (textLower.includes(queryLower)) return true;

  // Fuzzy match - all query chars in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

function searchCommands(query: string): Command[] {
  if (!query.trim()) {
    return commands.filter((cmd) => isCommandEnabled(cmd)).slice(0, options.maxResults);
  }

  const results = commands.filter((cmd) => {
    if (!isCommandEnabled(cmd)) return false;

    // Check label
    if (fuzzyMatch(query, cmd.label)) return true;

    // Check description
    if (cmd.description && fuzzyMatch(query, cmd.description)) return true;

    // Check keywords
    if (cmd.keywords?.some((kw) => fuzzyMatch(query, kw))) return true;

    return false;
  });

  return results.slice(0, options.maxResults);
}

function isCommandEnabled(cmd: Command): boolean {
  if (cmd.enabled === undefined) return true;
  if (typeof cmd.enabled === 'function') return cmd.enabled();
  return cmd.enabled;
}

// ============================================================================
// RENDER
// ============================================================================

function createPalette(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'command-palette';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Command palette');

  el.innerHTML = `
    <div class="command-palette__backdrop"></div>
    <div class="command-palette__container">
      <div class="command-palette__search">
        <span class="command-palette__search-icon">${ICONS.search}</span>
        <input
          type="text"
          class="command-palette__input"
          placeholder="${options.placeholder}"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="command-palette__shortcut">esc</span>
      </div>
      <div class="command-palette__results" role="listbox"></div>
      <div class="command-palette__footer">
        <div class="command-palette__footer-hints">
          <span class="command-palette__footer-hint"><kbd>↑↓</kbd> navigate</span>
          <span class="command-palette__footer-hint"><kbd>↵</kbd> select</span>
          <span class="command-palette__footer-hint"><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  `;

  return el;
}

function renderResults(): void {
  if (!resultsContainer) return;

  if (filteredCommands.length === 0) {
    resultsContainer.innerHTML = `<div class="command-palette__empty">No commands found</div>`;
    return;
  }

  // Group by category
  const grouped = new Map<string, Command[]>();
  for (const cmd of filteredCommands) {
    const cat = cmd.category || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(cmd);
  }

  let html = '';
  let index = 0;

  for (const [category, cmds] of grouped) {
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    html += `<div class="command-palette__category">${categoryLabel}</div>`;

    for (const cmd of cmds) {
      const isSelected = index === selectedIndex;
      html += `
        <div 
          class="command-palette__item ${isSelected ? 'command-palette__item--selected' : ''}"
          role="option"
          aria-selected="${isSelected}"
          data-command-id="${cmd.id}"
          data-index="${index}"
        >
          <div class="command-palette__item-icon">${cmd.icon || ''}</div>
          <div class="command-palette__item-content">
            <div class="command-palette__item-label">${cmd.label}</div>
            ${cmd.description ? `<div class="command-palette__item-description">${cmd.description}</div>` : ''}
          </div>
          ${cmd.shortcut ? `<span class="command-palette__item-shortcut">${cmd.shortcut}</span>` : ''}
        </div>
      `;
      index++;
    }
  }

  resultsContainer.innerHTML = html;

  // Scroll selected into view
  const selectedEl = resultsContainer.querySelector('.command-palette__item--selected');
  selectedEl?.scrollIntoView({ block: 'nearest' });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleInput(e: Event): void {
  const query = (e.target as HTMLInputElement).value;
  filteredCommands = searchCommands(query);
  selectedIndex = 0;
  renderResults();
}

function handleKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
      renderResults();
      break;

    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults();
      break;

    case 'Enter':
      e.preventDefault();
      executeSelected();
      break;

    case 'Escape':
      e.preventDefault();
      close();
      break;
  }
}

function handleResultClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-command-id]') as HTMLElement;
  if (!target) return;

  const index = parseInt(target.dataset.index || '0', 10);
  selectedIndex = index;
  executeSelected();
}

function executeSelected(): void {
  const cmd = filteredCommands[selectedIndex];
  if (!cmd) return;

  close();

  // Execute after close animation
  setTimeout(() => {
    try {
      cmd.action();
      log.info('Command executed', { id: cmd.id });
    } catch (error) {
      log.error('Command failed', { id: cmd.id, error });
    }
  }, 100);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize command palette
 */
export function initCommandPalette(opts: CommandPaletteOptions = {}): void {
  if (palette) return;
  if (typeof document === 'undefined') return;

  Object.assign(options, opts);

  injectStyles();

  // Set up commands
  commands = [...getDefaultCommands(), ...(opts.commands || [])];

  // Create palette
  palette = createPalette();
  document.body.appendChild(palette);

  // Get references
  searchInput = palette.querySelector('.command-palette__input');
  resultsContainer = palette.querySelector('.command-palette__results');

  // Event listeners
  searchInput?.addEventListener('input', handleInput);
  palette.addEventListener('keydown', handleKeydown);
  resultsContainer?.addEventListener('click', handleResultClick);
  palette.querySelector('.command-palette__backdrop')?.addEventListener('click', close);

  // Global keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
    }
  });

  log.info('Command palette initialized', { commandCount: commands.length });
}

/**
 * Open command palette
 */
export function open(): void {
  if (!palette || isOpen) return;

  // Store current focus
  previousActiveElement = document.activeElement as HTMLElement;

  // Reset state
  filteredCommands = searchCommands('');
  selectedIndex = 0;

  // Show palette
  isOpen = true;
  palette.classList.add('command-palette--open');

  // Focus input
  requestAnimationFrame(() => {
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    renderResults();
  });

  // Set up focus trap
  const container = palette.querySelector('.command-palette__container') as HTMLElement;
  if (container) {
    focusTrapCleanup = trapFocus(container);
  }

  announce('Command palette opened');
  log.debug('Command palette opened');
}

/**
 * Close command palette
 */
export function close(): void {
  if (!palette || !isOpen) return;

  isOpen = false;
  palette.classList.remove('command-palette--open');

  // Clean up focus trap
  focusTrapCleanup?.();
  focusTrapCleanup = null;

  // Restore focus
  previousActiveElement?.focus();

  announce('Command palette closed');
  log.debug('Command palette closed');
}

/**
 * Toggle command palette
 */
export function toggle(): void {
  if (isOpen) {
    close();
  } else {
    open();
  }
}

/**
 * Register a new command
 */
export function registerCommand(command: Command): void {
  commands.push(command);
  log.debug('Command registered', { id: command.id });
}

/**
 * Unregister a command
 */
export function unregisterCommand(id: string): void {
  commands = commands.filter((cmd) => cmd.id !== id);
  log.debug('Command unregistered', { id });
}

/**
 * Check if palette is open
 */
export function isCommandPaletteOpen(): boolean {
  return isOpen;
}

/**
 * Dispose command palette
 */
export function disposeCommandPalette(): void {
  close();

  if (palette) {
    palette.remove();
    palette = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  commands = [];
  filteredCommands = [];
  searchInput = null;
  resultsContainer = null;

  log.debug('Command palette disposed');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const commandPalette = {
  init: initCommandPalette,
  open,
  close,
  toggle,
  register: registerCommand,
  unregister: unregisterCommand,
  isOpen: isCommandPaletteOpen,
  dispose: disposeCommandPalette,
};

