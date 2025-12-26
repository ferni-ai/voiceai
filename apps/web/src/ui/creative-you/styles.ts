/**
 * Creative You - Styles
 *
 * Shared CSS styles for Creative You components.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

/**
 * Inject Creative You dashboard styles
 */
export function injectCreativeYouStyles(): void {
  if (document.getElementById('creative-you-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'creative-you-styles';
  styles.textContent = getCreativeYouStyles();
  document.head.appendChild(styles);
}

/**
 * Get the CSS styles string
 */
export function getCreativeYouStyles(): string {
  return `
    /* ================================================
       Creative You Dashboard - Core Styles
       ================================================ */

    .creative-dashboard-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: none;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .creative-dashboard-overlay.open {
      display: flex;
    }

    .creative-dashboard-backdrop {
      position: absolute;
      inset: 0;
      background: var(--color-background-overlay);
      backdrop-filter: blur(var(--glass-blur-medium));
      -webkit-backdrop-filter: blur(var(--glass-blur-medium));
    }

    .creative-dashboard-content {
      position: relative;
      width: 100%;
      max-width: clamp(420px, 90vw, 600px);
      max-height: 85vh;
      background: var(--color-background-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      opacity: 0;
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING},
                  opacity ${DURATION.NORMAL}ms ease-out;
    }

    /* ================================================
       Header
       ================================================ */

    .creative-dashboard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6);
      border-bottom: var(--glass-border-subtle);
    }

    .creative-dashboard-header .eyebrow {
      font-size: var(--text-2xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: var(--tracking-widest);
      text-transform: uppercase;
      color: var(--persona-text);
      margin-bottom: var(--space-1);
      display: block;
    }

    .creative-dashboard-header .welcome-message {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: var(--space-2) 0 0;
      font-weight: var(--font-weight-regular);
    }

    .creative-dashboard-header h2 {
      font-family: var(--font-display);
      font-size: var(--text-3xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .creative-dashboard-header .close-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: var(--radius-full);
      transition: background ${DURATION.FAST}ms ease;
    }

    .creative-dashboard-header .close-btn:hover,
    .creative-dashboard-header .close-btn:focus-visible {
      background: var(--color-background-glass);
    }

    /* ================================================
       Body
       ================================================ */

    .creative-dashboard-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4) var(--space-6) var(--space-6);
    }

    .dashboard-section {
      margin-bottom: var(--space-6);
    }

    .dashboard-section h3 {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3) 0;
    }

    .dashboard-section h3 svg {
      opacity: 0.7;
    }

    /* ================================================
       Daily Picks Grid
       ================================================ */

    .picks-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }

    @media (max-width: 500px) {
      .picks-grid {
        grid-template-columns: 1fr;
      }
    }

    .pick-card {
      background: var(--color-background-elevated);
      border-radius: var(--radius-lg);
      overflow: hidden;
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms ease,
                  box-shadow ${DURATION.FAST}ms ease;
      border: var(--glass-border-subtle);
    }

    .pick-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .pick-card[data-loading="true"] {
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pick-loading {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .pick-type {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1-5);
      padding: var(--space-1-5) var(--space-3);
      font-size: var(--text-2xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-inverse);
      border-radius: 0 0 var(--radius-md) 0;
    }

    .pick-type svg {
      width: 14px;
      height: 14px;
    }

    .pick-thumbnail {
      position: relative;
      height: 100px;
      background-size: cover;
      background-position: center;
      margin: -28px var(--space-3) var(--space-3) var(--space-3);
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-overlay);
      opacity: 0;
      transition: opacity ${DURATION.FAST}ms ease;
    }

    .pick-thumbnail:hover .play-overlay {
      opacity: 1;
    }

    .play-overlay svg {
      width: 40px;
      height: 40px;
      color: var(--color-text-inverse);
    }

    .pick-thumbnail .duration {
      position: absolute;
      bottom: var(--space-2);
      right: var(--space-2);
      background: var(--color-background-overlay);
      color: var(--color-text-inverse);
      font-size: var(--text-2xs);
      padding: var(--space-0_5) var(--space-1-5);
      border-radius: var(--radius-xs);
    }

    .pick-icon-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80px;
      margin: var(--space-3);
      border-radius: var(--radius-md);
    }

    .pick-icon-container svg {
      width: 32px;
      height: 32px;
      color: var(--persona-text);
    }

    .pick-info {
      padding: 0 var(--space-3) var(--space-3);
    }

    .pick-info h4 {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1) 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .pick-info .channel {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      margin: 0 0 var(--space-2) 0;
    }

    .pick-info .reason {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-2) 0;
      font-style: italic;
    }

    /* Ferni Remembers - Better Than Human memory display */
    .ferni-remembers {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      font-size: var(--text-2xs);
      color: var(--persona-text);
      margin: 0 0 var(--space-2) 0;
      padding: var(--space-1-5) var(--space-2);
      background: var(--persona-primary-subtle, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-sm);
      font-weight: var(--font-weight-medium);
    }

    .ferni-remembers .memory-icon {
      display: flex;
      opacity: 0.8;
    }

    .ferni-remembers .memory-icon svg {
      width: 12px;
      height: 12px;
    }

    .pick-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .pick-meta .duration {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }

    .mood-badge {
      display: inline-block;
      font-size: var(--text-2xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-inverse);
      padding: var(--space-0_5) var(--space-2);
      border-radius: var(--radius-full);
    }

    /* ================================================
       Creative DNA Card
       ================================================ */

    .dna-card {
      background: var(--color-background-elevated);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      border: var(--glass-border-subtle);
    }

    .dna-card[data-loading="true"] {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dna-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-4);
    }

    .dna-personality .personality-label {
      font-size: var(--text-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      display: block;
      margin-bottom: var(--space-1);
    }

    .dna-personality .personality-desc {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .share-dna-btn {
      background: var(--color-background-glass);
      border: none;
      padding: var(--space-2-5);
      border-radius: var(--radius-full);
      cursor: pointer;
      color: var(--color-text-muted);
      transition: background ${DURATION.FAST}ms ease;
    }

    .share-dna-btn:hover,
    .share-dna-btn:focus-visible {
      background: var(--persona-primary);
      color: var(--color-text-inverse);
    }

    .dna-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2);
      margin-bottom: var(--space-4);
      padding: var(--space-3);
      background: var(--color-background-secondary);
      border-radius: var(--radius-md);
    }

    .dna-stats .stat {
      text-align: center;
    }

    .dna-stats .stat-value {
      display: block;
      font-size: var(--text-xl);
      font-weight: var(--font-weight-bold);
      color: var(--persona-text);
    }

    .dna-stats .stat-label {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }

    .dna-interests h5 {
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-2) 0;
    }

    .interest-bars {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .interest-bar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .interest-bar .interest-name {
      width: 100px;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      text-transform: capitalize;
    }

    .interest-bar .bar-container {
      flex: 1;
      height: 8px;
      background: var(--color-background-secondary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .interest-bar .bar-fill {
      height: 100%;
      background: var(--persona-primary);
      border-radius: var(--radius-full);
      transition: width ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    /* ================================================
       Learning Tracks
       ================================================ */

    .tracks-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .tracks-list[data-loading="true"] {
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .track-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background: var(--color-background-elevated);
      border: var(--glass-border-subtle);
      border-radius: var(--radius-lg);
      transition: border-color ${DURATION.FAST}ms ease;
    }

    .track-card:hover {
      border-color: var(--persona-text);
    }

    .track-info h4 {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1) 0;
    }

    .track-info p {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-1) 0;
    }

    .track-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }

    .start-track-btn {
      background: var(--persona-primary);
      color: var(--color-text-inverse);
      border: none;
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms ease,
                  box-shadow ${DURATION.FAST}ms ease;
    }

    .start-track-btn:hover,
    .start-track-btn:focus-visible {
      transform: scale(1.05);
      box-shadow: var(--shadow-glow);
    }

    /* ================================================
       Empty States
       ================================================ */

    .empty-state {
      text-align: center;
      color: var(--color-text-muted);
      padding: var(--space-4);
    }

    .empty-pick,
    .empty-dna {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-6);
      text-align: center;
      min-height: 120px;
    }

    .empty-pick .empty-icon,
    .empty-dna .empty-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-glass);
      border-radius: var(--radius-full);
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }

    .empty-pick .empty-icon svg,
    .empty-dna .empty-icon svg {
      width: 24px;
      height: 24px;
    }

    .empty-pick p,
    .empty-dna p {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      margin: 0;
      line-height: var(--leading-normal);
      max-width: 200px;
    }

    /* ================================================
       Reduced Motion
       ================================================ */

    @media (prefers-reduced-motion: reduce) {
      .creative-dashboard-content,
      .pick-card,
      .start-track-btn,
      .share-dna-btn,
      .interest-bar .bar-fill {
        transition: none;
      }
    }
  `;
}

