/**
 * Custom Agent Editor UI
 *
 * A full-featured editor for modifying existing custom agents.
 * Allows editing name, description, personality, voice, and memories.
 *
 * @module custom-agent-editor.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { t } from '../i18n/index.js';
import {
  type CustomAgent,
  type CustomAgentPersonality,
  getCustomAgent,
  updateCustomAgent,
  deleteMemory,
  addMemory,
  dispatchCustomAgentEvent,
  getAgentTypes,
  getVoiceLibrary,
  selectPreMadeVoice,
} from '../services/custom-agent.service.js';
import { confirmDelete } from './confirm-modal.ui.js';
import { openMemoryInput, toAddMemoryRequest } from './memory-input-modal.ui.js';

const log = createLogger('AgentEditor');

// ============================================================================
// STATE
// ============================================================================

let editorModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let activeTab: 'info' | 'personality' | 'voice' | 'memories' = 'info';
let hasUnsavedChanges = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

function ensureStylesExist(): void {
  if (document.getElementById('agent-editor-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'agent-editor-styles';
  styles.textContent = getEditorStyles();
  document.head.appendChild(styles);
}

function ensureModalExists(): HTMLElement {
  if (editorModal) return editorModal;

  document.querySelectorAll('.agent-editor-overlay').forEach((el) => el.remove());

  editorModal = document.createElement('div');
  editorModal.className = 'agent-editor-overlay';
  editorModal.innerHTML = `
    <div class="editor-backdrop" data-action="close" role="button" tabindex="0"></div>
    <div class="editor-container" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header class="editor-header">
        <div class="editor-header-content">
          <div class="editor-avatar" id="editor-avatar"></div>
          <div class="editor-header-text">
            <h2 class="editor-title" id="editor-title">Edit Agent</h2>
            <span class="editor-subtitle" id="editor-subtitle"></span>
          </div>
        </div>
        <div class="editor-header-actions" role="button" tabindex="0">
          <span class="editor-status" id="editor-status"></span>
          <button class="editor-close" data-action="close" aria-label="${t('accessibility.closeEditor')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <nav class="editor-tabs" role="tablist">
        <button aria-label="${t('accessibility.moreInformation')}" class="editor-tab active" data-tab="info" role="tab" aria-selected="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          Info
        </button>
        <button aria-label="${t('accessibility.personality')}" class="editor-tab" data-tab="personality" role="tab" aria-selected="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          Personality
        </button>
        <button aria-label="${t('accessibility.voice')}" class="editor-tab" data-tab="voice" role="tab" aria-selected="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          Voice
        </button>
        <button aria-label="${t('accessibility.memories')}" class="editor-tab" data-tab="memories" role="tab" aria-selected="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          Memories
        </button>
      </nav>

      <main class="editor-content" id="editor-content">
        <!-- Tab content renders here -->
      </main>

      <footer class="editor-footer">
        <button aria-label="${t('accessibility.delete')}" class="editor-btn editor-btn--danger" data-action="delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          Delete Agent
        </button>
        <div class="editor-footer-actions" role="button" tabindex="0">
          <button aria-label="${t('accessibility.cancel')}" class="editor-btn editor-btn--secondary" data-action="cancel">
            Cancel
          </button>
          <button aria-label="${t('accessibility.saveChanges')}" class="editor-btn editor-btn--primary" data-action="save" id="save-btn">
            Save Changes
          </button>
        </div>
      </footer>
    </div>
  `;

  editorModal.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);

  document.body.appendChild(editorModal);
  return editorModal;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Opens the editor for a specific agent
 */
