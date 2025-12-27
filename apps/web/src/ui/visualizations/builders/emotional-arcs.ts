/**
 * Emotional Arcs Visualization Builder
 *
 * Displays emotional journey as a narrative arc with phases.
 * Adapts to different device sizes:
 * - Watch: Current phase indicator with arc segment
 * - Mobile: Card-based phase timeline with progress
 * - Tablet: Full arc visualization with phase details
 *
 * @module visualizations/builders/emotional-arcs
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  EmotionalArcsData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const ARC_TYPE_LABELS: Record<EmotionalArcsData['arcType'], string> = {
  'hero-journey': 'Hero Journey',
  'growth': 'Growth Arc',
  'recovery': 'Recovery Path',
  'discovery': 'Discovery Trail',
};

const PHASE_COLORS = [
  DEFAULT_COLORS.accent,
  '#f5a623',
  '#3a6b73',
  '#a67a6a',
  '#8a7a9a',
];

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact emotional arc for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: EmotionalArcsData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Arc'));
  header.appendChild(createElement('p', '', 'Your journey'));
  container.appendChild(header);

  // Mini arc SVG
  const arcContainer = createElement('div');
  setStyles(arcContainer, {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 60 35');
  setStyles(svg as unknown as HTMLElement, {
    width: '60px',
    height: '35px',
  });

  // Draw arc path
  const arcPath = createSvgElement('path');
  arcPath.setAttribute('d', 'M 5 30 Q 30 0 55 30');
  arcPath.setAttribute('fill', 'none');
  arcPath.setAttribute('stroke', 'var(--color-border-subtle)');
  arcPath.setAttribute('stroke-width', '2');
  svg.appendChild(arcPath);

  // Current position dot
  const currentPos = data.currentPhase.position;
  const dotX = 5 + currentPos * 50;
  // Parabolic Y position (peaks at 0.5)
  const dotY = 30 - 30 * (1 - Math.pow(2 * currentPos - 1, 2));

  const dot = createSvgElement('circle');
  dot.setAttribute('cx', String(dotX));
  dot.setAttribute('cy', String(dotY));
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', 'var(--color-accent)');
  svg.appendChild(dot);

  arcContainer.appendChild(svg);
  container.appendChild(arcContainer);

  // Current phase indicator
  const phaseLabel = createElement('div');
  setStyles(phaseLabel, {
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
  });
  phaseLabel.textContent = data.currentPhase.name;
  container.appendChild(phaseLabel);

  // Arc type
  const metric = createElement('div', 'watch-metric', ARC_TYPE_LABELS[data.arcType]);
  container.appendChild(metric);

  return {
    element: container,
    type: 'emotional-arcs',
    device: 'watch',
    ariaLabel: `Emotional arc showing ${data.currentPhase.name} phase of ${ARC_TYPE_LABELS[data.arcType]}`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build emotional arcs for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: EmotionalArcsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Emotional Arc'));
  header.appendChild(createElement('p', '', ARC_TYPE_LABELS[data.arcType]));
  container.appendChild(header);

  // Current phase card
  const currentCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(currentCard, { borderLeft: '3px solid var(--color-accent)' });
  }

  const cardHeader = createElement('div', 'mobile-card-header');
  cardHeader.appendChild(createElement('span', 'mobile-card-title', 'Current Phase'));

  const positionBadge = createElement(
    'span',
    'mobile-card-badge',
    `${Math.round(data.currentPhase.position * 100)}%`
  );
  cardHeader.appendChild(positionBadge);
  currentCard.appendChild(cardHeader);

  // Phase name
  const phaseName = createElement('div');
  setStyles(phaseName, {
    fontSize: '1.2rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
    margin: '8px 0',
  });
  phaseName.textContent = data.currentPhase.name;
  currentCard.appendChild(phaseName);

  // Intensity bar
  const intensityRow = createFlexContainer('row', '8px', 'flex-start', 'center');
  const intensityLabel = createElement('span', '', 'Intensity');
  setStyles(intensityLabel, { fontSize: '0.85rem', color: 'var(--color-text-secondary)' });
  intensityRow.appendChild(intensityLabel);

  const intensityBar = createElement('div');
  setStyles(intensityBar, {
    flex: '1',
    height: '6px',
    background: 'rgba(44, 37, 32, 0.1)',
    borderRadius: isAndroid ? '0' : '3px',
    overflow: 'hidden',
  });

  const intensityFill = createElement('div');
  setStyles(intensityFill, {
    width: `${data.currentPhase.intensity * 100}%`,
    height: '100%',
    background: 'var(--color-accent)',
    borderRadius: isAndroid ? '0' : '3px',
  });
  intensityBar.appendChild(intensityFill);
  intensityRow.appendChild(intensityBar);
  currentCard.appendChild(intensityRow);

  // Description if available
  if (data.currentPhase.description) {
    const desc = createElement('p', 'mobile-insight', data.currentPhase.description);
    currentCard.appendChild(desc);
  }

  container.appendChild(currentCard);

  // Phase timeline card
  const timelineCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(timelineCard, { borderLeft: '3px solid var(--persona-nayan)' });
  }

  const timelineHeader = createElement('div', 'mobile-card-header');
  timelineHeader.appendChild(createElement('span', 'mobile-card-title', 'Journey Phases'));
  timelineCard.appendChild(timelineHeader);

  // Phase dots
  const phaseRow = createElement('div');
  setStyles(phaseRow, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '12px 0',
    position: 'relative',
  });

  // Connecting line
  const line = createElement('div');
  setStyles(line, {
    position: 'absolute',
    top: '50%',
    left: '8px',
    right: '8px',
    height: '2px',
    background: 'var(--color-border-subtle)',
    zIndex: '0',
  });
  phaseRow.appendChild(line);

  // Phase dots
  data.phases.forEach((phase, i) => {
    const isCurrent = phase.name === data.currentPhase.name;
    const isPast = phase.position < data.currentPhase.position;

    const dotWrapper = createElement('div');
    setStyles(dotWrapper, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
      zIndex: '1',
    });

    const dot = createElement('div');
    setStyles(dot, {
      width: isCurrent ? '14px' : '10px',
      height: isCurrent ? '14px' : '10px',
      borderRadius: '50%',
      background: isCurrent
        ? 'var(--color-accent)'
        : isPast
          ? PHASE_COLORS[i % PHASE_COLORS.length]
          : 'var(--color-text-muted)',
      opacity: isCurrent ? '1' : isPast ? '0.8' : '0.4',
    });
    dotWrapper.appendChild(dot);

    // Phase name under dot
    if (isCurrent || data.phases.length <= 4) {
      const label = createElement('div');
      setStyles(label, {
        fontSize: '0.65rem',
        color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        marginTop: '4px',
        textAlign: 'center',
        maxWidth: '50px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      label.textContent = phase.name;
      dotWrapper.appendChild(label);
    }

    phaseRow.appendChild(dotWrapper);
  });

  timelineCard.appendChild(phaseRow);
  container.appendChild(timelineCard);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Emotional arc showing ${ARC_TYPE_LABELS[data.arcType]}. Current phase: ${data.currentPhase.name} at ${Math.round(data.currentPhase.position * 100)}% with ${Math.round(data.currentPhase.intensity * 100)}% intensity.`
    )
  );

  return {
    element: container,
    type: 'emotional-arcs',
    device: 'mobile',
    ariaLabel: `Emotional arc with ${data.phases.length} phases, currently in ${data.currentPhase.name}`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build emotional arcs for tablet with full arc visualization.
 */
