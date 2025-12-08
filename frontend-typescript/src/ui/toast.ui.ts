/**
 * Toast Notification UI
 * 
 * Warm, human toast notifications that feel like gentle updates
 * rather than interruptions.
 * 
 * @module @ferni/toast
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { HapticsService } from '../services/haptics.service.js';

const log = createLogger('ToastUI');

// ============================================================================
// TYPES
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'persona';

export interface ToastConfig {
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;        // ms, 0 = persistent
  dismissible?: boolean;
  icon?: string;            // Lucide icon name or custom SVG
  action?: {
    label: string;
    onClick: () => void;
  };
  personaId?: string;       // For persona-themed toasts
}

interface ActiveToast {
  id: string;
  element: HTMLElement;
  config: ToastConfig;
  timeout?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const TOAST_ICONS: Record<string, string> = {
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ============================================================================
// TYPE STYLES
// ============================================================================

const TYPE_COLORS: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  info: {
    bg: 'var(--color-background-elevated, #FFFDFB)',
    border: 'var(--color-border, #d4cfc7)',
    icon: 'var(--color-text-secondary, #70605a)',
    text: 'var(--color-text-primary, #2C2520)',
  },
  success: {
    bg: 'rgba(74, 103, 65, 0.08)',
    border: 'rgba(74, 103, 65, 0.2)',
    icon: '#4a6741',
    text: 'var(--color-text-primary, #2C2520)',
  },
  warning: {
    bg: 'rgba(184, 149, 106, 0.08)',
    border: 'rgba(184, 149, 106, 0.2)',
    icon: '#b8956a',
    text: 'var(--color-text-primary, #2C2520)',
  },
  error: {
    bg: 'rgba(166, 90, 82, 0.08)',
    border: 'rgba(166, 90, 82, 0.2)',
    icon: '#a65a52',
    text: 'var(--color-text-primary, #2C2520)',
  },
  persona: {
    bg: 'var(--color-background-elevated, #FFFDFB)',
    border: 'var(--persona-primary, #4a6741)',
    icon: 'var(--persona-primary, #4a6741)',
    text: 'var(--color-text-primary, #2C2520)',
  },
};

// ============================================================================
// TOAST MANAGER
// ============================================================================

export class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Map<string, ActiveToast> = new Map();
  private idCounter: number = 0;
  private maxVisible: number = 3;
  private haptics = HapticsService.getInstance();
  
  constructor() {
    this.cleanupOrphanedElements();
    this.createContainer();
    log.debug('ToastManager initialized');
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.ferni-toast-container').forEach(el => el.remove());
  }
  
  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'ferni-toast-container';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notifications');
    
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: 'var(--space-6, 24px)',
      right: 'var(--space-6, 24px)',
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 'var(--space-3, 12px)',
      zIndex: '9999',
      pointerEvents: 'none',
      maxWidth: '400px',
      width: 'calc(100vw - 48px)',
    });
    
    document.body.appendChild(this.container);
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
   * Show a toast notification
   */
  show(config: ToastConfig): string {
    const id = `toast-${++this.idCounter}`;
    
    // Remove oldest if at max
    if (this.toasts.size >= this.maxVisible) {
      const oldest = this.toasts.values().next().value;
      if (oldest) {
        this.dismiss(oldest.id);
      }
    }
    
    // Create toast element
    const element = this.createToastElement(id, config);
    
    // Add to container
    this.container?.appendChild(element);
    
    // Animate in
    this.animateIn(element);
    
    // Auto dismiss
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const duration = config.duration ?? 4000;
    if (duration > 0) {
      timeout = setTimeout(() => this.dismiss(id), duration);
    }
    
    // Track toast
    this.toasts.set(id, { id, element, config, timeout });
    
    // Haptic feedback
    this.playHaptic(config.type);
    
    log.debug('Toast shown', { id, type: config.type });
    
    return id;
  }
  
  /**
   * Dismiss a toast
   */
  async dismiss(id: string): Promise<void> {
    const toast = this.toasts.get(id);
    if (!toast) return;
    
    // Clear timeout
    if (toast.timeout) {
      clearTimeout(toast.timeout);
    }
    
    // Animate out
    await this.animateOut(toast.element);
    
    // Remove from DOM
    toast.element.remove();
    
    // Remove from map
    this.toasts.delete(id);
    
    log.debug('Toast dismissed', { id });
  }
  
  /**
   * Dismiss all toasts
   */
  async dismissAll(): Promise<void> {
    const dismissPromises = Array.from(this.toasts.keys()).map(id => this.dismiss(id));
    await Promise.all(dismissPromises);
  }
  
  /**
   * Quick toast helpers
   */
  info(message: string, title?: string): string {
    return this.show({ type: 'info', message, title });
  }
  
  success(message: string, title?: string): string {
    return this.show({ type: 'success', message, title });
  }
  
  warning(message: string, title?: string): string {
    return this.show({ type: 'warning', message, title });
  }
  
  error(message: string, title?: string): string {
    return this.show({ type: 'error', message, title, duration: 6000 });
  }
  
  /**
   * Persona-themed toast
   */
  fromPersona(personaId: string, message: string, title?: string): string {
    return this.show({ type: 'persona', message, title, personaId });
  }
  
  // ==========================================================================
  // ELEMENT CREATION
  // ==========================================================================
  
  private createToastElement(id: string, config: ToastConfig): HTMLElement {
    const colors = TYPE_COLORS[config.type];
    
    const toast = document.createElement('div');
    toast.className = `ferni-toast ferni-toast--${config.type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.dataset.toastId = id;
    
    Object.assign(toast.style, {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3, 12px)',
      padding: 'var(--space-4, 16px)',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 'var(--radius-lg, 12px)',
      boxShadow: 'var(--shadow-lg)',
      fontFamily: 'var(--font-body)',
      pointerEvents: 'auto',
      opacity: '0',
      transform: 'translateX(100%) scale(0.95)',
      maxWidth: '100%',
    });
    
    // Icon
    const iconHtml = config.icon || TOAST_ICONS[config.type] || TOAST_ICONS.info;
    const iconContainer = document.createElement('div');
    iconContainer.className = 'toast-icon';
    iconContainer.innerHTML = iconHtml;
    iconContainer.style.color = colors.icon;
    iconContainer.style.flexShrink = '0';
    iconContainer.style.marginTop = '2px';
    toast.appendChild(iconContainer);
    
    // Content
    const content = document.createElement('div');
    content.className = 'toast-content';
    content.style.flex = '1';
    content.style.minWidth = '0';
    
    if (config.title) {
      const title = document.createElement('div');
      title.className = 'toast-title';
      title.textContent = config.title;
      Object.assign(title.style, {
        fontWeight: '600',
        fontSize: '14px',
        color: colors.text,
        marginBottom: '2px',
      });
      content.appendChild(title);
    }
    
    const message = document.createElement('div');
    message.className = 'toast-message';
    message.textContent = config.message;
    Object.assign(message.style, {
      fontSize: '14px',
      lineHeight: '1.4',
      color: 'var(--color-text-secondary, #70605a)',
    });
    content.appendChild(message);
    
    // Action button
    if (config.action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.textContent = config.action.label;
      Object.assign(actionBtn.style, {
        marginTop: 'var(--space-2, 8px)',
        padding: '6px 12px',
        background: 'transparent',
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-full, 9999px)',
        fontSize: '13px',
        fontWeight: '500',
        color: colors.icon,
        cursor: 'pointer',
        transition: `all ${DURATION.FAST}ms ${EASING.STANDARD}`,
      });
      
      actionBtn.addEventListener('mouseenter', () => {
        actionBtn.style.background = colors.bg;
        actionBtn.style.borderColor = colors.icon;
      });
      
      actionBtn.addEventListener('mouseleave', () => {
        actionBtn.style.background = 'transparent';
        actionBtn.style.borderColor = colors.border;
      });
      
      actionBtn.addEventListener('click', () => {
        config.action?.onClick();
        this.dismiss(id);
      });
      
      content.appendChild(actionBtn);
    }
    
    toast.appendChild(content);
    
    // Close button
    if (config.dismissible !== false) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close';
      closeBtn.innerHTML = TOAST_ICONS.close;
      closeBtn.setAttribute('aria-label', 'Dismiss notification');
      
      Object.assign(closeBtn.style, {
        padding: '4px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm, 4px)',
        color: 'var(--color-text-muted, #9a8a7a)',
        cursor: 'pointer',
        flexShrink: '0',
        transition: `all ${DURATION.FAST}ms ${EASING.STANDARD}`,
      });
      
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = 'var(--color-text-primary, #2C2520)';
        closeBtn.style.background = 'var(--color-background-secondary, #f5f1e8)';
      });
      
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = 'var(--color-text-muted, #9a8a7a)';
        closeBtn.style.background = 'transparent';
      });
      
      closeBtn.addEventListener('click', () => this.dismiss(id));
      
      toast.appendChild(closeBtn);
    }
    
    return toast;
  }
  
  // ==========================================================================
  // ANIMATIONS
  // ==========================================================================
  
  private async animateIn(element: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      element.animate([
        { opacity: 0, transform: 'translateX(100%) scale(0.95)' },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ], {
        duration: DURATION.SLOW,
        easing: EASING.SPRING,
        fill: 'forwards',
      }).onfinish = () => resolve();
    });
  }
  
  private async animateOut(element: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      element.animate([
        { opacity: 1, transform: 'translateX(0) scale(1)' },
        { opacity: 0, transform: 'translateX(100%) scale(0.95)' },
      ], {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }).onfinish = () => resolve();
    });
  }
  
  // ==========================================================================
  // HAPTICS
  // ==========================================================================
  
  private playHaptic(type: ToastType): void {
    switch (type) {
      case 'success':
        this.haptics.play('success');
        break;
      case 'error':
        this.haptics.play('error');
        break;
      case 'warning':
        this.haptics.play('notification');
        break;
      default:
        this.haptics.play('softTap');
    }
  }
  
  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  
  destroy(): void {
    this.dismissAll();
    this.container?.remove();
    this.container = null;
    log.debug('ToastManager destroyed');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let toastManagerInstance: ToastManager | null = null;

export function getToastManager(): ToastManager {
  if (!toastManagerInstance) {
    toastManagerInstance = new ToastManager();
  }
  return toastManagerInstance;
}

export function resetToastManager(): void {
  if (toastManagerInstance) {
    toastManagerInstance.destroy();
  }
  toastManagerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const showToast = (config: ToastConfig) => getToastManager().show(config);
export const dismissToast = (id: string) => getToastManager().dismiss(id);
export const dismissAllToasts = () => getToastManager().dismissAll();
export const toast = {
  info: (message: string, title?: string) => getToastManager().info(message, title),
  success: (message: string, title?: string) => getToastManager().success(message, title),
  warning: (message: string, title?: string) => getToastManager().warning(message, title),
  error: (message: string, title?: string) => getToastManager().error(message, title),
  fromPersona: (personaId: string, message: string, title?: string) => 
    getToastManager().fromPersona(personaId, message, title),
};
