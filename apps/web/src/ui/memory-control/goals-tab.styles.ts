/**
 * Styles for the Goals & habits tab (on top of the memory panel styles).
 * Theme tokens and generated text inks only, so text stays AA-readable in
 * Zen and Midnight.
 *
 * @module ui/memory-control/goals-tab.styles
 */

import { DURATION } from '../../config/animation-constants.js';

const STYLE_ID = 'memory-goals-styles';

const CSS = `
.goals-due {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-semantic-info-tint);
  color: var(--color-text-primary);
  font-weight: 600;
}
.goals-progress {
  height: 6px;
  margin: var(--space-2) 0 0;
  border-radius: var(--radius-full);
  background: var(--color-border-subtle);
  overflow: hidden;
  max-width: 280px;
}
.goals-progress > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-accent-primary);
  transition: width ${DURATION.NORMAL}ms ease;
}
.memory-btn.goals-done { min-height: 40px; padding: var(--space-1) var(--space-3); }
.goals-label {
  display: block;
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}
.goals-row { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.goals-field { flex: 1 1 180px; display: flex; flex-direction: column; }
.goals-field .memory-select { flex: none; }

@media (prefers-reduced-motion: reduce) {
  .goals-progress > span { transition: none; }
}
`;

export function injectGoalsTabStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
