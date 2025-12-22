/**
 * Important Dates Manager UI
 *
 * Track birthdays, anniversaries, and custom important dates.
 * Never miss a special moment with the people you care about.
 *
 * @module ui/important-dates
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';

const log = createLogger('ImportantDatesUI');

// ============================================================================
// TYPES
// ============================================================================

export type DateType = 'birthday' | 'anniversary' | 'memorial' | 'custom';

export interface ImportantDate {
  id?: string;
  date: string; // YYYY-MM-DD or MM-DD for recurring
  type: DateType;
  label?: string;
  recurring: boolean;
  reminder?: number; // Days before
  notes?: string;
}

export interface ImportantDatesOptions {
  contactId: string;
  contactName: string;
  existingDates?: ImportantDate[];
  onSuccess?: (dates: ImportantDate[]) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface ImportantDatesState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  dates: ImportantDate[];
  editingIndex: number | null;
  isSubmitting: boolean;
  // Form fields for add/edit
  formDate: string;
  formType: DateType;
  formLabel: string;
  formRecurring: boolean;
  formReminder: string;
  formNotes: string;
  showAddForm: boolean;
}

let state: ImportantDatesState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  dates: [],
  editingIndex: null,
  isSubmitting: false,
  formDate: '',
  formType: 'birthday',
  formLabel: '',
  formRecurring: true,
  formReminder: '7',
  formNotes: '',
  showAddForm: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSuccess?: (dates: ImportantDate[]) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  cake: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v2"/><path d="M12 8v2"/><path d="M17 8v2"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  flower: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15"/><circle cx="12" cy="12" r="3"/><path d="m8 16 1.5-1.5"/><path d="M14.5 9.5 16 8"/><path d="m8 8 1.5 1.5"/><path d="M14.5 14.5 16 16"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  bell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  repeat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

const DATE_TYPES: { id: DateType; label: string; icon: string }[] = [
  { id: 'birthday', label: 'Birthday', icon: ICONS.cake },
  { id: 'anniversary', label: 'Anniversary', icon: ICONS.heart },
  { id: 'memorial', label: 'Memorial', icon: ICONS.flower },
  { id: 'custom', label: 'Custom', icon: ICONS.star },
];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('important-dates-styles')) return;

  const style = document.createElement('style');
  style.id = 'important-dates-styles';
  style.textContent = `
    /* =========================================================================
       IMPORTANT DATES MANAGER
       ========================================================================= */
    
    .important-dates-overlay {
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

    .important-dates-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .important-dates-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .important-dates-modal {
      position: relative;
      width: 94%;
      max-width: clamp(336px, 90vw, 480px);
      max-height: 85vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .important-dates-overlay.open .important-dates-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .id-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .id-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .id-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .id-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .id-close {
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

    .id-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .id-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       DATE LIST
       ========================================================================= */
    
    .id-date-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .id-date-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-lg, 1rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .id-date-icon svg {
      width: 20px;
      height: 20px;
    }

    .id-date-info {
      flex: 1;
      min-width: 0;
    }

    .id-date-label {
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
    }

    .id-date-meta {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-0-5, 0.125rem);
    }

    .id-date-meta svg {
      width: 12px;
      height: 12px;
    }

    .id-date-actions {
      display: flex;
      gap: var(--space-1, 0.25rem);
    }

    .id-date-action {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: var(--radius-md, 0.5rem);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #70605a);
      transition: all ${DURATION.FAST}ms;
    }

    .id-date-action:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    .id-date-action.delete:hover {
      color: var(--color-semantic-error, #c44);
      background: rgba(204, 68, 68, 0.08);
    }

    /* =========================================================================
       ADD/EDIT FORM
       ========================================================================= */
    
    .id-form {
      padding: var(--space-4, 1rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.04));
      border: 1px solid var(--persona-primary, #4a6741);
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .id-form-title {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .id-form-row {
      display: flex;
      gap: var(--space-3, 0.75rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .id-form-field {
      flex: 1;
    }

    .id-form-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-1, 0.25rem);
      display: block;
    }

    .id-form-input {
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
    }

    .id-form-input:focus {
      border-color: var(--persona-primary, #4a6741);
    }

    .id-form-select {
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      cursor: pointer;
    }

    .id-form-checkbox {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      cursor: pointer;
    }

    .id-form-checkbox input {
      width: 16px;
      height: 16px;
      accent-color: var(--persona-primary, #4a6741);
    }

    .id-form-actions {
      display: flex;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-3, 0.75rem);
    }

    .id-form-btn {
      flex: 1;
      padding: var(--space-2, 0.5rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .id-form-btn-cancel {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .id-form-btn-save {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .id-form-btn-save:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    /* =========================================================================
       ADD BUTTON
       ========================================================================= */
    
    .id-add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-3, 0.75rem);
      border: 2px dashed var(--color-border, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .id-add-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.03));
    }

    .id-add-btn svg {
      width: 18px;
      height: 18px;
    }

    /* =========================================================================
       EMPTY STATE
       ========================================================================= */
    
    .id-empty {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
      color: var(--color-text-muted, #70605a);
    }

    .id-empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-3, 0.75rem);
      opacity: 0.4;
    }

    .id-empty-text {
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.5;
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .id-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .id-footer-btn {
      width: 100%;
      padding: var(--space-3, 0.75rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .id-footer-btn:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    .id-footer-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .important-dates-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .id-form-row {
        flex-direction: column;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .important-dates-overlay,
      .important-dates-modal,
      .id-add-btn,
      .id-date-action,
      .id-close {
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

  const modal = modalContainer.querySelector('.important-dates-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="id-header">
      <div class="id-header-row">
        <div>
          <div class="id-eyebrow">Important Dates</div>
          <h2 class="id-title">${escapeHtml(state.contactName)}</h2>
        </div>
        <button class="id-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="id-content">
      ${state.showAddForm || state.editingIndex !== null ? renderForm() : ''}
      ${renderDateList()}
      ${!state.showAddForm && state.editingIndex === null ? `
        <button aria-label="Add" class="id-add-btn" id="id-add-btn">
          ${ICONS.plus} Add Important Date
        </button>
      ` : ''}
    </div>
    
    <div class="id-footer">
      <button aria-label="Submit" class="id-footer-btn" id="id-done" ${state.isSubmitting ? 'disabled' : ''}>
        ${state.isSubmitting ? 'Saving...' : 'Done'}
      </button>
    </div>
  `;

  bindEvents();
}

function renderForm(): string {
  const isEditing = state.editingIndex !== null;
  
  return `
    <div class="id-form">
      <div class="id-form-title">${isEditing ? 'Edit Date' : 'Add Date'}</div>
      
      <div class="id-form-row">
        <div class="id-form-field">
          <label class="id-form-label">Type</label>
          <select class="id-form-select" id="id-form-type">
            ${DATE_TYPES.map(t => `
              <option value="${t.id}" ${state.formType === t.id ? 'selected' : ''}>${t.label}</option>
            `).join('')}
          </select>
        </div>
        <div class="id-form-field">
          <label class="id-form-label">Date</label>
          <input type="date" class="id-form-input" id="id-form-date" value="${state.formDate}" />
        </div>
      </div>
      
      ${state.formType === 'custom' ? `
        <div class="id-form-row">
          <div class="id-form-field">
            <label class="id-form-label">Label</label>
            <input type="text" class="id-form-input" id="id-form-label" placeholder="e.g., First date, Graduation" value="${escapeHtml(state.formLabel)}" />
          </div>
        </div>
      ` : ''}
      
      <div class="id-form-row">
        <div class="id-form-field">
          <label class="id-form-label">Remind me</label>
          <select class="id-form-select" id="id-form-reminder">
            <option value="0" ${state.formReminder === '0' ? 'selected' : ''}>Don't remind</option>
            <option value="1" ${state.formReminder === '1' ? 'selected' : ''}>1 day before</option>
            <option value="3" ${state.formReminder === '3' ? 'selected' : ''}>3 days before</option>
            <option value="7" ${state.formReminder === '7' ? 'selected' : ''}>1 week before</option>
            <option value="14" ${state.formReminder === '14' ? 'selected' : ''}>2 weeks before</option>
            <option value="30" ${state.formReminder === '30' ? 'selected' : ''}>1 month before</option>
          </select>
        </div>
      </div>
      
      <label class="id-form-checkbox">
        <input type="checkbox" id="id-form-recurring" ${state.formRecurring ? 'checked' : ''} />
        Repeats every year
      </label>
      
      <div class="id-form-actions" role="button" tabindex="0">
        <button aria-label="Cancel" class="id-form-btn id-form-btn-cancel" id="id-form-cancel">Cancel</button>
        <button aria-label="Confirm" class="id-form-btn id-form-btn-save" id="id-form-save">
          ${ICONS.check} ${isEditing ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  `;
}

function renderDateList(): string {
  if (state.dates.length === 0 && !state.showAddForm && state.editingIndex === null) {
    return `
      <div class="id-empty">
        <div class="id-empty-icon">${ICONS.calendar}</div>
        <p class="id-empty-text">No important dates yet.<br/>Add birthdays, anniversaries, and more.</p>
      </div>
    `;
  }

  return state.dates.map((date, index) => {
    if (index === state.editingIndex) return ''; // Hide while editing
    
    const typeInfo = DATE_TYPES.find(t => t.id === date.type) || DATE_TYPES[3];
    const displayDate = formatDisplayDate(date.date);
    
    return `
      <div class="id-date-item">
        <div class="id-date-icon">${typeInfo.icon}</div>
        <div class="id-date-info">
          <div class="id-date-label">${date.label || typeInfo.label}</div>
          <div class="id-date-meta">
            ${displayDate}
            ${date.recurring ? `<span>${ICONS.repeat} Yearly</span>` : ''}
            ${date.reminder ? `<span>${ICONS.bell} ${date.reminder}d</span>` : ''}
          </div>
        </div>
        <div class="id-date-actions" role="button" tabindex="0">
          <button class="id-date-action" data-action="edit" data-index="${index}" aria-label="Edit">
            ${ICONS.edit}
          </button>
          <button class="id-date-action delete" data-action="delete" data-index="${index}" aria-label="Delete">
            ${ICONS.trash}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.id-close')?.addEventListener('click', closeImportantDates);
  modalContainer.querySelector('.important-dates-backdrop')?.addEventListener('click', closeImportantDates);

  // Add button
  modalContainer.querySelector('#id-add-btn')?.addEventListener('click', () => {
    resetForm();
    state.showAddForm = true;
    render();
  });

  // Form inputs
  const typeSelect = modalContainer.querySelector('#id-form-type') as HTMLSelectElement;
  const dateInput = modalContainer.querySelector('#id-form-date') as HTMLInputElement;
  const labelInput = modalContainer.querySelector('#id-form-label') as HTMLInputElement;
  const reminderSelect = modalContainer.querySelector('#id-form-reminder') as HTMLSelectElement;
  const recurringCheckbox = modalContainer.querySelector('#id-form-recurring') as HTMLInputElement;

  typeSelect?.addEventListener('change', (e) => { 
    state.formType = (e.target as HTMLSelectElement).value as DateType;
    render();
  });
  dateInput?.addEventListener('change', (e) => { state.formDate = (e.target as HTMLInputElement).value; });
  labelInput?.addEventListener('input', (e) => { state.formLabel = (e.target as HTMLInputElement).value; });
  reminderSelect?.addEventListener('change', (e) => { state.formReminder = (e.target as HTMLSelectElement).value; });
  recurringCheckbox?.addEventListener('change', (e) => { state.formRecurring = (e.target as HTMLInputElement).checked; });

  // Form buttons
  modalContainer.querySelector('#id-form-cancel')?.addEventListener('click', () => {
    state.showAddForm = false;
    state.editingIndex = null;
    resetForm();
    render();
  });

  modalContainer.querySelector('#id-form-save')?.addEventListener('click', saveDate);

  // Date item actions
  modalContainer.querySelectorAll('.id-date-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const index = parseInt(btn.getAttribute('data-index') || '-1', 10);
      
      if (action === 'edit' && index >= 0) {
        editDate(index);
      } else if (action === 'delete' && index >= 0) {
        deleteDate(index);
      }
    });
  });

  // Done button
  modalContainer.querySelector('#id-done')?.addEventListener('click', handleDone);

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeImportantDates();
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

function resetForm(): void {
  state.formDate = '';
  state.formType = 'birthday';
  state.formLabel = '';
  state.formRecurring = true;
  state.formReminder = '7';
  state.formNotes = '';
}

function saveDate(): void {
  if (!state.formDate) {
    toast.warning('Pick a date');
    return;
  }

  const newDate: ImportantDate = {
    date: state.formDate,
    type: state.formType,
    label: state.formType === 'custom' ? state.formLabel : undefined,
    recurring: state.formRecurring,
    reminder: parseInt(state.formReminder, 10) || undefined,
    notes: state.formNotes || undefined,
  };

  if (state.editingIndex !== null) {
    state.dates[state.editingIndex] = newDate;
    state.editingIndex = null;
  } else {
    state.dates.push(newDate);
  }

  state.showAddForm = false;
  resetForm();
  render();
  toast.success('Date saved');
}

function editDate(index: number): void {
  const date = state.dates[index];
  state.formDate = date.date;
  state.formType = date.type;
  state.formLabel = date.label || '';
  state.formRecurring = date.recurring;
  state.formReminder = String(date.reminder || 0);
  state.formNotes = date.notes || '';
  state.editingIndex = index;
  state.showAddForm = false;
  render();
}

function deleteDate(index: number): void {
  state.dates.splice(index, 1);
  render();
  toast.success('Removed');
}

async function handleDone(): Promise<void> {
  state.isSubmitting = true;
  render();

  try {
    // Save all dates to the API
    const response = await apiFetch(`/api/contacts/${state.contactId}/important-dates`, {
      method: 'POST',
      body: JSON.stringify({ dates: state.dates }),
    });

    if (response.ok) {
      toast.success('Dates saved!');
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess(state.dates);
      }
      
      closeImportantDates();
    } else {
      toast.error('Could not save dates');
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to save important dates:', error);
    toast.error('Could not save dates');
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

function formatDisplayDate(dateStr: string): string {
  // Handle both YYYY-MM-DD and MM-DD formats
  const parts = dateStr.split('-');
  let month: number, day: number;
  
  if (parts.length === 3) {
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    month = parseInt(parts[0], 10) - 1;
    day = parseInt(parts[1], 10);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month]} ${day}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Important Dates manager
 */
export function openImportantDates(options: ImportantDatesOptions): void {
  closeImportantDates();
  
  injectStyles();

  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    dates: options.existingDates ? [...options.existingDates] : [],
    editingIndex: null,
    isSubmitting: false,
    formDate: '',
    formType: 'birthday',
    formLabel: '',
    formRecurring: true,
    formReminder: '7',
    formNotes: '',
    showAddForm: false,
  };

  callbacks = {
    onSuccess: options.onSuccess,
    onClose: options.onClose,
  };

  modalContainer = document.createElement('div');
  modalContainer.className = 'important-dates-overlay';
  modalContainer.innerHTML = `
    <div class="important-dates-backdrop"></div>
    <div class="important-dates-modal" role="dialog" aria-modal="true" aria-label="Important dates">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId }, 'Opened Important Dates');
}

/**
 * Close the Important Dates manager
 */
export function closeImportantDates(): void {
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
  log.info('Closed Important Dates');
}

export const importantDates = {
  open: openImportantDates,
  close: closeImportantDates,
};

export default importantDates;

