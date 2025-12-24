/**
 * Edit Person Details UI
 *
 * Edit everything about someone you care about.
 * Update contact info, interests, sensitive topics, notes, and more.
 *
 * @module ui/edit-person
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { t } from '../i18n/index.js';

const log = createLogger('EditPersonUI');

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType = 
  | 'family'
  | 'friend'
  | 'colleague'
  | 'mentor'
  | 'acquaintance'
  | 'other';

export interface PersonData {
  id: string;
  contactId: string;
  name: string;
  aliases?: string[];
  relationship?: RelationshipType;
  email?: string;
  phone?: string;
  howWeMet?: string;
  notes?: string;
  interests?: string[];
  sensitiveTopics?: string[];
  preferredChannel?: 'call' | 'text' | 'email' | 'in_person';
  bestTimeToReach?: string;
}

export interface EditPersonOptions {
  person: PersonData;
  onSuccess?: (data: PersonData) => void;
  onClose?: () => void;
  onDelete?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface EditPersonState {
  isOpen: boolean;
  person: PersonData | null;
  name: string;
  relationship: RelationshipType;
  email: string;
  phone: string;
  howWeMet: string;
  notes: string;
  interests: string;
  sensitiveTopics: string;
  preferredChannel: string;
  bestTimeToReach: string;
  isSubmitting: boolean;
  activeTab: 'basic' | 'preferences' | 'context';
  showDeleteConfirm: boolean;
}

let state: EditPersonState = {
  isOpen: false,
  person: null,
  name: '',
  relationship: 'friend',
  email: '',
  phone: '',
  howWeMet: '',
  notes: '',
  interests: '',
  sensitiveTopics: '',
  preferredChannel: '',
  bestTimeToReach: '',
  isSubmitting: false,
  activeTab: 'basic',
  showDeleteConfirm: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSuccess?: (data: PersonData) => void; onClose?: () => void; onDelete?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  brain: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>`,
  trash: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  alertTriangle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  briefcase: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  userPlus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" x2="20" y1="8" y2="14"/><line x1="23" x2="17" y1="11" y2="11"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
};

// Relationship type definitions - resolved at render time for i18n
function getRelationshipTypes(): { id: RelationshipType; label: string; icon: string }[] {
  return [
    { id: 'family', label: t('addPerson.relationships.family'), icon: ICONS.home },
    { id: 'friend', label: t('addPerson.relationships.friend'), icon: ICONS.heart },
    { id: 'colleague', label: t('addPerson.relationships.colleague'), icon: ICONS.briefcase },
    { id: 'mentor', label: t('addPerson.relationships.mentor'), icon: ICONS.star },
    { id: 'acquaintance', label: t('addPerson.relationships.acquaintance'), icon: ICONS.userPlus },
    { id: 'other', label: t('addPerson.relationships.other'), icon: ICONS.users },
  ];
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('edit-person-styles')) return;

  const style = document.createElement('style');
  style.id = 'edit-person-styles';
  style.textContent = `
    /* =========================================================================
       EDIT PERSON - Edit Details
       ========================================================================= */
    
    .edit-person-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .edit-person-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .edit-person-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .edit-person-modal {
      position: relative;
      width: 94%;
      max-width: clamp(350px, 90vw, 500px);
      max-height: 90vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .edit-person-overlay.open .edit-person-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .ep-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .ep-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .ep-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .ep-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .ep-close {
      width: var(--space-10, 2.5rem);
      height: var(--space-10, 2.5rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #70605a);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .ep-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       TABS
       ========================================================================= */
    
    .ep-tabs {
      display: flex;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .ep-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ep-tab:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a4a42);
    }

    .ep-tab.active {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .ep-tab svg {
      width: 14px;
      height: 14px;
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .ep-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    .ep-section {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ep-section:last-child {
      margin-bottom: 0;
    }

    .ep-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: block;
    }

    .ep-hint {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    /* =========================================================================
       INPUT FIELDS
       ========================================================================= */
    
    .ep-input {
      width: 100%;
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .ep-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .ep-input::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    .ep-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-family: inherit;
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      resize: vertical;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .ep-textarea:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .ep-row {
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .ep-field {
      flex: 1;
    }

    .ep-select {
      width: 100%;
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2370605a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: var(--space-10, 2.5rem);
    }

    /* =========================================================================
       RELATIONSHIP SELECTOR
       ========================================================================= */
    
    .ep-relationships {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-2, 0.5rem);
    }

    .ep-relationship {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-2-5, 0.625rem) var(--space-2, 0.5rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ep-relationship:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .ep-relationship.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .ep-relationship-icon {
      color: var(--color-text-muted, #70605a);
    }

    .ep-relationship.selected .ep-relationship-icon {
      color: var(--persona-primary, #4a6741);
    }

    .ep-relationship-icon svg {
      width: 18px;
      height: 18px;
    }

    .ep-relationship-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
    }

    .ep-relationship.selected .ep-relationship-label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    /* =========================================================================
       DELETE SECTION
       ========================================================================= */
    
    .ep-danger-zone {
      margin-top: var(--space-6, 1.5rem);
      padding-top: var(--space-5, 1.25rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .ep-danger-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-semantic-error-glow);
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      color: var(--color-semantic-error, #c44);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ep-danger-btn:hover {
      background: var(--color-semantic-error-tint);
      border-color: var(--color-semantic-error, #c44);
    }

    .ep-danger-btn svg {
      width: 16px;
      height: 16px;
    }

    /* Delete confirmation */
    .ep-delete-confirm {
      padding: var(--space-4, 1rem);
      background: var(--color-semantic-error-tint);
      border: 1px solid var(--color-semantic-error-glow);
      border-radius: var(--radius-lg, 1rem);
      margin-top: var(--space-3, 0.75rem);
    }

    .ep-delete-confirm-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-semantic-error, #c44);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .ep-delete-confirm-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      margin-bottom: var(--space-3, 0.75rem);
      line-height: 1.5;
    }

    .ep-delete-confirm-actions {
      display: flex;
      gap: var(--space-2, 0.5rem);
    }

    .ep-delete-confirm-btn {
      flex: 1;
      padding: var(--space-2, 0.5rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ep-delete-confirm-cancel {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .ep-delete-confirm-delete {
      background: var(--color-semantic-error, #c44);
      border: 1px solid var(--color-semantic-error, #c44);
      color: white;
    }

    .ep-delete-confirm-delete:hover {
      background: #a33;
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .ep-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .ep-btn {
      flex: 1;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ep-btn-secondary {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .ep-btn-secondary:hover {
      border-color: var(--color-text-muted, #70605a);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
    }

    .ep-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .ep-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .ep-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .edit-person-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .ep-relationships {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .edit-person-overlay,
      .edit-person-modal,
      .ep-tab,
      .ep-relationship,
      .ep-btn,
      .ep-close {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const modal = modalContainer.querySelector('.edit-person-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="ep-header">
      <div class="ep-header-row">
        <div>
          <div class="ep-eyebrow">${t('editPerson.eyebrow')}</div>
          <h2 class="ep-title">${escapeHtml(state.name || t('editPerson.defaultName'))}</h2>
        </div>
        <button class="ep-close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="ep-tabs">
      <button aria-label="${t('editPerson.tabs.basic')}" class="ep-tab ${state.activeTab === 'basic' ? 'active' : ''}" data-tab="basic">
        ${ICONS.user} ${t('editPerson.tabs.basic')}
      </button>
      <button aria-label="${t('editPerson.tabs.preferences')}" class="ep-tab ${state.activeTab === 'preferences' ? 'active' : ''}" data-tab="preferences">
        ${ICONS.settings} ${t('editPerson.tabs.preferences')}
      </button>
      <button aria-label="${t('editPerson.tabs.context')}" class="ep-tab ${state.activeTab === 'context' ? 'active' : ''}" data-tab="context">
        ${ICONS.brain} ${t('editPerson.tabs.context')}
      </button>
    </div>
    
    <div class="ep-content">
      ${renderTabContent()}
    </div>
    
    <div class="ep-footer">
      <button aria-label="${t('common.cancel')}" class="ep-btn ep-btn-secondary" id="ep-cancel">${t('common.cancel')}</button>
      <button aria-label="${t('common.save')}" class="ep-btn ep-btn-primary" id="ep-save" ${state.isSubmitting ? 'disabled' : ''}>
        ${state.isSubmitting ? t('editPerson.saving') : t('editPerson.saveChanges')}
      </button>
    </div>
  `;

  bindEvents();
}

function renderTabContent(): string {
  switch (state.activeTab) {
    case 'basic':
      return renderBasicTab();
    case 'preferences':
      return renderPreferencesTab();
    case 'context':
      return renderContextTab();
    default:
      return renderBasicTab();
  }
}

function renderBasicTab(): string {
  const relationshipTypes = getRelationshipTypes();
  
  return `
    <!-- Name -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.nameLabel')}</label>
      <input type="text" class="ep-input" id="ep-name" value="${escapeHtml(state.name)}" />
    </div>
    
    <!-- Relationship Type -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.relationshipLabel')}</label>
      <div class="ep-relationships">
        ${relationshipTypes.map(rel => `
          <button class="ep-relationship ${state.relationship === rel.id ? 'selected' : ''}" data-relationship="${rel.id}">
            <span class="ep-relationship-icon">${rel.icon}</span>
            <span class="ep-relationship-label">${rel.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
    
    <!-- Contact Info -->
    <div class="ep-section">
      <div class="ep-row">
        <div class="ep-field">
          <label class="ep-label">${t('editPerson.emailLabel')}</label>
          <input type="email" class="ep-input" id="ep-email" placeholder="${t('placeholders.emailExample')}" value="${escapeHtml(state.email)}" />
        </div>
        <div class="ep-field">
          <label class="ep-label">${t('editPerson.phoneLabel')}</label>
          <input type="tel" class="ep-input" id="ep-phone" placeholder="${t('placeholders.phoneExample')}" value="${escapeHtml(state.phone)}" />
        </div>
      </div>
    </div>
    
    <!-- How We Met -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.howMetLabel')}</label>
      <input type="text" class="ep-input" id="ep-how-met" placeholder="${t('editPerson.howMetPlaceholder')}" value="${escapeHtml(state.howWeMet)}" />
    </div>
    
    <!-- Danger Zone -->
    <div class="ep-danger-zone">
      <button aria-label="${t('common.delete')}" class="ep-danger-btn" id="ep-delete-btn">
        ${ICONS.trash} ${t('editPerson.removeFromPeople')}
      </button>
      ${state.showDeleteConfirm ? `
        <div class="ep-delete-confirm">
          <div class="ep-delete-confirm-title">${ICONS.alertTriangle} ${t('editPerson.areYouSure')}</div>
          <p class="ep-delete-confirm-text">${t('editPerson.deleteConfirmText', { name: escapeHtml(state.name) })}</p>
          <div class="ep-delete-confirm-actions" role="button" tabindex="0">
            <button aria-label="${t('common.cancel')}" class="ep-delete-confirm-btn ep-delete-confirm-cancel" id="ep-delete-cancel">${t('common.cancel')}</button>
            <button aria-label="${t('editPerson.remove')}" class="ep-delete-confirm-btn ep-delete-confirm-delete" id="ep-delete-confirm">${t('editPerson.remove')}</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderPreferencesTab(): string {
  return `
    <!-- Preferred Channel -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.preferredChannelLabel')}</label>
      <select class="ep-select" id="ep-channel">
        <option value="" ${!state.preferredChannel ? 'selected' : ''}>${t('editPerson.noPreference')}</option>
        <option value="call" ${state.preferredChannel === 'call' ? 'selected' : ''}>${t('editPerson.phoneCall')}</option>
        <option value="text" ${state.preferredChannel === 'text' ? 'selected' : ''}>${t('editPerson.textMessage')}</option>
        <option value="email" ${state.preferredChannel === 'email' ? 'selected' : ''}>${t('editPerson.email')}</option>
        <option value="in_person" ${state.preferredChannel === 'in_person' ? 'selected' : ''}>${t('editPerson.inPerson')}</option>
      </select>
    </div>
    
    <!-- Best Time to Reach -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.bestTimeLabel')}</label>
      <input type="text" class="ep-input" id="ep-best-time" placeholder="${t('editPerson.bestTimePlaceholder')}" value="${escapeHtml(state.bestTimeToReach)}" />
      <p class="ep-hint">${t('editPerson.bestTimeHint')}</p>
    </div>
  `;
}

function renderContextTab(): string {
  return `
    <!-- Interests -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.interestsLabel')}</label>
      <textarea class="ep-textarea" id="ep-interests" placeholder="${t('editPerson.interestsPlaceholder')}">${escapeHtml(state.interests)}</textarea>
      <p class="ep-hint">${t('editPerson.interestsHint')}</p>
    </div>
    
    <!-- Sensitive Topics -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.sensitiveLabel')}</label>
      <textarea class="ep-textarea" id="ep-sensitive" placeholder="${t('editPerson.sensitivePlaceholder')}">${escapeHtml(state.sensitiveTopics)}</textarea>
      <p class="ep-hint">${t('editPerson.sensitiveHint')}</p>
    </div>
    
    <!-- Notes -->
    <div class="ep-section">
      <label class="ep-label">${t('editPerson.notesLabel')}</label>
      <textarea class="ep-textarea" id="ep-notes" placeholder="${t('editPerson.notesPlaceholder')}">${escapeHtml(state.notes)}</textarea>
    </div>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.ep-close')?.addEventListener('click', closeEditPerson);
  modalContainer.querySelector('.edit-person-backdrop')?.addEventListener('click', closeEditPerson);
  modalContainer.querySelector('#ep-cancel')?.addEventListener('click', closeEditPerson);

  // Tabs
  modalContainer.querySelectorAll('.ep-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab') as EditPersonState['activeTab'];
      if (tabId) {
        state.activeTab = tabId;
        render();
      }
    });
  });

  // Relationship selection
  modalContainer.querySelectorAll('.ep-relationship').forEach(btn => {
    btn.addEventListener('click', () => {
      const relationship = btn.getAttribute('data-relationship') as RelationshipType;
      if (relationship) {
        state.relationship = relationship;
        render();
      }
    });
  });

  // Input fields (based on current tab)
  bindInputs();

  // Delete button
  modalContainer.querySelector('#ep-delete-btn')?.addEventListener('click', () => {
    state.showDeleteConfirm = true;
    render();
  });

  modalContainer.querySelector('#ep-delete-cancel')?.addEventListener('click', () => {
    state.showDeleteConfirm = false;
    render();
  });

  modalContainer.querySelector('#ep-delete-confirm')?.addEventListener('click', handleDelete);

  // Save button
  modalContainer.querySelector('#ep-save')?.addEventListener('click', handleSave);

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function bindInputs(): void {
  if (!modalContainer) return;

  const nameInput = modalContainer.querySelector('#ep-name') as HTMLInputElement;
  const emailInput = modalContainer.querySelector('#ep-email') as HTMLInputElement;
  const phoneInput = modalContainer.querySelector('#ep-phone') as HTMLInputElement;
  const howMetInput = modalContainer.querySelector('#ep-how-met') as HTMLInputElement;
  const channelSelect = modalContainer.querySelector('#ep-channel') as HTMLSelectElement;
  const bestTimeInput = modalContainer.querySelector('#ep-best-time') as HTMLInputElement;
  const interestsInput = modalContainer.querySelector('#ep-interests') as HTMLTextAreaElement;
  const sensitiveInput = modalContainer.querySelector('#ep-sensitive') as HTMLTextAreaElement;
  const notesInput = modalContainer.querySelector('#ep-notes') as HTMLTextAreaElement;

  nameInput?.addEventListener('input', (e) => { state.name = (e.target as HTMLInputElement).value; });
  emailInput?.addEventListener('input', (e) => { state.email = (e.target as HTMLInputElement).value; });
  phoneInput?.addEventListener('input', (e) => { state.phone = (e.target as HTMLInputElement).value; });
  howMetInput?.addEventListener('input', (e) => { state.howWeMet = (e.target as HTMLInputElement).value; });
  channelSelect?.addEventListener('change', (e) => { state.preferredChannel = (e.target as HTMLSelectElement).value; });
  bestTimeInput?.addEventListener('input', (e) => { state.bestTimeToReach = (e.target as HTMLInputElement).value; });
  interestsInput?.addEventListener('input', (e) => { state.interests = (e.target as HTMLTextAreaElement).value; });
  sensitiveInput?.addEventListener('input', (e) => { state.sensitiveTopics = (e.target as HTMLTextAreaElement).value; });
  notesInput?.addEventListener('input', (e) => { state.notes = (e.target as HTMLTextAreaElement).value; });
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeEditPerson();
  }
}

// ============================================================================
// SAVE / DELETE HANDLERS
// ============================================================================

async function handleSave(): Promise<void> {
  if (state.isSubmitting || !state.person) return;

  state.isSubmitting = true;
  render();

  try {
    const data: Partial<PersonData> = {
      name: state.name.trim(),
      relationship: state.relationship,
    };

    if (state.email.trim()) data.email = state.email.trim();
    if (state.phone.trim()) data.phone = state.phone.trim();
    if (state.howWeMet.trim()) data.howWeMet = state.howWeMet.trim();
    if (state.notes.trim()) data.notes = state.notes.trim();
    if (state.preferredChannel) data.preferredChannel = state.preferredChannel as PersonData['preferredChannel'];
    if (state.bestTimeToReach.trim()) data.bestTimeToReach = state.bestTimeToReach.trim();

    // Parse comma-separated fields
    if (state.interests.trim()) {
      data.interests = state.interests.split(',').map(i => i.trim()).filter(Boolean);
    }
    if (state.sensitiveTopics.trim()) {
      data.sensitiveTopics = state.sensitiveTopics.split(',').map(t => t.trim()).filter(Boolean);
    }

    const response = await apiFetch(`/api/contacts/${state.person.contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      toast.success(t('common.saved'));
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess({ ...state.person, ...data } as PersonData);
      }
      
      closeEditPerson();
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(error.error || t('editPerson.couldNotSave'));
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to save person:', error);
    toast.error(t('editPerson.couldNotSave'));
    state.isSubmitting = false;
    render();
  }
}

async function handleDelete(): Promise<void> {
  if (!state.person) return;

  try {
    const response = await apiFetch(`/api/contacts/${state.person.contactId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      toast.success(t('editPerson.removed', { name: state.name }));
      
      if (callbacks.onDelete) {
        callbacks.onDelete();
      }
      
      closeEditPerson();
    } else {
      toast.error(t('editPerson.couldNotRemove'));
    }
  } catch (error) {
    log.error('Failed to delete person:', error);
    toast.error(t('editPerson.couldNotRemove'));
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Edit Person modal
 */
export function openEditPerson(options: EditPersonOptions): void {
  closeEditPerson();
  
  injectStyles();

  const person = options.person;

  state = {
    isOpen: true,
    person,
    name: person.name || '',
    relationship: person.relationship || 'friend',
    email: person.email || '',
    phone: person.phone || '',
    howWeMet: person.howWeMet || '',
    notes: person.notes || '',
    interests: (person.interests || []).join(', '),
    sensitiveTopics: (person.sensitiveTopics || []).join(', '),
    preferredChannel: person.preferredChannel || '',
    bestTimeToReach: person.bestTimeToReach || '',
    isSubmitting: false,
    activeTab: 'basic',
    showDeleteConfirm: false,
  };

  callbacks = {
    onSuccess: options.onSuccess,
    onClose: options.onClose,
    onDelete: options.onDelete,
  };

  modalContainer = document.createElement('div');
  modalContainer.className = 'edit-person-overlay';
  modalContainer.innerHTML = `
    <div class="edit-person-backdrop"></div>
    <div class="edit-person-modal" role="dialog" aria-modal="true" aria-label="Edit person">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: person.contactId }, 'Opened Edit Person');
}

/**
 * Close the Edit Person modal
 */
export function closeEditPerson(): void {
  if (!modalContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);

  modalContainer.classList.remove('open');

  setTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
    
    if (callbacks.onClose) {
      callbacks.onClose();
    }
    callbacks = {};
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed Edit Person');
}

export const editPerson = {
  open: openEditPerson,
  close: closeEditPerson,
};

export default editPerson;

