/**
 * Household Management UI
 *
 * Manage multiple voice-enrolled family members on a shared device.
 * Shows who's in the household, lets you add/remove members, and
 * configure settings like auto-identification.
 *
 * Design: Follows Ferni's warm, Apple-inspired aesthetic with
 * centered floating modal and proper accessibility.
 */

import { createLogger } from '../utils/logger.js';
import { getDeviceId } from '../state/app.state.js';

const log = createLogger('HouseholdManager');

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

const ROLE_ICONS: Record<HouseholdMember['role'], string> = {
  owner: '👑',
  adult: '👤',
  child: '🧒',
  guest: '👋',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let household: Household | null = null;
let callbacks: HouseholdManagerCallbacks = {};
let isLoading = false;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .household-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .household-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .household-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.4);
    backdrop-filter: blur(20px);
  }
  
  .household-modal {
    position: relative;
    width: 90%;
    max-width: 480px;
    max-height: 85vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
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
    color: var(--color-ferni, #4a6741);
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
    transition: all var(--duration-fast, 100ms) ease;
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
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .household-member:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.06));
    border-color: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .household-member__avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-ferni, #4a6741) 0%, var(--color-ferni-dark, #3d5a35) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
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
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .household-member__btn:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-member__btn--danger:hover {
    background: rgba(220, 53, 69, 0.1);
    color: #dc3545;
  }
  
  /* Empty State */
  .household-empty {
    text-align: center;
    padding: var(--space-8, 32px) var(--space-4, 16px);
    color: var(--color-text-secondary, #70605a);
  }
  
  .household-empty__icon {
    font-size: 48px;
    margin-bottom: var(--space-3, 12px);
    opacity: 0.5;
  }
  
  .household-empty__text {
    font-size: 15px;
    margin-bottom: var(--space-4, 16px);
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
  }
  
  .household-add-form__input:focus {
    outline: none;
    border-color: var(--color-ferni, #4a6741);
    box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
  }
  
  .household-add-form__select {
    padding: var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    font-size: 15px;
    background: var(--color-background-elevated, #fffdfb);
    color: var(--color-text-primary, #2c2520);
    min-width: 100px;
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
    transition: var(--duration-normal, 200ms);
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
    transition: var(--duration-normal, 200ms);
    border-radius: 50%;
    box-shadow: var(--shadow-sm);
  }
  
  .toggle-switch input:checked + .toggle-switch__slider {
    background-color: var(--color-ferni, #4a6741);
  }
  
  .toggle-switch input:checked + .toggle-switch__slider:before {
    transform: translateX(20px);
  }
  
  /* Footer */
  .household-modal__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3, 12px);
  }
  
  .household-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    border: none;
  }
  
  .household-btn--primary {
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  .household-btn--primary:hover {
    background: var(--color-ferni-dark, #3d5a35);
    transform: translateY(-1px);
  }
  
  .household-btn--secondary {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    color: var(--color-text-primary, #2c2520);
  }
  
  .household-btn--secondary:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
  }
  
  .household-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
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
    border-top-color: var(--color-ferni, #4a6741);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  @media (prefers-reduced-motion: reduce) {
    .household-modal-overlay,
    .household-modal,
    .toggle-switch__slider,
    .toggle-switch__slider:before,
    .household-btn {
      transition: none;
    }
    .household-spinner {
      animation: none;
    }
  }
`;

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  userPlus: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchHousehold(): Promise<Household | null> {
  try {
    const deviceId = getDeviceId();
    const response = await fetch('/api/voice/household', {
      headers: {
        'X-Device-ID': deviceId,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log.error('Failed to fetch household:', error);
    return null;
  }
}

async function createHouseholdApi(name: string): Promise<Household | null> {
  try {
    const deviceId = getDeviceId();
    const userId = localStorage.getItem('ferni_user_id') || `user_${Date.now()}`;

    const response = await fetch('/api/voice/household', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
        'X-User-ID': userId,
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.household;
  } catch (error) {
    log.error('Failed to create household:', error);
    return null;
  }
}

async function addMemberApi(
  userId: string,
  displayName: string,
  role: HouseholdMember['role']
): Promise<HouseholdMember | null> {
  try {
    const deviceId = getDeviceId();

    const response = await fetch('/api/voice/household/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
      },
      body: JSON.stringify({ userId, displayName, role }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.member;
  } catch (error) {
    log.error('Failed to add member:', error);
    return null;
  }
}

async function removeMemberApi(userId: string): Promise<boolean> {
  try {
    const deviceId = getDeviceId();

    const response = await fetch(`/api/voice/household/members/${userId}`, {
      method: 'DELETE',
      headers: {
        'X-Device-ID': deviceId,
      },
    });

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
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * Show the household manager modal.
 */
export async function showHouseholdManager(options?: HouseholdManagerCallbacks): Promise<void> {
  callbacks = options || {};

  // Create modal if it doesn't exist
  if (!modal) {
    createModal();
  }

  // Show modal
  modal?.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // Load data
  await loadHousehold();
}

/**
 * Hide the household manager modal.
 */
export function hideHouseholdManager(): void {
  modal?.classList.remove('visible');
  document.body.style.overflow = '';
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
        <p class="household-modal__eyebrow">Voice Settings</p>
        <h2 id="household-title" class="household-modal__title">Your Household</h2>
        <p class="household-modal__subtitle">Manage family members who use Ferni on this device</p>
        <button class="household-modal__close" aria-label="Close">${ICONS.close}</button>
      </header>
      <div class="household-modal__content" id="household-content">
        <div class="household-loading">
          <div class="household-spinner"></div>
        </div>
      </div>
      <footer class="household-modal__footer">
        <button class="household-btn household-btn--secondary" data-action="close">Done</button>
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

  if (!household) {
    content.innerHTML = `
      <div class="household-empty">
        <div class="household-empty__icon">${ICONS.users}</div>
        <p class="household-empty__text">
          No household set up yet.<br>
          Create one to let multiple family members use Ferni.
        </p>
        <button class="household-btn household-btn--primary" data-action="create-household">
          ${ICONS.userPlus} Create Household
        </button>
      </div>
    `;

    content
      .querySelector('[data-action="create-household"]')
      ?.addEventListener('click', handleCreateHousehold);
    return;
  }

  const membersHTML =
    household.members.length > 0
      ? household.members.map((member) => renderMember(member)).join('')
      : `<p style="text-align: center; color: var(--color-text-secondary); padding: var(--space-4);">
        No members enrolled yet. Add someone to get started!
      </p>`;

  content.innerHTML = `
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">Family Members (${household.members.length})</h3>
      <div class="household-members">
        ${membersHTML}
      </div>
    </section>
    
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">Add Member</h3>
      <div class="household-add-form">
        <div class="household-add-form__row">
          <input 
            type="text" 
            class="household-add-form__input" 
            id="member-name" 
            placeholder="Name (e.g., Sarah)"
          />
          <select class="household-add-form__select" id="member-role">
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="guest">Guest</option>
          </select>
        </div>
        <button class="household-btn household-btn--primary" data-action="add-member" style="width: 100%;">
          Add to Household
        </button>
        <p style="font-size: 12px; color: var(--color-text-muted); margin: 0;">
          Note: Members need to complete voice enrollment to be recognized.
        </p>
      </div>
    </section>
    
    <section class="household-modal__section">
      <h3 class="household-modal__section-title">Settings</h3>
      <div class="household-settings">
        ${renderSetting(
          'autoIdentify',
          'Auto-Identify Speaker',
          "Automatically detect who's speaking when conversation starts"
        )}
        ${renderSetting('guestMode', 'Guest Mode', 'Allow unrecognized voices to use Ferni')}
        ${renderSetting(
          'childSafeMode',
          'Child Safe Mode',
          'Enable parental controls for child accounts'
        )}
      </div>
    </section>
  `;

  // Attach event listeners
  content.querySelectorAll('[data-action="remove-member"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const userId = (e.currentTarget as HTMLElement).dataset.userId;
      if (userId) handleRemoveMember(userId);
    });
  });

  content.querySelector('[data-action="add-member"]')?.addEventListener('click', handleAddMember);

  content.querySelectorAll('.toggle-switch input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const setting = (e.target as HTMLInputElement).dataset.setting as keyof Household['settings'];
      const value = (e.target as HTMLInputElement).checked;
      handleSettingChange(setting, value);
    });
  });
}

function renderMember(member: HouseholdMember): string {
  const initial = member.displayName.charAt(0).toUpperCase();
  const lastSeenText = member.lastSeen
    ? `Last seen ${formatRelativeTime(new Date(member.lastSeen))}`
    : 'Never used';
  const isOwner = member.role === 'owner';

  return `
    <div class="household-member">
      <div class="household-member__avatar">${initial}</div>
      <div class="household-member__info">
        <div class="household-member__name">${member.displayName}</div>
        <div class="household-member__meta">
          <span class="household-member__role">
            ${ROLE_ICONS[member.role]} ${ROLE_LABELS[member.role]}
          </span>
          <span>•</span>
          <span>${lastSeenText}</span>
        </div>
      </div>
      <div class="household-member__actions">
        ${
          !isOwner
            ? `
          <button 
            class="household-member__btn household-member__btn--danger" 
            data-action="remove-member"
            data-user-id="${member.userId}"
            aria-label="Remove ${member.displayName}"
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

function renderSetting(
  key: keyof Household['settings'],
  label: string,
  description: string
): string {
  const checked = household?.settings[key] ?? false;

  return `
    <div class="household-setting">
      <div class="household-setting__info">
        <div class="household-setting__label">${label}</div>
        <div class="household-setting__description">${description}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''} />
        <span class="toggle-switch__slider"></span>
      </label>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleCreateHousehold(): Promise<void> {
  const name = prompt('What would you like to call your household?', 'My Home');
  if (!name) return;

  isLoading = true;
  renderContent();

  household = await createHouseholdApi(name);

  isLoading = false;
  renderContent();

  if (household) {
    log.info('Household created:', household.name);
  }
}

async function handleAddMember(): Promise<void> {
  const nameInput = document.getElementById('member-name') as HTMLInputElement;
  const roleSelect = document.getElementById('member-role') as HTMLSelectElement;

  const displayName = nameInput?.value.trim();
  const role = roleSelect?.value as HouseholdMember['role'];

  if (!displayName) {
    nameInput?.focus();
    return;
  }

  // Generate a unique user ID for the new member
  const userId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const member = await addMemberApi(userId, displayName, role);

  if (member && household) {
    household.members.push(member);
    renderContent();
    callbacks.onMemberAdded?.(member);
    log.info('Member added:', displayName);
  }
}

async function handleRemoveMember(userId: string): Promise<void> {
  const member = household?.members.find((m) => m.userId === userId);
  if (!member) return;

  const confirmed = confirm(`Remove ${member.displayName} from the household?`);
  if (!confirmed) return;

  const success = await removeMemberApi(userId);

  if (success && household) {
    household.members = household.members.filter((m) => m.userId !== userId);
    renderContent();
    callbacks.onMemberRemoved?.(userId);
    log.info('Member removed:', userId);
  }
}

function handleSettingChange(setting: keyof Household['settings'], value: boolean): void {
  if (!household) return;

  household.settings[setting] = value;
  callbacks.onSettingsChanged?.(household.settings);
  log.debug('Setting changed:', setting, value);

  // TODO: Persist to backend when settings API is available
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
