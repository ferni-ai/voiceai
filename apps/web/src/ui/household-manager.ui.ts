/**
 * Household Management UI
 *
 * Manage multiple voice-enrolled family members on a shared device.
 * Shows who's in the household, lets you add/remove members, and
 * configure settings like auto-identification.
 *
 * Design: Follows Ferni's warm, Apple-inspired aesthetic with
 * centered floating modal and proper accessibility.
 *
 * @module @ferni/household-manager
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet, apiPost, apiDelete, getApiHeadersAsync } from '../utils/api.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { toast } from './whisper.ui.js';

const log = createLogger('HouseholdManager');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface HouseholdMember {
  userId: string;
  displayName: string;
  role: 'owner' | 'adult' | 'child' | 'guest';
  enrolledAt: string;
  lastSeen?: string;
  preferences?: {
    greeting?: string;
    persona?: string;
    voiceEnrolled?: boolean;
  };
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
  settings: {
    autoIdentify: boolean;
    requireReIdentification: boolean;
    guestMode: boolean;
    childSafeMode: boolean;
  };
}

export interface HouseholdManagerCallbacks {
  onMemberSelect?: (member: HouseholdMember) => void;
  onMemberAdded?: (member: HouseholdMember) => void;
  onMemberRemoved?: (userId: string) => void;
  onSettingsChanged?: (settings: Household['settings']) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ROLE_LABELS: Record<HouseholdMember['role'], string> = {
  owner: 'Owner',
  adult: 'Adult',
  child: 'Child',
  guest: 'Guest',
};

// ============================================================================
// ICONS (Lucide-style SVGs - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  userPlus: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  home: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  // Role icons (Lucide SVGs - no emoji!)
  crown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  baby: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg>`,
  handWave: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

// Map roles to their Lucide icons
const ROLE_ICONS: Record<HouseholdMember['role'], string> = {
  owner: ICONS.crown,
  adult: ICONS.user,
  child: ICONS.baby,
  guest: ICONS.handWave,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let household: Household | null = null;
let callbacks: HouseholdManagerCallbacks = {};
let isLoading = false;
let currentView: 'main' | 'create' | 'confirm-remove' = 'main';
let memberToRemove: HouseholdMember | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .household-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.STANDARD};
  }
  
  .household-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .household-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .household-modal {
    position: relative;
    width: 90%;
    max-width: clamp(336px, 90vw, 480px);
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    transform: scale(0.95);
    transition: transform var(--duration-slow, ${DURATION.SLOW}ms) ${EASING.SPRING};
  }
  
  .household-modal-overlay.visible .household-modal {
    transform: scale(1);
  }
  
  .household-modal__header {
    padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .household-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--persona-primary, var(--color-ferni, #4a6741));
    margin-bottom: var(--space-1, 4px);
  }
  
  .household-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .household-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-top: var(--space-1, 4px);
  }
  
  .household-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #70605a);
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .household-modal__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-modal__content {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    max-height: 50vh;
    overflow-y: auto;
  }
  
  .household-modal__section {
    margin-bottom: var(--space-6, 24px);
  }
  
  .household-modal__section:last-child {
    margin-bottom: 0;
  }
  
  .household-modal__section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-muted, #a89a94);
    margin-bottom: var(--space-3, 12px);
  }
  
  /* Members List */
  .household-members {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }
  
  .household-member {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid transparent;
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .household-member:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.06));
    border-color: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .household-member__avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--persona-primary, var(--color-ferni, #4a6741)) 0%, var(--persona-secondary, var(--color-ferni-dark, #3d5a35)) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }
  
  .household-member__info {
    flex: 1;
    min-width: 0;
  }
  
  .household-member__name {
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .household-member__meta {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
  }
  
  .household-member__role {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-full, 9999px);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
  }
  
  .household-member__role svg {
    width: 12px;
    height: 12px;
    opacity: 0.8;
  }
  
  .household-member__actions {
    display: flex;
    gap: var(--space-2, 8px);
  }
  
  .household-member__btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a89a94);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .household-member__btn:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-member__btn--danger:hover {
    background: var(--color-semantic-error-glow, rgba(181, 69, 58, 0.1));
    color: var(--color-semantic-error, #b5453a);
  }
  
  /* Empty State */
  .household-empty {
    text-align: center;
    padding: var(--space-8, 32px) var(--space-4, 16px);
    color: var(--color-text-secondary, #70605a);
  }
  
  .household-empty__icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-4, 16px);
    color: var(--persona-primary, var(--color-ferni, #4a6741));
    opacity: 0.6;
  }
  
  .household-empty__icon svg {
    width: 100%;
    height: 100%;
  }
  
  .household-empty__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
  }
  
  .household-empty__text {
    font-size: 15px;
    line-height: 1.5;
    margin-bottom: var(--space-5, 20px);
    max-width: min(280px, 100%);
    margin-left: auto;
    margin-right: auto;
  }
  
  /* Create Household Form */
  .household-create-form {
    text-align: center;
    padding: var(--space-4, 16px);
  }
  
  .household-create-form__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
  }
  
  .household-create-form__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-bottom: var(--space-5, 20px);
  }
  
  .household-create-form__input-group {
    margin-bottom: var(--space-4, 16px);
  }
  
  .household-create-form__label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
    margin-bottom: var(--space-2, 8px);
    text-align: left;
  }
  
  .household-create-form__input {
    width: 100%;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border: 1px solid var(--color-border-medium, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-lg, 12px);
    font-size: 16px;
    background: var(--color-background-elevated, #fffdfb);
    color: var(--color-text-primary, #2c2520);
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .household-create-form__input:focus {
    outline: none;
    border-color: var(--persona-primary, var(--color-ferni, #4a6741));
    box-shadow: 0 0 0 3px var(--persona-glow, rgba(74, 103, 65, 0.15));
  }
  
  .household-create-form__input::placeholder {
    color: var(--color-text-muted, #a89a94);
  }
  
  .household-create-form__actions {
    display: flex;
    gap: var(--space-3, 12px);
    margin-top: var(--space-5, 20px);
  }
  
  /* Add Member Form */
  .household-add-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
  }
  
  .household-add-form__row {
    display: flex;
    gap: var(--space-2, 8px);
  }
  
  .household-add-form__input {
    flex: 1;
    padding: var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    font-size: 15px;
    background: var(--color-background-elevated, #fffdfb);
    color: var(--color-text-primary, #2c2520);
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .household-add-form__input:focus {
    outline: none;
    border-color: var(--persona-primary, var(--color-ferni, #4a6741));
    box-shadow: 0 0 0 3px var(--persona-glow, rgba(74, 103, 65, 0.1));
  }
  
  .household-add-form__input::placeholder {
    color: var(--color-text-muted, #a89a94);
  }
  
  .household-add-form__select {
    padding: var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    font-size: 15px;
    background: var(--color-background-elevated, #fffdfb);
    color: var(--color-text-primary, #2c2520);
    min-width: min(100px, 100%);
    cursor: pointer;
  }
  
  .household-add-form__hint {
    font-size: 12px;
    color: var(--color-text-muted, #a89a94);
    margin: 0;
  }
  
  /* Settings */
  .household-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .household-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
  }
  
  .household-setting__info {
    flex: 1;
    padding-right: var(--space-3, 12px);
  }
  
  .household-setting__label {
    font-weight: 500;
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-setting__description {
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
    margin-top: 2px;
  }
  
  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    width: 48px;
    height: 28px;
    flex-shrink: 0;
  }
  
  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .toggle-switch__slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--color-text-muted, #a89a94);
    transition: background-color var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.STANDARD};
    border-radius: 28px;
  }
  
  .toggle-switch__slider:before {
    position: absolute;
    content: "";
    height: 22px;
    width: 22px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: transform var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.SPRING};
    border-radius: 50%;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.1));
  }
  
  .toggle-switch input:checked + .toggle-switch__slider {
    background-color: var(--persona-primary, var(--color-ferni, #4a6741));
  }
  
  .toggle-switch input:checked + .toggle-switch__slider:before {
    transform: translateX(20px);
  }
  
  .toggle-switch input:focus-visible + .toggle-switch__slider {
    box-shadow: 0 0 0 3px var(--persona-glow, rgba(74, 103, 65, 0.2));
  }
  
  /* Confirmation Dialog */
  .household-confirm {
    text-align: center;
    padding: var(--space-4, 16px);
  }
  
  .household-confirm__icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-4, 16px);
    color: var(--color-semantic-error, #b5453a);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .household-confirm__icon svg {
    width: 100%;
    height: 100%;
  }
  
  .household-confirm__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
  }
  
  .household-confirm__message {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-bottom: var(--space-5, 20px);
    line-height: 1.5;
  }
  
  .household-confirm__actions {
    display: flex;
    gap: var(--space-3, 12px);
    justify-content: center;
  }
  
  /* Footer */
  .household-modal__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3, 12px);
  }
  
  /* Buttons */
  .household-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
  }
  
  .household-btn--primary {
    background: var(--persona-primary, var(--color-ferni, #4a6741));
    color: white;
  }
  
  .household-btn--primary:hover {
    background: var(--persona-secondary, var(--color-ferni-dark, #3d5a35));
    transform: translateY(-1px);
  }
  
  .household-btn--primary:active {
    transform: translateY(0);
  }
  
  .household-btn--secondary {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-btn--secondary:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
  }
  
  .household-btn--danger {
    background: var(--color-semantic-error, #b5453a);
    color: white;
  }
  
  .household-btn--danger:hover {
    background: var(--color-semantic-error, #9a3a30);
    filter: brightness(0.9);
    transform: translateY(-1px);
  }
  
  .household-btn--flex {
    flex: 1;
  }
  
  .household-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  
  .household-btn svg {
    width: 18px;
    height: 18px;
  }
  
  /* Loading State */
  .household-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8, 32px);
  }
  
  .household-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-top-color: var(--persona-primary, var(--color-ferni, #4a6741));
    border-radius: 50%;
    animation: household-spin 1s linear infinite;
  }
  
  @keyframes household-spin {
    to { transform: rotate(360deg); }
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .household-modal-overlay,
    .household-modal,
    .household-member,
    .toggle-switch__slider,
    .toggle-switch__slider:before,
    .household-btn,
    .household-add-form__input,
    .household-create-form__input {
      transition: none;
    }
    .household-spinner {
      animation: none;
    }
  }
`;

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchHousehold(): Promise<Household | null> {
  try {
    // Device ID is automatically included in headers via getApiHeaders()
    const response = await apiGet<Household>('/api/voice/household');

    if (response.status === 404) {
      return null;
    }

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data;
  } catch (error) {
    log.error('Failed to fetch household:', error);
    return null;
  }
}

async function createHouseholdApi(name: string): Promise<Household | null> {
  try {
    // Device ID is automatically included in headers via getApiHeaders()
    const response = await apiPost<{ household?: Household }>('/api/voice/household', { name });

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.household || null;
  } catch (error) {
    log.error('Failed to create household:', error);
    return null;
  }
}

interface AddMemberResult {
  member?: HouseholdMember;
  needsVoiceEnrollment?: boolean;
  error?: string;
}

async function addMemberApi(
  memberId: string,
  displayName: string,
  role: HouseholdMember['role']
): Promise<AddMemberResult> {
  try {
    // Device ID is automatically included in headers via getApiHeaders()
    const response = await apiPost<{
      member?: HouseholdMember;
      needsVoiceEnrollment?: boolean;
      error?: string;
    }>('/api/voice/household/members', {
      userId: memberId,
      displayName,
      role,
    });

    if (!response.ok) {
      return {
        error: response.error || 'Failed to add member',
      };
    }

    return {
      member: response.data?.member,
      needsVoiceEnrollment: response.data?.needsVoiceEnrollment,
    };
  } catch (error) {
    log.error('Failed to add member:', error);
    return {
      error: 'Network error - please try again',
    };
  }
}

async function removeMemberApi(memberId: string): Promise<boolean> {
  try {
    // Device ID is automatically included in headers via getApiHeaders()
    const response = await apiDelete(`/api/voice/household/members/${memberId}`);

    return response.ok;
  } catch (error) {
    log.error('Failed to remove member:', error);
    return false;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the household manager.
 * Call once during app startup.
 */
export function initHouseholdManager(): void {
  // Cleanup any existing instance (HMR protection)
  cleanupHouseholdManager();

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.id = 'household-manager-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  log.debug('Household manager initialized');
}

/**
 * Cleanup the household manager.
 */
export function cleanupHouseholdManager(): void {
  document.getElementById('household-manager-styles')?.remove();
  document.querySelector('.household-modal-overlay')?.remove();
  modal = null;
  household = null;
  currentView = 'main';
  memberToRemove = null;
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * Show the household manager modal.
 */
export async function showHouseholdManager(options?: HouseholdManagerCallbacks): Promise<void> {
  callbacks = options || {};
  currentView = 'main';

  // Create modal if it doesn't exist
  if (!modal) {
    createModal();
  }

  // Show modal with animation
  requestAnimationFrame(() => {
    modal?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  });

  // Load data
  await loadHousehold();
}

/**
 * Hide the household manager modal.
 */
export function hideHouseholdManager(): void {
  modal?.classList.remove('visible');
  document.body.style.overflow = '';

  // Reset state after animation
  trackedTimeout(() => {
    currentView = 'main';
    memberToRemove = null;
  }, DURATION.SLOW);
}

function createModal(): void {
  modal = document.createElement('div');
  modal.className = 'household-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'household-title');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="household-modal-backdrop"></div>
    <div class="household-modal">
      <header class="household-modal__header">
        <p class="household-modal__eyebrow">Your People</p>
        <h2 id="household-title" class="household-modal__title">Your Household</h2>
        <p class="household-modal__subtitle">Everyone who talks to me here</p>
        <button class="household-modal__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="household-modal__content" id="household-content">
        <div class="household-loading">
          <div class="household-spinner"></div>
        </div>
      </div>
      <footer class="household-modal__footer">
        <button aria-label="${t('accessibility.done')}" class="household-btn household-btn--secondary" data-action="close">Done</button>
      </footer>
    </div>
  `;

  // Event listeners
  modal.querySelector('.household-modal-backdrop')?.addEventListener('click', hideHouseholdManager);
  modal.querySelector('.household-modal__close')?.addEventListener('click', hideHouseholdManager);
  modal.querySelector('[data-action="close"]')?.addEventListener('click', hideHouseholdManager);

  // Keyboard close
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideHouseholdManager();
  });

  document.body.appendChild(modal);
}

// ============================================================================
// RENDERING
// ============================================================================

async function loadHousehold(): Promise<void> {
  isLoading = true;
  renderContent();

  household = await fetchHousehold();

  isLoading = false;
  renderContent();
}

function renderContent(): void {
  const content = document.getElementById('household-content');
  if (!content) return;

  if (isLoading) {
    content.innerHTML = `
      <div class="household-loading">
        <div class="household-spinner"></div>
      </div>
    `;
    return;
  }

  // Route to appropriate view
  switch (currentView) {
    case 'create':
      renderCreateForm(content);
      break;
    case 'confirm-remove':
      renderConfirmRemove(content);
      break;
    default:
      renderMainView(content);
  }
}

function renderMainView(content: HTMLElement): void {
  if (!household) {
    content.innerHTML = `
      <div class="household-empty">
        <div class="household-empty__icon">${ICONS.users}</div>
        <h3 class="household-empty__title">No household yet</h3>
        <p class="household-empty__text">
          When you share this device with family, I can recognize each person's voice and remember everyone individually.
        </p>
        <button aria-label="${t('accessibility.createHousehold')}" class="household-btn household-btn--primary" data-action="show-create">
          ${ICONS.home}
          <span>Create Household</span>
        </button>
      </div>
    `;

    content.querySelector('[data-action="show-create"]')?.addEventListener('click', () => {
      currentView = 'create';
      renderContent();
    });
    return;
  }

  const membersHTML =
    household.members.length > 0
      ? household.members.map((member) => renderMember(member)).join('')
      : `<p class="household-add-form__hint" style="text-align: center; padding: var(--space-4);">
          No one enrolled yet. Add your first family member below!
        </p>`;

  content.innerHTML = `
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">Family Members</h3>
      <div class="household-members">
        ${membersHTML}
      </div>
    </section>
    
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">Add Someone</h3>
      <div class="household-add-form">
        <div class="household-add-form__row">
          <input 
            type="text" 
            class="household-add-form__input" 
            id="member-name" 
            placeholder="${t('placeholders.memberName')}"
            autocomplete="off"
          />
          <select class="household-add-form__select" id="member-role">
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="guest">Guest</option>
          </select>
        </div>
        <button aria-label="${t('accessibility.addToHousehold')}" class="household-btn household-btn--primary" data-action="add-member" style="width: 100%;">
          Add to Household
        </button>
        <p class="household-add-form__hint">
          They'll need to complete voice enrollment so I can recognize them.
        </p>
      </div>
    </section>
    
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">How This Works</h3>
      <div class="household-settings">
        ${renderSetting(
          'autoIdentify',
          'Recognize voices automatically',
          "I'll know who's talking as soon as you start"
        )}
        ${renderSetting('guestMode', 'Welcome guests', 'Let me chat with voices I don\'t recognize')}
        ${renderSetting(
          'childSafeMode',
          'Kid-friendly mode',
          'Extra care when talking with the little ones'
        )}
      </div>
    </section>
  `;

  // Attach event listeners
  content.querySelectorAll('[data-action="remove-member"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const userId = (e.currentTarget as HTMLElement).dataset.userId;
      const member = household?.members.find((m) => m.userId === userId);
      if (member) {
        memberToRemove = member;
        currentView = 'confirm-remove';
        renderContent();
      }
    });
  });

  content.querySelector('[data-action="add-member"]')?.addEventListener('click', handleAddMember);

  // Handle enter key in input
  content.querySelector('#member-name')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      void handleAddMember();
    }
  });

  content.querySelectorAll('.toggle-switch input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const setting = (e.target as HTMLInputElement).dataset.setting as keyof Household['settings'];
      const value = (e.target as HTMLInputElement).checked;
      void handleSettingChange(setting, value);
    });
  });
}

