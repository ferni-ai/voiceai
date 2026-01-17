/**
 * Outreach Schedule UI
 *
 * Shows users their upcoming check-ins and allows them to:
 * - View scheduled outreach
 * - Reschedule or cancel
 * - Preview what messages will say
 * - See recent outreach history
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { DURATION } from '../config/animation-constants.js';
import { apiGet, apiPost, apiDelete } from '../utils/api.js';

const log = createLogger('OutreachScheduleUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface ScheduledOutreach {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  channel: 'sms' | 'email' | 'call' | 'push';
  scheduledFor: Date;
  preview: {
    subject?: string;
    body: string;
  };
  reason: string;
  priority: 'high' | 'medium' | 'low';
  canReschedule: boolean;
  canCancel: boolean;
}

interface OutreachHistory {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  channel: string;
  sentAt: Date;
  status: 'delivered' | 'opened' | 'responded' | 'failed';
  preview: string;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  message: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  mail: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  bell: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  history: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
};

const CHANNEL_ICONS: Record<string, string> = {
  sms: ICONS.message,
  email: ICONS.mail,
  call: ICONS.phone,
  push: ICONS.bell,
};

// Persona colors are now defined via CSS custom properties
// Use data-persona attribute on elements to apply correct colors
// See: design-system/tokens/colors.json for source of truth

// ============================================================================
// STATE
// ============================================================================

let modalContainer: HTMLElement | null = null;
let isOpen = false;
let currentTab: 'upcoming' | 'history' = 'upcoming';

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
.outreach-schedule-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-tooltip);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-normal, 200ms) var(--ease-standard);
}

.outreach-schedule-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.outreach-schedule-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

.outreach-schedule-modal {
  position: relative;
  width: 90%;
  max-width: clamp(392px, 90vw, 560px);
  max-height: 80vh;
  background: var(--color-bg-elevated, #FFFDFB);
  border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform var(--duration-normal, 200ms) var(--ease-spring);
}

.outreach-schedule-overlay.open .outreach-schedule-modal {
  transform: scale(1);
}

.outreach-schedule-header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.outreach-schedule-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.outreach-schedule-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.outreach-schedule-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.outreach-schedule-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--color-text-muted, #888);
  border-radius: var(--radius-md, 8px);
  transition: background var(--duration-fast, 100ms), color var(--duration-fast, 100ms);
}

.outreach-schedule-close:hover {
  background: rgba(0,0,0,0.05);
  color: var(--color-text-primary, #2C2520);
}

.outreach-schedule-tabs {
  display: flex;
  gap: 4px;
  margin-top: 16px;
}

.outreach-schedule-tab {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all var(--duration-fast, 100ms);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.outreach-schedule-tab:hover {
  background: rgba(0,0,0,0.04);
}

.outreach-schedule-tab.active {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.outreach-schedule-tab svg {
  width: 16px;
  height: 16px;
}

.outreach-schedule-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
}

.outreach-schedule-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-text-muted, #888);
}

.outreach-schedule-empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  opacity: 0.5;
}

.outreach-schedule-empty-text {
  font-size: 15px;
  margin: 0 0 8px;
}

.outreach-schedule-empty-subtext {
  font-size: 13px;
  opacity: 0.7;
}

.outreach-item {
  padding: 16px;
  background: var(--color-background, #F5F1E8);
  border-radius: var(--radius-lg, 12px);
  margin-bottom: 12px;
  transition: transform var(--duration-fast, 100ms), box-shadow var(--duration-fast, 100ms);
}

.outreach-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.outreach-item:last-child {
  margin-bottom: 0;
}

.outreach-item-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.outreach-item-persona {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--persona-text, white);
  background: var(--persona-primary, var(--color-accent-primary));
}

.outreach-item-info {
  flex: 1;
  min-width: 0;
}

.outreach-item-persona-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 2px;
}

.outreach-item-meta {
  font-size: 12px;
  color: var(--color-text-muted, #888);
  display: flex;
  align-items: center;
  gap: 8px;
}

.outreach-item-channel {
  display: flex;
  align-items: center;
  gap: 4px;
}

.outreach-item-channel svg {
  width: 12px;
  height: 12px;
}

.outreach-item-time {
  display: flex;
  align-items: center;
  gap: 4px;
}

.outreach-item-time svg {
  width: 12px;
  height: 12px;
}

.outreach-item-priority {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.outreach-item-priority.high {
  background: var(--color-semantic-error-glow, rgba(239, 68, 68, 0.1));
  color: var(--color-semantic-error, #dc2626);
}

.outreach-item-priority.medium {
  background: var(--color-semantic-warning-glow, rgba(245, 158, 11, 0.1));
  color: var(--color-semantic-warning, #d97706);
}

.outreach-item-priority.low {
  background: var(--color-semantic-success-glow, rgba(34, 197, 94, 0.1));
  color: var(--color-semantic-success, #16a34a);
}

.outreach-item-preview {
  font-size: 14px;
  color: var(--color-text-secondary, #666);
  line-height: 1.5;
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.outreach-item-reason {
  font-size: 12px;
  color: var(--color-text-muted, #888);
  font-style: italic;
  margin: 0 0 12px;
}

.outreach-item-actions {
  display: flex;
  gap: 8px;
}

.outreach-item-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all var(--duration-fast, 100ms);
}

.outreach-item-btn svg {
  width: 14px;
  height: 14px;
}

.outreach-item-btn--preview {
  background: rgba(0,0,0,0.04);
  color: var(--color-text-secondary, #666);
}

.outreach-item-btn--preview:hover {
  background: rgba(0,0,0,0.08);
}

.outreach-item-btn--reschedule {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.outreach-item-btn--reschedule:hover {
  filter: brightness(1.1);
}

.outreach-item-btn--cancel {
  background: var(--color-semantic-error-glow, rgba(239, 68, 68, 0.1));
  color: var(--color-semantic-error, #dc2626);
}

.outreach-item-btn--cancel:hover {
  background: var(--color-semantic-error-glow, rgba(239, 68, 68, 0.2));
}

.outreach-item-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
}

.outreach-item-status.delivered {
  background: var(--color-semantic-success-glow, rgba(34, 197, 94, 0.1));
  color: var(--color-semantic-success, #16a34a);
}

.outreach-item-status.opened {
  background: var(--color-semantic-info-glow, rgba(59, 130, 246, 0.1));
  color: var(--color-semantic-info, #2563eb);
}

.outreach-item-status.responded {
  background: var(--persona-glow, rgba(74, 103, 65, 0.1));
  color: var(--persona-primary, #4a6741);
}

.outreach-item-status.failed {
  background: var(--color-semantic-error-glow, rgba(239, 68, 68, 0.1));
  color: var(--color-semantic-error, #dc2626);
}

@media (prefers-color-scheme: dark) {
  .outreach-schedule-modal {
    background: var(--color-background-elevated, #3d3530);
  }
  
  .outreach-item {
    background: rgba(0,0,0,0.2);
  }
}
`;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the outreach schedule UI
 */
