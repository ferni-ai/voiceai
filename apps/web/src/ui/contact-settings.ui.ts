/**
 * Contact Settings UI
 *
 * Allows users to add/edit their phone and email for proactive outreach.
 * Brand-compliant centered modal with warm, human design.
 *
 * DESIGN PRINCIPLES:
 *   - Warm, inviting copy (not corporate)
 *   - Clear value proposition (why share contact info)
 *   - Easy opt-out messaging
 *   - Phone verification via SMS code
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { getUserTimezone } from '../services/timezone.service.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';

const log = createLogger('ContactSettingsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate time options for the quiet hours selects
 */
function generateTimeOptions(selectedValue: string): string {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const value = `${hour.toString().padStart(2, '0')}:00`;
    const label = formatHour(hour);
    const selected = value === selectedValue ? 'selected' : '';
    options.push(`<option value="${value}" ${selected}>${label}</option>`);
  }
  return options.join('');
}

/**
 * Format hour for display (12-hour with AM/PM)
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * Format timezone for display
 */
function formatTimezone(timezone: string): string {
  try {
    // Get abbreviated timezone name
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || timezone.replace(/_/g, ' ');
  } catch {
    return timezone.replace(/_/g, ' ');
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface ContactInfo {
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  preferredName?: string;
  timezone?: string;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
  quietHoursEnabled?: boolean;
}

interface ContactSettingsState {
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isVerifying: boolean;
  verificationCode: string;
  pendingPhone: string;
  contactInfo: ContactInfo;
  error?: string;
  success?: string;
}

// ============================================================================
// STATE
// ============================================================================

let state: ContactSettingsState = {
  isOpen: false,
  isLoading: false,
  isSaving: false,
  isVerifying: false,
  verificationCode: '',
  pendingPhone: '',
  contactInfo: {},
};

let modalContainer: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('contact-settings-styles')) return;

  const style = document.createElement('style');
  style.id = 'contact-settings-styles';
  style.textContent = `
    .contact-settings-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      pointer-events: none;
    }

    .contact-settings-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .contact-settings-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.4);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .contact-settings-modal {
      position: relative;
      width: 90%;
      max-width: 440px;
      max-height: 90vh;
      overflow-y: auto;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .contact-settings-overlay.open .contact-settings-modal {
      transform: scale(1) translateY(0);
    }

    .contact-settings-header {
      padding: 24px 24px 0;
      text-align: center;
    }

    .contact-settings-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      padding: 12px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 50%;
      color: white;
    }

    .contact-settings-icon svg {
      width: 24px;
      height: 24px;
    }

    .contact-settings-eyebrow {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-secondary);
      margin-bottom: 4px;
    }

    .contact-settings-title {
      font-size: 22px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 8px;
    }

    .contact-settings-subtitle {
      font-size: 14px;
      color: var(--color-text-secondary, #6B5B4F);
      line-height: 1.5;
      margin: 0;
    }

    .contact-settings-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: var(--color-text-muted, #9B8B7F);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .contact-settings-close:hover {
      background: rgba(0, 0, 0, 0.05);
      color: var(--color-text-primary, #2C2520);
    }

    .contact-settings-close svg {
      width: 18px;
      height: 18px;
    }

    .contact-settings-content {
      padding: 24px;
    }

    .contact-settings-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .contact-settings-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .contact-settings-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-secondary, #6B5B4F);
    }

    .contact-settings-label svg {
      width: 16px;
      height: 16px;
    }

    .contact-settings-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .contact-settings-input {
      width: 100%;
      padding: 12px 16px;
      font-size: 16px;
      border: 2px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-lg, 12px);
      background: var(--color-background, #F5F1E8);
      color: var(--color-text-primary, #2C2520);
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .contact-settings-input:focus {
      outline: none;
      border-color: var(--color-text-secondary);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    .contact-settings-input::placeholder {
      color: var(--color-text-muted, #9B8B7F);
    }

    .contact-settings-verified {
      position: absolute;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    .contact-settings-verified svg {
      width: 14px;
      height: 14px;
    }

    .contact-settings-verify-btn {
      margin-top: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      background: transparent;
      border: 1px solid var(--persona-primary, #4a6741);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .contact-settings-verify-btn:hover {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .contact-settings-verify-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .contact-settings-verification {
      margin-top: 12px;
      padding: 16px;
      background: rgba(74, 103, 65, 0.05);
      border-radius: var(--radius-md, 8px);
      border: 1px solid rgba(74, 103, 65, 0.2);
    }

    .contact-settings-verification-text {
      font-size: 13px;
      color: var(--color-text-secondary, #6B5B4F);
      margin: 0 0 12px;
    }

    .contact-settings-code-input {
      width: 100%;
      padding: 12px 16px;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.3em;
      text-align: center;
      border: 2px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-md, 8px);
      background: white;
    }

    .contact-settings-privacy {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: rgba(74, 103, 65, 0.05);
      border-radius: var(--radius-lg, 12px);
      margin-top: 8px;
    }

    .contact-settings-privacy-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary);
    }

    .contact-settings-privacy-text {
      font-size: 12px;
      color: var(--color-text-secondary, #6B5B4F);
      line-height: 1.5;
      margin: 0;
    }

    .contact-settings-actions {
      display: flex;
      gap: 12px;
      padding: 16px 24px 24px;
    }

    .contact-settings-btn {
      flex: 1;
      padding: 14px 24px;
      font-size: 15px;
      font-weight: 600;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .contact-settings-btn:active {
      transform: scale(0.98);
    }

    .contact-settings-btn--secondary {
      background: transparent;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
      color: var(--color-text-secondary, #6B5B4F);
    }

    .contact-settings-btn--primary {
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border: none;
      color: white;
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }

    .contact-settings-btn--primary:hover {
      box-shadow: 0 6px 16px rgba(74, 103, 65, 0.4);
    }

    .contact-settings-btn--primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .contact-settings-error {
      padding: 12px 16px;
      background: var(--color-error-bg, rgba(220, 38, 38, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-error, #dc2626);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .contact-settings-success {
      padding: 12px 16px;
      background: rgba(74, 103, 65, 0.1);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary);
      font-size: 13px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .contact-settings-success svg {
      width: 16px;
      height: 16px;
    }

    /* Quiet Hours Section */
    .contact-settings-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    }

    .contact-settings-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .contact-settings-section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .contact-settings-section-title svg {
      width: 18px;
      height: 18px;
      color: var(--color-text-secondary);
    }

    .contact-settings-toggle {
      position: relative;
      width: 48px;
      height: 26px;
      background: var(--color-border, rgba(0, 0, 0, 0.15));
      border-radius: 13px;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms;
    }

    .contact-settings-toggle.active {
      background: var(--persona-primary, #4a6741);
    }

    .contact-settings-toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }

    .contact-settings-toggle.active .contact-settings-toggle-knob {
      transform: translateX(22px);
    }

    .contact-settings-time-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
      opacity: 0.5;
      pointer-events: none;
      transition: opacity ${DURATION.FAST}ms;
    }

    .contact-settings-time-row.enabled {
      opacity: 1;
      pointer-events: auto;
    }

    .contact-settings-time-label {
      font-size: 13px;
      color: var(--color-text-secondary, #6B5B4F);
      min-width: 60px;
    }

    .contact-settings-time-select {
      flex: 1;
      padding: 10px 12px;
      font-size: 14px;
      border: 2px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-md, 8px);
      background: var(--color-background, #F5F1E8);
      color: var(--color-text-primary, #2C2520);
      cursor: pointer;
      transition: border-color ${DURATION.FAST}ms;
    }

    .contact-settings-time-select:focus {
      outline: none;
      border-color: var(--color-text-secondary);
    }

    .contact-settings-quiet-note {
      margin-top: 12px;
      font-size: 12px;
      color: var(--color-text-muted, #9B8B7F);
      line-height: 1.4;
    }

    .contact-settings-timezone {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 10px 12px;
      background: rgba(74, 103, 65, 0.05);
      border-radius: var(--radius-md, 8px);
      font-size: 12px;
      color: var(--color-text-secondary, #6B5B4F);
    }

    .contact-settings-timezone svg {
      width: 14px;
      height: 14px;
      color: var(--color-text-secondary);
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const modal = modalContainer.querySelector('.contact-settings-modal');
  if (!modal) return;

  modal.innerHTML = `
    <button class="contact-settings-close" aria-label="${t('common.close')}">
      ${ICONS.close}
    </button>
    
    <div class="contact-settings-header">
      <div class="contact-settings-icon">
        ${ICONS.heart}
      </div>
      <p class="contact-settings-eyebrow">Stay Connected</p>
      <h2 class="contact-settings-title">How can I reach you?</h2>
      <p class="contact-settings-subtitle">
        Share your contact info so I can check in on you, celebrate your wins, and be there when you need support.
      </p>
    </div>
    
    <div class="contact-settings-content">
      ${state.error ? `<div class="contact-settings-error">${state.error}</div>` : ''}
      ${state.success ? `<div class="contact-settings-success">${ICONS.check} ${state.success}</div>` : ''}
      
      <form class="contact-settings-form" id="contact-form">
        <div class="contact-settings-field">
          <label class="contact-settings-label">
            ${ICONS.phone}
            Phone (for texts & calls)
          </label>
          <div class="contact-settings-input-wrapper">
            <input 
              type="tel" 
              class="contact-settings-input" 
              id="phone-input"
              placeholder="${t('placeholders.phoneExample')}"
              value="${state.contactInfo.phone || ''}"
              ${state.isVerifying ? 'disabled' : ''}
            />
            ${state.contactInfo.phoneVerified ? `
              <span class="contact-settings-verified">
                ${ICONS.check} Verified
              </span>
            ` : ''}
          </div>
          ${!state.contactInfo.phoneVerified && state.contactInfo.phone ? `
            <button type="button" class="contact-settings-verify-btn" id="verify-phone-btn" ${state.isVerifying ? 'disabled' : ''}>
              ${state.isVerifying ? 'Sending code...' : 'Verify with code'}
            </button>
          ` : ''}
          ${state.isVerifying ? `
            <div class="contact-settings-verification">
              <p class="contact-settings-verification-text">
                We sent a 6-digit code to ${state.pendingPhone}
              </p>
              <input 
                type="text" 
                class="contact-settings-code-input" 
                id="verification-code"
                placeholder="• • • • • •"
                maxlength="6"
                value="${state.verificationCode}"
              />
            </div>
          ` : ''}
        </div>
        
        <div class="contact-settings-field">
          <label class="contact-settings-label">
            ${ICONS.email}
            Email (for updates & summaries)
          </label>
          <div class="contact-settings-input-wrapper">
            <input 
              type="email" 
              class="contact-settings-input" 
              id="email-input"
              placeholder="${t('placeholders.emailExample')}"
              value="${state.contactInfo.email || ''}"
            />
            ${state.contactInfo.emailVerified ? `
              <span class="contact-settings-verified">
                ${ICONS.check} Verified
              </span>
            ` : ''}
          </div>
        </div>
        
        <div class="contact-settings-field">
          <label class="contact-settings-label">
            What should I call you?
          </label>
          <input 
            type="text" 
            class="contact-settings-input" 
            id="name-input"
            placeholder="${t('placeholders.displayName')}"
            value="${state.contactInfo.preferredName || ''}"
          />
        </div>
        
        <div class="contact-settings-privacy">
          <span class="contact-settings-privacy-icon">${ICONS.shield}</span>
          <p class="contact-settings-privacy-text">
            Your info is only used for caring check-ins. You can update your outreach preferences anytime, and we'll never spam you or share your data.
          </p>
        </div>

        <!-- Quiet Hours Section -->
        <div class="contact-settings-section">
          <div class="contact-settings-section-header">
            <div class="contact-settings-section-title">
              ${ICONS.moon}
              Quiet Hours
            </div>
            <button 
              type="button" 
              class="contact-settings-toggle ${state.contactInfo.quietHoursEnabled !== false ? 'active' : ''}"
              id="quiet-hours-toggle"
              aria-pressed="${state.contactInfo.quietHoursEnabled !== false}"
              aria-label="${t('accessibility.toggleQuietHours')}"
            >
              <span class="contact-settings-toggle-knob"></span>
            </button>
          </div>
          
          <div class="contact-settings-time-row ${state.contactInfo.quietHoursEnabled !== false ? 'enabled' : ''}">
            <span class="contact-settings-time-label">Don't call</span>
            <select class="contact-settings-time-select" id="quiet-start">
              ${generateTimeOptions(state.contactInfo.quietHoursStart || '22:00')}
            </select>
            <span class="contact-settings-time-label">until</span>
            <select class="contact-settings-time-select" id="quiet-end">
              ${generateTimeOptions(state.contactInfo.quietHoursEnd || '08:00')}
            </select>
          </div>
          
          <p class="contact-settings-quiet-note">
            I'll respect your quiet hours and won't call or text during sleep time. 
            Urgent check-ins may still come through.
          </p>
          
          ${state.contactInfo.timezone ? `
            <div class="contact-settings-timezone">
              ${ICONS.globe}
              <span>Detected timezone: ${formatTimezone(state.contactInfo.timezone)}</span>
            </div>
          ` : ''}
        </div>
      </form>
    </div>
    
    <div class="contact-settings-actions">
      <button class="contact-settings-btn contact-settings-btn--secondary" id="cancel-btn">
        Maybe later
      </button>
      <button class="contact-settings-btn contact-settings-btn--primary" id="save-btn" ${state.isSaving ? 'disabled' : ''}>
        ${state.isSaving ? t('common.saving') : 'Save'}
      </button>
    </div>
  `;

  // Bind events
  bindEvents();
}

function bindEvents(): void {
  if (!modalContainer) return;

  // Close button
  modalContainer.querySelector('.contact-settings-close')?.addEventListener('click', close);
  modalContainer.querySelector('#cancel-btn')?.addEventListener('click', close);

  // Backdrop close
  modalContainer.querySelector('.contact-settings-backdrop')?.addEventListener('click', close);

  // Save button
  modalContainer.querySelector('#save-btn')?.addEventListener('click', handleSave);

  // Verify phone button
  modalContainer.querySelector('#verify-phone-btn')?.addEventListener('click', handleSendVerification);

  // Verification code input
  const codeInput = modalContainer.querySelector('#verification-code') as HTMLInputElement;
  codeInput?.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    state.verificationCode = value;
    if (value.length === 6) {
      handleVerifyCode(value);
    }
  });

  // Quiet hours toggle
  const quietToggle = modalContainer.querySelector('#quiet-hours-toggle');
  quietToggle?.addEventListener('click', () => {
    const isEnabled = state.contactInfo.quietHoursEnabled !== false;
    state.contactInfo.quietHoursEnabled = !isEnabled;
    
    // Update toggle appearance
    quietToggle.classList.toggle('active', !isEnabled);
    quietToggle.setAttribute('aria-pressed', String(!isEnabled));
    
    // Update time row enabled state
    const timeRow = modalContainer?.querySelector('.contact-settings-time-row');
    timeRow?.classList.toggle('enabled', !isEnabled);
  });

  // Quiet hours time selects
  const quietStart = modalContainer.querySelector('#quiet-start') as HTMLSelectElement;
  const quietEnd = modalContainer.querySelector('#quiet-end') as HTMLSelectElement;
  
  quietStart?.addEventListener('change', (e) => {
    state.contactInfo.quietHoursStart = (e.target as HTMLSelectElement).value;
  });
  
  quietEnd?.addEventListener('change', (e) => {
    state.contactInfo.quietHoursEnd = (e.target as HTMLSelectElement).value;
  });

  // Escape key
  document.addEventListener('keydown', handleEscape);
}

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    close();
  }
}

// ============================================================================
// API CALLS
// ============================================================================

async function loadContactInfo(): Promise<void> {
  state.isLoading = true;

  try {
    // Get authenticated headers (includes Firebase Bearer token)
    const headers = await getApiHeadersAsync();

    // Load contact info
    const response = await fetch('/api/outreach/context', { headers });
    const data = await response.json();

    if (data.success && data.context?.personal) {
      state.contactInfo = {
        phone: data.context.personal.phone,
        email: data.context.personal.email,
        preferredName: data.context.personal.preferredName,
        phoneVerified: data.context.personal.phoneVerified,
        emailVerified: data.context.personal.emailVerified,
      };
    }
    
    // Load user preferences (timezone, quiet hours)
    try {
      const prefsResponse = await fetch('/api/user/preferences', { headers });
      const prefsData = await prefsResponse.json();
      
      if (prefsData.success && prefsData.preferences) {
        state.contactInfo.timezone = prefsData.preferences.timezone;
        state.contactInfo.quietHoursStart = prefsData.preferences.quietHoursStart;
        state.contactInfo.quietHoursEnd = prefsData.preferences.quietHoursEnd;
        state.contactInfo.quietHoursEnabled = true; // Enabled by default
      }
    } catch (prefsError) {
      log.debug({ prefsError }, 'Could not load preferences, using defaults');
      // Use detected timezone as fallback
      state.contactInfo.timezone = getUserTimezone();
      state.contactInfo.quietHoursStart = '22:00';
      state.contactInfo.quietHoursEnd = '08:00';
      state.contactInfo.quietHoursEnabled = true;
    }
  } catch (error) {
    log.error({ error }, 'Failed to load contact info');
    // Still show detected timezone
    state.contactInfo.timezone = getUserTimezone();
  } finally {
    state.isLoading = false;
    render();
  }
}

async function handleSave(): Promise<void> {
  state.isSaving = true;
  state.error = undefined;
  state.success = undefined;
  render();

  const phoneInput = modalContainer?.querySelector('#phone-input') as HTMLInputElement;
  const emailInput = modalContainer?.querySelector('#email-input') as HTMLInputElement;
  const nameInput = modalContainer?.querySelector('#name-input') as HTMLInputElement;

  const phone = phoneInput?.value.trim();
  const email = emailInput?.value.trim();
  const preferredName = nameInput?.value.trim();

  // Get quiet hours values
  const quietHoursStart = state.contactInfo.quietHoursStart || '22:00';
  const quietHoursEnd = state.contactInfo.quietHoursEnd || '08:00';
  const quietHoursEnabled = state.contactInfo.quietHoursEnabled !== false;

  try {
    // Get authenticated headers (includes Firebase Bearer token)
    const headers = await getApiHeadersAsync({ 'Content-Type': 'application/json' });

    // Save contact info
    const personalResponse = await fetch('/api/user/contact', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        email,
        preferredName,
        timezone: state.contactInfo.timezone || getUserTimezone(),
      }),
    });

    if (!personalResponse.ok) {
      const errorData = await personalResponse.json().catch(() => ({}));
      log.error({ status: personalResponse.status, errorData }, 'Failed to save contact info');
      throw new Error(errorData.error || 'Failed to save contact info');
    }

    // Save quiet hours preferences (only if enabled)
    if (quietHoursEnabled) {
      const prefsResponse = await fetch('/api/user/preferences', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          timezone: state.contactInfo.timezone || getUserTimezone(),
          quietHoursStart,
          quietHoursEnd,
        }),
      });

      if (!prefsResponse.ok) {
        log.warn('Failed to save quiet hours preferences');
      }
    }

    state.contactInfo = { 
      ...state.contactInfo, 
      phone, 
      email, 
      preferredName,
      quietHoursStart,
      quietHoursEnd,
      quietHoursEnabled,
    };
    state.success = quietHoursEnabled 
      ? `Saved! I'll respect your quiet hours (${formatHour(parseInt(quietHoursStart))} - ${formatHour(parseInt(quietHoursEnd))}).`
      : 'Contact info saved! I\'ll use this to stay in touch.';
    log.info({ quietHoursEnabled, quietHoursStart, quietHoursEnd }, 'Contact info and preferences saved');
  } catch (error) {
    state.error = "Something went wrong. Try again?";
    log.error({ error }, 'Failed to save contact info');
  } finally {
    state.isSaving = false;
    render();
  }
}