function renderCreateForm(content: HTMLElement): void {
  content.innerHTML = `
    <div class="household-create-form">
      <h3 class="household-create-form__title">Name your household</h3>
      <p class="household-create-form__subtitle">
        This helps me keep everyone's conversations and memories separate.
      </p>
      <div class="household-create-form__input-group">
        <label class="household-create-form__label" for="household-name">Household name</label>
        <input 
          type="text" 
          class="household-create-form__input" 
          id="household-name" 
          placeholder="${t('placeholders.householdName')}"
          autocomplete="off"
          autofocus
        />
      </div>
      <div class="household-create-form__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.maybeLater')}" class="household-btn household-btn--secondary household-btn--flex" data-action="cancel-create">
          Maybe later
        </button>
        <button aria-label="${t('accessibility.create')}" class="household-btn household-btn--primary household-btn--flex" data-action="confirm-create">
          Create
        </button>
      </div>
    </div>
  `;

  // Focus the input
  trackedTimeout(() => {
    (document.getElementById('household-name') as HTMLInputElement)?.focus();
  }, DURATION.FAST);

  // Event listeners
  content.querySelector('[data-action="cancel-create"]')?.addEventListener('click', () => {
    currentView = 'main';
    renderContent();
  });

  content.querySelector('[data-action="confirm-create"]')?.addEventListener('click', handleCreateHousehold);

  // Handle enter key
  content.querySelector('#household-name')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      void handleCreateHousehold();
    }
  });
}

