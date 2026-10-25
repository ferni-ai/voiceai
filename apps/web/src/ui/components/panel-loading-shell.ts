/**
 * A panel shell that answers the tap right away.
 *
 * Some menu panels fetch before they draw anything (The Sanctuary, Everything
 * Connected, Your Contribution, Bring a Friend, This Year Together). On a slow
 * network the tap looked dead for 3 to 8 seconds, and then the panel appeared.
 * openWithLoadingShell shows a calm, named shell the moment it's tapped and
 * hands over to the real panel the instant that panel is on the page.
 *
 * The shell fades in after a short pause, so a panel that opens quickly never
 * flashes it. If they dismiss the shell before the panel arrives, the panel is
 * closed again as soon as it opens, so it never pops up after they've moved on.
 *
 * @module ui/components/panel-loading-shell
 */
import { t } from '../../i18n/index.js';
import { asModalDialog } from '../../utils/accessibility.js';

export interface LoadingShellOptions {
  /** The panel's name, as the menu shows it */
  label: string;
  /** Selector for the real panel's root; the shell leaves the moment it appears */
  readySelector: string;
  /** Opens the real panel: import, fetch and draw */
  open: () => unknown;
  /** Closes the real panel, for when they dismissed the shell while it loaded */
  close?: () => void;
}

const SHELL_CLASS = 'panel-loading-shell';
const STYLE_ID = 'panel-loading-shell-styles';

const CLOSE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${SHELL_CLASS} {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      animation: panel-shell-in var(--duration-normal, 200ms) ease-out 120ms both;
    }
    .${SHELL_CLASS}__backdrop {
      position: absolute;
      inset: 0;
      background: var(--color-background-overlay);
      opacity: 0.6;
    }
    .${SHELL_CLASS}__card {
      position: relative;
      width: min(440px, 100%);
      padding: var(--space-6, 24px);
      border-radius: var(--radius-xl, 16px);
      background: var(--color-background-elevated);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      box-shadow: var(--shadow-xl);
      text-align: center;
    }
    .${SHELL_CLASS}__title {
      margin: 0 0 var(--space-2, 8px);
      font-family: var(--font-display, inherit);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .${SHELL_CLASS}__message {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--text-sm, 0.875rem);
    }
    .${SHELL_CLASS}__dots {
      display: flex;
      justify-content: center;
      gap: 6px;
      margin: var(--space-4, 16px) 0;
    }
    .${SHELL_CLASS}__dots span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-accent-primary);
      animation: panel-shell-breathe 1.4s ease-in-out infinite;
    }
    .${SHELL_CLASS}__dots span:nth-child(2) { animation-delay: 0.2s; }
    .${SHELL_CLASS}__dots span:nth-child(3) { animation-delay: 0.4s; }
    .${SHELL_CLASS}__close {
      position: absolute;
      top: var(--space-3, 12px);
      right: var(--space-3, 12px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .${SHELL_CLASS}__close:hover { background: var(--color-background-secondary); }
    .${SHELL_CLASS}__close:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
    @keyframes panel-shell-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes panel-shell-breathe { 0%, 100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) {
      .${SHELL_CLASS}, .${SHELL_CLASS}__dots span { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function createShell(label: string, onDismiss: () => void): HTMLElement {
  const shell = document.createElement('div');
  shell.className = SHELL_CLASS;
  shell.setAttribute('aria-busy', 'true');
  shell.innerHTML = `
    <div class="${SHELL_CLASS}__backdrop"></div>
    <div class="${SHELL_CLASS}__card">
      <button type="button" class="${SHELL_CLASS}__close">${CLOSE_ICON}</button>
      <h2 class="${SHELL_CLASS}__title"></h2>
      <div class="${SHELL_CLASS}__dots" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="${SHELL_CLASS}__message" role="status"></p>
    </div>
  `;
  // textContent, not markup: the label comes from the locale files
  shell.querySelector(`.${SHELL_CLASS}__title`)!.textContent = label;
  shell.querySelector(`.${SHELL_CLASS}__message`)!.textContent = t('panelShell.gettingReady');
  shell.querySelector(`.${SHELL_CLASS}__close`)!.setAttribute('aria-label', t('common.close'));
  shell.querySelector(`.${SHELL_CLASS}__close`)!.addEventListener('click', onDismiss);
  shell.querySelector(`.${SHELL_CLASS}__backdrop`)!.addEventListener('click', onDismiss);
  asModalDialog(shell, { label }, () => shell.isConnected, onDismiss);
  return shell;
}

/**
 * Show a named loading shell now, open the real panel, and swap the shell out
 * the moment the panel's root is on the page (or when opening finishes or fails).
 */
export async function openWithLoadingShell(options: LoadingShellOptions): Promise<void> {
  const { label, readySelector, open, close } = options;
  // Already open (a second tap): nothing to wait for
  if (document.querySelector(readySelector)) {
    await open();
    return;
  }

  injectStyles();
  let dismissed = false;
  let observer: MutationObserver | null = null;
  const removeShell = (): void => {
    observer?.disconnect();
    observer = null;
    shell.remove();
  };
  const shell = createShell(label, () => {
    dismissed = true;
    removeShell();
  });
  document.body.appendChild(shell);

  observer = new MutationObserver(() => {
    if (document.querySelector(readySelector)) removeShell();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  try {
    await open();
  } finally {
    removeShell();
    // They walked away while it loaded: don't spring the panel on them now
    if (dismissed && document.querySelector(readySelector)) close?.();
  }
}
