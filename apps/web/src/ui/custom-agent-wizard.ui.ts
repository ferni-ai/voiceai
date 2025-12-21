/**
 * Custom Agent Creation Wizard UI
 *
 * A beautiful 5-step wizard for creating custom AI agents.
 * Supports voice cloning, memory capture, and personality configuration.
 *
 * Steps:
 * 1. Choose Agent Type (Legacy, Mentor, Voice Twin, Custom)
 * 2. Basic Info (Name, description, icon)
 * 3. Voice Setup (Clone, library, or skip)
 * 4. Personality (Traits, communication style)
 * 5. Memories & Review (Add memories, finalize)
 *
 * @module custom-agent-wizard.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import {
  type CustomAgentType,
  type AgentDraft,
  type AddMemoryRequest,
  type CustomAgentPersonality,
  type MemoryType,
  getAgentTypes,
  saveAgentDraft,
  loadAgentDraft,
  clearAgentDraft,
  createCustomAgent,
  uploadVoiceSample,
  createVoiceClone,
  addMemory,
  updateCustomAgent,
  getVoiceLibrary,
  dispatchCustomAgentEvent,
} from '../services/custom-agent.service.js';
import { openMemoryInput, toAddMemoryRequest } from './memory-input-modal.ui.js';

const log = createLogger('CustomAgentWizard');

// ============================================================================
// CONSTANTS
// ============================================================================

const WIZARD_STEPS = [
  { id: 'type', title: 'Choose Type', subtitle: 'What kind of agent?' },
  { id: 'info', title: 'Basic Info', subtitle: 'Give them a name' },
  { id: 'voice', title: 'Voice', subtitle: 'How they sound' },
  { id: 'personality', title: 'Personality', subtitle: 'How they act' },
  { id: 'memories', title: 'Memories', subtitle: 'What they know' },
] as const;

// ============================================================================
// STATE
// ============================================================================

let wizardModal: HTMLElement | null = null;
let currentStep = 0;
let draft: AgentDraft = { step: 0, updatedAt: new Date().toISOString() };
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordedAudioBlob: Blob | null = null;
let isRecording = false;
let createdAgentId: string | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Ensures the wizard modal exists in the DOM
 */
