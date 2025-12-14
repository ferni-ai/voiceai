/**
 * Language Selector UI Component
 *
 * A dropdown component for selecting the user's preferred language.
 * Integrates with the i18n system for locale switching.
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

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let selectorElement: HTMLElement | null = null;
let isOpen = false;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Create the language selector element
 */
export function createLanguageSelector(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lang-selector';
  container.setAttribute('data-lang-selector', '');

  const currentLocale = getLocale();
  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === currentLocale) || SUPPORTED_LOCALES[0];

  container.innerHTML = `
    <button
      class="lang-selector-trigger"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-label="${t('accessibility.languageSelector')}"
    >
      <span class="lang-flag">${currentLocaleInfo.flag}</span>
      <span class="lang-name">${currentLocaleInfo.nativeName}</span>
      <svg class="lang-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </button>

    <ul class="lang-dropdown" role="listbox" aria-label="${t('accessibility.languageSelector')}">
      ${SUPPORTED_LOCALES.map(
        (lang) => `
        <li role="option" ${lang.code === currentLocale ? 'aria-selected="true"' : ''}>
          <button
            class="lang-option ${lang.code === currentLocale ? 'active' : ''}"
            data-locale="${lang.code}"
            lang="${lang.code}"
            dir="${lang.direction}"
          >
            <span class="lang-flag">${lang.flag}</span>
            <span class="lang-name">${lang.nativeName}</span>
          </button>
        </li>
      `
      ).join('')}
    </ul>
  `;

  // Add styles
  addStyles();

  // Set up event handlers
  setupEventHandlers(container);

  selectorElement = container;
  return container;
}

/**
 * Set up event handlers for the selector
 */
function setupEventHandlers(container: HTMLElement): void {
  const trigger = container.querySelector('.lang-selector-trigger') as HTMLButtonElement;
  const dropdown = container.querySelector('.lang-dropdown') as HTMLUListElement;
  const options = container.querySelectorAll('.lang-option') as NodeListOf<HTMLButtonElement>;

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(container, trigger, !isOpen);
  });

  // Handle option selection
  options.forEach((option) => {
    option.addEventListener('click', async (e) => {
      e.stopPropagation();
      const locale = option.dataset.locale as SupportedLocale;
      await setLocale(locale);
      toggleDropdown(container, trigger, false);
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    if (isOpen) {
      toggleDropdown(container, trigger, false);
    }
  });

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      toggleDropdown(container, trigger, false);
      trigger.focus();
    }
  });

  // Keyboard navigation
  dropdown.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentOption = document.activeElement as HTMLElement;
      const optionsList = Array.from(options);
      const currentIndex = optionsList.indexOf(currentOption as HTMLButtonElement);

      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < optionsList.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : optionsList.length - 1;
      }

      optionsList[nextIndex].focus();
    }
  });

  // Subscribe to locale changes to update the display
  onLocaleChange((locale) => {
    updateDisplay(container, locale);
  });
}

/**
 * Toggle the dropdown open/closed
 */
