/**
 * Professional Tasks UI
 * 
 * Displays and manages tasks, skills, and domain expertise for a Professional agent
 * (a specialized assistant for work tasks).
 * 
 * @module professional-tasks.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, updateCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('ProfessionalTasks');

let tasksModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .professional-tasks-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .professional-tasks-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .professional-tasks-modal {
    position: relative;
    width: 100%;
    max-width: clamp(420px, 90vw, 600px);
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING},
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .professional-tasks-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .professional-tasks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .professional-tasks-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .professional-tasks-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .professional-tasks-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .professional-close-btn {
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

  .professional-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .professional-tasks-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .professional-section {
    margin-bottom: var(--space-6);
  }

  .professional-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .professional-section-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .professional-section-title svg {
    color: var(--color-accent);
  }

  .professional-add-btn {
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

  .professional-add-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .professional-empty-state {
    text-align: center;
    padding: var(--space-6);
    background: var(--color-background-subtle);
    border-radius: var(--radius-xl);
    border: 2px dashed var(--color-border);
  }

  .professional-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3);
    color: var(--color-text-muted);
  }

  .professional-empty-title {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .professional-empty-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .professional-skills-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .professional-skill-tag {
    background: linear-gradient(135deg, var(--color-accent-light), var(--color-background-subtle));
    border-radius: var(--radius-full);
    padding: var(--space-2) var(--space-3);
    font-size: 0.85rem;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .professional-skill-tag svg {
    width: 14px;
    height: 14px;
    color: var(--color-accent);
  }

  .professional-skill-tag .skill-actions {
    display: flex;
    gap: var(--space-1);
    margin-left: var(--space-1);
  }

  .professional-skill-tag .skill-action-btn {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all ${DURATION.FAST}ms ease;
  }

  .professional-skill-tag .skill-action-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .professional-skill-tag .skill-action-btn.delete:hover {
    color: var(--color-semantic-error);
  }

  .professional-domain-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
    border-left: 4px solid var(--color-accent);
    position: relative;
  }

  .professional-domain-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .professional-domain-title {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .professional-domain-description {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .professional-domain-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .professional-domain-action-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all ${DURATION.FAST}ms ease;
  }

  .professional-domain-action-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .professional-domain-action-btn.delete:hover {
    color: var(--color-semantic-error);
  }

  .professional-task-card {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .professional-task-card:hover {
    background: var(--color-background-hover);
    transform: translateX(4px);
  }

  .professional-task-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .professional-task-info {
    flex: 1;
    min-width: 0;
  }

  .professional-task-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .professional-task-description {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .professional-task-arrow {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .professional-quick-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .professional-quick-action {
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    text-align: center;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .professional-quick-action:hover {
    background: var(--color-background-hover);
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .professional-quick-action-icon {
    width: 32px;
    height: 32px;
    margin: 0 auto var(--space-2);
    color: var(--color-accent);
  }

  .professional-quick-action-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  /* Mobile Responsiveness */
  @media (max-width: clamp(448px, 90vw, 640px)) {
    .professional-tasks-overlay {
      padding: 0;
    }

    .professional-tasks-modal {
      max-width: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .professional-tasks-header {
      padding: var(--space-3) var(--space-4);
    }

    .professional-tasks-content {
      padding: var(--space-4);
    }

    .professional-section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .professional-add-btn {
      width: 100%;
      justify-content: center;
    }

    .professional-quick-actions {
      grid-template-columns: 1fr;
    }

    .professional-skills-grid {
      gap: var(--space-2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .professional-tasks-modal {
      transition: none;
    }
  }
`;

// ============================================================================
// TYPES
// ============================================================================

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}

interface DomainExpertise {
  name: string;
  description: string;
}

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const skills = (currentAgent.personality?.values || []);
  const domains = (currentAgent.memories?.wisdom || []) as unknown as DomainExpertise[];
  const taskTemplates = getDefaultTaskTemplates();

  return `
    <div class="professional-tasks-overlay">
      <div class="professional-tasks-backdrop"></div>
      <div class="professional-tasks-modal" role="dialog" aria-labelledby="professional-title">
        <header class="professional-tasks-header">
          <div class="professional-tasks-title">
            <span class="professional-tasks-eyebrow">Professional Assistant</span>
            <h2 class="professional-tasks-name" id="professional-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="professional-close-btn" aria-label="${t('accessibility.closeTasks')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="professional-tasks-content">
          <!-- Quick Actions -->
          <section class="professional-section">
            <div class="professional-section-header">
              <h3 class="professional-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Quick Actions
              </h3>
            </div>
            <div class="professional-quick-actions" role="button" tabindex="0">
              <button aria-label="${t('accessibility.brainstorm')}" class="professional-quick-action" data-action="start-task" data-task="brainstorm">
                <div class="professional-quick-action-icon" role="button" tabindex="0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <path d="M12 17h.01"/>
                  </svg>
                </div>
                <span class="professional-quick-action-label" role="button" tabindex="0">Brainstorm</span>
              </button>
              <button aria-label="${t('accessibility.reviewWork')}" class="professional-quick-action" data-action="start-task" data-task="review">
                <div class="professional-quick-action-icon" role="button" tabindex="0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <span class="professional-quick-action-label" role="button" tabindex="0">Review Work</span>
              </button>
              <button aria-label="${t('accessibility.draftContent')}" class="professional-quick-action" data-action="start-task" data-task="draft">
                <div class="professional-quick-action-icon" role="button" tabindex="0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
                <span class="professional-quick-action-label" role="button" tabindex="0">Draft Content</span>
              </button>
              <button aria-label="${t('accessibility.analyzeData')}" class="professional-quick-action" data-action="start-task" data-task="analyze">
                <div class="professional-quick-action-icon" role="button" tabindex="0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </div>
                <span class="professional-quick-action-label" role="button" tabindex="0">Analyze Data</span>
              </button>
            </div>
          </section>

          <!-- Skills -->
          <section class="professional-section">
            <div class="professional-section-header">
              <h3 class="professional-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                </svg>
                Skills & Expertise
              </h3>
              <button aria-label="${t('accessibility.addSkill')}" class="professional-add-btn" data-action="add-skill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Skill
              </button>
            </div>
            ${skills.length === 0 ? `
              <div class="professional-empty-state">
                <div class="professional-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                  </svg>
                </div>
                <h4 class="professional-empty-title">No skills defined</h4>
                <p class="professional-empty-text">Add the skills this assistant specializes in.</p>
              </div>
            ` : `
              <div class="professional-skills-grid">
                ${skills.map((s, idx) => `
                  <span class="professional-skill-tag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    ${s}
                    <span class="skill-actions" role="button" tabindex="0">
                      <button aria-label="${t('accessibility.delete')}" class="skill-action-btn edit" data-action="edit-skill" data-index="${idx}" title="Edit skill">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button aria-label="${t('accessibility.delete')}" class="skill-action-btn delete" data-action="delete-skill" data-index="${idx}" title="Delete skill">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </span>
                  </span>
                `).join('')}
              </div>
            `}
          </section>

          <!-- Domain Expertise -->
          <section class="professional-section">
            <div class="professional-section-header">
              <h3 class="professional-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                Domain Knowledge
              </h3>
              <button aria-label="${t('accessibility.addDomain')}" class="professional-add-btn" data-action="add-domain">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Domain
              </button>
            </div>
            ${domains.length === 0 ? `
              <div class="professional-empty-state">
                <div class="professional-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                  </svg>
                </div>
                <h4 class="professional-empty-title">No domain knowledge</h4>
                <p class="professional-empty-text">Define the areas this assistant has expertise in.</p>
              </div>
            ` : domains.map((d, idx) => `
              <div class="professional-domain-card">
                <div class="professional-domain-header">
                  <h4 class="professional-domain-title">${d.name}</h4>
                  <div class="professional-domain-actions" role="button" tabindex="0">
                    <button aria-label="${t('accessibility.delete')}" class="professional-domain-action-btn edit" data-action="edit-domain" data-index="${idx}" title="Edit domain">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button aria-label="${t('accessibility.delete')}" class="professional-domain-action-btn delete" data-action="delete-domain" data-index="${idx}" title="Delete domain">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                ${d.description ? `<p class="professional-domain-description">${d.description}</p>` : ''}
              </div>
            `).join('')}
          </section>

          <!-- Task Templates -->
          <section class="professional-section">
            <div class="professional-section-header">
              <h3 class="professional-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Task Templates
              </h3>
            </div>
            ${taskTemplates.map(t => `
              <div class="professional-task-card" data-action="use-template" role="button" tabindex="0" data-template-id="${t.id}">
                <div class="professional-task-icon">
                  ${t.icon}
                </div>
                <div class="professional-task-info">
                  <p class="professional-task-name">${t.name}</p>
                  <p class="professional-task-description">${t.description}</p>
                </div>
                <div class="professional-task-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            `).join('')}
          </section>
        </div>
      </div>
    </div>
  `;
}

function getDefaultTaskTemplates(): TaskTemplate[] {
  return [
    {
      id: 'email',
      name: 'Draft Email',
      description: 'Compose a professional email',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
      prompt: 'Help me draft a professional email about...'
    },
    {
      id: 'meeting',
      name: 'Meeting Prep',
      description: 'Prepare agenda and talking points',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      prompt: 'Help me prepare for a meeting about...'
    },
    {
      id: 'summary',
      name: 'Summarize Document',
      description: 'Create a concise summary',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
      prompt: 'Summarize the key points from...'
    },
    {
      id: 'plan',
      name: 'Project Planning',
      description: 'Break down tasks and timeline',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      prompt: 'Help me plan a project for...'
    }
  ];
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openProfessionalTasks(agentId: string): Promise<void> {
  log.debug('Opening Professional Tasks for agent:', agentId);

  // Clean up any existing modal
  closeProfessionalTasks();

  // Load agent data
  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this assistant");
    return;
  }

  // Add styles
  if (!document.querySelector('#professional-tasks-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'professional-tasks-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  tasksModal = document.createElement('div');
  tasksModal.innerHTML = render();
  document.body.appendChild(tasksModal);

  // Animate in
  requestAnimationFrame(() => {
    const modal = tasksModal?.querySelector('.professional-tasks-modal');
    modal?.classList.add('visible');
  });

  // Attach listeners
  attachListeners();

  soundUI.play('open');
}

export function closeProfessionalTasks(): void {
  if (!tasksModal) return;

  const modal = tasksModal.querySelector('.professional-tasks-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    tasksModal?.remove();
    tasksModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!tasksModal) return;

  tasksModal.querySelector('.professional-close-btn')?.addEventListener('click', closeProfessionalTasks);
  tasksModal.querySelector('.professional-tasks-backdrop')?.addEventListener('click', closeProfessionalTasks);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeProfessionalTasks();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  tasksModal.querySelector('[data-action="add-skill"]')?.addEventListener('click', () => { void handleAddSkill(); });
  tasksModal.querySelector('[data-action="add-domain"]')?.addEventListener('click', () => { void handleAddDomain(); });

  // Skill edit/delete
  tasksModal.querySelectorAll('[data-action="edit-skill"]').forEach(btn => {
    btn.addEventListener('click', handleEditSkill);
  });
  tasksModal.querySelectorAll('[data-action="delete-skill"]').forEach(btn => {
    btn.addEventListener('click', handleDeleteSkill);
  });

  // Domain edit/delete
  tasksModal.querySelectorAll('[data-action="edit-domain"]').forEach(btn => {
    btn.addEventListener('click', handleEditDomain);
  });
  tasksModal.querySelectorAll('[data-action="delete-domain"]').forEach(btn => {
    btn.addEventListener('click', handleDeleteDomain);
  });

  // Quick actions
  tasksModal.querySelectorAll('[data-action="start-task"]').forEach(btn => {
    btn.addEventListener('click', handleStartTask);
  });

  // Task templates
  tasksModal.querySelectorAll('[data-action="use-template"]').forEach(card => {
    card.addEventListener('click', handleUseTemplate);
  });
}

async function handleAddSkill(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const skill = prompt("Add a skill this assistant excels at:");
  if (!skill || !currentAgent) return;

  try {
    const currentSkills = (currentAgent.personality?.values || []);
    const updates = {
      personality: {
        ...currentAgent.personality,
        values: [...currentSkills, skill]
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success(t('toasts.skillAdded'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to add skill:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleAddDomain(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const name = prompt("Domain name (e.g., 'Marketing', 'Finance'):");
  if (!name || !currentAgent) return;

  const description = prompt("Brief description of expertise:") || '';

  try {
    const currentDomains = (currentAgent.memories?.wisdom || []) as unknown as Array<{ name: string; description: string }>;
    const updates = {
      memories: {
        ...currentAgent.memories,
        wisdom: [...currentDomains, { name, description }] as unknown as typeof currentAgent.memories.wisdom
      }
    };

    await updateCustomAgent(currentAgent.id, updates as Parameters<typeof updateCustomAgent>[1]);
    toast.success(t('toasts.domainAdded'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to add domain:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleEditSkill(e: Event): Promise<void> {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const index = parseInt(btn.dataset.index || '0', 10);
  
  if (!currentAgent) return;

  const { toast } = await import('./toast.ui.js');
  const skills = (currentAgent.personality?.values || []);
  const currentSkill = skills[index];

  const newSkill = prompt('Edit this skill:', currentSkill);
  if (!newSkill || newSkill === currentSkill) return;

  try {
    const updatedSkills = [...skills];
    updatedSkills[index] = newSkill;

    const updates = {
      personality: {
        ...currentAgent.personality,
        values: updatedSkills
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success(t('toasts.skillUpdated'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit skill:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleDeleteSkill(e: Event): Promise<void> {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const index = parseInt(btn.dataset.index || '0', 10);
  
  if (!currentAgent) return;

  const { toast } = await import('./toast.ui.js');
  const skills = (currentAgent.personality?.values || []);

  if (!confirm(`Remove skill "${skills[index]}"?`)) return;

  try {
    const updatedSkills = skills.filter((_, i) => i !== index);

    const updates = {
      personality: {
        ...currentAgent.personality,
        values: updatedSkills
      }
    };

    await updateCustomAgent(currentAgent.id, updates);
    toast.success(t('toasts.skillRemoved'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete skill:', err);
    toast.error("Couldn't remove. Try again?");
  }
}

async function handleEditDomain(e: Event): Promise<void> {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const index = parseInt(btn.dataset.index || '0', 10);
  
  if (!currentAgent) return;

  const { toast } = await import('./toast.ui.js');
  const domains = (currentAgent.memories?.wisdom || []) as unknown as Array<{ name: string; description: string }>;
  const currentDomain = domains[index];

  const newName = prompt('Domain name:', currentDomain.name);
  if (!newName) return;

  const newDescription = prompt('Description:', currentDomain.description || '') || '';

  try {
    const updatedDomains = [...domains];
    updatedDomains[index] = { name: newName, description: newDescription };

    const updates = {
      memories: {
        ...currentAgent.memories,
        wisdom: updatedDomains as unknown as typeof currentAgent.memories.wisdom
      }
    };

    await updateCustomAgent(currentAgent.id, updates as Parameters<typeof updateCustomAgent>[1]);
    toast.success(t('toasts.domainUpdated'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to edit domain:', err);
    toast.error("Couldn't save. Try again?");
  }
}

async function handleDeleteDomain(e: Event): Promise<void> {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const index = parseInt(btn.dataset.index || '0', 10);
  
  if (!currentAgent) return;

  const { toast } = await import('./toast.ui.js');
  const domains = (currentAgent.memories?.wisdom || []) as unknown as Array<{ name: string; description: string }>;

  if (!confirm(`Remove domain "${domains[index].name}"?`)) return;

  try {
    const updatedDomains = domains.filter((_, i) => i !== index);

    const updates = {
      memories: {
        ...currentAgent.memories,
        wisdom: updatedDomains as unknown as typeof currentAgent.memories.wisdom
      }
    };

    await updateCustomAgent(currentAgent.id, updates as Parameters<typeof updateCustomAgent>[1]);
    toast.success(t('toasts.domainRemoved'));
    await openProfessionalTasks(currentAgent.id);
  } catch (err) {
    log.error('Failed to delete domain:', err);
    toast.error("Couldn't remove. Try again?");
  }
}

async function handleStartTask(e: Event): Promise<void> {
  const btn = e.currentTarget as HTMLElement;
  const taskType = btn.dataset.task;
  
  if (!currentAgent) return;

  closeProfessionalTasks();

  // Open talk with a pre-filled context
  const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
  await openTalkToTwin(currentAgent.id);

  // TODO: Could pre-fill the input with a task-specific prompt
  log.debug('Starting task:', taskType);
}

async function handleUseTemplate(e: Event): Promise<void> {
  const card = e.currentTarget as HTMLElement;
  const templateId = card.dataset.templateId;
  
  if (!currentAgent) return;

  closeProfessionalTasks();

  // Open talk with template context
  const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
  await openTalkToTwin(currentAgent.id);

  log.debug('Using template:', templateId);
}

