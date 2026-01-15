/**
 * Memory Correction UI
 *
 * Phase 18: Memory Experience Layer
 *
 * Interface for users to correct Ferni's memories.
 * "Better Than Human" feature: graceful handling when Ferni gets it wrong.
 *
 * @module ui/memory/memory-correction
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('MemoryCorrectionUI');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Correction type
 */
export type CorrectionType =
  | 'wrong'         // Completely wrong
  | 'outdated'      // Was true, not anymore
  | 'partial'       // Partially correct
  | 'misattributed' // About wrong person/topic
  | 'delete';       // Please forget this

/**
 * Memory to be corrected
 */
export interface MemoryToCorrect {
  /** Memory ID */
  id: string;
  /** Current content */
  content: string;
  /** Category */
  category: string;
  /** Confidence */
  confidence: number;
  /** When learned */
  learnedAt: Date;
  /** Source */
  source: 'explicit' | 'inferred';
}

/**
 * Correction submission
 */
export interface CorrectionSubmission {
  /** Memory ID */
  memoryId: string;
  /** Type of correction */
  correctionType: CorrectionType;
  /** Corrected content (if applicable) */
  correctedContent?: string;
  /** User's explanation */
  explanation?: string;
  /** Timestamp */
  submittedAt: Date;
}

/**
 * Correction modal state
 */
export interface CorrectionModalState {
  /** Is modal open */
  isOpen: boolean;
  /** Memory being corrected */
  memory?: MemoryToCorrect;
  /** Selected correction type */
  selectedType?: CorrectionType;
  /** Corrected content */
  correctedContent: string;
  /** Explanation */
  explanation: string;
  /** Is submitting */
  isSubmitting: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CORRECTION_TYPES: Array<{ type: CorrectionType; label: string; description: string }> = [
  {
    type: 'wrong',
    label: 'This is wrong',
    description: 'This information is incorrect',
  },
  {
    type: 'outdated',
    label: 'This is outdated',
    description: 'This was true before, but not anymore',
  },
  {
    type: 'partial',
    label: 'This is partially correct',
    description: 'Some parts are right, some need fixing',
  },
  {
    type: 'misattributed',
    label: 'Wrong person/topic',
    description: "This is about someone or something else",
  },
  {
    type: 'delete',
    label: 'Please forget this',
    description: 'I\'d prefer you don\'t remember this',
  },
];

// ============================================================================
// STATE
// ============================================================================

let modalState: CorrectionModalState = {
  isOpen: false,
  correctedContent: '',
  explanation: '',
  isSubmitting: false,
};

let modalElement: HTMLElement | null = null;
let onSubmitCallback: ((submission: CorrectionSubmission) => Promise<void>) | null = null;

/**
 * Get current modal state
 */
export function getCorrectionModalState(): CorrectionModalState {
  return { ...modalState };
}

// ============================================================================
// MODAL RENDERING
// ============================================================================

/**
 * Open correction modal for a memory
 */
export function openCorrectionModal(
  memory: MemoryToCorrect,
  onSubmit: (submission: CorrectionSubmission) => Promise<void>
): void {
  modalState = {
    isOpen: true,
    memory,
    correctedContent: memory.content,
    explanation: '',
    isSubmitting: false,
  };
  onSubmitCallback = onSubmit;

  // Create modal if not exists
  if (!modalElement) {
    createModalElement();
  }

  // Render content
  if (modalElement) {
    renderModalContent();
    modalElement.style.display = 'flex';
    // Animate in
    requestAnimationFrame(() => {
      if (modalElement) {
        modalElement.style.opacity = '1';
      }
    });
  }

  log.debug({ memoryId: memory.id }, 'Correction modal opened');
}

/**
 * Close correction modal
 */
export function closeCorrectionModal(): void {
  modalState.isOpen = false;

  if (modalElement) {
    modalElement.style.opacity = '0';
    setTimeout(() => {
      if (modalElement) {
        modalElement.style.display = 'none';
      }
    }, 200);
  }
}

/**
 * Create modal element
 */
function createModalElement(): void {
  modalElement = document.createElement('div');
  modalElement.id = 'memory-correction-modal';
  modalElement.className = 'memory-correction-modal';
  modalElement.style.cssText = `
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 2000;
    opacity: 0;
    transition: opacity var(--duration-normal);
  `;

  document.body.appendChild(modalElement);

  // Close on backdrop click
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      closeCorrectionModal();
    }
  });
}

/**
 * Render modal content
 */