function toggleDropdown(container: HTMLElement, trigger: HTMLButtonElement, open: boolean): void {
  isOpen = open;

  if (open) {
    container.setAttribute('data-open', '');
    trigger.setAttribute('aria-expanded', 'true');

    // Focus first option when opening
    const firstOption = container.querySelector('.lang-option') as HTMLButtonElement;
    if (firstOption) {
      trackedTimeout(() => firstOption.focus(), 10);
    }
  } else {
    container.removeAttribute('data-open');
    trigger.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Update the display when locale changes
 */
function updateDisplay(container: HTMLElement, locale: SupportedLocale): void {
  const localeInfo = SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];

  // Update trigger
  const trigger = container.querySelector('.lang-selector-trigger');
  if (trigger) {
    const flag = trigger.querySelector('.lang-flag');
    const name = trigger.querySelector('.lang-name');
    if (flag) flag.textContent = localeInfo.flag;
    if (name) name.textContent = localeInfo.nativeName;
  }

  // Update active state
  const options = container.querySelectorAll('.lang-option');
  options.forEach((option) => {
    const optionLocale = (option as HTMLElement).dataset.locale;
    const listItem = option.parentElement;

    if (optionLocale === locale) {
      option.classList.add('active');
      listItem?.setAttribute('aria-selected', 'true');
    } else {
      option.classList.remove('active');
      listItem?.removeAttribute('aria-selected');
    }
  });
}

// ============================================================================
// STYLES
// ============================================================================

let stylesAdded = false;

function addStyles(): void {
  if (stylesAdded) return;
  stylesAdded = true;

  const style = document.createElement('style');
  style.textContent = `
    .lang-selector {
      position: relative;
      display: inline-block;
    }

    .lang-selector-trigger {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: transparent;
      border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.15));
      border-radius: 0.5rem;
      color: inherit;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .lang-selector-trigger:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.05));
      border-color: var(--border-hover, rgba(255, 255, 255, 0.25));
    }

    .lang-selector-trigger:focus-visible {
      outline: 2px solid var(--focus-ring, rgba(74, 103, 65, 0.5));
      outline-offset: 2px;
    }

    .lang-flag {
      font-size: 1rem;
      line-height: 1;
    }

    .lang-name {
      font-weight: 500;
    }

    .lang-chevron {
      width: 1rem;
      height: 1rem;
      transition: transform 0.2s ease;
    }

    .lang-selector[data-open] .lang-chevron {
      transform: rotate(180deg);
    }

    .lang-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 0.5rem;
      min-width: 180px;
      max-height: 300px;
      overflow-y: auto;
      padding: 0.5rem 0;
      background: var(--bg-elevated, #1a1a2e);
      border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
      border-radius: 0.75rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      list-style: none;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-0.5rem);
      transition: all 0.2s ease;
      z-index: 1000;
    }

    /* RTL support */
    [dir="rtl"] .lang-dropdown {
      right: auto;
      left: 0;
    }

    .lang-selector[data-open] .lang-dropdown {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .lang-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.625rem 1rem;
      background: none;
      border: none;
      color: inherit;
      font-size: 0.875rem;
      text-align: start;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .lang-option:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.05));
    }

    .lang-option:focus-visible {
      background: var(--bg-hover, rgba(255, 255, 255, 0.05));
      outline: none;
    }

    .lang-option.active {
      background: var(--ferni-bg, rgba(74, 103, 65, 0.15));
      color: var(--color-ferni, #4a6741);
    }

    /* Light theme adjustments */
    @media (prefers-color-scheme: light) {
      .lang-selector-trigger {
        border-color: rgba(0, 0, 0, 0.1);
      }

      .lang-selector-trigger:hover {
        background: rgba(0, 0, 0, 0.03);
        border-color: rgba(0, 0, 0, 0.15);
      }

      .lang-dropdown {
        background: white;
        border-color: rgba(0, 0, 0, 0.08);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      }

      .lang-option:hover,
      .lang-option:focus-visible {
        background: rgba(0, 0, 0, 0.03);
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// COMPACT VARIANT
// ============================================================================

/**
 * Create a compact language selector (flag only)
 */
export function createCompactLanguageSelector(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lang-selector lang-selector--compact';
  container.setAttribute('data-lang-selector', '');

  const currentLocale = getLocale();
  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === currentLocale) || SUPPORTED_LOCALES[0];

  container.innerHTML = `
    <button
      class="lang-selector-trigger lang-selector-trigger--compact"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-label="${t('accessibility.languageSelector')}"
      title="${currentLocaleInfo.name}"
    >
      <span class="lang-flag">${currentLocaleInfo.flag}</span>
    </button>

    <ul class="lang-dropdown" role="listbox" aria-label="${t('accessibility.languageSelector')}">
      ${SUPPORTED_LOCALES.map(
        (lang) => `
        <li role="option" ${lang.code === currentLocale ? 'aria-selected="true"' : ''}>
          <button
            class="lang-option ${lang.code === currentLocale ? 'active' : ''}"
            data-locale="${lang.code}"
            lang="${lang.code}"
            dir="${lang.direction}"
          >
            <span class="lang-flag">${lang.flag}</span>
            <span class="lang-name">${lang.nativeName}</span>
          </button>
        </li>
      `
      ).join('')}
    </ul>
  `;

  // Add compact styles
  addCompactStyles();

  // Set up event handlers (reuse same handlers)
  setupEventHandlers(container);

  return container;
}

function addCompactStyles(): void {
  // Reuse base styles
  addStyles();

  const style = document.createElement('style');
  style.textContent = `
    .lang-selector--compact .lang-selector-trigger--compact {
      padding: 0.375rem;
      border-radius: 50%;
    }

    .lang-selector--compact .lang-flag {
      font-size: 1.25rem;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getLocale, setLocale, SUPPORTED_LOCALES, t } from '../i18n/index.js';
