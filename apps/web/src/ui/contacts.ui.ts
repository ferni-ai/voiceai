/**
 * Contacts Management UI
 *
 * "Better Than Human" contact management interface.
 * Add contacts, manage groups, track important dates, and view relationship insights.
 *
 * Design: Warm, organic design following Ferni brand guidelines.
 * No emojis. Clean typography. Earthy color palette.
 *
 * @module ui/contacts
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';

const log = createLogger('ContactsUI');

// ============================================================================
// TYPES
// ============================================================================

interface Contact {
  id: string;
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  notes?: string;
  importantDates?: Array<{
    date: string;
    type: string;
    label?: string;
  }>;
  strengthScore?: number;
  lastInteraction?: Date;
  groupIds?: string[];
}

interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  members: string[];
}

interface OutreachNudge {
  id: string;
  contactId: string;
  contactName: string;
  type: string;
  priority: string;
  message: string;
  suggestedChannel?: string;
  daysUntil?: number;
}

// ============================================================================
// STATE
// ============================================================================

let contacts: Contact[] = [];
let groups: ContactGroup[] = [];
let nudges: OutreachNudge[] = [];
let selectedContactId: string | null = null;
let isLoading = false;

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchContacts(): Promise<Contact[]> {
  try {
    const response = await apiFetch('/api/contacts');
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return await response.json();
  } catch (error) {
    log.error('Failed to fetch contacts:', error);
    return [];
  }
}

async function fetchGroups(): Promise<ContactGroup[]> {
  try {
    const response = await apiFetch('/api/contacts/groups');
    if (!response.ok) throw new Error('Failed to fetch groups');
    return await response.json();
  } catch (error) {
    log.error('Failed to fetch groups:', error);
    return [];
  }
}

async function fetchNudges(): Promise<OutreachNudge[]> {
  try {
    const response = await apiFetch('/api/contacts/nudges');
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    log.debug('Failed to fetch nudges:', error);
    return [];
  }
}

async function saveContact(contact: Partial<Contact>): Promise<Contact | null> {
  try {
    const method = contact.id ? 'PUT' : 'POST';
    const url = contact.id ? `/api/contacts/${contact.id}` : '/api/contacts';
    
    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    });
    
    if (!response.ok) throw new Error('Failed to save contact');
    return await response.json();
  } catch (error) {
    log.error('Failed to save contact:', error);
    return null;
  }
}

async function deleteContact(contactId: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/contacts/${contactId}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    log.error('Failed to delete contact:', error);
    return false;
  }
}

interface InteractionRecord {
  id: string;
  contactId: string;
  date: Date | string;
  type: string;
  direction: 'inbound' | 'outbound' | 'mutual';
  summary?: string;
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  duration?: number;
  location?: string;
  platform?: string;
  linkedGiftId?: string;
}

async function fetchInteractionHistory(contactId: string): Promise<InteractionRecord[]> {
  try {
    const response = await apiFetch(`/api/contacts/${contactId}/interactions`);
    if (!response.ok) throw new Error('Failed to fetch interactions');
    const data = await response.json();
    return data.history || [];
  } catch (error) {
    log.error('Failed to fetch interaction history:', error);
    return [];
  }
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the main contacts panel
 */
