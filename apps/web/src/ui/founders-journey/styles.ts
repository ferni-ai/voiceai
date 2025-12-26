/**
 * Founders Journey - Styles
 *
 * CSS styles for the founders journey modal.
 * Extracted to keep file sizes under 500 lines.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

/**
 * Get the complete CSS styles for the founders journey modal.
 * Uses design system tokens with fallbacks for robustness.
 */
export function getFoundersJourneyStyles(): string {
  return `
    /* =========================================================================
       FOUNDERS JOURNEY - A Story-Driven Vision Experience
       ========================================================================= */

    .founders-journey {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .founders-journey--open {
      opacity: 1;
      pointer-events: auto;
    }

    .founders-journey-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    /* Card Container */
    .founders-journey-card {
      position: relative;
      /* Glass modal styling */
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      overflow-x: hidden;
    }

    @supports not (backdrop-filter: blur(1px)) {
      .founders-journey-card {
        background: var(--color-background-elevated, #FFFDFB);
      }
    }

    .founders-journey-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 44px;
      height: 44px;
      border: none;
      background: var(--color-background-secondary, #f5f3f0);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5a5048);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      z-index: var(--z-content, 10);
    }

    .founders-journey-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .founders-journey-close:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-journey-close svg {
      width: 20px;
      height: 20px;
    }

    /* Hero Section */
    .founders-journey-hero {
      text-align: center;
      padding: var(--space-10, 40px) var(--space-6, 24px) var(--space-6, 24px);
      background: linear-gradient(180deg, var(--persona-tint) 0%, transparent 100%);
    }

    .founders-journey-hero-icon {
      width: 72px;
      height: 72px;
      margin: 0 auto var(--space-4, 16px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: var(--radius-full);
      color: white;
    }

    .founders-journey-hero-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-journey-eyebrow {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-2, 8px);
    }

    .founders-journey-title {
      font-family: var(--font-display);
      font-size: clamp(1.75rem, 5vw, 2.25rem);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
      line-height: 1.1;
    }

    .founders-journey-subtitle {
      font-size: 1.0625rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    /* Navigation Tabs */
    .founders-journey-nav {
      display: flex;
      gap: var(--space-1, 4px);
      padding: 0 var(--space-4, 16px);
      margin-bottom: var(--space-4, 16px);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .founders-journey-nav::-webkit-scrollbar {
      display: none;
    }

    .founders-journey-tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-3, 12px) var(--space-2, 8px);
      background: var(--color-background-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      min-width: 80px;
    }

    .founders-journey-tab svg {
      width: 20px;
      height: 20px;
      color: var(--color-text-muted);
      transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-journey-tab span {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-muted);
      transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-journey-tab:hover {
      background: var(--color-background-elevated);
      border-color: var(--color-border-subtle);
    }

    .founders-journey-tab--active {
      background: var(--persona-tint);
      border-color: var(--persona-text);
    }

    .founders-journey-tab--active svg,
    .founders-journey-tab--active span {
      color: var(--persona-text);
    }

    .founders-journey-tab:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    /* Content Area */
    .founders-journey-content {
      padding: 0 var(--space-6, 24px);
      min-height: 300px;
    }

    /* Section Base Styles */
    .founders-section {
      animation: foundersSlideIn ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    @keyframes foundersSlideIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .founders-section-subtitle {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    /* Vision Section */
    .founders-vision-quote {
      text-align: center;
      padding: var(--space-6, 24px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-xl, 16px);
      margin-bottom: var(--space-6, 24px);
    }

    .founders-vision-quote blockquote {
      font-family: var(--font-display);
      font-size: 1.375rem;
      font-style: italic;
      font-weight: 500;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.4;
    }

    .founders-vision-principles {
      margin-bottom: var(--space-6, 24px);
    }

    .founders-principle {
      display: flex;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px) 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .founders-principle:last-child {
      border-bottom: none;
    }

    .founders-principle-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      padding: var(--space-3, 12px);
      background: var(--persona-tint);
      border-radius: var(--radius-lg, 12px);
      color: var(--persona-text);
    }

    .founders-principle-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-principle-content h4 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .founders-principle-content p {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    .founders-vision-promise {
      text-align: center;
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint) 0%, transparent 100%);
      border-radius: var(--radius-lg, 12px);
    }

    .founders-vision-promise-text {
      font-size: 1rem;
      font-weight: 500;
      color: var(--persona-text);
      margin: 0;
    }

    /* Timeline */
    .founders-timeline {
      position: relative;
      padding-left: var(--space-8, 32px);
      margin: var(--space-6, 24px) 0;
    }

    .founders-timeline::before {
      content: '';
      position: absolute;
      left: 11px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(
        180deg,
        var(--color-border-subtle) 0%,
        var(--persona-primary) 50%,
        var(--color-border-subtle) 100%
      );
    }

    .founders-timeline-item {
      position: relative;
      padding-bottom: var(--space-5, 20px);
    }

    .founders-timeline-item:last-child {
      padding-bottom: 0;
    }

    .founders-timeline-marker {
      position: absolute;
      left: -32px;
      top: 0;
      width: 24px;
      height: 24px;
      background: var(--color-background-elevated);
      border: 2px solid var(--color-border-subtle);
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .founders-timeline-item--present .founders-timeline-marker {
      background: var(--persona-primary);
      border-color: var(--persona-text);
    }

    .founders-timeline-item--future .founders-timeline-marker {
      border-style: dashed;
    }

    .founders-timeline-icon {
      width: 14px;
      height: 14px;
      color: var(--color-text-muted);
    }

    .founders-timeline-item--present .founders-timeline-icon {
      color: white;
    }

    .founders-timeline-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-timeline-content {
      padding-left: var(--space-2, 8px);
    }

    .founders-timeline-date {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--persona-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .founders-timeline-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: var(--space-1, 4px) 0;
    }

    .founders-timeline-desc {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.4;
    }

    /* Now Section Wins */
    .founders-now-wins {
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
    }

    .founders-wins-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    .founders-wins-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .founders-win-item {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .founders-win-icon {
      width: 18px;
      height: 18px;
      color: var(--persona-text);
    }

    .founders-win-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Future Section Features */
    .founders-future-features {
      margin-top: var(--space-6, 24px);
    }

    .founders-features-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    .founders-feature-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
    }

    .founders-feature-card {
      background: var(--color-background-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      cursor: pointer;
      text-align: left;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-feature-card:hover {
      border-color: var(--persona-text);
      background: var(--color-background-elevated);
    }

    .founders-feature-card:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-feature-stage {
      display: inline-block;
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-sm, 4px);
      margin-bottom: var(--space-2, 8px);
    }

    .founders-feature-stage--seed { background: var(--color-semantic-info-bg, #e8f4fd); color: var(--color-semantic-info, #2563eb); }
    .founders-feature-stage--sprout { background: var(--persona-tint); color: var(--persona-text); }
    .founders-feature-stage--bud { background: var(--color-semantic-warning-bg, #fff8e6); color: var(--color-semantic-warning, #d97706); }
    .founders-feature-stage--bloom { background: var(--color-semantic-success-bg, #ecfdf5); color: var(--color-semantic-success, #10b981); }

    .founders-feature-headline {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .founders-feature-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-2, 8px);
      line-height: 1.4;
    }

    .founders-feature-arrival {
      font-size: 0.6875rem;
      font-weight: 500;
      color: var(--color-text-dimmed);
    }

    .founders-see-all {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      margin-top: var(--space-4, 16px);
      padding: var(--space-3, 12px);
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-see-all:hover,
    .founders-see-all:focus-visible {
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
    }

    .founders-see-all:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-see-all svg {
      width: 16px;
      height: 16px;
    }
  `;
}

