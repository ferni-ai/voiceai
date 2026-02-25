/**
 * Language Switcher UI Component
 *
 * Fixed-position floating language switcher for the bottom-right corner.
 * Compact trigger button showing the current locale flag, with a popover
 * listing all 11 supported locales.
 *
 * This is distinct from language-selector.ui.ts (inline dropdown for settings)
 * and theme-language-settings.ui.ts (full modal with theme + language).
 */

import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  getLocale,
  setLocale,
  SUPPORTED_LOCALES,
  onLocaleChange,
  t,
  type SupportedLocale,
  type LocaleInfo,
} from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LanguageSwitcher');
const { trackedTimeout } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LOCALE: LocaleInfo = {
  code: 'en-US',
  name: 'English (US)',
  nativeName: 'English',
  flag: '🇺🇸',
  direction: 'ltr',
};

// ============================================================================
// STATE
// ============================================================================

let switcherElement: HTMLElement | null = null;
let isOpen = false;

// ============================================================================
// HELPERS
// ============================================================================

function getLocaleInfo(code: SupportedLocale): LocaleInfo {
  return SUPPORTED_LOCALES.find((l) => l.code === code) ?? DEFAULT_LOCALE;
}

// ============================================================================
// STYLES
// ============================================================================

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'language-switcher-styles';
  style.textContent = `
    .lang-switcher {
      position: fixed;
      inset-block-end: var(--space-4, 1rem);
      inset-inline-end: var(--space-4, 1rem);
      z-index: var(--z-floating, 1500);
    }

    .lang-switcher__trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15));
      border-radius: var(--radius-full, 50%);
      background: var(--color-bg-elevated, rgba(30, 30, 30, 0.9));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: inherit;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.15));
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .lang-switcher__trigger:hover {
      transform: scale(1.08);
      box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
    }

    .lang-switcher__trigger:focus-visible {
      outline: 2px solid var(--color-accent, #3D5A45);
      outline-offset: 2px;
    }

    .lang-switcher__popover {
      position: absolute;
      inset-block-end: calc(100% + var(--space-2, 0.5rem));
      inset-inline-end: 0;
      min-width: 200px;
      max-height: 340px;
      overflow-y: auto;
      padding: var(--space-2, 0.5rem) 0;
      background: var(--color-bg-elevated, #fffdfb);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      list-style: none;
      margin: 0;
      opacity: 0;
      visibility: hidden;
      transform: translateY(0.5rem) scale(0.95);
      transform-origin: bottom right;
      transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
    }

    [dir="rtl"] .lang-switcher__popover {
      inset-inline-end: auto;
      inset-inline-start: 0;
      transform-origin: bottom left;
    }

    .lang-switcher[data-open] .lang-switcher__popover {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    .lang-switcher__option {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      border: none;
      background: none;
      color: var(--color-text-primary, #2C2520);
      font-size: 0.875rem;
      text-align: start;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .lang-switcher__option:hover {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.04));
    }

    .lang-switcher__option:focus-visible {
      background: var(--color-background-secondary, rgba(44, 37, 32, 0.04));
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-accent, #3D5A45);
    }

    .lang-switcher__option[aria-selected="true"] {
      background: var(--color-accent-tint, rgba(61, 90, 69, 0.08));
    }

    .lang-switcher__option-flag {
      font-size: 1.25rem;
      line-height: 1;
    }

    .lang-switcher__option-name {
      font-weight: 500;
    }

    .lang-switcher__option-check {
      margin-inline-start: auto;
      width: 16px;
      height: 16px;
      color: var(--color-accent, #3D5A45);
      opacity: 0;
    }

    .lang-switcher__option[aria-selected="true"] .lang-switcher__option-check {
      opacity: 1;
    }

    /* Scrollbar styling */
    .lang-switcher__popover::-webkit-scrollbar {
      width: 6px;
    }

    .lang-switcher__popover::-webkit-scrollbar-track {
      background: transparent;
    }

    .lang-switcher__popover::-webkit-scrollbar-thumb {
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.15));
      border-radius: 3px;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .lang-switcher__trigger,
      .lang-switcher__popover {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// SVG ICONS
// ============================================================================

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Create a floating language switcher positioned at the bottom-right corner.
 *
 * Shows the current locale flag as a compact trigger. On click, opens a
 * popover with all supported locales. Selecting a locale calls setLocale()
 * which persists the choice and reloads the page.
 */
export function createLanguageSwitcher(): HTMLElement {
  injectStyles();

  const container = document.createElement('div');
  container.className = 'lang-switcher';

  const currentLocale = getLocale();
  const currentInfo = getLocaleInfo(currentLocale);

  container.innerHTML = `
    <button
      class="lang-switcher__trigger"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-label="${t('languageSwitcher.changeLanguage', 'Change language')}"
      title="${t('languageSwitcher.current', 'Current language: {language}', { language: currentInfo.nativeName })}"
    >
      ${currentInfo.flag}
    </button>

    <ul class="lang-switcher__popover" role="listbox" aria-label="${t('languageSwitcher.selectLanguage', 'Select a language')}">
      ${SUPPORTED_LOCALES.map(
        (locale) => `
        <li
          class="lang-switcher__option"
          role="option"
          aria-selected="${locale.code === currentLocale}"
          data-locale="${locale.code}"
          lang="${locale.code}"
          dir="${locale.direction}"
          tabindex="-1"
        >
          <span class="lang-switcher__option-flag">${locale.flag}</span>
          <span class="lang-switcher__option-name">${locale.nativeName}</span>
          <span class="lang-switcher__option-check" aria-hidden="true">${CHECK_ICON}</span>
        </li>
      `
      ).join('')}
    </ul>
  `;

  setupEventHandlers(container);

  // React to external locale changes
  onLocaleChange((locale) => {
    updateDisplay(container, locale);
  });

  switcherElement = container;
  log.debug('Language switcher created');
  return container;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventHandlers(container: HTMLElement): void {
  const trigger = container.querySelector('.lang-switcher__trigger') as HTMLButtonElement;
  const popover = container.querySelector('.lang-switcher__popover') as HTMLUListElement;
  const options = container.querySelectorAll<HTMLLIElement>('.lang-switcher__option');

  // Toggle popover
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(container, trigger, !isOpen);
  });

  // Handle option selection
  options.forEach((option) => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const locale = option.dataset.locale as SupportedLocale;
      if (locale) {
        log.info(`Switching locale to ${locale}`);
        void setLocale(locale);
        togglePopover(container, trigger, false);
      }
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    if (isOpen) {
      togglePopover(container, trigger, false);
    }
  });

  // Keyboard handling
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      togglePopover(container, trigger, false);
      trigger.focus();
    }
  });

  // Arrow key navigation within popover
  popover.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentFocused = document.activeElement as HTMLElement;
      const optionsList = Array.from(options);
      const currentIndex = optionsList.indexOf(currentFocused as HTMLLIElement);

      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < optionsList.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : optionsList.length - 1;
      }

      optionsList[nextIndex]?.focus();
    }

    // Select on Enter or Space
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const focused = document.activeElement as HTMLLIElement;
      if (focused?.dataset.locale) {
        focused.click();
      }
    }
  });
}

function togglePopover(container: HTMLElement, trigger: HTMLButtonElement, open: boolean): void {
  isOpen = open;

  if (open) {
    container.setAttribute('data-open', '');
    trigger.setAttribute('aria-expanded', 'true');

    // Focus the currently selected option
    const selectedOption = container.querySelector('.lang-switcher__option[aria-selected="true"]') as HTMLLIElement;
    const firstOption = container.querySelector('.lang-switcher__option') as HTMLLIElement;
    trackedTimeout(() => (selectedOption ?? firstOption)?.focus(), 10);
  } else {
    container.removeAttribute('data-open');
    trigger.setAttribute('aria-expanded', 'false');
  }
}

function updateDisplay(container: HTMLElement, locale: SupportedLocale): void {
  const info = getLocaleInfo(locale);

  // Update trigger flag and title
  const trigger = container.querySelector('.lang-switcher__trigger') as HTMLButtonElement;
  if (trigger) {
    trigger.textContent = info.flag;
    trigger.title = t('languageSwitcher.current', 'Current language: {language}', { language: info.nativeName });
  }

  // Update selected state
  container.querySelectorAll('.lang-switcher__option').forEach((option) => {
    const optionLocale = (option as HTMLElement).dataset.locale;
    if (optionLocale === locale) {
      option.setAttribute('aria-selected', 'true');
    } else {
      option.setAttribute('aria-selected', 'false');
    }
  });
}

// ============================================================================
// MOUNT HELPER
// ============================================================================

/**
 * Mount the language switcher to the document body.
 * Safe to call multiple times — will not duplicate.
 */
export function mountLanguageSwitcher(): void {
  if (switcherElement && document.body.contains(switcherElement)) {
    return;
  }

  const el = createLanguageSwitcher();
  document.body.appendChild(el);
  log.info('Language switcher mounted');
}

/**
 * Remove the language switcher from the DOM.
 */
export function unmountLanguageSwitcher(): void {
  if (switcherElement) {
    switcherElement.remove();
    switcherElement = null;
    isOpen = false;
    log.info('Language switcher unmounted');
  }
}
