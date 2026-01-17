/**
 * FERNI PROGRESSIVE DISCLOSURE SYSTEM
 * ====================================
 * Apple-level information architecture for complex data.
 * Reveals complexity gradually, never overwhelming the user.
 *
 * Philosophy:
 * - Start simple: Summary first, details on demand
 * - Maintain context: User always knows where they are
 * - Smooth transitions: Every expand/collapse feels natural
 * - Respect cognitive load: Never show too much at once
 *
 * Usage:
 *   import { initDisclosure, DisclosureLevel } from './progressive-disclosure.js';
 *   initDisclosure();
 *
 *   // Or manually control:
 *   setDisclosureLevel(element, DisclosureLevel.DETAILED);
 */

// ============================================
// DISCLOSURE LEVELS
// ============================================

export const DisclosureLevel = {
  SUMMARY: 'summary',       // High-level overview (default)
  STANDARD: 'standard',     // Normal detail level
  DETAILED: 'detailed',     // Full detail with breakdowns
  EXPERT: 'expert',         // All data, technical details
};

const LEVEL_ORDER = [
  DisclosureLevel.SUMMARY,
  DisclosureLevel.STANDARD,
  DisclosureLevel.DETAILED,
  DisclosureLevel.EXPERT,
];

// ============================================
// STATE
// ============================================

const state = {
  currentLevel: DisclosureLevel.SUMMARY,
  containers: new Map(),  // element -> { level, expanded sections }
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  transitionDuration: 400,    // Animation duration (ms)
  staggerDelay: 50,           // Delay between revealing items
  collapseOnLevelChange: true, // Collapse details when level decreases
  persistState: true,          // Remember state in sessionStorage
  storageKey: 'ferni-disclosure-state',
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize progressive disclosure for all containers
 */
export function initDisclosure(container = document) {
  // Find all disclosure containers
  const containers = container.querySelectorAll('[data-disclosure]');

  containers.forEach(el => {
    initContainer(el);
  });

  // Initialize level switcher if present
  const switcher = container.querySelector('.disclosure-level-switcher');
  if (switcher) {
    initLevelSwitcher(switcher);
  }

  // Restore persisted state
  if (CONFIG.persistState) {
    restoreState();
  }

  // Set up keyboard navigation
  setupKeyboardNav(container);

  return {
    setLevel: (level) => setGlobalLevel(level),
    getLevel: () => state.currentLevel,
    expand: (section) => expandSection(section),
    collapse: (section) => collapseSection(section),
    toggle: (section) => toggleSection(section),
  };
}

/**
 * Initialize a single disclosure container
 */
function initContainer(container) {
  const id = container.id || generateId();
  container.id = id;

  // Store in state
  state.containers.set(container, {
    level: DisclosureLevel.SUMMARY,
    expandedSections: new Set(),
  });

  // Set initial level from data attribute or default
  const initialLevel = container.dataset.disclosureLevel || DisclosureLevel.SUMMARY;
  setContainerLevel(container, initialLevel, false);

  // Set up expand triggers
  const triggers = container.querySelectorAll('[data-expand-trigger]');
  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const targetId = trigger.dataset.expandTrigger;
      const target = container.querySelector(`#${targetId}`) ||
                     container.querySelector(`[data-expand-target="${targetId}"]`);
      if (target) {
        toggleSection(target);
      }
    });

    // Make accessible
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-expanded', 'false');

    // Keyboard support
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });
  });

  // Set up expandable sections
  const sections = container.querySelectorAll('[data-expandable]');
  sections.forEach(section => {
    section.setAttribute('aria-hidden', 'true');
    section.classList.add('disclosure-collapsed');
  });
}

// ============================================
// LEVEL MANAGEMENT
// ============================================

/**
 * Set global disclosure level (affects all containers)
 */
export function setGlobalLevel(level) {
  if (!LEVEL_ORDER.includes(level)) {
    console.warn(`Invalid disclosure level: ${level}`);
    return;
  }

  const oldLevel = state.currentLevel;
  state.currentLevel = level;

  // Update all containers
  state.containers.forEach((containerState, container) => {
    setContainerLevel(container, level, true);
  });

  // Update level switcher UI
  updateLevelSwitcherUI(level);

  // Persist state
  if (CONFIG.persistState) {
    saveState();
  }

  // Dispatch event
  document.dispatchEvent(new CustomEvent('disclosure-level-change', {
    detail: { oldLevel, newLevel: level }
  }));
}

/**
 * Set disclosure level for a specific container
 */