/**
 * Get additional styles for Impact section (Part 2)
 */
export function getImpactStyles(): string {
  return `
    /* Impact Section Stats */
    .founders-impact-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin: var(--space-6, 24px) 0;
    }

    .founders-impact-stat {
      text-align: center;
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg, 12px);
    }

    .founders-impact-stat-value {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--persona-text);
      line-height: 1;
    }

    .founders-impact-stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-1, 4px);
    }

    /* Seasonal Badge */
    .founders-season-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-full, 9999px);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-4, 16px);
    }

    .founders-season-icon {
      width: 16px;
      height: 16px;
    }

    .founders-season-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Live Counter Pulse */
    .founders-impact-stats--live .founders-impact-stat-value {
      font-variant-numeric: tabular-nums;
    }

    .founders-impact-stats--empty {
      opacity: 0.7;
    }

    .founders-impact-stats--empty .founders-impact-stat-value {
      color: var(--color-text-muted, #8a7f78);
    }

    .founders-impact-stat-live {
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      margin-top: var(--space-1, 4px);
    }

    .founders-impact-stat-live--pulse {
      color: var(--color-semantic-success);
      animation: livePulse 2s infinite;
    }

    @keyframes livePulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Personal Impact Card */
    .founders-personal-impact {
      background: linear-gradient(135deg, var(--persona-tint) 0%, var(--color-background-secondary) 100%);
      border: 2px solid var(--persona-primary);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-5, 20px);
      margin: var(--space-6, 24px) 0;
    }

    .founders-personal-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }

    .founders-personal-icon {
      width: 24px;
      height: 24px;
      color: var(--persona-text);
    }

    .founders-personal-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-personal-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--persona-text);
    }

    .founders-personal-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-4, 16px);
    }

    .founders-personal-stat {
      text-align: center;
    }

    .founders-personal-value {
      display: block;
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .founders-personal-label {
      font-size: 0.6875rem;
      color: var(--color-text-muted);
    }

    .founders-personal-badges {
      display: flex;
      gap: var(--space-2, 8px);
      flex-wrap: wrap;
      margin-bottom: var(--space-3, 12px);
    }

    .founders-personal-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--color-background-elevated);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
    }

    .founders-personal-thanks {
      font-size: 0.875rem;
      font-style: italic;
      color: var(--persona-text);
      text-align: center;
      margin: 0;
    }

    /* Milestone Progress */
    .founders-milestone-progress {
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      margin: var(--space-6, 24px) 0;
    }

    .founders-milestone-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-2, 8px);
    }

    .founders-milestone-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-text);
    }

    .founders-milestone-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-milestone-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .founders-milestone-target {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: var(--space-3, 12px);
    }

    .founders-milestone-bar {
      height: 8px;
      background: var(--color-border-subtle);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--space-2, 8px);
    }

    .founders-milestone-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--persona-primary), var(--persona-secondary));
      border-radius: var(--radius-full);
      transition: width ${DURATION.SLOW}ms ${EASING.GENTLE};
    }

    .founders-milestone-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .founders-milestone-reward {
      color: var(--persona-text);
      font-weight: 500;
    }
  `;
}

