/**
 * Family Identities Management UI
 *
 * Manage sponsored identities for family members and friends who call
 * Ferni via phone. Allows adding, editing, viewing call history, and
 * approving pending self-registrations.
 *
 * Design: Follows Ferni's warm, Apple-inspired aesthetic with
 * centered floating modal and proper accessibility.
 *
 * @module @ferni/family-identities
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { toast } from './whisper.ui.js';

const log = createLogger('FamilyIdentities');

const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface SponsoredIdentity {
  id: string;
  displayName: string;
  preferredName?: string;
  relationship: string;
  phoneNumber: string;
  voiceEnrolled: boolean;
  accessLevel: 'full' | 'limited' | 'supervised';
  allowedPersonas: string[];
  status: 'active' | 'pending' | 'suspended' | 'revoked';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastCallAt?: string;
  totalCalls: number;
  totalMinutes: number;
}

export interface FamilyIdentitiesCallbacks {
  onIdentitySelect?: (identity: SponsoredIdentity) => void;
  onIdentityAdded?: (identity: SponsoredIdentity) => void;
  onIdentityRemoved?: (identityId: string) => void;
}

/**
 * Pending approval from family self-registration via phone call.
 * These are created when an unknown caller mentions a sponsor's name.
 */
export interface PendingFamilyApproval {
  id: string;
  identityId: string;
  callerName: string;
  callerPhone: string;
  relationship?: string;
  notes?: string;
  callTimestamp: string;
  status: 'pending';
}

/**
 * Unified pending item that can come from either source.
 * source: 'sponsored_identity' = sponsor created but pending activation
 * source: 'family_approval' = caller self-registered, waiting approval
 */
export interface UnifiedPendingItem extends SponsoredIdentity {
  source: 'sponsored_identity' | 'family_approval';
  approvalId?: string; // Only for family_approval source
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RELATIONSHIP_OPTIONS = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'parent', label: 'Parent' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'partner', label: 'Partner' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
];

const ACCESS_LEVEL_OPTIONS = [
  { value: 'full', label: 'Full Access', description: 'Can talk to all team members' },
  { value: 'limited', label: 'Limited', description: 'Only Ferni' },
  { value: 'supervised', label: 'Supervised', description: 'You get notified of calls' },
];