function buildTablet(
  container: HTMLElement,
  data: EmotionalArcsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', ARC_TYPE_LABELS[data.arcType]));
  header.appendChild(createElement('p', '', 'Your emotional journey'));
  container.appendChild(header);

  // Main content
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Arc visualization
  const arcSection = createElement('div');
  setStyles(arcSection, { flex: '2', display: 'flex', justifyContent: 'center' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 300 160');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    maxWidth: '350px',
  });

  // Draw main arc
  const arcPath = createSvgElement('path');
  arcPath.setAttribute('d', 'M 20 140 Q 150 10 280 140');
  arcPath.setAttribute('fill', 'none');
  arcPath.setAttribute('stroke', 'var(--color-border-subtle)');
  arcPath.setAttribute('stroke-width', '3');
  svg.appendChild(arcPath);

  // Progress arc (filled portion)
  if (data.currentPhase.position > 0) {
    const progressPath = createSvgElement('path');
    // Approximate the arc up to current position
    const endX = 20 + data.currentPhase.position * 260;
    const peakY = 140 - 130 * (1 - Math.pow(2 * data.currentPhase.position - 1, 2));
    const controlY = 10 + (140 - peakY) * 0.5;

    progressPath.setAttribute('d', `M 20 140 Q ${endX / 2} ${controlY} ${endX} ${peakY}`);
    progressPath.setAttribute('fill', 'none');
    progressPath.setAttribute('stroke', 'var(--color-accent)');
    progressPath.setAttribute('stroke-width', '3');
    progressPath.setAttribute('stroke-linecap', 'round');
    svg.appendChild(progressPath);
  }

  // Phase markers on arc
  data.phases.forEach((phase, i) => {
    const x = 20 + phase.position * 260;
    // Parabolic Y (peaks at 0.5)
    const y = 140 - 130 * (1 - Math.pow(2 * phase.position - 1, 2));

    const isCurrent = phase.name === data.currentPhase.name;
    const isPast = phase.position < data.currentPhase.position;

    // Marker circle
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', isCurrent ? '8' : '5');
    circle.setAttribute('fill', isCurrent
      ? 'var(--color-accent)'
      : isPast
        ? PHASE_COLORS[i % PHASE_COLORS.length]
        : 'var(--color-text-muted)');
    circle.setAttribute('opacity', isCurrent ? '1' : isPast ? '0.8' : '0.4');
    svg.appendChild(circle);

    // Phase label
    const text = createSvgElement('text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y - 15));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)');
    text.setAttribute('font-weight', isCurrent ? '600' : '400');
    text.textContent = phase.name;
    svg.appendChild(text);
  });

  arcSection.appendChild(svg);
  contentGrid.appendChild(arcSection);

  // Right: Phase details
  const detailsSection = createElement('div');
  setStyles(detailsSection, { flex: '1' });

  // Current phase panel
  const currentPanel = createElement('div');
  setStyles(currentPanel, {
    padding: '16px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-subtle)',
    marginBottom: '12px',
  });

  const currentLabel = createElement('div');
  setStyles(currentLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  currentLabel.textContent = 'Current Phase';
  currentPanel.appendChild(currentLabel);

  const phaseTitle = createElement('div');
  setStyles(phaseTitle, {
    fontSize: '1.2rem',
    fontWeight: '600',
    color: 'var(--color-accent)',
    marginBottom: '8px',
  });
  phaseTitle.textContent = data.currentPhase.name;
  currentPanel.appendChild(phaseTitle);

  // Position indicator
  const posRow = createFlexContainer('row', '8px', 'space-between');
  posRow.appendChild(createElement('span', '', 'Journey Progress'));
  const posValue = createElement('span', '', `${Math.round(data.currentPhase.position * 100)}%`);
  setStyles(posValue, { fontWeight: '600', color: 'var(--color-accent)' });
  posRow.appendChild(posValue);
  currentPanel.appendChild(posRow);

  // Intensity indicator
  const intRow = createFlexContainer('row', '8px', 'space-between');
  setStyles(intRow, { marginTop: '8px' });
  intRow.appendChild(createElement('span', '', 'Emotional Intensity'));
  const intValue = createElement('span', '', `${Math.round(data.currentPhase.intensity * 100)}%`);
  setStyles(intValue, { fontWeight: '600' });
  intRow.appendChild(intValue);
  currentPanel.appendChild(intRow);

  // Intensity bar
  const intensityBar = createElement('div');
  setStyles(intensityBar, {
    height: '6px',
    background: 'var(--color-border-subtle)',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '8px',
  });

  const intensityFill = createElement('div');
  setStyles(intensityFill, {
    width: `${data.currentPhase.intensity * 100}%`,
    height: '100%',
    background: 'var(--color-accent)',
    borderRadius: '3px',
  });
  intensityBar.appendChild(intensityFill);
  currentPanel.appendChild(intensityBar);

  // Description if available
  if (data.currentPhase.description) {
    const desc = createElement('p');
    setStyles(desc, {
      fontSize: '0.85rem',
      color: 'var(--color-text-secondary)',
      lineHeight: '1.5',
      marginTop: '12px',
    });
    desc.textContent = data.currentPhase.description;
    currentPanel.appendChild(desc);
  }

  detailsSection.appendChild(currentPanel);

  // Phase list
  const phaseList = createElement('div');
  setStyles(phaseList, {
    padding: '12px',
    background: 'var(--color-background)',
    borderRadius: '8px',
  });

  const listLabel = createElement('div');
  setStyles(listLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  listLabel.textContent = 'All Phases';
  phaseList.appendChild(listLabel);

  data.phases.forEach((phase, i) => {
    const isCurrent = phase.name === data.currentPhase.name;
    const isPast = phase.position < data.currentPhase.position;

    const row = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(row, { marginBottom: '6px' });

    const dot = createElement('div');
    setStyles(dot, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: isCurrent
        ? 'var(--color-accent)'
        : isPast
          ? PHASE_COLORS[i % PHASE_COLORS.length]
          : 'var(--color-text-muted)',
      opacity: isCurrent ? '1' : isPast ? '0.8' : '0.4',
      flexShrink: '0',
    });
    row.appendChild(dot);

    const name = createElement('span', '', phase.name);
    setStyles(name, {
      fontSize: '0.85rem',
      color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      fontWeight: isCurrent ? '600' : '400',
    });
    row.appendChild(name);

    phaseList.appendChild(row);
  });

  detailsSection.appendChild(phaseList);
  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'emotional-arcs',
    device: 'tablet',
    ariaLabel: `${ARC_TYPE_LABELS[data.arcType]} with ${data.phases.length} phases, currently in "${data.currentPhase.name}" at ${Math.round(data.currentPhase.position * 100)}%`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build emotional arcs visualization for the given device context.
 */
export function buildEmotionalArcs(
  container: HTMLElement,
  data: EmotionalArcsData,
  context: DeviceContext
): VisualizationResult {
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data, context);
    case 'tablet':
    case 'desktop':
      return buildTablet(container, data, context);
    default:
      return buildMobile(container, data, context);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildEmotionalArcs;
