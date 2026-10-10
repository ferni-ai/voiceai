/**
 * Styles for the command palette (centered floating modal, blurred backdrop).
 *
 * @module command-palette-styles
 */

import { DURATION, EASING } from '../config/animation-constants.js';

export const COMMAND_PALETTE_STYLE_ID = 'ferni-command-palette';

export const COMMAND_PALETTE_CSS = `
  .command-palette {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
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
    background: var(--backdrop-medium);
    backdrop-filter: blur(var(--glass-blur-strong));
    -webkit-backdrop-filter: blur(var(--glass-blur-strong));
  }

  .command-palette__card {
    position: relative;
    width: 100%;
    max-width: 560px;
    background: var(--color-background-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    transform: scale(0.96);
    transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
  }

  .command-palette--open .command-palette__card {
    transform: scale(1);
  }

  .command-palette__search {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .command-palette__search-icon {
    display: flex;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .command-palette__input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    outline: none;
  }

  .command-palette__input::placeholder {
    color: var(--color-text-muted);
  }

  .command-palette__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: calc(var(--space-2) * -1);
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .command-palette__close:hover,
  .command-palette__close:focus-visible {
    background: var(--color-background-secondary);
  }

  .command-palette__close:focus-visible {
    outline: 2px solid var(--persona-primary);
    outline-offset: 2px;
  }

  .command-palette__results {
    max-height: min(360px, 50vh);
    overflow-y: auto;
    padding: var(--space-2);
  }

  .command-palette__empty {
    padding: var(--space-8);
    text-align: center;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .command-palette__category {
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .command-palette__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .command-palette__item:hover {
    background: var(--color-background-secondary);
  }

  .command-palette__item--selected,
  .command-palette__item--selected:hover {
    background: var(--persona-tint);
  }

  .command-palette__item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--color-background-secondary);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .command-palette__item--selected .command-palette__item-icon {
    background: var(--persona-primary);
    color: var(--persona-text);
  }

  .command-palette__item-content {
    flex: 1;
    min-width: 0;
  }

  .command-palette__item-label {
    display: block;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .command-palette__item-description {
    display: block;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .command-palette__kbd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    padding: var(--space-1) var(--space-2);
    background: var(--color-background-secondary);
    border-radius: var(--radius-sm);
  }

  .command-palette__footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .command-palette__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .command-palette,
    .command-palette__card {
      transition: none;
    }
  }
`;
