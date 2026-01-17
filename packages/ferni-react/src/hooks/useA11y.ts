import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// useReducedMotion
// =============================================================================

/**
 * Hook to detect reduced motion preference
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

// =============================================================================
// useHighContrast
// =============================================================================

/**
 * Hook to detect high contrast preference
 */
export function useHighContrast(): boolean {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    setHighContrast(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setHighContrast(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return highContrast;
}

// =============================================================================
// useFocusTrap
// =============================================================================

/**
 * Hook to trap focus within a container
 */
export function useFocusTrap<T extends HTMLElement>(isActive: boolean = true): React.RefObject<T | null> {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    
    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelector)
    ).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element
    firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}

// =============================================================================
// useAnnounce
// =============================================================================

/**
 * Hook for screen reader announcements
 */
export function useAnnounce(): (message: string, priority?: 'polite' | 'assertive') => void {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', priority);
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    
    document.body.appendChild(el);
    
    setTimeout(() => {
      el.textContent = message;
    }, 100);
    
    setTimeout(() => {
      el.remove();
    }, 1000);
  }, []);

  return announce;
}

// =============================================================================
// useKeyboardNav
// =============================================================================

interface UseKeyboardNavOptions {
  /** Selector for navigable items */
  selector?: string;
  /** Whether to loop at ends */
  loop?: boolean;
  /** Navigation orientation */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /** Callback when selection changes */
  onSelect?: (index: number, element: HTMLElement) => void;
}

/**
 * Hook for keyboard navigation in lists
 */
export function useKeyboardNav<T extends HTMLElement>(
  options: UseKeyboardNavOptions = {}
): React.RefObject<T | null> {
  const { 
    selector = '[role="option"], button, a', 
    loop = true, 
    orientation = 'vertical',
    onSelect 
  } = options;

  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      
      switch (e.key) {
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            nextIndex = currentIndex + 1;
            e.preventDefault();
          }
          break;
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            nextIndex = currentIndex - 1;
            e.preventDefault();
          }
          break;
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            nextIndex = currentIndex + 1;
            e.preventDefault();
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            nextIndex = currentIndex - 1;
            e.preventDefault();
          }
          break;
        case 'Home':
          nextIndex = 0;
          e.preventDefault();
          break;
        case 'End':
          nextIndex = items.length - 1;
          e.preventDefault();
          break;
        case 'Enter':
        case ' ':
          onSelect?.(currentIndex, items[currentIndex]);
          e.preventDefault();
          return;
      }

      if (loop) {
        if (nextIndex >= items.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = items.length - 1;
      } else {
        nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
      }

      items[nextIndex]?.focus();
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [selector, loop, orientation, onSelect]);

  return containerRef;
}

// =============================================================================
// useAccessibleDuration
// =============================================================================

/**
 * Hook to get animation duration respecting reduced motion
 */
export function useAccessibleDuration(duration: number): number {
  const reducedMotion = useReducedMotion();
  return reducedMotion ? 0 : duration;
}

// =============================================================================
// VisuallyHidden Component
// =============================================================================

interface VisuallyHiddenProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Visually hidden content for screen readers
 */
export const VisuallyHidden: React.FC<VisuallyHiddenProps> = ({ 
  children, 
  as: Component = 'span' 
}) => {
  return React.createElement(Component, {
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: 0,
    },
  }, children);
};

// Re-export for convenience
import React from 'react';
export { React };
