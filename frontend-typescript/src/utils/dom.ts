/**
 * DOM Utilities
 * 
 * Type-safe DOM manipulation helpers.
 */

// ============================================================================
// ELEMENT QUERIES
// ============================================================================

/**
 * Get an element by ID with type assertion.
 * Throws if element not found.
 */
export function getElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

/**
 * Get an element by ID, returning null if not found.
 */
export function getElementByIdOrNull<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Query selector with type assertion.
 */
export function querySelector<T extends Element>(
  selector: string,
  parent: ParentNode = document
): T {
  const element = parent.querySelector(selector);
  if (!element) {
    throw new Error(`Element matching "${selector}" not found`);
  }
  return element as T;
}

/**
 * Query selector, returning null if not found.
 */
export function querySelectorOrNull<T extends Element>(
  selector: string,
  parent: ParentNode = document
): T | null {
  return parent.querySelector(selector);
}

/**
 * Query all matching elements.
 */
export function querySelectorAll<T extends Element>(
  selector: string,
  parent: ParentNode = document
): T[] {
  return Array.from(parent.querySelectorAll(selector));
}

// ============================================================================
// CLASS MANIPULATION
// ============================================================================

/**
 * Add one or more classes to an element.
 */
export function addClass(element: Element, ...classes: string[]): void {
  element.classList.add(...classes);
}

/**
 * Remove one or more classes from an element.
 */
export function removeClass(element: Element, ...classes: string[]): void {
  element.classList.remove(...classes);
}

/**
 * Toggle a class on an element.
 */
export function toggleClass(element: Element, className: string, force?: boolean): boolean {
  return element.classList.toggle(className, force);
}

/**
 * Set multiple classes based on a condition map.
 */
export function setClasses(
  element: Element,
  classMap: Record<string, boolean>
): void {
  for (const [className, enabled] of Object.entries(classMap)) {
    element.classList.toggle(className, enabled);
  }
}

// ============================================================================
// ATTRIBUTE MANIPULATION
// ============================================================================

/**
 * Set an attribute, removing it if value is null/undefined.
 */
export function setAttribute(
  element: Element,
  name: string,
  value: string | null | undefined
): void {
  if (value == null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

/**
 * Set multiple attributes at once.
 */
export function setAttributes(
  element: Element,
  attributes: Record<string, string | null | undefined>
): void {
  for (const [name, value] of Object.entries(attributes)) {
    setAttribute(element, name, value);
  }
}

// ============================================================================
// TEXT CONTENT
// ============================================================================

/**
 * Set text content of an element.
 */
export function setText(element: Element, text: string): void {
  element.textContent = text;
}

/**
 * Set HTML content of an element (use with caution).
 */
export function setHTML(element: Element, html: string): void {
  element.innerHTML = html;
}

// ============================================================================
// VISIBILITY
// ============================================================================

/**
 * Show an element (remove display: none).
 */
export function show(element: HTMLElement, display = 'block'): void {
  element.style.display = display;
}

/**
 * Hide an element (set display: none).
 */
export function hide(element: HTMLElement): void {
  element.style.display = 'none';
}

/**
 * Toggle element visibility.
 */
export function toggleVisibility(element: HTMLElement, visible?: boolean): void {
  if (visible === undefined) {
    element.style.display = element.style.display === 'none' ? '' : 'none';
  } else {
    element.style.display = visible ? '' : 'none';
  }
}

// ============================================================================
// ELEMENT CREATION
// ============================================================================

/**
 * Create an element with optional attributes and children.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    id?: string;
    classes?: string[];
    attributes?: Record<string, string>;
    text?: string;
    children?: Node[];
  }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options?.id) {
    element.id = options.id;
  }

  if (options?.classes) {
    element.classList.add(...options.classes);
  }

  if (options?.attributes) {
    setAttributes(element, options.attributes);
  }

  if (options?.text) {
    element.textContent = options.text;
  }

  if (options?.children) {
    element.append(...options.children);
  }

  return element;
}

// ============================================================================
// EVENT HELPERS
// ============================================================================

/**
 * Add event listener with automatic cleanup support.
 */
export function addListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions
): () => void {
  element.addEventListener(event, handler as EventListener, options);
  return () => element.removeEventListener(event, handler as EventListener, options);
}

/**
 * Add a one-time event listener.
 */
export function addOnceListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void
): () => void {
  return addListener(element, event, handler, { once: true });
}

