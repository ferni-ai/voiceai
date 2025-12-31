/**
 * Emotional Journey Visualization Builder
 *
 * A beautiful, story-driven visualization of your emotional journey.
 * The arc IS the story - showing where you've been and where you're going.
 *
 * Design Philosophy:
 * - The journey arc is the hero - large, flowing, alive
 * - Current position glows with warmth and presence
 * - Past phases show with earned wisdom
 * - Future phases beckon with gentle possibility
 *
 * @module visualizations/builders/emotional-arcs
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
  getCssVar,
  DURATION,
  EASING,
} from '../utils/dom.js';
import type {
  EmotionalArcsData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// DESIGN CONSTANTS - Warm, earthy Ferni palette
// ============================================================================

const ARC_TYPE_LABELS: Record<EmotionalArcsData['arcType'], string> = {
  'hero-journey': 'Hero Journey',
  'growth': 'Growth Arc',
  'recovery': 'Recovery Path',
  'discovery': 'Discovery Trail',
};

// Narrative subtitles for each arc type
const ARC_TYPE_NARRATIVES: Record<EmotionalArcsData['arcType'], string> = {
  'hero-journey': 'Every step forward is courage',
  'growth': 'Becoming who you were meant to be',
  'recovery': 'Finding your way back to yourself',
  'discovery': 'The joy of uncovering what matters',
};

// Phase-specific colors - earthy and warm
const PHASE_COLORS: Record<string, string> = {
  'The Call': '#4a6741',      // Sage green - beginning
  'The Descent': '#a67a6a',   // Terracotta - challenge
  'The Depths': '#5a6b8a',    // Slate blue - transformation
  'The Turn': '#b8956a',      // Golden - breakthrough
  'The Rise': '#3a6b73',      // Teal - emergence
  'Integration': '#4a6741',   // Back to sage - completion
  'default': '#3D5A45',       // Ferni accent
};

// Phase descriptions for narrative
const PHASE_DESCRIPTIONS: Record<string, string> = {
  'The Call': 'Answering what stirs within',
  'The Descent': 'Going deeper into the unknown',
  'The Depths': 'Where transformation happens',
  'The Turn': 'The moment everything shifts',
  'The Rise': 'Building something new',
  'Integration': 'Weaving it all together',
};

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
    const phaseColor = getPhaseColor(phase.name);
    setStyles(dot, {
      width: isCurrent ? '14px' : '10px',
      height: isCurrent ? '14px' : '10px',
      borderRadius: '50%',
      background: isCurrent
        ? phaseColor
        : isPast
          ? phaseColor
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
// TABLET BUILDER - Hero journey arc, story-driven
// ============================================================================

/**
 * Build a beautiful, narrative-focused emotional journey.
 * The arc IS the story - flowing, present, alive.
 */