export function setContainerLevel(container, level, animate = true) {
  const containerState = state.containers.get(container);
  if (!containerState) return;

  const oldLevel = containerState.level;
  const oldIndex = LEVEL_ORDER.indexOf(oldLevel);
  const newIndex = LEVEL_ORDER.indexOf(level);

  containerState.level = level;

  // Update container attribute
  container.dataset.disclosureLevel = level;

  // Show/hide content based on level
  LEVEL_ORDER.forEach((lvl, index) => {
    const elements = container.querySelectorAll(`[data-show-at="${lvl}"]`);
    const shouldShow = index <= newIndex;

    elements.forEach((el, elIndex) => {
      if (animate) {
        const delay = shouldShow ? elIndex * CONFIG.staggerDelay : 0;
        setTimeout(() => {
          setElementVisibility(el, shouldShow, animate);
        }, delay);
      } else {
        setElementVisibility(el, shouldShow, false);
      }
    });
  });

  // Collapse expanded sections if decreasing level
  if (CONFIG.collapseOnLevelChange && newIndex < oldIndex) {
    containerState.expandedSections.forEach(sectionId => {
      const section = container.querySelector(`#${sectionId}`) ||
                      container.querySelector(`[data-expand-target="${sectionId}"]`);
      if (section) {
        collapseSection(section, animate);
      }
    });
    containerState.expandedSections.clear();
  }
}

/**
 * Cycle to next disclosure level
 */
export function cycleLevel(direction = 1) {
  const currentIndex = LEVEL_ORDER.indexOf(state.currentLevel);
  const newIndex = Math.max(0, Math.min(LEVEL_ORDER.length - 1, currentIndex + direction));
  setGlobalLevel(LEVEL_ORDER[newIndex]);
}

// ============================================
// SECTION EXPAND/COLLAPSE
// ============================================

/**
 * Expand a collapsible section
 */
export function expandSection(section, animate = true) {
  if (!section.hasAttribute('data-expandable')) return;

  const container = section.closest('[data-disclosure]');
  const containerState = state.containers.get(container);
  const sectionId = section.id || section.dataset.expandTarget;

  // Track expanded state
  if (containerState && sectionId) {
    containerState.expandedSections.add(sectionId);
  }

  // Update trigger
  const trigger = findTriggerFor(section);
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('is-expanded');
  }

  // Expand with animation
  if (animate) {
    // Measure target height
    section.style.height = 'auto';
    section.style.opacity = '1';
    section.classList.remove('disclosure-collapsed');
    const targetHeight = section.offsetHeight;

    // Animate from 0
    section.style.height = '0';
    section.style.opacity = '0';
    section.offsetHeight; // Force reflow

    section.style.transition = `height ${CONFIG.transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${CONFIG.transitionDuration}ms ease-out`;
    section.style.height = `${targetHeight}px`;
    section.style.opacity = '1';

    // Clean up after animation
    setTimeout(() => {
      section.style.height = 'auto';
      section.style.transition = '';
    }, CONFIG.transitionDuration);
  } else {
    section.classList.remove('disclosure-collapsed');
    section.style.height = 'auto';
    section.style.opacity = '1';
  }

  section.setAttribute('aria-hidden', 'false');
}

/**
 * Collapse a collapsible section
 */
export function collapseSection(section, animate = true) {
  if (!section.hasAttribute('data-expandable')) return;

  const container = section.closest('[data-disclosure]');
  const containerState = state.containers.get(container);
  const sectionId = section.id || section.dataset.expandTarget;

  // Track collapsed state
  if (containerState && sectionId) {
    containerState.expandedSections.delete(sectionId);
  }

  // Update trigger
  const trigger = findTriggerFor(section);
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('is-expanded');
  }

  // Collapse with animation
  if (animate) {
    const currentHeight = section.offsetHeight;
    section.style.height = `${currentHeight}px`;
    section.offsetHeight; // Force reflow

    section.style.transition = `height ${CONFIG.transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${CONFIG.transitionDuration}ms ease-out`;
    section.style.height = '0';
    section.style.opacity = '0';

    // Add collapsed class after animation
    setTimeout(() => {
      section.classList.add('disclosure-collapsed');
      section.style.transition = '';
      section.style.height = '';
    }, CONFIG.transitionDuration);
  } else {
    section.classList.add('disclosure-collapsed');
    section.style.height = '';
    section.style.opacity = '0';
  }

  section.setAttribute('aria-hidden', 'true');
}

/**
 * Toggle a collapsible section
 */
export function toggleSection(section) {
  const isCollapsed = section.classList.contains('disclosure-collapsed') ||
                      section.getAttribute('aria-hidden') === 'true';

  if (isCollapsed) {
    expandSection(section);
  } else {
    collapseSection(section);
  }
}

/**
 * Find the trigger element for a section
 */
function findTriggerFor(section) {
  const sectionId = section.id || section.dataset.expandTarget;
  if (!sectionId) return null;

  const container = section.closest('[data-disclosure]');
  return container?.querySelector(`[data-expand-trigger="${sectionId}"]`);
}

