/**
 * While You Were Away UI
 *
 * Displays a summary of background tasks that completed while the user
 * was disconnected. This is the visual representation of the "BETTER THAN HUMAN"
 * capability where Ferni and the team work for you even when you're not there.
 *
 * Features:
 * - Shows a brief card with pending updates
 * - Groups updates by type (calls, research, reservations, etc.)
 * - Prioritizes urgent items
 * - Dismissible with animation
 */

import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { getResultIcon, SECTION_ICONS } from './icons/hub-icons.js';

const log = createLogger('WhileYouWereAwayUI');

// ============================================================================
// TYPES
// ============================================================================

export interface BackgroundUpdate {
  id: string;
  type: 'call' | 'research' | 'reservation' | 'follow_up' | 'reminder' | 'other';
  title: string;
  summary: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  contactName?: string;
  timestamp: Date;
  requiresAction?: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isVisible = false;
const pendingUpdates: BackgroundUpdate[] = [];

// ============================================================================
// SETUP
// ============================================================================

/**
 * Initialize the While You Were Away UI
 */
export function init(): void {
  // Clean up any existing elements
  document.querySelectorAll('.while-you-were-away').forEach((el) => el.remove());

  log.debug('While You Were Away UI initialized');

  // Listen for background completion events
  window.addEventListener('ferni:background-complete', handleBackgroundComplete);
  window.addEventListener('ferni:call-complete', handleCallComplete);
}

/**
 * Show the While You Were Away card with pending updates
 */
export function show(updates: BackgroundUpdate[]): void {
  if (updates.length === 0) {
    log.debug('No updates to show');
    return;
  }

  // Sort by priority and recency
  const sorted = sortUpdates(updates);
  pendingUpdates.length = 0;
  pendingUpdates.push(...sorted);

  createContainer();
  renderUpdates();

  // Animate in
  requestAnimationFrame(() => {
    if (container) {
      container.classList.add('visible');
    }
  });

  isVisible = true;

  // Play a subtle notification sound
  soundUI.play('message');

  log.info('Showing While You Were Away card', { updateCount: updates.length });
}

/**
 * Hide the While You Were Away card
 */
export function hide(): void {
  if (!container) return;

  container.classList.remove('visible');

  // Remove after animation
  setTimeout(() => {
    container?.remove();
    container = null;
    isVisible = false;
    pendingUpdates.length = 0;
  }, 300);

  log.debug('Hiding While You Were Away card');
}

/**
 * Add a single update to the pending list
 */
export function addUpdate(update: BackgroundUpdate): void {
  pendingUpdates.push(update);

  if (isVisible) {
    renderUpdates();
  }
}

// ============================================================================
// INTERNAL
// ============================================================================

function createContainer(): void {
  if (container) return;

  container = document.createElement('div');
  container.className = 'while-you-were-away';
  container.innerHTML = `
    <div class="wywa-header">
      <span class="wywa-icon">${SECTION_ICONS.clipboardList}</span>
      <span class="wywa-title">While you were away...</span>
      <button class="wywa-close" aria-label="Dismiss">&times;</button>
    </div>
    <div class="wywa-content"></div>
    <div class="wywa-footer">
      <button class="wywa-dismiss">Got it</button>
    </div>
  `;

  // Add styles if not already present
  addStyles();

  // Event listeners
  const closeBtn = container.querySelector('.wywa-close');
  const dismissBtn = container.querySelector('.wywa-dismiss');

  closeBtn?.addEventListener('click', () => hide());
  dismissBtn?.addEventListener('click', () => hide());

  document.body.appendChild(container);
}

function renderUpdates(): void {
  if (!container) return;

  const content = container.querySelector('.wywa-content');
  if (!content) return;

  // Group by type
  const grouped = groupByType(pendingUpdates);

  let html = '';

  for (const [type, items] of Object.entries(grouped)) {
    const icon = getResultIcon(type); // Uses hub-icons.ts for brand-compliant SVG icons
    const label = getTypeLabel(type as BackgroundUpdate['type']);

    html += `<div class="wywa-group">`;
    html += `<div class="wywa-group-header"><span class="wywa-group-icon">${icon}</span> ${label}</div>`;

    for (const item of items) {
      const urgentClass = item.priority === 'urgent' ? 'urgent' : '';
      html += `
        <div class="wywa-item ${urgentClass}">
          <div class="wywa-item-title">${item.title}</div>
          <div class="wywa-item-summary">${item.summary}</div>
          ${item.requiresAction ? '<span class="wywa-action-needed">Action needed</span>' : ''}
        </div>
      `;
    }

    html += `</div>`;
  }

  content.innerHTML = html;
}

function sortUpdates(updates: BackgroundUpdate[]): BackgroundUpdate[] {
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

  return [...updates].sort((a, b) => {
    // First by priority
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;

    // Then by recency
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

function groupByType(updates: BackgroundUpdate[]): Record<string, BackgroundUpdate[]> {
  const groups: Record<string, BackgroundUpdate[]> = {};

  for (const update of updates) {
    if (!groups[update.type]) {
      groups[update.type] = [];
    }
    groups[update.type].push(update);
  }

  return groups;
}

// NOTE: getTypeIcon replaced by getResultIcon from hub-icons.ts (brand-compliant SVG icons)

function getTypeLabel(type: BackgroundUpdate['type']): string {
  const labels: Record<BackgroundUpdate['type'], string> = {
    call: 'Calls',
    research: 'Research',
    reservation: 'Reservations',
    follow_up: 'Follow-ups',
    reminder: 'Reminders',
    other: 'Tasks',
  };
  return labels[type] || 'Tasks';
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleBackgroundComplete(event: Event): void {
  const detail = (event as CustomEvent).detail;

  // Map result type to update type
  const typeMap: Record<string, BackgroundUpdate['type']> = {
    on_behalf_call: 'call',
    research_complete: 'research',
    reservation_made: 'reservation',
    follow_up_sent: 'follow_up',
    reminder_triggered: 'reminder',
    commitment_check: 'other',
    calendar_update: 'other',
    contact_updated: 'other',
    email_sent: 'follow_up',
    task_completed: 'other',
  };

  const update: BackgroundUpdate = {
    id: detail.resultId,
    type: typeMap[detail.resultType] || 'other',
    title: detail.contactName || 'Task complete',
    summary: detail.summary,
    priority: detail.priority,
    contactName: detail.contactName,
    timestamp: new Date(),
    requiresAction: detail.requiresCallback,
  };

  addUpdate(update);
}

function handleCallComplete(event: Event): void {
  const detail = (event as CustomEvent).detail;

  const update: BackgroundUpdate = {
    id: detail.callId,
    type: 'call',
    title: `Call to ${detail.contactName}`,
    summary: detail.outcome,
    priority: detail.callbackRequired ? 'high' : 'normal',
    contactName: detail.contactName,
    timestamp: new Date(),
    requiresAction: detail.callbackRequired,
  };

  addUpdate(update);
}

// ============================================================================
// STYLES
// ============================================================================

let stylesAdded = false;

function addStyles(): void {
  if (stylesAdded) return;
  stylesAdded = true;

  const style = document.createElement('style');
  style.textContent = `
    .while-you-were-away {
      position: fixed;
      bottom: var(--space-20, 80px);
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      opacity: 0;
      z-index: var(--z-modal, 1000);
      
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
      
      min-width: 320px;
      max-width: 400px;
      max-height: 60vh;
      overflow: hidden;
      
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    .while-you-were-away.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    
    .wywa-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
    }
    
    .wywa-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni, #4a6741);
    }

    .wywa-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .wywa-title {
      flex: 1;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
    }
    
    .wywa-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--color-text-muted, #999);
      cursor: pointer;
      line-height: 1;
      padding: var(--space-1, 4px);
    }
    
    .wywa-close:hover {
      color: var(--color-text-primary, #2c2520);
    }
    
    .wywa-content {
      padding: var(--space-4, 16px);
      max-height: 40vh;
      overflow-y: auto;
    }
    
    .wywa-group {
      margin-bottom: var(--space-4, 16px);
    }
    
    .wywa-group:last-child {
      margin-bottom: 0;
    }
    
    .wywa-group-header {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted, #999);
      margin-bottom: var(--space-2, 8px);
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
    }

    .wywa-group-icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .wywa-group-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .wywa-item {
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border-radius: var(--radius-md, 8px);
      padding: var(--space-3, 12px);
      margin-bottom: var(--space-2, 8px);
    }
    
    .wywa-item:last-child {
      margin-bottom: 0;
    }
    
    .wywa-item.urgent {
      background: var(--color-warning-subtle, rgba(255, 200, 0, 0.1));
      border-left: 3px solid var(--color-warning, #f59e0b);
    }
    
    .wywa-item-title {
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin-bottom: var(--space-1, 4px);
    }
    
    .wywa-item-summary {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #666);
      line-height: 1.4;
    }
    
    .wywa-action-needed {
      display: inline-block;
      margin-top: var(--space-2, 8px);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--color-accent, #3d5a45);
      color: white;
      border-radius: var(--radius-full, 999px);
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .wywa-footer {
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      display: flex;
      justify-content: center;
    }
    
    .wywa-dismiss {
      background: var(--color-accent, #3d5a45);
      color: white;
      border: none;
      border-radius: var(--radius-full, 999px);
      padding: var(--space-2, 8px) var(--space-6, 24px);
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    
    .wywa-dismiss:hover {
      background: var(--color-accent-hover, #4a6741);
    }
    
    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .while-you-were-away {
        transition: opacity 0.1s ease;
        transform: translateX(-50%);
      }
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .while-you-were-away {
        background: var(--color-background-elevated-dark, #2a2420);
      }
      
      .wywa-item {
        background: var(--color-background-subtle-dark, rgba(255, 255, 255, 0.05));
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const whileYouWereAwayUI = {
  init,
  show,
  hide,
  addUpdate,
};

export default whileYouWereAwayUI;