function buildTablet(
  container: HTMLElement,
  data: EmotionalArcsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  container.className = 'emotional-journey';

  // Inject styles
  injectJourneyStyles();

  const currentPhaseColor = getPhaseColor(data.currentPhase.name);
  const phaseDescription = PHASE_DESCRIPTIONS[data.currentPhase.name] || data.currentPhase.description || '';

  // ========== HEADER - Narrative headline ==========
  const header = createElement('div', 'ej-header');
  
  const eyebrow = createElement('span', 'ej-eyebrow', ARC_TYPE_LABELS[data.arcType].toUpperCase());
  header.appendChild(eyebrow);
  
  const headline = createElement('h3', 'ej-headline', data.currentPhase.name);
  setStyles(headline, { color: currentPhaseColor });
  header.appendChild(headline);
  
  const subheadline = createElement('p', 'ej-subheadline', phaseDescription);
  header.appendChild(subheadline);
  
  container.appendChild(header);

  // ========== HERO - The Journey Arc ==========
  const heroSection = createElement('div', 'ej-hero');
  
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 340 140');
  svg.setAttribute('class', 'ej-svg');
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    height: 'auto',
  });

  // Create gradient definitions
  const defs = createSvgElement('defs');
  
  // Gradient for the journey path
  const pathGradient = createSvgElement('linearGradient');
  pathGradient.setAttribute('id', 'journey-gradient');
  pathGradient.setAttribute('x1', '0%');
  pathGradient.setAttribute('y1', '0%');
  pathGradient.setAttribute('x2', '100%');
  pathGradient.setAttribute('y2', '0%');
  
  // Add gradient stops for each phase
  data.phases.forEach((phase, i) => {
    const stop = createSvgElement('stop');
    stop.setAttribute('offset', `${phase.position * 100}%`);
    stop.setAttribute('stop-color', getPhaseColor(phase.name));
    stop.setAttribute('stop-opacity', phase.position <= data.currentPhase.position ? '1' : '0.25');
    pathGradient.appendChild(stop);
  });
  
  defs.appendChild(pathGradient);
  
  // Glow filter for current position
  const glowFilter = createSvgElement('filter');
  glowFilter.setAttribute('id', 'current-glow');
  glowFilter.setAttribute('x', '-100%');
  glowFilter.setAttribute('y', '-100%');
  glowFilter.setAttribute('width', '300%');
  glowFilter.setAttribute('height', '300%');
  
  const feGaussian = createSvgElement('feGaussianBlur');
  feGaussian.setAttribute('stdDeviation', '4');
  feGaussian.setAttribute('result', 'coloredBlur');
  glowFilter.appendChild(feGaussian);
  
  const feMerge = createSvgElement('feMerge');
  const feMergeNode1 = createSvgElement('feMergeNode');
  feMergeNode1.setAttribute('in', 'coloredBlur');
  const feMergeNode2 = createSvgElement('feMergeNode');
  feMergeNode2.setAttribute('in', 'SourceGraphic');
  feMerge.appendChild(feMergeNode1);
  feMerge.appendChild(feMergeNode2);
  glowFilter.appendChild(feMerge);
  
  defs.appendChild(glowFilter);
  svg.appendChild(defs);

  // Draw the journey path - a beautiful flowing curve
  const startX = 30;
  const endX = 310;
  const pathWidth = endX - startX;
  const baseY = 110;
  const peakY = 25;
  
  // Background path (future - dashed, subtle)
  const bgPath = createSvgElement('path');
  bgPath.setAttribute('d', `M ${startX} ${baseY} Q ${startX + pathWidth * 0.5} ${peakY} ${endX} ${baseY}`);
  bgPath.setAttribute('fill', 'none');
  bgPath.setAttribute('stroke', 'var(--color-border-subtle, rgba(44, 37, 32, 0.12))');
  bgPath.setAttribute('stroke-width', '3');
  bgPath.setAttribute('stroke-linecap', 'round');
  bgPath.setAttribute('stroke-dasharray', '8 6');
  svg.appendChild(bgPath);

  // Progress path (traveled - solid, gradient)
  const progress = data.currentPhase.position;
  if (progress > 0) {
    // Calculate the point on the quadratic bezier
    const progressX = startX + pathWidth * progress;
    // For a quadratic bezier M p0 Q p1 p2, point at t is: (1-t)²p0 + 2(1-t)t*p1 + t²p2
    const t = progress;
    const controlX = startX + pathWidth * 0.5;
    const controlY = peakY;
    const progressY = Math.pow(1-t, 2) * baseY + 2 * (1-t) * t * controlY + Math.pow(t, 2) * baseY;
    
    // Partial quadratic bezier approximation
    const partialControlY = peakY + (baseY - peakY) * (1 - progress * 2);
    
    const progressPath = createSvgElement('path');
    progressPath.setAttribute('d', `M ${startX} ${baseY} Q ${startX + pathWidth * progress * 0.5} ${Math.min(peakY + 20, partialControlY)} ${progressX} ${progressY}`);
    progressPath.setAttribute('fill', 'none');
    progressPath.setAttribute('stroke', 'url(#journey-gradient)');
    progressPath.setAttribute('stroke-width', '4');
    progressPath.setAttribute('stroke-linecap', 'round');
    progressPath.setAttribute('class', 'ej-progress-path');
    svg.appendChild(progressPath);
  }

  // Phase markers
  data.phases.forEach((phase, i) => {
    const t = phase.position;
    const controlX = startX + pathWidth * 0.5;
    const controlY = peakY;
    const x = Math.pow(1-t, 2) * startX + 2 * (1-t) * t * controlX + Math.pow(t, 2) * endX;
    const y = Math.pow(1-t, 2) * baseY + 2 * (1-t) * t * controlY + Math.pow(t, 2) * baseY;
    
    const isCurrent = phase.name === data.currentPhase.name;
    const isPast = phase.position < data.currentPhase.position;
    const phaseColor = getPhaseColor(phase.name);
    
    // Phase marker group
    const markerGroup = createSvgElement('g');
    markerGroup.setAttribute('class', `ej-phase-marker ${isCurrent ? 'ej-current' : ''}`);
    
    if (isCurrent) {
      // Current phase - glowing pulse
      const outerGlow = createSvgElement('circle');
      outerGlow.setAttribute('cx', String(x));
      outerGlow.setAttribute('cy', String(y));
      outerGlow.setAttribute('r', '16');
      outerGlow.setAttribute('fill', phaseColor);
      outerGlow.setAttribute('opacity', '0.15');
      outerGlow.setAttribute('class', 'ej-glow-pulse');
      markerGroup.appendChild(outerGlow);
      
      const innerGlow = createSvgElement('circle');
      innerGlow.setAttribute('cx', String(x));
      innerGlow.setAttribute('cy', String(y));
      innerGlow.setAttribute('r', '10');
      innerGlow.setAttribute('fill', phaseColor);
      innerGlow.setAttribute('opacity', '0.3');
      markerGroup.appendChild(innerGlow);
      
      const marker = createSvgElement('circle');
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
      marker.setAttribute('r', '7');
      marker.setAttribute('fill', phaseColor);
      marker.setAttribute('filter', 'url(#current-glow)');
      markerGroup.appendChild(marker);
      
      const inner = createSvgElement('circle');
      inner.setAttribute('cx', String(x));
      inner.setAttribute('cy', String(y));
      inner.setAttribute('r', '3');
      inner.setAttribute('fill', 'white');
      markerGroup.appendChild(inner);
    } else {
      // Other phases
      const marker = createSvgElement('circle');
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
      marker.setAttribute('r', isPast ? '5' : '4');
      marker.setAttribute('fill', isPast ? phaseColor : 'var(--color-text-dimmed, #c0b8ae)');
      marker.setAttribute('opacity', isPast ? '0.9' : '0.5');
      markerGroup.appendChild(marker);
    }
    
    // Phase label - positioned above or below based on y position
    const labelY = y < 60 ? y + 22 : y - 14;
    const label = createSvgElement('text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(labelY));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', isCurrent ? '11' : '9');
    label.setAttribute('font-weight', isCurrent ? '600' : '500');
    label.setAttribute('fill', isCurrent ? phaseColor : (isPast ? 'var(--color-text-secondary, #5c544a)' : 'var(--color-text-muted, #8a8279)'));
    label.setAttribute('class', 'ej-phase-label');
    label.textContent = phase.name;
    markerGroup.appendChild(label);
    
    svg.appendChild(markerGroup);
  });

  heroSection.appendChild(svg);
  container.appendChild(heroSection);

  // ========== PROGRESS ROW ==========
  const progressRow = createElement('div', 'ej-progress-row');
  
  // Journey progress
  const journeyCard = createElement('div', 'ej-stat-card');
  const journeyLabel = createElement('span', 'ej-stat-label', 'Journey Progress');
  const journeyValue = createElement('span', 'ej-stat-value', `${Math.round(data.currentPhase.position * 100)}%`);
  setStyles(journeyValue, { color: currentPhaseColor });
  journeyCard.appendChild(journeyLabel);
  journeyCard.appendChild(journeyValue);
  
  // Progress bar under the value
  const progressBar = createElement('div', 'ej-progress-bar');
  const progressFill = createElement('div', 'ej-progress-fill');
  setStyles(progressFill, { 
    width: `${data.currentPhase.position * 100}%`,
    background: currentPhaseColor,
  });
  progressBar.appendChild(progressFill);
  journeyCard.appendChild(progressBar);
  progressRow.appendChild(journeyCard);
  
  // Emotional intensity
  const intensityCard = createElement('div', 'ej-stat-card');
  const intensityLabel = createElement('span', 'ej-stat-label', 'Emotional Intensity');
  const intensityValue = createElement('span', 'ej-stat-value', `${Math.round(data.currentPhase.intensity * 100)}%`);
  intensityCard.appendChild(intensityLabel);
  intensityCard.appendChild(intensityValue);
  
  // Intensity visualization - subtle wave
  const intensityBar = createElement('div', 'ej-progress-bar');
  const intensityFill = createElement('div', 'ej-progress-fill');
  setStyles(intensityFill, { 
    width: `${data.currentPhase.intensity * 100}%`,
    background: `linear-gradient(90deg, ${currentPhaseColor}40, ${currentPhaseColor})`,
  });
  intensityBar.appendChild(intensityFill);
  intensityCard.appendChild(intensityBar);
  progressRow.appendChild(intensityCard);
  
  container.appendChild(progressRow);

  // ========== PHASE PILLS ==========
  const phasePills = createElement('div', 'ej-phase-pills');
  
  data.phases.forEach((phase) => {
    const isCurrent = phase.name === data.currentPhase.name;
    const isPast = phase.position < data.currentPhase.position;
    const phaseColor = getPhaseColor(phase.name);
    
    const pill = createElement('div', `ej-pill ${isCurrent ? 'ej-pill-current' : ''} ${isPast ? 'ej-pill-past' : ''}`);
    
    const dot = createElement('span', 'ej-pill-dot');
    setStyles(dot, { background: isCurrent || isPast ? phaseColor : 'var(--color-text-dimmed, #c0b8ae)' });
    pill.appendChild(dot);
    
    const name = createElement('span', 'ej-pill-name', phase.name);
    if (isCurrent) {
      setStyles(name, { color: phaseColor });
    }
    pill.appendChild(name);
    
    phasePills.appendChild(pill);
  });
  
  container.appendChild(phasePills);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `${ARC_TYPE_LABELS[data.arcType]}: Currently in "${data.currentPhase.name}" phase at ${Math.round(data.currentPhase.position * 100)}% progress. ${phaseDescription} Emotional intensity: ${Math.round(data.currentPhase.intensity * 100)}%.`
    )
  );

  return {
    element: container,
    type: 'emotional-arcs',
    device: 'tablet',
    ariaLabel: `${ARC_TYPE_LABELS[data.arcType]}: ${data.currentPhase.name} - ${phaseDescription}`,
  };
}

