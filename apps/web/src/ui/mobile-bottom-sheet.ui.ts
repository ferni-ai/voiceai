/**
 * Mobile Bottom Sheet UI
 *
 * A clean, iOS-style bottom sheet for mobile settings access.
 * Part of the "Zen Mobile Mode" - keeping the main screen focused
 * while providing easy access to features via swipe-up gesture.
 *
 * Philosophy: On mobile, Ferni should feel like texting a friend.
 * Hide the dashboard complexity, reveal on demand.
 */

import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface BottomSheetAction {
  id: string;
  iconPath: string;
  label: string;
  onClick: () => void;
  /** Optional accent color for the icon */
  color?: string;
}

interface BottomSheetState {
  isOpen: boolean;
  isDragging: boolean;
  startY: number;
  currentY: number;
}

// ============================================================================
// STATE
// ============================================================================

let sheetElement: HTMLElement | null = null;
let backdropElement: HTMLElement | null = null;
let handleElement: HTMLElement | null = null;
let actionsContainer: HTMLElement | null = null;
let isInitialized = false;

const state: BottomSheetState = {
  isOpen: false,
  isDragging: false,
  startY: 0,
  currentY: 0,
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
/* Mobile Bottom Sheet - iOS-style slide-up panel */
.mobile-bottom-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--duration-slow, 0.3s) ease, visibility var(--duration-slow, 0.3s) ease;
  z-index: var(--z-modal-backdrop, 2000);
  touch-action: none;
}

.mobile-bottom-sheet-backdrop.open {
  opacity: 1;
  visibility: visible;
}

.mobile-bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-elevated, #2a2520);
  border-radius: 20px 20px 0 0;
  transform: translateY(100%);
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: var(--z-modal, 2100);
  max-height: 70vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg, 0 -4px 32px rgba(0, 0, 0, 0.3));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mobile-bottom-sheet.open {
  transform: translateY(0);
}

.mobile-bottom-sheet.dragging {
  transition: none;
}

/* Drag handle */
.mobile-bottom-sheet__handle {
  display: flex;
  justify-content: center;
  padding: 12px 0 8px;
  cursor: grab;
  touch-action: none;
}

.mobile-bottom-sheet__handle::before {
  content: '';
  width: 36px;
  height: 4px;
  background: var(--color-text-muted, var(--color-border-subtle, rgba(255,255,255,0.3)));
  border-radius: 2px;
}

.mobile-bottom-sheet__handle:active {
  cursor: grabbing;
}

/* Content */
.mobile-bottom-sheet__content {
  padding: 8px 20px 24px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  max-height: calc(70vh - 60px);
}

/* Title */
.mobile-bottom-sheet__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary, rgba(255,255,255,0.7));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
  padding: 0 4px;
}

/* Action grid */
.mobile-bottom-sheet__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

/* Individual action button */
.mobile-bottom-sheet__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-md, 16px) var(--space-sm, 8px);
  border: none;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 16px);
  cursor: pointer;
  transition: background var(--duration-fast, 0.2s) ease, transform var(--duration-fast, 0.15s) ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-bottom-sheet__action:hover,
.mobile-bottom-sheet__action:focus-visible {
  background: var(--color-bg-glass);
  outline: none;
}

.mobile-bottom-sheet__action:focus-visible {
  box-shadow: 0 0 0 2px var(--color-accent-primary, var(--color-ferni));
}

.mobile-bottom-sheet__action:active {
  transform: scale(0.95);
  background: var(--color-bg-glass);
}

.mobile-bottom-sheet__action-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-bottom-sheet__action-icon svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mobile-bottom-sheet__action-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.2;
}

/* Only show on mobile */
@media (min-width: 769px) {
  .mobile-bottom-sheet,
  .mobile-bottom-sheet-backdrop,
  .mobile-menu-trigger {
    display: none !important;
  }
}

/* Menu trigger button (floating) */
.mobile-menu-trigger {
  position: fixed;
  bottom: calc(var(--space-lg, 26px) + env(safe-area-inset-bottom, 0px));
  left: var(--space-md, 16px);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: var(--z-floating, 20);
  transition: transform var(--duration-fast, 0.2s) ease, box-shadow var(--duration-fast, 0.2s) ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-menu-trigger:hover,
.mobile-menu-trigger:focus-visible {
  transform: scale(1.05);
  box-shadow: var(--shadow-lg, 0 6px 20px rgba(0, 0, 0, 0.3));
  outline: none;
}

.mobile-menu-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--color-accent-primary, var(--color-ferni));
}