export async function openAgentEditor(agentId: string): Promise<void> {
  ensureStylesExist();
  const modal = ensureModalExists();

  try {
    // Fetch latest agent data
    const agent = await getCustomAgent(agentId);
    if (!agent) {
      const { toast } = await import('./whisper.ui.js');
      toast.error(t('toasts.agentNotFound'));
      return;
    }

    currentAgent = agent;
    activeTab = 'info';
    hasUnsavedChanges = false;

    // Update header
    updateHeader();

    // Render initial tab
    renderTab();

    // Show modal
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    soundUI.play('switch');
    log.info('Agent editor opened:', agentId);
  } catch (err) {
    log.error('Failed to open agent editor:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't load agent");
  }
}

/**
 * Closes the editor
 */
export async function closeAgentEditor(): Promise<void> {
  if (!editorModal) return;

  if (hasUnsavedChanges) {
    const { confirm } = await import('./confirm-modal.ui.js');
    const discard = await confirm({
      title: 'Discard changes?',
      message: 'You have unsaved changes. Are you sure you want to close?',
      confirmText: 'Discard',
      cancelText: 'Keep Editing',
      icon: 'warning',
    });
    if (!discard) return;
  }

  editorModal.classList.remove('open');
  document.body.style.overflow = '';

  setTimeout(() => {
    currentAgent = null;
    hasUnsavedChanges = false;
  }, DURATION.NORMAL);

  soundUI.play('switch');
}

// ============================================================================
// HEADER
// ============================================================================

function updateHeader(): void {
  if (!editorModal || !currentAgent) return;

  const avatar = editorModal.querySelector('#editor-avatar') as HTMLElement;
  const title = editorModal.querySelector('#editor-title') as HTMLElement;
  const subtitle = editorModal.querySelector('#editor-subtitle') as HTMLElement;
  const status = editorModal.querySelector('#editor-status') as HTMLElement;

  const initials = (currentAgent.displayName || currentAgent.name)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const primaryColor = currentAgent.colors?.primary || 'var(--color-accent)';

  avatar.innerHTML = currentAgent.icon || initials;
  avatar.style.background = `linear-gradient(135deg, ${primaryColor}, ${primaryColor})`;

  title.textContent = currentAgent.displayName || currentAgent.name;
  subtitle.textContent = getAgentTypes().find((t) => t.id === currentAgent!.type)?.name || currentAgent.type;

  const statusClass = currentAgent.status === 'active' ? 'status--active' : 
                      currentAgent.status === 'paused' ? 'status--paused' : 'status--draft';
  status.className = `editor-status ${statusClass}`;
  status.textContent = currentAgent.status;
}

// ============================================================================
// TAB RENDERING
// ============================================================================

function renderTab(): void {
  const content = editorModal?.querySelector('#editor-content');
  if (!content || !currentAgent) return;

  // Update tab states
  editorModal?.querySelectorAll('.editor-tab').forEach((tab) => {
    const isActive = tab.getAttribute('data-tab') === activeTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  switch (activeTab) {
    case 'info':
      content.innerHTML = renderInfoTab();
      break;
    case 'personality':
      content.innerHTML = renderPersonalityTab();
      break;
    case 'voice':
      content.innerHTML = renderVoiceTab();
      break;
    case 'memories':
      content.innerHTML = renderMemoriesTab();
      break;
  }

  attachTabListeners();

  // Animate in
  content.animate(
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: DURATION.NORMAL, easing: EASING.STANDARD }
  );
}

function renderInfoTab(): string {
  if (!currentAgent) return '';

  return `
    <div class="editor-tab-content">
      <div class="editor-section">
        <h3 class="editor-section-title">Basic Information</h3>
        
        <div class="editor-field">
          <label class="editor-field-label" for="agent-name">Name</label>
          <input 
            type="text" 
            class="editor-field-input" 
            id="agent-name"
            value="${currentAgent.name}"
            placeholder="Agent name"
          />
        </div>

        <div class="editor-field">
          <label class="editor-field-label" for="agent-display-name">Display Name</label>
          <input 
            type="text" 
            class="editor-field-input" 
            id="agent-display-name"
            value="${currentAgent.displayName || ''}"
            placeholder="How they introduce themselves"
          />
        </div>

        <div class="editor-field">
          <label class="editor-field-label" for="agent-description">Description</label>
          <textarea 
            class="editor-field-textarea" 
            id="agent-description"
            placeholder="Who is this agent?"
            rows="4"
          >${currentAgent.description}</textarea>
        </div>
      </div>

      <div class="editor-section">
        <h3 class="editor-section-title">Status</h3>
        <div class="editor-status-toggle" role="button" tabindex="0">
          <button aria-label="${t('accessibility.draft')}" 
            class="status-option ${currentAgent.status === 'draft' ? 'status-option--active' : ''}"
            data-status="draft"
          >
            <span class="status-dot status-dot--draft"></span>
            Draft
          </button>
          <button aria-label="${t('accessibility.active')}" 
            class="status-option ${currentAgent.status === 'active' ? 'status-option--active' : ''}"
            data-status="active"
          >
            <span class="status-dot status-dot--active"></span>
            Active
          </button>
          <button aria-label="${t('accessibility.pause')}" 
            class="status-option ${currentAgent.status === 'paused' ? 'status-option--active' : ''}"
            data-status="paused"
          >
            <span class="status-dot status-dot--paused"></span>
            Paused
          </button>
        </div>
        <p class="editor-hint">Active agents can be used in conversations.</p>
      </div>
    </div>
  `;
}

function renderPersonalityTab(): string {
  if (!currentAgent) return '';

  const personality = currentAgent.personality;
  const traits = [
    'empathetic', 'analytical', 'nurturing', 'challenging',
    'wise', 'playful', 'patient', 'inspiring', 'grounded', 'curious',
  ];

  return `
    <div class="editor-tab-content">
      <div class="editor-section">
        <h3 class="editor-section-title">Communication Style</h3>
        
        ${renderSlider('warmth', 'Warmth', personality.warmth, 'Professional', 'Warm & Friendly')}
        ${renderSlider('humorLevel', 'Humor', personality.humorLevel, 'Serious', 'Playful')}
        ${renderSlider('directness', 'Directness', personality.directness, 'Gentle', 'Direct')}
        ${renderSlider('energy', 'Energy', personality.energy, 'Calm', 'Energetic')}
        ${renderSlider('formality', 'Formality', personality.formality, 'Casual', 'Formal')}
      </div>

      <div class="editor-section">
        <h3 class="editor-section-title">Personality Traits</h3>
        <div class="editor-traits">
          ${traits.map((trait) => `
            <button aria-label="${t('accessibility.edit')}" 
              type="button"
              class="editor-trait ${personality.traits.includes(trait) ? 'editor-trait--selected' : ''}"
              data-trait="${trait}"
            >${trait}</button>
          `).join('')}
        </div>
      </div>

      <div class="editor-section">
        <h3 class="editor-section-title">Cognitive Style</h3>
        <div class="editor-profiles">
          <button aria-label="${t('accessibility.empathetic')}" 
            class="editor-profile ${personality.cognitiveProfile === 'empathetic' ? 'editor-profile--selected' : ''}"
            data-profile="empathetic"
          >
            <span class="profile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
              </svg>
            </span>
            <span class="profile-name">Empathetic</span>
          </button>
          <button aria-label="${t('accessibility.analytical')}" 
            class="editor-profile ${personality.cognitiveProfile === 'analytical' ? 'editor-profile--selected' : ''}"
            data-profile="analytical"
          >
            <span class="profile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            <span class="profile-name">Analytical</span>
          </button>
          <button aria-label="${t('accessibility.balanced')}" 
            class="editor-profile ${personality.cognitiveProfile === 'balanced' ? 'editor-profile--selected' : ''}"
            data-profile="balanced"
          >
            <span class="profile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="M7 21h10"/>
                <path d="M12 3v18"/>
              </svg>
            </span>
            <span class="profile-name">Balanced</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSlider(id: string, label: string, value: number, minLabel: string, maxLabel: string): string {
  const percent = Math.round(value * 100);
  return `
    <div class="editor-slider-group">
      <label class="editor-slider-label">
        <span>${label}</span>
        <span class="editor-slider-value">${percent}%</span>
      </label>
      <input 
        type="range" 
        class="editor-slider" 
        data-personality="${id}"
        min="0" max="100" 
        value="${percent}"
      />
      <div class="editor-slider-labels">
        <span>${minLabel}</span>
        <span>${maxLabel}</span>
      </div>
    </div>
  `;
}

function renderVoiceTab(): string {
  if (!currentAgent) return '';

  const voice = currentAgent.voice;
  const voices = getVoiceLibrary();

  return `
    <div class="editor-tab-content">
      <div class="editor-section">
        <h3 class="editor-section-title">Current Voice</h3>
        <div class="editor-voice-current">
          <div class="voice-status voice-status--${voice.status}">
            <span class="voice-status-dot"></span>
            ${voice.status === 'ready' ? 'Voice Ready' : 
              voice.status === 'processing' ? 'Processing...' :
              voice.status === 'failed' ? 'Failed' : 'Not Set'}
          </div>
          <p class="voice-type">${voice.type === 'cloned' ? 'Cloned Voice' : 
                                  voice.type === 'selected' ? 'Library Voice' : 'Default'}</p>
        </div>
      </div>

      <div class="editor-section">
        <h3 class="editor-section-title">Voice Library</h3>
        <p class="editor-hint">Select a pre-made voice from our library</p>
        <div class="editor-voice-grid">
          ${voices.map((v) => `
            <button aria-label="${t('accessibility.moreInformation')}" 
              class="editor-voice-card ${voice.voiceId === v.id ? 'editor-voice-card--selected' : ''}"
              data-voice-id="${v.id}"
            >
              <div class="voice-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
              </div>
              <div class="voice-info">
                <span class="voice-name">${v.name}</span>
                <span class="voice-desc">${v.description}</span>
              </div>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="editor-section">
        <h3 class="editor-section-title">Voice Settings</h3>
        ${renderSlider('speed', 'Speed', (voice.settings.speed - 0.5) / 1, 'Slower', 'Faster')}
        ${renderSlider('stability', 'Stability', voice.settings.stability, 'Variable', 'Stable')}
      </div>
    </div>
  `;
}

function renderMemoriesTab(): string {
  if (!currentAgent) return '';

  const memories = currentAgent.memories;
  const allMemories = [
    ...memories.stories.map((m) => ({ ...m, category: 'stories' as const })),
    ...memories.wisdom.map((m) => ({ ...m, category: 'wisdom' as const })),
    ...memories.sharedMoments.map((m) => ({ ...m, category: 'sharedMoments' as const })),
    ...(memories.journalEntries || []).map((m) => ({ ...m, category: 'journalEntries' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return `
    <div class="editor-tab-content">
      <div class="editor-section">
        <div class="editor-section-header">
          <h3 class="editor-section-title">Memories (${allMemories.length})</h3>
          <button aria-label="${t('accessibility.addMemory')}" class="editor-add-btn" data-action="add-memory">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Memory
          </button>
        </div>

        ${allMemories.length === 0 ? `
          <div class="editor-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <p>No memories yet</p>
            <p class="editor-empty-hint">Add stories, wisdom, or shared moments</p>
          </div>
        ` : `
          <div class="editor-memories-list">
            ${allMemories.map((memory) => `
              <div class="editor-memory-item" data-memory-id="${memory.id}" data-category="${memory.category}">
                <span class="memory-type-badge memory-type-badge--${memory.category}">${memory.type}</span>
                <div class="memory-content">
                  <span class="memory-title">${memory.title || memory.phrase || memory.content.substring(0, 40)}...</span>
                  <span class="memory-date">${new Date(memory.createdAt).toLocaleDateString()}</span>
                </div>
                <button class="memory-delete-btn" data-delete-memory="${memory.id}" data-category="${memory.category}" aria-label="${t('accessibility.deleteMemory')}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Tab clicks
  const tab = target.closest('.editor-tab') as HTMLElement;
  if (tab) {
    const tabId = tab.dataset.tab as typeof activeTab;
    if (tabId && tabId !== activeTab) {
      activeTab = tabId;
      renderTab();
      soundUI.play('click');
    }
    return;
  }

  // Actions
  const action = target.closest('[data-action]')?.getAttribute('data-action');
  if (action === 'close' || action === 'cancel') {
    void closeAgentEditor();
  } else if (action === 'save') {
    void saveChanges();
  } else if (action === 'delete') {
    void deleteAgent();
  } else if (action === 'add-memory') {
    void handleAddMemory();
  }

  // Status toggle
  const statusOption = target.closest('[data-status]') as HTMLElement;
  if (statusOption && currentAgent) {
    const status = statusOption.dataset.status as CustomAgent['status'];
    currentAgent.status = status;
    hasUnsavedChanges = true;
    renderTab();
    soundUI.play('click');
  }

  // Delete memory
  const deleteMemoryBtn = target.closest('[data-delete-memory]') as HTMLElement;
  if (deleteMemoryBtn) {
    const memoryId = deleteMemoryBtn.dataset.deleteMemory;
    const category = deleteMemoryBtn.dataset.category as 'stories' | 'wisdom' | 'sharedMoments' | 'journalEntries';
    if (memoryId && category) {
      void handleDeleteMemory(memoryId, category);
    }
  }

  // Voice selection
  const voiceCard = target.closest('[data-voice-id]') as HTMLElement;
  if (voiceCard && currentAgent) {
    const voiceId = voiceCard.dataset.voiceId;
    if (voiceId) {
      void handleVoiceSelect(voiceId);
    }
  }

  // Trait toggle
  const traitBtn = target.closest('[data-trait]') as HTMLElement;
  if (traitBtn && currentAgent) {
    const trait = traitBtn.dataset.trait;
    if (trait) {
      const traits = currentAgent.personality.traits;
      const index = traits.indexOf(trait);
      if (index >= 0) {
        traits.splice(index, 1);
      } else {
        traits.push(trait);
      }
      hasUnsavedChanges = true;
      traitBtn.classList.toggle('editor-trait--selected');
      soundUI.play('click');
    }
  }

  // Profile selection
  const profileBtn = target.closest('[data-profile]') as HTMLElement;
  if (profileBtn && currentAgent) {
    const profile = profileBtn.dataset.profile as CustomAgentPersonality['cognitiveProfile'];
    currentAgent.personality.cognitiveProfile = profile;
    hasUnsavedChanges = true;
    editorModal?.querySelectorAll('[data-profile]').forEach((p) => {
      p.classList.toggle('editor-profile--selected', p === profileBtn);
    });
    soundUI.play('click');
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    void closeAgentEditor();
  }
}

function attachTabListeners(): void {
  const content = editorModal?.querySelector('#editor-content');
  if (!content) return;

  // Input listeners for info tab
  content.querySelectorAll('input, textarea').forEach((input) => {
    input.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      const id = target.id;

      if (!currentAgent) return;

      if (id === 'agent-name') {
        currentAgent.name = target.value;
      } else if (id === 'agent-display-name') {
        currentAgent.displayName = target.value;
      } else if (id === 'agent-description') {
        currentAgent.description = target.value;
      }

      hasUnsavedChanges = true;
    });
  });

  // Slider listeners
  content.querySelectorAll('.editor-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const key = target.dataset.personality;
      const value = parseInt(target.value, 10) / 100;

      if (!currentAgent || !key) return;

      if (key in currentAgent.personality) {
        (currentAgent.personality as unknown as Record<string, number>)[key] = value;
      } else if (key === 'speed' && currentAgent.voice?.settings) {
        currentAgent.voice.settings.speed = 0.5 + value;
      } else if (key === 'stability' && currentAgent.voice?.settings) {
        currentAgent.voice.settings.stability = value;
      }

      // Update display value
      const label = target.closest('.editor-slider-group')?.querySelector('.editor-slider-value');
      if (label) {
        label.textContent = `${Math.round(value * 100)}%`;
      }

      hasUnsavedChanges = true;
    });
  });
}

async function handleAddMemory(): Promise<void> {
  const result = await openMemoryInput();
  if (result && currentAgent) {
    try {
      await addMemory(currentAgent.id, toAddMemoryRequest(result));
      // Refresh agent data
      const updated = await getCustomAgent(currentAgent.id);
      if (updated) {
        currentAgent = updated;
        renderTab();
      }
      const { toast } = await import('./whisper.ui.js');
      toast.success(t('toasts.memoryAdded'));
    } catch (err) {
      log.error('Failed to add memory:', err);
      const { toast } = await import('./whisper.ui.js');
      toast.error("Couldn't add memory");
    }
  }
}

async function handleDeleteMemory(
  memoryId: string, 
  category: 'stories' | 'wisdom' | 'sharedMoments' | 'journalEntries'
): Promise<void> {
  if (!currentAgent) return;

  const confirmed = await confirmDelete('this memory');
  if (!confirmed) return;

  try {
    await deleteMemory(currentAgent.id, memoryId);
    // Update local state
    const memories = currentAgent.memories;
    if (category === 'journalEntries' && memories.journalEntries) {
      memories.journalEntries = memories.journalEntries.filter((m) => m.id !== memoryId);
    } else if (category === 'stories') {
      memories.stories = memories.stories.filter((m) => m.id !== memoryId);
    } else if (category === 'wisdom') {
      memories.wisdom = memories.wisdom.filter((m) => m.id !== memoryId);
    } else if (category === 'sharedMoments') {
      memories.sharedMoments = memories.sharedMoments.filter((m) => m.id !== memoryId);
    }
    renderTab();
    const { toast } = await import('./whisper.ui.js');
    toast.success(t('toasts.memoryDeleted'));
  } catch (err) {
    log.error('Failed to delete memory:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't delete memory");
  }
}

async function handleVoiceSelect(voiceId: string): Promise<void> {
  if (!currentAgent) return;

  try {
    await selectPreMadeVoice(currentAgent.id, voiceId);
    currentAgent.voice.voiceId = voiceId;
    currentAgent.voice.type = 'selected';
    currentAgent.voice.status = 'ready';
    renderTab();
    const { toast } = await import('./whisper.ui.js');
    toast.success(t('toasts.voiceUpdated'));
  } catch (err) {
    log.error('Failed to select voice:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't update voice");
  }
}

async function saveChanges(): Promise<void> {
  if (!currentAgent) return;

  const saveBtn = editorModal?.querySelector('#save-btn') as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
  }

  try {
    await updateCustomAgent(currentAgent.id, {
      name: currentAgent.name,
      displayName: currentAgent.displayName,
      description: currentAgent.description,
      status: currentAgent.status,
      personality: currentAgent.personality,
      voice: currentAgent.voice,
    });

    hasUnsavedChanges = false;
    updateHeader();
    dispatchCustomAgentEvent('custom-agent:updated', { agentId: currentAgent.id });

    const { toast } = await import('./whisper.ui.js');
    toast.success(t('toasts.infoChangesSaved'));
    soundUI.play('success');
  } catch (err) {
    log.error('Failed to save changes:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't save changes");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = 'Save Changes';
    }
  }
}

async function deleteAgent(): Promise<void> {
  if (!currentAgent) return;

  const confirmed = await confirmDelete(currentAgent.displayName || currentAgent.name, {
    message: `You'll lose all memories and voice data. This cannot be undone.`,
  });

  if (!confirmed) return;

  try {
    const { deleteCustomAgent } = await import('../services/custom-agent.service.js');
    await deleteCustomAgent(currentAgent.id);

    dispatchCustomAgentEvent('custom-agent:deleted', { agentId: currentAgent.id });

    // Force close without unsaved changes warning
    hasUnsavedChanges = false;
    await closeAgentEditor();

    const { toast } = await import('./whisper.ui.js');
    toast.success(t('toasts.agentDeleted'));
  } catch (err) {
    log.error('Failed to delete agent:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't delete agent");
  }
}

// ============================================================================
// STYLES
// ============================================================================

function getEditorStyles(): string {
  return `
    .agent-editor-overlay {
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
    
    .agent-editor-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .editor-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .editor-container {
      position: relative;
      width: 90vw;
      max-width: clamp(448px, 90vw, 640px);
      max-height: 85vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .agent-editor-overlay.open .editor-container {
      transform: scale(1);
    }
    
    /* Header */
    .editor-header {
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .editor-header-content {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
    }
    
    .editor-avatar {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-lg, 12px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 600;
      color: white;
    }
    
    .editor-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .editor-subtitle {
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
    
    .editor-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
    }
    
    .editor-status {
      padding: 4px 10px;
      border-radius: var(--radius-full, 999px);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: capitalize;
    }
    
    .editor-status.status--draft {
      background: var(--color-bg-tertiary);
      color: var(--color-text-muted);
    }
    
    .editor-status.status--active {
      background: var(--persona-tint, rgba(74, 103, 65, 0.2));
      color: var(--color-ferni, #4a6741);
    }
    
    .editor-status.status--paused {
      background: rgba(var(--color-warning-rgb, 245, 158, 11), 0.2);
      color: var(--color-warning, #f59e0b);
    }
    
    .editor-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 4px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-close:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Tabs */
    .editor-tabs {
      display: flex;
      border-bottom: 1px solid var(--color-border-subtle);
      padding: 0 var(--space-lg, 24px);
    }
    
    .editor-tab {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-md, 16px) var(--space-sm, 8px);
      background: none;
      border: none;
      color: var(--color-text-muted);
      font-size: 0.9rem;
      cursor: pointer;
      position: relative;
      transition: color ${DURATION.FAST}ms;
    }
    
    .editor-tab:hover {
      color: var(--color-text-secondary);
    }
    
    .editor-tab.active {
      color: var(--color-text-primary);
    }
    
    .editor-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--color-accent, #4a6741);
      border-radius: 1px;
    }
    
    /* Content */
    .editor-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }
    
    .editor-tab-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-xl, 32px);
    }
    
    .editor-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .editor-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .editor-section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .editor-hint {
      font-size: 0.8rem;
      color: var(--color-text-dimmed);
      margin: 0;
    }
    
    /* Fields */
    .editor-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 4px);
    }
    
    .editor-field-label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-text-primary);
    }
    
    .editor-field-input,
    .editor-field-textarea {
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-size: 0.95rem;
      font-family: inherit;
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-field-input:focus,
    .editor-field-textarea:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }
    
    .editor-field-textarea {
      resize: vertical;
      min-height: 80px;
    }
    
    /* Status Toggle */
    .editor-status-toggle {
      display: flex;
      gap: var(--space-xs, 4px);
    }
    
    .status-option {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-muted);
      font-size: 0.9rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .status-option:hover {
      background: var(--color-bg-tertiary);
    }
    
    .status-option--active {
      border-color: var(--color-accent);
      color: var(--color-text-primary);
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .status-dot--draft { background: var(--color-text-muted); }
    .status-dot--active { background: var(--color-ferni, #4a6741); }
    .status-dot--paused { background: var(--color-warning, #f59e0b); }
    
    /* Sliders */
    .editor-slider-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 4px);
    }
    
    .editor-slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--color-text-primary);
    }
    
    .editor-slider-value {
      color: var(--color-accent);
      font-weight: 500;
    }
    
    .editor-slider {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: var(--color-bg-secondary);
      appearance: none;
      cursor: pointer;
    }
    
    .editor-slider::-webkit-slider-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--color-accent);
      border: none;
      appearance: none;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .editor-slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--color-text-dimmed);
    }
    
    /* Traits */
    .editor-traits {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 4px);
    }
    
    .editor-trait {
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-trait:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
    
    .editor-trait--selected {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: white;
    }
    
    /* Profiles */
    .editor-profiles {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-sm, 8px);
    }
    
    .editor-profile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-profile:hover {
      background: var(--color-bg-tertiary);
    }
    
    .editor-profile--selected {
      border-color: var(--color-accent);
    }
    
    .profile-icon {
      color: var(--color-text-muted);
    }
    
    .editor-profile--selected .profile-icon {
      color: var(--color-accent);
    }
    
    .profile-name {
      font-size: 0.85rem;
      color: var(--color-text-primary);
    }
    
    /* Voice */
    .editor-voice-current {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .voice-status {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      font-size: 0.85rem;
    }
    
    .voice-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .voice-status--ready .voice-status-dot { background: var(--color-ferni, #4a6741); }
    .voice-status--processing .voice-status-dot { background: var(--color-warning, #f59e0b); }
    .voice-status--failed .voice-status-dot { background: var(--color-error, #ef4444); }
    .voice-status--pending .voice-status-dot { background: var(--color-text-muted); }
    
    .voice-type {
      color: var(--color-text-muted);
      font-size: 0.85rem;
      margin: 0;
    }
    
    .editor-voice-grid {
      display: grid;
      gap: var(--space-sm, 8px);
    }
    
    .editor-voice-card {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border: 2px solid transparent;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      text-align: left;
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-voice-card:hover {
      background: var(--color-bg-tertiary);
    }
    
    .editor-voice-card--selected {
      border-color: var(--color-accent);
    }
    
    .voice-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }
    
    .voice-info {
      display: flex;
      flex-direction: column;
    }
    
    .voice-name {
      font-size: 0.95rem;
      color: var(--color-text-primary);
    }
    
    .voice-desc {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    /* Memories */
    .editor-add-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-accent);
      border: none;
      border-radius: var(--radius-md, 8px);
      color: white;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .editor-add-btn:hover {
      filter: brightness(1.1);
    }
    
    .editor-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-xl, 32px);
      color: var(--color-text-muted);
      text-align: center;
    }
    
    .editor-empty-hint {
      font-size: 0.85rem;
      color: var(--color-text-dimmed);
    }
    
    .editor-memories-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 8px);
    }
    
    .editor-memory-item {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .memory-type-badge {
      padding: 2px 8px;
      border-radius: var(--radius-sm, 4px);
      font-size: 0.65rem;
      font-weight: 500;
      text-transform: uppercase;
    }
    
    .memory-type-badge--stories { background: var(--persona-tint, rgba(74, 103, 65, 0.2)); color: var(--color-ferni, #4a6741); }
    .memory-type-badge--wisdom { background: var(--color-nayan-tint, rgba(138, 122, 106, 0.2)); color: var(--color-nayan, #8a7a6a); }
    .memory-type-badge--sharedMoments { background: var(--color-maya-tint, rgba(166, 122, 106, 0.2)); color: var(--color-maya, #a67a6a); }
    .memory-type-badge--journalEntries { background: var(--color-alex-tint, rgba(90, 107, 138, 0.2)); color: var(--color-alex, #5a6b8a); }
    
    .memory-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    
    .memory-title {
      font-size: 0.9rem;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .memory-date {
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }
    
    .memory-delete-btn {
      padding: var(--space-xs, 6px);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm, 4px);
      color: var(--color-text-dimmed);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .memory-delete-btn:hover {
      background: var(--color-error-tint, rgba(239, 68, 68, 0.1));
      color: var(--color-error, #ef4444);
    }
    
    /* Footer */
    .editor-footer {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .editor-footer-actions {
      display: flex;
      gap: var(--space-sm, 8px);
    }
    
    .editor-btn {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 12px) var(--space-md, 16px);
      border-radius: var(--radius-lg, 12px);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      border: none;
    }
    
    .editor-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    
    .editor-btn--secondary {
      background: transparent;
      color: var(--color-text-muted);
    }
    
    .editor-btn--secondary:hover {
      color: var(--color-text-primary);
    }
    
    .editor-btn--primary {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .editor-btn--primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    
    .editor-btn--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .editor-btn--danger {
      background: transparent;
      color: var(--color-text-muted);
    }
    
    .editor-btn--danger:hover {
      background: var(--color-error-tint, rgba(239, 68, 68, 0.1));
      color: var(--color-error, #ef4444);
    }
    
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Responsive */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .editor-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .editor-profiles {
        grid-template-columns: 1fr;
      }
    }
  `;
}

