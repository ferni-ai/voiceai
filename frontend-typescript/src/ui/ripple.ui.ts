/**
 * Ripple UI - Material Design-inspired click ripples
 * 
 * Adds satisfying ripple effects to buttons and interactive elements.
 */

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initRippleUI(): void {
  if (isInitialized) return;
  
  // Add click listener to document
  document.addEventListener('click', handleClick);
  
  isInitialized = true;
  console.log('💧 Ripple UI initialized');
}

// ============================================================================
// RIPPLE CREATION
// ============================================================================

function handleClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  
  // Find ripple-able element
  const rippleTarget = target.closest('.btn, .team-member') as HTMLElement;
  if (!rippleTarget) return;
  
  // Don't ripple disabled elements
  if (rippleTarget.matches(':disabled')) return;
  
  createRipple(rippleTarget, e);
}

function createRipple(element: HTMLElement, event: MouseEvent): void {
  // Get element dimensions
  const rect = element.getBoundingClientRect();
  
  // Calculate ripple size (diagonal of element)
  const size = Math.max(rect.width, rect.height) * 2;
  
  // Calculate click position relative to element
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;
  
  // Create ripple element
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  
  // Add to element
  element.appendChild(ripple);
  
  // Remove after animation
  setTimeout(() => {
    ripple.remove();
  }, 600);
}

/**
 * Manually trigger a ripple at element center
 */
export function triggerRipple(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const fakeEvent = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  } as MouseEvent;
  
  createRipple(element, fakeEvent);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('click', handleClick);
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const rippleUI = {
  init: initRippleUI,
  trigger: triggerRipple,
  dispose,
};