export function initializeOutreachScheduleUI(): void {
  // Cleanup any existing instances
  cleanupOrphanedElements();

  // Inject styles
  injectStyles();

  log.debug('Outreach schedule UI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.outreach-schedule-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.outreach-schedule-styles').forEach((el) => el.remove());
}

function injectStyles(): void {
  if (document.querySelector('.outreach-schedule-styles')) return;

  const style = document.createElement('style');
  style.className = 'outreach-schedule-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * Open the outreach schedule modal
 */
export async function openOutreachSchedule(): Promise<void> {
  if (isOpen) return;

  initializeOutreachScheduleUI();
  createModal();
  
  // Fetch data
  await loadData();

  // Show modal
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  isOpen = true;
  log.info('Opened outreach schedule');
}

/**
 * Close the outreach schedule modal
 */
export function closeOutreachSchedule(): void {
  if (!isOpen || !modalContainer) return;

  modalContainer.classList.remove('open');

  trackedTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
  }, DURATION.NORMAL);

  isOpen = false;
  log.info('Closed outreach schedule');
}

function createModal(): void {
  modalContainer = document.createElement('div');
  modalContainer.className = 'outreach-schedule-overlay';
  modalContainer.innerHTML = `
    <div class="outreach-schedule-backdrop"></div>
    <div class="outreach-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="outreach-schedule-title">
      <header class="outreach-schedule-header">
        <div class="outreach-schedule-header-top">
          <div>
            <span class="outreach-schedule-eyebrow">YOUR CHECK-INS</span>
            <h2 class="outreach-schedule-title" id="outreach-schedule-title">
              ${ICONS.calendar}
              Scheduled Outreach
            </h2>
          </div>
          <button class="outreach-schedule-close" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </div>
        <div class="outreach-schedule-tabs">
          <button aria-label="${t('accessibility.upcoming')}" class="outreach-schedule-tab active" data-tab="upcoming">
            ${ICONS.calendar}
            Upcoming
          </button>
          <button aria-label="${t('accessibility.history')}" class="outreach-schedule-tab" data-tab="history">
            ${ICONS.history}
            History
          </button>
        </div>
      </header>
      <div class="outreach-schedule-content">
        <div class="outreach-schedule-loading">Loading...</div>
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = modalContainer.querySelector('.outreach-schedule-backdrop');
  backdrop?.addEventListener('click', closeOutreachSchedule);

  const closeBtn = modalContainer.querySelector('.outreach-schedule-close');
  closeBtn?.addEventListener('click', closeOutreachSchedule);

  // Tab switching
  modalContainer.querySelectorAll('.outreach-schedule-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = (tab as HTMLElement).dataset.tab as 'upcoming' | 'history';
      switchTab(tabId);
    });
  });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);

  document.body.appendChild(modalContainer);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && isOpen) {
    closeOutreachSchedule();
    document.removeEventListener('keydown', handleEscapeKey);
  }
}

function switchTab(tab: 'upcoming' | 'history'): void {
  currentTab = tab;

  // Update tab styles
  modalContainer?.querySelectorAll('.outreach-schedule-tab').forEach((t) => {
    t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab);
  });

  // Reload content
  loadData();
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData(): Promise<void> {
  const content = modalContainer?.querySelector('.outreach-schedule-content');
  if (!content) return;

  content.innerHTML = '<div class="outreach-schedule-loading">Loading...</div>';

  try {
    if (currentTab === 'upcoming') {
      const upcoming = await fetchUpcomingOutreach();
      renderUpcoming(content, upcoming);
    } else {
      const history = await fetchOutreachHistory();
      renderHistory(content, history);
    }
  } catch (error) {
    log.error({ error }, 'Failed to load outreach data');
    content.innerHTML = `
      <div class="outreach-schedule-empty">
        <div class="outreach-schedule-empty-text">Unable to load data</div>
        <div class="outreach-schedule-empty-subtext">Please try again later</div>
      </div>
    `;
  }
}

async function fetchUpcomingOutreach(): Promise<ScheduledOutreach[]> {
  try {
    const response = await apiGet<{ upcoming?: ScheduledOutreach[] }>('/api/outreach/upcoming');
    if (!response.ok || !response.data) return [];
    return response.data.upcoming ?? [];
  } catch {
    // Return empty array - real data will appear when outreach is scheduled
    return [];
  }
}

async function fetchOutreachHistory(): Promise<OutreachHistory[]> {
  try {
    const response = await apiGet<{ history?: OutreachHistory[] }>('/api/outreach/history?limit=20');
    if (!response.ok || !response.data) return [];
    return response.data.history ?? [];
  } catch {
    // Return empty array - real history will appear after outreach is sent
    return [];
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderUpcoming(container: Element, items: ScheduledOutreach[]): void {
  if (items.length === 0) {
    container.innerHTML = `
      <div class="outreach-schedule-empty">
        <div class="outreach-schedule-empty-icon">${ICONS.calendar}</div>
        <div class="outreach-schedule-empty-text">No upcoming check-ins</div>
        <div class="outreach-schedule-empty-subtext">We'll reach out when there's something to discuss!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => renderUpcomingItem(item)).join('');

  // Add event listeners
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      const id = (btn as HTMLElement).dataset.id;
      handleAction(action!, id!);
    });
  });
}