export function createContactsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'contacts-panel';
  panel.innerHTML = `
    <style>
      .contacts-panel {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .contacts-panel.open {
        opacity: 1;
        pointer-events: auto;
      }

      .contacts-backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
        backdrop-filter: blur(var(--glass-blur-strong, 24px));
        -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
      }

      .contacts-card {
        position: relative;
        width: 90%;
        max-width: 900px;
        max-height: 85vh;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95);
        transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .contacts-panel.open .contacts-card {
        transform: scale(1);
      }

      .contacts-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-6, 1.5rem);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
      }

      .contacts-header-left {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .contacts-eyebrow {
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--persona-primary, #4a6741);
      }

      .contacts-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        margin: 0;
        line-height: 1.2;
      }

      .contacts-close {
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
      }

      .contacts-close:hover {
        background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.05));
        color: var(--color-text-primary, #2C2520);
      }

      .contacts-close:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .contacts-body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .contacts-sidebar {
        width: 280px;
        border-right: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
        display: flex;
        flex-direction: column;
        background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      }

      .contacts-search {
        padding: var(--space-4, 1rem);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
      }

      .contacts-search input {
        width: 100%;
        padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-lg, 1rem);
        font-size: var(--text-sm, 0.875rem);
        background: var(--color-background-elevated, #FFFDFB);
        color: var(--color-text-primary, #2C2520);
        outline: none;
        transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
      }

      .contacts-search input:focus {
        border-color: var(--persona-primary, #4a6741);
        box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
      }

      .contacts-search input::placeholder {
        color: var(--color-text-muted, #70605a);
      }

      .contacts-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-2, 0.5rem);
      }

      .contact-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        border-radius: var(--radius-lg, 1rem);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
      }

      .contact-item:hover {
        background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      }

      .contact-item:active {
        transform: scale(0.98);
      }

      .contact-item.selected {
        background: var(--persona-tint, rgba(74, 103, 65, 0.12));
      }

      .contact-avatar {
        width: var(--space-10, 2.5rem);
        height: var(--space-10, 2.5rem);
        border-radius: var(--radius-full, 50%);
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: var(--text-base, 1rem);
        flex-shrink: 0;
      }

      .contact-info {
        flex: 1;
        min-width: 0;
      }

      .contact-name {
        font-weight: 500;
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2C2520);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
      }

      .contact-meta {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #70605a);
        margin-top: var(--space-0_5, 0.125rem);
      }

      .contact-strength {
        width: var(--space-2, 0.5rem);
        height: var(--space-2, 0.5rem);
        border-radius: var(--radius-full, 50%);
        flex-shrink: 0;
      }

      .contacts-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .contacts-detail {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-6, 1.5rem);
      }

      .contacts-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-muted, #70605a);
        text-align: center;
        padding: var(--space-10, 2.5rem);
      }

      .contacts-empty-icon {
        width: var(--space-16, 4rem);
        height: var(--space-16, 4rem);
        margin-bottom: var(--space-4, 1rem);
        opacity: 0.4;
        color: var(--color-text-dimmed, #9B8B7F);
      }

      .contacts-empty h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: 600;
        color: var(--color-text-secondary, #5a4a42);
        margin: 0 0 var(--space-2, 0.5rem);
      }

      .contacts-empty p {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #70605a);
        margin: 0;
        max-width: 280px;
        line-height: 1.5;
      }

      .add-contact-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-3, 0.75rem) var(--space-5, 1.25rem);
        margin: var(--space-4, 1rem);
        border: 2px dashed var(--color-border, rgba(44, 37, 32, 0.2));
        border-radius: var(--radius-lg, 1rem);
        background: transparent;
        color: var(--color-text-secondary, #5a4a42);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .add-contact-btn:hover {
        border-color: var(--persona-primary, #4a6741);
        color: var(--persona-primary, #4a6741);
        background: var(--persona-tint, rgba(74, 103, 65, 0.05));
      }

      .add-contact-btn:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .detail-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-5, 1.25rem);
        margin-bottom: var(--space-6, 1.5rem);
        padding-bottom: var(--space-6, 1.5rem);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .detail-avatar {
        width: var(--space-20, 5rem);
        height: var(--space-20, 5rem);
        border-radius: var(--radius-full, 50%);
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: var(--text-3xl, 1.875rem);
        flex-shrink: 0;
        box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
      }

      .detail-info {
        flex: 1;
        min-width: 0;
      }

      .detail-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-1, 0.25rem) 0;
        line-height: 1.2;
      }

      .detail-relationship {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5a4a42);
        text-transform: capitalize;
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .detail-relationship::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: var(--radius-full, 50%);
        background: var(--persona-primary, #4a6741);
      }

      .detail-section {
        margin-bottom: var(--space-6, 1.5rem);
      }

      .detail-section-title {
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted, #70605a);
        margin-bottom: var(--space-3, 0.75rem);
      }

      .detail-field {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem) 0;
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
      }

      .detail-field:last-child {
        border-bottom: none;
      }

      .detail-field-icon {
        width: var(--space-5, 1.25rem);
        height: var(--space-5, 1.25rem);
        color: var(--color-text-muted, #70605a);
        flex-shrink: 0;
      }

      .detail-field-value {
        flex: 1;
        color: var(--color-text-primary, #2C2520);
        font-size: var(--text-sm, 0.875rem);
      }

      .date-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
        background: var(--persona-tint, rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-lg, 1rem);
        margin-right: var(--space-2, 0.5rem);
        margin-bottom: var(--space-2, 0.5rem);
      }

      .date-badge-type {
        font-size: var(--text-xs, 0.75rem);
        color: var(--persona-primary, #4a6741);
        text-transform: capitalize;
        font-weight: 500;
      }

      .date-badge-date {
        font-size: var(--text-sm, 0.875rem);
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
      }

      .nudge-card {
        padding: var(--space-4, 1rem);
        background: var(--persona-tint, rgba(74, 103, 65, 0.06));
        border-radius: var(--radius-xl, 1.25rem);
        border-left: 3px solid var(--persona-primary, #4a6741);
        margin-bottom: var(--space-3, 0.75rem);
      }

      .nudge-title {
        font-weight: 600;
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2C2520);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .nudge-message {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5a4a42);
        line-height: 1.5;
      }

      .nudge-actions {
        display: flex;
        gap: var(--space-2, 0.5rem);
        margin-top: var(--space-3, 0.75rem);
      }

      .nudge-action {
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
        border-radius: var(--radius-lg, 1rem);
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .nudge-action-primary {
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        border: none;
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
      }

      .nudge-action-primary:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
      }

      .nudge-action-secondary {
        background: transparent;
        color: var(--persona-primary, #4a6741);
        border: 1px solid var(--persona-primary, #4a6741);
      }

      .nudge-action-secondary:hover {
        background: var(--persona-tint, rgba(74, 103, 65, 0.05));
      }

      .nudge-action:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .form-field {
        margin-bottom: var(--space-4, 1rem);
      }

      .form-label {
        display: block;
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        color: var(--color-text-secondary, #5a4a42);
        margin-bottom: var(--space-1_5, 0.375rem);
        letter-spacing: 0.02em;
      }

      .form-input {
        width: 100%;
        padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
        border: 2px solid var(--color-border, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-lg, 1rem);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-primary, #2C2520);
        background: var(--color-background-elevated, #FFFDFB);
        outline: none;
        transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
      }

      .form-input:focus {
        border-color: var(--persona-primary, #4a6741);
        box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
      }

      .form-input::placeholder {
        color: var(--color-text-muted, #9B8B7F);
      }

      .form-select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235a4a42' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right var(--space-3, 0.75rem) center;
        padding-right: var(--space-10, 2.5rem);
        cursor: pointer;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3, 0.75rem);
        padding-top: var(--space-5, 1.25rem);
        margin-top: var(--space-4, 1rem);
        border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .btn {
        padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
        border-radius: var(--radius-lg, 1rem);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 600;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .btn:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .btn-primary {
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        border: none;
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
      }

      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
      }

      .btn-primary:active {
        transform: translateY(0);
      }

      .btn-secondary {
        background: transparent;
        color: var(--color-text-secondary, #5a4a42);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.2));
      }

      .btn-secondary:hover {
        background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
        border-color: var(--color-text-muted, #70605a);
      }

      .btn-danger {
        background: transparent;
        color: var(--color-semantic-error, #c44);
        border: 1px solid var(--color-semantic-error, #c44);
      }

      .btn-danger:hover {
        background: rgba(204, 68, 68, 0.08);
      }

      .strength-bar {
        height: var(--space-1, 0.25rem);
        background: var(--color-border, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-full, 50%);
        overflow: hidden;
        margin-top: var(--space-2, 0.5rem);
      }

      .strength-fill {
        height: 100%;
        border-radius: var(--radius-full, 50%);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      /* ===================================================================
         RESPONSIVE DESIGN
         =================================================================== */
      @media (max-width: 768px) {
        .contacts-card {
          width: 95%;
          max-height: 90vh;
        }

        .contacts-body {
          flex-direction: column;
        }
        
        .contacts-sidebar {
          width: 100%;
          border-right: none;
          border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
          max-height: 220px;
        }

        .contacts-header {
          padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
        }

        .contacts-detail {
          padding: var(--space-4, 1rem);
        }

        .detail-header {
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--space-4, 1rem);
        }

        .detail-relationship::before {
          display: none;
        }
      }

      /* ===================================================================
         INTERACTION HISTORY TIMELINE
         =================================================================== */
      .interaction-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-3, 0.75rem) 0;
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
      }

      .interaction-item:last-child {
        border-bottom: none;
      }

      .interaction-row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        width: 100%;
      }

      .interaction-icon {
        width: var(--space-5, 1.25rem);
        height: var(--space-5, 1.25rem);
        color: var(--color-text-muted, #70605a);
        flex-shrink: 0;
      }

      .interaction-content {
        flex: 1;
        min-width: 0;
      }

      .interaction-title {
        font-weight: 500;
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #2C2520);
      }

      .interaction-meta {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #70605a);
        margin-top: var(--space-0_5, 0.125rem);
      }

      .interaction-indicator {
        width: var(--space-2, 0.5rem);
        height: var(--space-2, 0.5rem);
        border-radius: var(--radius-full, 50%);
        flex-shrink: 0;
      }

      .interaction-summary {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5a4a42);
        padding-left: var(--space-8, 2rem);
        line-height: 1.5;
      }

      .interaction-topics {
        display: flex;
        gap: var(--space-1_5, 0.375rem);
        flex-wrap: wrap;
        padding-left: var(--space-8, 2rem);
      }

      .interaction-topic {
        padding: var(--space-0_5, 0.125rem) var(--space-2, 0.5rem);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-full, 50%);
        font-size: var(--text-xs, 0.75rem);
        color: var(--persona-primary, #4a6741);
        font-weight: 500;
      }

      /* ===================================================================
         SENTIMENT BUTTONS
         =================================================================== */
      .sentiment-group {
        display: flex;
        gap: var(--space-2, 0.5rem);
      }

      .sentiment-btn {
        flex: 1;
        padding: var(--space-3, 0.75rem);
        border-radius: var(--radius-lg, 1rem);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
        background: var(--color-background-elevated, #FFFDFB);
        color: var(--color-text-secondary, #5a4a42);
        border: 2px solid var(--color-border, rgba(44, 37, 32, 0.12));
      }

      .sentiment-btn:hover {
        border-color: var(--color-text-muted, #70605a);
      }

      .sentiment-btn.selected {
        border-color: var(--persona-primary, #4a6741);
        background: var(--persona-tint, rgba(74, 103, 65, 0.08));
        color: var(--persona-primary, #4a6741);
      }

      .sentiment-btn:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      /* ===================================================================
         LOADING & EMPTY STATES
         =================================================================== */
      .loading-state,
      .empty-state {
        padding: var(--space-10, 2.5rem);
        text-align: center;
        color: var(--color-text-muted, #70605a);
      }

      .loading-state p,
      .empty-state p {
        margin: 0;
        font-size: var(--text-sm, 0.875rem);
        line-height: 1.5;
      }

      .empty-state p + p {
        margin-top: var(--space-2, 0.5rem);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-dimmed, #9B8B7F);
      }

      .notes-text {
        color: var(--color-text-secondary, #5a4a42);
        line-height: 1.6;
        margin: 0;
        font-size: var(--text-sm, 0.875rem);
      }

      .btn-icon {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1_5, 0.375rem);
      }

      .btn-icon svg {
        width: var(--space-4, 1rem);
        height: var(--space-4, 1rem);
        flex-shrink: 0;
      }

      /* ===================================================================
         REDUCED MOTION
         =================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .contacts-panel,
        .contacts-card,
        .contact-item,
        .btn,
        .nudge-action,
        .form-input,
        .sentiment-btn {
          transition: none;
        }
      }
    </style>

    <div class="contacts-backdrop"></div>
    <div class="contacts-card">
      <div class="contacts-header">
        <div class="contacts-header-left">
          <span class="contacts-eyebrow">Your People</span>
          <h2 class="contacts-title">Contacts</h2>
        </div>
        <button class="contacts-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="contacts-body">
        <div class="contacts-sidebar">
          <div class="contacts-search">
            <input type="text" placeholder="Search contacts..." />
          </div>
          <div class="contacts-list" id="contacts-list"></div>
          <button class="add-contact-btn" id="add-contact-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add Contact
          </button>
        </div>
        <div class="contacts-main">
          <div class="contacts-detail" id="contacts-detail"></div>
        </div>
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = panel.querySelector('.contacts-backdrop') as HTMLElement;
  const closeBtn = panel.querySelector('.contacts-close') as HTMLElement;
  const searchInput = panel.querySelector('.contacts-search input') as HTMLInputElement;
  const addBtn = panel.querySelector('#add-contact-btn') as HTMLElement;

  backdrop.addEventListener('click', () => closeContactsPanel());
  closeBtn.addEventListener('click', () => closeContactsPanel());
  
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    filterContacts(query);
  });

  addBtn.addEventListener('click', () => showContactForm());

  return panel;
}

/**
 * Open contacts panel
 */
export async function openContactsPanel(): Promise<void> {
  cleanupOrphanedPanels();
  
  let panel = document.querySelector('.contacts-panel') as HTMLElement;
  if (!panel) {
    panel = createContactsPanel();
    document.body.appendChild(panel);
  }

  // Load data
  isLoading = true;
  renderContactsList([]);
  renderDetailPlaceholder();

  [contacts, groups, nudges] = await Promise.all([
    fetchContacts(),
    fetchGroups(),
    fetchNudges(),
  ]);

  isLoading = false;
  renderContactsList(contacts);

  // Show first contact or nudges
  if (nudges.length > 0) {
    renderNudgesView();
  } else if (contacts.length > 0) {
    selectContact(contacts[0].contactId);
  } else {
    renderEmptyState();
  }

  // Animate open
  requestAnimationFrame(() => {
    panel.classList.add('open');
  });
}

/**
 * Close contacts panel
 */
export function closeContactsPanel(): void {
  const panel = document.querySelector('.contacts-panel') as HTMLElement;
  if (panel) {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), DURATION.NORMAL);
  }
}

/**
 * Filter contacts by search query
 */
function filterContacts(query: string): void {
  const filtered = query
    ? contacts.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phone?.includes(query)
      )
    : contacts;
  
  renderContactsList(filtered);
}

/**
 * Select a contact
 */
function selectContact(contactId: string): void {
  selectedContactId = contactId;
  
  // Update list selection
  document.querySelectorAll('.contact-item').forEach(item => {
    item.classList.toggle('selected', item.getAttribute('data-id') === contactId);
  });

  const contact = contacts.find(c => c.contactId === contactId);
  if (contact) {
    renderContactDetail(contact);
  }
}

/**
 * Render contacts list
 */
function renderContactsList(contactsList: Contact[]): void {
  const listEl = document.getElementById('contacts-list');
  if (!listEl) return;

  if (isLoading) {
    listEl.innerHTML = `
      <div class="loading-state">
        <p>Loading...</p>
      </div>
    `;
    return;
  }

  if (contactsList.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>No contacts yet</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = contactsList.map(contact => {
    const initials = getInitials(contact.name);
    const strengthColor = getStrengthColor(contact.strengthScore || 50);
    const isSelected = contact.contactId === selectedContactId;

    return `
      <div class="contact-item ${isSelected ? 'selected' : ''}" data-id="${contact.contactId}">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
          <div class="contact-name">${escapeHtml(contact.name)}</div>
          <div class="contact-meta">${contact.relationship || 'Contact'}</div>
        </div>
        <div class="contact-strength" style="background: ${strengthColor};"></div>
      </div>
    `;
  }).join('');

  // Add click listeners
  listEl.querySelectorAll('.contact-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectContact(id);
    });
  });
}

/**
 * Render contact detail view
 */
function renderContactDetail(contact: Contact): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  const initials = getInitials(contact.name);
  const strengthPercent = contact.strengthScore || 50;
  const strengthColor = getStrengthColor(strengthPercent);

  detailEl.innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar">${initials}</div>
      <div class="detail-info">
        <h3 class="detail-name">${escapeHtml(contact.name)}</h3>
        <span class="detail-relationship">${contact.relationship || 'Contact'}</span>
        <div class="strength-bar">
          <div class="strength-fill" style="width: ${strengthPercent}%; background: ${strengthColor};"></div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Contact Info</div>
      ${contact.email ? `
        <div class="detail-field">
          <svg class="detail-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          <span class="detail-field-value">${escapeHtml(contact.email)}</span>
        </div>
      ` : ''}
      ${contact.phone ? `
        <div class="detail-field">
          <svg class="detail-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <span class="detail-field-value">${escapeHtml(contact.phone)}</span>
        </div>
      ` : ''}
    </div>

    ${contact.importantDates && contact.importantDates.length > 0 ? `
      <div class="detail-section">
        <div class="detail-section-title">Important Dates</div>
        <div>
          ${contact.importantDates.map(d => `
            <div class="date-badge">
              <span class="date-badge-type">${d.type}</span>
              <span class="date-badge-date">${d.date}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${contact.notes ? `
      <div class="detail-section">
        <div class="detail-section-title">Notes</div>
        <p class="notes-text">${escapeHtml(contact.notes)}</p>
      </div>
    ` : ''}

    <div class="form-actions">
      <button class="btn btn-secondary" id="edit-contact-btn">Edit</button>
      <button class="btn btn-secondary btn-icon" id="view-gifts-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/>
          <rect x="2" y="7" width="20" height="5" rx="2"/>
          <path d="M12 22V7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        Gifts
      </button>
      <button class="btn btn-secondary btn-icon" id="view-history-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        History
      </button>
      <button class="btn btn-danger" id="delete-contact-btn">Delete</button>
      <button class="btn btn-primary" id="message-contact-btn">Send Message</button>
    </div>
  `;

  // Event listeners
  detailEl.querySelector('#edit-contact-btn')?.addEventListener('click', () => {
    showContactForm(contact);
  });

  detailEl.querySelector('#view-gifts-btn')?.addEventListener('click', () => {
    // Open gifts panel for this contact
    document.dispatchEvent(new CustomEvent('ferni:open-gifts', {
      detail: { contactId: contact.contactId }
    }));
    closeContactsPanel();
  });

  detailEl.querySelector('#view-history-btn')?.addEventListener('click', () => {
    showInteractionHistory(contact);
  });

  detailEl.querySelector('#delete-contact-btn')?.addEventListener('click', async () => {
    if (confirm(`Remove ${contact.name} from your contacts?`)) {
      const success = await deleteContact(contact.contactId);
      if (success) {
        toast.success('Contact removed');
        contacts = contacts.filter(c => c.contactId !== contact.contactId);
        renderContactsList(contacts);
        if (contacts.length > 0) {
          selectContact(contacts[0].contactId);
        } else {
          renderEmptyState();
        }
      } else {
        toast.error('Could not remove contact');
      }
    }
  });

  detailEl.querySelector('#message-contact-btn')?.addEventListener('click', () => {
    // Dispatch event for Alex to handle
    document.dispatchEvent(new CustomEvent('ferni:send-message', {
      detail: { contactId: contact.contactId, contactName: contact.name }
    }));
    closeContactsPanel();
  });
}

/**
 * Render nudges view
 */
function renderNudgesView(): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  detailEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Suggested Outreach</div>
      ${nudges.map(nudge => `
        <div class="nudge-card" data-id="${nudge.id}">
          <div class="nudge-title">${escapeHtml(nudge.contactName)}</div>
          <div class="nudge-message">${escapeHtml(nudge.message)}</div>
          <div class="nudge-actions">
            <button class="nudge-action nudge-action-primary" data-action="send">
              Send ${nudge.suggestedChannel || 'Message'}
            </button>
            <button class="nudge-action nudge-action-secondary" data-action="view">
              View Contact
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Event listeners
  detailEl.querySelectorAll('.nudge-card').forEach(card => {
    const nudgeId = card.getAttribute('data-id');
    const nudge = nudges.find(n => n.id === nudgeId);
    if (!nudge) return;

    card.querySelector('[data-action="send"]')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('ferni:send-message', {
        detail: { contactId: nudge.contactId, contactName: nudge.contactName }
      }));
      closeContactsPanel();
    });

    card.querySelector('[data-action="view"]')?.addEventListener('click', () => {
      selectContact(nudge.contactId);
    });
  });
}

/**
 * Show interaction history for a contact
 * 
 * "Better Than Human" - Perfect memory of every interaction
 */
async function showInteractionHistory(contact: Contact): Promise<void> {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  // Show loading
  detailEl.innerHTML = `
    <div class="loading-state">
      <p>Loading interaction history...</p>
    </div>
  `;

  const history = await fetchInteractionHistory(contact.contactId);

  if (history.length === 0) {
    detailEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-avatar">${getInitials(contact.name)}</div>
        <div class="detail-info">
          <h3 class="detail-name">${escapeHtml(contact.name)}</h3>
          <span class="detail-relationship">Interaction History</span>
        </div>
      </div>
      <div class="empty-state">
        <p>No interactions recorded yet</p>
        <p>Interactions are automatically tracked as you connect</p>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" id="back-btn">Back to Contact</button>
      </div>
    `;

    detailEl.querySelector('#back-btn')?.addEventListener('click', () => {
      renderContactDetail(contact);
    });
    return;
  }

  // Group by month
  const grouped = history.reduce((acc, interaction) => {
    const date = new Date(interaction.date);
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(interaction);
    return acc;
  }, {} as Record<string, InteractionRecord[]>);

  detailEl.innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar">${getInitials(contact.name)}</div>
      <div class="detail-info">
        <h3 class="detail-name">${escapeHtml(contact.name)}</h3>
        <span class="detail-relationship">${history.length} Interactions</span>
      </div>
    </div>
    
    ${Object.entries(grouped).map(([month, interactions]) => `
      <div class="detail-section">
        <div class="detail-section-title">${month}</div>
        ${interactions.map(interaction => {
          const date = new Date(interaction.date);
          const typeIcon = getInteractionIcon(interaction.type);
          const sentimentColor = interaction.sentiment === 'positive' ? 'var(--persona-primary, #4a6741)' : 
                                 interaction.sentiment === 'negative' ? 'var(--color-semantic-error, #c44)' : 'var(--color-text-muted, #70605a)';
          
          return `
            <div class="interaction-item">
              <div class="interaction-row">
                <div class="interaction-icon">${typeIcon}</div>
                <div class="interaction-content">
                  <div class="interaction-title">
                    ${formatInteractionType(interaction.type)}
                    ${interaction.direction === 'inbound' ? '(received)' : interaction.direction === 'outbound' ? '(sent)' : ''}
                  </div>
                  <div class="interaction-meta">
                    ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    ${interaction.duration ? ` · ${interaction.duration} min` : ''}
                    ${interaction.platform ? ` · ${interaction.platform}` : ''}
                  </div>
                </div>
                <div class="interaction-indicator" style="background: ${sentimentColor};"></div>
              </div>
              ${interaction.summary ? `
                <div class="interaction-summary">${escapeHtml(interaction.summary)}</div>
              ` : ''}
              ${interaction.topics && interaction.topics.length > 0 ? `
                <div class="interaction-topics">
                  ${interaction.topics.map(topic => `
                    <span class="interaction-topic">${escapeHtml(topic)}</span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `).join('')}
    
    <div class="form-actions">
      <button class="btn btn-secondary" id="back-btn">Back to Contact</button>
      <button class="btn btn-primary" id="record-interaction-btn">Record Interaction</button>
    </div>
  `;

  detailEl.querySelector('#back-btn')?.addEventListener('click', () => {
    renderContactDetail(contact);
  });

  detailEl.querySelector('#record-interaction-btn')?.addEventListener('click', () => {
    showRecordInteractionForm(contact);
  });
}

/**
 * Show form to record a new interaction
 */
function showRecordInteractionForm(contact: Contact): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  detailEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Record Interaction with ${escapeHtml(contact.name)}</div>
      
      <div class="form-field">
        <label class="form-label">Type</label>
        <select class="form-input form-select" id="interaction-type">
          <option value="call">Phone Call</option>
          <option value="text">Text Message</option>
          <option value="email">Email</option>
          <option value="video_call">Video Call</option>
          <option value="in_person">In Person</option>
          <option value="social_media">Social Media</option>
          <option value="shared_activity">Shared Activity</option>
          <option value="voice_message">Voice Message</option>
          <option value="card_letter">Card/Letter</option>
          <option value="gift">Gift</option>
          <option value="meeting">Meeting</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">Direction</label>
        <select class="form-input form-select" id="interaction-direction">
          <option value="outbound">I reached out</option>
          <option value="inbound">They reached out</option>
          <option value="mutual">Mutual/Together</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">Summary (optional)</label>
        <textarea class="form-input" id="interaction-summary" rows="3" placeholder="What did you talk about or do together?"></textarea>
      </div>

      <div class="form-field">
        <label class="form-label">How did it feel?</label>
        <div class="sentiment-group">
          <button class="sentiment-btn" data-sentiment="positive">Good</button>
          <button class="sentiment-btn" data-sentiment="neutral">Neutral</button>
          <button class="sentiment-btn" data-sentiment="negative">Not great</button>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="save-btn">Save Interaction</button>
      </div>
    </div>
  `;

  let selectedSentiment: string = 'positive';

  // Sentiment buttons
  detailEl.querySelectorAll('.sentiment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      detailEl.querySelectorAll('.sentiment-btn').forEach(b => b.classList.remove('btn-primary'));
      detailEl.querySelectorAll('.sentiment-btn').forEach(b => b.classList.add('btn-secondary'));
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
      selectedSentiment = btn.getAttribute('data-sentiment') || 'neutral';
    });
  });

  // Default to positive
  detailEl.querySelector('[data-sentiment="positive"]')?.classList.add('btn-primary');
  detailEl.querySelector('[data-sentiment="positive"]')?.classList.remove('btn-secondary');

  detailEl.querySelector('#cancel-btn')?.addEventListener('click', () => {
    showInteractionHistory(contact);
  });

  detailEl.querySelector('#save-btn')?.addEventListener('click', async () => {
    const type = (document.getElementById('interaction-type') as HTMLSelectElement).value;
    const direction = (document.getElementById('interaction-direction') as HTMLSelectElement).value;
    const summary = (document.getElementById('interaction-summary') as HTMLTextAreaElement).value.trim();

    try {
      const response = await apiFetch(`/api/contacts/${contact.contactId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          direction,
          summary: summary || undefined,
          sentiment: selectedSentiment,
        }),
      });

      if (response.ok) {
        toast.success('Interaction recorded');
        showInteractionHistory(contact);
      } else {
        toast.error('Could not save interaction');
      }
    } catch (error) {
      log.error('Failed to save interaction:', error);
      toast.error('Could not save interaction');
    }
  });
}

