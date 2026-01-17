/**
 * Marketplace Card Styles
 *
 * Styles for agent cards in the marketplace.
 * Uses CSS variables from design system - no hardcoded colors.
 *
 * @module marketplace/styles/cards
 */

import { DURATION, EASING } from '../../../config/animation-constants.js';

/**
 * Get agent card styles
 */
export function getCardStyles(): string {
  return `
    /* ========================================
       ANIMATIONS
       ======================================== */

    @keyframes avatar-breathe {
      0%, 100% {
        transform: scale3d(1, 1, 1) translateY(0);
      }
      40%, 50% {
        transform: scale3d(0.994, 1.012, 1) translateY(-2px);
      }
      90% {
        transform: scale3d(1, 1, 1) translateY(0);
      }
    }

    @keyframes ring-pulse {
      0%, 100% {
        opacity: 0.15;
        transform: scale(1);
      }
      50% {
        opacity: 0.35;
        transform: scale(1.04);
      }
    }

    @keyframes avatar-float {
      0%, 100% {
        transform: translateY(0) rotate(0deg);
      }
      25% {
        transform: translateY(-6px) rotate(0.5deg);
      }
      50% {
        transform: translateY(-10px) rotate(-0.3deg);
      }
      75% {
        transform: translateY(-4px) rotate(0.3deg);
      }
    }

    @keyframes glow-pulse {
      0%, 100% {
        box-shadow: 
          0 0 0 0 var(--avatar-glow, var(--persona-glow)),
          0 4px 20px rgba(0, 0, 0, 0.15);
      }
      50% {
        box-shadow: 
          0 0 30px 8px var(--avatar-glow, var(--persona-glow)),
          0 8px 32px rgba(0, 0, 0, 0.2);
      }
    }

    @keyframes cardEntrance {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
    }

    /* ========================================
       AGENT CARD BASE
       ======================================== */

    .marketplace-agent {
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-lg);
      cursor: pointer;
      transition: all ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      animation: cardEntrance ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} backwards;
    }

    .marketplace-agent:hover {
      border-color: var(--color-border-medium);
      box-shadow: var(--shadow-lg);
      transform: translateY(-2px);
    }

    .marketplace-agent:focus-visible {
      outline: 2px solid var(--persona-primary, var(--color-accent-primary));
      outline-offset: 2px;
    }

    /* Staggered entrance animation */
    .marketplace-agent:nth-child(1) { animation-delay: 0ms; }
    .marketplace-agent:nth-child(2) { animation-delay: ${DURATION.MICRO}ms; }
    .marketplace-agent:nth-child(3) { animation-delay: ${DURATION.FAST}ms; }
    .marketplace-agent:nth-child(4) { animation-delay: ${DURATION.FAST + DURATION.MICRO}ms; }
    .marketplace-agent:nth-child(5) { animation-delay: ${DURATION.NORMAL}ms; }
    .marketplace-agent:nth-child(6) { animation-delay: ${DURATION.NORMAL + DURATION.MICRO}ms; }
    .marketplace-agent:nth-child(n+7) { animation-delay: ${DURATION.SLOW}ms; }

    /* ========================================
       DISCOVER CARD - Circle Avatar Layout
       ======================================== */

    .marketplace-agent.discover-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-xl) var(--space-lg);
      background: linear-gradient(145deg, 
        var(--color-bg-subtle) 0%,
        var(--color-bg-elevated) 100%
      );
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-2xl);
    }

    .discover-avatar-container {
      position: relative;
      width: 88px;
      height: 88px;
      margin-bottom: var(--space-md);
      animation: avatar-float 8s var(--ease-smooth) infinite;
      animation-delay: var(--stagger-delay, 0s);
    }

    .discover-avatar-ring {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      background: radial-gradient(circle, var(--avatar-glow, var(--persona-glow)) 0%, transparent 70%);
      opacity: 0.15;
      animation: ring-pulse 4s var(--ease-smooth) infinite;
      animation-delay: var(--stagger-delay, 0s);
      pointer-events: none;
    }

    .discover-avatar-orb {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1.4rem;
      font-weight: 700;
      color: white;
      letter-spacing: 0.02em;
      box-shadow: var(--shadow-lg);
      animation: avatar-breathe 5s var(--ease-smooth) infinite;
      animation-delay: var(--stagger-delay, 0s);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                  box-shadow ${DURATION.SLOW}ms ease;
    }

    .marketplace-agent.discover-card:hover .discover-avatar-orb {
      animation: avatar-breathe 2s var(--ease-spring-gentle) infinite,
                 glow-pulse 2s ease-in-out infinite;
      transform: scale(1.08);
    }

    .marketplace-agent.discover-card:hover .discover-avatar-ring {
      opacity: 0.5;
      animation: ring-pulse 2s var(--ease-spring-gentle) infinite;
    }

    /* ========================================
       DISCOVER INFO
       ======================================== */

    .discover-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: var(--space-sm);
    }

    .discover-card .agent-name {
      font-size: 1.15rem;
      margin: 0;
    }

    .discover-card .agent-category {
      font-size: 0.7rem;
    }

    .discover-card .agent-badge {
      margin-top: var(--space-xs);
    }

    .discover-card .agent-description {
      text-align: center;
      -webkit-line-clamp: 3;
    }

    .discover-card .agent-tags {
      justify-content: center;
    }

    .discover-card .agent-footer {
      width: 100%;
      flex-direction: column;
      gap: var(--space-sm);
      align-items: center;
    }

    .discover-card .agent-action {
      width: 100%;
      max-width: min(180px, 100%);
    }

    /* ========================================
       AGENT CARD ELEMENTS
       ======================================== */

    .agent-header {
      display: flex;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .agent-avatar {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      box-shadow: var(--shadow-md);
      animation: avatar-breathe 5s var(--ease-smooth) infinite;
    }

    .marketplace-agent:hover .agent-avatar {
      transform: scale(1.08);
      animation: avatar-breathe 2s var(--ease-spring-gentle) infinite;
      box-shadow: var(--shadow-lg);
    }

    .agent-meta {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
    }

    .agent-name {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--color-text-primary);
      margin: 0 0 4px;
    }

    .agent-category {
      font-family: var(--font-body);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--category-text, var(--color-accent-text));
      background: var(--category-tint, var(--color-accent-subtle));
      padding: 3px 8px;
      border-radius: 4px;
      width: fit-content;
    }

    /* Category-specific colors via CSS variables */
    .agent-category[data-category="mentorship"] {
      color: var(--category-mentorship-text);
      background: var(--category-mentorship-tint);
    }
    .agent-category[data-category="finance"] {
      color: var(--category-finance-text);
      background: var(--category-finance-tint);
    }
    .agent-category[data-category="health"] {
      color: var(--category-health-text);
      background: var(--category-health-tint);
    }
    .agent-category[data-category="productivity"] {
      color: var(--category-productivity-text);
      background: var(--category-productivity-tint);
    }
    .agent-category[data-category="lifestyle"] {
      color: var(--category-lifestyle-text);
      background: var(--category-lifestyle-tint);
    }
    .agent-category[data-category="education"] {
      color: var(--category-education-text);
      background: var(--category-education-tint);
    }
    .agent-category[data-category="entertainment"] {
      color: var(--category-entertainment-text);
      background: var(--category-entertainment-tint);
    }
    .agent-category[data-category="custom"] {
      color: var(--category-custom-text);
      background: var(--category-custom-tint);
    }

    .agent-rating {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
    }

    .agent-rating .star-icon {
      color: var(--color-accent-text);
    }

    .rating-value {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .rating-count {
      font-family: var(--font-body);
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }

    .agent-badge {
      font-family: var(--font-body);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-left: auto;
    }

    .agent-badge.installed {
      background: var(--color-semantic-success-glow);
      color: var(--color-semantic-success);
    }

    .agent-badge.coming-soon-badge {
      background: var(--color-semantic-warning-glow);
      color: var(--color-semantic-warning);
      border: 1px solid var(--color-semantic-warning-glow);
    }

    .agent-description {
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

    .agent-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-md);
    }

    .agent-tag {
      font-family: var(--font-body);
      font-size: 0.7rem;
      color: var(--color-text-muted);
      background: var(--color-bg-secondary);
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid var(--color-border-subtle);
    }

    .agent-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .agent-author {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }

    /* ========================================
       ACTION BUTTONS
       ======================================== */

    .agent-action {
      font-family: var(--font-body);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 9999px;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
      border: 1.5px solid var(--color-border-medium);
      background: transparent;
      color: var(--color-text-secondary);
    }

    .agent-action:hover,
    .agent-action:focus-visible {
      transform: scale(1.02);
    }

    .agent-action.install {
      background: var(--persona-primary, var(--color-accent-primary));
      border-color: var(--persona-primary, var(--color-accent-primary));
      color: white;
    }

    .agent-action.install:hover {
      background: var(--persona-secondary, var(--color-accent-hover));
      border-color: var(--persona-secondary, var(--color-accent-hover));
    }

    .agent-action.uninstall {
      border-color: var(--color-border-medium);
      color: var(--color-text-muted);
    }

    .agent-action.uninstall:hover {
      border-color: var(--color-semantic-error-glow);
      color: var(--color-semantic-error);
      background: var(--color-semantic-error-glow);
    }

    /* ========================================
       LOCKED STATE
       ======================================== */

    .marketplace-agent--locked {
      opacity: 0.7;
      pointer-events: none;
    }

    .agent-locked-overlay {
      position: absolute;
      inset: 0;
      background: var(--backdrop-light);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: inherit;
      color: var(--color-text-muted);
    }

    .marketplace-agent--locked .agent-locked-overlay {
      z-index: 1;
    }
  `;
}