function renderUpcomingItem(item: ScheduledOutreach): string {
  const initial = item.personaName.charAt(0);
  const channelIcon = CHANNEL_ICONS[item.channel] || CHANNEL_ICONS.sms;
  const timeStr = formatTime(item.scheduledFor);

  return `
    <div class="outreach-item" data-outreach-id="${item.id}" data-persona="${item.personaId || 'ferni'}">
      <div class="outreach-item-header">
        <div class="outreach-item-persona">
          ${initial}
        </div>
        <div class="outreach-item-info">
          <p class="outreach-item-persona-name">${item.personaName}</p>
          <div class="outreach-item-meta">
            <span class="outreach-item-channel">${channelIcon} ${item.channel.toUpperCase()}</span>
            <span class="outreach-item-time">${ICONS.clock} ${timeStr}</span>
          </div>
        </div>
        <span class="outreach-item-priority ${item.priority}">${item.priority}</span>
      </div>
      <p class="outreach-item-preview">${item.preview.body}</p>
      <p class="outreach-item-reason">"${item.reason}"</p>
      <div class="outreach-item-actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.preview')}" class="outreach-item-btn outreach-item-btn--preview" data-action="preview" data-id="${item.id}">
          ${ICONS.eye} Preview
        </button>
        ${item.canReschedule ? `
          <button aria-label="${t('accessibility.edit')}" class="outreach-item-btn outreach-item-btn--reschedule" data-action="reschedule" data-id="${item.id}">
            ${ICONS.edit} Reschedule
          </button>
        ` : ''}
        ${item.canCancel ? `
          <button aria-label="${t('accessibility.delete')}" class="outreach-item-btn outreach-item-btn--cancel" data-action="cancel" data-id="${item.id}">
            ${ICONS.trash} Cancel
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderHistory(container: Element, items: OutreachHistory[]): void {
  if (items.length === 0) {
    container.innerHTML = `
      <div class="outreach-schedule-empty">
        <div class="outreach-schedule-empty-icon">${ICONS.history}</div>
        <div class="outreach-schedule-empty-text">No outreach history yet</div>
        <div class="outreach-schedule-empty-subtext">Your recent check-ins will appear here</div>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => renderHistoryItem(item)).join('');
}

function renderHistoryItem(item: OutreachHistory): string {
  const initial = item.personaName.charAt(0);
  const channelIcon = CHANNEL_ICONS[item.channel] || CHANNEL_ICONS.sms;
  const timeStr = formatRelativeTime(item.sentAt);

  const statusLabels: Record<string, string> = {
    delivered: 'Delivered',
    opened: 'Opened',
    responded: 'You replied!',
    failed: 'Not delivered',
  };

  return `
    <div class="outreach-item" data-persona="${item.personaId || 'ferni'}">
      <div class="outreach-item-header">
        <div class="outreach-item-persona">
          ${initial}
        </div>
        <div class="outreach-item-info">
          <p class="outreach-item-persona-name">${item.personaName}</p>
          <div class="outreach-item-meta">
            <span class="outreach-item-channel">${channelIcon} ${item.channel.toUpperCase()}</span>
            <span class="outreach-item-time">${ICONS.clock} ${timeStr}</span>
          </div>
        </div>
        <span class="outreach-item-status ${item.status}">
          ${item.status === 'responded' ? ICONS.check : ''} ${statusLabels[item.status] || item.status}
        </span>
      </div>
      <p class="outreach-item-preview">${item.preview}</p>
    </div>
  `;
}

// ============================================================================
// ACTIONS
// ============================================================================

async function handleAction(action: string, outreachId: string): Promise<void> {
  log.info({ action, outreachId }, 'Outreach action triggered');

  switch (action) {
    case 'preview':
      await showPreview(outreachId);
      break;
    case 'reschedule':
      await showReschedule(outreachId);
      break;
    case 'cancel':
      await cancelOutreach(outreachId);
      break;
  }
}

async function showPreview(outreachId: string): Promise<void> {
  // Fetch the outreach details
  try {
    const response = await apiGet<{ pending?: ScheduledOutreach[] }>(`/api/outreach/pending`);
    if (!response.ok || !response.data) return;
    const item = response.data.pending?.find((p: ScheduledOutreach) => p.id === outreachId);

    if (!item) {
      log.warn({ outreachId }, 'Outreach not found for preview');
      return;
    }

    // Create preview modal
    const preview = document.createElement('div');
    preview.className = 'outreach-preview-overlay';
    const personaId = item.personaId || 'ferni';

    preview.innerHTML = `
      <div class="outreach-preview-backdrop"></div>
      <div class="outreach-preview-modal" data-persona="${personaId}">
        <header class="outreach-preview-header">
          <div class="outreach-preview-persona">
            ${(item.personaId || 'F').charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 class="outreach-preview-title">${getPersonaName(item.personaId)}</h3>
            <span class="outreach-preview-channel">${(item.channel || 'sms').toUpperCase()} • ${item.type.replace(/_/g, ' ')}</span>
          </div>
          <button class="outreach-preview-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>
        <div class="outreach-preview-content">
          ${item.preview?.subject ? `<p class="outreach-preview-subject">${item.preview.subject}</p>` : ''}
          <div class="outreach-preview-message">${item.preview?.body || item.reason}</div>
        </div>
        <footer class="outreach-preview-footer">
          <span class="outreach-preview-time">${ICONS.clock} Scheduled for ${formatTime(new Date(item.scheduledFor))}</span>
        </footer>
      </div>
    `;

    // Add styles if not already added
    addPreviewStyles();

    document.body.appendChild(preview);

    // Animate in
    requestAnimationFrame(() => {
      preview.classList.add('open');
    });

    // Close handlers
    preview.querySelector('.outreach-preview-backdrop')?.addEventListener('click', () => {
      preview.classList.remove('open');
      trackedTimeout(() => preview.remove(), 200);
    });
    preview.querySelector('.outreach-preview-close')?.addEventListener('click', () => {
      preview.classList.remove('open');
      trackedTimeout(() => preview.remove(), 200);
    });

  } catch (error) {
    log.error({ error, outreachId }, 'Failed to show preview');
  }
}

function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya Santos',
    peter: 'Peter John',
    alex: 'Alex Chen',
    jordan: 'Jordan Taylor',
    nayan: 'Nayan Patel',
  };
  return names[personaId] ?? 'Ferni';
}

function addPreviewStyles(): void {
  if (document.querySelector('.outreach-preview-styles')) return;

  const style = document.createElement('style');
  style.className = 'outreach-preview-styles';
  style.textContent = `
    .outreach-preview-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 200ms ease;
    }
    .outreach-preview-overlay.open { opacity: 1; }
    .outreach-preview-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }
    .outreach-preview-modal {
      position: relative;
      width: 90%;
      max-width: clamp(294px, 90vw, 420px);
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      transform: scale(0.95);
      transition: transform 200ms ease;
    }
    .outreach-preview-overlay.open .outreach-preview-modal { transform: scale(1); }
    .outreach-preview-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .outreach-preview-persona {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-text, white);
      font-weight: 600;
      background: var(--persona-primary, var(--color-accent-primary));
    }
    .outreach-preview-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .outreach-preview-channel {
      font-size: 12px;
      color: var(--color-text-muted, #888);
      text-transform: capitalize;
    }
    .outreach-preview-close {
      margin-left: auto;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      color: var(--color-text-muted, #888);
    }
    .outreach-preview-content {
      padding: 20px;
    }
    .outreach-preview-subject {
      font-weight: 600;
      margin: 0 0 12px;
    }
    .outreach-preview-message {
      font-size: 15px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .outreach-preview-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(0,0,0,0.06);
      font-size: 13px;
      color: var(--color-text-muted, #888);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .outreach-preview-footer svg { width: 14px; height: 14px; }

    .outreach-reschedule-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 200ms ease;
    }
    .outreach-reschedule-overlay.open { opacity: 1; }
    .outreach-reschedule-modal {
      position: relative;
      width: 90%;
      max-width: min(360px, 100%);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      transform: scale(0.95);
      transition: transform 200ms ease;
    }
    .outreach-reschedule-overlay.open .outreach-reschedule-modal { transform: scale(1); }
    .outreach-reschedule-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 16px;
      text-align: center;
    }
    .outreach-reschedule-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .outreach-reschedule-option {
      padding: 12px 16px;
      background: var(--color-background, #F5F1E8);
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      text-align: left;
      transition: background 100ms;
    }
    .outreach-reschedule-option:hover { background: rgba(0,0,0,0.08); }
    .outreach-reschedule-cancel {
      margin-top: 12px;
      padding: 10px;
      background: none;
      border: none;
      color: var(--color-text-muted, #888);
      cursor: pointer;
      width: 100%;
    }
  `;
  document.head.appendChild(style);
}

async function showReschedule(outreachId: string): Promise<void> {
  // Create reschedule modal
  const reschedule = document.createElement('div');
  reschedule.className = 'outreach-reschedule-overlay';

  const now = new Date();
  const in1Hour = new Date(now.getTime() + 3600000);
  const in3Hours = new Date(now.getTime() + 3 * 3600000);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  reschedule.innerHTML = `
    <div class="outreach-preview-backdrop"></div>
    <div class="outreach-reschedule-modal">
      <h3 class="outreach-reschedule-title">Reschedule check-in</h3>
      <div class="outreach-reschedule-options">
        <button aria-label="${t('accessibility.in1Hour')}" class="outreach-reschedule-option" data-time="${in1Hour.toISOString()}">
          In 1 hour (${in1Hour.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})
        </button>
        <button aria-label="${t('accessibility.in3Hours')}" class="outreach-reschedule-option" data-time="${in3Hours.toISOString()}">
          In 3 hours (${in3Hours.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})
        </button>
        <button aria-label="${t('accessibility.tomorrowMorning900Am')}" class="outreach-reschedule-option" data-time="${tomorrow.toISOString()}">
          Tomorrow morning (9:00 AM)
        </button>
      </div>
      <button aria-label="${t('accessibility.cancel')}" class="outreach-reschedule-cancel">Cancel</button>
    </div>
  `;

  addPreviewStyles();
  document.body.appendChild(reschedule);

  requestAnimationFrame(() => {
    reschedule.classList.add('open');
  });

  const close = () => {
    reschedule.classList.remove('open');
    trackedTimeout(() => reschedule.remove(), 200);
  };

  reschedule.querySelector('.outreach-preview-backdrop')?.addEventListener('click', close);
  reschedule.querySelector('.outreach-reschedule-cancel')?.addEventListener('click', close);

  reschedule.querySelectorAll('.outreach-reschedule-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newTime = (btn as HTMLElement).dataset.time;
      try {
        // Call API to reschedule
        const response = await apiPost<{ success?: boolean }>(`/api/outreach/reschedule`, {
          triggerId: outreachId,
          newTime,
        });

        if (response.ok) {
          log.info({ outreachId, newTime }, 'Rescheduled outreach');
          close();
          await loadData(); // Refresh the list
        } else {
          log.error({ outreachId }, 'Failed to reschedule');
        }
      } catch (error) {
        log.error({ error, outreachId }, 'Reschedule error');
      }
    });
  });
}

async function cancelOutreach(outreachId: string): Promise<void> {
  if (!confirm('Are you sure you want to cancel this check-in?')) {
    return;
  }

  try {
    const response = await apiDelete<{ success?: boolean }>(`/api/outreach/pending/${outreachId}`);

    if (response.ok) {
      // Refresh the list
      await loadData();
      log.info({ outreachId }, 'Cancelled outreach');
    }
  } catch (error) {
    log.error({ error, outreachId }, 'Failed to cancel outreach');
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTime(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachSchedule = {
  open: openOutreachSchedule,
  close: closeOutreachSchedule,
  isOpen: () => isOpen,
};

