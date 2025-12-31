/**
 * Birthday & Anniversary Reminders UI
 *
 * Configure how Ferni reminds you about important dates.
 * "Better Than Human" - We never forget special occasions.
 *
 * @module ui/birthday-reminders.ui
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { t } from '../i18n/index.js';

const log = createLogger('BirthdayRemindersUI');

// ============================================================================
// TYPES
// ============================================================================

interface ReminderSettings {
  birthdayReminderDays: number; // Days before birthday to remind
  anniversaryReminderDays: number;
  customDateReminderDays: number;
  enablePushNotifications: boolean;
  enableEmailReminders: boolean;
  enableVoiceReminders: boolean; // Ferni mentions it in conversation
  reminderTime: string; // e.g., "09:00"
  suggestGifts: boolean;
  suggestMessages: boolean;
}

interface UpcomingDate {
  contactId: string;
  contactName: string;
  dateType: 'birthday' | 'anniversary' | 'memorial' | 'custom';
  date: string;
  label?: string;
  daysUntil: number;
}

interface RemindersState {
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  settings: ReminderSettings;
  upcomingDates: UpcomingDate[];
}

// ============================================================================
// STATE
// ============================================================================

const defaultSettings: ReminderSettings = {
  birthdayReminderDays: 7,
  anniversaryReminderDays: 7,
  customDateReminderDays: 3,
  enablePushNotifications: true,
  enableEmailReminders: false,
  enableVoiceReminders: true,
  reminderTime: '09:00',
  suggestGifts: true,
  suggestMessages: true,
};

let state: RemindersState = {
  isOpen: false,
  isLoading: false,
  isSaving: false,
  settings: { ...defaultSettings },
  upcomingDates: [],
};

let modalContainer: HTMLElement | null = null;
let previouslyFocusedElement: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  bell: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  cake: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>`,
  message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('birthday-reminders-styles')) return;

  const style = document.createElement('style');
  style.id = 'birthday-reminders-styles';
  style.textContent = `
    .br-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .br-overlay.open {
      opacity: 1;
    }
    
    .br-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }
    
    .br-modal {
      position: relative;
      width: 90%;
      max-width: clamp(364px, 90vw, 520px);
      max-height: 85vh;
      background: var(--color-background-elevated, #faf6f0);
      border-radius: var(--radius-2xl, 1rem);
      box-shadow: var(--shadow-2xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .br-overlay.open .br-modal {
      transform: scale(1);
    }
    
    .br-header {
      padding: var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.1));
    }
    
    .br-eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }
    
    .br-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    
    .br-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }
    
    .br-close {
      position: absolute;
      top: var(--space-4, 1rem);
      right: var(--space-4, 1rem);
      padding: var(--space-2, 0.5rem);
      background: none;
      border: none;
      color: var(--color-text-muted, #8a7a6a);
      cursor: pointer;
      border-radius: var(--radius-full);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .br-close:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.05));
    }
    
    .br-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 1.5rem);
    }
    
    .br-section {
      margin-bottom: var(--space-6, 1.5rem);
    }
    
    .br-section:last-child {
      margin-bottom: 0;
    }
    
    .br-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-3, 0.75rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    
    .br-section-title svg {
      color: var(--persona-primary, #4a6741);
    }
    
    .br-setting {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3, 0.75rem) 0;
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.05));
    }
    
    .br-setting:last-child {
      border-bottom: none;
    }
    
    .br-setting-info {
      flex: 1;
      margin-right: var(--space-4, 1rem);
    }
    
    .br-setting-label {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }
    
    .br-setting-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7a6a);
      margin-top: 2px;
    }
    
    .br-toggle {
      position: relative;
      width: 44px;
      height: 24px;
      background: var(--color-background-hover, #e8e2da);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .br-toggle.active {
      background: var(--persona-primary, #4a6741);
    }
    
    .br-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      box-shadow: var(--shadow-sm);
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }
    
    .br-toggle.active::after {
      transform: translateX(20px);
    }
    
    .br-select {
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      background: var(--color-background, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,0.15));
      border-radius: var(--radius-md);
      color: var(--color-text-primary, #2C2520);
      font-size: 0.875rem;
      cursor: pointer;
      min-width: 80px;
    }
    
    .br-select:focus {
      outline: none;
      border-color: var(--persona-primary, #4a6741);
    }
    
    .br-upcoming {
      background: var(--color-background, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,0.1));
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    
    .br-upcoming-empty {
      padding: var(--space-4, 1rem);
      text-align: center;
      color: var(--color-text-muted, #8a7a6a);
      font-size: 0.875rem;
    }
    
    .br-date-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.05));
    }
    
    .br-date-item:last-child {
      border-bottom: none;
    }
    
    .br-date-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-md);
      color: var(--persona-primary, #4a6741);
    }
    
    .br-date-info {
      flex: 1;
    }
    
    .br-date-name {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }
    
    .br-date-type {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7a6a);
    }
    
    .br-date-countdown {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      white-space: nowrap;
    }
    
    .br-date-countdown.soon {
      color: var(--color-semantic-warning, #c4856a);
    }
    
    .br-date-countdown.today {
      color: var(--color-semantic-error, #c44);
    }
    
    .br-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(0,0,0,0.1));
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3, 0.75rem);
    }
    
    .br-btn {
      padding: var(--space-2-5, 0.625rem) var(--space-4, 1rem);
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .br-btn-secondary {
      background: var(--tonal-surface-2);
      border: none;
      color: var(--color-text-secondary, #70605a);
    }

    .br-btn-secondary:hover {
      background: var(--tonal-surface-3);
    }

    .br-btn-secondary:active {
      background: var(--tonal-surface-active);
    }
    
    .br-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: none;
      color: white;
    }
    
    .br-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }
    
    .br-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const content = modalContainer.querySelector('.br-content');
  if (!content) return;

  content.innerHTML = `
    <!-- Reminder Timing -->
    <div class="br-section">
      <h3 class="br-section-title">${ICONS.bell} Reminder Timing</h3>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Birthday reminders</div>
          <div class="br-setting-desc">How many days before birthdays</div>
        </div>
        <select class="br-select" id="br-birthday-days">
          ${[1, 3, 7, 14, 30].map(d => 
            `<option value="${d}" ${state.settings.birthdayReminderDays === d ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Anniversary reminders</div>
          <div class="br-setting-desc">How many days before anniversaries</div>
        </div>
        <select class="br-select" id="br-anniversary-days">
          ${[1, 3, 7, 14, 30].map(d => 
            `<option value="${d}" ${state.settings.anniversaryReminderDays === d ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Reminder time</div>
          <div class="br-setting-desc">When to send reminders</div>
        </div>
        <select class="br-select" id="br-time">
          ${['07:00', '08:00', '09:00', '10:00', '12:00', '17:00', '19:00'].map(t => 
            `<option value="${t}" ${state.settings.reminderTime === t ? 'selected' : ''}>${formatTime(t)}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    
    <!-- Notification Channels -->
    <div class="br-section">
      <h3 class="br-section-title">${ICONS.message} How We Remind You</h3>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">In conversation</div>
          <div class="br-setting-desc">Ferni mentions upcoming dates naturally</div>
        </div>
        <div class="br-toggle ${state.settings.enableVoiceReminders ? 'active' : ''}" role="button" tabindex="0" id="br-voice-toggle"></div>
      </div>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Push notifications</div>
          <div class="br-setting-desc">Get notified on your device</div>
        </div>
        <div class="br-toggle ${state.settings.enablePushNotifications ? 'active' : ''}" role="button" tabindex="0" id="br-push-toggle"></div>
      </div>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Email reminders</div>
          <div class="br-setting-desc">Receive email notifications</div>
        </div>
        <div class="br-toggle ${state.settings.enableEmailReminders ? 'active' : ''}" role="button" tabindex="0" id="br-email-toggle"></div>
      </div>
    </div>
    
    <!-- AI Suggestions -->
    <div class="br-section">
      <h3 class="br-section-title">${ICONS.gift} Smart Suggestions</h3>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Gift ideas</div>
          <div class="br-setting-desc">Get personalized gift suggestions</div>
        </div>
        <div class="br-toggle ${state.settings.suggestGifts ? 'active' : ''}" role="button" tabindex="0" id="br-gifts-toggle"></div>
      </div>
      
      <div class="br-setting">
        <div class="br-setting-info">
          <div class="br-setting-label">Message drafts</div>
          <div class="br-setting-desc">Get suggested birthday messages</div>
        </div>
        <div class="br-toggle ${state.settings.suggestMessages ? 'active' : ''}" role="button" tabindex="0" id="br-messages-toggle"></div>
      </div>
    </div>
    
    <!-- Upcoming Dates -->
    <div class="br-section">
      <h3 class="br-section-title">${ICONS.calendar} Coming Up</h3>
      <div class="br-upcoming">
        ${state.upcomingDates.length > 0 ? 
          state.upcomingDates.map(date => renderUpcomingDate(date)).join('') :
          `<div class="br-upcoming-empty">No upcoming dates in the next 30 days</div>`
        }
      </div>
    </div>
  `;

  bindEvents();
}

function renderUpcomingDate(date: UpcomingDate): string {
  const icon = date.dateType === 'birthday' ? ICONS.cake :
               date.dateType === 'anniversary' ? ICONS.heart :
               ICONS.calendar;
  
  const typeLabel = date.dateType === 'birthday' ? 'Birthday' :
                    date.dateType === 'anniversary' ? 'Anniversary' :
                    date.label ?? 'Special date';
  
  const countdownClass = date.daysUntil === 0 ? 'today' :
                         date.daysUntil <= 3 ? 'soon' : '';
  
  const countdownText = date.daysUntil === 0 ? 'Today!' :
                        date.daysUntil === 1 ? 'Tomorrow' :
                        `In ${date.daysUntil} days`;

  return `
    <div class="br-date-item">
      <div class="br-date-icon">${icon}</div>
      <div class="br-date-info">
        <div class="br-date-name">${escapeHtml(date.contactName)}</div>
        <div class="br-date-type">${typeLabel}</div>
      </div>
      <div class="br-date-countdown ${countdownClass}">${countdownText}</div>
    </div>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Selects
  modalContainer.querySelector('#br-birthday-days')?.addEventListener('change', (e) => {
    state.settings.birthdayReminderDays = parseInt((e.target as HTMLSelectElement).value);
  });

  modalContainer.querySelector('#br-anniversary-days')?.addEventListener('change', (e) => {
    state.settings.anniversaryReminderDays = parseInt((e.target as HTMLSelectElement).value);
  });

  modalContainer.querySelector('#br-time')?.addEventListener('change', (e) => {
    state.settings.reminderTime = (e.target as HTMLSelectElement).value;
  });

  // Toggles
  modalContainer.querySelector('#br-voice-toggle')?.addEventListener('click', () => {
    state.settings.enableVoiceReminders = !state.settings.enableVoiceReminders;
    render();
  });

  modalContainer.querySelector('#br-push-toggle')?.addEventListener('click', () => {
    state.settings.enablePushNotifications = !state.settings.enablePushNotifications;
    render();
  });

  modalContainer.querySelector('#br-email-toggle')?.addEventListener('click', () => {
    state.settings.enableEmailReminders = !state.settings.enableEmailReminders;
    render();
  });

  modalContainer.querySelector('#br-gifts-toggle')?.addEventListener('click', () => {
    state.settings.suggestGifts = !state.settings.suggestGifts;
    render();
  });

  modalContainer.querySelector('#br-messages-toggle')?.addEventListener('click', () => {
    state.settings.suggestMessages = !state.settings.suggestMessages;
    render();
  });
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData(): Promise<void> {
  state.isLoading = true;

  try {
    // Load settings from the new /api/user/reminders endpoint
    const settingsRes = await apiFetch('/api/user/reminders');
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      if (data.settings) {
        // Map API settings to local state format
        state.settings = {
          ...defaultSettings,
          birthdayReminderDays: data.settings.daysBefore || defaultSettings.birthdayReminderDays,
          anniversaryReminderDays: data.settings.daysBefore || defaultSettings.anniversaryReminderDays,
          enablePushNotifications: data.settings.channels?.push ?? defaultSettings.enablePushNotifications,
          enableEmailReminders: data.settings.channels?.email ?? defaultSettings.enableEmailReminders,
          enableVoiceReminders: data.settings.channels?.voice ?? defaultSettings.enableVoiceReminders,
          suggestGifts: data.settings.includeGiftSuggestions ?? defaultSettings.suggestGifts,
          suggestMessages: data.settings.includeMessageDrafts ?? defaultSettings.suggestMessages,
        };
      }
      // Load upcoming dates if provided by API
      if (data.upcomingDates) {
        state.upcomingDates = data.upcomingDates.slice(0, 5);
      }
    }

    // Also load upcoming dates from nudges as fallback
    if (state.upcomingDates.length === 0) {
      const nudgesRes = await apiFetch('/api/contacts/nudges');
      if (nudgesRes.ok) {
        const data = await nudgesRes.json();
        const nudges = Array.isArray(data) ? data : (data.nudges || []);
        state.upcomingDates = nudges
          .filter((n: { type?: string; reason?: string }) => 
            n.type === 'upcoming_birthday' || n.type === 'upcoming_anniversary' ||
            n.reason?.toLowerCase().includes('birthday') ||
            n.reason?.toLowerCase().includes('anniversary')
          )
          .map((n: { contactId: string; contactName: string; type?: string; reason?: string; daysUntilEvent?: number; daysSinceContact?: number }) => ({
            contactId: n.contactId,
            contactName: n.contactName,
            dateType: (n.type === 'upcoming_birthday' || n.reason?.toLowerCase().includes('birthday')) 
              ? 'birthday' as const 
              : 'anniversary' as const,
            date: '',
            daysUntil: n.daysUntilEvent || n.daysSinceContact || 0,
          }))
          .slice(0, 5);
      }
    }
  } catch (error) {
    log.error('Failed to load reminder settings:', error);
    // Use defaults
  } finally {
    state.isLoading = false;
    render();
  }
}

async function saveSettings(): Promise<void> {
  state.isSaving = true;

  try {
    // Map local state to API format
    const apiSettings = {
      enabled: true,
      daysBefore: state.settings.birthdayReminderDays,
      channels: {
        voice: state.settings.enableVoiceReminders,
        push: state.settings.enablePushNotifications,
        email: state.settings.enableEmailReminders,
      },
      includeGiftSuggestions: state.settings.suggestGifts,
      includeMessageDrafts: state.settings.suggestMessages,
    };

    const response = await apiFetch('/api/user/reminders', {
      method: 'POST',
      body: JSON.stringify(apiSettings),
    });

    if (response.ok) {
      toast.success(t('toasts.settingsSaved'));
      closeBirthdayReminders();
    } else {
      toast.error(t('toasts.couldNotSaveSettings'));
    }
  } catch (error) {
    log.error('Failed to save reminder settings:', error);
    toast.error(t('toasts.couldNotSaveSettings'));
  } finally {
    state.isSaving = false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(time: string): string {
  const [hours] = time.split(':');
  const h = parseInt(hours);
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeBirthdayReminders();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the birthday reminders settings modal
 */
