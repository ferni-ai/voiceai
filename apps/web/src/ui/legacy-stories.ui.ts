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
    background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
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

  .legacy-card-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .legacy-action-btn {
    font-size: 0.75rem;
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

  .legacy-action-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .legacy-action-btn--delete:hover {
    background: color-mix(in srgb, var(--color-semantic-error, #ef4444) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-semantic-error, #ef4444) 30%, transparent);
    color: var(--color-semantic-error, #ef4444);
  }

  .legacy-edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .legacy-edit-input,
  .legacy-edit-textarea {
    width: 100%;
    padding: var(--space-3);
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-family: inherit;
    font-size: 0.9rem;
    resize: vertical;
  }

  .legacy-edit-input:focus,
  .legacy-edit-textarea:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .legacy-edit-textarea {
    min-height: 80px;
  }

  .legacy-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .legacy-edit-btn {
    font-size: 0.8rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .legacy-edit-btn--cancel {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .legacy-edit-btn--save {
    background: var(--color-accent);
    border: none;
    color: white;
  }

  .legacy-edit-btn--save:hover {
    filter: brightness(1.1);
  }

  /* Mobile Responsiveness */
  @media (max-width: 640px) {
    .legacy-stories-overlay {
      padding: 0;
    }

    .legacy-stories-modal {
      max-width: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .legacy-stories-header {
      padding: var(--space-3) var(--space-4);
    }

    .legacy-stories-content {
      padding: var(--space-4);
    }

    .legacy-section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .legacy-add-btn {
      width: 100%;
      justify-content: center;
    }

    .legacy-card-actions {
      flex-wrap: wrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .legacy-stories-modal {
      transition: none;
    }
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
            ` : wisdom.map((w, i) => `
              <div class="legacy-wisdom-card" data-index="${i}">
                <p class="legacy-wisdom-quote">"${w.quote}"</p>
                ${w.context ? `<span class="legacy-wisdom-context">${w.context}</span>` : ''}
                <div class="legacy-card-actions">
                  <button class="legacy-action-btn" data-action="edit-wisdom" data-index="${i}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button class="legacy-action-btn legacy-action-btn--delete" data-action="delete-wisdom" data-index="${i}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
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
            ` : stories.map((s, i) => `
              <div class="legacy-story-card" data-index="${i}">
                <p class="legacy-story-content">${s.content}</p>
                ${s.date ? `<span class="legacy-story-meta">${new Date(s.date).toLocaleDateString()}</span>` : ''}
                <div class="legacy-card-actions">
                  <button class="legacy-action-btn" data-action="edit-story" data-index="${i}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button class="legacy-action-btn legacy-action-btn--delete" data-action="delete-story" data-index="${i}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
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

  // Edit/Delete wisdom buttons
  storiesModal.querySelectorAll('[data-action="edit-wisdom"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleEditWisdom(index);
    });
  });

  storiesModal.querySelectorAll('[data-action="delete-wisdom"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteWisdom(index);
    });
  });

  // Edit/Delete story buttons
  storiesModal.querySelectorAll('[data-action="edit-story"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleEditStory(index);
    });
  });

  storiesModal.querySelectorAll('[data-action="delete-story"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteStory(index);
    });
  });
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

async function handleEditWisdom(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  const wisdom = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; context?: string }>;
  const item = wisdom[index];
  if (!item) return;

  const newQuote = prompt("Edit this saying:", item.quote);
  if (!newQuote) return;

  const newContext = prompt("When would they say this? (optional)", item.context || '') || undefined;

  try {
    const updatedWisdom = [...wisdom];
    updatedWisdom[index] = { quote: newQuote, context: newContext };

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, wisdom: updatedWisdom }
    });
    toast.success('Updated!');
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit wisdom:', err);
    toast.error("Couldn't update. Try again?");
  }
}

async function handleDeleteWisdom(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Delete this saying?')) return;

  try {
    const wisdom = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; context?: string }>;
    const updatedWisdom = wisdom.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, wisdom: updatedWisdom }
    });
    toast.success('Deleted');
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete wisdom:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

async function handleEditStory(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  const stories = (currentAgent.memories?.stories || []) as Array<{ content: string; date?: string }>;
  const item = stories[index];
  if (!item) return;

  const newContent = prompt("Edit this story:", item.content);
  if (!newContent) return;

  try {
    const updatedStories = [...stories];
    updatedStories[index] = { ...item, content: newContent };

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, stories: updatedStories }
    });
    toast.success('Updated!');
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit story:', err);
    toast.error("Couldn't update. Try again?");
  }
}

async function handleDeleteStory(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Delete this story?')) return;

  try {
    const stories = (currentAgent.memories?.stories || []) as Array<{ content: string; date?: string }>;
    const updatedStories = stories.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, stories: updatedStories }
    });
    toast.success('Deleted');
    await openLegacyStories(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete story:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

