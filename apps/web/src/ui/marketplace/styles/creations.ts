/**
 * Marketplace Creations Styles
 *
 * Styles for the "My Creations" tab showing custom agents.
 * Uses CSS variables from design system - no hardcoded colors.
 *
 * @module marketplace/styles/creations
 */

import { DURATION, EASING } from '../../../config/animation-constants.js';

/**
 * Get creations tab styles
 */
export function getCreationsStyles(): string {
  return `
    /* ========================================
       CREATIONS SECTION
       ======================================== */

    .creations-section {
      padding: var(--space-md) 0;
    }

    .creations-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-xl);
    }

    .creations-header-content {
      flex: 1;
    }

    .creations-title {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .creations-subtitle {
      font-family: var(--font-body);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    .creations-create-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 10px 20px;
      border-radius: 9999px;
      background: var(--persona-primary, var(--color-accent-primary));
      border: none;
      color: white;
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .creations-create-btn:hover,
    .creations-create-btn:focus-visible {
      background: var(--persona-secondary, var(--color-accent-hover));
      transform: scale(1.02);
    }

    /* ========================================
       EMPTY STATE
       ======================================== */

    .creations-empty {
      text-align: center;
      padding: var(--space-xl);
      background: var(--color-bg-subtle);
      border: 1px dashed var(--color-border-medium);
      border-radius: var(--radius-xl);
      margin-bottom: var(--space-xl);
    }

    .creations-empty-illustration {
      margin-bottom: var(--space-md);
    }

    .creations-empty-title {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .creations-empty-hint {
      font-family: var(--font-body);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-lg);
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    .creations-empty-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 12px 24px;
      border-radius: 9999px;
      background: var(--persona-primary, var(--color-accent-primary));
      border: none;
      color: white;
      font-family: var(--font-body);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .creations-empty-btn:hover,
    .creations-empty-btn:focus-visible {
      background: var(--persona-secondary, var(--color-accent-hover));
      transform: scale(1.02);
    }

    /* ========================================
       CREATION TYPES PREVIEW
       ======================================== */

    .creations-types-preview {
      margin-top: var(--space-xl);
    }

    .creations-types-title {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-md);
    }

    .creations-types-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-md);
    }

    .creation-type-card {
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-lg);
      text-align: center;
      transition: all ${DURATION.FAST}ms ease;
    }

    .creation-type-card:hover {
      border-color: var(--color-border-medium);
      transform: translateY(-2px);
    }

    .creation-type-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-sm);
      background: var(--color-bg-secondary);
      border-radius: 50%;
      color: var(--persona-primary, var(--color-accent-primary));
    }

    .creation-type-name {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .creation-type-desc {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 0;
      line-height: 1.4;
    }

    /* ========================================
       CUSTOM AGENT CARDS
       ======================================== */

    .creations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md);
    }

    .custom-agent-card {
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-lg);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .custom-agent-card:hover {
      border-color: var(--color-border-medium);
      box-shadow: var(--shadow-lg);
      transform: translateY(-2px);
    }

    .custom-agent-header {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .custom-agent-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      box-shadow: var(--shadow-md);
    }

    .custom-agent-meta {
      flex: 1;
      min-width: 0;
    }

    .custom-agent-name {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .custom-agent-type {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-accent-text);
    }

    .custom-agent-status {
      font-family: var(--font-body);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 9999px;
      flex-shrink: 0;
    }

    .custom-agent-status.status--active {
      background: var(--color-semantic-success-glow);
      color: var(--color-semantic-success);
    }

    .custom-agent-status.status--paused {
      background: var(--color-semantic-warning-glow);
      color: var(--color-semantic-warning);
    }

    .custom-agent-status.status--draft {
      background: var(--color-bg-secondary);
      color: var(--color-text-muted);
    }

    .custom-agent-description {
      font-family: var(--font-body);
      font-size: 0.85rem;
      line-height: 1.5;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-md);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .custom-agent-stats {
      display: flex;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .custom-agent-stat {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .custom-agent-stat svg {
      color: var(--color-text-dimmed);
    }

    .custom-agent-footer {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
      margin-top: var(--space-sm);
    }

    .custom-agent-action {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 9999px;
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
      border: 1px solid var(--color-border-subtle);
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
    }

    .custom-agent-action:hover,
    .custom-agent-action:focus-visible {
      background: var(--color-bg-tertiary);
      border-color: var(--color-border-medium);
      color: var(--color-text-primary);
    }

    .custom-agent-action--talk {
      background: var(--persona-primary, var(--color-accent-primary));
      border-color: var(--persona-primary, var(--color-accent-primary));
      color: white;
    }

    .custom-agent-action--talk:hover {
      background: var(--persona-secondary, var(--color-accent-hover));
      border-color: var(--persona-secondary, var(--color-accent-hover));
    }

    .custom-agent-action--delete {
      border-color: transparent;
      background: transparent;
      color: var(--color-text-dimmed);
      padding: 6px;
    }

    .custom-agent-action--delete:hover {
      background: var(--color-semantic-error-glow);
      color: var(--color-semantic-error);
    }
  `;
}

