/**
 * Mentor Teachings UI
 * 
 * Displays and manages teachings, principles, and insights from a Mentor agent
 * (based on an inspiring figure or expert whose wisdom you want to access).
 * 
 * @module mentor-teachings.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, updateCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('MentorTeachings');

let teachingsModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .mentor-teachings-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .mentor-teachings-backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .mentor-teachings-modal {
    position: relative;
    width: 100%;
    max-width: clamp(420px, 90vw, 600px);
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

  .mentor-teachings-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .mentor-teachings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .mentor-teachings-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mentor-teachings-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .mentor-teachings-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .mentor-close-btn {
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

  .mentor-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .mentor-teachings-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .mentor-section {
    margin-bottom: var(--space-6);
  }

  .mentor-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .mentor-section-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .mentor-section-title svg {
    color: var(--color-accent);
  }

  .mentor-add-btn {
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

  .mentor-add-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .mentor-empty-state {
    text-align: center;
    padding: var(--space-6);
    background: var(--color-background-subtle);
    border-radius: var(--radius-xl);
    border: 2px dashed var(--color-border);
  }

  .mentor-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3);
    color: var(--color-text-muted);
  }

  .mentor-empty-title {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .mentor-empty-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .mentor-principle-card {
    background: linear-gradient(135deg, var(--color-accent-light), var(--color-background-subtle));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
    border-left: 4px solid var(--color-accent);
  }

  .mentor-principle-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .mentor-principle-description {
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .mentor-quote-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
    position: relative;
  }

  .mentor-quote-card::before {
    content: '"';
    position: absolute;
    top: var(--space-2);
    left: var(--space-3);
    font-size: 3rem;
    font-family: var(--font-display);
    color: var(--color-accent);
    opacity: 0.3;
    line-height: 1;
  }

  .mentor-quote-text {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-style: italic;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
    padding-left: var(--space-6);
  }

  .mentor-quote-source {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    padding-left: var(--space-6);
  }

  .mentor-teaching-style {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .mentor-style-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-2);
  }

  .mentor-style-value {
    font-size: 0.95rem;
    color: var(--color-text-primary);
    line-height: 1.6;
  }

  .mentor-card-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .mentor-action-btn {
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

  .mentor-action-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .mentor-action-btn--delete:hover {
    background: color-mix(in srgb, var(--color-semantic-error, #ef4444) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-semantic-error, #ef4444) 30%, transparent);
    color: var(--color-semantic-error, #ef4444);
  }

  /* Mobile Responsiveness */
  @media (max-width: clamp(448px, 90vw, 640px)) {
    .mentor-teachings-overlay {
      padding: 0;
    }

    .mentor-teachings-modal {
      max-width: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .mentor-teachings-header {
      padding: var(--space-3) var(--space-4);
    }

    .mentor-teachings-content {
      padding: var(--space-4);
    }

    .mentor-section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .mentor-add-btn {
      width: 100%;
      justify-content: center;
    }

    .mentor-card-actions {
      flex-wrap: wrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mentor-teachings-modal {
      transition: none;
    }
  }
`;

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const principles = (currentAgent.personality?.values || []) as string[];
  const quotes = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; source?: string }>;
  const teachingStyle = currentAgent.personality?.communicationStyle || {};

  return `
    <div class="mentor-teachings-overlay">
      <div class="mentor-teachings-backdrop"></div>
      <div class="mentor-teachings-modal" role="dialog" aria-labelledby="mentor-title">
        <header class="mentor-teachings-header">
          <div class="mentor-teachings-title">
            <span class="mentor-teachings-eyebrow">Learning From</span>
            <h2 class="mentor-teachings-name" id="mentor-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="mentor-close-btn" aria-label="Close teachings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="mentor-teachings-content">
          <!-- Core Principles -->
          <section class="mentor-section">
            <div class="mentor-section-header">
              <h3 class="mentor-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
                  <path d="m5 21 5-10"/>
                </svg>
                Core Principles
              </h3>
              <button aria-label="Add Principle" class="mentor-add-btn" data-action="add-principle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Principle
              </button>
            </div>
            ${principles.length === 0 ? `
              <div class="mentor-empty-state">
                <div class="mentor-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
                    <path d="m5 21 5-10"/>
                  </svg>
                </div>
                <h4 class="mentor-empty-title">No principles yet</h4>
                <p class="mentor-empty-text">Add the core principles that define this mentor's philosophy.</p>
              </div>
            ` : principles.map((p, i) => `
              <div class="mentor-principle-card" data-index="${i}">
                <h4 class="mentor-principle-title">${p}</h4>
                <div class="mentor-card-actions" role="button" tabindex="0">
                  <button class="mentor-action-btn" data-action="edit-principle" data-index="${i}" aria-label="Edit principle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button class="mentor-action-btn mentor-action-btn--delete" data-action="delete-principle" data-index="${i}" aria-label="Delete principle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            `).join('')}
          </section>

          <!-- Key Quotes -->
          <section class="mentor-section">
            <div class="mentor-section-header">
              <h3 class="mentor-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 1 1z"/>
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                </svg>
                Key Quotes
              </h3>
              <button aria-label="Add Quote" class="mentor-add-btn" data-action="add-quote">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Quote
              </button>
            </div>
            ${quotes.length === 0 ? `
              <div class="mentor-empty-state">
                <div class="mentor-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 1 1z"/>
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                  </svg>
                </div>
                <h4 class="mentor-empty-title">No quotes yet</h4>
                <p class="mentor-empty-text">Capture their most impactful and memorable sayings.</p>
              </div>
            ` : quotes.map((q, i) => `
              <div class="mentor-quote-card" data-index="${i}">
                <p class="mentor-quote-text">${q.quote}</p>
                ${q.source ? `<span class="mentor-quote-source">— ${q.source}</span>` : ''}
                <div class="mentor-card-actions" role="button" tabindex="0">
                  <button class="mentor-action-btn" data-action="edit-quote" data-index="${i}" aria-label="Edit quote">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button class="mentor-action-btn mentor-action-btn--delete" data-action="delete-quote" data-index="${i}" aria-label="Delete quote">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            `).join('')}
          </section>

          <!-- Teaching Style -->
          <section class="mentor-section">
            <div class="mentor-section-header">
              <h3 class="mentor-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                Teaching Style
              </h3>
            </div>
            <div class="mentor-teaching-style">
              <div class="mentor-style-label">How They Teach</div>
              <div class="mentor-style-value">
                ${describeMentorStyle(teachingStyle)}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function describeMentorStyle(style: Record<string, unknown>): string {
  const traits: string[] = [];
  
  if (style.usesStories) traits.push('Uses stories and examples');
  if (style.asksQuestions) traits.push('Asks thought-provoking questions');
  if (style.directFeedback) traits.push('Gives direct, honest feedback');
  if (style.encouraging) traits.push('Encouraging and supportive');
  if (style.challenging) traits.push('Challenges assumptions');
  
  if (traits.length === 0) {
    return 'Define the teaching style by editing the agent personality.';
  }
  
  return traits.join(' • ');
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openMentorTeachings(agentId: string): Promise<void> {
  log.debug('Opening Mentor Teachings for agent:', agentId);

  // Clean up any existing modal
  closeMentorTeachings();

  // Load agent data
  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this mentor");
    return;
  }

  // Add styles
  if (!document.querySelector('#mentor-teachings-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mentor-teachings-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  teachingsModal = document.createElement('div');
  teachingsModal.innerHTML = render();
  document.body.appendChild(teachingsModal);

  // Animate in
  requestAnimationFrame(() => {
    const modal = teachingsModal?.querySelector('.mentor-teachings-modal');
    modal?.classList.add('visible');
  });

  // Attach listeners
  attachListeners();

  soundUI.play('open');
}

export function closeMentorTeachings(): void {
  if (!teachingsModal) return;

  const modal = teachingsModal.querySelector('.mentor-teachings-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    teachingsModal?.remove();
    teachingsModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!teachingsModal) return;

  // Close button
  teachingsModal.querySelector('.mentor-close-btn')?.addEventListener('click', closeMentorTeachings);

  // Backdrop click
  teachingsModal.querySelector('.mentor-teachings-backdrop')?.addEventListener('click', closeMentorTeachings);

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMentorTeachings();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Add principle button
  teachingsModal.querySelector('[data-action="add-principle"]')?.addEventListener('click', handleAddPrinciple);

  // Add quote button
  teachingsModal.querySelector('[data-action="add-quote"]')?.addEventListener('click', handleAddQuote);

  // Edit/Delete principle buttons
  teachingsModal.querySelectorAll('[data-action="edit-principle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleEditPrinciple(index);
    });
  });

  teachingsModal.querySelectorAll('[data-action="delete-principle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeletePrinciple(index);
    });
  });

  // Edit/Delete quote buttons
  teachingsModal.querySelectorAll('[data-action="edit-quote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleEditQuote(index);
    });
  });

  teachingsModal.querySelectorAll('[data-action="delete-quote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      void handleDeleteQuote(index);
    });
  });
}

