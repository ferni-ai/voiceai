/**
 * Add Person UI
 *
 * Quick-capture form for adding someone you care about.
 * Start tracking your relationship from day one.
 *
 * Design Philosophy:
 * - Quick add: Name + relationship is enough to start
 * - Optional depth: Add details as you go
 * - Every detail helps Ferni help you
 *
 * @module ui/add-person
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { addMockContact } from '../data/mock-contacts.js';

const log = createLogger('AddPersonUI');

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

export interface AddPersonData {
  name: string;
  relationship: RelationshipType;
  email?: string;
  phone?: string;
  howWeMet?: string;
  birthday?: string;
  notes?: string;
}

export interface AddPersonOptions {
  onSuccess?: (data: AddPersonData & { id: string }) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface AddPersonState {
  isOpen: boolean;
  name: string;
  relationship: RelationshipType;
  email: string;
  phone: string;
  howWeMet: string;
  birthday: string;
  notes: string;
  isSubmitting: boolean;
  showAdvanced: boolean;
}

let state: AddPersonState = {
  isOpen: false,
  name: '',
  relationship: 'friend',
  email: '',
  phone: '',
  howWeMet: '',
  birthday: '',
  notes: '',
  isSubmitting: false,
  showAdvanced: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSuccess?: (data: AddPersonData & { id: string }) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  briefcase: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  userPlus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" x2="20" y1="8" y2="14"/><line x1="23" x2="17" y1="11" y2="11"/></svg>`,
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

// Relationship type definitions
const RELATIONSHIP_TYPES: { id: RelationshipType; label: string; icon: string }[] = [
  { id: 'family', label: 'Family', icon: ICONS.home },
  { id: 'friend', label: 'Friend', icon: ICONS.heart },
  { id: 'colleague', label: 'Colleague', icon: ICONS.briefcase },
  { id: 'mentor', label: 'Mentor', icon: ICONS.star },
  { id: 'acquaintance', label: 'Acquaintance', icon: ICONS.userPlus },
  { id: 'other', label: 'Other', icon: ICONS.users },
];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('add-person-styles')) return;

  const style = document.createElement('style');
  style.id = 'add-person-styles';
  style.textContent = `
    /* =========================================================================
       ADD PERSON - Add Someone You Care About
       ========================================================================= */
    
    .add-person-overlay {
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

    .add-person-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .add-person-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .add-person-modal {
      position: relative;
      width: 94%;
      max-width: clamp(308px, 90vw, 440px);
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

    .add-person-overlay.open .add-person-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .ap-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .ap-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .ap-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .ap-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .ap-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      margin-top: var(--space-1, 0.25rem);
    }

    .ap-close {
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

    .ap-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .ap-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    .ap-section {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ap-section:last-child {
      margin-bottom: 0;
    }

    .ap-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: block;
    }

    /* =========================================================================
       INPUT FIELDS
       ========================================================================= */
    
    .ap-input {
      width: 100%;
      padding: var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-base, 1rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .ap-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    .ap-input::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    .ap-input-sm {
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      font-size: var(--text-sm, 0.875rem);
    }

    /* =========================================================================
       RELATIONSHIP SELECTOR
       ========================================================================= */
    
    .ap-relationships {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-2, 0.5rem);
    }

    .ap-relationship {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-3, 0.75rem) var(--space-2, 0.5rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ap-relationship:hover {
      border-color: var(--color-text-muted, #70605a);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.03));
    }

    .ap-relationship.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .ap-relationship-icon {
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .ap-relationship.selected .ap-relationship-icon {
      color: var(--persona-primary, #4a6741);
    }

    .ap-relationship-icon svg {
      width: 20px;
      height: 20px;
    }

    .ap-relationship-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .ap-relationship.selected .ap-relationship-label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    /* =========================================================================
       ADVANCED OPTIONS
       ========================================================================= */
    
    .ap-advanced-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: 0;
      border: none;
      background: none;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: color ${DURATION.FAST}ms;
    }

    .ap-advanced-toggle:hover {
      color: var(--persona-primary, #4a6741);
    }

    .ap-advanced-toggle svg {
      transition: transform ${DURATION.FAST}ms;
    }

    .ap-advanced-toggle.open svg {
      transform: rotate(180deg);
    }

    .ap-advanced-content {
      display: none;
      margin-top: var(--space-4, 1rem);
    }

    .ap-advanced-content.open {
      display: block;
    }

    .ap-row {
      display: flex;
      gap: var(--space-3, 0.75rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .ap-field {
      flex: 1;
    }

    .ap-textarea {
      width: 100%;
      min-height: 60px;
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

    .ap-textarea:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .ap-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .ap-btn {
      flex: 1;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ap-btn-secondary {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .ap-btn-secondary:hover {
      border-color: var(--color-text-muted, #70605a);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
    }

    .ap-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .ap-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .ap-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .add-person-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .ap-relationships {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .add-person-overlay,
      .add-person-modal,
      .ap-relationship,
      .ap-btn,
      .ap-close {
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

  const modal = modalContainer.querySelector('.add-person-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="ap-header">
      <div class="ap-header-row">
        <div>
          <div class="ap-eyebrow">Your People</div>
          <h2 class="ap-title">Add Someone</h2>
          <p class="ap-subtitle">Tell me about someone you care about</p>
        </div>
        <button class="ap-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="ap-content">
      <!-- Name -->
      <div class="ap-section">
        <label class="ap-label">Their name</label>
        <input type="text" class="ap-input" id="ap-name" placeholder="e.g., Mom, Sarah Chen, Dr. Rivera" value="${escapeHtml(state.name)}" autofocus />
      </div>
      
      <!-- Relationship Type -->
      <div class="ap-section">
        <label class="ap-label">How do you know them?</label>
        <div class="ap-relationships">
          ${RELATIONSHIP_TYPES.map(rel => `
            <button class="ap-relationship ${state.relationship === rel.id ? 'selected' : ''}" data-relationship="${rel.id}">
              <span class="ap-relationship-icon">${rel.icon}</span>
              <span class="ap-relationship-label">${rel.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      
      <!-- Advanced Options -->
      <div class="ap-section">
        <button aria-label="Move down" class="ap-advanced-toggle ${state.showAdvanced ? 'open' : ''}" id="ap-advanced-toggle">
          Add more details ${ICONS.chevronDown}
        </button>
        
        <div class="ap-advanced-content ${state.showAdvanced ? 'open' : ''}" id="ap-advanced-content">
          <div class="ap-row">
            <div class="ap-field">
              <label class="ap-label">Email</label>
              <input type="email" class="ap-input ap-input-sm" id="ap-email" placeholder="email@example.com" value="${escapeHtml(state.email)}" />
            </div>
            <div class="ap-field">
              <label class="ap-label">Phone</label>
              <input type="tel" class="ap-input ap-input-sm" id="ap-phone" placeholder="+1 555 123 4567" value="${escapeHtml(state.phone)}" />
            </div>
          </div>
          
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="ap-label">Birthday</label>
            <input type="date" class="ap-input ap-input-sm" id="ap-birthday" value="${state.birthday}" />
          </div>
          
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="ap-label">How did you meet?</label>
            <input type="text" class="ap-input ap-input-sm" id="ap-how-met" placeholder="e.g., College roommate, Met at work" value="${escapeHtml(state.howWeMet)}" />
          </div>
          
          <div>
            <label class="ap-label">Notes</label>
            <textarea class="ap-textarea" id="ap-notes" placeholder="Anything else to remember...">${escapeHtml(state.notes)}</textarea>
          </div>
        </div>
      </div>
    </div>
    
    <div class="ap-footer">
      <button aria-label="Cancel" class="ap-btn ap-btn-secondary" id="ap-cancel">Cancel</button>
      <button aria-label="Submit" class="ap-btn ap-btn-primary" id="ap-save" ${state.isSubmitting || !state.name.trim() ? 'disabled' : ''}>
        ${state.isSubmitting ? 'Adding...' : 'Add Person'}
      </button>
    </div>
  `;

  bindEvents();
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.ap-close')?.addEventListener('click', closeAddPerson);
  modalContainer.querySelector('.add-person-backdrop')?.addEventListener('click', closeAddPerson);
  modalContainer.querySelector('#ap-cancel')?.addEventListener('click', closeAddPerson);

  // Relationship selection
  modalContainer.querySelectorAll('.ap-relationship').forEach(btn => {
    btn.addEventListener('click', () => {
      const relationship = btn.getAttribute('data-relationship') as RelationshipType;
      if (relationship) {
        state.relationship = relationship;
        render();
      }
    });
  });

  // Advanced toggle
  modalContainer.querySelector('#ap-advanced-toggle')?.addEventListener('click', () => {
    state.showAdvanced = !state.showAdvanced;
    render();
  });

  // Input fields
  const nameInput = modalContainer.querySelector('#ap-name') as HTMLInputElement;
  const emailInput = modalContainer.querySelector('#ap-email') as HTMLInputElement;
  const phoneInput = modalContainer.querySelector('#ap-phone') as HTMLInputElement;
  const birthdayInput = modalContainer.querySelector('#ap-birthday') as HTMLInputElement;
  const howMetInput = modalContainer.querySelector('#ap-how-met') as HTMLInputElement;
  const notesInput = modalContainer.querySelector('#ap-notes') as HTMLTextAreaElement;

  nameInput?.addEventListener('input', (e) => { 
    state.name = (e.target as HTMLInputElement).value;
    // Enable/disable save button based on name
    const saveBtn = modalContainer?.querySelector('#ap-save') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = !state.name.trim() || state.isSubmitting;
    }
  });
  emailInput?.addEventListener('input', (e) => { state.email = (e.target as HTMLInputElement).value; });
  phoneInput?.addEventListener('input', (e) => { state.phone = (e.target as HTMLInputElement).value; });
  birthdayInput?.addEventListener('change', (e) => { state.birthday = (e.target as HTMLInputElement).value; });
  howMetInput?.addEventListener('input', (e) => { state.howWeMet = (e.target as HTMLInputElement).value; });
  notesInput?.addEventListener('input', (e) => { state.notes = (e.target as HTMLTextAreaElement).value; });

  // Save button
  modalContainer.querySelector('#ap-save')?.addEventListener('click', handleSave);

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);

  // Focus name input
  nameInput?.focus();
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeAddPerson();
  }
}

// ============================================================================
// SAVE HANDLER
// ============================================================================

async function handleSave(): Promise<void> {
  if (state.isSubmitting || !state.name.trim()) return;

  state.isSubmitting = true;
  render();

  try {
    const data: AddPersonData = {
      name: state.name.trim(),
      relationship: state.relationship,
    };

    if (state.email.trim()) {
      data.email = state.email.trim();
    }

    if (state.phone.trim()) {
      data.phone = state.phone.trim();
    }

    if (state.howWeMet.trim()) {
      data.howWeMet = state.howWeMet.trim();
    }

    if (state.birthday) {
      data.birthday = state.birthday;
    }

    if (state.notes.trim()) {
      data.notes = state.notes.trim();
    }

    // Send to API
    const response = await apiFetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      toast.success(`${data.name} added!`);
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess({ ...data, id: result.id || result.contactId });
      }
      
      closeAddPerson();
    } else {
      // In dev mode, fall back to mock data
      if (shouldUseDemoData()) {
        log.debug('API failed, using mock data fallback');
        const mockContact = addMockContact({
          name: data.name,
          relationship: data.relationship,
          email: data.email,
          phone: data.phone,
          birthday: data.birthday,
          howWeMet: data.howWeMet,
          notes: data.notes,
        });
        toast.success(`${data.name} added! (mock)`);
        
        if (callbacks.onSuccess) {
          callbacks.onSuccess({ ...data, id: mockContact.id });
        }
        
        closeAddPerson();
        return;
      }
      
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(error.error || 'Could not add person');
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to add person:', error);
    
    // In dev mode, fall back to mock data even on exception
    if (shouldUseDemoData()) {
      log.debug('API exception, using mock data fallback');
      const mockContact = addMockContact({
        name: data.name,
        relationship: data.relationship,
        email: data.email,
        phone: data.phone,
        birthday: data.birthday,
        howWeMet: data.howWeMet,
        notes: data.notes,
      });
      toast.success(`${data.name} added! (mock)`);
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess({ ...data, id: mockContact.id });
      }
      
      closeAddPerson();
      return;
    }
    
    toast.error('Could not add person');
    state.isSubmitting = false;
    render();
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
 * Open the Add Person modal
 */
export function openAddPerson(options?: AddPersonOptions): void {
  // Cleanup any existing modal
  closeAddPerson();
  
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    name: '',
    relationship: 'friend',
    email: '',
    phone: '',
    howWeMet: '',
    birthday: '',
    notes: '',
    isSubmitting: false,
    showAdvanced: false,
  };

  callbacks = {
    onSuccess: options?.onSuccess,
    onClose: options?.onClose,
  };

  // Create container
  modalContainer = document.createElement('div');
  modalContainer.className = 'add-person-overlay';
  modalContainer.innerHTML = `
    <div class="add-person-backdrop"></div>
    <div class="add-person-modal" role="dialog" aria-modal="true" aria-label="Add a person">
    </div>
  `;
  document.body.appendChild(modalContainer);

  // Render content
  render();

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info('Opened Add Person');
}

/**
 * Close the Add Person modal
 */
export function closeAddPerson(): void {
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
  log.info('Closed Add Person');
}

// Export for use in other modules
export const addPerson = {
  open: openAddPerson,
  close: closeAddPerson,
};

export default addPerson;