export function openBirthdayReminders(): void {
  if (state.isOpen) return;

  previouslyFocusedElement = document.activeElement as HTMLElement | null;

  // Cleanup any existing modals
  document.querySelectorAll('.br-overlay').forEach(el => el.remove());
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    isLoading: true,
    isSaving: false,
    settings: { ...defaultSettings },
    upcomingDates: [],
  };

  // Create modal
  modalContainer = document.createElement('div');
  modalContainer.className = 'br-overlay';
  modalContainer.innerHTML = `
    <div class="br-backdrop"></div>
    <div class="br-modal" role="dialog" aria-modal="true" aria-labelledby="br-title">
      <div class="br-header">
        <div class="br-eyebrow">Never Forget</div>
        <h2 class="br-title" id="br-title">${ICONS.cake} Important Dates</h2>
        <p class="br-subtitle">We remember so you don't have to</p>
        <button class="br-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      </div>
      <div class="br-content">
        <div style="text-align: center; padding: var(--space-8); color: var(--color-text-muted);">Loading...</div>
      </div>
      <div class="br-footer">
        <button aria-label="${t('accessibility.cancel')}" class="br-btn br-btn-secondary" id="br-cancel">Cancel</button>
        <button aria-label="${t('accessibility.settings')}" class="br-btn br-btn-primary" id="br-save">Save Settings</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalContainer);

  // Bind close button
  modalContainer.querySelector('.br-close')?.addEventListener('click', closeBirthdayReminders);
  modalContainer.querySelector('.br-backdrop')?.addEventListener('click', closeBirthdayReminders);
  modalContainer.querySelector('#br-cancel')?.addEventListener('click', closeBirthdayReminders);
  modalContainer.querySelector('#br-save')?.addEventListener('click', saveSettings);

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  // Event listeners
  document.addEventListener('keydown', handleEscapeKey);

  // Load data
  loadData();

  log.info('Opened birthday reminders settings');
}

/**
 * Close the birthday reminders settings modal
 */
export function closeBirthdayReminders(): void {
  if (!state.isOpen || !modalContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);
  
  modalContainer.classList.remove('open');
  
  setTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
    
    // Restore focus
    if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed birthday reminders settings');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initBirthdayRemindersUI(): void {
  document.addEventListener('ferni:open-birthday-reminders', () => {
    openBirthdayReminders();
  });

  log.debug('Birthday Reminders UI initialized');
}

export default { open: openBirthdayReminders, close: closeBirthdayReminders };

