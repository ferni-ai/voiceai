/**
 * Marketplace Detail Panel Styles
 *
 * Styles for the agent detail view panel.
 * Uses CSS variables from design system - no hardcoded colors.
 *
 * @module marketplace/styles/detail
 */

import { DURATION, EASING } from '../../../config/animation-constants.js';

/**
 * Get detail panel styles
 */
export function getDetailStyles(): string {
  return `
    /* ========================================
       DETAIL PANEL MODAL
       ======================================== */

    .marketplace-detail {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .marketplace-detail.open {
      opacity: 1;
      pointer-events: auto;
    }

    .detail-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy);
      backdrop-filter: blur(var(--glass-blur-heavy));
      -webkit-backdrop-filter: blur(var(--glass-blur-heavy));
    }

    .detail-panel {
      position: relative;
      width: 90%;
      max-width: clamp(336px, 90vw, 480px);
      max-height: 85vh;
      background: var(--color-bg-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .marketplace-detail.open .detail-panel {
      transform: scale(1);
    }

    /* ========================================
       DETAIL HEADER
       ======================================== */

    .detail-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: var(--color-bg-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      z-index: 1;
    }

    .detail-close:hover,
    .detail-close:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }

    .detail-header {
      padding: var(--space-xl);
      padding-right: 60px;
      display: flex;
      gap: var(--space-md);
      background: var(--color-bg-secondary);
    }

    .detail-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      box-shadow: var(--shadow-lg);
    }

    .detail-meta {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
    }

    .detail-name {
      font-family: var(--font-display);
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
      margin: 0;
    }

    .detail-category {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-accent-text);
      margin: 0 0 8px;
    }

    .detail-rating {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .detail-stars {
      display: flex;
      color: var(--color-accent-text);
    }

    .detail-rating-value {
      font-family: var(--font-body);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .detail-rating-count {
      font-family: var(--font-body);
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }

    /* ========================================
       DETAIL CONTENT
       ======================================== */

    .detail-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg);
    }

    .detail-section {
      margin-bottom: var(--space-xl);
    }

    .detail-section:last-child {
      margin-bottom: 0;
    }

    .detail-section-title {
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm);
    }

    .detail-description {
      font-family: var(--font-body);
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-sm);
    }

    .detail-author {
      font-family: var(--font-body);
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    .detail-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
    }

    .detail-tag {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      padding: 6px 12px;
      border-radius: 9999px;
      border: 1px solid var(--color-border-subtle);
    }

    .detail-empty-reviews {
      font-family: var(--font-body);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      text-align: center;
      padding: var(--space-lg);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      margin: 0;
    }

    /* ========================================
       REVIEWS
       ======================================== */

    .detail-reviews {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .review-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
    }

    .review-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm);
    }

    .review-rating {
      display: flex;
      color: var(--color-accent-text);
    }

    .review-date {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }

    .review-title {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .review-body {
      font-family: var(--font-body);
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .review-helpful {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin-top: var(--space-sm);
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .review-response {
      margin-top: var(--space-md);
      padding: var(--space-md);
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-accent-text);
    }

    .review-response-label {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-xs);
    }

    .review-response-body {
      font-family: var(--font-body);
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* ========================================
       DETAIL FOOTER
       ======================================== */

    .detail-footer {
      padding: var(--space-lg);
      background: var(--color-bg-secondary);
      border-top: 1px solid var(--color-border-subtle);
    }

    .detail-action {
      width: 100%;
      padding: 14px 24px;
      border-radius: 9999px;
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
      border: none;
    }

    .detail-action.install {
      background: var(--persona-primary, var(--color-accent-primary));
      color: white;
    }

    .detail-action.install:hover {
      background: var(--persona-secondary, var(--color-accent-hover));
      transform: scale(1.02);
    }

    .detail-action.uninstall {
      background: transparent;
      border: 2px solid var(--color-border-medium);
      color: var(--color-text-secondary);
    }

    .detail-action.uninstall:hover {
      border-color: var(--color-semantic-error-glow);
      color: var(--color-semantic-error);
      background: var(--color-semantic-error-glow);
    }
  `;
}