async function handleSendVerification(): Promise<void> {
  const phoneInput = modalContainer?.querySelector('#phone-input') as HTMLInputElement;
  const phone = phoneInput?.value.trim();

  if (!phone) {
    state.error = 'Please enter a phone number first';
    render();
    return;
  }

  state.isVerifying = true;
  state.pendingPhone = phone;
  state.error = undefined;
  render();

  try {
    const headers = await getApiHeadersAsync({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/outreach/verify-phone', {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      throw new Error('Failed to send verification');
    }

    log.info({ phone }, 'Verification code sent');
  } catch (error) {
    state.error = "Couldn't send verification code. Try again?";
    state.isVerifying = false;
    log.error({ error }, 'Failed to send verification');
  }

  render();
}

async function handleVerifyCode(code: string): Promise<void> {
  try {
    const headers = await getApiHeadersAsync({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/outreach/verify-phone/confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: state.pendingPhone,
        code,
      }),
    });

    if (response.ok) {
      state.contactInfo.phone = state.pendingPhone;
      state.contactInfo.phoneVerified = true;
      state.isVerifying = false;
      state.verificationCode = '';
      state.success = 'Phone verified! You\'re all set.';
      log.info('Phone verified');
    } else {
      state.error = "Invalid code. Try again?";
    }
  } catch (error) {
    state.error = "Verification failed. Try again?";
    log.error({ error }, 'Phone verification failed');
  }

  render();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the contact settings modal
 */