function ensureWizardExists(): HTMLElement {
  if (wizardModal) {
    return wizardModal;
  }

  // Clean up any orphaned elements (HMR protection)
  document.querySelectorAll('.custom-agent-wizard-overlay').forEach((el) => el.remove());

  wizardModal = document.createElement('div');
  wizardModal.className = 'custom-agent-wizard-overlay';
  wizardModal.innerHTML = `
    <div class="wizard-backdrop" data-action="close"></div>
    <div class="wizard-container" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <header class="wizard-header">
        <div class="wizard-progress">
          ${WIZARD_STEPS.map(
            (step, i) => `
            <div class="wizard-progress-step" data-step="${i}">
              <div class="progress-dot"></div>
              <span class="progress-label">${step.title}</span>
            </div>
          `
          ).join('')}
          <div class="wizard-progress-bar">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
        <button class="wizard-close" data-action="close" aria-label="Close wizard">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <main class="wizard-content" id="wizard-content">
        <!-- Step content renders here -->
      </main>

      <footer class="wizard-footer">
        <button class="wizard-btn wizard-btn--secondary" data-action="back" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>
        <button class="wizard-btn wizard-btn--primary" data-action="next">
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </footer>
    </div>
  `;

  // Add event listeners
  wizardModal.addEventListener('click', handleWizardClick);
  wizardModal.addEventListener('keydown', handleWizardKeydown);

  // Add styles if not already present
  if (!document.getElementById('custom-agent-wizard-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'custom-agent-wizard-styles';
    styleSheet.textContent = getWizardStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(wizardModal);
  return wizardModal;
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

/**
 * Options for opening the wizard
 */
export interface WizardOptions {
  /** Resume from saved draft if available */
  resumeDraft?: boolean;
  /** Pre-select an agent type and skip type selection step */
  preselectedType?: CustomAgentType;
}

/**
 * Opens the custom agent creation wizard
 * @param options - Configuration options or boolean for backwards compatibility
 */
export function openCustomAgentWizard(options: WizardOptions | boolean = true): void {
  const modal = ensureWizardExists();

  // Handle backwards compatibility (boolean param = resumeDraft)
  const opts: WizardOptions =
    typeof options === 'boolean' ? { resumeDraft: options } : options;
  const { resumeDraft = true, preselectedType } = opts;

  // If preselected type, start fresh with that type pre-filled
  if (preselectedType) {
    clearAgentDraft();
    draft = {
      step: 1, // Skip type selection, go to info step
      updatedAt: new Date().toISOString(),
      type: preselectedType,
    };
    currentStep = 1;
    createdAgentId = null;
    log.info(`Starting wizard with preselected type: ${preselectedType}`);
  } else if (resumeDraft) {
    // Load existing draft or start fresh
    const existingDraft = loadAgentDraft();
    if (existingDraft) {
      draft = existingDraft;
      currentStep = existingDraft.step;
      log.info('Resuming draft from step:', currentStep);
    } else {
      draft = { step: 0, updatedAt: new Date().toISOString() };
      currentStep = 0;
    }
  } else {
    clearAgentDraft();
    draft = { step: 0, updatedAt: new Date().toISOString() };
    currentStep = 0;
    createdAgentId = null;
  }

  // Show modal
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Play sound
  soundUI.play('switch');

  // Render current step
  renderStep();
  updateProgress();
  updateNavButtons();
}

/**
 * Closes the wizard, saving draft
 */
export function closeCustomAgentWizard(): void {
  if (!wizardModal) return;

  // Save draft before closing
  draft.step = currentStep;
  saveAgentDraft(draft);

  // Stop any recording in progress
  stopRecording();

  wizardModal.classList.remove('open');
  document.body.style.overflow = '';

  soundUI.play('switch');
}

// ============================================================================
// STEP RENDERING
// ============================================================================

/**
 * Renders the current step content
 */
function renderStep(): void {
  const content = wizardModal?.querySelector('#wizard-content');
  if (!content) return;

  const stepId = WIZARD_STEPS[currentStep].id;

  switch (stepId) {
    case 'type':
      content.innerHTML = renderTypeStep();
      break;
    case 'info':
      content.innerHTML = renderInfoStep();
      break;
    case 'voice':
      content.innerHTML = renderVoiceStep();
      break;
    case 'personality':
      content.innerHTML = renderPersonalityStep();
      break;
    case 'memories':
      content.innerHTML = renderMemoriesStep();
      break;
  }

  // Animate in
  content.animate(
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: DURATION.NORMAL, easing: EASING.STANDARD }
  );

  // Attach step-specific event listeners
  attachStepListeners();
}

/**
 * Renders Step 1: Choose Agent Type
 */
/**
 * Returns an SVG icon for the agent type
 * Icons follow Ferni brand guidelines: 2px stroke, rounded corners, earthy/warm aesthetic
 */
function getTypeIconSvg(iconName: string): string {
  const icons: Record<string, string> = {
    // Legacy - eternal flame/candle representing remembrance
    heart: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>`,
    // Mentor - mountain path representing guidance and journey
    'graduation-cap': `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
      <path d="m5 21 5-10"/>
    </svg>`,
    // Digital Twin - mirror/reflection representing self
    'user-circle': `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <path d="M20 21a8 8 0 0 0-16 0"/>
    </svg>`,
    // Fictional - feather representing creativity and storytelling
    sparkles: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
      <line x1="16" x2="2" y1="8" y2="22"/>
      <line x1="17.5" x2="9" y1="15" y2="15"/>
    </svg>`,
    // Professional - compass representing direction and expertise
    briefcase: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>`,
  };
  return icons[iconName] || icons.sparkles;
}

function renderTypeStep(): string {
  const types = getAgentTypes();
  const selectedType = draft.type;

  return `
    <div class="wizard-step wizard-step--type">
      <div class="step-header">
        <h2 class="step-title" id="wizard-title">What would you like to create?</h2>
        <p class="step-subtitle">Each type is designed for a specific purpose</p>
      </div>
      
      <div class="type-grid">
        ${types
          .map(
            (type) => `
          <button 
            class="type-card ${selectedType === type.id ? 'type-card--selected' : ''}" 
            data-type="${type.id}"
            aria-pressed="${selectedType === type.id}"
          >
            <div class="type-icon">${getTypeIconSvg(type.icon)}</div>
            <h3 class="type-name">${type.name}</h3>
            <p class="type-description">${type.description}</p>
            <ul class="type-features">
              ${type.features.slice(0, 2).map((f) => `<li>${f}</li>`).join('')}
            </ul>
            <div class="type-selected-indicator">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Renders Step 2: Basic Info
 */
function renderInfoStep(): string {
  const typeInfo = getAgentTypes().find((t) => t.id === draft.type);
  const typeLabel = typeInfo?.name || 'Custom';

  return `
    <div class="wizard-step wizard-step--info">
      <div class="step-header">
        <h2 class="step-title" id="wizard-title">Tell us about them</h2>
        <p class="step-subtitle">Creating a ${typeLabel} agent</p>
      </div>
      
      <form class="info-form" id="info-form">
        <div class="form-group">
          <label for="agent-name" class="form-label">Name</label>
          <input 
            type="text" 
            id="agent-name" 
            class="form-input" 
            placeholder="What should we call them?"
            value="${draft.name || ''}"
            maxlength="50"
            required
          />
          <span class="form-hint">This is the name that appears in conversations</span>
        </div>

        <div class="form-group">
          <label for="agent-display-name" class="form-label">Display Name (optional)</label>
          <input 
            type="text" 
            id="agent-display-name" 
            class="form-input" 
            placeholder="e.g., 'Grandma Rose' or 'Dr. Marcus'"
            value="${draft.displayName || ''}"
            maxlength="100"
          />
          <span class="form-hint">A more personal or formal name</span>
        </div>

        <div class="form-group">
          <label for="agent-description" class="form-label">Description</label>
          <textarea 
            id="agent-description" 
            class="form-input form-textarea" 
            placeholder="Who are they? What makes them special?"
            maxlength="500"
            rows="4"
            required
          >${draft.description || ''}</textarea>
          <span class="form-hint">This helps define their personality and purpose</span>
        </div>

        <div class="form-group">
          <label class="form-label">Icon</label>
          <div class="icon-picker" id="icon-picker">
            ${[
              // Nature-inspired, earthy icons following Ferni brand guidelines
              // All icons: 2px stroke, rounded caps/joins, warm aesthetic
              { id: 'leaf', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>' },
              { id: 'heart', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>' },
              { id: 'sun', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>' },
              { id: 'moon', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>' },
              { id: 'seedling', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>' },
              { id: 'tree', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/><path d="m14 14-2 2"/></svg>' },
              { id: 'mountain', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>' },
              { id: 'compass', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>' },
              { id: 'feather', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" x2="2" y1="8" y2="22"/><line x1="17.5" x2="9" y1="15" y2="15"/></svg>' },
              { id: 'flower', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15"/><circle cx="12" cy="12" r="3"/><path d="m8 16 1.5-1.5"/><path d="M14.5 9.5 16 8"/><path d="m8 8 1.5 1.5"/><path d="M14.5 14.5 16 16"/></svg>' },
            ]
              .map(
                (icon) => `
              <button 
                type="button" 
                class="icon-option ${draft.icon === icon.id ? 'icon-option--selected' : ''}" 
                data-icon="${icon.id}"
                aria-label="${icon.id}"
              >${icon.svg}</button>
            `
              )
              .join('')}
          </div>
        </div>
      </form>
    </div>
  `;
}

/**
 * Renders Step 3: Voice Setup
 */
function renderVoiceStep(): string {
  const voiceOption = draft.voiceOption || 'library';
  const voices = getVoiceLibrary();

  return `
    <div class="wizard-step wizard-step--voice">
      <div class="step-header">
        <h2 class="step-title" id="wizard-title">How should they sound?</h2>
        <p class="step-subtitle">Choose a voice or clone one</p>
      </div>
      
      <div class="voice-options">
        <button 
          class="voice-option ${voiceOption === 'clone' ? 'voice-option--selected' : ''}" 
          data-voice-option="clone"
        >
          <div class="voice-option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>
          <div class="voice-option-content">
            <h3>Clone a Voice</h3>
            <p>Record or upload audio to create a unique voice</p>
          </div>
        </button>

        <button 
          class="voice-option ${voiceOption === 'library' ? 'voice-option--selected' : ''}" 
          data-voice-option="library"
        >
          <div class="voice-option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="voice-option-content">
            <h3>Voice Library</h3>
            <p>Choose from our collection of voices</p>
          </div>
        </button>

        <button 
          class="voice-option ${voiceOption === 'later' ? 'voice-option--selected' : ''}" 
          data-voice-option="later"
        >
          <div class="voice-option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div class="voice-option-content">
            <h3>Decide Later</h3>
            <p>Skip for now and choose a voice later</p>
          </div>
        </button>
      </div>

      <div class="voice-content" id="voice-content">
        ${voiceOption === 'clone' ? renderVoiceCloneUI() : ''}
        ${voiceOption === 'library' ? renderVoiceLibraryUI(voices) : ''}
        ${voiceOption === 'later' ? '<p class="voice-skip-message">You can add a voice anytime from the agent settings.</p>' : ''}
      </div>
    </div>
  `;
}

/**
 * Renders voice cloning UI
 */
function renderVoiceCloneUI(): string {
  return `
    <div class="voice-clone-section">
      <div class="recording-area" id="recording-area">
        <div class="recording-visualizer">
          <div class="recording-circle ${isRecording ? 'recording' : ''}">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>
        </div>
        
        <div class="recording-controls">
          <button class="recording-btn ${isRecording ? 'recording-btn--stop' : ''}" id="record-btn">
            ${isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <p class="recording-hint">Record 10-30 seconds of clear speech</p>
        </div>

        ${
          recordedAudioBlob
            ? `
          <div class="recorded-preview">
            <audio id="recorded-audio" controls src="${URL.createObjectURL(recordedAudioBlob)}"></audio>
            <button class="preview-action" id="clear-recording">Clear & Re-record</button>
          </div>
        `
            : ''
        }
      </div>

      <div class="upload-alternative">
        <span class="divider-text">or</span>
        <label for="audio-upload" class="upload-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Upload Audio File
        </label>
        <input type="file" id="audio-upload" accept="audio/*" hidden />
      </div>
    </div>
  `;
}

/**
 * Renders voice library UI
 */
function renderVoiceLibraryUI(voices: ReturnType<typeof getVoiceLibrary>): string {
  return `
    <div class="voice-library-section">
      <div class="voice-grid">
        ${voices
          .map(
            (voice) => `
          <button 
            class="voice-card ${draft.selectedVoiceId === voice.id ? 'voice-card--selected' : ''}" 
            data-voice-id="${voice.id}"
          >
            <div class="voice-avatar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
            </div>
            <div class="voice-info">
              <h4 class="voice-name">${voice.name}</h4>
              <p class="voice-description">${voice.description}</p>
              <div class="voice-tags">
                ${voice.tags.map((tag) => `<span class="voice-tag">${tag}</span>`).join('')}
              </div>
            </div>
            <button class="voice-preview-btn" data-preview="${voice.previewUrl}" aria-label="Preview ${voice.name}'s voice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Renders Step 4: Personality
 */
function renderPersonalityStep(): string {
  const personality = draft.personality || {};

  return `
    <div class="wizard-step wizard-step--personality">
      <div class="step-header">
        <h2 class="step-title" id="wizard-title">Define their personality</h2>
        <p class="step-subtitle">How should they communicate and interact?</p>
      </div>
      
      <div class="personality-form">
        <div class="personality-sliders">
          <div class="slider-group">
            <label class="slider-label">
              <span>Warmth</span>
              <span class="slider-value">${Math.round((personality.warmth || 0.5) * 100)}%</span>
            </label>
            <input 
              type="range" 
              class="personality-slider" 
              data-trait="warmth"
              min="0" max="100" 
              value="${(personality.warmth || 0.5) * 100}"
            />
            <div class="slider-labels">
              <span>Professional</span>
              <span>Warm & Friendly</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Humor</span>
              <span class="slider-value">${Math.round((personality.humorLevel || 0.3) * 100)}%</span>
            </label>
            <input 
              type="range" 
              class="personality-slider" 
              data-trait="humorLevel"
              min="0" max="100" 
              value="${(personality.humorLevel || 0.3) * 100}"
            />
            <div class="slider-labels">
              <span>Serious</span>
              <span>Playful</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Directness</span>
              <span class="slider-value">${Math.round((personality.directness || 0.5) * 100)}%</span>
            </label>
            <input 
              type="range" 
              class="personality-slider" 
              data-trait="directness"
              min="0" max="100" 
              value="${(personality.directness || 0.5) * 100}"
            />
            <div class="slider-labels">
              <span>Gentle</span>
              <span>Direct</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Energy</span>
              <span class="slider-value">${Math.round((personality.energy || 0.5) * 100)}%</span>
            </label>
            <input 
              type="range" 
              class="personality-slider" 
              data-trait="energy"
              min="0" max="100" 
              value="${(personality.energy || 0.5) * 100}"
            />
            <div class="slider-labels">
              <span>Calm</span>
              <span>Energetic</span>
            </div>
          </div>
        </div>

        <div class="personality-traits">
          <label class="form-label">Personality Traits</label>
          <div class="traits-grid">
            ${[
              'empathetic',
              'analytical',
              'nurturing',
              'challenging',
              'wise',
              'playful',
              'patient',
              'inspiring',
              'grounded',
              'curious',
            ]
              .map(
                (trait) => `
              <button 
                type="button" 
                class="trait-chip ${(personality.traits || []).includes(trait) ? 'trait-chip--selected' : ''}" 
                data-trait-chip="${trait}"
              >${trait}</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="personality-profile">
          <label class="form-label">Cognitive Style</label>
          <div class="profile-options">
            <button 
              type="button"
              class="profile-option ${personality.cognitiveProfile === 'empathetic' ? 'profile-option--selected' : ''}" 
              data-profile="empathetic"
            >
              <span class="profile-icon">
                <!-- Heart in hands - warmth and care -->
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/>
                  <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/>
                  <path d="M15 6.5a3.5 3.5 0 0 0-6.36-1.46M12 6V2"/>
                </svg>
              </span>
              <span class="profile-name">Empathetic</span>
              <span class="profile-desc">Prioritizes feelings and emotional support</span>
            </button>
            <button 
              type="button"
              class="profile-option ${personality.cognitiveProfile === 'analytical' ? 'profile-option--selected' : ''}" 
              data-profile="analytical"
            >
              <span class="profile-icon">
                <!-- Telescope - observation and insight -->
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/>
                  <path d="m13.56 11.747 4.332-.924"/>
                  <path d="m16 21-3.105-6.21"/>
                  <path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"/>
                  <path d="m6.158 8.633 1.114 4.456"/>
                  <path d="m8 21 3.105-6.21"/>
                  <circle cx="12" cy="13" r="2"/>
                </svg>
              </span>
              <span class="profile-name">Analytical</span>
              <span class="profile-desc">Focuses on logic and problem-solving</span>
            </button>
            <button 
              type="button"
              class="profile-option ${(personality.cognitiveProfile || 'balanced') === 'balanced' ? 'profile-option--selected' : ''}" 
              data-profile="balanced"
            >
              <span class="profile-icon">
                <!-- Scale/balance - equilibrium -->
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                  <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                  <path d="M7 21h10"/>
                  <path d="M12 3v18"/>
                  <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
                </svg>
              </span>
              <span class="profile-name">Balanced</span>
              <span class="profile-desc">Adapts approach to the situation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders Step 5: Memories & Review
 */
function renderMemoriesStep(): string {
  const memories = draft.memories || [];
  const isDigitalTwin = draft.type === 'twin';

  return `
    <div class="wizard-step wizard-step--memories">
      <div class="step-header">
        <h2 class="step-title" id="wizard-title">${isDigitalTwin ? 'Start Your Journal' : 'Add Memories'}</h2>
        <p class="step-subtitle">${isDigitalTwin ? 'Record your first voice journal entry' : 'What should they remember?'}</p>
      </div>
      
      <div class="memories-section">
        ${
          isDigitalTwin
            ? `
          <div class="journal-prompt">
            <p class="journal-hint">Record a short entry about how you're feeling today, or what's on your mind. This will be your first journal entry.</p>
            <div class="recording-area" id="memory-recording-area">
              <button class="recording-btn large-btn" id="journal-record-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                </svg>
                Record Journal Entry
              </button>
            </div>
          </div>
        `
            : `
          <div class="memory-types">
            <button class="memory-type-btn" data-memory-type="story">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              Add Story
            </button>
            <button class="memory-type-btn" data-memory-type="wisdom">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Add Wisdom
            </button>
            <button class="memory-type-btn" data-memory-type="sharedMoment">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              Add Moment
            </button>
          </div>
        `
        }

        <div class="added-memories" id="added-memories">
          ${
            memories.length > 0
              ? `
            <h4 class="memories-header">Added Memories (${memories.length})</h4>
            <div class="memories-list">
              ${memories
                .map(
                  (mem, i) => `
                <div class="memory-item" data-memory-index="${i}">
                  <span class="memory-type-badge">${mem.type}</span>
                  <p class="memory-preview">${mem.title || mem.phrase || mem.content.substring(0, 50)}...</p>
                  <button class="memory-remove" data-remove-memory="${i}" aria-label="Remove memory">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              `
                )
                .join('')}
            </div>
          `
              : '<p class="no-memories-hint">You can add memories now or later from the agent settings.</p>'
          }
        </div>
      </div>

      <div class="review-section">
        <h3 class="review-title">Ready to create?</h3>
        <div class="review-summary">
          <div class="summary-item">
            <span class="summary-label">Name</span>
            <span class="summary-value">${draft.displayName || draft.name || 'Not set'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Type</span>
            <span class="summary-value">${getAgentTypes().find((t) => t.id === draft.type)?.name || 'Not set'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Voice</span>
            <span class="summary-value">${draft.voiceOption === 'clone' ? 'Custom Clone' : draft.voiceOption === 'library' ? 'Library Voice' : 'Not set'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Memories</span>
            <span class="summary-value">${memories.length} added</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Attaches step-specific event listeners
 */
function attachStepListeners(): void {
  const content = wizardModal?.querySelector('#wizard-content');
  if (!content) return;

  const stepId = WIZARD_STEPS[currentStep].id;

  switch (stepId) {
    case 'type':
      content.querySelectorAll('.type-card').forEach((card) => {
        card.addEventListener('click', handleTypeSelect);
      });
      break;

    case 'info':
      const nameInput = content.querySelector('#agent-name') as HTMLInputElement;
      const displayNameInput = content.querySelector('#agent-display-name') as HTMLInputElement;
      const descInput = content.querySelector('#agent-description') as HTMLTextAreaElement;
      nameInput?.addEventListener('input', () => {
        draft.name = nameInput.value;
      });
      displayNameInput?.addEventListener('input', () => {
        draft.displayName = displayNameInput.value;
      });
      descInput?.addEventListener('input', () => {
        draft.description = descInput.value;
      });
      content.querySelectorAll('.icon-option').forEach((btn) => {
        btn.addEventListener('click', handleIconSelect);
      });
      break;

    case 'voice':
      content.querySelectorAll('.voice-option').forEach((btn) => {
        btn.addEventListener('click', handleVoiceOptionSelect);
      });
      content.querySelectorAll('.voice-card').forEach((card) => {
        card.addEventListener('click', handleVoiceSelect);
      });
      const recordBtn = content.querySelector('#record-btn');
      recordBtn?.addEventListener('click', toggleRecording);
      const clearBtn = content.querySelector('#clear-recording');
      clearBtn?.addEventListener('click', clearRecording);
      const uploadInput = content.querySelector('#audio-upload') as HTMLInputElement;
      uploadInput?.addEventListener('change', handleAudioUpload);
      break;

    case 'personality':
      content.querySelectorAll('.personality-slider').forEach((slider) => {
        slider.addEventListener('input', handleSliderChange);
      });
      content.querySelectorAll('.trait-chip').forEach((chip) => {
        chip.addEventListener('click', handleTraitToggle);
      });
      content.querySelectorAll('.profile-option').forEach((opt) => {
        opt.addEventListener('click', handleProfileSelect);
      });
      break;

    case 'memories':
      content.querySelectorAll('.memory-type-btn').forEach((btn) => {
        btn.addEventListener('click', handleAddMemory);
      });
      content.querySelectorAll('[data-remove-memory]').forEach((btn) => {
        btn.addEventListener('click', handleRemoveMemory);
      });
      break;
  }
}

function handleWizardClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Close button or backdrop
  if (target.closest('[data-action="close"]')) {
    closeCustomAgentWizard();
    return;
  }

  // Navigation buttons
  if (target.closest('[data-action="back"]')) {
    goToPreviousStep();
    return;
  }

  if (target.closest('[data-action="next"]')) {
    goToNextStep();
    return;
  }
}

function handleWizardKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeCustomAgentWizard();
  }
}

function handleTypeSelect(e: Event): void {
  const card = (e.currentTarget as HTMLElement);
  const type = card.dataset.type as CustomAgentType;
  
  draft.type = type;
  
  // Update UI
  wizardModal?.querySelectorAll('.type-card').forEach((c) => {
    c.classList.remove('type-card--selected');
    c.setAttribute('aria-pressed', 'false');
  });
  card.classList.add('type-card--selected');
  card.setAttribute('aria-pressed', 'true');
  
  soundUI.play('click');
}

function handleIconSelect(e: Event): void {
  const btn = (e.currentTarget as HTMLElement);
  const icon = btn.dataset.icon;
  
  draft.icon = icon;
  
  wizardModal?.querySelectorAll('.icon-option').forEach((o) => {
    o.classList.remove('icon-option--selected');
  });
  btn.classList.add('icon-option--selected');
  
  soundUI.play('click');
}

function handleVoiceOptionSelect(e: Event): void {
  const btn = (e.currentTarget as HTMLElement);
  const option = btn.dataset.voiceOption as 'clone' | 'library' | 'later';
  
  draft.voiceOption = option;
  
  // Update selection UI
  wizardModal?.querySelectorAll('.voice-option').forEach((o) => {
    o.classList.remove('voice-option--selected');
  });
  btn.classList.add('voice-option--selected');
  
  // Re-render voice content
  const voiceContent = wizardModal?.querySelector('#voice-content');
  if (voiceContent) {
    const voices = getVoiceLibrary();
    if (option === 'clone') {
      voiceContent.innerHTML = renderVoiceCloneUI();
      const recordBtn = voiceContent.querySelector('#record-btn');
      recordBtn?.addEventListener('click', toggleRecording);
      const uploadInput = voiceContent.querySelector('#audio-upload') as HTMLInputElement;
      uploadInput?.addEventListener('change', handleAudioUpload);
    } else if (option === 'library') {
      voiceContent.innerHTML = renderVoiceLibraryUI(voices);
      voiceContent.querySelectorAll('.voice-card').forEach((card) => {
        card.addEventListener('click', handleVoiceSelect);
      });
    } else {
      voiceContent.innerHTML = '<p class="voice-skip-message">You can add a voice anytime from the agent settings.</p>';
    }
  }
  
  soundUI.play('click');
}

function handleVoiceSelect(e: Event): void {
  const card = (e.currentTarget as HTMLElement);
  const voiceId = card.dataset.voiceId;
  
  if (voiceId) {
    draft.selectedVoiceId = voiceId;
    
    wizardModal?.querySelectorAll('.voice-card').forEach((c) => {
      c.classList.remove('voice-card--selected');
    });
    card.classList.add('voice-card--selected');
    
    soundUI.play('click');
  }
}

function handleSliderChange(e: Event): void {
  const slider = e.target as HTMLInputElement;
  const trait = slider.dataset.trait as keyof CustomAgentPersonality;
  const value = parseInt(slider.value, 10) / 100;
  
  if (!draft.personality) {
    draft.personality = {};
  }
  (draft.personality as Record<string, unknown>)[trait] = value;
  
  // Update display value
  const label = slider.closest('.slider-group')?.querySelector('.slider-value');
  if (label) {
    label.textContent = `${Math.round(value * 100)}%`;
  }
}

function handleTraitToggle(e: Event): void {
  const chip = e.currentTarget as HTMLElement;
  const trait = chip.dataset.traitChip;
  
  if (!trait) return;
  
  if (!draft.personality) {
    draft.personality = { traits: [] };
  }
  if (!draft.personality.traits) {
    draft.personality.traits = [];
  }
  
  const index = draft.personality.traits.indexOf(trait);
  if (index >= 0) {
    draft.personality.traits.splice(index, 1);
    chip.classList.remove('trait-chip--selected');
  } else {
    draft.personality.traits.push(trait);
    chip.classList.add('trait-chip--selected');
  }
  
  soundUI.play('click');
}

function handleProfileSelect(e: Event): void {
  const opt = e.currentTarget as HTMLElement;
  const profile = opt.dataset.profile as 'empathetic' | 'analytical' | 'balanced';
  
  if (!draft.personality) {
    draft.personality = {};
  }
  draft.personality.cognitiveProfile = profile;
  
  wizardModal?.querySelectorAll('.profile-option').forEach((o) => {
    o.classList.remove('profile-option--selected');
  });
  opt.classList.add('profile-option--selected');
  
  soundUI.play('click');
}

async function handleAddMemory(e: Event): Promise<void> {
  const btn = e.currentTarget as HTMLElement;
  const type = btn.dataset.memoryType as MemoryType;
  
  // Open memory input modal with pre-selected type
  const result = await openMemoryInput(type);
  
  if (result) {
    const memory: AddMemoryRequest = toAddMemoryRequest(result);
    
    if (!draft.memories) {
      draft.memories = [];
    }
    draft.memories.push(memory);
    
    // Re-render step
    renderStep();
  }
}

function handleRemoveMemory(e: Event): void {
  const btn = e.currentTarget as HTMLElement;
  const index = parseInt(btn.dataset.removeMemory || '0', 10);
  
  if (draft.memories) {
    draft.memories.splice(index, 1);
    renderStep();
    soundUI.play('click');
  }
}

// ============================================================================
// RECORDING
// ============================================================================

async function toggleRecording(): Promise<void> {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      renderStep(); // Re-render to show preview
    };
    
    mediaRecorder.start();
    isRecording = true;
    
    // Update UI
    const recordBtn = wizardModal?.querySelector('#record-btn');
    if (recordBtn) {
      recordBtn.textContent = 'Stop Recording';
      recordBtn.classList.add('recording-btn--stop');
    }
    const circle = wizardModal?.querySelector('.recording-circle');
    circle?.classList.add('recording');
    
    soundUI.play('click');
  } catch (error) {
    log.error('Failed to start recording:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not access microphone');
  }
}

function stopRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
  isRecording = false;
}

function clearRecording(): void {
  recordedAudioBlob = null;
  audioChunks = [];
  renderStep();
}

async function handleAudioUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    recordedAudioBlob = file;
    renderStep();
    soundUI.play('success');
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function updateProgress(): void {
  const progressSteps = wizardModal?.querySelectorAll('.wizard-progress-step');
  const progressBar = wizardModal?.querySelector('.progress-bar-fill') as HTMLElement;
  
  progressSteps?.forEach((step, i) => {
    step.classList.toggle('active', i === currentStep);
    step.classList.toggle('completed', i < currentStep);
  });
  
  if (progressBar) {
    const progress = (currentStep / (WIZARD_STEPS.length - 1)) * 100;
    progressBar.style.width = `${progress}%`;
  }
}

function updateNavButtons(): void {
  const backBtn = wizardModal?.querySelector('[data-action="back"]') as HTMLButtonElement;
  const nextBtn = wizardModal?.querySelector('[data-action="next"]') as HTMLButtonElement;
  
  if (backBtn) {
    backBtn.disabled = currentStep === 0;
  }
  
  if (nextBtn) {
    const isLastStep = currentStep === WIZARD_STEPS.length - 1;
    nextBtn.innerHTML = isLastStep
      ? `Create Agent
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`
      : `Continue
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>`;
  }
}

function goToPreviousStep(): void {
  if (currentStep > 0) {
    currentStep--;
    renderStep();
    updateProgress();
    updateNavButtons();
    soundUI.play('switch');
  }
}

async function goToNextStep(): Promise<void> {
  // Validate current step
  if (!validateCurrentStep()) {
    return;
  }
  
  // Save draft
  draft.step = currentStep;
  saveAgentDraft(draft);
  
  if (currentStep < WIZARD_STEPS.length - 1) {
    currentStep++;
    renderStep();
    updateProgress();
    updateNavButtons();
    soundUI.play('switch');
  } else {
    // Final step - create the agent
    await createAgent();
  }
}

function validateCurrentStep(): boolean {
  const stepId = WIZARD_STEPS[currentStep].id;
  
  switch (stepId) {
    case 'type':
      if (!draft.type) {
        showValidationError('Please select an agent type');
        return false;
      }
      break;
    case 'info':
      if (!draft.name?.trim()) {
        showValidationError('Please enter a name');
        return false;
      }
      if (!draft.description?.trim()) {
        showValidationError('Please enter a description');
        return false;
      }
      break;
    // Voice and personality are optional
  }
  
  return true;
}

async function showValidationError(message: string): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  toast.warning(message);
  soundUI.play('click');
}

// ============================================================================
// AGENT CREATION
// ============================================================================

async function createAgent(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  try {
    // Show loading state
    const nextBtn = wizardModal?.querySelector('[data-action="next"]') as HTMLButtonElement;
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = `
        <span class="spinner"></span>
        Creating...
      `;
    }
    
    // Create the agent
    const agent = await createCustomAgent({
      name: draft.name!,
      displayName: draft.displayName,
      description: draft.description!,
      type: draft.type!,
      icon: draft.icon,
    });
    
    createdAgentId = agent.id;
    
    // Upload voice if recorded
    if (draft.voiceOption === 'clone' && recordedAudioBlob) {
      const { audioUrl } = await uploadVoiceSample(agent.id, recordedAudioBlob);
      await createVoiceClone(agent.id, audioUrl, draft.displayName || draft.name!);
    } else if (draft.voiceOption === 'library' && draft.selectedVoiceId) {
      const { selectPreMadeVoice } = await import('../services/custom-agent.service.js');
      await selectPreMadeVoice(agent.id, draft.selectedVoiceId);
    }
    
    // Update personality
    if (draft.personality) {
      await updateCustomAgent(agent.id, {
        personality: {
          warmth: draft.personality.warmth ?? 0.5,
          humorLevel: draft.personality.humorLevel ?? 0.3,
          directness: draft.personality.directness ?? 0.5,
          energy: draft.personality.energy ?? 0.5,
          formality: 0.5,
          traits: draft.personality.traits || [],
          values: [],
          cognitiveProfile: draft.personality.cognitiveProfile || 'balanced',
          responsePatterns: {},
        },
      });
    }
    
    // Add memories
    if (draft.memories?.length) {
      for (const memory of draft.memories) {
        await addMemory(agent.id, memory);
      }
    }
    
    // Clear draft
    clearAgentDraft();
    
    // Success!
    toast.success(`${draft.displayName || draft.name} created!`);
    soundUI.play('success');
    
    // Dispatch event
    dispatchCustomAgentEvent('custom-agent:created', { agentId: agent.id });
    
    // Close wizard
    closeCustomAgentWizard();
    
  } catch (error) {
    log.error('Failed to create agent:', error);
    toast.error('Something went wrong. Try again?');
    
    // Reset button
    const nextBtn = wizardModal?.querySelector('[data-action="next"]') as HTMLButtonElement;
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = `
        Create Agent
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    }
  }
}

// ============================================================================
// STYLES
// ============================================================================

function getWizardStyles(): string {
  return `
    /* Wizard Overlay */
    .custom-agent-wizard-overlay {
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
    
    .custom-agent-wizard-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .wizard-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    /* Wizard Container */
    .wizard-container {
      position: relative;
      width: 90vw;
      max-width: 720px;
      max-height: 85vh;
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .custom-agent-wizard-overlay.open .wizard-container {
      transform: scale(1);
    }
    
    /* Header */
    .wizard-header {
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .wizard-progress {
      display: flex;
      gap: var(--space-md, 16px);
      align-items: center;
      position: relative;
      flex: 1;
    }
    
    .wizard-progress-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 4px);
      z-index: 1;
    }
    
    .progress-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--color-border-subtle, rgba(255, 255, 255, 0.2));
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .wizard-progress-step.active .progress-dot {
      background: var(--color-accent, #4a6741);
      box-shadow: 0 0 12px var(--color-accent, #4a6741);
    }
    
    .wizard-progress-step.completed .progress-dot {
      background: var(--color-accent, #4a6741);
    }
    
    .progress-label {
      font-size: 0.7rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      white-space: nowrap;
    }
    
    .wizard-progress-step.active .progress-label {
      color: var(--color-text-primary, #fff);
    }
    
    .wizard-progress-bar {
      position: absolute;
      top: 6px;
      left: 6px;
      right: 6px;
      height: 2px;
      background: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      z-index: 0;
    }
    
    .progress-bar-fill {
      height: 100%;
      background: var(--color-accent, #4a6741);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .wizard-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .wizard-close:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Content */
    .wizard-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-xl, 32px);
    }
    
    .wizard-step {
      animation: fadeIn ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .step-header {
      margin-bottom: var(--space-xl, 32px);
      text-align: center;
    }
    
    .step-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 var(--space-xs, 4px);
      color: var(--color-text-primary);
    }
    
    .step-subtitle {
      font-size: 0.95rem;
      color: var(--color-text-muted);
      margin: 0;
    }
    
    /* Type Selection */
    .type-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md, 16px);
    }
    
    .type-card {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-lg, 24px);
      cursor: pointer;
      text-align: left;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      position: relative;
    }
    
    .type-card:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-border-subtle);
    }
    
    .type-card--selected {
      border-color: var(--color-accent, #4a6741);
      background: rgba(74, 103, 65, 0.1);
    }
    
    .type-icon {
      margin-bottom: var(--space-sm, 8px);
      color: var(--color-accent, #4a6741);
    }
    
    .type-card--selected .type-icon {
      color: var(--color-accent, #4a6741);
    }
    
    .type-name {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 var(--space-xs, 4px);
      color: var(--color-text-primary);
    }
    
    .type-description {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-sm, 8px);
      line-height: 1.4;
    }
    
    .type-features {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }
    
    .type-features li {
      padding-left: 1em;
      position: relative;
    }
    
    .type-features li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: var(--color-accent);
    }
    
    .type-selected-indicator {
      position: absolute;
      top: var(--space-sm);
      right: var(--space-sm);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--color-accent, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      opacity: 0;
      transform: scale(0.5);
      transition: all ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .type-card--selected .type-selected-indicator {
      opacity: 1;
      transform: scale(1);
    }
    
    /* Form Elements */
    .form-group {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .form-label {
      display: block;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin-bottom: var(--space-xs, 4px);
    }
    
    .form-input {
      width: 100%;
      padding: var(--space-sm, 12px) var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-size: 1rem;
      transition: all ${DURATION.FAST}ms;
    }
    
    .form-input:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.2);
    }
    
    .form-textarea {
      resize: vertical;
      min-height: 100px;
    }
    
    .form-hint {
      display: block;
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
      margin-top: var(--space-xs, 4px);
    }
    
    .icon-picker {
      display: flex;
      gap: var(--space-xs, 4px);
      flex-wrap: wrap;
    }
    
    .icon-option {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md, 8px);
      border: 2px solid transparent;
      background: var(--color-bg-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }
    
    .icon-option:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-accent, #4a6741);
    }
    
    .icon-option--selected {
      border-color: var(--color-accent);
      background: rgba(74, 103, 65, 0.2);
      color: var(--color-accent, #4a6741);
    }
    
    /* Voice Options */
    .voice-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-md, 16px);
      margin-bottom: var(--space-xl, 32px);
    }
    
    .voice-option {
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-md, 16px);
      cursor: pointer;
      text-align: center;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .voice-option:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-border-subtle);
    }
    
    .voice-option--selected {
      border-color: var(--color-accent);
      background: rgba(74, 103, 65, 0.1);
    }
    
    .voice-option-icon {
      margin-bottom: var(--space-sm, 8px);
      color: var(--color-text-muted);
    }
    
    .voice-option--selected .voice-option-icon {
      color: var(--color-accent);
    }
    
    .voice-option-content h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 var(--space-xs, 4px);
      color: var(--color-text-primary);
    }
    
    .voice-option-content p {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 0;
    }
    
    /* Recording UI */
    .recording-area {
      text-align: center;
      padding: var(--space-xl, 32px);
    }
    
    .recording-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: var(--color-bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto var(--space-lg, 24px);
      color: var(--color-text-muted);
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .recording-circle.recording {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
    }
    
    .recording-btn {
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--color-accent);
      color: white;
      border: none;
      border-radius: var(--radius-full, 999px);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .recording-btn:hover {
      filter: brightness(1.1);
    }
    
    .recording-btn--stop {
      background: #ef4444;
    }
    
    .recording-hint {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin-top: var(--space-sm, 8px);
    }
    
    .recorded-preview {
      margin-top: var(--space-lg, 24px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .recorded-preview audio {
      width: 100%;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .preview-action {
      background: none;
      border: none;
      color: var(--color-accent);
      font-size: 0.85rem;
      cursor: pointer;
    }
    
    .upload-alternative {
      margin-top: var(--space-lg, 24px);
      text-align: center;
    }
    
    .divider-text {
      color: var(--color-text-dimmed);
      font-size: 0.85rem;
    }
    
    .upload-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-sm, 8px);
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 1px dashed var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .upload-btn:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
    
    /* Voice Library */
    .voice-grid {
      display: grid;
      gap: var(--space-sm, 8px);
    }
    
    .voice-card {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      text-align: left;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .voice-card:hover {
      background: var(--color-bg-tertiary);
    }
    
    .voice-card--selected {
      border-color: var(--color-accent);
    }
    
    .voice-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--color-bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }
    
    .voice-info {
      flex: 1;
    }
    
    .voice-name {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 var(--space-2xs, 2px);
      color: var(--color-text-primary);
    }
    
    .voice-description {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .voice-tags {
      display: flex;
      gap: var(--space-xs, 4px);
    }
    
    .voice-tag {
      font-size: 0.65rem;
      padding: 2px 6px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-sm, 4px);
      color: var(--color-text-dimmed);
    }
    
    .voice-preview-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: var(--color-bg-tertiary);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms;
    }
    
    .voice-preview-btn:hover {
      background: var(--color-accent);
      color: white;
    }
    
    .voice-skip-message {
      text-align: center;
      color: var(--color-text-muted);
      padding: var(--space-xl, 32px);
    }
    
    /* Personality Sliders */
    .personality-sliders {
      display: grid;
      gap: var(--space-lg, 24px);
      margin-bottom: var(--space-xl, 32px);
    }
    
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 4px);
    }
    
    .slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      color: var(--color-text-primary);
    }
    
    .slider-value {
      color: var(--color-accent);
      font-weight: 500;
    }
    
    .personality-slider {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: var(--color-bg-secondary);
      appearance: none;
      cursor: pointer;
    }
    
    .personality-slider::-webkit-slider-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-accent);
      border: none;
      appearance: none;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }
    
    .slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--color-text-dimmed);
    }
    
    /* Traits */
    .traits-grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 4px);
    }
    
    .trait-chip {
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      border-radius: var(--radius-full, 999px);
      border: 1px solid var(--color-border-subtle);
      background: transparent;
      color: var(--color-text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .trait-chip:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
    
    .trait-chip--selected {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: white;
    }
    
    /* Profile Options */
    .profile-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-sm, 8px);
    }
    
    .profile-option {
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      text-align: center;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .profile-option:hover {
      background: var(--color-bg-tertiary);
    }
    
    .profile-option--selected {
      border-color: var(--color-accent);
    }
    
    .profile-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-xs, 4px);
      color: var(--color-text-muted);
    }
    
    .profile-option--selected .profile-icon {
      color: var(--color-accent, #4a6741);
    }
    
    .profile-name {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary);
      display: block;
    }
    
    .profile-desc {
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
    
    /* Memories */
    .memory-types {
      display: flex;
      gap: var(--space-sm, 8px);
      justify-content: center;
      margin-bottom: var(--space-xl, 32px);
    }
    
    .memory-type-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 12px) var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .memory-type-btn:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent);
    }
    
    .memories-list {
      display: grid;
      gap: var(--space-sm, 8px);
    }
    
    .memory-item {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .memory-type-badge {
      font-size: 0.65rem;
      padding: 2px 8px;
      background: var(--color-accent);
      color: white;
      border-radius: var(--radius-sm, 4px);
      text-transform: uppercase;
    }
    
    .memory-preview {
      flex: 1;
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .memory-remove {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--color-text-dimmed);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .memory-remove:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    
    .no-memories-hint,
    .journal-hint {
      text-align: center;
      color: var(--color-text-muted);
      font-size: 0.9rem;
      margin-bottom: var(--space-lg, 24px);
    }
    
    /* Review Section */
    .review-section {
      margin-top: var(--space-xl, 32px);
      padding-top: var(--space-xl, 32px);
      border-top: 1px solid var(--color-border-subtle);
    }
    
    .review-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 var(--space-md, 16px);
      color: var(--color-text-primary);
      text-align: center;
    }
    
    .review-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md, 16px);
    }
    
    .summary-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 2px);
    }
    
    .summary-label {
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
      text-transform: uppercase;
    }
    
    .summary-value {
      font-size: 0.95rem;
      color: var(--color-text-primary);
    }
    
    /* Footer */
    .wizard-footer {
      padding: var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      justify-content: space-between;
      gap: var(--space-md, 16px);
    }
    
    .wizard-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      border-radius: var(--radius-full, 999px);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .wizard-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .wizard-btn--secondary {
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
    }
    
    .wizard-btn--secondary:hover:not(:disabled) {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }
    
    .wizard-btn--primary {
      background: var(--color-accent, #4a6741);
      border: none;
      color: white;
    }
    
    .wizard-btn--primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Responsive */
    @media (max-width: 640px) {
      .wizard-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .type-grid {
        grid-template-columns: 1fr;
      }
      
      .voice-options {
        grid-template-columns: 1fr;
      }
      
      .profile-options {
        grid-template-columns: 1fr;
      }
      
      .review-summary {
        grid-template-columns: 1fr;
      }
      
      .wizard-progress-step {
        flex: 1;
      }
      
      .progress-label {
        display: none;
      }
    }
  `;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Note: openCustomAgentWizard and closeCustomAgentWizard are already exported inline above