async function handleAddPrinciple(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const principle = prompt("What is a core principle this mentor teaches?");
  if (!principle || !currentAgent) return;

  try {
    const currentPrinciples = (currentAgent.personality?.values || []) as string[];
    const updates = {
      personality: {
        ...currentAgent.personality,
        values: [...currentPrinciples, principle]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Principle added!');
    
    // Refresh
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to add principle:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddQuote(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const quote = prompt("Enter a memorable quote from this mentor:");
  if (!quote || !currentAgent) return;

  const source = prompt("Source (book, talk, etc.) - optional:") || undefined;

  try {
    const currentQuotes = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; source?: string }>;
    const updates = {
      memories: {
        ...currentAgent.memories,
        wisdom: [...currentQuotes, { quote, source }]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success('Quote captured!');
    
    // Refresh
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to add quote:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleEditPrinciple(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  const principles = (currentAgent.personality?.values || []) as string[];
  const item = principles[index];
  if (!item) return;

  const newPrinciple = prompt("Edit this principle:", item);
  if (!newPrinciple) return;

  try {
    const updatedPrinciples = [...principles];
    updatedPrinciples[index] = newPrinciple;

    await updateCustomAgent(currentAgent.id, {
      personality: { ...currentAgent.personality, values: updatedPrinciples }
    });
    toast.success('Updated!');
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit principle:', err);
    toast.error("Couldn't update. Try again?");
  }
}

async function handleDeletePrinciple(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Delete this principle?')) return;

  try {
    const principles = (currentAgent.personality?.values || []) as string[];
    const updatedPrinciples = principles.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      personality: { ...currentAgent.personality, values: updatedPrinciples }
    });
    toast.success('Deleted');
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete principle:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

async function handleEditQuote(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  const quotes = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; source?: string }>;
  const item = quotes[index];
  if (!item) return;

  const newQuote = prompt("Edit this quote:", item.quote);
  if (!newQuote) return;

  const newSource = prompt("Source (book, talk, etc.) - optional:", item.source || '') || undefined;

  try {
    const updatedQuotes = [...quotes];
    updatedQuotes[index] = { quote: newQuote, source: newSource };

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, wisdom: updatedQuotes }
    });
    toast.success('Updated!');
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit quote:', err);
    toast.error("Couldn't update. Try again?");
  }
}

async function handleDeleteQuote(index: number): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  if (!currentAgent) return;

  if (!confirm('Delete this quote?')) return;

  try {
    const quotes = (currentAgent.memories?.wisdom || []) as Array<{ quote: string; source?: string }>;
    const updatedQuotes = quotes.filter((_, i) => i !== index);

    await updateCustomAgent(currentAgent.id, {
      memories: { ...currentAgent.memories, wisdom: updatedQuotes }
    });
    toast.success('Deleted');
    await openMentorTeachings(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete quote:', err);
    toast.error("Couldn't delete. Try again?");
  }
}