export async function openContactSettings(): Promise<void> {
  if (state.isOpen) return;

  injectStyles();

  // Create modal container
  modalContainer = document.createElement('div');
  modalContainer.className = 'contact-settings-overlay';
  modalContainer.innerHTML = `
    <div class="contact-settings-backdrop"></div>
    <div class="contact-settings-modal" role="dialog" aria-modal="true" aria-labelledby="contact-settings-title">
    </div>
  `;

  document.body.appendChild(modalContainer);

  // Load existing data
  await loadContactInfo();

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  state.isOpen = true;
  log.info('Opened contact settings');
}

/**
 * Close the contact settings modal
 */
export function close(): void {
  if (!state.isOpen || !modalContainer) return;

  modalContainer.classList.remove('open');
  document.removeEventListener('keydown', handleEscape);

  trackedTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
  }, DURATION.NORMAL);

  // Reset state
  state = {
    isOpen: false,
    isLoading: false,
    isSaving: false,
    isVerifying: false,
    verificationCode: '',
    pendingPhone: '',
    contactInfo: {},
  };

  log.info('Closed contact settings');
}

/**
 * Check if contact info is complete
 */
export function hasContactInfo(): boolean {
  return !!(state.contactInfo.phone || state.contactInfo.email);
}

// Export for settings menu
export const contactSettings = {
  open: openContactSettings,
  close,
  hasContactInfo,
};