/**
 * Get styles for Stories Carousel (Part 3)
 */
export function getStoriesStyles(): string {
  return `
    /* Stories Carousel */
    .founders-stories-carousel {
      margin: var(--space-6, 24px) 0;
    }

    .founders-stories-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-4, 16px);
    }

    .founders-stories-title svg {
      width: 20px;
      height: 20px;
      color: var(--persona-text);
    }

    .founders-stories-slider {
      position: relative;
      min-height: 120px;
      margin-bottom: var(--space-4, 16px);
    }

    .founders-story-slide {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: var(--space-5, 20px);
      background: var(--persona-tint);
      border-radius: var(--radius-lg, 12px);
      opacity: 0;
      transform: translateX(20px);
      transition: all ${DURATION.SLOW}ms ${EASING.STANDARD};
      pointer-events: none;
    }

    .founders-story-slide--active {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    .founders-story-quote {
      font-size: 1rem;
      font-style: italic;
      color: var(--color-text-primary);
      line-height: 1.6;
      margin: 0 0 var(--space-3, 12px);
    }

    .founders-story-cite {
      font-size: 0.875rem;
      font-style: normal;
      color: var(--persona-text);
      font-weight: 500;
    }

    .founders-stories-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3, 12px);
    }

    .founders-stories-nav {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-stories-nav:hover,
    .founders-stories-nav:focus-visible {
      background: var(--color-background-elevated);
      border-color: var(--persona-text);
    }

    .founders-stories-nav:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-stories-nav svg {
      width: 18px;
      height: 18px;
      color: var(--color-text-secondary);
    }

    .founders-stories-dots {
      display: flex;
      gap: var(--space-2, 8px);
    }

    .founders-stories-dot {
      width: 8px;
      height: 8px;
      background: var(--color-border);
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-stories-dot:hover,
    .founders-stories-dot:focus-visible {
      background: var(--color-text-muted);
    }

    .founders-stories-dot:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-stories-dot--active {
      background: var(--persona-primary);
      width: 24px;
    }

    .founders-impact-cta {
      text-align: center;
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint) 0%, transparent 100%);
      border-radius: var(--radius-lg, 12px);
    }

    .founders-impact-cta-text {
      font-size: 1rem;
      font-weight: 500;
      color: var(--persona-text);
      margin: 0;
    }

    /* Empty States - Honest design for when we're just starting */
    .founders-stories-empty {
      padding: var(--space-8, 32px) var(--space-4, 16px);
      text-align: center;
      background: var(--color-background-secondary, #f9f7f5);
      border-radius: var(--radius-lg, 12px);
      margin: var(--space-6, 24px) 0;
    }

    .founders-stories-empty-text {
      font-size: 0.9375rem;
      color: var(--color-text-muted, #8a7f78);
      font-style: italic;
      margin: 0;
    }
  `;
}

