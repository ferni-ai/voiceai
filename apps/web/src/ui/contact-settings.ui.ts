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
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('ContactSettingsUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

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
      z-index: var(--z-tooltip);
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
      background: var(--color-utility-backdrop, rgba(44, 37, 32, 0.75));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
    }

    .contact-settings-modal {
      position: relative;
      width: 90%;
      max-width: clamp(308px, 90vw, 440px);
      max-height: 90vh;
      overflow-y: auto;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: 16px;
      box-shadow: var(--shadow-xl, 0 16px 48px rgba(44, 37, 32, 0.2));
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .contact-settings-overlay.open .contact-settings-modal {
      transform: scale(1) translateY(0);
    }

    .contact-settings-header {
      padding: 1.5rem;
      text-align: center;
      border-bottom: 1px solid rgba(44, 37, 32, 0.1);
    }

    .contact-settings-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 0.75rem;
      padding: 12px;
      background: linear-gradient(135deg, var(--color-ferni, #4a6741), var(--color-ferni-dark, #3d5a35));
      border-radius: 50%;
      color: white;
    }

    .contact-settings-icon svg {
      width: 24px;
      height: 24px;
    }

    .contact-settings-eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(44, 37, 32, 0.6);
      margin-bottom: 0.25rem;
    }

    .contact-settings-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-natural-ink, #2C2520);
      margin: 0 0 0.5rem;
    }

    .contact-settings-subtitle {
      font-size: 0.875rem;
      color: rgba(44, 37, 32, 0.7);
      line-height: 1.5;
      margin: 0;
    }

    .contact-settings-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 32px;
      height: 32px;
      padding: 0.5rem;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: var(--color-text-muted, #9B8B7F);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .contact-settings-close:hover {
      background: rgba(44, 37, 32, 0.1);
    }

    .contact-settings-close svg {
      width: 20px;
      height: 20px;
    }

    .contact-settings-content {
      padding: 1.5rem;
    }

    .contact-settings-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .contact-settings-field {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .contact-settings-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: rgba(44, 37, 32, 0.8);
    }

    .contact-settings-label svg {
      width: 18px;
      height: 18px;
      color: rgba(44, 37, 32, 0.5);
    }

    .contact-settings-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .contact-settings-input {
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      font-family: inherit;
      border: 2px solid rgba(44, 37, 32, 0.2);
      border-radius: 8px;
      background: var(--color-bg-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      transition: all ${DURATION.FAST}ms;
    }

    .contact-settings-input:focus {
      outline: none;
      border-color: var(--color-ferni, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.2);
    }

    .contact-settings-input::placeholder {
      color: rgba(44, 37, 32, 0.4);
    }

    .contact-settings-verified {
      position: absolute;
      right: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      background: rgba(74, 103, 65, 0.1);
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-ferni, #4a6741);
    }

    .contact-settings-verified svg {
      width: 12px;
      height: 12px;
    }

    .contact-settings-verify-btn {
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      background: transparent;
      border: 2px solid var(--color-ferni, #4a6741);
      border-radius: 8px;
      color: var(--color-ferni, #4a6741);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .contact-settings-verify-btn:hover {
      background: rgba(74, 103, 65, 0.1);
    }

    .contact-settings-verify-btn:focus {
      outline: 3px solid rgba(74, 103, 65, 0.5);
      outline-offset: 2px;
    }

    .contact-settings-verify-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .contact-settings-verification {
      margin-top: 0.75rem;
      padding: 1rem;
      background: rgba(74, 103, 65, 0.05);
      border-radius: 8px;
      border: 1px solid rgba(74, 103, 65, 0.15);
    }

    .contact-settings-verification-text {
      font-size: 0.875rem;
      color: rgba(44, 37, 32, 0.7);
      margin: 0 0 0.75rem;
    }

    .contact-settings-code-input {
      width: 100%;
      padding: 0.75rem 1rem;
      font-family: var(--font-mono, monospace);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: 0.3em;
      text-align: center;
      border: 2px solid rgba(44, 37, 32, 0.2);
      border-radius: 8px;
      background: var(--color-bg-elevated, #FFFDFB);
    }

    .contact-settings-code-input:focus {
      outline: none;
      border-color: var(--color-ferni, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.2);
    }

    .contact-settings-privacy {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: rgba(44, 37, 32, 0.03);
      border-radius: 8px;
      margin-top: 0.5rem;
    }

    .contact-settings-privacy-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      color: rgba(44, 37, 32, 0.5);
      margin-top: 1px;
    }

    .contact-settings-privacy-text {
      font-size: 0.75rem;
      color: rgba(44, 37, 32, 0.6);
      line-height: 1.5;
      margin: 0;
    }

    .contact-settings-actions {
      display: flex;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      background: var(--color-warm-white, #FAF8F5);
      border-radius: 0 0 16px 16px;
    }

    .contact-settings-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.75rem 1.5rem;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .contact-settings-btn:focus {
      outline: 3px solid rgba(74, 103, 65, 0.5);
      outline-offset: 2px;
    }

    .contact-settings-btn:active {
      transform: scale(0.98);
    }

    .contact-settings-btn--secondary {
      background: transparent;
      border: 2px solid var(--color-ferni, #4a6741);
      color: var(--color-ferni, #4a6741);
    }

    .contact-settings-btn--secondary:hover {
      background: rgba(74, 103, 65, 0.1);
    }

    .contact-settings-btn--primary {
      background: var(--color-ferni, #4a6741);
      border: none;
      color: white;
    }

    .contact-settings-btn--primary:hover {
      background: var(--color-ferni-dark, #3d5a35);
      transform: translateY(-1px);
    }

    .contact-settings-btn--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .contact-settings-error {
      padding: 0.75rem 1rem;
      background: rgba(180, 60, 60, 0.1);
      border-left: 4px solid var(--color-error, #b43c3c);
      border-radius: 8px;
      color: var(--color-error, #b43c3c);
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .contact-settings-success {
      padding: 0.75rem 1rem;
      background: rgba(74, 103, 65, 0.1);
      border-left: 4px solid var(--color-ferni, #4a6741);
      border-radius: 8px;
      color: var(--color-ferni, #4a6741);
      font-size: 0.875rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .contact-settings-success svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    /* Quiet Hours Section */
    .contact-settings-section {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid rgba(44, 37, 32, 0.1);
    }

    .contact-settings-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .contact-settings-section-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-natural-ink, #2C2520);
    }

    .contact-settings-section-title svg {
      width: 18px;
      height: 18px;
      color: rgba(44, 37, 32, 0.6);
    }

    .contact-settings-toggle {
      position: relative;
      width: 48px;
      height: 28px;
      background: rgba(44, 37, 32, 0.2);
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .contact-settings-toggle.active {
      background: var(--color-ferni, #4a6741);
    }

    .contact-settings-toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 22px;
      height: 22px;
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .contact-settings-toggle.active .contact-settings-toggle-knob {
      transform: translateX(20px);
    }

    .contact-settings-time-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.75rem;
      opacity: 0.5;
      pointer-events: none;
      transition: opacity 0.2s;
    }

    .contact-settings-time-row.enabled {
      opacity: 1;
      pointer-events: auto;
    }

    .contact-settings-time-label {
      font-size: 0.875rem;
      color: rgba(44, 37, 32, 0.7);
      white-space: nowrap;
    }

    .contact-settings-time-select {
      flex: 1;
      padding: 0.75rem 2.5rem 0.75rem 1rem;
      font-family: inherit;
      font-size: 1rem;
      border: 2px solid rgba(44, 37, 32, 0.2);
      border-radius: 8px;
      background: var(--color-bg-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      cursor: pointer;
      appearance: none;
      transition: all 0.2s;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%232C2520' opacity='0.5' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
    }

    .contact-settings-time-select:focus {
      outline: none;
      border-color: var(--color-ferni, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.2);
    }

    .contact-settings-quiet-note {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: rgba(44, 37, 32, 0.6);
      line-height: 1.5;
    }

    .contact-settings-timezone {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: rgba(44, 37, 32, 0.03);
      border-radius: 8px;
      font-size: 0.75rem;
      color: rgba(44, 37, 32, 0.6);
    }

    .contact-settings-timezone svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
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
      <p class="contact-settings-eyebrow">${t('contactSettings.eyebrow', 'Stay Connected')}</p>
      <h2 class="contact-settings-title">${t('contactSettings.title', 'How can I reach you?')}</h2>
      <p class="contact-settings-subtitle">
        ${t('contactSettings.subtitle', "Share your contact info so I can check in, celebrate wins, and be there when you need me.")}
      </p>
    </div>
    
    <div class="contact-settings-content">
      ${state.error ? `<div class="contact-settings-error">${state.error}</div>` : ''}
      ${state.success ? `<div class="contact-settings-success">${ICONS.check} ${state.success}</div>` : ''}
      
      <form class="contact-settings-form" id="contact-form">
        <div class="contact-settings-field">
          <label class="contact-settings-label">
            ${ICONS.phone}
            ${t('contactSettings.phoneLabel', 'Text or call me')}
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
                ${ICONS.check} ${t('contactSettings.verified', 'Verified')}
              </span>
            ` : ''}
          </div>
          ${!state.contactInfo.phoneVerified && state.contactInfo.phone ? `
            <button aria-label="${t('accessibility.verifyPhone', 'Verify phone number')}" type="button" class="contact-settings-verify-btn" id="verify-phone-btn" ${state.isVerifying ? 'disabled' : ''}>
              ${state.isVerifying ? t('contactSettings.sendingCode', 'Sending code...') : t('contactSettings.sendCode', 'Send me a code')}
            </button>
          ` : ''}
          ${state.isVerifying ? `
            <div class="contact-settings-verification">
              <p class="contact-settings-verification-text">
                ${t('contactSettings.codeSent', 'I sent a 6-digit code to')} ${state.pendingPhone}
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
            ${t('contactSettings.emailLabel', 'Send me updates')}
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
                ${ICONS.check} ${t('contactSettings.verified', 'Verified')}
              </span>
            ` : ''}
          </div>
        </div>
        
        <div class="contact-settings-field">
          <label class="contact-settings-label">
            ${t('contactSettings.nameLabel', 'What should I call you?')}
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
            ${t('contactSettings.privacyNote', "I'll only use this for check-ins. Never spam, never shared.")}
          </p>
        </div>

        <!-- Quiet Hours Section -->
        <div class="contact-settings-section">
          <div class="contact-settings-section-header">
            <div class="contact-settings-section-title">
              ${ICONS.moon}
              ${t('contactSettings.quietHours', 'Quiet Hours')}
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
            <span class="contact-settings-time-label">${t('contactSettings.dontCall', "Don't call")}</span>
            <select class="contact-settings-time-select" id="quiet-start" aria-label="${t('accessibility.quietHoursStart', 'Quiet hours start time')}">
              ${generateTimeOptions(state.contactInfo.quietHoursStart || '22:00')}
            </select>
            <span class="contact-settings-time-label">${t('contactSettings.until', 'until')}</span>
            <select class="contact-settings-time-select" id="quiet-end" aria-label="${t('accessibility.quietHoursEnd', 'Quiet hours end time')}">
              ${generateTimeOptions(state.contactInfo.quietHoursEnd || '08:00')}
            </select>
          </div>
          
          <p class="contact-settings-quiet-note">
            ${t('contactSettings.quietNote', "I'll stay quiet during these hours. If something feels urgent, I might still reach out.")}
          </p>
          
          ${state.contactInfo.timezone ? `
            <div class="contact-settings-timezone">
              ${ICONS.globe}
              <span>${t('contactSettings.detectedTimezone', 'Your timezone')}: ${formatTimezone(state.contactInfo.timezone)}</span>
            </div>
          ` : ''}
        </div>
      </form>
    </div>
    
    <div class="contact-settings-actions">
      <button aria-label="${t('accessibility.maybeLater')}" class="contact-settings-btn contact-settings-btn--secondary" id="cancel-btn">
        ${t('common.maybeLater', 'Later')}
      </button>
      <button aria-label="${t('accessibility.save')}" class="contact-settings-btn contact-settings-btn--primary" id="save-btn" ${state.isSaving ? 'disabled' : ''}>
        ${state.isSaving ? t('common.saving') : t('common.save', 'Save')}
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
    // Load contact info
    const response = await apiGet<{
      success?: boolean;
      context?: {
        personal?: {
          phone?: string;
          email?: string;
          preferredName?: string;
          phoneVerified?: boolean;
          emailVerified?: boolean;
        };
      };
    }>('/api/outreach/context');

    if (response.ok && response.data?.success && response.data.context?.personal) {
      state.contactInfo = {
        phone: response.data.context.personal.phone,
        email: response.data.context.personal.email,
        preferredName: response.data.context.personal.preferredName,
        phoneVerified: response.data.context.personal.phoneVerified,
        emailVerified: response.data.context.personal.emailVerified,
      };
    }

    // Load user preferences (timezone, quiet hours)
    try {
      const prefsResponse = await apiGet<{
        success?: boolean;
        preferences?: {
          timezone?: string;
          quietHoursStart?: string;
          quietHoursEnd?: string;
        };
      }>('/api/user/preferences');

      if (prefsResponse.ok && prefsResponse.data?.success && prefsResponse.data.preferences) {
        state.contactInfo.timezone = prefsResponse.data.preferences.timezone;
        state.contactInfo.quietHoursStart = prefsResponse.data.preferences.quietHoursStart;
        state.contactInfo.quietHoursEnd = prefsResponse.data.preferences.quietHoursEnd;
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
    // Save contact info
    const personalResponse = await apiPost<{ error?: string }>('/api/user/contact', {
      phone,
      email,
      preferredName,
      timezone: state.contactInfo.timezone || getUserTimezone(),
    });

    if (!personalResponse.ok) {
      log.error({ status: personalResponse.status, error: personalResponse.error }, 'Failed to save contact info');
      throw new Error(personalResponse.error || 'Failed to save contact info');
    }

    // Save quiet hours preferences (only if enabled)
    if (quietHoursEnabled) {
      const prefsResponse = await apiPost('/api/user/preferences', {
        timezone: state.contactInfo.timezone || getUserTimezone(),
        quietHoursStart,
        quietHoursEnd,
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
      ? t('contactSettings.successWithQuiet', `Saved! I'll stay quiet ${formatHour(parseInt(quietHoursStart))} - ${formatHour(parseInt(quietHoursEnd))}.`)
      : t('contactSettings.success', "Saved! I'll use this to stay in touch.");
    log.info({ quietHoursEnabled, quietHoursStart, quietHoursEnd }, 'Contact info and preferences saved');
  } catch (error) {
    state.error = t('contactSettings.errorSave', "Couldn't save that. Try again?");
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
    state.error = t('contactSettings.errorNoPhone', 'Add a phone number first');
    render();
    return;
  }

  state.isVerifying = true;
  state.pendingPhone = phone;
  state.error = undefined;
  render();

  try {
    const response = await apiPost('/api/outreach/verify-phone', { phone });

    if (!response.ok) {
      throw new Error('Failed to send verification');
    }

    log.info({ phone }, 'Verification code sent');
  } catch (error) {
    state.error = t('contactSettings.errorSendCode', "Couldn't send the code. Try again?");
    state.isVerifying = false;
    log.error({ error }, 'Failed to send verification');
  }

  render();
}

async function handleVerifyCode(code: string): Promise<void> {
  try {
    const response = await apiPost('/api/outreach/verify-phone/confirm', {
      phone: state.pendingPhone,
      code,
    });

    if (response.ok) {
      state.contactInfo.phone = state.pendingPhone;
      state.contactInfo.phoneVerified = true;
      state.isVerifying = false;
      state.verificationCode = '';
      state.success = t('contactSettings.phoneVerified', "Got it! I'll know your number now.");
      log.info('Phone verified');
    } else {
      state.error = t('contactSettings.errorInvalidCode', "That code didn't work. Try again?");
    }
  } catch (error) {
    state.error = t('contactSettings.errorVerifyFailed', "Couldn't verify. Want another code?");
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

