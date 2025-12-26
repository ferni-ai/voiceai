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
import { t } from '../i18n/index.js';

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

// Relationship type definitions - labels are resolved at render time for i18n
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
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    .add-person-modal {
      position: relative;
      width: 94%;
      max-width: clamp(308px, 90vw, 440px);
      max-height: 90vh;
      /* Glass modal styling */
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    @supports not (backdrop-filter: blur(1px)) {
      .add-person-modal {
        background: var(--color-background-elevated, #FFFDFB);
      }
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
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
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
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
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
      background: var(--tonal-surface-2);
      border: none;
      color: var(--color-text-secondary, #5a4a42);
    }

    .ap-btn-secondary:hover {
      background: var(--tonal-surface-3);
    }

    .ap-btn-secondary:active {
      background: var(--tonal-surface-active);
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

  const relationshipTypes = getRelationshipTypes();
  
  modal.innerHTML = `
    <div class="ap-header">
      <div class="ap-header-row">
        <div>
          <div class="ap-eyebrow">${t('addPerson.eyebrow')}</div>
          <h2 class="ap-title">${t('addPerson.title')}</h2>
          <p class="ap-subtitle">${t('addPerson.subtitle')}</p>
        </div>
        <button class="ap-close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="ap-content">
      <!-- Name -->
      <div class="ap-section">
        <label class="ap-label">${t('addPerson.nameLabel')}</label>
        <input type="text" class="ap-input" id="ap-name" placeholder="${t('addPerson.namePlaceholder')}" value="${escapeHtml(state.name)}" autofocus />
      </div>
      
      <!-- Relationship Type -->
      <div class="ap-section">
        <label class="ap-label">${t('addPerson.relationshipLabel')}</label>
        <div class="ap-relationships">
          ${relationshipTypes.map(rel => `
            <button class="ap-relationship ${state.relationship === rel.id ? 'selected' : ''}" data-relationship="${rel.id}">
              <span class="ap-relationship-icon">${rel.icon}</span>
              <span class="ap-relationship-label">${rel.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      
      <!-- Advanced Options -->
      <div class="ap-section">
        <button aria-label="${t('accessibility.expandGarden')}" class="ap-advanced-toggle ${state.showAdvanced ? 'open' : ''}" id="ap-advanced-toggle">
          ${t('addPerson.addMoreDetails')} ${ICONS.chevronDown}
        </button>
        
        <div class="ap-advanced-content ${state.showAdvanced ? 'open' : ''}" id="ap-advanced-content">
          <div class="ap-row">
            <div class="ap-field">
              <label class="ap-label">${t('addPerson.emailLabel')}</label>
              <input type="email" class="ap-input ap-input-sm" id="ap-email" placeholder="${t('placeholders.emailExample')}" value="${escapeHtml(state.email)}" />
            </div>
            <div class="ap-field">
              <label class="ap-label">${t('addPerson.phoneLabel')}</label>
              <input type="tel" class="ap-input ap-input-sm" id="ap-phone" placeholder="${t('placeholders.phoneExample')}" value="${escapeHtml(state.phone)}" />
            </div>
          </div>
          
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="ap-label">${t('addPerson.birthdayLabel')}</label>
            <input type="date" class="ap-input ap-input-sm" id="ap-birthday" value="${state.birthday}" />
          </div>
          
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="ap-label">${t('addPerson.howMetLabel')}</label>
            <input type="text" class="ap-input ap-input-sm" id="ap-how-met" placeholder="${t('addPerson.howMetPlaceholder')}" value="${escapeHtml(state.howWeMet)}" />
          </div>
          
          <div>
            <label class="ap-label">${t('addPerson.notesLabel')}</label>
            <textarea class="ap-textarea" id="ap-notes" placeholder="${t('addPerson.notesPlaceholder')}">${escapeHtml(state.notes)}</textarea>
          </div>
        </div>
      </div>
    </div>
    
    <div class="ap-footer">
      <button aria-label="${t('common.cancel')}" class="ap-btn ap-btn-secondary" id="ap-cancel">${t('common.cancel')}</button>
      <button aria-label="${t('common.save')}" class="ap-btn ap-btn-primary" id="ap-save" ${state.isSubmitting || !state.name.trim() ? 'disabled' : ''}>
        ${state.isSubmitting ? t('addPerson.adding') : t('addPerson.addPerson')}
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
  modalContainer.querySelector('#ap-save')?.addEventListener('click', () => { void handleSave(); });

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
      toast.success(t('addPerson.added', { name: data.name }));
      
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
        toast.success(t('addPerson.addedMock', { name: data.name }));
        
        if (callbacks.onSuccess) {
          callbacks.onSuccess({ ...data, id: mockContact.id });
        }
        
        closeAddPerson();
        return;
      }
      
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(error.error || t('addPerson.couldNotAdd'));
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to add person:', error);

    // In dev mode, fall back to mock data even on exception
    if (shouldUseDemoData()) {
      log.debug('API exception, using mock data fallback');
      const fallbackData: AddPersonData = {
        name: state.name.trim(),
        relationship: state.relationship,
        email: state.email.trim() || undefined,
        phone: state.phone.trim() || undefined,
        birthday: state.birthday || undefined,
        howWeMet: state.howWeMet.trim() || undefined,
        notes: state.notes.trim() || undefined,
      };
      const mockContact = addMockContact({
        name: fallbackData.name,
        relationship: fallbackData.relationship,
        email: fallbackData.email,
        phone: fallbackData.phone,
        birthday: fallbackData.birthday,
        howWeMet: fallbackData.howWeMet,
        notes: fallbackData.notes,
      });
      toast.success(t('addPerson.addedMock', { name: fallbackData.name }));

      if (callbacks.onSuccess) {
        callbacks.onSuccess({ ...fallbackData, id: mockContact.id });
      }

      closeAddPerson();
      return;
    }
    
    toast.error(t('addPerson.couldNotAdd'));
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