// ============================================
// VISIBILITY HELPERS
// ============================================

/**
 * Set visibility of an element with optional animation
 */
function setElementVisibility(element, visible, animate = true) {
  if (visible) {
    element.removeAttribute('hidden');
    element.setAttribute('aria-hidden', 'false');

    if (animate) {
      element.style.opacity = '0';
      element.style.transform = 'translateY(10px)';
      element.offsetHeight; // Force reflow

      element.style.transition = `opacity ${CONFIG.transitionDuration}ms ease-out, transform ${CONFIG.transitionDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    } else {
      element.style.opacity = '1';
      element.style.transform = '';
    }
  } else {
    element.setAttribute('aria-hidden', 'true');

    if (animate) {
      element.style.transition = `opacity ${CONFIG.transitionDuration}ms ease-out`;
      element.style.opacity = '0';

      setTimeout(() => {
        element.setAttribute('hidden', '');
        element.style.transition = '';
      }, CONFIG.transitionDuration);
    } else {
      element.setAttribute('hidden', '');
      element.style.opacity = '0';
    }
  }
}

// ============================================
// LEVEL SWITCHER UI
// ============================================

/**
 * Initialize the level switcher component
 */
function initLevelSwitcher(switcher) {
  const buttons = switcher.querySelectorAll('[data-level]');

  buttons.forEach(button => {
    const level = button.dataset.level;

    button.addEventListener('click', () => {
      setGlobalLevel(level);
    });

    // Keyboard support
    button.setAttribute('role', 'tab');
    button.setAttribute('tabindex', level === state.currentLevel ? '0' : '-1');
    button.setAttribute('aria-selected', level === state.currentLevel);
  });

  // Make it a tablist
  switcher.setAttribute('role', 'tablist');

  // Arrow key navigation
  switcher.addEventListener('keydown', (e) => {
    const buttons = Array.from(switcher.querySelectorAll('[data-level]'));
    const current = document.activeElement;
    const currentIndex = buttons.indexOf(current);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = buttons[(currentIndex + 1) % buttons.length];
      next.focus();
      next.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = buttons[(currentIndex - 1 + buttons.length) % buttons.length];
      prev.focus();
      prev.click();
    }
  });

  updateLevelSwitcherUI(state.currentLevel);
}

/**
 * Update level switcher UI to reflect current level
 */
function updateLevelSwitcherUI(level) {
  const switchers = document.querySelectorAll('.disclosure-level-switcher');

  switchers.forEach(switcher => {
    const buttons = switcher.querySelectorAll('[data-level]');
    buttons.forEach(button => {
      const isActive = button.dataset.level === level;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive);
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  });
}

// ============================================
// KEYBOARD NAVIGATION
// ============================================

/**
 * Set up keyboard navigation
 */
function setupKeyboardNav(container) {
  container.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Plus/Minus to change level
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        cycleLevel(1);
      } else if (e.key === '-') {
        e.preventDefault();
        cycleLevel(-1);
      }
    }
  });
}

// ============================================
// STATE PERSISTENCE
// ============================================

/**
 * Save current state to sessionStorage
 */
function saveState() {
  try {
    const stateToSave = {
      currentLevel: state.currentLevel,
      containers: {},
    };

    state.containers.forEach((containerState, container) => {
      if (container.id) {
        stateToSave.containers[container.id] = {
          level: containerState.level,
          expandedSections: Array.from(containerState.expandedSections),
        };
      }
    });

    sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(stateToSave));
  } catch (e) {
    // Storage not available
  }
}

/**
 * Restore state from sessionStorage
 */
function restoreState() {
  try {
    const saved = sessionStorage.getItem(CONFIG.storageKey);
    if (!saved) return;

    const savedState = JSON.parse(saved);

    // Restore global level
    if (savedState.currentLevel) {
      setGlobalLevel(savedState.currentLevel);
    }

    // Restore container states
    if (savedState.containers) {
      Object.entries(savedState.containers).forEach(([containerId, containerState]) => {
        const container = document.getElementById(containerId);
        if (container) {
          // Restore expanded sections
          containerState.expandedSections?.forEach(sectionId => {
            const section = container.querySelector(`#${sectionId}`) ||
                           container.querySelector(`[data-expand-target="${sectionId}"]`);
            if (section) {
              expandSection(section, false);
            }
          });
        }
      });
    }
  } catch (e) {
    // Storage not available or invalid data
  }
}

// ============================================
// UTILITIES
// ============================================

let idCounter = 0;
function generateId() {
  return `disclosure-${++idCounter}`;
}

// ============================================
// EXPORT
// ============================================

export default {
  init: initDisclosure,
  DisclosureLevel,
  setLevel: setGlobalLevel,
  cycleLevel,
  expand: expandSection,
  collapse: collapseSection,
  toggle: toggleSection,
};