/**
 * Get styles for Founders Wall section (Part 4)
 */
export function getFoundersWallStyles(): string {
  return `
    /* =========================================================================
       FOUNDERS WALL SECTION
       ========================================================================= */

    .founders-wall-intro {
      margin-bottom: var(--space-5, 20px);
    }

    .founders-achieved-milestones {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-6, 24px);
    }

    .founders-achieved-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-1, 4px) var(--space-3, 12px);
      background: var(--color-semantic-success-bg);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-semantic-success);
    }

    .founders-achieved-icon {
      width: 14px;
      height: 14px;
    }

    .founders-achieved-icon svg {
      width: 100%;
      height: 100%;
    }

    /* The Wall */
    .founders-wall {
      display: flex;
      flex-direction: column;
      gap: var(--space-6, 24px);
    }

    .founders-wall-tier {
      border-left: 3px solid var(--color-border);
      padding-left: var(--space-4, 16px);
    }

    .founders-wall-tier-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    .founders-wall-tier-title svg {
      width: 18px;
      height: 18px;
      color: var(--persona-text);
    }

    .founders-wall-tier-count {
      font-size: 0.75rem;
      font-weight: 500;
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-full);
      color: var(--color-text-muted);
    }

    .founders-wall-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: var(--space-3, 12px);
    }

    .founders-wall-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px);
      background: var(--tile-bg);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-wall-tile:hover,
    .founders-wall-tile:focus-visible {
      border-color: var(--tile-border);
      transform: translateY(-2px);
    }

    .founders-wall-tile:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint);
    }

    .founders-tile--highlighted {
      border-color: var(--tile-border);
      box-shadow: 0 0 0 4px var(--tile-bg);
    }

    .founders-tile-avatar {
      position: relative;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full);
      overflow: hidden;
      background: var(--tile-border);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .founders-tile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .founders-tile-initials {
      font-size: 1rem;
      font-weight: 600;
      color: white;
    }

    .founders-tile-early {
      position: absolute;
      top: -4px;
      right: -4px;
      font-size: 0.75rem;
    }

    .founders-tile-info {
      text-align: center;
    }

    .founders-tile-name {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 80px;
    }

    .founders-tile-badge {
      display: block;
      font-size: 0.625rem;
      color: var(--tile-text);
      margin-top: var(--space-1, 4px);
    }

    /* Empty Wall State */
    .founders-wall-empty {
      padding: var(--space-12, 48px) var(--space-6, 24px);
      text-align: center;
      background: var(--color-background-secondary, #f9f7f5);
      border-radius: var(--radius-xl, 16px);
      border: 2px dashed var(--color-border-subtle, #e8e4df);
    }

    .founders-wall-empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-4, 16px);
      color: var(--color-text-muted, #8a7f78);
      opacity: 0.5;
    }

    .founders-wall-empty-icon svg {
      width: 100%;
      height: 100%;
    }

    .founders-wall-empty-text {
      font-size: 1.125rem;
      font-weight: 500;
      color: var(--color-text-muted, #8a7f78);
      margin: 0;
    }

    /* Join the Wall CTA */
    .founders-wall-join {
      margin-top: var(--space-6, 24px);
      padding: var(--space-5, 20px);
      background: linear-gradient(135deg, var(--persona-tint) 0%, var(--color-background-secondary) 100%);
      border-radius: var(--radius-xl, 16px);
      text-align: center;
    }

    .founders-wall-join-text {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3, 12px);
    }

    .founders-wall-stats {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: var(--space-2, 8px);
    }

    .founders-wall-count {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 700;
      color: var(--persona-text);
    }

    .founders-wall-label {
      font-size: 1rem;
      color: var(--color-text-muted);
    }
  `;
}

