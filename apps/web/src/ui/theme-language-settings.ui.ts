/**
 * Theme & Language Settings UI
 *
 * A comprehensive settings panel for theme and language preferences.
 * Follows Ferni brand guidelines with centered modal design.
 *
 * Features:
 * - Visual theme previews (Zen/Midnight)
 * - Full language list with native names and flags
 * - Smooth transitions
 * - Accessible keyboard navigation
 */

import { DURATION } from '../config/animation-constants.js';
import { t, getLocale, setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/index.js';
import { getTheme, setTheme, THEMES, type ThemeName } from '../theme/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ThemeLanguageSettings');

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;

// ============================================================================
// ICONS (Lucide style)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'theme-language-settings-styles';
  if (document.getElementById(styleId)) return;

  const styles = document.createElement('style');
  styles.id = styleId;
  styles.textContent = `
    .theme-language-settings {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal-backdrop, 2000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 1rem);
      opacity: 0;
      visibility: hidden;
      transition: opacity var(--duration-normal, 200ms) var(--ease-out, ease-out),
                  visibility var(--duration-normal, 200ms) var(--ease-out, ease-out);
    }

    .theme-language-settings--visible {
      opacity: 1;
      visibility: visible;
    }

    .theme-language-settings__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .theme-language-settings__panel {
      position: relative;
      z-index: var(--z-modal, 2100);
      width: 100%;
      max-width: 480px;
      max-height: 85vh;
      overflow-y: auto;
      background: var(--color-bg-elevated, #fffdfb);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      transform: scale(0.95) translateY(10px);
      transition: transform var(--duration-normal, 200ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
    }

    .theme-language-settings--visible .theme-language-settings__panel {
      transform: scale(1) translateY(0);
    }

    .theme-language-settings__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 1.5rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .theme-language-settings__title-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
    }

    .theme-language-settings__eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-accent, #3D5A45);
    }

    .theme-language-settings__title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      color: var(--color-text-primary, #2C2520);
    }

    .theme-language-settings__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: var(--radius-full, 50%);
      background: var(--color-background-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a524c);
      cursor: pointer;
      transition: background var(--duration-fast, 150ms), color var(--duration-fast, 150ms);
    }

    .theme-language-settings__close:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.08));
      color: var(--color-text-primary, #2C2520);
    }

    .theme-language-settings__close:focus-visible {
      outline: 2px solid var(--color-accent, #3D5A45);
      outline-offset: 2px;
    }

    .theme-language-settings__content {
      padding: var(--space-6, 1.5rem);
      display: flex;
      flex-direction: column;
      gap: var(--space-8, 2rem);
    }

    .theme-language-settings__section {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 1rem);
    }

    .theme-language-settings__section-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      color: var(--color-text-secondary, #5a524c);
    }

    .theme-language-settings__section-header svg {
      width: 20px;
      height: 20px;
      opacity: 0.7;
    }

    .theme-language-settings__section-title {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Theme Options */
    .theme-language-settings__themes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3, 0.75rem);
    }

    .theme-language-settings__theme-option {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-4, 1rem);
      border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-xl, 16px);
      background: var(--color-background-primary, #fff);
      cursor: pointer;
      transition: border-color var(--duration-fast, 150ms), 
                  box-shadow var(--duration-fast, 150ms),
                  transform var(--duration-fast, 150ms);
    }

    .theme-language-settings__theme-option:hover {
      border-color: var(--color-border-medium, rgba(44, 37, 32, 0.2));
      transform: translateY(-2px);
    }

    .theme-language-settings__theme-option:focus-visible {
      outline: none;
      border-color: var(--color-accent, #3D5A45);
      box-shadow: 0 0 0 3px var(--color-accent-tint, rgba(61, 90, 69, 0.2));
    }

    .theme-language-settings__theme-option--active {
      border-color: var(--color-accent, #3D5A45);
      background: var(--color-accent-tint, rgba(61, 90, 69, 0.05));
    }

    .theme-language-settings__theme-preview {
      width: 100%;
      height: 60px;
      border-radius: var(--radius-lg, 12px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }

    .theme-language-settings__theme-preview--zen {
      background: linear-gradient(145deg, #fafaf9 0%, #f5f4f2 100%);
      border: 1px solid rgba(44, 37, 32, 0.1);
      color: #8B7355;
    }

    .theme-language-settings__theme-preview--midnight {
      background: linear-gradient(145deg, #1a1a2e 0%, #16162a 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #D4AF37;
    }

    .theme-language-settings__theme-info {
      text-align: center;
    }

    .theme-language-settings__theme-name {
      display: block;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .theme-language-settings__theme-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a827a);
    }

    .theme-language-settings__theme-check {
      position: absolute;
      top: var(--space-2, 0.5rem);
      right: var(--space-2, 0.5rem);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--color-accent, #3D5A45);
      color: white;
      display: none;
      align-items: center;
      justify-content: center;
    }

    .theme-language-settings__theme-option--active .theme-language-settings__theme-check {
      display: flex;
    }

    /* Language Options */
    .theme-language-settings__languages {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
      max-height: 300px;
      overflow-y: auto;
      padding-right: var(--space-2, 0.5rem);
      margin-right: calc(-1 * var(--space-2, 0.5rem));
    }

    .theme-language-settings__language-option {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border: none;
      border-radius: var(--radius-lg, 12px);
      background: transparent;
      cursor: pointer;
      transition: background var(--duration-fast, 150ms);
      text-align: left;
      width: 100%;
    }

    .theme-language-settings__language-option:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.04));
    }

    .theme-language-settings__language-option:focus-visible {
      outline: none;
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.04));
      box-shadow: inset 0 0 0 2px var(--color-accent, #3D5A45);
    }

    .theme-language-settings__language-option--active {
      background: var(--color-accent-tint, rgba(61, 90, 69, 0.08));
    }

    .theme-language-settings__language-flag {
      font-size: 1.5rem;
      line-height: 1;
    }

    .theme-language-settings__language-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .theme-language-settings__language-native {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }

    .theme-language-settings__language-english {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #8a827a);
    }

    .theme-language-settings__language-check {
      width: 20px;
      height: 20px;
      color: var(--color-accent, #3D5A45);
      opacity: 0;
    }

    .theme-language-settings__language-option--active .theme-language-settings__language-check {
      opacity: 1;
    }

    /* RTL Support */
    [dir="rtl"] .theme-language-settings__language-option {
      text-align: right;
    }

    /* Scrollbar styling */
    .theme-language-settings__languages::-webkit-scrollbar {
      width: 6px;
    }

    .theme-language-settings__languages::-webkit-scrollbar-track {
      background: transparent;
    }

    .theme-language-settings__languages::-webkit-scrollbar-thumb {
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.15));
      border-radius: 3px;
    }

    .theme-language-settings__languages::-webkit-scrollbar-thumb:hover {
      background: var(--color-border-medium, rgba(44, 37, 32, 0.25));
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .theme-language-settings,
      .theme-language-settings__panel,
      .theme-language-settings__theme-option,
      .theme-language-settings__language-option,
      .theme-language-settings__close {
        transition: none;
      }
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!container) return;

  const currentTheme = getTheme();
  const currentLocale = getLocale();

  container.innerHTML = `
    <div class="theme-language-settings__backdrop"></div>
    <div class="theme-language-settings__panel" role="dialog" aria-labelledby="tls-title" aria-modal="true">
      <header class="theme-language-settings__header">
        <div class="theme-language-settings__title-group">
          <span class="theme-language-settings__eyebrow">${t('settings.preferences') || 'PREFERENCES'}</span>
          <h2 id="tls-title" class="theme-language-settings__title">${t('menu.items.themeLanguage') || 'Theme & Language'}</h2>
        </div>
        <button class="theme-language-settings__close" aria-label="${t('common.close') || 'Close'}" data-action="close">
          ${ICONS.close}
        </button>
      </header>

      <div class="theme-language-settings__content">
        <!-- Theme Section -->
        <section class="theme-language-settings__section">
          <div class="theme-language-settings__section-header">
            ${ICONS.sun}
            <h3 class="theme-language-settings__section-title">${t('settings.appearance') || 'Appearance'}</h3>
          </div>
          <div class="theme-language-settings__themes" role="radiogroup" aria-label="Theme selection">
            ${renderThemeOption('zen', currentTheme)}
            ${renderThemeOption('midnight', currentTheme)}
          </div>
        </section>

        <!-- Language Section -->
        <section class="theme-language-settings__section">
          <div class="theme-language-settings__section-header">
            ${ICONS.globe}
            <h3 class="theme-language-settings__section-title">${t('settings.language') || 'Language'}</h3>
          </div>
          <div class="theme-language-settings__languages" role="listbox" aria-label="Language selection">
            ${SUPPORTED_LOCALES.map((locale) => renderLanguageOption(locale, currentLocale)).join('')}
          </div>
        </section>
      </div>
    </div>
  `;

  bindEvents();
}

function renderThemeOption(theme: ThemeName, currentTheme: ThemeName): string {
  const meta = THEMES[theme];
  const isActive = theme === currentTheme;
  const icon = theme === 'zen' ? ICONS.sun : ICONS.moon;

  return `
    <button 
      class="theme-language-settings__theme-option ${isActive ? 'theme-language-settings__theme-option--active' : ''}"
      data-action="set-theme"
      data-theme="${theme}"
      role="radio"
      aria-checked="${isActive}"
      aria-label="${meta.name}"
    >
      <div class="theme-language-settings__theme-check">${ICONS.check}</div>
      <div class="theme-language-settings__theme-preview theme-language-settings__theme-preview--${theme}">
        ${icon}
      </div>
      <div class="theme-language-settings__theme-info">
        <span class="theme-language-settings__theme-name">${meta.name}</span>
        <span class="theme-language-settings__theme-desc">${meta.description}</span>
      </div>
    </button>
  `;
}

function renderLanguageOption(locale: typeof SUPPORTED_LOCALES[number], currentLocale: SupportedLocale): string {
  const isActive = locale.code === currentLocale;

  return `
    <button 
      class="theme-language-settings__language-option ${isActive ? 'theme-language-settings__language-option--active' : ''}"
      data-action="set-language"
      data-locale="${locale.code}"
      role="option"
      aria-selected="${isActive}"
    >
      <span class="theme-language-settings__language-flag">${locale.flag}</span>
      <div class="theme-language-settings__language-info">
        <span class="theme-language-settings__language-native">${locale.nativeName}</span>
        <span class="theme-language-settings__language-english">${locale.name}</span>
      </div>
      <span class="theme-language-settings__language-check">${ICONS.check}</span>
    </button>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!container) return;

  // Close button
  const closeBtn = container.querySelector('[data-action="close"]');
  closeBtn?.addEventListener('click', hideThemeLanguageSettings);

  // Backdrop click
  const backdrop = container.querySelector('.theme-language-settings__backdrop');
  backdrop?.addEventListener('click', hideThemeLanguageSettings);

  // Theme selection
  container.querySelectorAll('[data-action="set-theme"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = (btn as HTMLElement).dataset.theme as ThemeName;
      if (theme) {
        setTheme(theme);
        log.info(`Theme changed to ${theme}`);
        render(); // Re-render to update selection
      }
    });
  });

  // Language selection
  container.querySelectorAll('[data-action="set-language"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void (async () => {
        const locale = (btn as HTMLElement).dataset.locale as SupportedLocale;
        if (locale) {
          log.info(`Language changing to ${locale}`);
          // This will reload the page
          await setLocale(locale);
        }
      })();
    });
  });

  // Escape key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideThemeLanguageSettings();
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Store cleanup function
  (container as HTMLElement & { _cleanup?: () => void })._cleanup = () => {
    document.removeEventListener('keydown', handleEscape);
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function showThemeLanguageSettings(): void {
  if (container) return; // Already open

  injectStyles();

  container = document.createElement('div');
  container.className = 'theme-language-settings';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  document.body.appendChild(container);

  render();

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('theme-language-settings--visible');
  });

  log.debug('Theme & Language settings opened');
}

export function hideThemeLanguageSettings(): void {
  if (!container) return;

  // Run cleanup
  const cleanup = (container as HTMLElement & { _cleanup?: () => void })._cleanup;
  cleanup?.();

  container.classList.remove('theme-language-settings--visible');

  // Remove after animation
  setTimeout(() => {
    container?.remove();
    container = null;
    log.debug('Theme & Language settings closed');
  }, DURATION.NORMAL);
}

export function toggleThemeLanguageSettings(): void {
  if (container) {
    hideThemeLanguageSettings();
  } else {
    showThemeLanguageSettings();
  }
}

