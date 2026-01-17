/**
 * Marketplace Team Styles
 *
 * Styles for the "Meet the Team" narrative section.
 * Uses CSS variables from design system - no hardcoded colors.
 *
 * @module marketplace/styles/team
 */

import { DURATION } from '../../../config/animation-constants.js';

/**
 * Get team narrative styles
 */
export function getTeamStyles(): string {
  return `
    /* ========================================
       TEAM NARRATIVE SECTION
       ======================================== */

    .team-narrative {
      margin-bottom: var(--space-xl);
    }

    .team-narrative-header {
      text-align: center;
      margin-bottom: var(--space-xl);
    }

    .team-narrative-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .team-narrative-subtitle {
      font-family: var(--font-body);
      font-size: 1rem;
      color: var(--color-accent-text);
      margin: 0;
    }

    .team-narrative-footer {
      text-align: center;
      font-family: var(--font-body);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin-top: var(--space-xl);
      font-style: italic;
    }

    /* ========================================
       LEADERSHIP SECTIONS
       ======================================== */

    .team-leadership {
      display: flex;
      flex-direction: column;
      gap: var(--space-xl);
    }

    .leadership-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .leadership-label {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      text-align: center;
    }

    .leadership-grid {
      display: grid;
      gap: var(--space-md);
    }

    .leadership-grid.ceo {
      grid-template-columns: 1fr;
      max-width: 400px;
      margin: 0 auto;
    }

    .leadership-grid.cofounders {
      grid-template-columns: repeat(3, 1fr);
      max-width: 320px;
      margin: 0 auto;
    }

    .leadership-grid.employees {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      max-width: 600px;
      margin: 0 auto;
    }

    /* ========================================
       LEADER CARDS
       ======================================== */

    .leader-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms ease;
    }

    .leader-card:hover {
      transform: translateY(-2px);
    }

    .leader-card.ceo-card {
      flex-direction: row;
      text-align: left;
      gap: var(--space-md);
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-lg);
    }

    .leader-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      box-shadow: var(--shadow-md),
                  0 0 20px var(--avatar-glow, var(--persona-glow));
      animation: avatar-breathe 5s var(--ease-smooth) infinite;
    }

    .ceo-card .leader-avatar {
      width: 80px;
      height: 80px;
      font-size: 1.4rem;
    }

    .leader-card:hover .leader-avatar {
      transform: scale(1.06);
      animation: avatar-breathe 2s var(--ease-spring-gentle) infinite;
      box-shadow: var(--shadow-lg),
                  0 0 30px var(--avatar-glow, var(--persona-glow));
    }

    .leader-info {
      flex: 1;
    }

    .leader-name {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 2px;
    }

    .leader-title {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-accent-text);
      display: block;
      margin-bottom: var(--space-xs);
    }

    .leader-bio {
      font-family: var(--font-body);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0;
    }

    /* ========================================
       CO-FOUNDER CARDS
       ======================================== */

    .leader-card.cofounder {
      gap: var(--space-xs);
    }

    .cofounder-avatar {
      width: 48px;
      height: 48px;
      font-size: 0;
      animation: avatar-breathe 5s var(--ease-smooth) infinite;
    }

    .cofounder-avatar svg {
      width: 20px;
      height: 20px;
    }

    .leader-card.cofounder:nth-child(1) .cofounder-avatar { animation-delay: 0s; }
    .leader-card.cofounder:nth-child(2) .cofounder-avatar { animation-delay: 0.4s; }
    .leader-card.cofounder:nth-child(3) .cofounder-avatar { animation-delay: 0.8s; }

    .leader-card.cofounder:hover .cofounder-avatar {
      transform: scale(1.1);
      animation: avatar-breathe 2s var(--ease-spring-gentle) infinite;
    }

    .cofounder-name {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary);
    }

    /* ========================================
       EMPLOYEE CARDS
       ======================================== */

    .employee-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-sm);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .employee-card:hover {
      background: var(--color-bg-subtle);
      transform: translateY(-2px);
    }

    .employee-avatar-container {
      position: relative;
      width: 48px;
      height: 48px;
    }

    .employee-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 700;
      color: white;
      box-shadow: var(--shadow-sm),
                  0 0 15px var(--avatar-glow, var(--persona-glow));
      animation: avatar-breathe 5s var(--ease-smooth) infinite;
      animation-delay: calc(var(--employee-index, 0) * 0.3s);
    }

    .employee-card:hover .employee-avatar {
      transform: scale(1.12);
      animation: avatar-breathe 2s var(--ease-spring-gentle) infinite;
    }

    .employee-name {
      font-family: var(--font-body);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--color-text-primary);
    }

    .employee-role {
      font-family: var(--font-body);
      font-size: 0.65rem;
      color: var(--color-text-muted);
    }

    /* ========================================
       LOCKED EMPLOYEE STATE
       ======================================== */

    .employee-card--locked {
      opacity: 0.6;
    }

    .employee-card--locked .employee-avatar {
      filter: grayscale(0.4);
    }

    .employee-card--locked:hover {
      opacity: 0.8;
    }

    .employee-lock-indicator {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      background: var(--color-bg-elevated);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--color-border-subtle);
      color: var(--color-text-muted);
    }

    .employee-progress-ring {
      position: absolute;
      inset: -4px;
      width: calc(100% + 8px);
      height: calc(100% + 8px);
      transform: rotate(-90deg);
    }

    /* ========================================
       ROSTER ACTION BUTTONS
       ======================================== */

    .employee-roster-action {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin-top: var(--space-xs);
      padding: 4px 10px;
      border-radius: 9999px;
      font-family: var(--font-body);
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .employee-roster-action--remove {
      background: var(--persona-primary);
      border: none;
      color: white;
    }

    .employee-roster-action--remove:hover {
      background: var(--color-semantic-error);
    }

    .employee-roster-action--remove .roster-icon--minus {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-icon--check {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-icon--minus {
      display: block;
    }

    .employee-roster-action--remove:hover .roster-label {
      display: none;
    }

    .employee-roster-action--remove:hover .roster-label--hover {
      display: inline;
    }

    .roster-label--hover {
      display: none;
    }

    .employee-roster-action--add {
      background: transparent;
      border: 1.5px dashed var(--color-border-medium);
      color: var(--color-text-muted);
    }

    .employee-roster-action--add:hover {
      background: var(--persona-primary);
      color: white;
      border-style: solid;
      border-color: var(--persona-text);
      transform: scale(1.05);
    }

    /* ========================================
       SECTION DIVIDER
       ======================================== */

    .team-section-divider {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin: var(--space-xl) 0;
    }

    .team-section-divider::before,
    .team-section-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border-subtle);
    }

    .team-section-divider span {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
    }

    /* ========================================
       LOCKED MARKETPLACE MESSAGE
       ======================================== */

    .marketplace-locked-section {
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-xl);
      text-align: center;
      margin-bottom: var(--space-xl);
    }

    .marketplace-locked-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .marketplace-locked-icon {
      width: 56px;
      height: 56px;
      background: var(--color-bg-secondary);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }

    .marketplace-locked-title {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .marketplace-locked-subtitle {
      font-family: var(--font-body);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    .marketplace-locked-categories {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-xs);
      margin-bottom: var(--space-lg);
    }

    .locked-category-pill {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 500;
      padding: 4px 12px;
      border-radius: 9999px;
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border-subtle);
    }

    .locked-category-more {
      color: var(--color-text-muted);
    }

    .marketplace-locked-progress {
      text-align: left;
    }

    .progress-label {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-sm);
    }

    .team-progress-grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      justify-content: center;
    }

    .team-progress-member {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-sm);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
    }

    .team-progress-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 0.55rem;
      font-weight: 700;
      color: white;
    }

    .team-progress-name {
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-primary);
    }

    .team-progress-check {
      color: var(--color-semantic-success);
    }

    .team-progress-percent {
      font-family: var(--font-body);
      font-size: 0.65rem;
      color: var(--color-text-muted);
    }

    .team-progress-member.locked .team-progress-avatar {
      filter: grayscale(0.5);
      opacity: 0.7;
    }

    /* ========================================
       PREVIEW SECTION
       ======================================== */

    .marketplace-preview-section {
      margin-top: var(--space-lg);
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-md);
    }

    .preview-label {
      font-family: var(--font-body);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
    }

    .preview-hint {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }

    .marketplace-preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--space-md);
    }

    .preview-more-hint {
      text-align: center;
      margin-top: var(--space-lg);
      font-family: var(--font-body);
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
  `;
}

