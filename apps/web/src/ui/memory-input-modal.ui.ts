/**
 * Memory Input Modal UI
 *
 * A branded modal for adding memories to custom agents.
 * Replaces native browser prompt() with a warm, contextual experience.
 *
 * @module memory-input-modal.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import type { AddMemoryRequest, MemoryType } from '../services/custom-agent.service.js';

const log = createLogger('MemoryInputModal');

// ============================================================================
// TYPES
// ============================================================================

interface MemoryInputResult {
  type: MemoryType;
  content: string;
  title?: string;
  phrase?: string;
  context?: string;
  mood?: string;
}

interface MemoryTypeConfig {
  id: MemoryType;
  name: string;
  description: string;
  icon: string;
  fields: MemoryFieldConfig[];
}

interface MemoryFieldConfig {
  id: string;
  label: string;
  placeholder: string;
  type: 'input' | 'textarea';
  required?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MEMORY_TYPES: MemoryTypeConfig[] = [
  {
    id: 'story',
    name: 'Story',
    description: 'A meaningful story or experience',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>`,
    fields: [
      { id: 'title', label: 'Title', placeholder: 'Give this story a name', type: 'input', required: true },
      { id: 'content', label: 'The Story', placeholder: 'Tell the story in detail...', type: 'textarea', required: true },
      { id: 'context', label: 'Context', placeholder: 'When/where did this happen?', type: 'input' },
    ],
  },
  {
    id: 'wisdom',
    name: 'Wisdom',
    description: 'A saying, lesson, or piece of advice',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    fields: [
      { id: 'phrase', label: 'The Saying', placeholder: '"Life is what happens when..."', type: 'input', required: true },
      { id: 'content', label: 'What It Means', placeholder: 'Explain the wisdom behind it...', type: 'textarea', required: true },
      { id: 'context', label: 'Origin', placeholder: 'Where did they learn this?', type: 'input' },
    ],
  },
  {
    id: 'sharedMoment',
    name: 'Shared Moment',
    description: 'A special memory you shared together',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>`,
    fields: [
      { id: 'title', label: 'Title', placeholder: 'Name this moment', type: 'input', required: true },
      { id: 'content', label: 'The Memory', placeholder: 'Describe what happened...', type: 'textarea', required: true },
      { id: 'context', label: 'When & Where', placeholder: 'Summer 2019, at the lake house...', type: 'input' },
    ],
  },
  {
    id: 'journalEntry',
    name: 'Journal Entry',
    description: 'A personal reflection or thought',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`,
    fields: [
      { id: 'content', label: 'Your Thoughts', placeholder: 'Write what\'s on your mind...', type: 'textarea', required: true },
      { id: 'mood', label: 'How are you feeling?', placeholder: 'peaceful, anxious, grateful...', type: 'input' },
    ],
  },
];

const MOOD_OPTIONS = [
  'grateful', 'peaceful', 'hopeful', 'excited', 'content',
  'reflective', 'anxious', 'sad', 'frustrated', 'overwhelmed',
];

// ============================================================================
// STATE
// ============================================================================

let modalElement: HTMLElement | null = null;
let selectedType: MemoryType | null = null;
let resolvePromise: ((value: MemoryInputResult | null) => void) | null = null;

// ============================================================================
// STYLES
// ============================================================================

function ensureStylesExist(): void {
  if (document.getElementById('memory-input-modal-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'memory-input-modal-styles';
  styles.textContent = `
    .memory-input-overlay {
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
    
    .memory-input-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .memory-input-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    .memory-input-container {
      position: relative;
      width: 90vw;
      max-width: 520px;
      max-height: 85vh;
      background: var(--color-bg-elevated, #1e1e2e);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-2xl);
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .memory-input-overlay.open .memory-input-container {
      transform: scale(1);
    }
    
    .memory-input-header {
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .memory-input-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .memory-input-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 4px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .memory-input-close:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    .memory-input-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }
    
    /* Type Selection */
    .memory-type-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-lg, 24px);
    }
    
    .memory-type-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      text-align: center;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .memory-type-btn:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-border-subtle);
    }
    
    .memory-type-btn--selected {
      border-color: var(--color-accent, #4a6741);
      background: rgba(74, 103, 65, 0.1);
    }
    
    .memory-type-btn--selected .memory-type-icon {
      color: var(--color-accent, #4a6741);
    }
    
    .memory-type-icon {
      color: var(--color-text-muted);
      transition: color ${DURATION.FAST}ms;
    }
    
    .memory-type-name {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-text-primary);
    }
    
    .memory-type-desc {
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }
    
    /* Form */
    .memory-form {
      display: none;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .memory-form.visible {
      display: flex;
    }
    
    .memory-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 4px);
    }
    
    .memory-field-label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-text-primary);
    }
    
    .memory-field-label--required::after {
      content: ' *';
      color: var(--color-semantic-error, #ef4444);
    }
    
    .memory-field-input,
    .memory-field-textarea {
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-size: 0.95rem;
      font-family: inherit;
      transition: all ${DURATION.FAST}ms;
    }
    
    .memory-field-input:focus,
    .memory-field-textarea:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.2);
    }
    
    .memory-field-textarea {
      min-height: 100px;
      resize: vertical;
    }
    
    /* Mood Pills */
    .memory-mood-grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-xs, 4px);
    }
    
    .memory-mood-pill {
      padding: var(--space-xs, 6px) var(--space-sm, 10px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .memory-mood-pill:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
    
    .memory-mood-pill--selected {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: white;
    }
    
    /* Footer */
    .memory-input-footer {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 8px);
    }
    
    .memory-input-btn {
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      border-radius: var(--radius-lg, 12px);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      border: none;
    }
    
    .memory-input-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    
    .memory-input-btn--cancel {
      background: transparent;
      color: var(--color-text-muted);
    }
    
    .memory-input-btn--cancel:hover {
      color: var(--color-text-primary);
    }
    
    .memory-input-btn--save {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .memory-input-btn--save:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    
    .memory-input-btn--save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* Responsive */
    @media (max-width: 480px) {
      .memory-type-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// RENDERING
// ============================================================================

function renderTypeSelection(): string {
  return `
    <div class="memory-type-grid">
      ${MEMORY_TYPES.map((type) => `
        <button 
          class="memory-type-btn ${selectedType === type.id ? 'memory-type-btn--selected' : ''}" 
          data-type="${type.id}"
          type="button"
        >
          <span class="memory-type-icon">${type.icon}</span>
          <span class="memory-type-name">${type.name}</span>
          <span class="memory-type-desc">${type.description}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderForm(): string {
  if (!selectedType) return '';

  const typeConfig = MEMORY_TYPES.find((t) => t.id === selectedType);
  if (!typeConfig) return '';

  return `
    <form class="memory-form visible" id="memory-form">
      ${typeConfig.fields.map((field) => {
        if (field.id === 'mood') {
          return `
            <div class="memory-field">
              <label class="memory-field-label">${field.label}</label>
              <div class="memory-mood-grid">
                ${MOOD_OPTIONS.map((mood) => `
                  <button type="button" class="memory-mood-pill" data-mood="${mood}">${mood}</button>
                `).join('')}
              </div>
              <input type="hidden" name="mood" id="memory-mood" value="" />
            </div>
          `;
        }

        return `
          <div class="memory-field">
            <label class="memory-field-label ${field.required ? 'memory-field-label--required' : ''}" for="memory-${field.id}">
              ${field.label}
            </label>
            ${field.type === 'textarea'
              ? `<textarea 
                  class="memory-field-textarea" 
                  id="memory-${field.id}" 
                  name="${field.id}"
                  placeholder="${field.placeholder}"
                  ${field.required ? 'required' : ''}
                ></textarea>`
              : `<input 
                  type="text" 
                  class="memory-field-input" 
                  id="memory-${field.id}" 
                  name="${field.id}"
                  placeholder="${field.placeholder}"
                  ${field.required ? 'required' : ''}
                />`
            }
          </div>
        `;
      }).join('')}
    </form>
  `;
}

function createModal(initialType?: MemoryType): HTMLElement {
  document.querySelectorAll('.memory-input-overlay').forEach((el) => el.remove());

  selectedType = initialType || null;

  const modal = document.createElement('div');
  modal.className = 'memory-input-overlay';
  modal.innerHTML = `
    <div class="memory-input-backdrop" data-action="cancel"></div>
    <div class="memory-input-container" role="dialog" aria-modal="true" aria-labelledby="memory-input-title">
      <header class="memory-input-header">
        <h2 class="memory-input-title" id="memory-input-title">Add Memory</h2>
        <button class="memory-input-close" data-action="cancel" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>
      <div class="memory-input-content">
        ${renderTypeSelection()}
        ${renderForm()}
      </div>
      <footer class="memory-input-footer">
        <button class="memory-input-btn memory-input-btn--cancel" data-action="cancel" type="button">
          Cancel
        </button>
        <button class="memory-input-btn memory-input-btn--save" data-action="save" type="button" ${!selectedType ? 'disabled' : ''}>
          Add Memory
        </button>
      </footer>
    </div>
  `;

  return modal;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Type selection
  const typeBtn = target.closest('.memory-type-btn') as HTMLElement;
  if (typeBtn) {
    const type = typeBtn.dataset.type as MemoryType;
    selectedType = type;

    // Update UI
    modalElement?.querySelectorAll('.memory-type-btn').forEach((btn) => {
      btn.classList.toggle('memory-type-btn--selected', btn === typeBtn);
    });

    // Show form
    const content = modalElement?.querySelector('.memory-input-content');
    if (content) {
      const existingForm = content.querySelector('.memory-form');
      existingForm?.remove();
      content.insertAdjacentHTML('beforeend', renderForm());
      attachFormListeners();
    }

    // Enable save button
    const saveBtn = modalElement?.querySelector('[data-action="save"]') as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = false;

    soundUI.play('click');
    return;
  }

  // Mood pill
  const moodPill = target.closest('.memory-mood-pill') as HTMLElement;
  if (moodPill) {
    const mood = moodPill.dataset.mood;
    modalElement?.querySelectorAll('.memory-mood-pill').forEach((pill) => {
      pill.classList.toggle('memory-mood-pill--selected', pill === moodPill);
    });
    const moodInput = modalElement?.querySelector('#memory-mood') as HTMLInputElement;
    if (moodInput) moodInput.value = mood || '';
    soundUI.play('click');
    return;
  }

  // Actions
  const action = target.closest('[data-action]')?.getAttribute('data-action');
  if (action === 'cancel') {
    closeModal(null);
  } else if (action === 'save') {
    saveMemory();
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeModal(null);
  }
}

function attachFormListeners(): void {
  const form = modalElement?.querySelector('#memory-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveMemory();
  });
}

function saveMemory(): void {
  if (!selectedType) return;

  const form = modalElement?.querySelector('#memory-form') as HTMLFormElement;
  if (!form) return;

  const formData = new FormData(form);
  const typeConfig = MEMORY_TYPES.find((t) => t.id === selectedType);
  if (!typeConfig) return;

  // Validate required fields
  for (const field of typeConfig.fields) {
    if (field.required) {
      const value = formData.get(field.id) as string;
      if (!value?.trim()) {
        const input = form.querySelector(`#memory-${field.id}`) as HTMLElement;
        input?.focus();
        return;
      }
    }
  }

  const result: MemoryInputResult = {
    type: selectedType,
    content: (formData.get('content') as string) || '',
    title: (formData.get('title') as string) || undefined,
    phrase: (formData.get('phrase') as string) || undefined,
    context: (formData.get('context') as string) || undefined,
    mood: (formData.get('mood') as string) || undefined,
  };

  closeModal(result);
  soundUI.play('success');
}

function closeModal(result: MemoryInputResult | null): void {
  if (!modalElement) return;

  modalElement.classList.remove('open');
  document.removeEventListener('keydown', handleKeydown);

  setTimeout(() => {
    modalElement?.remove();
    modalElement = null;
    selectedType = null;

    if (resolvePromise) {
      resolvePromise(result);
      resolvePromise = null;
    }
  }, DURATION.NORMAL);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Opens the memory input modal and returns the entered memory or null
 *
 * @param initialType - Optional type to pre-select
 * @returns Promise resolving to memory data or null if cancelled
 */
export function openMemoryInput(initialType?: MemoryType): Promise<MemoryInputResult | null> {
  ensureStylesExist();

  return new Promise((resolve) => {
    resolvePromise = resolve;
    modalElement = createModal(initialType);

    modalElement.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(modalElement);

    requestAnimationFrame(() => {
      modalElement?.classList.add('open');
    });

    soundUI.play('switch');
    log.debug('Memory input modal opened');
  });
}

/**
 * Converts modal result to AddMemoryRequest format
 */
export function toAddMemoryRequest(result: MemoryInputResult): AddMemoryRequest {
  return {
    type: result.type,
    content: result.content,
    title: result.title,
    phrase: result.phrase,
    context: result.context,
    mood: result.mood,
  };
}

