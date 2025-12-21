/**
 * Coaching Mode UI
 * 
 * Structured coaching sessions with a Mentor agent.
 * Guides users through goal setting, reflection, and actionable advice.
 * 
 * @module coaching-mode.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('CoachingMode');

let coachingModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let currentStep: 'topic' | 'context' | 'session' = 'topic';
let sessionData = {
  topic: '',
  context: '',
  goal: ''
};

// ============================================================================
// TYPES
// ============================================================================

interface CoachingTopic {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompts: string[];
}

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .coaching-mode-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .coaching-mode-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .coaching-mode-modal {
    position: relative;
    width: 100%;
    max-width: 550px;
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

  .coaching-mode-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .coaching-mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .coaching-mode-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .coaching-mode-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .coaching-mode-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .coaching-close-btn {
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

  .coaching-close-btn:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .coaching-mode-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .coaching-progress {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }

  .coaching-progress-step {
    flex: 1;
    height: 4px;
    background: var(--color-background-subtle);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .coaching-progress-step.active {
    background: var(--color-accent);
  }

  .coaching-progress-step.completed {
    background: var(--color-accent);
  }

  .coaching-step-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .coaching-step-subtitle {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-4);
  }

  .coaching-topics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .coaching-topic-card {
    background: var(--color-background-subtle);
    border: 2px solid transparent;
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
    text-align: center;
  }

  .coaching-topic-card:hover {
    background: var(--color-background-hover);
    transform: translateY(-2px);
  }

  .coaching-topic-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
  }

  .coaching-topic-icon {
    width: 40px;
    height: 40px;
    margin: 0 auto var(--space-2);
    color: var(--color-accent);
  }

  .coaching-topic-name {
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .coaching-topic-desc {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .coaching-input-group {
    margin-bottom: var(--space-4);
  }

  .coaching-label {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
  }

  .coaching-textarea {
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

  .coaching-textarea:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-light);
  }

  .coaching-textarea::placeholder {
    color: var(--color-text-muted);
  }

  .coaching-suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .coaching-suggestion {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .coaching-suggestion:hover {
    background: var(--color-background-hover);
    border-color: var(--color-accent);
  }

  .coaching-session-intro {
    text-align: center;
    padding: var(--space-5);
    background: linear-gradient(135deg, var(--color-accent-light), transparent);
    border-radius: var(--radius-xl);
    margin-bottom: var(--space-4);
  }

  .coaching-session-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-3);
    color: var(--color-accent);
  }

  .coaching-session-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .coaching-session-desc {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .coaching-summary {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .coaching-summary-item {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .coaching-summary-item:last-child {
    margin-bottom: 0;
  }

  .coaching-summary-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 60px;
  }

  .coaching-summary-value {
    font-size: 0.9rem;
    color: var(--color-text-primary);
    flex: 1;
  }

  .coaching-actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }

  .coaching-btn {
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

  .coaching-btn--secondary {
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .coaching-btn--secondary:hover {
    background: var(--color-background-hover);
  }

  .coaching-btn--primary {
    background: var(--color-accent);
    border: none;
    color: white;
  }

  .coaching-btn--primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }
`;

// ============================================================================
// DATA
// ============================================================================

const COACHING_TOPICS: CoachingTopic[] = [
  {
    id: 'career',
    name: 'Career Growth',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    description: 'Navigate your professional journey',
    prompts: [
      "I want to get promoted",
      "Feeling stuck in my role",
      "Considering a career change"
    ]
  },
  {
    id: 'mindset',
    name: 'Mindset',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    description: 'Build mental strength',
    prompts: [
      "Dealing with self-doubt",
      "Building confidence",
      "Overcoming fear of failure"
    ]
  },
  {
    id: 'relationships',
    name: 'Relationships',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    description: 'Improve connections',
    prompts: [
      "Better communication",
      "Setting boundaries",
      "Resolving conflict"
    ]
  },
  {
    id: 'habits',
    name: 'Habits & Discipline',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/></svg>`,
    description: 'Build better routines',
    prompts: [
      "Morning routine help",
      "Breaking bad habits",
      "Staying consistent"
    ]
  },
  {
    id: 'decisions',
    name: 'Decision Making',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    description: 'Navigate tough choices',
    prompts: [
      "Major life decision",
      "Weighing options",
      "Analysis paralysis"
    ]
  },
  {
    id: 'custom',
    name: 'Something Else',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    description: 'Custom coaching topic',
    prompts: []
  }
];

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  return `
    <div class="coaching-mode-overlay">
      <div class="coaching-mode-backdrop"></div>
      <div class="coaching-mode-modal" role="dialog" aria-labelledby="coaching-title">
        <header class="coaching-mode-header">
          <div class="coaching-mode-title">
            <span class="coaching-mode-eyebrow">Coaching Session with</span>
            <h2 class="coaching-mode-name" id="coaching-title">${currentAgent.displayName || currentAgent.name}</h2>
          </div>
          <button class="coaching-close-btn" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="coaching-mode-content" id="coaching-content">
          ${renderCurrentStep()}
        </div>
      </div>
    </div>
  `;
}

function renderCurrentStep(): string {
  switch (currentStep) {
    case 'topic':
      return renderTopicStep();
    case 'context':
      return renderContextStep();
    case 'session':
      return renderSessionStep();
    default:
      return renderTopicStep();
  }
}

function renderTopicStep(): string {
  return `
    <div class="coaching-progress">
      <div class="coaching-progress-step active"></div>
      <div class="coaching-progress-step"></div>
      <div class="coaching-progress-step"></div>
    </div>
    
    <h3 class="coaching-step-title">What would you like to work on?</h3>
    <p class="coaching-step-subtitle">Choose a topic for today's coaching session</p>
    
    <div class="coaching-topics-grid">
      ${COACHING_TOPICS.map(topic => `
        <button class="coaching-topic-card ${sessionData.topic === topic.id ? 'selected' : ''}" data-topic="${topic.id}">
          <div class="coaching-topic-icon">${topic.icon}</div>
          <p class="coaching-topic-name">${topic.name}</p>
          <p class="coaching-topic-desc">${topic.description}</p>
        </button>
      `).join('')}
    </div>
    
    <div class="coaching-actions">
      <button class="coaching-btn coaching-btn--secondary" data-action="cancel">Cancel</button>
      <button class="coaching-btn coaching-btn--primary" data-action="next" ${!sessionData.topic ? 'disabled' : ''}>
        Continue
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `;
}

function renderContextStep(): string {
  const selectedTopic = COACHING_TOPICS.find(t => t.id === sessionData.topic);
  
  return `
    <div class="coaching-progress">
      <div class="coaching-progress-step completed"></div>
      <div class="coaching-progress-step active"></div>
      <div class="coaching-progress-step"></div>
    </div>
    
    <h3 class="coaching-step-title">Tell me more</h3>
    <p class="coaching-step-subtitle">What's on your mind about ${selectedTopic?.name.toLowerCase() || 'this topic'}?</p>
    
    <div class="coaching-input-group">
      <label class="coaching-label" for="coaching-context">What's the situation?</label>
      <textarea 
        id="coaching-context" 
        class="coaching-textarea" 
        placeholder="Describe what's going on. The more context you share, the better I can help..."
      >${sessionData.context}</textarea>
      
      ${selectedTopic?.prompts.length ? `
        <div class="coaching-suggestions">
          ${selectedTopic.prompts.map(p => `
            <button class="coaching-suggestion" data-suggestion="${p}">${p}</button>
          `).join('')}
        </div>
      ` : ''}
    </div>
    
    <div class="coaching-input-group">
      <label class="coaching-label" for="coaching-goal">What outcome would feel good?</label>
      <textarea 
        id="coaching-goal" 
        class="coaching-textarea" 
        placeholder="What would you like to walk away with from this session?"
        style="min-height: 80px;"
      >${sessionData.goal}</textarea>
    </div>
    
    <div class="coaching-actions">
      <button class="coaching-btn coaching-btn--secondary" data-action="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
      <button class="coaching-btn coaching-btn--primary" data-action="next">
        Continue
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `;
}

function renderSessionStep(): string {
  const selectedTopic = COACHING_TOPICS.find(t => t.id === sessionData.topic);
  
  return `
    <div class="coaching-progress">
      <div class="coaching-progress-step completed"></div>
      <div class="coaching-progress-step completed"></div>
      <div class="coaching-progress-step active"></div>
    </div>
    
    <div class="coaching-session-intro">
      <div class="coaching-session-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h3 class="coaching-session-title">Ready to Begin</h3>
      <p class="coaching-session-desc">
        Let's dive into your ${selectedTopic?.name.toLowerCase() || 'topic'} together.
        I'll guide you through this with questions and insights.
      </p>
    </div>
    
    <div class="coaching-summary">
      <div class="coaching-summary-item">
        <span class="coaching-summary-label">Topic</span>
        <span class="coaching-summary-value">${selectedTopic?.name || sessionData.topic}</span>
      </div>
      ${sessionData.context ? `
        <div class="coaching-summary-item">
          <span class="coaching-summary-label">Context</span>
          <span class="coaching-summary-value">${sessionData.context}</span>
        </div>
      ` : ''}
      ${sessionData.goal ? `
        <div class="coaching-summary-item">
          <span class="coaching-summary-label">Goal</span>
          <span class="coaching-summary-value">${sessionData.goal}</span>
        </div>
      ` : ''}
    </div>
    
    <div class="coaching-actions">
      <button class="coaching-btn coaching-btn--secondary" data-action="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Edit
      </button>
      <button class="coaching-btn coaching-btn--primary" data-action="start-session">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Start Session
      </button>
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openCoachingMode(agentId: string): Promise<void> {
  log.debug('Opening Coaching Mode for agent:', agentId);

  closeCoachingMode();

  // Reset state
  currentStep = 'topic';
  sessionData = { topic: '', context: '', goal: '' };

  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this mentor");
    return;
  }

  if (!document.querySelector('#coaching-mode-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'coaching-mode-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  coachingModal = document.createElement('div');
  coachingModal.innerHTML = render();
  document.body.appendChild(coachingModal);

  requestAnimationFrame(() => {
    const modal = coachingModal?.querySelector('.coaching-mode-modal');
    modal?.classList.add('visible');
  });

  attachListeners();
  soundUI.play('open');
}

export function closeCoachingMode(): void {
  if (!coachingModal) return;

  const modal = coachingModal.querySelector('.coaching-mode-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    coachingModal?.remove();
    coachingModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// NAVIGATION
// ============================================================================

function updateContent(): void {
  const content = coachingModal?.querySelector('#coaching-content');
  if (content) {
    content.innerHTML = renderCurrentStep();
    attachStepListeners();
  }
}

function attachStepListeners(): void {
  if (!coachingModal) return;

  // Topic selection
  coachingModal.querySelectorAll('.coaching-topic-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const topic = (e.currentTarget as HTMLElement).dataset.topic;
      if (topic) {
        sessionData.topic = topic;
        coachingModal?.querySelectorAll('.coaching-topic-card').forEach(c => c.classList.remove('selected'));
        (e.currentTarget as HTMLElement).classList.add('selected');
        const nextBtn = coachingModal?.querySelector('[data-action="next"]') as HTMLButtonElement;
        if (nextBtn) nextBtn.disabled = false;
      }
    });
  });

  // Suggestions
  coachingModal.querySelectorAll('.coaching-suggestion').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const suggestion = (e.currentTarget as HTMLElement).dataset.suggestion;
      const textarea = coachingModal?.querySelector('#coaching-context') as HTMLTextAreaElement;
      if (suggestion && textarea) {
        textarea.value = suggestion;
        sessionData.context = suggestion;
      }
    });
  });

  // Text inputs
  const contextInput = coachingModal?.querySelector('#coaching-context') as HTMLTextAreaElement;
  const goalInput = coachingModal?.querySelector('#coaching-goal') as HTMLTextAreaElement;
  
  contextInput?.addEventListener('input', () => { sessionData.context = contextInput.value; });
  goalInput?.addEventListener('input', () => { sessionData.goal = goalInput.value; });

  // Navigation buttons
  coachingModal.querySelector('[data-action="cancel"]')?.addEventListener('click', closeCoachingMode);
  coachingModal.querySelector('[data-action="back"]')?.addEventListener('click', handleBack);
  coachingModal.querySelector('[data-action="next"]')?.addEventListener('click', handleNext);
  coachingModal.querySelector('[data-action="start-session"]')?.addEventListener('click', handleStartSession);
}

function handleBack(): void {
  if (currentStep === 'context') {
    currentStep = 'topic';
  } else if (currentStep === 'session') {
    currentStep = 'context';
  }
  updateContent();
}

function handleNext(): void {
  if (currentStep === 'topic' && sessionData.topic) {
    currentStep = 'context';
    updateContent();
  } else if (currentStep === 'context') {
    currentStep = 'session';
    updateContent();
  }
}

async function handleStartSession(): Promise<void> {
  if (!currentAgent) return;

  closeCoachingMode();

  // Build a coaching-specific opening prompt
  const selectedTopic = COACHING_TOPICS.find(t => t.id === sessionData.topic);
  const coachingPrompt = buildCoachingPrompt(selectedTopic);

  // Open talk interface with coaching context
  const { openTalkToTwin } = await import('./talk-to-twin.ui.js');
  await openTalkToTwin(currentAgent.id, coachingPrompt);
}

function buildCoachingPrompt(topic: CoachingTopic | undefined): string {
  let prompt = `[COACHING SESSION]\n`;
  prompt += `Topic: ${topic?.name || sessionData.topic}\n`;
  if (sessionData.context) {
    prompt += `Context: ${sessionData.context}\n`;
  }
  if (sessionData.goal) {
    prompt += `Goal: ${sessionData.goal}\n`;
  }
  prompt += `\nPlease begin the coaching session by asking a thoughtful opening question about my situation.`;
  return prompt;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!coachingModal) return;

  coachingModal.querySelector('.coaching-close-btn')?.addEventListener('click', closeCoachingMode);
  coachingModal.querySelector('.coaching-mode-backdrop')?.addEventListener('click', closeCoachingMode);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCoachingMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  attachStepListeners();
}

