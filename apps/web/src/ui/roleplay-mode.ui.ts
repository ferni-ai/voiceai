/**
 * Roleplay Mode UI
 * 
 * Interactive scenario/roleplay mode for Fictional agents.
 * Set up scenarios and interact with characters in immersive contexts.
 * 
 * @module roleplay-mode.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('RoleplayMode');

let roleplayModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let selectedScenario: ScenarioTemplate | null = null;
let customScenario = '';

// ============================================================================
// TYPES
// ============================================================================

interface ScenarioTemplate {
  id: string;
  name: string;
  icon: string;
  setting: string;
  opening: string;
  mood: 'dramatic' | 'playful' | 'mysterious' | 'romantic' | 'action';
}

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .roleplay-mode-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .roleplay-mode-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.7);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .roleplay-mode-modal {
    position: relative;
    width: 100%;
    max-width: clamp(385px, 90vw, 550px);
    max-height: 85vh;
    background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      
    border-radius: var(--radius-xl, 20px);
    box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .roleplay-mode-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .roleplay-mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    background: linear-gradient(135deg, rgba(147, 51, 234, 0.1), transparent);
  }

  .roleplay-mode-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .roleplay-mode-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .roleplay-mode-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .roleplay-close-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .roleplay-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .roleplay-mode-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .roleplay-intro {
    text-align: center;
    margin-bottom: var(--space-5);
  }

  .roleplay-intro-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-3);
    color: var(--color-accent);
  }

  .roleplay-intro-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .roleplay-intro-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .roleplay-section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .roleplay-scenarios-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .roleplay-scenario-card {
    background: var(--color-background-subtle);
    border: 2px solid transparent;
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
    text-align: center;
  }

  .roleplay-scenario-card:hover {
    background: var(--color-background-hover);
    transform: translateY(-2px);
  }

  .roleplay-scenario-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
  }

  .roleplay-scenario-icon {
    font-size: 2rem;
    margin-bottom: var(--space-2);
  }

  .roleplay-scenario-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .roleplay-scenario-setting {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .roleplay-custom-section {
    margin-bottom: var(--space-5);
  }

  .roleplay-custom-textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background-subtle);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    resize: vertical;
    min-height: 100px;
    transition: all ${DURATION.FAST}ms ease;
  }

  .roleplay-custom-textarea:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-light);
  }

  .roleplay-custom-textarea::placeholder {
    color: var(--color-text-muted);
  }

  .roleplay-preview {
    background: linear-gradient(135deg, var(--color-background-subtle), var(--color-accent-light));
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    margin-bottom: var(--space-4);
    border-left: 4px solid var(--color-accent);
  }

  .roleplay-preview-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
  }

  .roleplay-preview-setting {
    font-family: var(--font-display);
    font-size: 1rem;
    font-style: italic;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-3);
  }

  .roleplay-preview-opening {
    font-size: 0.95rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
    padding-left: var(--space-3);
    border-left: 2px solid var(--color-border);
  }

  .roleplay-character-note {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .roleplay-character-avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    font-weight: 600;
  }

  .roleplay-character-info {
    flex: 1;
  }

  .roleplay-character-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    font-size: 0.9rem;
  }

  .roleplay-character-desc {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .roleplay-actions {
    display: flex;
    gap: var(--space-3);
  }

  .roleplay-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    font-weight: 500;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .roleplay-btn--secondary {
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .roleplay-btn--secondary:hover {
    background: var(--color-background-hover);
  }

  .roleplay-btn--primary {
    background: var(--color-accent);
    border: none;
    color: white;
  }

  .roleplay-btn--primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .roleplay-btn--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

// ============================================================================
// DATA
// ============================================================================

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'adventure',
    name: 'Adventure Quest',
    icon: '🗺️',
    setting: 'A mysterious forest at twilight',
    opening: 'You find me standing at the edge of an ancient forest, studying an old map. The trees seem to whisper secrets as the last light fades.',
    mood: 'mysterious'
  },
  {
    id: 'detective',
    name: 'Mystery Solver',
    icon: '🔍',
    setting: 'A foggy evening in the city',
    opening: 'I glance up from my notes as you enter the dimly lit office. Another case has come in, and something tells me you might be the key to solving it.',
    mood: 'dramatic'
  },
  {
    id: 'tavern',
    name: 'Chance Meeting',
    icon: '🍺',
    setting: 'A cozy tavern on a rainy night',
    opening: 'The fire crackles warmly as I notice you taking shelter from the storm. I gesture to the empty seat across from me. "Rough night to be traveling..."',
    mood: 'playful'
  },
  {
    id: 'mentor',
    name: 'Sage\'s Study',
    icon: '📚',
    setting: 'An ancient library filled with secrets',
    opening: 'I look up from the tome I\'ve been studying, candlelight dancing in my eyes. "Ah, you\'ve finally arrived. I\'ve been expecting someone with... questions."',
    mood: 'mysterious'
  },
  {
    id: 'battle',
    name: 'Battlefield',
    icon: '⚔️',
    setting: 'The calm before a great challenge',
    opening: 'We stand on the hill overlooking what lies ahead. I turn to you with a serious expression. "Whatever happens next, remember why we\'re doing this."',
    mood: 'action'
  },
  {
    id: 'custom',
    name: 'Custom Scene',
    icon: '✨',
    setting: 'Your imagination',
    opening: 'Describe the scene and I\'ll bring it to life...',
    mood: 'playful'
  }
];

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const initials = (currentAgent.displayName || currentAgent.name)
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return `
    <div class="roleplay-mode-overlay">
      <div class="roleplay-mode-backdrop"></div>
      <div class="roleplay-mode-modal" role="dialog" aria-labelledby="roleplay-title">
        <header class="roleplay-mode-header">
          <div class="roleplay-mode-title">
            <span class="roleplay-mode-eyebrow">Roleplay with</span>
            <h2 class="roleplay-mode-name" id="roleplay-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="roleplay-close-btn" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="roleplay-mode-content">
          <div class="roleplay-intro">
            <div class="roleplay-intro-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </div>
            <h3 class="roleplay-intro-title">Set the Scene</h3>
            <p class="roleplay-intro-text">
              Choose a scenario or create your own. ${currentAgent.displayName || currentAgent.name} will stay in character throughout.
            </p>
          </div>

          <div class="roleplay-character-note">
            <div class="roleplay-character-avatar">${initials}</div>
            <div class="roleplay-character-info">
              <p class="roleplay-character-name">${currentAgent.displayName || currentAgent.name}</p>
              <span class="roleplay-character-desc">${currentAgent.description || 'Ready to play any role'}</span>
            </div>
          </div>

          <h4 class="roleplay-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
            Choose a Scenario
          </h4>
          
          <div class="roleplay-scenarios-grid">
            ${SCENARIO_TEMPLATES.map(scenario => `
              <button aria-label="Play" class="roleplay-scenario-card ${selectedScenario?.id === scenario.id ? 'selected' : ''}" data-scenario="${scenario.id}">
                <div class="roleplay-scenario-icon">${scenario.icon}</div>
                <p class="roleplay-scenario-name">${scenario.name}</p>
                <p class="roleplay-scenario-setting">${scenario.setting}</p>
              </button>
            `).join('')}
          </div>

          ${selectedScenario?.id === 'custom' ? `
            <div class="roleplay-custom-section">
              <textarea 
                class="roleplay-custom-textarea" 
                id="custom-scenario"
                placeholder="Describe the scene... Where are you? What's happening? What's the mood?"
              >${customScenario}</textarea>
            </div>
          ` : ''}

          ${selectedScenario && selectedScenario.id !== 'custom' ? `
            <div class="roleplay-preview">
              <div class="roleplay-preview-label">Scene Preview</div>
              <p class="roleplay-preview-setting">${selectedScenario.setting}</p>
              <p class="roleplay-preview-opening">"${selectedScenario.opening}"</p>
            </div>
          ` : ''}

          <div class="roleplay-actions" role="button" tabindex="0">
            <button aria-label="Cancel" class="roleplay-btn roleplay-btn--secondary" data-action="cancel">
              Cancel
            </button>
            <button aria-label="Begin Scene" 
              class="roleplay-btn roleplay-btn--primary" 
              data-action="start-roleplay"
              ${!selectedScenario || (selectedScenario.id === 'custom' && !customScenario) ? 'disabled' : ''}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Begin Scene
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openRoleplayMode(agentId: string): Promise<void> {
  log.debug('Opening Roleplay Mode for agent:', agentId);

  closeRoleplayMode();

  // Reset state
  selectedScenario = null;
  customScenario = '';

  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this character");
    return;
  }

  if (!document.querySelector('#roleplay-mode-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'roleplay-mode-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  roleplayModal = document.createElement('div');
  roleplayModal.innerHTML = render();
  document.body.appendChild(roleplayModal);

  requestAnimationFrame(() => {
    const modal = roleplayModal?.querySelector('.roleplay-mode-modal');
    modal?.classList.add('visible');
  });

  attachListeners();
  soundUI.play('open');
}

export function closeRoleplayMode(): void {
  if (!roleplayModal) return;

  const modal = roleplayModal.querySelector('.roleplay-mode-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    roleplayModal?.remove();
    roleplayModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!roleplayModal) return;

  roleplayModal.querySelector('.roleplay-close-btn')?.addEventListener('click', closeRoleplayMode);
  roleplayModal.querySelector('.roleplay-mode-backdrop')?.addEventListener('click', closeRoleplayMode);
  roleplayModal.querySelector('[data-action="cancel"]')?.addEventListener('click', closeRoleplayMode);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeRoleplayMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Scenario selection
  roleplayModal.querySelectorAll('.roleplay-scenario-card').forEach(card => {
    card.addEventListener('click', handleScenarioSelect);
  });

  roleplayModal.querySelector('[data-action="start-roleplay"]')?.addEventListener('click', () => { void handleStartRoleplay(); });
}

function handleScenarioSelect(e: Event): void {
  const card = e.currentTarget as HTMLElement;
  const scenarioId = card.dataset.scenario;
  
  selectedScenario = SCENARIO_TEMPLATES.find(s => s.id === scenarioId) || null;
  
  // Re-render to show preview/custom input
  if (roleplayModal) {
    const content = roleplayModal.querySelector('.roleplay-mode-content');
    if (content) {
      content.innerHTML = renderContent();
      attachContentListeners();
    }
  }
}

function renderContent(): string {
  if (!currentAgent) return '';

  const initials = (currentAgent.displayName || currentAgent.name)
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return `
    <div class="roleplay-intro">
      <div class="roleplay-intro-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </div>
      <h3 class="roleplay-intro-title">Set the Scene</h3>
      <p class="roleplay-intro-text">
        Choose a scenario or create your own. ${currentAgent.displayName || currentAgent.name} will stay in character throughout.
      </p>
    </div>

    <div class="roleplay-character-note">
      <div class="roleplay-character-avatar">${initials}</div>
      <div class="roleplay-character-info">
        <p class="roleplay-character-name">${currentAgent.displayName || currentAgent.name}</p>
        <span class="roleplay-character-desc">${currentAgent.description || 'Ready to play any role'}</span>
      </div>
    </div>

    <h4 class="roleplay-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
      Choose a Scenario
    </h4>
    
    <div class="roleplay-scenarios-grid">
      ${SCENARIO_TEMPLATES.map(scenario => `
        <button aria-label="Play" class="roleplay-scenario-card ${selectedScenario?.id === scenario.id ? 'selected' : ''}" data-scenario="${scenario.id}">
          <div class="roleplay-scenario-icon">${scenario.icon}</div>
          <p class="roleplay-scenario-name">${scenario.name}</p>
          <p class="roleplay-scenario-setting">${scenario.setting}</p>
        </button>
      `).join('')}
    </div>

    ${selectedScenario?.id === 'custom' ? `
      <div class="roleplay-custom-section">
        <textarea 
          class="roleplay-custom-textarea" 
          id="custom-scenario"
          placeholder="Describe the scene... Where are you? What's happening? What's the mood?"
        >${customScenario}</textarea>
      </div>
    ` : ''}

    ${selectedScenario && selectedScenario.id !== 'custom' ? `
      <div class="roleplay-preview">
        <div class="roleplay-preview-label">Scene Preview</div>
        <p class="roleplay-preview-setting">${selectedScenario.setting}</p>
        <p class="roleplay-preview-opening">"${selectedScenario.opening}"</p>
      </div>
    ` : ''}

    <div class="roleplay-actions" role="button" tabindex="0">
      <button aria-label="Cancel" class="roleplay-btn roleplay-btn--secondary" data-action="cancel">
        Cancel
      </button>
      <button aria-label="Begin Scene" 
        class="roleplay-btn roleplay-btn--primary" 
        data-action="start-roleplay"
        ${!selectedScenario || (selectedScenario.id === 'custom' && !customScenario) ? 'disabled' : ''}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Begin Scene
      </button>
    </div>
  `;
}

function attachContentListeners(): void {
  if (!roleplayModal) return;

  roleplayModal.querySelectorAll('.roleplay-scenario-card').forEach(card => {
    card.addEventListener('click', handleScenarioSelect);
  });

  roleplayModal.querySelector('[data-action="cancel"]')?.addEventListener('click', closeRoleplayMode);
  roleplayModal.querySelector('[data-action="start-roleplay"]')?.addEventListener('click', handleStartRoleplay);

  const customInput = roleplayModal.querySelector('#custom-scenario') as HTMLTextAreaElement;
  if (customInput) {
    customInput.addEventListener('input', () => {
      customScenario = customInput.value;
      const startBtn = roleplayModal?.querySelector('[data-action="start-roleplay"]') as HTMLButtonElement;
      if (startBtn) {
        startBtn.disabled = !customScenario.trim();
      }
    });
  }
}

async function handleStartRoleplay(): Promise<void> {
  if (!currentAgent || !selectedScenario) return;

  closeRoleplayMode();

  // Build roleplay-specific opening
  const roleplayPrompt = buildRoleplayPrompt();

  // Open talk interface with roleplay context
  const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
  await openTalkToTwin(currentAgent.id, roleplayPrompt);
}

function buildRoleplayPrompt(): string {
  if (!selectedScenario) return '';

  let prompt = `[ROLEPLAY MODE]\n`;
  
  if (selectedScenario.id === 'custom') {
    prompt += `Setting: ${customScenario}\n\n`;
    prompt += `Please set the scene and begin the roleplay. Stay fully in character as ${currentAgent?.displayName || currentAgent?.name}.`;
  } else {
    prompt += `Scenario: ${selectedScenario.name}\n`;
    prompt += `Setting: ${selectedScenario.setting}\n`;
    prompt += `Mood: ${selectedScenario.mood}\n\n`;
    prompt += `Begin the scene with: "${selectedScenario.opening}"\n`;
    prompt += `Stay fully in character throughout our interaction.`;
  }
  
  return prompt;
}