/**
 * Get icon for interaction type
 */
function getInteractionIcon(type: string): string {
  const icons: Record<string, string> = {
    call: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    text: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    email: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    video_call: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
    in_person: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    social_media: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
    shared_activity: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
    voice_message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
    card_letter: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/><rect x="2" y="7" width="20" height="5" rx="2"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    meeting: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
    financial: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  };

  return icons[type] || `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="detail-field-icon"><circle cx="12" cy="12" r="10"/></svg>`;
}

/**
 * Format interaction type for display
 */
function formatInteractionType(type: string): string {
  const formats: Record<string, string> = {
    call: 'Phone Call',
    text: 'Text Message',
    email: 'Email',
    video_call: 'Video Call',
    in_person: 'In Person',
    social_media: 'Social Media',
    shared_activity: 'Shared Activity',
    voice_message: 'Voice Message',
    card_letter: 'Card/Letter',
    gift: 'Gift',
    meeting: 'Meeting',
    financial: 'Financial',
    other: 'Other',
  };

  return formats[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/**
 * Show contact form (add/edit)
 */
function showContactForm(contact?: Contact): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  const isEdit = !!contact;

  detailEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">${isEdit ? 'Edit Contact' : 'Add New Contact'}</div>
      
      <div class="form-field">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="form-name" value="${isEdit ? escapeHtml(contact.name) : ''}" placeholder="Full name" />
      </div>

      <div class="form-field">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" id="form-email" value="${isEdit && contact.email ? escapeHtml(contact.email) : ''}" placeholder="email@example.com" />
      </div>

      <div class="form-field">
        <label class="form-label">Phone</label>
        <input type="tel" class="form-input" id="form-phone" value="${isEdit && contact.phone ? escapeHtml(contact.phone) : ''}" placeholder="+1 555 123 4567" />
      </div>

      <div class="form-field">
        <label class="form-label">Relationship</label>
        <select class="form-input form-select" id="form-relationship">
          <option value="friend" ${contact?.relationship === 'friend' ? 'selected' : ''}>Friend</option>
          <option value="family" ${contact?.relationship === 'family' ? 'selected' : ''}>Family</option>
          <option value="work" ${contact?.relationship === 'work' ? 'selected' : ''}>Work</option>
          <option value="mentor" ${contact?.relationship === 'mentor' ? 'selected' : ''}>Mentor</option>
          <option value="other" ${contact?.relationship === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">Notes</label>
        <textarea class="form-input" id="form-notes" rows="3" placeholder="Anything to remember...">${isEdit && contact.notes ? escapeHtml(contact.notes) : ''}</textarea>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" id="form-cancel">Cancel</button>
        <button class="btn btn-primary" id="form-save">${isEdit ? 'Save Changes' : 'Add Contact'}</button>
      </div>
    </div>
  `;

  // Event listeners
  detailEl.querySelector('#form-cancel')?.addEventListener('click', () => {
    if (contact) {
      renderContactDetail(contact);
    } else if (contacts.length > 0) {
      selectContact(contacts[0].contactId);
    } else {
      renderEmptyState();
    }
  });

  detailEl.querySelector('#form-save')?.addEventListener('click', async () => {
    const name = (document.getElementById('form-name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('form-email') as HTMLInputElement).value.trim();
    const phone = (document.getElementById('form-phone') as HTMLInputElement).value.trim();
    const relationship = (document.getElementById('form-relationship') as HTMLSelectElement).value;
    const notes = (document.getElementById('form-notes') as HTMLTextAreaElement).value.trim();

    if (!name) {
      toast.warning('Name is required');
      return;
    }

    if (!email && !phone) {
      toast.warning('Email or phone is required');
      return;
    }

    const contactData: Partial<Contact> = {
      id: contact?.id,
      contactId: contact?.contactId || email || phone || `contact_${Date.now()}`,
      name,
      email: email || undefined,
      phone: phone || undefined,
      relationship,
      notes: notes || undefined,
    };

    const saved = await saveContact(contactData);
    if (saved) {
      toast.success(isEdit ? 'Contact updated' : 'Contact added');
      
      // Update local state
      if (isEdit) {
        const idx = contacts.findIndex(c => c.contactId === contact.contactId);
        if (idx >= 0) contacts[idx] = saved;
      } else {
        contacts.push(saved);
      }
      
      renderContactsList(contacts);
      selectContact(saved.contactId);
    } else {
      toast.error('Could not save contact');
    }
  });
}

/**
 * Render empty state
 */
function renderEmptyState(): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  detailEl.innerHTML = `
    <div class="contacts-empty">
      <svg class="contacts-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <h3>No contacts yet</h3>
      <p>Add someone you care about to get started</p>
    </div>
  `;
}

/**
 * Render detail placeholder
 */
function renderDetailPlaceholder(): void {
  const detailEl = document.getElementById('contacts-detail');
  if (!detailEl) return;

  detailEl.innerHTML = `
    <div class="contacts-empty">
      <p>Loading...</p>
    </div>
  `;
}

// ============================================================================
// HELPERS
// ============================================================================

function cleanupOrphanedPanels(): void {
  document.querySelectorAll('.contacts-panel').forEach(el => el.remove());
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getStrengthColor(score: number): string {
  // Use CSS custom properties for brand-compliant colors
  if (score >= 70) return 'var(--persona-primary, var(--color-ferni))'; // Strong
  if (score >= 40) return 'var(--nayan-primary, var(--color-nayan))'; // Medium
  return 'var(--color-semantic-error, var(--color-error))'; // Needs attention
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initContactsUI(): void {
  // Listen for open contacts event
  document.addEventListener('ferni:open-contacts', () => {
    openContactsPanel();
  });

  log.debug('Contacts UI initialized');
}

export default {
  init: initContactsUI,
  open: openContactsPanel,
  close: closeContactsPanel,
};