/**
 * Get color for a phase by name.
 */
function getPhaseColor(name: string): string {
  return PHASE_COLORS[name] || PHASE_COLORS['default'];
}

/**
 * Inject journey-specific styles.
 */
function injectJourneyStyles(): void {
  if (document.getElementById('ej-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'ej-styles';
  style.textContent = `
    .emotional-journey {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      height: 100%;
    }
    
    .ej-header {
      text-align: center;
    }
    
    .ej-eyebrow {
      display: block;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.5625rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--color-text-muted, #8a8279);
      margin-bottom: 4px;
    }
    
    .ej-headline {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.2;
      margin: 0 0 2px;
    }
    
    .ej-subheadline {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.75rem;
      font-style: italic;
      color: var(--color-text-secondary, #5c544a);
      margin: 0;
    }
    
    .ej-hero {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 0;
    }
    
    .ej-svg {
      overflow: visible;
    }
    
    .ej-progress-path {
      transition: stroke-dashoffset 0.6s ease-out;
    }
    
    .ej-phase-label {
      font-family: var(--font-body, 'Inter', sans-serif);
    }
    
    .ej-glow-pulse {
      animation: ej-pulse 2s ease-in-out infinite;
    }
    
    @keyframes ej-pulse {
      0%, 100% { opacity: 0.15; r: 16; }
      50% { opacity: 0.25; r: 18; }
    }
    
    .ej-progress-row {
      display: flex;
      gap: 10px;
    }
    
    .ej-stat-card {
      flex: 1;
      padding: 10px 12px;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: 10px;
    }
    
    .ej-stat-label {
      display: block;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.5625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted, #8a8279);
      margin-bottom: 4px;
    }
    
    .ej-stat-value {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      line-height: 1.2;
      margin-bottom: 6px;
    }
    
    .ej-progress-bar {
      height: 4px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: 2px;
      overflow: hidden;
    }
    
    .ej-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease-out;
    }
    
    .ej-phase-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
    }
    
    .ej-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: var(--color-bg-secondary, #faf9f7);
      border-radius: 100px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    
    .ej-pill:hover {
      transform: scale(1.03);
    }
    
    .ej-pill-current {
      background: var(--color-bg-elevated, #FFFDFB);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    
    .ej-pill-past {
      opacity: 0.85;
    }
    
    .ej-pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    
    .ej-pill-name {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.625rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5c544a);
    }
    
    .ej-pill-current .ej-pill-name {
      font-weight: 600;
    }
    
    @media (prefers-reduced-motion: reduce) {
      .ej-glow-pulse {
        animation: none;
      }
      .ej-progress-path,
      .ej-progress-fill,
      .ej-pill {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
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
