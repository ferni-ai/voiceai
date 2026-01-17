/**
 * FERNI COMPARISON MODE
 * =====================
 * Apple-level comparison UX for data visualization.
 * Makes "before vs after" and "A vs B" comparisons intuitive.
 *
 * Philosophy:
 * - Comparison reveals change, change reveals insight
 * - Synchronized interactions (hover one, highlight both)
 * - Smooth transitions between views
 * - Clear visual encoding of difference
 *
 * Usage:
 *   import { initComparison, ComparisonMode } from './comparison-mode.js';
 *   initComparison();
 *
 *   // Switch modes:
 *   setComparisonMode(ComparisonMode.SIDE_BY_SIDE);
 */

// ============================================
// COMPARISON MODES
// ============================================

export const ComparisonMode = {
  SINGLE: 'single',           // Show one dataset only
  SIDE_BY_SIDE: 'side-by-side', // Two datasets side by side
  OVERLAY: 'overlay',         // Datasets layered on top
  DIFFERENCE: 'difference',   // Show only the delta
  SLIDER: 'slider',           // Drag slider to reveal/compare
};

// ============================================
// STATE
// ============================================

const state = {
  mode: ComparisonMode.SINGLE,
  activeDatasets: ['current'],  // IDs of active datasets
  containers: new Map(),
  syncedElements: new Map(),
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  transitionDuration: 400,
  syncHoverDelay: 16,  // Debounce hover sync (1 frame at 60fps)
  differenceColors: {
    positive: 'var(--color-success, #34c759)',
    negative: 'var(--color-error, #ff3b30)',
    neutral: 'var(--color-text-muted, #6b6b6b)',
  },
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize comparison mode for all containers
 */
export function initComparison(container = document) {
  // Find all comparison containers
  const containers = container.querySelectorAll('[data-comparison]');

  containers.forEach(el => {
    initComparisonContainer(el);
  });

  // Initialize mode switcher if present
  const switcher = container.querySelector('.comparison-mode-switcher');
  if (switcher) {
    initModeSwitcher(switcher);
  }

  // Set up synchronized hover
  setupSyncedHover(container);

  return {
    setMode: (mode) => setComparisonMode(mode),
    getMode: () => state.mode,
    setDatasets: (datasets) => setActiveDatasets(datasets),
    getDatasets: () => [...state.activeDatasets],
  };
}

/**
 * Initialize a single comparison container
 */
function initComparisonContainer(container) {
  const id = container.id || generateId();
  container.id = id;

  state.containers.set(container, {
    datasets: [],
    mode: ComparisonMode.SINGLE,
  });

  // Find all dataset elements within
  const datasets = container.querySelectorAll('[data-dataset]');
  const containerState = state.containers.get(container);

  datasets.forEach(dataset => {
    containerState.datasets.push({
      id: dataset.dataset.dataset,
      element: dataset,
      label: dataset.dataset.datasetLabel || dataset.dataset.dataset,
    });

    // Initially hide all but first
    if (containerState.datasets.length > 1) {
      dataset.style.display = 'none';
      dataset.setAttribute('aria-hidden', 'true');
    }
  });

  // Set up slider if present
  const slider = container.querySelector('.comparison-slider');
  if (slider) {
    initSlider(container, slider);
  }

  // Set initial mode from attribute
  const initialMode = container.dataset.comparisonMode || ComparisonMode.SINGLE;
  setContainerMode(container, initialMode, false);
}

// ============================================
// MODE SWITCHING
// ============================================

/**
 * Set comparison mode globally
 */
export function setComparisonMode(mode) {
  if (!Object.values(ComparisonMode).includes(mode)) {
    console.warn(`Invalid comparison mode: ${mode}`);
    return;
  }

  const oldMode = state.mode;
  state.mode = mode;

  // Update all containers
  state.containers.forEach((containerState, container) => {
    setContainerMode(container, mode, true);
  });

  // Update mode switcher UI
  updateModeSwitcherUI(mode);

  // Dispatch event
  document.dispatchEvent(new CustomEvent('comparison-mode-change', {
    detail: { oldMode, newMode: mode }
  }));
}

/**
 * Set comparison mode for a specific container
 */
function setContainerMode(container, mode, animate = true) {
  const containerState = state.containers.get(container);
  if (!containerState) return;

  containerState.mode = mode;
  container.dataset.comparisonMode = mode;

  const datasets = containerState.datasets;

  switch (mode) {
    case ComparisonMode.SINGLE:
      showSingleDataset(container, datasets, animate);
      break;

    case ComparisonMode.SIDE_BY_SIDE:
      showSideBySide(container, datasets, animate);
      break;

    case ComparisonMode.OVERLAY:
      showOverlay(container, datasets, animate);
      break;

    case ComparisonMode.DIFFERENCE:
      showDifference(container, datasets, animate);
      break;

    case ComparisonMode.SLIDER:
      showSlider(container, datasets, animate);
      break;
  }
}

// ============================================
// VIEW MODES
// ============================================

/**
 * Show single dataset (no comparison)
 */
function showSingleDataset(container, datasets, animate) {
  const activeId = state.activeDatasets[0] || datasets[0]?.id;

  datasets.forEach((dataset, index) => {
    const isActive = dataset.id === activeId || (index === 0 && !activeId);

    if (animate) {
      transitionElement(dataset.element, isActive, {
        display: isActive ? 'block' : 'none',
        opacity: isActive ? 1 : 0,
      });
    } else {
      dataset.element.style.display = isActive ? 'block' : 'none';
      dataset.element.style.opacity = isActive ? '1' : '0';
    }

    dataset.element.setAttribute('aria-hidden', !isActive);
  });
}

/**
 * Show datasets side by side
 */
function showSideBySide(container, datasets, animate) {
  // Create or update side-by-side layout
  let wrapper = container.querySelector('.comparison-side-by-side');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'comparison-side-by-side';
    wrapper.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${Math.min(datasets.length, 2)}, 1fr);
      gap: var(--space-4, 1rem);
    `;
    container.appendChild(wrapper);
  }

  // Show first two datasets
  const visibleDatasets = datasets.slice(0, 2);
  const hiddenDatasets = datasets.slice(2);

  visibleDatasets.forEach((dataset, index) => {
    dataset.element.style.display = 'block';
    dataset.element.setAttribute('aria-hidden', 'false');

    // Add label if not present
    if (!dataset.element.querySelector('.dataset-label')) {
      const label = document.createElement('div');
      label.className = 'dataset-label';
      label.textContent = dataset.label;
      label.style.cssText = `
        font-size: var(--font-size-sm, 0.875rem);
        color: var(--color-text-muted, #6b6b6b);
        margin-bottom: var(--space-2, 0.5rem);
        font-weight: 500;
      `;
      dataset.element.insertBefore(label, dataset.element.firstChild);
    }

    if (animate) {
      transitionElement(dataset.element, true, { opacity: 1 });
    } else {
      dataset.element.style.opacity = '1';
    }

    // Move to wrapper if not already there
    if (dataset.element.parentElement !== wrapper) {
      wrapper.appendChild(dataset.element);
    }
  });

  // Hide remaining datasets
  hiddenDatasets.forEach(dataset => {
    dataset.element.style.display = 'none';
    dataset.element.setAttribute('aria-hidden', 'true');
  });
}

/**
 * Show datasets overlaid on top of each other
 */
function showOverlay(container, datasets, animate) {
  // Create or update overlay container
  let wrapper = container.querySelector('.comparison-overlay');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'comparison-overlay';
    wrapper.style.cssText = `
      position: relative;
    `;
    container.appendChild(wrapper);
  }

  // Show first two datasets overlaid
  const visibleDatasets = datasets.slice(0, 2);

  visibleDatasets.forEach((dataset, index) => {
    dataset.element.style.display = 'block';
    dataset.element.setAttribute('aria-hidden', 'false');

    // Style for overlay
    dataset.element.style.position = index === 0 ? 'relative' : 'absolute';
    dataset.element.style.top = index === 0 ? 'auto' : '0';
    dataset.element.style.left = index === 0 ? 'auto' : '0';
    dataset.element.style.right = index === 0 ? 'auto' : '0';
    dataset.element.style.opacity = index === 0 ? '1' : '0.5';

    if (dataset.element.parentElement !== wrapper) {
      wrapper.appendChild(dataset.element);
    }
  });

  // Create legend
  createOverlayLegend(wrapper, visibleDatasets);
}

/**
 * Show only the difference between datasets
 */
function showDifference(container, datasets, animate) {
  if (datasets.length < 2) {
    showSingleDataset(container, datasets, animate);
    return;
  }

  const [datasetA, datasetB] = datasets;

  // Create difference visualization
  let diffContainer = container.querySelector('.comparison-difference');

  if (!diffContainer) {
    diffContainer = document.createElement('div');
    diffContainer.className = 'comparison-difference';
    container.appendChild(diffContainer);
  }

  // Calculate and render differences
  renderDifference(diffContainer, datasetA, datasetB);

  // Hide original datasets
  datasets.forEach(dataset => {
    dataset.element.style.display = 'none';
    dataset.element.setAttribute('aria-hidden', 'true');
  });
}

/**
 * Show slider comparison (drag to reveal)
 */
function showSlider(container, datasets, animate) {
  if (datasets.length < 2) {
    showSingleDataset(container, datasets, animate);
    return;
  }

  // Ensure slider wrapper exists
  let wrapper = container.querySelector('.comparison-slider-wrapper');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'comparison-slider-wrapper';
    wrapper.style.cssText = `
      position: relative;
      overflow: hidden;
    `;
    container.appendChild(wrapper);

    // Create slider handle
    const handle = document.createElement('div');
    handle.className = 'comparison-slider-handle';
    handle.style.cssText = `
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 4px;
      background: var(--kintsugi-gold, #C9A227);
      cursor: ew-resize;
      z-index: 10;
      transform: translateX(-50%);
    `;

    const handleGrip = document.createElement('div');
    handleGrip.className = 'comparison-slider-grip';
    handleGrip.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 32px;
      height: 32px;
      background: var(--kintsugi-gold, #C9A227);
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;

    handle.appendChild(handleGrip);
    wrapper.appendChild(handle);

    initSliderInteraction(wrapper, handle);
  }

  // Position datasets
  const [datasetA, datasetB] = datasets;

  datasetA.element.style.cssText = `
    display: block;
    position: relative;
    z-index: 1;
  `;

  datasetB.element.style.cssText = `
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    clip-path: inset(0 0 0 50%);
    z-index: 2;
  `;

  if (datasetA.element.parentElement !== wrapper) {
    wrapper.appendChild(datasetA.element);
    wrapper.appendChild(datasetB.element);
  }
}

// ============================================
// SLIDER INTERACTION
// ============================================

/**
 * Initialize slider drag interaction
 */
function initSliderInteraction(wrapper, handle) {
  let isDragging = false;

  const onPointerDown = (e) => {
    isDragging = true;
    handle.style.opacity = '0.8';
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;

    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    // Move handle
    handle.style.left = `${percentage}%`;

    // Update clip-path on second dataset
    const datasetB = wrapper.querySelector('[data-dataset]:nth-child(2)') ||
                     wrapper.querySelectorAll('[data-dataset]')[1];
    if (datasetB) {
      datasetB.style.clipPath = `inset(0 0 0 ${percentage}%)`;
    }
  };

  const onPointerUp = () => {
    isDragging = false;
    handle.style.opacity = '1';
    document.body.style.cursor = '';
  };

  handle.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
}

// ============================================
// SYNCHRONIZED HOVER
// ============================================

/**
 * Set up synchronized hover across datasets
 */
function setupSyncedHover(container) {
  const syncableElements = container.querySelectorAll('[data-sync-id]');

  syncableElements.forEach(element => {
    const syncId = element.dataset.syncId;

    // Group elements by sync ID
    if (!state.syncedElements.has(syncId)) {
      state.syncedElements.set(syncId, []);
    }
    state.syncedElements.get(syncId).push(element);

    // Add hover listeners
    element.addEventListener('mouseenter', () => {
      const siblings = state.syncedElements.get(syncId);
      siblings.forEach(sibling => {
        sibling.classList.add('sync-hover');
      });
    });

    element.addEventListener('mouseleave', () => {
      const siblings = state.syncedElements.get(syncId);
      siblings.forEach(sibling => {
        sibling.classList.remove('sync-hover');
      });
    });
  });
}

// ============================================
// HELPERS
// ============================================

/**
 * Transition element visibility
 */
function transitionElement(element, visible, styles) {
  if (visible) {
    element.style.display = styles.display || 'block';
    element.style.opacity = '0';
    element.offsetHeight; // Force reflow

    element.style.transition = `opacity ${CONFIG.transitionDuration}ms ease-out`;
    element.style.opacity = String(styles.opacity ?? 1);
  } else {
    element.style.transition = `opacity ${CONFIG.transitionDuration}ms ease-out`;
    element.style.opacity = '0';

    setTimeout(() => {
      element.style.display = 'none';
    }, CONFIG.transitionDuration);
  }
}

/**
 * Create legend for overlay mode
 */
function createOverlayLegend(container, datasets) {
  let legend = container.querySelector('.overlay-legend');

  if (!legend) {
    legend = document.createElement('div');
    legend.className = 'overlay-legend';
    legend.style.cssText = `
      display: flex;
      gap: var(--space-4, 1rem);
      margin-top: var(--space-4, 1rem);
      font-size: var(--font-size-sm, 0.875rem);
    `;
    container.appendChild(legend);
  }

  // Clear and rebuild
  legend.textContent = '';

  datasets.forEach((dataset, index) => {
    const item = document.createElement('div');
    item.className = 'overlay-legend-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    `;

    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: ${index === 0 ? 'var(--color-accent, #3D5A45)' : 'var(--kintsugi-gold, #C9A227)'};
      opacity: ${index === 0 ? '1' : '0.5'};
    `;

    const label = document.createElement('span');
    label.textContent = dataset.label;

    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  });
}

/**
 * Render difference visualization
 */
function renderDifference(container, datasetA, datasetB) {
  // Clear previous
  container.textContent = '';

  // Create difference summary
  const summary = document.createElement('div');
  summary.className = 'difference-summary';
  summary.style.cssText = `
    text-align: center;
    padding: var(--space-6, 1.5rem);
  `;

  const title = document.createElement('h4');
  title.textContent = `${datasetB.label} vs ${datasetA.label}`;
  title.style.cssText = `
    font-size: var(--font-size-lg, 1.125rem);
    margin-bottom: var(--space-2, 0.5rem);
  `;

  const description = document.createElement('p');
  description.textContent = 'Comparing changes between time periods';
  description.style.cssText = `
    color: var(--color-text-muted, #6b6b6b);
  `;

  summary.appendChild(title);
  summary.appendChild(description);
  container.appendChild(summary);

  // Note: Full difference calculation would require access to actual data
  // This is a structural placeholder for the visualization
}

/**
 * Initialize mode switcher component
 */
function initModeSwitcher(switcher) {
  const buttons = switcher.querySelectorAll('[data-comparison-mode]');

  buttons.forEach(button => {
    const mode = button.dataset.comparisonMode;

    button.addEventListener('click', () => {
      setComparisonMode(mode);
    });

    button.setAttribute('role', 'tab');
    button.setAttribute('tabindex', mode === state.mode ? '0' : '-1');
    button.setAttribute('aria-selected', mode === state.mode);
  });

  switcher.setAttribute('role', 'tablist');
}

/**
 * Update mode switcher UI
 */
function updateModeSwitcherUI(mode) {
  const switchers = document.querySelectorAll('.comparison-mode-switcher');

  switchers.forEach(switcher => {
    const buttons = switcher.querySelectorAll('[data-comparison-mode]');
    buttons.forEach(button => {
      const isActive = button.dataset.comparisonMode === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive);
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  });
}

/**
 * Set active datasets for comparison
 */
export function setActiveDatasets(datasetIds) {
  state.activeDatasets = datasetIds;

  // Re-render current mode with new datasets
  state.containers.forEach((containerState, container) => {
    setContainerMode(container, containerState.mode, true);
  });
}

let idCounter = 0;
function generateId() {
  return `comparison-${++idCounter}`;
}

// ============================================
// EXPORT
// ============================================

export default {
  init: initComparison,
  ComparisonMode,
  setMode: setComparisonMode,
  setDatasets: setActiveDatasets,
};
