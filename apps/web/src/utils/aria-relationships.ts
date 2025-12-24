/**
 * ARIA Relationship Utilities - Improved Accessibility
 *
 * Provides utilities for managing ARIA relationships between elements:
 * - aria-labelledby / aria-describedby connections
 * - aria-controls / aria-owns relationships
 * - Live region management
 * - Focus management for complex widgets
 *
 * These utilities ensure proper screen reader announcements and
 * relationships between interactive components.
 *
 * @module aria-relationships
 */

import { createLogger } from './logger';

const log = createLogger('ARIARelationships');

// ============================================================================
// ID GENERATION
// ============================================================================

let idCounter = 0;

/**
 * Generates a unique ID for ARIA relationships.
 * @param prefix Optional prefix for the ID.
 * @returns A unique ID string.
 */
export function generateAriaId(prefix: string = 'ferni-aria'): string {
  idCounter++;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
}

/**
 * Ensures an element has an ID, generating one if needed.
 * @param element The element to ensure has an ID.
 * @param prefix Optional prefix for generated ID.
 * @returns The element's ID.
 */
export function ensureId(element: HTMLElement, prefix: string = 'ferni'): string {
  if (!element.id) {
    element.id = generateAriaId(prefix);
  }
  return element.id;
}

// ============================================================================
// ARIA RELATIONSHIPS
// ============================================================================

/**
 * Connects an element to its label using aria-labelledby.
 * @param element The element to label.
 * @param labelElement The element that provides the label.
 */
export function connectLabel(element: HTMLElement, labelElement: HTMLElement): void {
  const labelId = ensureId(labelElement, 'label');
  const existing = element.getAttribute('aria-labelledby') || '';
  const ids = existing.split(' ').filter(Boolean);

  if (!ids.includes(labelId)) {
    ids.push(labelId);
    element.setAttribute('aria-labelledby', ids.join(' '));
  }

  log.debug('Label connected:', { element: element.id, label: labelId });
}

/**
 * Connects an element to its description using aria-describedby.
 * @param element The element to describe.
 * @param descriptionElement The element that provides the description.
 */
export function connectDescription(element: HTMLElement, descriptionElement: HTMLElement): void {
  const descId = ensureId(descriptionElement, 'desc');
  const existing = element.getAttribute('aria-describedby') || '';
  const ids = existing.split(' ').filter(Boolean);

  if (!ids.includes(descId)) {
    ids.push(descId);
    element.setAttribute('aria-describedby', ids.join(' '));
  }

  log.debug('Description connected:', { element: element.id, description: descId });
}

/**
 * Connects a control to the element it controls using aria-controls.
 * @param controlElement The controlling element (e.g., button).
 * @param controlledElement The element being controlled (e.g., panel).
 */
export function connectControls(controlElement: HTMLElement, controlledElement: HTMLElement): void {
  const controlledId = ensureId(controlledElement, 'controlled');
  const existing = controlElement.getAttribute('aria-controls') || '';
  const ids = existing.split(' ').filter(Boolean);

  if (!ids.includes(controlledId)) {
    ids.push(controlledId);
    controlElement.setAttribute('aria-controls', ids.join(' '));
  }

  log.debug('Controls connected:', { control: controlElement.id, controlled: controlledId });
}

/**
 * Creates a two-way relationship between a control and its controlled element.
 * Sets up aria-controls, aria-expanded, and manages visibility.
 * @param options Configuration for the relationship.
 */
