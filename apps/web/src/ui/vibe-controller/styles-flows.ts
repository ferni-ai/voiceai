/**
 * Vibe Controller - flow styles (not connected, more vibes, setup, loading, Ecobee PIN, reduced motion)
 *
 * Concatenated after styles-core.ts by injectStyles() into one <style> element.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

export function getFlowStyles(): string {
  return `
    /* Not Connected State */
    .vibe-not-connected {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-not-connected__icon {
      width: 48px;
      height: 48px;
      margin-bottom: var(--space-sm, 12px);
      color: var(--color-text-dimmed, #A89D90);
    }

    .vibe-not-connected__icon svg {
      width: 100%;
      height: 100%;
    }

    .vibe-not-connected__text {
      font-size: 0.875rem;
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-not-connected__btn {
      padding: var(--space-sm, 10px) var(--space-lg, 20px);
      background: var(--color-ferni, #3D5A45);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-not-connected__btn:hover {
      background: var(--color-ferni-hover, #4a6d52);
      transform: translateY(-1px);
    }

    /* More Vibes Expandable */
    .vibe-more-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, 8px);
      width: 100%;
      padding: var(--space-sm, 12px);
      background: none;
      border: 1px dashed var(--color-border-medium, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-md, 12px);
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-more-toggle:hover {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      color: var(--color-text-primary, #2C2520);
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-more-toggle svg {
      width: 16px;
      height: 16px;
      transition: transform ${DURATION.FAST}ms;
    }

    .vibe-more-toggle--expanded svg {
      transform: rotate(180deg);
    }

    .vibe-activity-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: var(--space-sm, 10px);
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, 
                  opacity ${DURATION.NORMAL}ms, 
                  margin ${DURATION.NORMAL}ms;
      margin-bottom: 0;
    }

    .vibe-activity-grid--visible {
      max-height: 500px;
      opacity: 1;
      margin-bottom: var(--space-lg, 24px);
    }

    .vibe-activity {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 12px) var(--space-xs, 8px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border: 2px solid transparent;
      border-radius: var(--radius-md, 12px);
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }

    .vibe-activity:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      transform: translateY(-1px);
    }

    .vibe-activity--active {
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-activity__icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-activity--active .vibe-activity__icon {
      color: var(--color-ferni-ink);
    }

    .vibe-activity__icon svg {
      width: 20px;
      height: 20px;
    }

    .vibe-activity__name {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      text-align: center;
    }

    .vibe-activity--active .vibe-activity__name {
      color: var(--color-ferni-ink);
    }

    /* Setup Flow */
    .vibe-setup {
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 16px);
      text-align: center;
    }

    .vibe-setup__icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-md, 16px);
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni-ink);
    }

    .vibe-setup__icon svg {
      width: 32px;
      height: 32px;
    }

    .vibe-setup__title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-xs, 8px) 0;
    }

    .vibe-setup__desc {
      font-size: 0.875rem;
      color: var(--color-text-muted, #756A5E);
      margin: 0 0 var(--space-lg, 24px) 0;
      line-height: 1.5;
    }

    .vibe-setup__options {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-setup__option {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-md, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-setup__option:hover {
      border-color: var(--color-ferni, #3D5A45);
      transform: translateY(-1px);
    }

    .vibe-setup__option-icon {
      width: 40px;
      height: 40px;
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.05));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-setup__option-icon svg {
      width: 20px;
      height: 20px;
    }

    .vibe-setup__option-info {
      flex: 1;
      text-align: left;
    }

    .vibe-setup__option-name {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-setup__option-desc {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-setup__option-arrow {
      color: var(--color-text-dimmed, #A89D90);
    }

    .vibe-setup__option-arrow svg {
      width: 16px;
      height: 16px;
    }

    .vibe-setup__skip {
      background: none;
      border: none;
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      cursor: pointer;
      padding: var(--space-sm, 8px);
    }

    .vibe-setup__skip:hover {
      color: var(--color-text-primary, #2C2520);
    }

    /* Connection Status Badges */
    .vibe-connection-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-2xs, 4px) var(--space-sm, 10px);
      background: var(--color-semantic-success-tint, rgba(34, 197, 94, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-size: 0.75rem;
      color: var(--color-semantic-success-text);
    }

    .vibe-connection-badge--warning {
      background: var(--color-semantic-warning-tint, rgba(245, 158, 11, 0.1));
      color: var(--color-semantic-warning-text);
    }

    .vibe-connection-badge svg {
      width: 12px;
      height: 12px;
    }

    /* Loading State */
    .vibe-preset--loading,
    .vibe-activity--loading {
      opacity: 0.6;
      pointer-events: none;
    }

    .vibe-preset--loading .vibe-preset__icon,
    .vibe-activity--loading .vibe-activity__icon {
      animation: vibe-pulse 1s ease-in-out infinite;
    }

    @keyframes vibe-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .vibe-control--loading .vibe-control__slider {
      opacity: 0.5;
      pointer-events: none;
    }

    .vibe-music__btn--loading,
    .vibe-not-connected__btn--loading {
      opacity: 0.7;
      pointer-events: none;
    }

    /* Ecobee PIN Dialog - Moved from inline styles */
    .ecobee-pin-dialog {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      background: rgba(44, 37, 32, 0.75);
    }

    .ecobee-pin-card {
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 20px);
      padding: var(--space-lg, 24px);
      max-width: 400px;
      text-align: center;
      box-shadow: var(--shadow-xl, 0 20px 60px rgba(44, 37, 32, 0.2));
    }

    .ecobee-pin-card h3 {
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-md, 16px);
      font-size: 1.25rem;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    }

    .ecobee-pin-card__instructions {
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__pin {
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: 0.5rem;
      color: var(--color-ferni-ink);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 12px);
      font-family: monospace;
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__steps {
      text-align: left;
      color: var(--color-text-secondary, #5C544A);
      padding-left: var(--space-lg, 20px);
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__steps li {
      margin: var(--space-xs, 8px) 0;
    }

    .ecobee-pin-card__expires {
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__cancel {
      background: transparent;
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-sm, 12px) var(--space-lg, 20px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      font-size: 1rem;
      transition: all ${DURATION.FAST}ms;
    }

    .ecobee-pin-card__cancel:hover {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-color: var(--color-border-medium, rgba(44, 37, 32, 0.15));
    }

    .ecobee-pin-card__cancel:focus-visible {
      outline: 2px solid var(--color-ferni, #3D5A45);
      outline-offset: 2px;
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .vibe-overlay,
      .vibe-panel,
      .vibe-preset,
      .vibe-music__btn,
      .vibe-temp__btn,
      .vibe-control__slider::-webkit-slider-thumb,
      .ecobee-pin-card__cancel {
        transition: none;
      }

      .vibe-preset--loading .vibe-preset__icon,
      .vibe-activity--loading .vibe-activity__icon {
        animation: none;
      }
    }
  `;
}
