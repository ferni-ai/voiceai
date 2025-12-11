/**
 * Commands Panel UI
 *
 * Displays available slash commands for the current persona.
 * Users can invoke commands to start guided conversations.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses shared components from engagement-components.ts
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Humanized, encouraging copy
 *
 * @module @ferni/ui/commands
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import {
  ICONS,
  injectSharedStyles,
  escapeHtml,
  renderCloseButton,
  createAnimationConfig,
} from './engagement-components.js';

const log = createLogger('CommandsUI');

// ============================================================================
// TYPES
// ============================================================================

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

const COMMANDS_COPY = {
  title: 'Start a practice',
  intro: 'Choose a guided conversation to begin',
  emptyState: {
    title: 'No practices available',
    message: 'Commands will appear here as they become available',
  },
  loading: 'Finding practices...',
  error: {
    title: 'Something went wrong',
    message: 'Could not load practices. Please try again.',
    retry: 'Try again',
  },
  categories: {
    'check-in': 'Check-ins',
    reflection: 'Reflection',
    action: 'Take Action',
    default: 'Practices',
  },
  buttons: {
    close: 'Close',
    start: 'Start',
  },
};

// Icon mapping for command categories and icons
const COMMAND_ICONS: Record<string, string> = {
  // Categories
  'check-in': ICONS.sunny,
  reflection: ICONS.cloudy,
  action: ICONS.flame,
  // Specific icons
  sunrise: ICONS.sunny,
  moon: ICONS.cloudy,
  calendar: ICONS.calendar,
  lightbulb: ICONS.flame,
  heart: ICONS.heart,
  plus: ICONS.plus,
  clock: ICONS.clock,
};

function getCommandIcon(command: Command): string {
  // Try specific icon first, then category, then default
  if (command.icon) {
    const iconMatch = COMMAND_ICONS[command.icon];
    if (iconMatch) return iconMatch;
  }
  const categoryIcon = COMMAND_ICONS[command.category];
  if (categoryIcon) return categoryIcon;
  return ICONS.clock;
}

// ============================================================================
// COMMANDS PANEL UI CLASS
// ============================================================================

class CommandsPanelUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: CommandsUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private _isVisible = false;
  private personaId = 'ferni';
  private commands: Command[] = [];
  private isLoading = false;
  private hasError = false;

  initialize(): void {
    if (this.panel) return;
    injectSharedStyles();
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: CommandsUICallbacks): void {
    this.callbacks = callbacks;
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
    // Reload commands if visible
    if (this._isVisible) {
      this.loadCommands();
    }
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.panel.classList.add('ferni-commands--visible');
    this._isVisible = true;

    // Load commands
    await this.loadCommands();

    // Entrance animation
    if (!prefersReducedMotion()) {
      this.wrapper.animate(
        [
          { opacity: 0, transform: 'translateX(16px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        createAnimationConfig(DURATION.MODERATE, EASING.EXPO_OUT)
      );
    }
  }

  hide(): void {
    if (!this.panel || !this.wrapper) return;

    if (!prefersReducedMotion()) {
      const anim = this.wrapper.animate(
        [
          { opacity: 1, transform: 'translateX(0)' },
          { opacity: 0, transform: 'translateX(16px)' },
        ],
        createAnimationConfig(DURATION.SLOW, EASING.STANDARD)
      );
      anim.onfinish = () => {
        this.panel?.classList.remove('ferni-commands--visible');
        this._isVisible = false;
        this.callbacks.onClose?.();
      };
    } else {
      this.panel.classList.remove('ferni-commands--visible');
      this._isVisible = false;
      this.callbacks.onClose?.();
    }
  }

  getIsVisible(): boolean {
    return this._isVisible;
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'ferni-commands';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', COMMANDS_COPY.title);

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ferni-commands__backdrop';
    backdrop.addEventListener('click', () => this.hide());
    this.panel.appendChild(backdrop);

    // Wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ferni-commands__wrapper';
    this.panel.appendChild(this.wrapper);

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.panel);
  }

  private async loadCommands(): Promise<void> {
    if (!this.wrapper) return;

    this.isLoading = true;
    this.hasError = false;
    this.render();

    try {
      const result = await apiGet<{
        personaId: string;
        commands: Command[];
        count: number;
      }>(`/api/commands/${this.personaId}`);

      if (result.ok && result.data) {
        this.commands = result.data.commands;
        log.debug('Commands loaded', { count: this.commands.length });
      } else {
        this.hasError = true;
        log.warn('Failed to load commands', { error: result.error });
      }
    } catch (err) {
      this.hasError = true;
      log.error('Error loading commands', { error: err });
    }

    this.isLoading = false;
    this.render();
  }

  private render(): void {
    if (!this.wrapper) return;

    if (this.isLoading) {
      this.renderLoading();
    } else if (this.hasError) {
      this.renderError();
    } else if (this.commands.length === 0) {
      this.renderEmpty();
    } else {
      this.renderCommands();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="ferni-commands__header">
        <h2>${COMMANDS_COPY.title}</h2>
        ${renderCloseButton(COMMANDS_COPY.buttons.close)}
      </header>

      <div class="ferni-commands__loading">
        <div class="ferni-commands__spinner"></div>
        <p>${COMMANDS_COPY.loading}</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderError(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="ferni-commands__header">
        <h2>${COMMANDS_COPY.title}</h2>
        ${renderCloseButton(COMMANDS_COPY.buttons.close)}
      </header>

      <div class="ferni-commands__error">
        <h3>${COMMANDS_COPY.error.title}</h3>
        <p>${COMMANDS_COPY.error.message}</p>
        <button class="ferni-commands__retry engagement-btn-primary" type="button">
          ${COMMANDS_COPY.error.retry}
        </button>
      </div>
    `;

    this.bindCloseButton();
    this.wrapper.querySelector('.ferni-commands__retry')?.addEventListener('click', () => {
      this.loadCommands();
    });
  }

  private renderEmpty(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="ferni-commands__header">
        <h2>${COMMANDS_COPY.title}</h2>
        ${renderCloseButton(COMMANDS_COPY.buttons.close)}
      </header>

      <div class="ferni-commands__empty">
        <div class="ferni-commands__empty-icon">${ICONS.clock}</div>
        <h3>${COMMANDS_COPY.emptyState.title}</h3>
        <p>${COMMANDS_COPY.emptyState.message}</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderCommands(): void {
    if (!this.wrapper) return;

    // Group commands by category
    const categories = this.groupByCategory(this.commands);

    let categoriesHtml = '';
    for (const [category, commands] of Object.entries(categories)) {
      const categoryLabel =
        COMMANDS_COPY.categories[category as keyof typeof COMMANDS_COPY.categories] ||
        COMMANDS_COPY.categories.default;

      const commandsHtml = commands
        .map(
          (cmd, i) => `
        <button
          class="ferni-commands__item"
          data-command-id="${escapeHtml(cmd.id)}"
          data-index="${i}"
          type="button"
        >
          <span class="ferni-commands__item-icon">${getCommandIcon(cmd)}</span>
          <div class="ferni-commands__item-content">
            <span class="ferni-commands__item-name">${escapeHtml(cmd.name)}</span>
            <span class="ferni-commands__item-desc">${escapeHtml(cmd.description)}</span>
          </div>
          <span class="ferni-commands__item-arrow">${ICONS.back}</span>
        </button>
      `
        )
        .join('');

      categoriesHtml += `
        <div class="ferni-commands__category">
          <h3 class="ferni-commands__category-title">${categoryLabel}</h3>
          <div class="ferni-commands__list">
            ${commandsHtml}
          </div>
        </div>
      `;
    }

    this.wrapper.innerHTML = `
      <header class="ferni-commands__header">
        <h2>${COMMANDS_COPY.title}</h2>
        ${renderCloseButton(COMMANDS_COPY.buttons.close)}
      </header>

      <p class="ferni-commands__intro">${COMMANDS_COPY.intro}</p>

      <div class="ferni-commands__content">
        ${categoriesHtml}
      </div>
    `;

    this.bindCloseButton();
    this.bindCommandButtons();

    // Staggered entrance animation
    if (!prefersReducedMotion()) {
      this.wrapper.querySelectorAll('.ferni-commands__item').forEach((el, i) => {
        (el as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.EXPO_OUT,
            delay: i * 50,
            fill: 'forwards',
          }
        );
      });
    }
  }

  private groupByCategory(commands: Command[]): Record<string, Command[]> {
    const groups: Record<string, Command[]> = {};
    for (const cmd of commands) {
      const cat = cmd.category || 'default';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.engagement-close-btn')?.addEventListener('click', () => this.hide());
  }

  private bindCommandButtons(): void {
    this.wrapper?.querySelectorAll('.ferni-commands__item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const commandId = (btn as HTMLElement).dataset.commandId;
        const command = this.commands.find((c) => c.id === commandId);
        if (!command) return;

        // Add active state
        btn.classList.add('ferni-commands__item--active');

        // Render the command (get the full prompt)
        try {
          const result = await apiPost<{
            commandId: string;
            renderedPrompt: string;
          }>(`/api/commands/${this.personaId}/${commandId}/render`, {});

          if (result.ok && result.data) {
            log.info('Command selected', { commandId, name: command.name });
            this.callbacks.onCommandSelected?.(command, result.data.renderedPrompt);
            this.hide();
          } else {
            log.warn('Failed to render command', { error: result.error });
            btn.classList.remove('ferni-commands__item--active');
          }
        } catch (err) {
          log.error('Error rendering command', { error: err });
          btn.classList.remove('ferni-commands__item--active');
        }
      });
    });
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'ferni-commands-styles';
    this.styleElement.textContent = `
      /* ========================================
         COMMANDS PANEL
         Design system compliant slide panel
         ======================================== */

      .ferni-commands {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        justify-content: flex-end;
        opacity: 0;
        visibility: hidden;
        transition:
          opacity var(--duration-slow) var(--ease-standard),
          visibility var(--duration-slow);
      }

      .ferni-commands--visible {
        opacity: 1;
        visibility: visible;
      }

      .ferni-commands__backdrop {
        position: absolute;
        inset: 0;
        background: var(--color-background-overlay);
        backdrop-filter: blur(var(--glass-blur-subtle));
        -webkit-backdrop-filter: blur(var(--glass-blur-subtle));
      }

      .ferni-commands__wrapper {
        position: relative;
        width: 100%;
        max-width: 380px;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--color-background-elevated);
        border-left: 1px solid var(--color-border-subtle);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
      }

      /* Header */
      .ferni-commands__header {
        display: flex;
        align-items: center;
        gap: var(--ma-pause);
        padding: var(--ma-rest) var(--ma-silence);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .ferni-commands__header h2 {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
        letter-spacing: var(--tracking-tight);
      }

      /* Intro */
      .ferni-commands__intro {
        padding: var(--ma-pause) var(--ma-silence);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-relaxed);
        flex-shrink: 0;
      }

      /* Content */
      .ferni-commands__content {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--ma-silence) var(--ma-rest);
      }

      /* Categories */
      .ferni-commands__category {
        margin-bottom: var(--ma-pause);
      }

      .ferni-commands__category-title {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide);
        margin: 0 0 var(--ma-breath) 0;
        padding: var(--ma-breath) 0;
      }

      /* Command list */
      .ferni-commands__list {
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath);
      }

      /* Command item */
      .ferni-commands__item {
        display: flex;
        align-items: center;
        gap: var(--ma-pause);
        padding: var(--ma-pause);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition:
          background var(--duration-fast) var(--ease-gentle),
          transform var(--duration-fast) var(--ease-spring),
          box-shadow var(--duration-fast) var(--ease-gentle);
        opacity: 0; /* For stagger animation */
      }

      .ferni-commands__item:hover {
        background: var(--color-background-tertiary);
        transform: translateX(-2px);
        box-shadow: var(--shadow-md);
      }

      .ferni-commands__item:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
        background: var(--color-background-tertiary);
      }

      .ferni-commands__item:active {
        transform: scale(0.99);
      }

      .ferni-commands__item--active {
        background: var(--persona-primary, var(--color-accent-primary));
        border-color: var(--persona-primary, var(--color-accent-primary));
      }

      .ferni-commands__item--active .ferni-commands__item-name,
      .ferni-commands__item--active .ferni-commands__item-desc,
      .ferni-commands__item--active .ferni-commands__item-icon,
      .ferni-commands__item--active .ferni-commands__item-arrow {
        color: white;
      }

      .ferni-commands__item-icon {
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        color: var(--color-accent-text);
      }

      .ferni-commands__item-icon svg {
        width: 100%;
        height: 100%;
      }

      .ferni-commands__item-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ferni-commands__item-name {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .ferni-commands__item-desc {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ferni-commands__item-arrow {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        color: var(--color-text-muted);
        transform: rotate(180deg);
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-gentle);
      }

      .ferni-commands__item-arrow svg {
        width: 100%;
        height: 100%;
      }

      .ferni-commands__item:hover .ferni-commands__item-arrow {
        opacity: 1;
      }

      /* Loading state */
      .ferni-commands__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ma-pause);
        padding: var(--ma-silence);
        flex: 1;
      }

      .ferni-commands__spinner {
        width: 32px;
        height: 32px;
        border: 2px solid var(--color-border-subtle);
        border-top-color: var(--persona-primary, var(--color-accent-primary));
        border-radius: 50%;
        animation: spinnerRotate 0.8s linear infinite;
      }

      @keyframes spinnerRotate {
        to { transform: rotate(360deg); }
      }

      .ferni-commands__loading p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      /* Empty state */
      .ferni-commands__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ma-pause);
        padding: var(--ma-silence);
        text-align: center;
        flex: 1;
      }

      .ferni-commands__empty-icon {
        width: 48px;
        height: 48px;
        color: var(--color-text-muted);
        opacity: 0.5;
      }

      .ferni-commands__empty-icon svg {
        width: 100%;
        height: 100%;
      }

      .ferni-commands__empty h3 {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
        margin: 0;
      }

      .ferni-commands__empty p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      /* Error state */
      .ferni-commands__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ma-pause);
        padding: var(--ma-silence);
        text-align: center;
        flex: 1;
      }

      .ferni-commands__error h3 {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-semantic-error);
        margin: 0;
      }

      .ferni-commands__error p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      .ferni-commands__retry {
        margin-top: var(--ma-breath);
      }

      /* ========================================
         DARK THEME (Cedar Night)
         ======================================== */
      [data-theme="midnight"] .ferni-commands__backdrop {
        background: var(--color-background-overlay);
      }

      [data-theme="midnight"] .ferni-commands__wrapper {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .ferni-commands__header h2,
      [data-theme="midnight"] .ferni-commands__item-name,
      [data-theme="midnight"] .ferni-commands__empty h3 {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .ferni-commands__intro,
      [data-theme="midnight"] .ferni-commands__item-desc,
      [data-theme="midnight"] .ferni-commands__empty p,
      [data-theme="midnight"] .ferni-commands__loading p {
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .ferni-commands__item {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .ferni-commands__item:hover {
        background: var(--color-background-tertiary);
      }

      /* ========================================
         MOBILE RESPONSIVE
         ======================================== */
      @media (max-width: 480px) {
        .ferni-commands__wrapper {
          max-width: 100%;
        }
      }

      /* ========================================
         REDUCED MOTION
         ======================================== */
      @media (prefers-reduced-motion: reduce) {
        .ferni-commands {
          transition: opacity var(--duration-fast) linear;
        }

        .ferni-commands__item {
          opacity: 1;
        }

        .ferni-commands__item:hover {
          transform: none;
        }

        .ferni-commands__spinner {
          animation: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.wrapper = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: CommandsPanelUI | null = null;

export function getCommandsPanelUI(): CommandsPanelUI {
  if (!instance) instance = new CommandsPanelUI();
  return instance;
}

export function initCommandsPanelUI(): void {
  getCommandsPanelUI().initialize();
}

export function showCommandsPanel(): void {
  getCommandsPanelUI().show();
}

export function hideCommandsPanel(): void {
  getCommandsPanelUI().hide();
}

export function setCommandsPersonaId(personaId: string): void {
  getCommandsPanelUI().setPersonaId(personaId);
}

export function setCommandsCallbacks(callbacks: CommandsUICallbacks): void {
  getCommandsPanelUI().setCallbacks(callbacks);
}

export default CommandsPanelUI;