export function createExpandableRelationship(options: {
  trigger: HTMLElement;
  content: HTMLElement;
  initialExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}): { toggle: () => void; setExpanded: (expanded: boolean) => void; cleanup: () => void } {
  const { trigger, content, initialExpanded = false, onToggle } = options;

  // Set up IDs
  const contentId = ensureId(content, 'expandable');

  // Set initial ARIA attributes
  trigger.setAttribute('aria-controls', contentId);
  trigger.setAttribute('aria-expanded', String(initialExpanded));
  content.setAttribute('aria-hidden', String(!initialExpanded));

  // If content has a heading, use it as label
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
  if (heading) {
    const headingId = ensureId(heading as HTMLElement, 'heading');
    content.setAttribute('aria-labelledby', headingId);
  }

  // Toggle function
  const setExpanded = (expanded: boolean) => {
    trigger.setAttribute('aria-expanded', String(expanded));
    content.setAttribute('aria-hidden', String(!expanded));
    onToggle?.(expanded);
  };

  const toggle = () => {
    const current = trigger.getAttribute('aria-expanded') === 'true';
    setExpanded(!current);
  };

  // Set up click handler
  trigger.addEventListener('click', toggle);

  // Cleanup function
  const cleanup = () => {
    trigger.removeEventListener('click', toggle);
  };

  log.debug('Expandable relationship created:', { trigger: trigger.id, content: contentId });

  return { toggle, setExpanded, cleanup };
}

// ============================================================================
// LIVE REGIONS
// ============================================================================

/** Map to track live region elements */
const liveRegions = new Map<string, HTMLElement>();

/**
 * Creates or gets a live region for screen reader announcements.
 * @param id Unique identifier for the live region.
 * @param politeness 'polite' (waits), 'assertive' (interrupts), or 'off'.
 * @returns The live region element.
 */