function renderModalContent(): void {
  if (!modalElement || !modalState.memory) return;

  modalElement.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'correction-card';
  card.style.cssText = `
    background: var(--color-background-elevated);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    width: 480px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: var(--shadow-2xl);
  `;

  // Header
  card.innerHTML = `
    <div style="margin-bottom: var(--space-4);">
      <h2 style="font-size: var(--font-size-xl); font-weight: 600; color: var(--color-text-primary); margin: 0 0 var(--space-1);">
        Correct This Memory
      </h2>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
        Help me understand what's not quite right
      </p>
    </div>
  `;

  // Current memory
  const currentMemory = document.createElement('div');
  currentMemory.style.cssText = `
    padding: var(--space-4);
    background: var(--color-background-subtle);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  `;
  currentMemory.innerHTML = `
    <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0 0 var(--space-1);">
      What I thought:
    </p>
    <p style="color: var(--color-text-primary); margin: 0;">
      ${modalState.memory.content}
    </p>
  `;
  card.appendChild(currentMemory);

  // Correction type selection
  const typeSection = document.createElement('div');
  typeSection.style.cssText = `margin-bottom: var(--space-4);`;
  typeSection.innerHTML = `
    <label style="display: block; font-weight: 500; color: var(--color-text-primary); margin-bottom: var(--space-2);">
      What's the issue?
    </label>
  `;

  for (const option of CORRECTION_TYPES) {
    const optionEl = createCorrectionTypeOption(option);
    typeSection.appendChild(optionEl);
  }
  card.appendChild(typeSection);

  // Corrected content input (shown for certain types)
  const correctionInput = document.createElement('div');
  correctionInput.id = 'correction-input-section';
  correctionInput.style.cssText = `
    margin-bottom: var(--space-4);
    display: ${modalState.selectedType && modalState.selectedType !== 'delete' ? 'block' : 'none'};
  `;
  correctionInput.innerHTML = `
    <label style="display: block; font-weight: 500; color: var(--color-text-primary); margin-bottom: var(--space-2);">
      What's correct?
    </label>
    <textarea
      id="corrected-content"
      style="
        width: 100%;
        min-height: 80px;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-family: inherit;
        font-size: var(--font-size-base);
        resize: vertical;
      "
      placeholder="Enter the correct information..."
    >${modalState.correctedContent}</textarea>
  `;
  card.appendChild(correctionInput);

  // Explanation (optional)
  const explanationSection = document.createElement('div');
  explanationSection.style.cssText = `margin-bottom: var(--space-4);`;
  explanationSection.innerHTML = `
    <label style="display: block; font-weight: 500; color: var(--color-text-primary); margin-bottom: var(--space-2);">
      Anything else? (optional)
    </label>
    <textarea
      id="correction-explanation"
      style="
        width: 100%;
        min-height: 60px;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        font-family: inherit;
        font-size: var(--font-size-base);
        resize: vertical;
      "
      placeholder="Help me understand what happened..."
    >${modalState.explanation}</textarea>
  `;
  card.appendChild(explanationSection);

  // Buttons
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: none;
    cursor: pointer;
    color: var(--color-text-secondary);
  `;
  cancelBtn.addEventListener('click', closeCorrectionModal);
  buttons.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Submit Correction';
  submitBtn.style.cssText = `
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: white;
    cursor: pointer;
    font-weight: 500;
  `;
  submitBtn.addEventListener('click', handleSubmit);
  buttons.appendChild(submitBtn);

  card.appendChild(buttons);

  modalElement.appendChild(card);
}

/**
 * Create correction type option
 */
function createCorrectionTypeOption(
  option: { type: CorrectionType; label: string; description: string }
): HTMLElement {
  const el = document.createElement('div');
  const isSelected = modalState.selectedType === option.type;

  el.style.cssText = `
    padding: var(--space-3);
    margin-bottom: var(--space-2);
    border-radius: var(--radius-md);
    border: 2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'};
    background: ${isSelected ? 'var(--color-accent-subtle)' : 'transparent'};
    cursor: pointer;
    transition: all var(--duration-normal);
  `;

  el.innerHTML = `
    <div style="font-weight: 500; color: var(--color-text-primary);">
      ${option.label}
    </div>
    <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
      ${option.description}
    </div>
  `;

  el.addEventListener('click', () => {
    modalState.selectedType = option.type;

    // Show/hide correction input
    const inputSection = document.getElementById('correction-input-section');
    if (inputSection) {
      inputSection.style.display = option.type !== 'delete' ? 'block' : 'none';
    }

    // Re-render to update selection
    renderModalContent();
  });

  return el;
}

/**
 * Handle submission
 */
async function handleSubmit(): Promise<void> {
  if (!modalState.memory || !modalState.selectedType || !onSubmitCallback) {
    return;
  }

  // Get values from form
  const correctedContentEl = document.getElementById('corrected-content') as HTMLTextAreaElement;
  const explanationEl = document.getElementById('correction-explanation') as HTMLTextAreaElement;

  const submission: CorrectionSubmission = {
    memoryId: modalState.memory.id,
    correctionType: modalState.selectedType,
    correctedContent: correctedContentEl?.value || undefined,
    explanation: explanationEl?.value || undefined,
    submittedAt: new Date(),
  };

  modalState.isSubmitting = true;

  try {
    await onSubmitCallback(submission);

    // Show success and close
    log.debug({ memoryId: submission.memoryId }, 'Correction submitted');
    closeCorrectionModal();
  } catch (error) {
    log.warn({ error: String(error) }, 'Correction submission failed');
    // Could show error state here
  } finally {
    modalState.isSubmitting = false;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup memory correction UI
 */
export function cleanupMemoryCorrectionUI(): void {
  if (modalElement) {
    modalElement.remove();
    modalElement = null;
  }

  modalState = {
    isOpen: false,
    correctedContent: '',
    explanation: '',
    isSubmitting: false,
  };

  onSubmitCallback = null;
}
