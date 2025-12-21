/**
 * Legacy Stories UI
 * 
 * Captures and displays stories, wisdom, and memories from a Legacy agent
 * (someone cherished whose voice and wisdom you want to preserve).
 * 
 * @module legacy-stories.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, updateCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('LegacyStories');

let storiesModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .legacy-stories-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .legacy-stories-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .legacy-stories-modal {
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

  .legacy-stories-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .legacy-stories-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .legacy-stories-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .legacy-stories-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .legacy-stories-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .legacy-close-btn {
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

  .legacy-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .legacy-stories-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .legacy-section {
    margin-bottom: var(--space-6);
  }

  .legacy-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .legacy-section-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .legacy-section-title svg {
    color: var(--color-accent);
  }

  .legacy-add-btn {
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

  .legacy-add-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .legacy-empty-state {
    text-align: center;
    padding: var(--space-6);
    background: var(--color-background-subtle);
    border-radius: var(--radius-xl);
    border: 2px dashed var(--color-border);
  }

  .legacy-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3);
    color: var(--color-text-muted);
  }

  .legacy-empty-title {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .legacy-empty-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .legacy-story-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
  }

  .legacy-story-content {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .legacy-story-meta {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .legacy-wisdom-card {
    background: linear-gradient(135deg, var(--color-accent-light), var(--color-background-subtle));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
    border-left: 4px solid var(--color-accent);
  }

  .legacy-wisdom-quote {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-style: italic;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .legacy-wisdom-context {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
`;

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const stories = (currentAgent.memories?.stories || []) as Array<{ content: string; date?: string }>;
  const wisdom = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; context?: string }>;

  return `
    <div class="legacy-stories-overlay">
      <div class="legacy-stories-backdrop"></div>
      <div class="legacy-stories-modal" role="dialog" aria-labelledby="legacy-title">
        <header class="legacy-stories-header">
          <div class="legacy-stories-title">
            <span class="legacy-stories-eyebrow">Preserving Their Memory</span>
            <h2 class="legacy-stories-name" id="legacy-title">${currentAgent.displayName || currentAgent.name}'s Stories</h2>
          </div>
          <button class="legacy-close-btn" aria-label="Close stories">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="legacy-stories-content">
          <!-- Wisdom Section -->
          <section class="legacy-section">
            <div class="legacy-section-header">
              <h3 class="legacy-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                </svg>
                Their Wisdom
              </h3>
              <button class="legacy-add-btn" data-action="add-wisdom">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Saying
              </button>
            </div>
            ${wisdom.length === 0 ? `
              <div class="legacy-empty-state">
                <div class="legacy-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                </div>
                <h4 class="legacy-empty-title">No sayings yet</h4>
                <p class="legacy-empty-text">Capture their favorite phrases, advice, and words of wisdom.</p>
              </div>
            ` : wisdom.map(w => `
              <div class="legacy-wisdom-card">
                <p class="legacy-wisdom-quote">"${w.quote}"</p>
                ${w.context ? `<span class="legacy-wisdom-context">${w.context}</span>` : ''}
              </div>
            `).join('')}
          </section>

          <!-- Stories Section -->
          <section class="legacy-section">
            <div class="legacy-section-header">
              <h3 class="legacy-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                Their Stories
              </h3>
              <button class="legacy-add-btn" data-action="add-story">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Story
              </button>
            </div>
            ${stories.length === 0 ? `
              <div class="legacy-empty-state">
                <div class="legacy-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </div>
                <h4 class="legacy-empty-title">No stories yet</h4>
                <p class="legacy-empty-text">Record the stories they loved to tell - the ones that made everyone laugh or cry.</p>
              </div>
            ` : stories.map(s => `
              <div class="legacy-story-card">
                <p class="legacy-story-content">${s.content}</p>
                ${s.date ? `<span class="legacy-story-meta">${new Date(s.date).toLocaleDateString()}</span>` : ''}
              </div>
            `).join('')}
          </section>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openLegacyStories(agentId: string): Promise<void> {
  log.debug('Opening Legacy Stories for agent:', agentId);

  // Clean up any existing modal
  closeLegacyStories();

  // Load agent data
  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this agent");
    return;
  }

  // Add styles
  if (!document.querySelector('#legacy-stories-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'legacy-stories-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  storiesModal = document.createElement('div');
  storiesModal.innerHTML = render();
  document.body.appendChild(storiesModal);

  // Animate in
  requestAnimationFrame(() => {
    const modal = storiesModal?.querySelector('.legacy-stories-modal');
    modal?.classList.add('visible');
  });

  // Attach listeners
  attachListeners();

  soundUI.play('open');
}

export function closeLegacyStories(): void {
  if (!storiesModal) return;

  const modal = storiesModal.querySelector('.legacy-stories-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    storiesModal?.remove();
    storiesModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!storiesModal) return;

  // Close button
  storiesModal.querySelector('.legacy-close-btn')?.addEventListener('click', closeLegacyStories);

  // Backdrop click
  storiesModal.querySelector('.legacy-stories-backdrop')?.addEventListener('click', closeLegacyStories);

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeLegacyStories();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Add wisdom button
  storiesModal.querySelector('[data-action="add-wisdom"]')?.addEventListener('click', handleAddWisdom);

  // Add story button
  storiesModal.querySelector('[data-action="add-story"]')?.addEventListener('click', handleAddStory);
}

async function handleAddWisdom(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  // For now, use a simple prompt - later can be upgraded to a proper modal
  const quote = prompt("What did they always say?");
  if (!quote || !currentAgent) return;

  const context = prompt("When would they say this? (optional)") || undefined;

  try {
    const currentWisdom = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; context?: string }>;
    const updates = {
      memories: {
        ...currentAgent.memories,
        wisdom: [...currentWisdom, { quote, context }]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Wisdom captured!');
    
    // Refresh
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to add wisdom:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddStory(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const content = prompt("Tell us a story about them...");
  if (!content || !currentAgent) return;

  try {
    const currentStories = (currentAgent.memories?.stories || []) as Array<{ content: string; date?: string }>;
    const updates = {
      memories: {
        ...currentAgent.memories,
        stories: [...currentStories, { content, date: new Date().toISOString() }]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Story saved!');
    
    // Refresh
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to add story:', err);
    toast.error("Couldn't save. Try again?");
  }
}

