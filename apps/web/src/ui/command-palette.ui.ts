/**
 * Command Palette (⌘K / Ctrl+K)
 *
 * Centered floating search over the things you can do in Ferni. Initialized from
 * app.ts alongside the global keyboard shortcuts.
 *
 * Accessibility: role="dialog" + aria-modal, the input is a combobox that owns a
 * listbox and points at the highlighted option with aria-activedescendant; focus
 * is trapped while open and restored on close.
 *
 * @module command-palette
 */

import { DURATION } from '../config/animation-constants.js';
import { announce, trapFocus } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';
import {
  getDefaultCommands,
  PALETTE_ICONS,
  type Command,
  type CommandCategory,
} from './command-palette-commands.js';
import { COMMAND_PALETTE_CSS, COMMAND_PALETTE_STYLE_ID } from './command-palette-styles.js';

export type { Command, CommandCategory } from './command-palette-commands.js';

const log = createLogger('CommandPalette');

export interface CommandPaletteOptions {
  /** Extra commands appended after the defaults */
  readonly commands?: readonly Command[];
  /** Max results to show */
  readonly maxResults?: number;
}

const ROOT_CLASS = 'command-palette';
const OPEN_CLASS = 'command-palette--open';
const SELECTED_CLASS = 'command-palette__item--selected';
const LISTBOX_ID = 'command-palette-listbox';
const OPTION_ID_PREFIX = 'command-palette-option-';
const TITLE_ID = 'command-palette-title';
const DEFAULT_MAX_RESULTS = 20;

const CATEGORY_ORDER: readonly CommandCategory[] = ['actions', 'team', 'navigation', 'settings'];
const CATEGORY_LABELS: Readonly<Record<CommandCategory, string>> = {
  actions: 'Right now',
  team: 'Your team',
  navigation: 'Go to',
  settings: 'Settings',
};

// ============================================================================
// STATE
// ============================================================================

let palette: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let resultsContainer: HTMLElement | null = null;
let commands: Command[] = [];
let filteredCommands: Command[] = [];
let selectedIndex = 0;
let isOpen = false;
let maxResults = DEFAULT_MAX_RESULTS;
let listeners: AbortController | null = null;
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;

// ============================================================================
// SEARCH
// ============================================================================

function isSubsequence(query: string, text: string): boolean {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

function isCommandEnabled(cmd: Command): boolean {
  if (cmd.enabled === undefined) return true;
  return typeof cmd.enabled === 'function' ? cmd.enabled() : cmd.enabled;
}

function matchesQuery(cmd: Command, query: string): boolean {
  const label = cmd.label.toLowerCase();
  if (label.includes(query) || isSubsequence(query, label)) return true;
  if (cmd.description?.toLowerCase().includes(query)) return true;
  return cmd.keywords?.some((kw) => kw.toLowerCase().includes(query)) ?? false;
}

function categoryRank(cmd: Command): number {
  const rank = CATEGORY_ORDER.indexOf(cmd.category ?? 'settings');
  return rank === -1 ? CATEGORY_ORDER.length : rank;
}

/**
 * Returns enabled commands matching `query`, ordered by category so the flat
 * index matches the grouped render order.
 */
export function searchCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  return commands
    .filter((cmd) => isCommandEnabled(cmd) && (q === '' || matchesQuery(cmd, q)))
    .sort((a, b) => categoryRank(a) - categoryRank(b))
    .slice(0, maxResults);
}

// ============================================================================
// RENDER
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.getElementById(COMMAND_PALETTE_STYLE_ID)?.remove();
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.id = COMMAND_PALETTE_STYLE_ID;
  style.textContent = COMMAND_PALETTE_CSS;
  document.head.appendChild(style);
}