// ============================================================================
// ICONS (Lucide-style SVGs - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  userPlus: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  mic: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let identities: SponsoredIdentity[] = [];
let pendingIdentities: UnifiedPendingItem[] = [];
let callbacks: FamilyIdentitiesCallbacks = {};
let isLoading = false;
let currentView: 'main' | 'add' | 'edit' | 'pending' = 'main';
let editingIdentity: SponsoredIdentity | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .family-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2100);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.STANDARD};
  }
  
  .family-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .family-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
    backdrop-filter: blur(8px);
  }

  .family-modal {
    position: relative;
    width: 90%;
    max-width: clamp(360px, 90vw, 520px);
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    transform: scale(0.95);
    transition: transform var(--duration-slow, ${DURATION.SLOW}ms) ${EASING.SPRING};
  }
  
  .family-modal-overlay.visible .family-modal {
    transform: scale(1);
  }
  
  .family-modal__header {
    padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .family-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--persona-primary, var(--color-ferni, #4a6741));
    margin-bottom: var(--space-1, 4px);
  }
  
  .family-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .family-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-top: var(--space-1, 4px);
  }
  
  .family-modal__close {
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
  
  .family-modal__close:hover {
    background: var(--color-background-tertiary, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  .family-modal__close:focus-visible {
    outline: 2px solid var(--color-accent-primary, #4a6741);
    outline-offset: 2px;
  }
  
  .family-modal__content {
    padding: var(--space-4, 16px) var(--space-6, 24px) var(--space-6, 24px);
    overflow-y: auto;
    max-height: calc(85vh - 120px);
  }
  
  /* Empty State */
  .family-empty {
    text-align: center;
    padding: var(--space-8, 32px) var(--space-4, 16px);
  }
  
  .family-empty__icon {
    color: var(--color-text-muted, #a99d96);
    margin-bottom: var(--space-4, 16px);
  }
  
  .family-empty__title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
  }
  
  .family-empty__text {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-bottom: var(--space-6, 24px);
    line-height: 1.5;
  }
  
  /* Identity List */
  .family-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .family-item {
    background: var(--color-bg-secondary, #FAF8F5);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-4, 16px);
    cursor: pointer;
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
  }
  
  .family-item:hover {
    background: var(--color-bg-tertiary, #F5F2EF);
    border-color: var(--color-border-medium, rgba(112, 96, 90, 0.15));
  }
  
  .family-item__header {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }
  
  .family-item__avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--persona-primary, var(--color-ferni, #4a6741));
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 16px;
  }
  
  .family-item__info {
    flex: 1;
  }
  
  .family-item__name {
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    font-size: 15px;
  }
  
  .family-item__relationship {
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
  }
  
  .family-item__badges {
    display: flex;
    gap: var(--space-2, 8px);
  }
  
  .family-item__badge {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
    font-size: 12px;
    color: var(--color-text-muted, #a99d96);
  }
  
  .family-item__badge--voice {
    color: var(--color-semantic-success, #4a6741);
  }
  
  .family-item__stats {
    display: flex;
    gap: var(--space-4, 16px);
    margin-top: var(--space-3, 12px);
    padding-top: var(--space-3, 12px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.08));
  }
  
  .family-item__stat {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
    font-size: 12px;
    color: var(--color-text-muted, #a99d96);
  }
  
  /* Pending Badge */
  .family-item--pending {
    border-left: 3px solid var(--color-semantic-warning, #d4a574);
  }
  
  .family-pending-badge {
    background: var(--color-semantic-warning, #d4a574);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
  }
  
  /* Family referral (called you) - more prominent styling */
  .family-item--referral {
    border-left-color: var(--color-accent-primary, #4a6741);
    background: var(--color-accent-tint, rgba(74, 103, 65, 0.04));
  }
  
  .family-pending-badge--referral {
    background: var(--color-accent-primary, #4a6741);
  }
  
  /* Form */
  .family-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
  }
  
  .family-form__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }
  
  .family-form__label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
  }
  
  .family-form__input,
  .family-form__select,
  .family-form__textarea {
    width: 100%;
    padding: var(--space-3, 12px);
    background: var(--color-bg-secondary, #FAF8F5);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-md, 8px);
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
    transition: border-color var(--duration-fast, ${DURATION.FAST}ms);
  }
  
  .family-form__input:focus,
  .family-form__select:focus,
  .family-form__textarea:focus {
    outline: none;
    border-color: var(--color-accent-primary, #4a6741);
  }
  
  .family-form__textarea {
    min-height: 80px;
    resize: vertical;
  }
  
  /* Buttons */
  .family-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border-radius: var(--radius-full, 9999px);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, ${DURATION.FAST}ms) ${EASING.STANDARD};
    border: none;
  }
  
  .family-btn:focus-visible {
    outline: 2px solid var(--color-accent-primary, #4a6741);
    outline-offset: 2px;
  }
  
  .family-btn--primary {
    background: var(--color-accent-primary, #4a6741);
    color: white;
  }
  
  .family-btn--primary:hover {
    background: var(--color-accent-hover, #3d5a35);
  }
  
  .family-btn--secondary {
    background: var(--color-bg-secondary, #FAF8F5);
    color: var(--color-text-primary, #2c2520);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
  }
  
  .family-btn--secondary:hover {
    background: var(--color-bg-tertiary, #F5F2EF);
  }
  
  .family-btn--danger {
    background: var(--color-semantic-error, #c94f4f);
    color: white;
  }
  
  .family-btn--danger:hover {
    background: var(--color-semantic-error-hover, #b04545);
  }
  
  .family-btn--small {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    font-size: 13px;
  }
  
  .family-btn--icon {
    padding: var(--space-2, 8px);
    border-radius: var(--radius-md, 8px);
  }
  
  /* Actions Bar */
  .family-actions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    margin-top: var(--space-4, 16px);
  }
  
  /* Loading */
  .family-loading {
    display: flex;
    justify-content: center;
    padding: var(--space-8, 32px);
  }
  
  .family-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-top-color: var(--color-accent-primary, #4a6741);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Tabs */
  .family-tabs {
    display: flex;
    gap: var(--space-1, 4px);
    margin-bottom: var(--space-4, 16px);
    background: var(--color-bg-secondary, #FAF8F5);
    padding: var(--space-1, 4px);
    border-radius: var(--radius-full, 9999px);
  }
  
  .family-tab {
    flex: 1;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: none;
    background: transparent;
    border-radius: var(--radius-full, 9999px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
    cursor: pointer;
    transition: all var(--duration-fast, ${DURATION.FAST}ms);
  }
  
  .family-tab:hover {
    color: var(--color-text-primary, #2c2520);
  }
  
  .family-tab--active {
    background: white;
    color: var(--color-text-primary, #2c2520);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  
  .family-tab__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: var(--color-semantic-warning, #d4a574);
    color: white;
    font-size: 11px;
    font-weight: 600;
    border-radius: var(--radius-full, 9999px);
    margin-left: var(--space-1, 4px);
  }
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatPhone(phone: string): string {
  // Phone comes masked from API
  return phone;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadIdentities(): Promise<void> {
  try {
    const response = await apiGet<{ identities: SponsoredIdentity[] }>('/api/sponsored-identities');
    identities = response.data?.identities || [];
  } catch (error) {
    log.error('Failed to load identities', { error });
    toast.error("Couldn't load your family");
    identities = [];
  }
}

async function loadPendingIdentities(): Promise<void> {
  try {
    // Load from both sources in parallel
    const [sponsoredResponse, familyResponse] = await Promise.all([
      apiGet<{ pending: SponsoredIdentity[] }>('/api/sponsored-identities/pending'),
      apiGet<{ pending: PendingFamilyApproval[] }>('/api/family/pending'),
    ]);

    // Convert sponsored identities to unified format
    const sponsoredPending: UnifiedPendingItem[] = (sponsoredResponse.data?.pending || []).map(
      (si) => ({
        ...si,
        source: 'sponsored_identity' as const,
      })
    );

    // Convert family approvals to unified format
    const familyPending: UnifiedPendingItem[] = (familyResponse.data?.pending || []).map((fa) => ({
      id: fa.identityId, // Use identityId as the main id for consistency
      approvalId: fa.id, // Keep original approval id for API calls
      displayName: fa.callerName,
      phoneNumber: fa.callerPhone,
      relationship: fa.relationship || 'referred',
      status: 'pending' as const,
      notes: fa.notes,
      voiceEnrolled: false,
      accessLevel: 'full' as const,
      allowedPersonas: [],
      createdAt: fa.callTimestamp,
      updatedAt: fa.callTimestamp,
      totalCalls: 0,
      totalMinutes: 0,
      source: 'family_approval' as const,
    }));

    // Combine and sort by creation date (newest first)
    pendingIdentities = [...sponsoredPending, ...familyPending].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    log.debug('Loaded pending identities', {
      sponsored: sponsoredPending.length,
      family: familyPending.length,
      total: pendingIdentities.length,
    });
  } catch (error) {
    log.error('Failed to load pending identities', { error });
    pendingIdentities = [];
  }
}

async function createIdentity(data: {
  displayName: string;
  phoneNumber: string;
  relationship: string;
  preferredName?: string;
  notes?: string;
  accessLevel?: string;
}): Promise<SponsoredIdentity | null> {
  try {
    const response = await apiPost<{ identity: SponsoredIdentity }>(
      '/api/sponsored-identities',
      data
    );
    return response.data?.identity ?? null;
  } catch (error) {
    log.error('Failed to create identity', { error });
    toast.error("Couldn't add family member");
    return null;
  }
}

async function updateIdentity(
  id: string,
  data: Partial<SponsoredIdentity>
): Promise<SponsoredIdentity | null> {
  try {
    const response = await apiPut<{ identity: SponsoredIdentity }>(
      `/api/sponsored-identities/${id}`,
      data
    );
    return response.data?.identity ?? null;
  } catch (error) {
    log.error('Failed to update identity', { error });
    toast.error("Couldn't update");
    return null;
  }
}

async function deleteIdentity(id: string): Promise<boolean> {
  try {
    await apiDelete(`/api/sponsored-identities/${id}`);
    return true;
  } catch (error) {
    log.error('Failed to delete identity', { error });
    toast.error("Couldn't remove");
    return false;
  }
}

async function approveIdentity(id: string): Promise<SponsoredIdentity | null> {
  try {
    const response = await apiPost<{ identity: SponsoredIdentity }>(
      `/api/sponsored-identities/${id}/approve`,
      {}
    );
    return response.data?.identity ?? null;
  } catch (error) {
    log.error('Failed to approve identity', { error });
    toast.error("Couldn't approve");
    return null;
  }
}

/**
 * Approve a family self-registration approval.
 */
async function approveFamilyApproval(approvalId: string): Promise<boolean> {
  try {
    const response = await apiPost<{ success: boolean }>('/api/family/approve', { approvalId });
    return response.data?.success ?? false;
  } catch (error) {
    log.error('Failed to approve family approval', { error });
    toast.error("Couldn't approve");
    return false;
  }
}

/**
 * Reject a family self-registration approval.
 */
async function rejectFamilyApproval(approvalId: string): Promise<boolean> {
  try {
    const response = await apiPost<{ success: boolean }>('/api/family/reject', { approvalId });
    return response.data?.success ?? false;
  } catch (error) {
    log.error('Failed to reject family approval', { error });
    toast.error("Couldn't decline");
    return false;
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderContent(): string {
  if (isLoading) {
    return `
      <div class="family-loading">
        <div class="family-spinner"></div>
      </div>
    `;
  }

  switch (currentView) {
    case 'add':
      return renderAddForm();
    case 'edit':
      return renderEditForm();
    case 'pending':
      return renderPendingList();
    default:
      return renderMainView();
  }
}

function renderMainView(): string {
  const hasPending = pendingIdentities.length > 0;

  return `
    ${
      hasPending
        ? `
      <div class="family-tabs">
        <button class="family-tab family-tab--active" data-tab="main">Family</button>
        <button class="family-tab" data-tab="pending">
          Pending
          <span class="family-tab__badge">${pendingIdentities.length}</span>
        </button>
      </div>
    `
        : ''
    }
    
    ${identities.length === 0 ? renderEmptyState() : renderIdentityList()}
    
    <div class="family-actions">
      <button class="family-btn family-btn--primary" data-action="add">
        ${ICONS.userPlus}
        Add Family Member
      </button>
    </div>
  `;
}

function renderEmptyState(): string {
  return `
    <div class="family-empty">
      <div class="family-empty__icon">${ICONS.heart}</div>
      <div class="family-empty__title">Your Ferni Family</div>
      <div class="family-empty__text">
        Add family members who call Ferni by phone. They'll be recognized 
        automatically and can have their own conversations with Ferni.
      </div>
    </div>
  `;
}

function renderIdentityList(): string {
  return `
    <div class="family-list">
      ${identities.map((identity) => renderIdentityItem(identity)).join('')}
    </div>
  `;
}

function renderIdentityItem(identity: SponsoredIdentity): string {
  const initials = getInitials(identity.displayName);
  const relationship = RELATIONSHIP_OPTIONS.find((r) => r.value === identity.relationship)?.label || identity.relationship;

  return `
    <div class="family-item" data-identity-id="${identity.id}">
      <div class="family-item__header">
        <div class="family-item__avatar">${initials}</div>
        <div class="family-item__info">
          <div class="family-item__name">${identity.displayName}</div>
          <div class="family-item__relationship">${relationship}</div>
        </div>
        <div class="family-item__badges">
          ${
            identity.voiceEnrolled
              ? `<span class="family-item__badge family-item__badge--voice" title="Voice enrolled">
                  ${ICONS.mic}
                </span>`
              : ''
          }
        </div>
      </div>
      <div class="family-item__stats">
        <span class="family-item__stat">
          ${ICONS.phone}
          ${identity.totalCalls} calls
        </span>
        <span class="family-item__stat">
          ${ICONS.clock}
          ${identity.lastCallAt ? `Last: ${formatDate(identity.lastCallAt)}` : 'No calls yet'}
        </span>
      </div>
    </div>
  `;
}

function renderPendingList(): string {
  return `
    <div class="family-tabs">
      <button class="family-tab" data-tab="main">Family</button>
      <button class="family-tab family-tab--active" data-tab="pending">
        Pending
        <span class="family-tab__badge">${pendingIdentities.length}</span>
      </button>
    </div>
    
    <div class="family-list">
      ${pendingIdentities.map((identity) => renderPendingItem(identity)).join('')}
    </div>
  `;
}

function renderPendingItem(identity: UnifiedPendingItem): string {
  const isFamilyApproval = identity.source === 'family_approval';
  const badgeText = isFamilyApproval ? 'Called you' : 'Pending';
  const relationship = identity.relationship
    ? RELATIONSHIP_OPTIONS.find((r) => r.value === identity.relationship)?.label || identity.relationship
    : '';

  return `
    <div class="family-item family-item--pending${isFamilyApproval ? ' family-item--referral' : ''}" data-pending-id="${identity.id}">
      <div class="family-item__header">
        <div class="family-item__avatar">${getInitials(identity.displayName)}</div>
        <div class="family-item__info">
          <div class="family-item__name">${identity.displayName}</div>
          <div class="family-item__relationship">
            ${relationship ? `${relationship} · ` : ''}${formatPhone(identity.phoneNumber)}
          </div>
        </div>
        <span class="family-pending-badge${isFamilyApproval ? ' family-pending-badge--referral' : ''}">${badgeText}</span>
      </div>
      ${
        identity.notes
          ? `
        <div class="family-item__stats">
          <span class="family-item__stat" style="flex: 1;">
            "${identity.notes}"
          </span>
        </div>
      `
          : ''
      }
      <div class="family-actions" style="margin-top: var(--space-3, 12px);">
        <button class="family-btn family-btn--secondary family-btn--small" data-action="reject" data-id="${identity.id}">
          ${ICONS.x}
          Decline
        </button>
        <button class="family-btn family-btn--primary family-btn--small" data-action="approve" data-id="${identity.id}">
          ${ICONS.check}
          ${isFamilyApproval ? 'Add to Family' : 'Approve'}
        </button>
      </div>
    </div>
  `;
}

function renderAddForm(): string {
  return `
    <div class="family-form">
      <div class="family-form__group">
        <label class="family-form__label">Name *</label>
        <input type="text" class="family-form__input" id="family-name" placeholder="e.g., Mom" required>
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Phone Number *</label>
        <input type="tel" class="family-form__input" id="family-phone" placeholder="+1 555 123 4567" required>
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Relationship *</label>
        <select class="family-form__select" id="family-relationship">
          ${RELATIONSHIP_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('')}
        </select>
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">What should Ferni call them?</label>
        <input type="text" class="family-form__input" id="family-preferred" placeholder="e.g., Barbara (optional)">
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Notes for Ferni</label>
        <textarea class="family-form__textarea" id="family-notes" placeholder="Any helpful context (optional)"></textarea>
      </div>
    </div>
    
    <div class="family-actions">
      <button class="family-btn family-btn--secondary" data-action="cancel">Cancel</button>
      <button class="family-btn family-btn--primary" data-action="save-new">Add to Family</button>
    </div>
  `;
}

function renderEditForm(): string {
  if (!editingIdentity) return '';
  const identity = editingIdentity; // Capture for closure

  return `
    <div class="family-form">
      <div class="family-form__group">
        <label class="family-form__label">Name</label>
        <input type="text" class="family-form__input" id="family-name" value="${identity.displayName}">
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Phone Number</label>
        <input type="tel" class="family-form__input" id="family-phone" value="${identity.phoneNumber}" disabled>
        <small style="color: var(--color-text-muted); font-size: 12px; margin-top: 4px;">
          Phone number cannot be changed
        </small>
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Relationship</label>
        <select class="family-form__select" id="family-relationship">
          ${RELATIONSHIP_OPTIONS.map((opt) => `<option value="${opt.value}" ${opt.value === identity.relationship ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">What should Ferni call them?</label>
        <input type="text" class="family-form__input" id="family-preferred" value="${identity.preferredName || ''}" placeholder="(optional)">
      </div>
      
      <div class="family-form__group">
        <label class="family-form__label">Notes for Ferni</label>
        <textarea class="family-form__textarea" id="family-notes" placeholder="(optional)">${identity.notes || ''}</textarea>
      </div>
    </div>
    
    <div class="family-actions">
      <button class="family-btn family-btn--danger family-btn--icon" data-action="delete" title="Remove from family">
        ${ICONS.trash}
      </button>
      <div style="display: flex; gap: var(--space-2, 8px);">
        <button class="family-btn family-btn--secondary" data-action="cancel">Cancel</button>
        <button class="family-btn family-btn--primary" data-action="save-edit">Save Changes</button>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Close button
  if (target.closest('.family-modal__close')) {
    hide();
    return;
  }

  // Backdrop click
  if (target.classList.contains('family-modal-backdrop')) {
    hide();
    return;
  }

  // Tab click
  const tab = target.closest('[data-tab]') as HTMLElement;
  if (tab) {
    const tabName = tab.dataset.tab;
    if (tabName === 'pending') {
      currentView = 'pending';
    } else {
      currentView = 'main';
    }
    refresh();
    return;
  }

  // Action buttons
  const action = (target.closest('[data-action]') as HTMLElement)?.dataset.action;
  if (action) {
    handleAction(action, target);
    return;
  }

  // Identity click (for editing)
  const identityItem = target.closest('[data-identity-id]') as HTMLElement;
  if (identityItem && !target.closest('button')) {
    const id = identityItem.dataset.identityId;
    const identity = identities.find((i) => i.id === id);
    if (identity) {
      editingIdentity = identity;
      currentView = 'edit';
      refresh();
    }
    return;
  }
}

async function handleAction(action: string, target: HTMLElement): Promise<void> {
  switch (action) {
    case 'add':
      currentView = 'add';
      refresh();
      break;

    case 'cancel':
      currentView = 'main';
      editingIdentity = null;
      refresh();
      break;

    case 'save-new': {
      const name = (document.getElementById('family-name') as HTMLInputElement)?.value?.trim();
      const phone = (document.getElementById('family-phone') as HTMLInputElement)?.value?.trim();
      const relationship = (document.getElementById('family-relationship') as HTMLSelectElement)?.value;
      const preferred = (document.getElementById('family-preferred') as HTMLInputElement)?.value?.trim();
      const notes = (document.getElementById('family-notes') as HTMLTextAreaElement)?.value?.trim();

      if (!name || !phone) {
        toast.warning('Name and phone are required');
        return;
      }

      isLoading = true;
      refresh();

      const identity = await createIdentity({
        displayName: name,
        phoneNumber: phone,
        relationship,
        preferredName: preferred || undefined,
        notes: notes || undefined,
      });

      if (identity) {
        identities.push(identity);
        callbacks.onIdentityAdded?.(identity);
        toast.success(`${name} added!`);
        currentView = 'main';
      }

      isLoading = false;
      refresh();
      break;
    }

    case 'save-edit': {
      if (!editingIdentity) return;

      const name = (document.getElementById('family-name') as HTMLInputElement)?.value?.trim();
      const relationship = (document.getElementById('family-relationship') as HTMLSelectElement)?.value;
      const preferred = (document.getElementById('family-preferred') as HTMLInputElement)?.value?.trim();
      const notes = (document.getElementById('family-notes') as HTMLTextAreaElement)?.value?.trim();

      isLoading = true;
      refresh();

      const updated = await updateIdentity(editingIdentity.id, {
        displayName: name,
        relationship,
        preferredName: preferred || undefined,
        notes: notes || undefined,
      });

      if (updated) {
        const idx = identities.findIndex((i) => i.id === updated.id);
        if (idx >= 0) identities[idx] = updated;
        toast.success('Updated!');
        currentView = 'main';
        editingIdentity = null;
      }

      isLoading = false;
      refresh();
      break;
    }

    case 'delete': {
      if (!editingIdentity) return;

      if (confirm(`Remove ${editingIdentity.displayName} from your family?`)) {
        isLoading = true;
        refresh();

        const success = await deleteIdentity(editingIdentity.id);
        if (success) {
          identities = identities.filter((i) => i.id !== editingIdentity!.id);
          callbacks.onIdentityRemoved?.(editingIdentity.id);
          toast.success('Removed');
          currentView = 'main';
          editingIdentity = null;
        }

        isLoading = false;
        refresh();
      }
      break;
    }

    case 'approve': {
      const id = target.closest('[data-id]')?.getAttribute('data-id');
      if (!id) return;

      const pendingItem = pendingIdentities.find((i) => i.id === id);
      if (!pendingItem) return;

      isLoading = true;
      refresh();

      let success = false;
      let approvedIdentity: SponsoredIdentity | null = null;

      // Route to correct API based on source
      if (pendingItem.source === 'family_approval' && pendingItem.approvalId) {
        success = await approveFamilyApproval(pendingItem.approvalId);
        if (success) {
          // Create a basic identity object for the callback
          approvedIdentity = {
            ...pendingItem,
            status: 'active',
          } as SponsoredIdentity;
        }
      } else {
        approvedIdentity = await approveIdentity(id);
        success = !!approvedIdentity;
      }

      if (success && approvedIdentity) {
        pendingIdentities = pendingIdentities.filter((i) => i.id !== id);
        identities.push(approvedIdentity);
        callbacks.onIdentityAdded?.(approvedIdentity);
        toast.success(`${approvedIdentity.displayName} added!`);

        if (pendingIdentities.length === 0) {
          currentView = 'main';
        }
      }

      isLoading = false;
      refresh();
      break;
    }

    case 'reject': {
      const id = target.closest('[data-id]')?.getAttribute('data-id');
      if (!id) return;

      const pendingItem = pendingIdentities.find((i) => i.id === id);
      if (!pendingItem) return;

      if (confirm(`Decline ${pendingItem.displayName || 'this request'}?`)) {
        isLoading = true;
        refresh();

        let success = false;

        // Route to correct API based on source
        if (pendingItem.source === 'family_approval' && pendingItem.approvalId) {
          success = await rejectFamilyApproval(pendingItem.approvalId);
        } else {
          success = await deleteIdentity(id);
        }

        if (success) {
          pendingIdentities = pendingIdentities.filter((i) => i.id !== id);
          toast.info('Declined');

          if (pendingIdentities.length === 0) {
            currentView = 'main';
          }
        }

        isLoading = false;
        refresh();
      }
      break;
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

function refresh(): void {
  if (!modal) return;

  const content = modal.querySelector('.family-modal__content');
  if (content) {
    content.innerHTML = renderContent();
  }
}

export async function show(options: FamilyIdentitiesCallbacks = {}): Promise<void> {
  callbacks = options;
  isLoading = true;
  currentView = 'main';

  // Clean up any existing modal
  hide();

  // Inject styles
  if (!document.getElementById('family-identities-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'family-identities-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Create modal
  modal = document.createElement('div');
  modal.className = 'family-modal-overlay';
  modal.innerHTML = `
    <div class="family-modal-backdrop"></div>
    <div class="family-modal" role="dialog" aria-modal="true" aria-labelledby="family-modal-title">
      <div class="family-modal__header">
        <span class="family-modal__eyebrow">Family</span>
        <h2 class="family-modal__title" id="family-modal-title">Your Ferni Family</h2>
        <p class="family-modal__subtitle">People who can call Ferni by phone</p>
        <button class="family-modal__close" aria-label="Close">
          ${ICONS.close}
        </button>
      </div>
      <div class="family-modal__content">
        ${renderContent()}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', handleClick);

  // Trigger animation
  requestAnimationFrame(() => {
    modal?.classList.add('visible');
  });

  // Load data
  await Promise.all([loadIdentities(), loadPendingIdentities()]);
  isLoading = false;
  refresh();
}

export function hide(): void {
  if (!modal) return;

  modal.classList.remove('visible');
  clearAllTimeouts();

  trackedTimeout(() => {
    modal?.removeEventListener('click', handleClick);
    modal?.remove();
    modal = null;
    identities = [];
    pendingIdentities = [];
    editingIdentity = null;
    currentView = 'main';
  }, DURATION.NORMAL);
}

export function isVisible(): boolean {
  return modal?.classList.contains('visible') ?? false;
}

// Export for settings menu integration
export const FamilyIdentities = {
  show,
  hide,
  isVisible,
};