.mobile-menu-trigger:active {
  transform: scale(0.95);
}

.mobile-menu-trigger svg {
  width: 20px;
  height: 20px;
  color: var(--color-text-primary);
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* Hide trigger when sheet is open */
.mobile-menu-trigger.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .mobile-bottom-sheet,
  .mobile-bottom-sheet-backdrop,
  .mobile-menu-trigger,
  .mobile-bottom-sheet__action {
    transition: none;
  }
}
`;

// ============================================================================
// SVG ICON CREATION (Safe DOM methods)
// ============================================================================

function createSvgIcon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // Parse path data and create elements
  const paths = pathData.split('|');
  for (const p of paths) {
    const trimmed = p.trim();
    if (trimmed.startsWith('M') || trimmed.startsWith('m')) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', trimmed);
      svg.appendChild(path);
    } else if (trimmed.startsWith('circle:')) {
      const params = trimmed.replace('circle:', '').split(',');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', params[0]);
      circle.setAttribute('cy', params[1]);
      circle.setAttribute('r', params[2]);
      svg.appendChild(circle);
    } else if (trimmed.startsWith('rect:')) {
      const params = trimmed.replace('rect:', '').split(',');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', params[0]);
      rect.setAttribute('y', params[1]);
      rect.setAttribute('width', params[2]);
      rect.setAttribute('height', params[3]);
      if (params[4]) rect.setAttribute('rx', params[4]);
      if (params[5]) rect.setAttribute('ry', params[5]);
      svg.appendChild(rect);
    } else if (trimmed.startsWith('line:')) {
      const params = trimmed.replace('line:', '').split(',');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', params[0]);
      line.setAttribute('y1', params[1]);
      line.setAttribute('x2', params[2]);
      line.setAttribute('y2', params[3]);
      svg.appendChild(line);
    } else if (trimmed.startsWith('polyline:')) {
      const points = trimmed.replace('polyline:', '');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points);
      svg.appendChild(polyline);
    }
  }

  return svg;
}

// Icon path data (safe string format)
const ICON_PATHS = {
  // Grid icon (quick actions) - 2x2 rounded squares, not hamburger menu
  menu: 'rect:3,3,7,7,1,1|rect:14,3,7,7,1,1|rect:3,14,7,7,1,1|rect:14,14,7,7,1,1',
  settings: 'circle:12,12,3|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|circle:9,7,4|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  music: 'M9 18V5l12-2v13|circle:6,18,3|circle:18,16,3',
  calendar: 'rect:3,4,18,18,2,2|line:16,2,16,6|line:8,2,8,6|line:3,10,21,10',
  history: 'circle:12,12,10|polyline:12,6,12,12,16,14',
  people: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|circle:12,7,4',
  insights: 'M21.21 15.89A10 10 0 1 1 8 2.83|M22 12A10 10 0 0 0 12 2v10z',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the mobile bottom sheet UI.
 * Should be called once when the app starts.
 */
export function initMobileBottomSheet(): void {
  if (isInitialized) return;

  // Only initialize on mobile
  if (window.innerWidth > 768) {
    // Still listen for resize in case viewport changes
    window.addEventListener('resize', handleResize);
    return;
  }

  injectStyles();
  createElements();
  setupEventListeners();
  isInitialized = true;
}

function handleResize(): void {
  // Initialize on resize to mobile if not already initialized
  if (window.innerWidth <= 768 && !isInitialized) {
    injectStyles();
    createElements();
    setupEventListeners();
    isInitialized = true;
  }

  // Close sheet if rotated to desktop (prevents locked scroll)
  if (window.innerWidth > 768 && state.isOpen) {
    close();
  }
}

function injectStyles(): void {
  if (document.getElementById('mobile-bottom-sheet-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'mobile-bottom-sheet-styles';
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);
}

function createElements(): void {
  // Create backdrop
  backdropElement = document.createElement('div');
  backdropElement.className = 'mobile-bottom-sheet-backdrop';
  backdropElement.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdropElement);

  // Create sheet with proper dialog semantics
  sheetElement = document.createElement('div');
  sheetElement.className = 'mobile-bottom-sheet';
  sheetElement.setAttribute('role', 'dialog');
  sheetElement.setAttribute('aria-modal', 'true');
  sheetElement.setAttribute('aria-labelledby', 'mobile-sheet-title');
  sheetElement.setAttribute('aria-hidden', 'true');

  // Create handle (accessible drag indicator)
  handleElement = document.createElement('div');
  handleElement.className = 'mobile-bottom-sheet__handle';
  handleElement.setAttribute('role', 'button');
  handleElement.setAttribute('aria-label', t('menu.mobileSheet.dragToClose'));
  handleElement.setAttribute('tabindex', '0');
  sheetElement.appendChild(handleElement);

  // Create content container
  const content = document.createElement('div');
  content.className = 'mobile-bottom-sheet__content';

  // Create title with ID for aria-labelledby
  const title = document.createElement('div');
  title.className = 'mobile-bottom-sheet__title';
  title.id = 'mobile-sheet-title';
  title.textContent = t('menu.mobileSheet.title');
  content.appendChild(title);

  // Create actions container with grid role
  actionsContainer = document.createElement('div');
  actionsContainer.className = 'mobile-bottom-sheet__actions';
  actionsContainer.setAttribute('role', 'group');
  actionsContainer.setAttribute('aria-label', t('menu.mobileSheet.title'));
  content.appendChild(actionsContainer);

  sheetElement.appendChild(content);
  document.body.appendChild(sheetElement);

  // Create floating menu trigger
  const trigger = document.createElement('button');
  trigger.className = 'mobile-menu-trigger';
  trigger.setAttribute('aria-label', t('menu.mobileSheet.openMenu'));
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.appendChild(createSvgIcon(ICON_PATHS.menu));
  document.body.appendChild(trigger);

  // Populate default actions
  populateActions(getDefaultActions());
}

function setupEventListeners(): void {
  // Trigger button
  const trigger = document.querySelector('.mobile-menu-trigger');
  if (trigger) {
    trigger.addEventListener('click', open);
  }

  // Backdrop click to close
  if (backdropElement) {
    backdropElement.addEventListener('click', close);
  }

  // Handle drag
  if (handleElement) {
    handleElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    handleElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    handleElement.addEventListener('touchend', handleTouchEnd);
  }

  // Keyboard handling: Escape to close, Tab for focus trap
  document.addEventListener('keydown', handleKeyDown);

  // Handle enter/space on drag handle to close
  if (handleElement) {
    handleElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        close();
      }
    });
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (!state.isOpen) return;

  // Escape to close
  if (e.key === 'Escape') {
    close();
    return;
  }

  // Focus trap: cycle focus within the sheet
  if (e.key === 'Tab' && sheetElement) {
    const focusableElements = sheetElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

function getDefaultActions(): BottomSheetAction[] {
  return [
    {
      id: 'settings',
      iconPath: ICON_PATHS.settings,
      label: t('menu.mobileSheet.actions.settings'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-settings'));
      },
    },
    {
      id: 'team',
      iconPath: ICON_PATHS.team,
      label: t('menu.mobileSheet.actions.team'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-team'));
      },
    },
    {
      id: 'music',
      iconPath: ICON_PATHS.music,
      label: t('menu.mobileSheet.actions.music'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-music'));
      },
    },
    {
      id: 'calendar',
      iconPath: ICON_PATHS.calendar,
      label: t('menu.mobileSheet.actions.calendar'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-calendar'));
      },
    },
    {
      id: 'history',
      iconPath: ICON_PATHS.history,
      label: t('menu.mobileSheet.actions.history'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-history'));
      },
    },
    {
      id: 'people',
      iconPath: ICON_PATHS.people,
      label: t('menu.mobileSheet.actions.people'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-people'));
      },
    },
    {
      id: 'insights',
      iconPath: ICON_PATHS.insights,
      label: t('menu.mobileSheet.actions.insights'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-insights'));
      },
    },
  ];
}

function populateActions(actions: BottomSheetAction[]): void {
  if (!actionsContainer) return;

  // Clear existing actions
  while (actionsContainer.firstChild) {
    actionsContainer.removeChild(actionsContainer.firstChild);
  }

  for (const action of actions) {
    const button = document.createElement('button');
    button.className = 'mobile-bottom-sheet__action';
    button.setAttribute('data-action', action.id);

    // Create icon container
    const iconContainer = document.createElement('span');
    iconContainer.className = 'mobile-bottom-sheet__action-icon';
    if (action.color) {
      iconContainer.style.color = action.color;
    }
    iconContainer.appendChild(createSvgIcon(action.iconPath));
    button.appendChild(iconContainer);

    // Create label
    const label = document.createElement('span');
    label.className = 'mobile-bottom-sheet__action-label';
    label.textContent = action.label;
    button.appendChild(label);

    button.addEventListener('click', action.onClick);
    actionsContainer.appendChild(button);
  }
}

// ============================================================================
// OPEN / CLOSE
// ============================================================================

/** Track the element that had focus before opening */
let previouslyFocusedElement: HTMLElement | null = null;

export function open(): void {
  if (state.isOpen) return;

  // Store current focus for restoration
  previouslyFocusedElement = document.activeElement as HTMLElement;

  state.isOpen = true;
  sheetElement?.classList.add('open');
  backdropElement?.classList.add('open');

  // Update aria states
  sheetElement?.setAttribute('aria-hidden', 'false');
  const trigger = document.querySelector('.mobile-menu-trigger');
  trigger?.classList.add('hidden');
  trigger?.setAttribute('aria-expanded', 'true');

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Focus first action button for keyboard navigation
  requestAnimationFrame(() => {
    const firstAction = actionsContainer?.querySelector('button') as HTMLElement | null;
    firstAction?.focus();
  });
}

export function close(): void {
  if (!state.isOpen) return;

  state.isOpen = false;
  sheetElement?.classList.remove('open');
  backdropElement?.classList.remove('open');

  // Update aria states
  sheetElement?.setAttribute('aria-hidden', 'true');
  const trigger = document.querySelector('.mobile-menu-trigger');
  trigger?.classList.remove('hidden');
  trigger?.setAttribute('aria-expanded', 'false');

  // Restore body scroll
  document.body.style.overflow = '';

  // Restore focus to trigger
  requestAnimationFrame(() => {
    if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
      previouslyFocusedElement.focus();
    } else {
      (trigger as HTMLElement)?.focus();
    }
  });
}

export function toggle(): void {
  if (state.isOpen) {
    close();
  } else {
    open();
  }
}

// ============================================================================
// DRAG HANDLING
// ============================================================================

function handleTouchStart(e: TouchEvent): void {
  state.isDragging = true;
  state.startY = e.touches[0].clientY;
  state.currentY = state.startY;
  sheetElement?.classList.add('dragging');
}

function handleTouchMove(e: TouchEvent): void {
  if (!state.isDragging) return;

  state.currentY = e.touches[0].clientY;
  const deltaY = state.currentY - state.startY;

  // Only allow dragging down
  if (deltaY > 0 && sheetElement) {
    sheetElement.style.transform = `translateY(${deltaY}px)`;
    e.preventDefault();
  }
}

function handleTouchEnd(): void {
  if (!state.isDragging) return;

  state.isDragging = false;
  sheetElement?.classList.remove('dragging');

  const deltaY = state.currentY - state.startY;

  // If dragged more than 100px down, close
  if (deltaY > 100) {
    close();
  }

  // Reset transform
  if (sheetElement) {
    sheetElement.style.transform = '';
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeMobileBottomSheet(): void {
  if (!isInitialized) return;

  // Close if open (restores body scroll)
  if (state.isOpen) {
    close();
  }

  // Remove DOM elements
  sheetElement?.remove();
  backdropElement?.remove();
  document.querySelector('.mobile-menu-trigger')?.remove();
  document.getElementById('mobile-bottom-sheet-styles')?.remove();

  // Remove event listeners (prevent memory leaks)
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('keydown', handleKeyDown);

  // Reset state
  sheetElement = null;
  backdropElement = null;
  handleElement = null;
  actionsContainer = null;
  previouslyFocusedElement = null;
  isInitialized = false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const mobileBottomSheetUI = {
  init: initMobileBottomSheet,
  open,
  close,
  toggle,
  dispose: disposeMobileBottomSheet,
};

export default mobileBottomSheetUI;
