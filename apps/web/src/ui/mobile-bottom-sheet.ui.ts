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
import { isOverlayHostEnabled } from './overlay/overlay-flag.js';
import { openDialog, type DialogHandle } from './overlay/dialog.js';
import { STYLES } from './mobile-bottom-sheet.styles.js';
import { isSheetActionVisible } from '../config/menu-visibility.js';
import { soundSheetAction } from './mobile-sheet-sound.js';

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
/** The sheet's content, lent to a native dialog while the overlay host shows it. */
let contentElement: HTMLElement | null = null;
let dialog: DialogHandle | null = null;
let isInitialized = false;

const state: BottomSheetState = {
  isOpen: false,
  isDragging: false,
  startY: 0,
  currentY: 0,
};

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
      circle.setAttribute('cx', params[0] ?? '0');
      circle.setAttribute('cy', params[1] ?? '0');
      circle.setAttribute('r', params[2] ?? '0');
      svg.appendChild(circle);
    } else if (trimmed.startsWith('rect:')) {
      const params = trimmed.replace('rect:', '').split(',');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', params[0] ?? '0');
      rect.setAttribute('y', params[1] ?? '0');
      rect.setAttribute('width', params[2] ?? '0');
      rect.setAttribute('height', params[3] ?? '0');
      if (params[4]) rect.setAttribute('rx', params[4]);
      if (params[5]) rect.setAttribute('ry', params[5]);
      svg.appendChild(rect);
    } else if (trimmed.startsWith('line:')) {
      const params = trimmed.replace('line:', '').split(',');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', params[0] ?? '0');
      line.setAttribute('y1', params[1] ?? '0');
      line.setAttribute('x2', params[2] ?? '0');
      line.setAttribute('y2', params[3] ?? '0');
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
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
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
  sheetElement.inert = true; // closed, it sits off-screen: unreachable by Tab and screen readers

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
  contentElement = content;

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
      if (document.activeElement === firstElement && lastElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastElement && firstElement) {
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
      // The phone Ferni texts or calls: one tap from here, not three (settings-menu.ui.ts)
      id: 'reach-me',
      iconPath: ICON_PATHS.phone,
      label: t('menu.items.howIReachYou'),
      onClick: () => {
        close();
        // lazy: a static import pulls every screen into this module's graph
        void import('./lazy-screens.js').then((m) => m.openContactSettings());
      },
    },
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
    soundSheetAction(), // Sound effects on/off, without closing the sheet (mobile-sheet-sound.ts)
    {
      id: 'insights',
      iconPath: ICON_PATHS.insights,
      label: t('menu.mobileSheet.actions.insights'),
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent('ferni:open-insights'));
      },
    },
  ].filter((action) => isSheetActionVisible(action.id)); // hides: config/menu-visibility.ts
}

function populateActions(actions: BottomSheetAction[]): void {
  if (!actionsContainer) return;

  while (actionsContainer.firstChild) {
    actionsContainer.removeChild(actionsContainer.firstChild);
  }

  for (const action of actions) {
    const button = document.createElement('button');
    button.className = 'mobile-bottom-sheet__action';
    button.setAttribute('data-action', action.id);

    const iconContainer = document.createElement('span');
    iconContainer.className = 'mobile-bottom-sheet__action-icon';
    if (action.color) {
      iconContainer.style.color = action.color;
    }
    iconContainer.appendChild(createSvgIcon(action.iconPath));
    button.appendChild(iconContainer);

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
  if (isOverlayHostEnabled() && contentElement) {
    openAsDialog(contentElement);
    return;
  }

  // Store current focus for restoration
  previouslyFocusedElement = document.activeElement as HTMLElement;

  state.isOpen = true;
  sheetElement?.classList.add('open');
  backdropElement?.classList.add('open');

  // Update aria states (inert, not aria-hidden: its buttons must leave the tab order too)
  if (sheetElement) sheetElement.inert = false;
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
  if (dialog) {
    dialog.close(); // its onClose puts the content back and resets state
    return;
  }

  state.isOpen = false;
  sheetElement?.classList.remove('open');
  backdropElement?.classList.remove('open');

  // Update aria states
  if (sheetElement) sheetElement.inert = true;
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

/**
 * Overlay host on: the same content in a native <dialog> sheet, which brings
 * the top layer, an inert page behind it, Escape, focus return, drag-to-dismiss
 * and a second (large) detent. The trigger hides while it is open, as before.
 */
function openAsDialog(content: HTMLElement): void {
  const trigger = document.querySelector('.mobile-menu-trigger');
  state.isOpen = true;
  trigger?.classList.add('hidden');
  trigger?.setAttribute('aria-expanded', 'true');
  dialog = openDialog(content, {
    size: 'md',
    labelledBy: 'mobile-sheet-title',
    className: 'mobile-bottom-sheet-dialog',
    onClose: () => {
      dialog = null;
      state.isOpen = false;
      sheetElement?.appendChild(content);
      trigger?.classList.remove('hidden');
      trigger?.setAttribute('aria-expanded', 'false');
    },
  });
  content.querySelector<HTMLElement>('button')?.focus();
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
  const touch = e.touches[0];
  if (!touch) return;
  state.isDragging = true;
  state.startY = touch.clientY;
  state.currentY = state.startY;
  sheetElement?.classList.add('dragging');
}

function handleTouchMove(e: TouchEvent): void {
  if (!state.isDragging) return;
  const touch = e.touches[0];
  if (!touch) return;

  state.currentY = touch.clientY;
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
