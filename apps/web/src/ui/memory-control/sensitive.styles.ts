/**
 * Styles for the "Sensitive" tab (consent switches, health notes, mood).
 * Theme tokens only; reuses the panel's buttons, items and groups.
 *
 * @module ui/memory-control/sensitive.styles
 */

import { DURATION } from '../../config/animation-constants.js';

const STYLE_ID = 'memory-sensitive-styles';

const CSS = `
.memory-consent {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-background-secondary);
}
.memory-consent__intro { margin: 0; color: var(--color-text-primary); font-size: var(--text-base); }
.memory-consent__ask { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.memory-consent__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }

.memory-switch-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-background-primary);
}
.memory-switch-row__label { margin: 0; font-weight: 600; color: var(--color-text-primary); }
.memory-switch-row__desc { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
.memory-switch-row__stored { margin: var(--space-2) 0 0; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-sm); color: var(--color-text-secondary); }

.memory-switch {
  position: relative;
  flex: none;
  width: var(--space-12);
  height: var(--space-6);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-medium);
  background: var(--color-background-tertiary);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms ease, border-color ${DURATION.FAST}ms ease;
}
.memory-switch::after {
  content: '';
  position: absolute;
  top: 50%;
  inset-inline-start: var(--space-1);
  width: var(--space-4);
  height: var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-text-secondary);
  transform: translateY(-50%);
  transition: inset-inline-start ${DURATION.FAST}ms ease, background ${DURATION.FAST}ms ease;
}
.memory-switch[aria-checked='true'] { background: var(--color-accent-primary); border-color: var(--color-accent-primary); }
.memory-switch[aria-checked='true']::after { inset-inline-start: calc(100% - var(--space-5)); background: var(--color-text-on-accent); }
.memory-switch:focus-visible { outline: 2px solid var(--color-accent-text); outline-offset: 2px; }
.memory-switch[disabled] { cursor: not-allowed; opacity: 0.6; }

.memory-safety {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-semantic-info-tint);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
}
.memory-safety strong { font-weight: 600; }

.memory-mood-insight { margin: 0 0 var(--space-2); color: var(--color-text-primary); font-style: italic; }

@media (prefers-reduced-motion: reduce) {
  .memory-switch,
  .memory-switch::after { transition: none; }
}
`;

export function injectSensitiveStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