function createPalette(): HTMLElement {
  const el = document.createElement('div');
  el.className = ROOT_CLASS;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', TITLE_ID);
  el.innerHTML = `
    <div class="command-palette__backdrop"></div>
    <div class="command-palette__card">
      <h2 id="${TITLE_ID}" class="command-palette__sr-only">Quick actions</h2>
      <div class="command-palette__search">
        <span class="command-palette__search-icon">${PALETTE_ICONS.search}</span>
        <input
          type="text"
          class="command-palette__input"
          role="combobox"
          aria-expanded="true"
          aria-controls="${LISTBOX_ID}"
          aria-autocomplete="list"
          aria-label="Search actions"
          placeholder="What would you like to do?"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="command-palette__close" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="command-palette__results" id="${LISTBOX_ID}" role="listbox" aria-label="Actions"></div>
      <div class="command-palette__footer" aria-hidden="true">
        <span><kbd class="command-palette__kbd">↑↓</kbd> move</span>
        <span><kbd class="command-palette__kbd">↵</kbd> choose</span>
        <span><kbd class="command-palette__kbd">esc</kbd> close</span>
      </div>
    </div>
  `;
  return el;
}

function createOption(cmd: Command, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'command-palette__item';
  item.id = `${OPTION_ID_PREFIX}${index}`;
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', 'false');
  item.dataset.index = String(index);
  item.dataset.commandId = cmd.id;

  const icon = document.createElement('span');
  icon.className = 'command-palette__item-icon';
  icon.innerHTML = cmd.icon ?? '';

  const content = document.createElement('span');
  content.className = 'command-palette__item-content';
  const label = document.createElement('span');
  label.className = 'command-palette__item-label';
  label.textContent = cmd.label;
  content.appendChild(label);
  if (cmd.description) {
    const desc = document.createElement('span');
    desc.className = 'command-palette__item-description';
    desc.textContent = cmd.description;
    content.appendChild(desc);
  }

  item.append(icon, content);
  if (cmd.shortcut) {
    const kbd = document.createElement('kbd');
    kbd.className = 'command-palette__kbd';
    kbd.textContent = cmd.shortcut;
    kbd.setAttribute('aria-hidden', 'true');
    item.appendChild(kbd);
  }
  return item;
}

function renderResults(): void {
  if (!resultsContainer) return;
  resultsContainer.replaceChildren();

  if (filteredCommands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'command-palette__empty';
    empty.textContent = 'Nothing matches that yet';
    resultsContainer.appendChild(empty);
    updateSelection();
    return;
  }

  let group: HTMLElement | null = null;
  let currentCategory: CommandCategory | null = null;
  filteredCommands.forEach((cmd, index) => {
    const category = cmd.category ?? 'settings';
    if (!group || category !== currentCategory) {
      currentCategory = category;
      group = document.createElement('div');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', CATEGORY_LABELS[category]);
      const heading = document.createElement('div');
      heading.className = 'command-palette__category';
      heading.setAttribute('aria-hidden', 'true');
      heading.textContent = CATEGORY_LABELS[category];
      group.appendChild(heading);
      resultsContainer?.appendChild(group);
    }
    group.appendChild(createOption(cmd, index));
  });
  updateSelection();
}

