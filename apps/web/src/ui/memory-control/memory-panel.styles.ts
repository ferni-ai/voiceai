/**
 * Styles for the "What Ferni remembers" panel and its confirm dialog.
 * Colors come from theme tokens only, using the generated text inks so text
 * stays AA-readable in Zen and Midnight.
 *
 * @module ui/memory-control/memory-panel.styles
 */

import { DURATION } from '../../config/animation-constants.js';

const STYLE_ID = 'memory-panel-styles';

const CSS = `
.memory-panel-wrapper {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
}

.memory-panel.ferni-modal__card {
  display: flex;
  flex-direction: column;
  max-height: min(88vh, 860px);
  overflow: hidden;
}

.memory-panel .ferni-modal__header {
  display: block;
  padding-inline-end: var(--space-12);
}
.memory-panel .ferni-modal__tagline { color: var(--color-text-secondary); }

.memory-panel__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  min-height: 0;
}

.memory-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Sign-in prompt for anonymous users */
.memory-signin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-semantic-info-tint);
  border: 1px solid var(--color-border-subtle);
}
.memory-signin[hidden] { display: none; }
.memory-signin__text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

/* Tabs */
.memory-tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border-subtle);
  overflow-x: auto;
  scrollbar-width: thin;
}
.memory-tab {
  flex-shrink: 0;
  white-space: nowrap;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color ${DURATION.FAST}ms ease, border-color ${DURATION.FAST}ms ease;
}
.memory-tab:hover,
.memory-tab:focus-visible { color: var(--color-text-primary); }
.memory-tab[aria-selected='true'] {
  color: var(--color-accent-text);
  border-bottom-color: var(--color-accent-text);
  font-weight: 600;
}
.memory-tabpanel { outline: none; }
.memory-tabpanel[hidden] { display: none; }

/* Focus: one consistent ring */
.memory-panel button:focus-visible,
.memory-panel input:focus-visible,
.memory-panel select:focus-visible,
.memory-panel textarea:focus-visible,
.memory-panel .memory-tabpanel:focus-visible,
.memory-panel .memory-transcript__title:focus-visible,
.memory-confirm button:focus-visible,
.memory-confirm input:focus-visible {
  outline: 2px solid var(--color-accent-text);
  outline-offset: 2px;
}

/* Toolbar */
.memory-toolbar {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.memory-input {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-input);
  border: 1px solid var(--color-border-medium);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font: inherit;
  font-size: var(--text-sm);
}
.memory-input::placeholder { color: var(--color-text-secondary); }
.memory-toolbar .memory-input[type='search'] { flex: 1 1 220px; }
.memory-select { flex: 0 1 180px; }
.memory-textarea { width: 100%; resize: vertical; line-height: 1.5; box-sizing: border-box; }

/* Groups and items */
.memory-group { margin-bottom: var(--space-5); }

/* Work & places tab */
.memory-area { margin-bottom: var(--space-6); }
.memory-area__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
.memory-area__title { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--color-text-primary); }
.memory-add { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
.memory-field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-secondary); }
.memory-field .memory-select { flex: none; }
.memory-group__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.memory-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.memory-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-subtle);
}
.memory-item--editing { flex-direction: column; align-items: stretch; }
.memory-item__body { flex: 1; min-width: 0; }
.memory-item__text {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.5;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}
.memory-item__detail {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
.memory-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}
.memory-item__actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
  flex-shrink: 0;
}
.memory-badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-medium);
  color: var(--color-accent-text);
  font-weight: 500;
}
.memory-muted { color: var(--color-text-secondary); font-size: var(--text-sm); }
.memory-no-results { text-align: center; padding: var(--space-6) 0; }

/* Buttons */
.memory-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms ease, border-color ${DURATION.FAST}ms ease;
}
.memory-btn[disabled] { cursor: not-allowed; opacity: 0.6; }
.memory-btn--primary {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
}
.memory-btn--primary:hover:not([disabled]),
.memory-btn--primary:focus-visible { background: var(--color-accent-hover); }
.memory-btn--quiet {
  background: transparent;
  border-color: var(--color-border-medium);
  color: var(--color-text-primary);
}
.memory-btn--quiet:hover:not([disabled]),
.memory-btn--quiet:focus-visible { background: var(--color-tonal-surface-hover-background); }
.memory-btn--danger {
  background: transparent;
  border-color: var(--color-semantic-error-text);
  color: var(--color-semantic-error-text);
}
.memory-btn--danger:hover:not([disabled]),
.memory-btn--danger:focus-visible { background: var(--color-semantic-error-tint); }
.memory-btn--danger-quiet {
  background: transparent;
  color: var(--color-semantic-error-text);
}
.memory-btn--danger-quiet:hover,
.memory-btn--danger-quiet:focus-visible { background: var(--color-semantic-error-tint); }

.memory-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms ease, color ${DURATION.FAST}ms ease;
}
.memory-icon-btn:hover,
.memory-icon-btn:focus-visible {
  background: var(--color-tonal-surface-hover-background);
  color: var(--color-text-primary);
}
.memory-icon-btn--danger:hover,
.memory-icon-btn--danger:focus-visible { color: var(--color-semantic-error-text); }

/* Conversations */
.memory-conversation { padding: 0; }
.memory-conversation__open {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  text-align: start;
  font: inherit;
  cursor: pointer;
}
.memory-conversation__open:hover,
.memory-conversation__open:focus-visible { background: var(--color-tonal-surface-hover-background); }
.memory-conversation__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.memory-conversation__head .memory-item__meta { margin: 0; }
.memory-conversation__persona { font-weight: 600; color: var(--persona-ink); }
.memory-more { display: flex; justify-content: center; margin-top: var(--space-4); }

.memory-transcript__bar {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.memory-back { padding-inline-start: var(--space-3); }
.memory-transcript__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}
.memory-transcript__summary {
  margin: var(--space-3) 0 0;
  padding: var(--space-3) var(--space-4);
  border-inline-start: 3px solid var(--color-border-medium);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}
.memory-turns {
  list-style: none;
  margin: var(--space-5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.memory-turn {
  max-width: 85%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-subtle);
}
.memory-turn--user {
  align-self: flex-end;
  background: var(--color-background-tertiary);
}
.memory-turn--assistant {
  align-self: flex-start;
  background: var(--color-background-secondary);
}
.memory-turn__speaker {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
}
.memory-turn--assistant .memory-turn__speaker { color: var(--persona-ink); }
.memory-turn__speaker time { font-weight: 400; color: var(--color-text-secondary); margin-inline-start: var(--space-2); }
.memory-turn__text {
  margin: 0;
  line-height: 1.55;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Your data */
.memory-card {
  padding: var(--space-5);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-background-secondary);
  margin-bottom: var(--space-4);
}
.memory-card--danger { border-color: var(--color-semantic-error-text); }
.memory-card__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
}
.memory-card--danger .memory-card__title { color: var(--color-semantic-error-text); }
.memory-card__text { margin: 0 0 var(--space-4); font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5; }
.memory-card__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }

/* States */
.memory-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
}
.memory-state__icon { color: var(--color-accent-text); }
.memory-state__title { margin: 0; font-weight: 600; color: var(--color-text-primary); }
.memory-state__text { margin: 0; max-width: 40ch; color: var(--color-text-secondary); font-size: var(--text-sm); line-height: 1.5; }
.memory-state__spinner {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border-medium);
  border-top-color: var(--color-accent-text);
  animation: memory-spin ${DURATION.SLOW * 3}ms linear infinite;
}
@keyframes memory-spin { to { transform: rotate(360deg); } }

/* Confirm dialog */
.memory-confirm {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 10);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}
.memory-confirm__backdrop {
  position: absolute;
  inset: 0;
  background: var(--color-background-overlay);
}
.memory-confirm__card {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: var(--space-6);
  border-radius: var(--radius-dialog);
  background: var(--color-background-elevated);
  box-shadow: var(--shadow-2xl);
  border: 1px solid var(--color-border-subtle);
}
.memory-confirm__title { margin: 0 0 var(--space-2); font-size: var(--text-lg); color: var(--color-text-primary); }
.memory-confirm__message { margin: 0 0 var(--space-4); color: var(--color-text-secondary); line-height: 1.5; font-size: var(--text-sm); }
.memory-confirm__label { display: block; margin-bottom: var(--space-1); font-size: var(--text-sm); color: var(--color-text-primary); font-weight: 500; }
.memory-confirm__input {
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-4);
  border-radius: var(--radius-input);
  border: 1px solid var(--color-border-medium);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font: inherit;
}
.memory-confirm__actions { display: flex; justify-content: flex-end; gap: var(--space-2); flex-wrap: wrap; }

@media (max-width: 520px) {
  .memory-item { padding: var(--space-3); }
  .memory-turn { max-width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .memory-tab,
  .memory-btn,
  .memory-icon-btn { transition: none; }
  .memory-state__spinner { animation: none; }
}
`;

export function injectMemoryPanelStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
