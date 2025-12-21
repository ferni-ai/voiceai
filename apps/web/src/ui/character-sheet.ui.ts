/**
 * Character Sheet UI
 * 
 * Displays and manages the character profile for a Fictional agent
 * (a character you've created with unique personality and backstory).
 * 
 * @module character-sheet.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, updateCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('CharacterSheet');

let characterModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .character-sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .character-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .character-sheet-modal {
    position: relative;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    background: var(--color-background-elevated);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-2xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .character-sheet-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .character-sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    background: linear-gradient(135deg, var(--color-accent-light), transparent);
  }

  .character-sheet-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .character-sheet-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .character-sheet-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .character-close-btn {
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

  .character-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .character-sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .character-section {
    margin-bottom: var(--space-6);
  }

  .character-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .character-section-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .character-section-title svg {
    color: var(--color-accent);
  }

  .character-edit-btn {
    font-size: 0.8rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--color-accent);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    transition: all ${DURATION.FAST}ms ease;
  }

  .character-edit-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .character-empty-state {
    text-align: center;
    padding: var(--space-6);
    background: var(--color-background-subtle);
    border-radius: var(--radius-xl);
    border: 2px dashed var(--color-border);
  }

  .character-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3);
    color: var(--color-text-muted);
  }

  .character-empty-title {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .character-empty-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .character-backstory-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    line-height: 1.7;
    color: var(--color-text-primary);
    font-size: 0.95rem;
  }

  .character-traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-3);
  }

  .character-trait-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    text-align: center;
  }

  .character-trait-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .character-trait-value {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .character-quirks-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .character-quirk-tag {
    background: linear-gradient(135deg, var(--color-accent-light), var(--color-background-subtle));
    border-radius: var(--radius-full);
    padding: var(--space-2) var(--space-3);
    font-size: 0.85rem;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .character-relationships-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .character-relationship-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .character-relationship-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
  }

  .character-relationship-info {
    flex: 1;
  }

  .character-relationship-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .character-relationship-type {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .character-catchphrase-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
    border-left: 4px solid var(--color-accent);
  }

  .character-catchphrase-text {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-style: italic;
    color: var(--color-text-primary);
    margin: 0;
  }

  .character-item-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .character-item-btn {
    font-size: 0.7rem;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    transition: all ${DURATION.FAST}ms ease;
  }

  .character-item-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .character-item-btn--delete:hover {
    background: color-mix(in srgb, var(--color-semantic-error, #ef4444) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-semantic-error, #ef4444) 30%, transparent);
    color: var(--color-semantic-error, #ef4444);
  }

  .character-quirk-tag {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .character-quirk-delete {
    opacity: 0;
    margin-left: var(--space-1);
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .character-quirk-tag:hover .character-quirk-delete {
    opacity: 1;
  }

  .character-quirk-delete:hover {
    color: var(--color-semantic-error, #ef4444);
  }

  /* Mobile Responsiveness */
  @media (max-width: 640px) {
    .character-sheet-overlay {
      padding: 0;
    }

    .character-sheet-modal {
      max-width: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .character-sheet-header {
      padding: var(--space-3) var(--space-4);
    }

    .character-sheet-content {
      padding: var(--space-4);
    }

    .character-section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .character-add-btn {
      width: 100%;
      justify-content: center;
    }

    .character-quirks-grid {
      gap: var(--space-2);
    }

    .character-catchphrases-list {
      gap: var(--space-2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .character-sheet-modal {
      transition: none;
    }
  }
`;

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const personality = currentAgent.personality || {};
  const behaviors = currentAgent.behaviors || {};
  const backstory = (personality.worldview as string) || '';
  const quirks = (behaviors.quirks as string[]) || [];
  const catchphrases = (behaviors.catchphrases as string[]) || [];
  const relationships = (currentAgent.memories?.relationships || []) as Array<{ personName: string; relationship: string }>;

  const traits = [
    { label: 'Warmth', value: getTraitLabel(personality.warmth as number) },
    { label: 'Humor', value: getTraitLabel(personality.humorLevel as number) },
    { label: 'Energy', value: getTraitLabel(personality.energyLevel as number) },
    { label: 'Mystery', value: getTraitLabel(personality.mysteryLevel as number) },
  ].filter(t => t.value);

  return `
    <div class="character-sheet-overlay">
      <div class="character-sheet-backdrop"></div>
      <div class="character-sheet-modal" role="dialog" aria-labelledby="character-title">
        <header class="character-sheet-header">
          <div class="character-sheet-title">
            <span class="character-sheet-eyebrow">Character Profile</span>
            <h2 class="character-sheet-name" id="character-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="character-close-btn" aria-label="Close character sheet">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="character-sheet-content">
          <!-- Backstory -->
          <section class="character-section">
            <div class="character-section-header">
              <h3 class="character-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
                  <line x1="16" x2="2" y1="8" y2="22"/>
                </svg>
                Backstory
              </h3>
              <button class="character-edit-btn" data-action="edit-backstory">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
            </div>
            ${backstory ? `
              <div class="character-backstory-card">${backstory}</div>
            ` : `
              <div class="character-empty-state">
                <div class="character-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
                    <line x1="16" x2="2" y1="8" y2="22"/>
                  </svg>
                </div>
                <h4 class="character-empty-title">No backstory yet</h4>
                <p class="character-empty-text">Every great character has a story. What's theirs?</p>
              </div>
            `}
          </section>

          <!-- Personality Traits -->
          ${traits.length > 0 ? `
          <section class="character-section">
            <div class="character-section-header">
              <h3 class="character-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
                Personality
              </h3>
            </div>
            <div class="character-traits-grid">
              ${traits.map(t => `
                <div class="character-trait-card">
                  <div class="character-trait-label">${t.label}</div>
                  <div class="character-trait-value">${t.value}</div>
                </div>
              `).join('')}
            </div>
          </section>
          ` : ''}

          <!-- Quirks -->
          <section class="character-section">
            <div class="character-section-header">
              <h3 class="character-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
                  <path d="M8.5 8.5v.01"/>
                  <path d="M16 15.5v.01"/>
                  <path d="M12 12v.01"/>
                  <path d="M11 17v.01"/>
                  <path d="M7 14v.01"/>
                </svg>
                Quirks & Habits
              </h3>
              <button class="character-edit-btn" data-action="add-quirk">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add
              </button>
            </div>
            ${quirks.length === 0 ? `
              <div class="character-empty-state">
                <div class="character-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
                  </svg>
                </div>
                <h4 class="character-empty-title">No quirks defined</h4>
                <p class="character-empty-text">What makes this character unique? Add their habits and quirks.</p>
              </div>
            ` : `
              <div class="character-quirks-list">
                ${quirks.map((q, i) => `
                  <span class="character-quirk-tag" data-index="${i}">
                    ${q}
                    <button class="character-quirk-delete" data-action="delete-quirk" data-index="${i}" aria-label="Delete quirk">×</button>
                  </span>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Catchphrases -->
          <section class="character-section">
            <div class="character-section-header">
              <h3 class="character-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Catchphrases
              </h3>
              <button class="character-edit-btn" data-action="add-catchphrase">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add
              </button>
            </div>
            ${catchphrases.length === 0 ? `
              <div class="character-empty-state">
                <div class="character-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <h4 class="character-empty-title">No catchphrases yet</h4>
                <p class="character-empty-text">What does this character always say?</p>
              </div>
            ` : catchphrases.map((c, i) => `
              <div class="character-catchphrase-card" data-index="${i}">
                <p class="character-catchphrase-text">"${c}"</p>
                <div class="character-item-actions">
                  <button class="character-item-btn" data-action="edit-catchphrase" data-index="${i}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button class="character-item-btn character-item-btn--delete" data-action="delete-catchphrase" data-index="${i}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            `).join('')}
          </section>

          <!-- Relationships -->
          <section class="character-section">
            <div class="character-section-header">
              <h3 class="character-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Relationships
              </h3>
              <button class="character-edit-btn" data-action="add-relationship">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add
              </button>
            </div>
            ${relationships.length === 0 ? `
              <div class="character-empty-state">
                <div class="character-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                  </svg>
                </div>
                <h4 class="character-empty-title">No relationships defined</h4>
                <p class="character-empty-text">Who are the important people in this character's life?</p>
              </div>
            ` : `
              <div class="character-relationships-list">
                ${relationships.map((r, i) => `
                  <div class="character-relationship-card" data-index="${i}">
                    <div class="character-relationship-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="8" r="5"/>
                        <path d="M20 21a8 8 0 0 0-16 0"/>
                      </svg>
                    </div>
                    <div class="character-relationship-info">
                      <p class="character-relationship-name">${r.personName}</p>
                      <p class="character-relationship-type">${r.relationship}</p>
                      <div class="character-item-actions">
                        <button class="character-item-btn character-item-btn--delete" data-action="delete-relationship" data-index="${i}">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </section>
        </div>
      </div>
    </div>
  `;
}

function getTraitLabel(value: number | undefined): string {
  if (value === undefined) return '';
  if (value < 0.2) return 'Very Low';
  if (value < 0.4) return 'Low';
  if (value < 0.6) return 'Moderate';
  if (value < 0.8) return 'High';
  return 'Very High';
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openCharacterSheet(agentId: string): Promise<void> {
  log.debug('Opening Character Sheet for agent:', agentId);

  // Clean up any existing modal
  closeCharacterSheet();

  // Load agent data
  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this character");
    return;
  }

  // Add styles
  if (!document.querySelector('#character-sheet-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'character-sheet-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  characterModal = document.createElement('div');
  characterModal.innerHTML = render();
  document.body.appendChild(characterModal);

  // Animate in
  requestAnimationFrame(() => {
    const modal = characterModal?.querySelector('.character-sheet-modal');
    modal?.classList.add('visible');
  });

  // Attach listeners
  attachListeners();

  soundUI.play('open');
}

export function closeCharacterSheet(): void {
  if (!characterModal) return;

  const modal = characterModal.querySelector('.character-sheet-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    characterModal?.remove();
    characterModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!characterModal) return;

  characterModal.querySelector('.character-close-btn')?.addEventListener('click', closeCharacterSheet);
  characterModal.querySelector('.character-sheet-backdrop')?.addEventListener('click', closeCharacterSheet);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCharacterSheet();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  characterModal.querySelector('[data-action="edit-backstory"]')?.addEventListener('click', handleEditBackstory);
  characterModal.querySelector('[data-action="add-quirk"]')?.addEventListener('click', handleAddQuirk);
  characterModal.querySelector('[data-action="add-catchphrase"]')?.addEventListener('click', handleAddCatchphrase);
  characterModal.querySelector('[data-action="add-relationship"]')?.addEventListener('click', handleAddRelationship);

  // Delete quirks
  characterModal.querySelectorAll('[data-action="delete-quirk"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteQuirk(index);
    });
  });

  // Edit/Delete catchphrases
  characterModal.querySelectorAll('[data-action="edit-catchphrase"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleEditCatchphrase(index);
    });
  });

  characterModal.querySelectorAll('[data-action="delete-catchphrase"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteCatchphrase(index);
    });
  });

  // Delete relationships
  characterModal.querySelectorAll('[data-action="delete-relationship"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteRelationship(index);
    });
  });
}

async function handleEditBackstory(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const backstory = prompt("Enter the character's backstory:", (currentAgent?.personality?.worldview as string) || '');
  if (backstory === null || !currentAgent) return;

  try {
    const updates = {
      personality: {
        ...currentAgent.personality,
        worldview: backstory
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Backstory updated!');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to update backstory:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddQuirk(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const quirk = prompt("Add a quirk or habit:");
  if (!quirk || !currentAgent) return;

  try {
    const currentQuirks = (currentAgent.behaviors?.quirks as string[]) || [];
    const updates = {
      behaviors: {
        ...currentAgent.behaviors,
        quirks: [...currentQuirks, quirk]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Quirk added!');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to add quirk:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddCatchphrase(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const catchphrase = prompt("Add a catchphrase:");
  if (!catchphrase || !currentAgent) return;

  try {
    const current = (currentAgent.behaviors?.catchphrases as string[]) || [];
    const updates = {
      behaviors: {
        ...currentAgent.behaviors,
        catchphrases: [...current, catchphrase]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Catchphrase added!');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to add catchphrase:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddRelationship(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const personName = prompt("Who is this character connected to?");
  if (!personName || !currentAgent) return;

  const relationship = prompt("What is their relationship?") || 'Acquaintance';

  try {
    const current = (currentAgent.memories?.relationships || []) as Array<{ personName: string; relationship: string }>;
    const updates = {
      memories: {
        ...currentAgent.memories,
        relationships: [...current, { personName, relationship }]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Relationship added!');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to add relationship:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleDeleteQuirk(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  try {
    const quirks = (currentAgent.behaviors?.quirks as string[]) || [];
    const updatedQuirks = quirks.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      behaviors: { ...currentAgent.behaviors, quirks: updatedQuirks }
    });
    toast.success('Removed');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete quirk:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

async function handleEditCatchphrase(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  const catchphrases = (currentAgent.behaviors?.catchphrases as string[]) || [];
  const item = catchphrases[index];
  if (!item) return;

  const newCatchphrase = prompt("Edit this catchphrase:", item);
  if (!newCatchphrase) return;

  try {
    const updatedCatchphrases = [...catchphrases];
    updatedCatchphrases[index] = newCatchphrase;

    await updateCustomAgent(currentAgent.id, {
      behaviors: { ...currentAgent.behaviors, catchphrases: updatedCatchphrases }
    });
    toast.success('Updated!');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit catchphrase:', err);
    toast.error("Couldn't update. Try again?");
  }
}

async function handleDeleteCatchphrase(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Delete this catchphrase?')) return;

  try {
    const catchphrases = (currentAgent.behaviors?.catchphrases as string[]) || [];
    const updatedCatchphrases = catchphrases.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      behaviors: { ...currentAgent.behaviors, catchphrases: updatedCatchphrases }
    });
    toast.success('Deleted');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete catchphrase:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

async function handleDeleteRelationship(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Remove this relationship?')) return;

  try {
    const relationships = (currentAgent.memories?.relationships || []) as Array<{ personName: string; relationship: string }>;
    const updatedRelationships = relationships.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, relationships: updatedRelationships }
    });
    toast.success('Removed');
    await openCharacterSheet(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete relationship:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