function renderConfirmRemove(content: HTMLElement): void {
  if (!memberToRemove) {
    currentView = 'main';
    renderContent();
    return;
  }

  content.innerHTML = `
    <div class="household-confirm">
      <div class="household-confirm__icon">${ICONS.alertCircle}</div>
      <h3 class="household-confirm__title">Remove ${memberToRemove.displayName}?</h3>
      <p class="household-confirm__message">
        I'll forget ${memberToRemove.displayName}'s voice, but their conversation history will stay safe. 
        They can always re-enroll later if needed.
      </p>
      <div class="household-confirm__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.keepThem')}" class="household-btn household-btn--secondary household-btn--flex" data-action="cancel-remove">
          Keep them
        </button>
        <button aria-label="${t('accessibility.remove')}" class="household-btn household-btn--danger household-btn--flex" data-action="confirm-remove">
          Remove
        </button>
      </div>
    </div>
  `;

  content.querySelector('[data-action="cancel-remove"]')?.addEventListener('click', () => {
    memberToRemove = null;
    currentView = 'main';
    renderContent();
  });

  content.querySelector('[data-action="confirm-remove"]')?.addEventListener('click', async () => {
    if (memberToRemove) {
      await handleRemoveMember(memberToRemove.userId);
    }
  });
}

function renderMember(member: HouseholdMember): string {
  const initial = member.displayName.charAt(0).toUpperCase();
  const lastSeenText = member.lastSeen
    ? `Last here ${formatRelativeTime(new Date(member.lastSeen))}`
    : 'Not enrolled yet';
  const isOwner = member.role === 'owner';

  return `
    <div class="household-member">
      <div class="household-member__avatar">${initial}</div>
      <div class="household-member__info">
        <div class="household-member__name">${escapeHtml(member.displayName)}</div>
        <div class="household-member__meta">
          <span class="household-member__role">
            ${ROLE_ICONS[member.role]} ${ROLE_LABELS[member.role]}
          </span>
          <span>•</span>
          <span>${lastSeenText}</span>
        </div>
      </div>
      <div class="household-member__actions" role="button" tabindex="0">
        ${
          !isOwner
            ? `
          <button 
            class="household-member__btn household-member__btn--danger" 
            data-action="remove-member"
            data-user-id="${member.userId}"
            aria-label="Remove ${escapeHtml(member.displayName)}"
            title="Remove from household"
          >
            ${ICONS.trash}
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

function renderSetting(key: keyof Household['settings'], label: string, description: string): string {
  const checked = household?.settings[key] ?? false;

  return `
    <div class="household-setting">
      <div class="household-setting__info">
        <div class="household-setting__label">${label}</div>
        <div class="household-setting__description">${description}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''} />
        <span class="toggle-switch__slider" role="button" tabindex="0"></span>
      </label>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleCreateHousehold(): Promise<void> {
  const nameInput = document.getElementById('household-name') as HTMLInputElement;
  const name = nameInput?.value.trim();

  if (!name) {
    nameInput?.focus();
    toast.warning(t('toasts.addANameFirst'));
    return;
  }

  isLoading = true;
  renderContent();

  household = await createHouseholdApi(name);

  isLoading = false;
  currentView = 'main';
  renderContent();

  if (household) {
    log.info('Household created:', household.name);
    toast.success(t('toasts.householdnameCreated'));
  } else {
    toast.error("Couldn't create that. Try again?");
  }
}

async function handleAddMember(): Promise<void> {
  const nameInput = document.getElementById('member-name') as HTMLInputElement;
  const roleSelect = document.getElementById('member-role') as HTMLSelectElement;

  const displayName = nameInput?.value.trim();
  const role = roleSelect?.value as HouseholdMember['role'];

  if (!displayName) {
    nameInput?.focus();
    toast.warning(t('toasts.addANameFirst'));
    return;
  }

  // Disable button during add
  const addBtn = document.querySelector('[data-action="add-member"]') as HTMLButtonElement;
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.textContent = t('common.adding');
  }

  // Generate a unique user ID for the new member
  const userId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const result = await addMemberApi(userId, displayName, role);

  if (result.member && household) {
    household.members.push(result.member);
    renderContent();
    callbacks.onMemberAdded?.(result.member);
    log.info('Member added:', displayName);

    // Show success toast
    if (result.needsVoiceEnrollment) {
      toast.success(t('toasts.displaynameAddedVoiceEnrollmentNeeded'));
    } else {
      toast.success(t('toasts.displaynameAdded'));
    }
  } else {
    // Show error toast
    toast.error(result.error || "Couldn't add them. Try again?");
    log.warn('Failed to add member:', result.error);
  }

  // Re-enable button
  if (addBtn) {
    addBtn.disabled = false;
    addBtn.textContent = t('household.addToHousehold');
  }
}

async function handleRemoveMember(userId: string): Promise<void> {
  const memberName = memberToRemove?.displayName || 'Member';
  const success = await removeMemberApi(userId);

  if (success && household) {
    household.members = household.members.filter((m) => m.userId !== userId);
    callbacks.onMemberRemoved?.(userId);
    log.info('Member removed:', userId);
    toast.success(t('toasts.membernameRemoved'));
  } else {
    toast.error("Couldn't remove them. Try again?");
  }

  memberToRemove = null;
  currentView = 'main';
  renderContent();
}

async function handleSettingChange(setting: keyof Household['settings'], value: boolean): Promise<void> {
  if (!household) return;

  household.settings[setting] = value;
  callbacks.onSettingsChanged?.(household.settings);
  log.debug('Setting changed:', setting, value);

  // Persist to backend via PATCH /api/household/:userId/settings
  try {
    const userId = localStorage.getItem('ferni_user_id');
    if (!userId) {
      log.debug('No userId - settings saved locally only');
      return;
    }

    // Map frontend settings to backend format
    const backendSettings = {
      voiceIdentification: household.settings.autoIdentify,
      // Other settings can be added here as needed
    };

    const headers = await getApiHeadersAsync();
    const response = await fetch(`/api/household/${userId}/settings`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendSettings),
    });

    if (!response.ok) {
      log.warn('Failed to persist setting:', { setting, status: response.status });
      // Settings are already applied locally - continue silently
    }
  } catch (err) {
    log.warn('Error persisting setting:', err);
    // Settings already applied locally - continue silently
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const householdManager = {
  init: initHouseholdManager,
  cleanup: cleanupHouseholdManager,
  show: showHouseholdManager,
  hide: hideHouseholdManager,
};

export default householdManager;
