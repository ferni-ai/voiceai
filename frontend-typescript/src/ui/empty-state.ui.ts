/**
 * Empty State UI Components
 * 
 * Creates warm, human empty states that turn absence into opportunity.
 * These screens feel like an invitation, not a dead end.
 * 
 * @module @ferni/empty-states
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('EmptyStateUI');

// ============================================================================
// TYPES
// ============================================================================

export type EmptyStateType = 
  | 'no_conversations'
  | 'no_history'
  | 'no_goals'
  | 'no_team'
  | 'loading'
  | 'search_empty'
  | 'offline'
  | 'error'
  | 'permission_needed'
  | 'coming_soon';

export interface EmptyStateConfig {
  type: EmptyStateType;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  illustration?: 'zen' | 'sprout' | 'journey' | 'team' | 'search' | 'offline' | 'oops' | 'lock' | 'sparkle';
  showAnimation?: boolean;
}

// ============================================================================
// EMPTY STATE PRESETS
// ============================================================================

const EMPTY_STATE_PRESETS: Record<EmptyStateType, Partial<EmptyStateConfig>> = {
  no_conversations: {
    title: "Let's start something meaningful",
    message: "Every great journey begins with a single conversation. I'm here whenever you're ready.",
    actionLabel: "Start talking",
    illustration: 'zen',
  },
  no_history: {
    title: "Your story starts here",
    message: "As we talk, your journey will unfold in this space.",
    illustration: 'journey',
  },
  no_goals: {
    title: "What matters to you?",
    message: "Setting goals isn't about pressure—it's about pointing toward what you care about.",
    actionLabel: "Set a goal",
    illustration: 'sprout',
  },
  no_team: {
    title: "Your team is growing",
    message: "As our relationship deepens, you'll meet new friends who can help in different ways.",
    illustration: 'team',
  },
  loading: {
    title: "Taking a breath...",
    message: "Good things are worth a moment.",
    illustration: 'zen',
    showAnimation: true,
  },
  search_empty: {
    title: "Nothing here yet",
    message: "Try different words, or we could explore this topic together.",
    actionLabel: "Ask Ferni",
    illustration: 'search',
  },
  offline: {
    title: "We're offline right now",
    message: "That's okay—some of our best thinking happens in quiet moments. We'll reconnect soon.",
    actionLabel: "Try again",
    illustration: 'offline',
  },
  error: {
    title: "Oops, something went sideways",
    message: "Even the best of us stumble. Let's try that again.",
    actionLabel: "Try again",
    secondaryActionLabel: "Get help",
    illustration: 'oops',
  },
  permission_needed: {
    title: "We need your permission",
    message: "To give you the best experience, we need access to your microphone. Your privacy is always protected.",
    actionLabel: "Grant permission",
    illustration: 'lock',
  },
  coming_soon: {
    title: "Something special is coming",
    message: "We're building something thoughtful here. It'll be worth the wait.",
    illustration: 'sparkle',
  },
};

// ============================================================================
// SVG ILLUSTRATIONS
// ============================================================================

const ILLUSTRATIONS: Record<string, string> = {
  zen: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Zen circle -->
      <circle cx="60" cy="60" r="45" stroke="var(--persona-primary, #4a6741)" stroke-width="3" fill="none" opacity="0.3"/>
      <circle cx="60" cy="60" r="35" stroke="var(--persona-primary, #4a6741)" stroke-width="2" fill="none" opacity="0.5"/>
      <circle cx="60" cy="60" r="8" fill="var(--persona-primary, #4a6741)" opacity="0.8"/>
    </svg>
  `,
  sprout: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Growing sprout -->
      <path d="M60 90 L60 55" stroke="var(--persona-primary, #4a6741)" stroke-width="3" stroke-linecap="round"/>
      <path d="M60 70 Q45 60 50 45 Q55 35 60 45 Q65 35 70 45 Q75 60 60 70" fill="var(--persona-primary, #4a6741)" opacity="0.7"/>
      <!-- Ground -->
      <ellipse cx="60" cy="95" rx="25" ry="5" fill="var(--color-text-muted, #9a8a7a)" opacity="0.3"/>
    </svg>
  `,
  journey: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Path/journey line -->
      <path d="M20 80 Q40 60 60 65 Q80 70 100 50" stroke="var(--persona-primary, #4a6741)" stroke-width="3" stroke-linecap="round" fill="none" stroke-dasharray="6 4"/>
      <!-- Milestone dots -->
      <circle cx="20" cy="80" r="5" fill="var(--color-text-muted, #9a8a7a)" opacity="0.5"/>
      <circle cx="60" cy="65" r="5" fill="var(--persona-primary, #4a6741)" opacity="0.7"/>
      <circle cx="100" cy="50" r="6" fill="var(--persona-primary, #4a6741)"/>
    </svg>
  `,
  team: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Main figure -->
      <circle cx="60" cy="40" r="12" fill="var(--persona-primary, #4a6741)"/>
      <path d="M45 60 Q45 50 60 50 Q75 50 75 60 L75 75 L45 75 Z" fill="var(--persona-primary, #4a6741)" opacity="0.7"/>
      <!-- Side figures (faded) -->
      <circle cx="30" cy="55" r="8" fill="var(--color-text-muted, #9a8a7a)" opacity="0.3"/>
      <circle cx="90" cy="55" r="8" fill="var(--color-text-muted, #9a8a7a)" opacity="0.3"/>
    </svg>
  `,
  search: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Magnifying glass -->
      <circle cx="50" cy="50" r="25" stroke="var(--persona-primary, #4a6741)" stroke-width="4" fill="none"/>
      <line x1="68" y1="68" x2="90" y2="90" stroke="var(--persona-primary, #4a6741)" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `,
  offline: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Cloud with line through -->
      <path d="M30 70 Q20 70 20 60 Q20 50 30 50 Q30 35 50 35 Q65 35 70 45 Q80 40 90 50 Q100 50 100 60 Q100 70 90 70 Z" fill="var(--color-text-muted, #9a8a7a)" opacity="0.3"/>
      <line x1="25" y1="85" x2="95" y2="25" stroke="var(--persona-primary, #4a6741)" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `,
  oops: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Friendly face with oops expression -->
      <circle cx="60" cy="60" r="40" fill="var(--color-background-elevated, #FFFDFB)" stroke="var(--persona-primary, #4a6741)" stroke-width="3"/>
      <circle cx="45" cy="50" r="4" fill="var(--persona-primary, #4a6741)"/>
      <circle cx="75" cy="50" r="4" fill="var(--persona-primary, #4a6741)"/>
      <path d="M45 75 Q60 65 75 75" stroke="var(--persona-primary, #4a6741)" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>
  `,
  lock: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Lock -->
      <rect x="35" y="55" width="50" height="40" rx="5" fill="var(--persona-primary, #4a6741)" opacity="0.8"/>
      <path d="M45 55 L45 40 Q45 25 60 25 Q75 25 75 40 L75 55" stroke="var(--persona-primary, #4a6741)" stroke-width="4" fill="none"/>
      <circle cx="60" cy="75" r="5" fill="var(--color-background-elevated, #FFFDFB)"/>
    </svg>
  `,
  sparkle: `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Sparkles -->
      <path d="M60 20 L65 40 L85 45 L65 50 L60 70 L55 50 L35 45 L55 40 Z" fill="var(--persona-primary, #4a6741)"/>
      <path d="M85 70 L88 80 L98 83 L88 86 L85 96 L82 86 L72 83 L82 80 Z" fill="var(--persona-primary, #4a6741)" opacity="0.6"/>
      <path d="M30 65 L33 75 L43 78 L33 81 L30 91 L27 81 L17 78 L27 75 Z" fill="var(--persona-primary, #4a6741)" opacity="0.6"/>
    </svg>
  `,
};

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

export class EmptyStateUI {
  private container: HTMLElement | null = null;
  
  /**
   * Create an empty state element
   */
  create(config: EmptyStateConfig): HTMLElement {
    const preset = EMPTY_STATE_PRESETS[config.type];
    const fullConfig: EmptyStateConfig = { ...preset, ...config };
    
    const element = document.createElement('div');
    element.className = 'ferni-empty-state';
    element.setAttribute('role', 'status');
    
    Object.assign(element.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 'var(--space-8, 32px)',
      minHeight: '300px',
      opacity: '0',
      transform: 'translateY(10px)',
    });
    
    // Illustration
    if (fullConfig.illustration) {
      const illustration = this.createIllustration(fullConfig.illustration, fullConfig.showAnimation);
      element.appendChild(illustration);
    }
    
    // Title
    if (fullConfig.title) {
      const title = document.createElement('h3');
      title.className = 'empty-state-title';
      title.textContent = fullConfig.title;
      Object.assign(title.style, {
        fontFamily: 'var(--font-display)',
        fontSize: '20px',
        fontWeight: '600',
        color: 'var(--color-text-primary, #2C2520)',
        margin: '0 0 8px 0',
      });
      element.appendChild(title);
    }
    
    // Message
    if (fullConfig.message) {
      const message = document.createElement('p');
      message.className = 'empty-state-message';
      message.textContent = fullConfig.message;
      Object.assign(message.style, {
        fontFamily: 'var(--font-body)',
        fontSize: '15px',
        lineHeight: '1.6',
        color: 'var(--color-text-secondary, #70605a)',
        margin: '0 0 24px 0',
        maxWidth: '320px',
      });
      element.appendChild(message);
    }
    
    // Actions
    if (fullConfig.actionLabel || fullConfig.secondaryActionLabel) {
      const actions = this.createActions(fullConfig);
      element.appendChild(actions);
    }
    
    // Animate in
    requestAnimationFrame(() => {
      element.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, transform ${DURATION.SLOW}ms ${EASING.STANDARD}`;
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
    
    return element;
  }
  
  private createIllustration(type: string, animate: boolean = false): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state-illustration';
    
    Object.assign(wrapper.style, {
      width: '120px',
      height: '120px',
      marginBottom: 'var(--space-4, 16px)',
    });
    
    wrapper.innerHTML = ILLUSTRATIONS[type] || ILLUSTRATIONS.zen;
    
    if (animate) {
      const svg = wrapper.querySelector('svg');
      if (svg) {
        svg.style.animation = 'breathe 3s ease-in-out infinite';
      }
      
      // Add keyframes if not exists
      if (!document.querySelector('#ferni-empty-state-keyframes')) {
        const style = document.createElement('style');
        style.id = 'ferni-empty-state-keyframes';
        style.textContent = `
          @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.05); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
    }
    
    return wrapper;
  }
  
  private createActions(config: EmptyStateConfig): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'empty-state-actions';
    
    Object.assign(actions.style, {
      display: 'flex',
      gap: 'var(--space-3, 12px)',
      flexWrap: 'wrap',
      justifyContent: 'center',
    });
    
    // Primary action
    if (config.actionLabel) {
      const primaryBtn = this.createButton(config.actionLabel, 'primary', config.onAction);
      actions.appendChild(primaryBtn);
    }
    
    // Secondary action
    if (config.secondaryActionLabel) {
      const secondaryBtn = this.createButton(config.secondaryActionLabel, 'secondary', config.onSecondaryAction);
      actions.appendChild(secondaryBtn);
    }
    
    return actions;
  }
  
  private createButton(label: string, variant: 'primary' | 'secondary', onClick?: () => void): HTMLElement {
    const button = document.createElement('button');
    button.className = `empty-state-btn empty-state-btn--${variant}`;
    button.textContent = label;
    
    const isPrimary = variant === 'primary';
    
    Object.assign(button.style, {
      fontFamily: 'var(--font-body)',
      fontSize: '14px',
      fontWeight: '500',
      padding: '12px 24px',
      borderRadius: 'var(--radius-full, 9999px)',
      border: isPrimary ? 'none' : '1px solid var(--color-border, #d4cfc7)',
      background: isPrimary ? 'var(--persona-primary, #4a6741)' : 'transparent',
      color: isPrimary ? 'white' : 'var(--color-text-primary, #2C2520)',
      cursor: 'pointer',
      transition: `all ${DURATION.FAST}ms ${EASING.STANDARD}`,
    });
    
    // Hover effects
    button.addEventListener('mouseenter', () => {
      if (isPrimary) {
        button.style.transform = 'scale(1.02)';
        button.style.boxShadow = 'var(--shadow-md)';
      } else {
        button.style.background = 'var(--color-background-secondary, #f5f1e8)';
      }
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '';
      if (!isPrimary) {
        button.style.background = 'transparent';
      }
    });
    
    if (onClick) {
      button.addEventListener('click', onClick);
    }
    
    return button;
  }
  
  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  
  /**
   * Show empty state in a container
   */
  showIn(container: HTMLElement, config: EmptyStateConfig): HTMLElement {
    // Clear container
    container.innerHTML = '';
    
    // Create and append
    const emptyState = this.create(config);
    container.appendChild(emptyState);
    
    return emptyState;
  }
  
  /**
   * Quick helpers for common states
   */
  noConversations(onStart?: () => void): HTMLElement {
    return this.create({ type: 'no_conversations', onAction: onStart });
  }
  
  noHistory(): HTMLElement {
    return this.create({ type: 'no_history' });
  }
  
  loading(message?: string): HTMLElement {
    return this.create({ type: 'loading', message });
  }
  
  offline(onRetry?: () => void): HTMLElement {
    return this.create({ type: 'offline', onAction: onRetry });
  }
  
  error(onRetry?: () => void, onHelp?: () => void): HTMLElement {
    return this.create({ 
      type: 'error', 
      onAction: onRetry,
      onSecondaryAction: onHelp,
    });
  }
  
  searchEmpty(query: string, onAskFerni?: () => void): HTMLElement {
    return this.create({
      type: 'search_empty',
      message: `No results for "${query}". Try different words, or we could explore this topic together.`,
      onAction: onAskFerni,
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let emptyStateUIInstance: EmptyStateUI | null = null;

export function getEmptyStateUI(): EmptyStateUI {
  if (!emptyStateUIInstance) {
    emptyStateUIInstance = new EmptyStateUI();
  }
  return emptyStateUIInstance;
}

