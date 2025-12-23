/**
 * Loading Skeleton UI
 * 
 * Beautiful, breathing skeleton loaders that feel alive.
 * "Good things are worth a moment."
 * 
 * @module @ferni/skeleton
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('SkeletonUI');

// ============================================================================
// TYPES
// ============================================================================

export type SkeletonVariant = 
  | 'text'
  | 'heading'
  | 'avatar'
  | 'button'
  | 'card'
  | 'list-item'
  | 'paragraph'
  | 'image'
  | 'custom';

export interface SkeletonConfig {
  variant: SkeletonVariant;
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;          // For repeated skeletons
  gap?: string;            // Gap between repeated skeletons
  animate?: boolean;       // Enable shimmer animation
  personaColor?: boolean;  // Use persona primary color
}

// ============================================================================
// VARIANT STYLES
// ============================================================================

const VARIANT_STYLES: Record<SkeletonVariant, Partial<CSSStyleDeclaration>> = {
  text: {
    width: '100%',
    height: '14px',
    borderRadius: '4px',
  },
  heading: {
    width: '60%',
    height: '24px',
    borderRadius: '6px',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
  },
  button: {
    width: 'min(120px, 100%)',
    height: '40px',
    borderRadius: '9999px',
  },
  card: {
    width: '100%',
    height: '200px',
    borderRadius: '16px',
  },
  'list-item': {
    width: '100%',
    height: '64px',
    borderRadius: '12px',
  },
  paragraph: {
    width: '100%',
    height: '80px',
    borderRadius: '8px',
  },
  image: {
    width: '100%',
    height: '180px',
    borderRadius: '12px',
  },
  custom: {},
};

// ============================================================================
// CSS STYLES
// ============================================================================

const SKELETON_STYLES = `
  .ferni-skeleton {
    background: linear-gradient(
      90deg,
      var(--skeleton-base, rgba(44, 37, 32, 0.06)) 0%,
      var(--skeleton-highlight, rgba(44, 37, 32, 0.12)) 50%,
      var(--skeleton-base, rgba(44, 37, 32, 0.06)) 100%
    );
    background-size: 200% 100%;
    animation: ferni-skeleton-shimmer 1.5s ease-in-out infinite;
  }
  
  .ferni-skeleton--persona {
    background: linear-gradient(
      90deg,
      var(--skeleton-persona-base, rgba(74, 103, 65, 0.08)) 0%,
      var(--skeleton-persona-highlight, rgba(74, 103, 65, 0.16)) 50%,
      var(--skeleton-persona-base, rgba(74, 103, 65, 0.08)) 100%
    );
    background-size: 200% 100%;
  }
  
  .ferni-skeleton--no-animate {
    animation: none;
    background-size: 100% 100%;
  }
  
  @keyframes ferni-skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .ferni-skeleton {
      animation: ferni-skeleton-pulse 2s ease-in-out infinite;
    }
    
    @keyframes ferni-skeleton-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
  }
`;

// ============================================================================
// SKELETON UI
// ============================================================================

export class SkeletonUI {
  private stylesInjected: boolean = false;
  
  constructor() {
    this.injectStyles();
  }
  
  // ==========================================================================
  // STYLES
  // ==========================================================================
  
  private injectStyles(): void {
    if (this.stylesInjected) return;
    
    const existingStyle = document.getElementById('ferni-skeleton-styles');
    if (existingStyle) {
      this.stylesInjected = true;
      return;
    }
    
    const style = document.createElement('style');
    style.id = 'ferni-skeleton-styles';
    style.textContent = SKELETON_STYLES;
    document.head.appendChild(style);
    
    this.stylesInjected = true;
    log.debug('Skeleton styles injected');
  }
  
  // ==========================================================================
  // CREATION
  // ==========================================================================
  
  /**
   * Create a skeleton element
   */
  create(config: SkeletonConfig): HTMLElement {
    const variantStyles = VARIANT_STYLES[config.variant];
    
    const skeleton = document.createElement('div');
    skeleton.className = 'ferni-skeleton';
    
    if (config.personaColor) {
      skeleton.classList.add('ferni-skeleton--persona');
    }
    
    if (config.animate === false) {
      skeleton.classList.add('ferni-skeleton--no-animate');
    }
    
    // Apply styles
    Object.assign(skeleton.style, {
      width: config.width || variantStyles.width || '100%',
      height: config.height || variantStyles.height || '16px',
      borderRadius: config.borderRadius || variantStyles.borderRadius || '4px',
    });
    
    return skeleton;
  }
  
  /**
   * Create multiple skeleton elements
   */
  createGroup(config: SkeletonConfig): HTMLElement {
    const count = config.count || 1;
    const gap = config.gap || '8px';
    
    const container = document.createElement('div');
    container.className = 'ferni-skeleton-group';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = gap;
    
    for (let i = 0; i < count; i++) {
      const skeleton = this.create({
        ...config,
        count: undefined, // Don't recurse
      });
      
      // Vary widths for text variants
      if (config.variant === 'text' && i === count - 1) {
        skeleton.style.width = '75%';
      } else if (config.variant === 'text' && i > 0 && Math.random() > 0.5) {
        skeleton.style.width = `${80 + Math.random() * 20}%`;
      }
      
      container.appendChild(skeleton);
    }
    
    return container;
  }
  
  // ==========================================================================
  // PRESETS
  // ==========================================================================
  
  /**
   * Card skeleton with avatar, title, and text
   */
  card(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ferni-skeleton-card';
    card.style.cssText = `
      padding: var(--space-4, 16px);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border, #d4cfc7);
    `;
    
    // Header with avatar
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 16px;';
    
    header.appendChild(this.create({ variant: 'avatar', width: '40px', height: '40px' }));
    
    const headerText = document.createElement('div');
    headerText.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 6px;';
    headerText.appendChild(this.create({ variant: 'text', width: 'min(120px, 100%)', height: '12px' }));
    headerText.appendChild(this.create({ variant: 'text', width: '80px', height: '10px' }));
    header.appendChild(headerText);
    
    card.appendChild(header);
    
    // Content
    card.appendChild(this.createGroup({ variant: 'text', count: 3 }));
    
    return card;
  }
  
  /**
   * List item skeleton
   */
  listItem(): HTMLElement {
    const item = document.createElement('div');
    item.className = 'ferni-skeleton-list-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: var(--space-3, 12px);
    `;
    
    item.appendChild(this.create({ variant: 'avatar', width: '44px', height: '44px' }));
    
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 6px;';
    content.appendChild(this.create({ variant: 'text', width: 'min(150px, 100%)', height: '14px' }));
    content.appendChild(this.create({ variant: 'text', width: 'min(100px, 100%)', height: '12px' }));
    item.appendChild(content);
    
    return item;
  }
  
  /**
   * Team member card skeleton
   */
  teamMember(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ferni-skeleton-team-member';
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-4, 16px);
      gap: 12px;
    `;
    
    card.appendChild(this.create({ variant: 'avatar', width: '64px', height: '64px' }));
    card.appendChild(this.create({ variant: 'text', width: '80px', height: '14px' }));
    card.appendChild(this.create({ variant: 'text', width: '60px', height: '10px' }));
    
    return card;
  }
  
  /**
   * Conversation skeleton
   */
  conversation(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ferni-skeleton-conversation';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: var(--space-4, 16px);
    `;
    
    // Assistant message (left aligned)
    const assistantMsg = document.createElement('div');
    assistantMsg.style.cssText = 'display: flex; gap: 12px; align-items: flex-start;';
    assistantMsg.appendChild(this.create({ variant: 'avatar', width: '36px', height: '36px' }));
    
    const assistantBubble = document.createElement('div');
    assistantBubble.style.cssText = `
      background: var(--color-background-secondary, #f5f1e8);
      border-radius: 16px 16px 16px 4px;
      padding: 12px;
      max-width: 70%;
    `;
    assistantBubble.appendChild(this.createGroup({ variant: 'text', count: 2 }));
    assistantMsg.appendChild(assistantBubble);
    
    container.appendChild(assistantMsg);
    
    // User message (right aligned)
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'display: flex; justify-content: flex-end;';
    
    const userBubble = document.createElement('div');
    userBubble.style.cssText = `
      background: var(--persona-primary, #4a6741);
      border-radius: 16px 16px 4px 16px;
      padding: 12px;
      max-width: 60%;
    `;
    userBubble.appendChild(this.create({
      variant: 'text',
      width: 'min(120px, 100%)',
      height: '12px',
    }));
    // Override with lighter color for visibility on dark bg
    const innerSkeleton = userBubble.querySelector('.ferni-skeleton') as HTMLElement;
    if (innerSkeleton) {
      innerSkeleton.style.background = 'rgba(255, 255, 255, 0.2)';
    }
    userMsg.appendChild(userBubble);
    
    container.appendChild(userMsg);
    
    return container;
  }
  
  /**
   * Stats dashboard skeleton
   */
  stats(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ferni-skeleton-stats';
    container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
    `;
    
    for (let i = 0; i < 4; i++) {
      const stat = document.createElement('div');
      stat.style.cssText = `
        padding: var(--space-4, 16px);
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border, #d4cfc7);
        text-align: center;
      `;
      stat.appendChild(this.create({ variant: 'text', width: '60%', height: '10px' }));
      stat.appendChild(this.create({ variant: 'heading', width: '50%', height: '28px' }));
      stat.lastElementChild?.setAttribute('style', 
        (stat.lastElementChild as HTMLElement).style.cssText + 'margin: 8px auto 0;');
      container.appendChild(stat);
    }
    
    return container;
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  /**
   * Replace content with skeleton, return restore function
   */
  showIn(container: HTMLElement, skeletonElement: HTMLElement): () => void {
    const originalContent = container.innerHTML;
    container.innerHTML = '';
    container.appendChild(skeletonElement);
    
    return () => {
      container.innerHTML = originalContent;
    };
  }
  
  /**
   * Fade out skeleton and show content
   */
  async revealContent(
    skeletonElement: HTMLElement, 
    contentElement: HTMLElement,
    container: HTMLElement
  ): Promise<void> {
    // Fade out skeleton
    await new Promise<void>(resolve => {
      skeletonElement.animate([
        { opacity: 1 },
        { opacity: 0 },
      ], {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }).onfinish = () => resolve();
    });
    
    // Remove skeleton
    skeletonElement.remove();
    
    // Add content (initially hidden)
    contentElement.style.opacity = '0';
    container.appendChild(contentElement);
    
    // Fade in content
    await new Promise<void>(resolve => {
      contentElement.animate([
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], {
        duration: DURATION.SLOW,
        easing: EASING.SPRING,
        fill: 'forwards',
      }).onfinish = () => resolve();
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let skeletonUIInstance: SkeletonUI | null = null;

export function getSkeletonUI(): SkeletonUI {
  if (!skeletonUIInstance) {
    skeletonUIInstance = new SkeletonUI();
  }
  return skeletonUIInstance;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const skeleton = {
  create: (config: SkeletonConfig) => getSkeletonUI().create(config),
  group: (config: SkeletonConfig) => getSkeletonUI().createGroup(config),
  card: () => getSkeletonUI().card(),
  listItem: () => getSkeletonUI().listItem(),
  teamMember: () => getSkeletonUI().teamMember(),
  conversation: () => getSkeletonUI().conversation(),
  stats: () => getSkeletonUI().stats(),
};