function updateSelection(): void {
  if (!resultsContainer || !searchInput) return;
  resultsContainer.querySelectorAll<HTMLElement>('[role="option"]').forEach((el) => {
    const isSelected = Number(el.dataset.index) === selectedIndex;
    el.classList.toggle(SELECTED_CLASS, isSelected);
    el.setAttribute('aria-selected', String(isSelected));
    if (isSelected) el.scrollIntoView?.({ block: 'nearest' });
  });
  if (filteredCommands[selectedIndex]) {
    searchInput.setAttribute('aria-activedescendant', `${OPTION_ID_PREFIX}${selectedIndex}`);
  } else {
    searchInput.removeAttribute('aria-activedescendant');
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleInput(): void {
  filteredCommands = searchCommands(searchInput?.value ?? '');
  selectedIndex = 0;
  renderResults();
  announce(filteredCommands.length === 0 ? 'No matches' : `${filteredCommands.length} results`);
}

function moveSelection(next: number): void {
  const count = filteredCommands.length;
  if (count === 0) return;
  selectedIndex = (next + count) % count;
  updateSelection();
}

function handlePaletteKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(selectedIndex + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveSelection(selectedIndex - 1);
      break;
    case 'Home':
      e.preventDefault();
      moveSelection(0);
      break;
    case 'End':
      e.preventDefault();
      moveSelection(filteredCommands.length - 1);
      break;
    case 'Enter':
      if ((e.target as HTMLElement | null)?.closest('.command-palette__close')) return;
      e.preventDefault();
      executeSelected();
      break;
    case 'Escape':
      // Other Escape handlers (open modals, live call) must not also fire.
      e.preventDefault();
      e.stopPropagation();
      close();
      break;
  }
}

function handleResultClick(e: Event): void {
  const option = (e.target as HTMLElement | null)?.closest<HTMLElement>('[role="option"]');
  if (!option) return;
  selectedIndex = Number(option.dataset.index);
  executeSelected();
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
  if (e.key.toLowerCase() !== 'k') return;
  e.preventDefault();
  toggle();
}

async function runCommand(cmd: Command): Promise<void> {
  try {
    await cmd.action();
    log.info('Command executed', { id: cmd.id });
  } catch (error) {
    log.error('Command failed', { id: cmd.id, error });
  }
}

function executeSelected(): void {
  const cmd = filteredCommands[selectedIndex];
  if (!cmd) return;
  close();
  // Let focus return and the palette fade before opening whatever comes next.
  window.setTimeout(() => void runCommand(cmd), DURATION.FAST);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Creates the palette (hidden) and binds ⌘K / Ctrl+K. Safe to call more than once. */
export function initCommandPalette(opts: CommandPaletteOptions = {}): void {
  if (palette !== null || typeof document === 'undefined') return;

  cleanupOrphanedElements();
  injectStyles();

  commands = [...getDefaultCommands(), ...(opts.commands ?? [])];
  maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;

  palette = createPalette();
  document.body.appendChild(palette);
  searchInput = palette.querySelector('.command-palette__input');
  resultsContainer = palette.querySelector('.command-palette__results');

  listeners = new AbortController();
  const { signal } = listeners;
  searchInput?.addEventListener('input', handleInput, { signal });
  palette.addEventListener('keydown', handlePaletteKeydown, { signal });
  resultsContainer?.addEventListener('click', handleResultClick, { signal });
  palette.querySelector('.command-palette__backdrop')?.addEventListener('click', close, { signal });
  palette.querySelector('.command-palette__close')?.addEventListener('click', close, { signal });
  document.addEventListener('keydown', handleGlobalKeydown, { signal });

  log.info('Command palette initialized', { commandCount: commands.length });
}

/** Opens the palette with an empty query. */
export function open(): void {
  if (!palette || !searchInput || isOpen) return;

  previousActiveElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  isOpen = true;
  searchInput.value = '';
  filteredCommands = searchCommands('');
  selectedIndex = 0;
  renderResults();
  palette.classList.add(OPEN_CLASS);

  const card = palette.querySelector<HTMLElement>('.command-palette__card');
  if (card) focusTrapCleanup = trapFocus(card);
  searchInput.focus();
  announce('Quick actions open');
}

/** Closes the palette and returns focus to where it was. */
export function close(): void {
  if (!palette || !isOpen) return;

  isOpen = false;
  palette.classList.remove(OPEN_CLASS);
  focusTrapCleanup?.();
  focusTrapCleanup = null;
  if (previousActiveElement?.isConnected) previousActiveElement.focus();
  previousActiveElement = null;
}

/** Opens if closed, closes if open. */
export function toggle(): void {
  if (isOpen) close();
  else open();
}

/** Whether the palette is currently open. */
export function isCommandPaletteOpen(): boolean {
  return isOpen;
}

/** Removes the palette, its styles and every listener it added. */
export function disposeCommandPalette(): void {
  close();
  listeners?.abort();
  listeners = null;
  palette?.remove();
  palette = null;
  document.getElementById(COMMAND_PALETTE_STYLE_ID)?.remove();
  commands = [];
  filteredCommands = [];
  searchInput = null;
  resultsContainer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeCommandPalette());
}