export function getLiveRegion(
  id: string = 'ferni-live',
  politeness: 'polite' | 'assertive' | 'off' = 'polite'
): HTMLElement {
  // Check if already exists
  if (liveRegions.has(id)) {
    return liveRegions.get(id)!;
  }

  // Check DOM
  let region = document.getElementById(id);
  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.cssText = `
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
    document.body.appendChild(region);
  }

  liveRegions.set(id, region);
  log.debug('Live region created:', { id, politeness });
  return region;
}

/**
 * Announces a message to screen readers via live region.
 * @param message The message to announce.
 * @param options Announcement options.
 */
export function announce(
  message: string,
  options: {
    politeness?: 'polite' | 'assertive';
    regionId?: string;
    clearAfter?: number;
  } = {}
): void {
  const { politeness = 'polite', regionId = 'ferni-live', clearAfter = 3000 } = options;

  const region = getLiveRegion(regionId, politeness);

  // Clear and re-add to trigger announcement
  region.textContent = '';
  
  // Use RAF to ensure the DOM change is processed
  requestAnimationFrame(() => {
    region.textContent = message;
    log.debug('Announced:', message);
  });

  // Clear after delay to allow re-announcement of same message
  if (clearAfter > 0) {
    setTimeout(() => {
      if (region.textContent === message) {
        region.textContent = '';
      }
    }, clearAfter);
  }
}

/**
 * Creates a status message region for form validation, etc.
 * @param container The container to add the status region to.
 * @returns Object with update and clear methods.
 */
export function createStatusRegion(container: HTMLElement): {
  update: (message: string, type?: 'info' | 'error' | 'success') => void;
  clear: () => void;
  element: HTMLElement;
} {
  const status = document.createElement('div');
  status.id = generateAriaId('status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = 'form-status';
  container.appendChild(status);

  const update = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    status.textContent = message;
    status.className = `form-status form-status--${type}`;
    status.setAttribute('aria-hidden', 'false');
  };

  const clear = () => {
    status.textContent = '';
    status.setAttribute('aria-hidden', 'true');
  };

  return { update, clear, element: status };
}

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

/**
 * Gets all focusable elements within a container.
 * @param container The container to search.
 * @returns Array of focusable elements.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(el => {
    return el.offsetParent !== null; // Visible
  });
}

/**
 * Creates a roving tabindex for a group of elements.
 * Only one element in the group is tabbable at a time.
 * @param elements The group of elements.
 * @param options Configuration options.
 */
export function createRovingTabindex(
  elements: HTMLElement[],
  options: {
    initialIndex?: number;
    orientation?: 'horizontal' | 'vertical' | 'both';
    wrap?: boolean;
    onFocusChange?: (index: number, element: HTMLElement) => void;
  } = {}
): { setFocus: (index: number) => void; cleanup: () => void } {
  const { initialIndex = 0, orientation = 'both', wrap = true, onFocusChange } = options;

  let currentIndex = initialIndex;

  // Initialize tabindex
  elements.forEach((el, i) => {
    el.setAttribute('tabindex', i === currentIndex ? '0' : '-1');
  });

  const setFocus = (index: number) => {
    // Clamp or wrap index
    if (wrap) {
      index = (index + elements.length) % elements.length;
    } else {
      index = Math.max(0, Math.min(index, elements.length - 1));
    }

    // Update tabindex
    elements[currentIndex].setAttribute('tabindex', '-1');
    elements[index].setAttribute('tabindex', '0');
    elements[index].focus();
    currentIndex = index;

    onFocusChange?.(index, elements[index]);
  };

  // Keyboard handler
  const handleKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const index = elements.indexOf(target);
    if (index === -1) return;

    let newIndex = index;
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';
    const isVertical = orientation === 'vertical' || orientation === 'both';

    switch (e.key) {
      case 'ArrowLeft':
        if (isHorizontal) {
          e.preventDefault();
          newIndex = index - 1;
        }
        break;
      case 'ArrowRight':
        if (isHorizontal) {
          e.preventDefault();
          newIndex = index + 1;
        }
        break;
      case 'ArrowUp':
        if (isVertical) {
          e.preventDefault();
          newIndex = index - 1;
        }
        break;
      case 'ArrowDown':
        if (isVertical) {
          e.preventDefault();
          newIndex = index + 1;
        }
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = elements.length - 1;
        break;
    }

    if (newIndex !== index) {
      setFocus(newIndex);
    }
  };

  // Attach handlers
  elements.forEach(el => {
    el.addEventListener('keydown', handleKeydown);
  });

  const cleanup = () => {
    elements.forEach(el => {
      el.removeEventListener('keydown', handleKeydown);
    });
  };

  log.debug('Roving tabindex created:', { count: elements.length, orientation });

  return { setFocus, cleanup };
}

// ============================================================================
// DIALOG / MODAL ARIA
// ============================================================================

/**
 * Sets up proper ARIA attributes for a modal dialog.
 * @param dialog The dialog element.
 * @param options Configuration options.
 */
export function setupDialogAria(
  dialog: HTMLElement,
  options: {
    labelledBy?: string;
    describedBy?: string;
    modal?: boolean;
  } = {}
): void {
  const { labelledBy, describedBy, modal = true } = options;

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', String(modal));

  if (labelledBy) {
    dialog.setAttribute('aria-labelledby', labelledBy);
  }

  if (describedBy) {
    dialog.setAttribute('aria-describedby', describedBy);
  }

  log.debug('Dialog ARIA setup:', { dialog: dialog.id, modal });
}

/**
 * Manages aria-hidden on the main content when a modal is open.
 * @param mainContent The main content element to hide.
 * @param isModalOpen Whether a modal is currently open.
 */
export function setMainContentHidden(mainContent: HTMLElement, isModalOpen: boolean): void {
  if (isModalOpen) {
    mainContent.setAttribute('aria-hidden', 'true');
    mainContent.setAttribute('inert', '');
  } else {
    mainContent.removeAttribute('aria-hidden');
    mainContent.removeAttribute('inert');
  }

  log.debug('Main content aria-hidden:', isModalOpen);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleans up all live regions created by this module.
 */
export function cleanup(): void {
  liveRegions.forEach((region) => {
    region.remove();
  });
  liveRegions.clear();
  log.debug('ARIA utilities cleaned up');
}