/**
 * Get footer and responsive styles (Part 5)
 */
export function getFooterAndResponsiveStyles(): string {
  return `
    /* Footer */
    .founders-journey-footer {
      padding: var(--space-6, 24px);
      text-align: center;
      border-top: 1px solid var(--color-border-subtle);
      margin-top: var(--space-6, 24px);
    }

    .founders-journey-cta {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px) var(--space-8, 32px);
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      color: white;
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .founders-journey-cta:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg-persona);
    }

    .founders-journey-cta:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--persona-tint), var(--shadow-lg-persona);
    }

    .founders-journey-cta svg {
      width: 18px;
      height: 18px;
    }

    .founders-journey-footer-note {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin: var(--space-3, 12px) 0 0;
    }

    /* Dark theme */
    [data-theme="midnight"] .founders-journey-card {
      background: var(--color-background-elevated);
    }

    [data-theme="midnight"] .founders-journey-backdrop {
      background: var(--backdrop-heavy-midnight, rgba(20, 18, 16, 0.85));
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .founders-journey,
      .founders-section {
        transition: none;
        animation: none;
      }
    }

    /* Responsive */
    @media (max-width: 480px) {
      .founders-journey-card {
        max-height: 95vh;
      }

      .founders-journey-hero {
        padding: var(--space-8, 32px) var(--space-4, 16px) var(--space-4, 16px);
      }

      .founders-journey-content {
        padding: 0 var(--space-4, 16px);
      }

      .founders-feature-cards {
        grid-template-columns: 1fr;
      }

      .founders-impact-stats {
        grid-template-columns: 1fr;
      }

      .founders-personal-stats {
        grid-template-columns: 1fr;
      }

      .founders-wall-grid {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      }
    }
  `;
}

/**
 * Inject all styles into the document
 */
export function injectFoundersJourneyStyles(): HTMLStyleElement | null {
  if (document.getElementById('founders-journey-styles')) return null;

  const styleElement = document.createElement('style');
  styleElement.id = 'founders-journey-styles';
  styleElement.textContent = [
    getFoundersJourneyStyles(),
    getImpactStyles(),
    getStoriesStyles(),
    getFoundersWallStyles(),
    getFooterAndResponsiveStyles(),
  ].join('\n');

  document.head.appendChild(styleElement);
  return styleElement;
}

export default injectFoundersJourneyStyles;

