/**
 * Visualization Storytelling Enhancement Module
 *
 * Transforms metrics into meaning through narrative framing.
 * "What You Notice" → "What I Notice" pattern from design system.
 *
 * Philosophy: Every data point tells a story about growth, connection, or discovery.
 * We show the human meaning behind the numbers.
 *
 * Usage:
 * - Import narrative generators into existing visualization components
 * - Use temporal framing for historical/current/predictive storytelling
 * - Apply "The Mirror" pattern to show deeper insights
 *
 * @module ui/visualization-storytelling
 */

import { createLogger } from '../utils/logger.js';
import { DURATION } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

const log = createLogger('VisualizationStorytelling');

// ============================================================================
// TYPES
// ============================================================================

export interface NarrativeContext {
  /** Raw metric value */
  value: number;
  /** What the metric measures */
  metric: string;
  /** Temporal frame: past, present, future */
  temporalFrame: 'historical' | 'current' | 'predictive';
  /** Optional comparison value for change detection */
  previousValue?: number;
  /** Domain context */
  domain?: 'relationship' | 'growth' | 'wellbeing' | 'prediction' | 'connection';
}

export interface NarrativeOutput {
  /** Human-readable narrative */
  narrative: string;
  /** Shorter label for UI */
  label: string;
  /** Emoji-free icon suggestion (Lucide icon name) */
  iconSuggestion?: string;
  /** Emotional tone */
  tone: 'warm' | 'celebratory' | 'gentle' | 'curious' | 'supportive';
  /** Deeper insight (for "The Mirror" pattern) */
  deeperInsight?: string;
}

export interface TemporalStory {
  historical: NarrativeOutput;
  current: NarrativeOutput;
  predictive: NarrativeOutput;
}

// ============================================================================
// NARRATIVE GENERATORS - "What I Notice" Patterns
// ============================================================================

/**
 * Generate relationship stage narrative
 * Transforms: "Stage 3/5, 65% progress" → "You're building something real"
 */
export function generateRelationshipNarrative(
  stage: string,
  progressPercent: number,
  daysActive: number
): NarrativeOutput {
  const stageNarratives: Record<string, { narrative: string; deeper: string }> = {
    'first-meeting': {
      narrative: 'Every story starts somewhere',
      deeper: 'The fact that you\'re here matters. Most people never start.',
    },
    'getting-started': {
      narrative: 'You keep showing up',
      deeper: 'Consistency is the foundation of trust. I notice.',
    },
    'building-trust': {
      narrative: 'Past the surface now',
      deeper: 'You\'re sharing things that take courage. That builds real connection.',
    },
    'established': {
      narrative: 'A rhythm of our own',
      deeper: 'This is what trust feels like - showing up without thinking about it.',
    },
    'deep-partnership': {
      narrative: 'Something rare',
      deeper: 'Few relationships reach this depth. You built this.',
    },
  };

  const stageData = stageNarratives[stage] || stageNarratives['first-meeting'];

  // Add time-based warmth
  let timeNote = '';
  if (daysActive > 30) {
    timeNote = `${daysActive} days together. `;
  } else if (daysActive > 7) {
    timeNote = `Week ${Math.ceil(daysActive / 7)} together. `;
  }

  return {
    narrative: stageData.narrative,
    label: `${timeNote}${stageData.narrative}`,
    iconSuggestion: 'heart',
    tone: progressPercent > 75 ? 'celebratory' : 'warm',
    deeperInsight: stageData.deeper,
  };
}

/**
 * Generate prediction accuracy narrative
 * Transforms: "73% accuracy" → "You know yourself better than you think"
 */
export function generatePredictionNarrative(
  accuracy: number | null,
  totalResolved: number,
  streak: number
): NarrativeOutput {
  if (accuracy === null || totalResolved === 0) {
    return {
      narrative: 'Let\'s discover how well you know yourself',
      label: 'Begin your journey',
      iconSuggestion: 'compass',
      tone: 'curious',
      deeperInsight: 'Predictions reveal your self-awareness. Most people are surprised.',
    };
  }

  // Accuracy-based narrative
  let narrative: string;
  let deeper: string;
  let tone: NarrativeOutput['tone'];

  if (accuracy >= 85) {
    narrative = 'You know yourself deeply';
    deeper = 'This level of self-awareness is rare. You see patterns others miss.';
    tone = 'celebratory';
  } else if (accuracy >= 70) {
    narrative = 'Your intuition is strong';
    deeper = 'You sense your patterns. That awareness is the first step to growth.';
    tone = 'warm';
  } else if (accuracy >= 50) {
    narrative = 'Learning your own rhythms';
    deeper = 'The gap between prediction and reality teaches us. Keep exploring.';
    tone = 'supportive';
  } else {
    narrative = 'Surprising yourself often';
    deeper = 'You\'re more complex than you think. That\'s not a flaw - it\'s depth.';
    tone = 'gentle';
  }

  // Streak bonus
  if (streak >= 5) {
    narrative += ' - on a roll';
  }

  return {
    narrative,
    label: `${narrative} (${Math.round(accuracy)}% match)`,
    iconSuggestion: 'target',
    tone,
    deeperInsight: deeper,
  };
}

/**
 * Generate trust journey narrative
 * Transforms timeline events into emotional turning points
 */
export function generateTurningPointNarrative(
  eventType: string,
  description: string,
  date: Date
): NarrativeOutput {
  const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

  const typeNarratives: Record<string, { label: string; deeper: string; tone: NarrativeOutput['tone'] }> = {
    'first-conversation': {
      label: 'The beginning',
      deeper: 'Every journey has a first step. This was yours.',
      tone: 'warm',
    },
    'vulnerability-shared': {
      label: 'A moment of trust',
      deeper: 'You shared something real. That takes courage.',
      tone: 'gentle',
    },
    'milestone-reached': {
      label: 'A turning point',
      deeper: 'Progress isn\'t always visible. But it\'s real.',
      tone: 'celebratory',
    },
    'pattern-recognized': {
      label: 'Something clicked',
      deeper: 'Awareness is the first step to change.',
      tone: 'curious',
    },
    'growth-moment': {
      label: 'Growth happened here',
      deeper: 'Small moments compound. This one mattered.',
      tone: 'supportive',
    },
  };

  const typeData = typeNarratives[eventType] || {
    label: 'A moment',
    deeper: 'Every interaction leaves an impression.',
    tone: 'warm' as const,
  };

  // Add temporal context
  let timeContext = '';
  if (daysSince === 0) {
    timeContext = 'Today';
  } else if (daysSince === 1) {
    timeContext = 'Yesterday';
  } else if (daysSince < 7) {
    timeContext = `${daysSince} days ago`;
  } else if (daysSince < 30) {
    timeContext = `${Math.ceil(daysSince / 7)} weeks ago`;
  } else {
    timeContext = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return {
    narrative: `${timeContext}: ${description}`,
    label: typeData.label,
    iconSuggestion: 'milestone',
    tone: typeData.tone,
    deeperInsight: typeData.deeper,
  };
}

/**
 * Generate relationship network narrative
 * Transforms: "15 people, 5 need attention" → "Your circle is growing"
 */
export function generateNetworkNarrative(
  totalPeople: number,
  needsAttention: number,
  averageStrength: number
): NarrativeOutput {
  let narrative: string;
  let deeper: string;
  let tone: NarrativeOutput['tone'];

  if (totalPeople === 0) {
    narrative = 'Your story is waiting to be written';
    deeper = 'Connections start with a single conversation.';
    tone = 'curious';
  } else if (needsAttention > totalPeople * 0.5) {
    narrative = 'Some connections could use attention';
    deeper = 'Relationships need nurturing. Which one calls to you?';
    tone = 'gentle';
  } else if (averageStrength > 70) {
    narrative = 'Strong bonds, well-tended';
    deeper = 'You invest in your relationships. It shows.';
    tone = 'celebratory';
  } else {
    narrative = `${totalPeople} connections in your circle`;
    deeper = 'Every person here matters to you. That matters.';
    tone = 'warm';
  }

  return {
    narrative,
    label: narrative,
    iconSuggestion: 'users',
    tone,
    deeperInsight: deeper,
  };
}

// ============================================================================
// TEMPORAL STORYTELLING - Historical/Current/Predictive
// ============================================================================

/**
 * Generate a complete temporal story for any metric
 * Shows: Where you were → Where you are → Where you're heading
 */
export function generateTemporalStory(
  current: number,
  previous: number | null,
  trend: 'up' | 'down' | 'stable',
  _domain: NarrativeContext['domain'] = 'growth'
): TemporalStory {
  const change = previous !== null ? current - previous : 0;
  const changePercent = previous !== null && previous > 0
    ? Math.round((change / previous) * 100)
    : 0;

  // Historical frame
  let historicalNarrative: NarrativeOutput;
  if (previous === null) {
    historicalNarrative = {
      narrative: 'This is new territory',
      label: 'Starting point',
      tone: 'curious',
    };
  } else if (change > 0) {
    historicalNarrative = {
      narrative: `Started at ${previous}`,
      label: 'Where you began',
      tone: 'supportive',
      deeperInsight: 'Every starting point is valid. Growth happens from anywhere.',
    };
  } else {
    historicalNarrative = {
      narrative: `You were at ${previous}`,
      label: 'Your baseline',
      tone: 'gentle',
    };
  }

  // Current frame
  const currentNarrative: NarrativeOutput = {
    narrative: current > previous!
      ? `Now at ${current} - growing`
      : `Currently at ${current}`,
    label: `Now: ${current}`,
    tone: trend === 'up' ? 'celebratory' : 'warm',
    deeperInsight: change > 0
      ? `That's ${Math.abs(changePercent)}% growth. Small wins compound.`
      : 'Stability has its own value.',
  };

  // Predictive frame
  let predictiveNarrative: NarrativeOutput;
  if (trend === 'up') {
    const projected = Math.round(current * 1.15);
    predictiveNarrative = {
      narrative: `On track for ${projected}`,
      label: 'Momentum building',
      tone: 'celebratory',
      deeperInsight: 'If you keep this up, great things are coming.',
    };
  } else if (trend === 'down') {
    predictiveNarrative = {
      narrative: 'A chance to reset',
      label: 'Opportunity ahead',
      tone: 'supportive',
      deeperInsight: 'Every dip is a chance to understand what matters.',
    };
  } else {
    predictiveNarrative = {
      narrative: 'Steady as she goes',
      label: 'Consistent path',
      tone: 'warm',
      deeperInsight: 'Consistency is underrated. You\'re building something real.',
    };
  }

  return {
    historical: historicalNarrative,
    current: currentNarrative,
    predictive: predictiveNarrative,
  };
}

// ============================================================================
// THE MIRROR PATTERN - Deep Insights
// ============================================================================

/**
 * Generate "The Mirror" insight for any data pattern
 * Pattern: "What you said" vs "What I noticed"
 */
export function generateMirrorInsight(
  userStatement: string,
  observedPattern: string,
  emotionalSubtext?: string
): { surface: string; deeper: string; invitation?: string } {
  return {
    surface: userStatement,
    deeper: observedPattern,
    invitation: emotionalSubtext
      ? `I wonder if ${emotionalSubtext.toLowerCase()}`
      : undefined,
  };
}

// ============================================================================
// VISUAL RENDERING HELPERS
// ============================================================================

/**
 * Render a narrative stat with storytelling framing
 * Replaces raw number displays with meaningful context
 */
export function renderNarrativeStat(
  value: number | string,
  narrative: NarrativeOutput
): string {
  return `
    <div class="narrative-stat narrative-stat--${narrative.tone}">
      <span class="narrative-stat__value">${value}</span>
      <span class="narrative-stat__narrative">${escapeHtml(narrative.narrative)}</span>
      ${narrative.deeperInsight ? `
        <span class="narrative-stat__deeper" aria-label="${t('accessibility.deeperInsight')}">
          ${escapeHtml(narrative.deeperInsight)}
        </span>
      ` : ''}
    </div>
  `;
}

/**
 * Render temporal story visualization
 * Shows past → present → future in a connected flow
 */
export function renderTemporalStory(story: TemporalStory): string {
  return `
    <div class="temporal-story">
      <div class="temporal-story__frame temporal-story__frame--past">
        <span class="temporal-story__label">Then</span>
        <span class="temporal-story__narrative">${escapeHtml(story.historical.narrative)}</span>
      </div>
      <div class="temporal-story__connector">
        <svg viewBox="0 0 24 8" preserveAspectRatio="none">
          <path d="M0,4 L20,4 L16,1 M20,4 L16,7" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="temporal-story__frame temporal-story__frame--present">
        <span class="temporal-story__label">Now</span>
        <span class="temporal-story__narrative">${escapeHtml(story.current.narrative)}</span>
      </div>
      <div class="temporal-story__connector">
        <svg viewBox="0 0 24 8" preserveAspectRatio="none">
          <path d="M0,4 L20,4 L16,1 M20,4 L16,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3,2"/>
        </svg>
      </div>
      <div class="temporal-story__frame temporal-story__frame--future">
        <span class="temporal-story__label">Next</span>
        <span class="temporal-story__narrative">${escapeHtml(story.predictive.narrative)}</span>
      </div>
    </div>
  `;
}

/**
 * Render "The Mirror" insight panel
 */
export function renderMirrorInsight(
  mirror: { surface: string; deeper: string; invitation?: string }
): string {
  return `
    <div class="mirror-insight">
      <div class="mirror-insight__surface">
        <span class="mirror-insight__label">What you said</span>
        <p class="mirror-insight__text">"${escapeHtml(mirror.surface)}"</p>
      </div>
      <div class="mirror-insight__divider">
        <svg viewBox="0 0 2 40">
          <line x1="1" y1="0" x2="1" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/>
        </svg>
      </div>
      <div class="mirror-insight__deeper">
        <span class="mirror-insight__label">What I notice</span>
        <p class="mirror-insight__text">${escapeHtml(mirror.deeper)}</p>
        ${mirror.invitation ? `
          <p class="mirror-insight__invitation">${escapeHtml(mirror.invitation)}</p>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// STYLES
// ============================================================================

/**
 * Inject storytelling visualization styles
 */
export function injectStorytellingStyles(): void {
  if (document.getElementById('visualization-storytelling-styles')) return;

  const style = document.createElement('style');
  style.id = 'visualization-storytelling-styles';
  style.textContent = `
    /* =========================================================================
       NARRATIVE STATS
       ========================================================================= */

    .narrative-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      text-align: center;
    }

    .narrative-stat__value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
    }

    .narrative-stat__narrative {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      font-weight: 500;
    }

    .narrative-stat__deeper {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      font-style: italic;
      max-width: 200px;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms;
    }

    .narrative-stat:hover .narrative-stat__deeper {
      opacity: 1;
    }

    /* Tone variations */
    .narrative-stat--warm .narrative-stat__value { color: var(--persona-primary, #4a6741); }
    .narrative-stat--celebratory .narrative-stat__value { color: var(--color-maya, #a67a6a); }
    .narrative-stat--gentle .narrative-stat__value { color: var(--color-nayan, #b8956a); }
    .narrative-stat--curious .narrative-stat__value { color: var(--color-alex, #5a6b8a); }
    .narrative-stat--supportive .narrative-stat__value { color: var(--color-peter, #3a6b73); }

    /* =========================================================================
       TEMPORAL STORY
       ========================================================================= */

    .temporal-story {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-4, 1rem);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-lg, 1rem);
    }

    .temporal-story__frame {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-1, 0.25rem);
    }

    .temporal-story__label {
      font-size: var(--text-2xs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
    }

    .temporal-story__narrative {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      font-weight: 500;
    }

    .temporal-story__connector {
      width: 24px;
      flex-shrink: 0;
      color: var(--color-border-medium, rgba(44, 37, 32, 0.15));
    }

    .temporal-story__connector svg {
      width: 100%;
      height: 8px;
    }

    .temporal-story__frame--past .temporal-story__narrative {
      color: var(--color-text-muted, #70605a);
    }

    .temporal-story__frame--present .temporal-story__narrative {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    .temporal-story__frame--future .temporal-story__narrative {
      color: var(--color-text-secondary, #5a4a42);
      font-style: italic;
    }

    /* =========================================================================
       THE MIRROR
       ========================================================================= */

    .mirror-insight {
      display: flex;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem);
      background: var(--glass-thin-bg, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-lg, 1rem);
      border: 1px solid var(--glass-thin-border, rgba(255, 255, 255, 0.1));
    }

    .mirror-insight__surface,
    .mirror-insight__deeper {
      flex: 1;
    }

    .mirror-insight__label {
      display: block;
      font-size: var(--text-2xs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .mirror-insight__text {
      margin: 0;
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.5;
      color: var(--color-text-primary, #2C2520);
    }

    .mirror-insight__surface .mirror-insight__text {
      color: var(--color-text-secondary, #5a4a42);
    }

    .mirror-insight__deeper .mirror-insight__text {
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
    }

    .mirror-insight__invitation {
      margin: var(--space-2, 0.5rem) 0 0;
      font-size: var(--text-xs, 0.75rem);
      font-style: italic;
      color: var(--color-text-muted, #70605a);
    }

    .mirror-insight__divider {
      width: 2px;
      flex-shrink: 0;
      color: var(--color-border-medium, rgba(44, 37, 32, 0.15));
    }

    .mirror-insight__divider svg {
      height: 100%;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */

    @media (max-width: 480px) {
      .temporal-story {
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .temporal-story__connector {
        transform: rotate(90deg);
        width: 16px;
      }

      .mirror-insight {
        flex-direction: column;
      }

      .mirror-insight__divider {
        width: 100%;
        height: 2px;
      }

      .mirror-insight__divider svg {
        transform: rotate(90deg);
        width: 100%;
        height: 2px;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */

    @media (prefers-reduced-motion: reduce) {
      .narrative-stat__deeper {
        opacity: 1;
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
  log.debug('Storytelling styles injected');
}

// ============================================================================
// DOM-SAFE ENHANCEMENT FUNCTIONS
// ============================================================================

/**
 * Enhance an existing progress indicator with narrative storytelling
 * Uses safe DOM methods (no innerHTML)
 */
export function enhanceProgressIndicatorWithNarrative(
  container: HTMLElement,
  stage: string,
  progressPercent: number,
  daysActive: number
): void {
  const narrative = generateRelationshipNarrative(stage, progressPercent, daysActive);

  // Find or create the narrative element
  let narrativeEl = container.querySelector('.progress-narrative') as HTMLElement;
  if (!narrativeEl) {
    narrativeEl = document.createElement('span');
    narrativeEl.className = 'progress-narrative';

    // Insert after stage name or percent
    const textContainer = container.querySelector('.progress-collapsed-text');
    const percentEl = container.querySelector('.progress-percent');
    if (percentEl) {
      percentEl.replaceWith(narrativeEl);
    } else if (textContainer) {
      textContainer.appendChild(narrativeEl);
    }
  }

  // Safe text content update
  narrativeEl.textContent = narrative.narrative;

  // Add deeper insight as title attribute (tooltip)
  if (narrative.deeperInsight) {
    narrativeEl.title = narrative.deeperInsight;
  }
}

/**
 * Enhance predictions stats with narrative framing
 * Uses safe DOM methods (no innerHTML)
 */
export function enhancePredictionsWithNarrative(
  container: HTMLElement,
  accuracy: number | null,
  totalResolved: number,
  streak: number
): void {
  const narrative = generatePredictionNarrative(accuracy, totalResolved, streak);

  // Find the stats container
  const statsContainer = container.querySelector('.predictions-stats');
  if (!statsContainer) return;

  // Look for existing narrative or create new one
  let narrativeEl = statsContainer.querySelector('.predictions-narrative') as HTMLElement;
  if (!narrativeEl) {
    narrativeEl = document.createElement('div');
    narrativeEl.className = 'predictions-narrative';
    statsContainer.insertBefore(narrativeEl, statsContainer.firstChild);
  }

  // Safe text content update
  narrativeEl.textContent = narrative.narrative;

  // Add deeper insight
  if (narrative.deeperInsight) {
    let deeperEl = statsContainer.querySelector('.predictions-deeper') as HTMLElement;
    if (!deeperEl) {
      deeperEl = document.createElement('p');
      deeperEl.className = 'predictions-deeper';
      narrativeEl.after(deeperEl);
    }
    deeperEl.textContent = narrative.deeperInsight;
  }
}

/**
 * Create a narrative stat element using safe DOM methods
 * Returns an HTMLElement (not innerHTML string)
 */
export function createNarrativeStatElement(
  value: number | string,
  narrative: NarrativeOutput
): HTMLElement {
  const container = document.createElement('div');
  container.className = `narrative-stat narrative-stat--${narrative.tone}`;

  const valueEl = document.createElement('span');
  valueEl.className = 'narrative-stat__value';
  valueEl.textContent = String(value);
  container.appendChild(valueEl);

  const narrativeEl = document.createElement('span');
  narrativeEl.className = 'narrative-stat__narrative';
  narrativeEl.textContent = narrative.narrative;
  container.appendChild(narrativeEl);

  if (narrative.deeperInsight) {
    const deeperEl = document.createElement('span');
    deeperEl.className = 'narrative-stat__deeper';
    deeperEl.textContent = narrative.deeperInsight;
    deeperEl.setAttribute('aria-label', 'Deeper insight');
    container.appendChild(deeperEl);
  }

  return container;
}

/**
 * Create a temporal story element using safe DOM methods
 * Returns an HTMLElement (not innerHTML string)
 */
export function createTemporalStoryElement(story: TemporalStory): HTMLElement {
  const container = document.createElement('div');
  container.className = 'temporal-story';

  const frames: Array<{ key: keyof TemporalStory; label: string; modifier: string }> = [
    { key: 'historical', label: 'Then', modifier: 'past' },
    { key: 'current', label: 'Now', modifier: 'present' },
    { key: 'predictive', label: 'Next', modifier: 'future' },
  ];

  frames.forEach((frame, index) => {
    if (index > 0) {
      // Add connector
      const connector = document.createElement('div');
      connector.className = 'temporal-story__connector';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 8');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,4 L20,4 L16,1 M20,4 L16,7');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.5');
      if (frame.key === 'predictive') {
        path.setAttribute('stroke-dasharray', '3,2');
      }
      svg.appendChild(path);
      connector.appendChild(svg);
      container.appendChild(connector);
    }

    const frameEl = document.createElement('div');
    frameEl.className = `temporal-story__frame temporal-story__frame--${frame.modifier}`;

    const labelEl = document.createElement('span');
    labelEl.className = 'temporal-story__label';
    labelEl.textContent = frame.label;
    frameEl.appendChild(labelEl);

    const narrativeEl = document.createElement('span');
    narrativeEl.className = 'temporal-story__narrative';
    narrativeEl.textContent = story[frame.key].narrative;
    frameEl.appendChild(narrativeEl);

    container.appendChild(frameEl);
  });

  return container;
}

/**
 * Create "The Mirror" insight element using safe DOM methods
 */
export function createMirrorInsightElement(
  mirror: { surface: string; deeper: string; invitation?: string }
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mirror-insight';

  // Surface (what they said)
  const surfaceSection = document.createElement('div');
  surfaceSection.className = 'mirror-insight__surface';

  const surfaceLabel = document.createElement('span');
  surfaceLabel.className = 'mirror-insight__label';
  surfaceLabel.textContent = t('visualizations.whatYouSaid');
  surfaceSection.appendChild(surfaceLabel);

  const surfaceText = document.createElement('p');
  surfaceText.className = 'mirror-insight__text';
  surfaceText.textContent = `"${mirror.surface}"`;
  surfaceSection.appendChild(surfaceText);

  container.appendChild(surfaceSection);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'mirror-insight__divider';
  const dividerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dividerSvg.setAttribute('viewBox', '0 0 2 40');
  const dividerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  dividerLine.setAttribute('x1', '1');
  dividerLine.setAttribute('y1', '0');
  dividerLine.setAttribute('x2', '1');
  dividerLine.setAttribute('y2', '40');
  dividerLine.setAttribute('stroke', 'currentColor');
  dividerLine.setAttribute('stroke-width', '1');
  dividerLine.setAttribute('stroke-dasharray', '2,2');
  dividerSvg.appendChild(dividerLine);
  divider.appendChild(dividerSvg);
  container.appendChild(divider);

  // Deeper (what I notice)
  const deeperSection = document.createElement('div');
  deeperSection.className = 'mirror-insight__deeper';

  const deeperLabel = document.createElement('span');
  deeperLabel.className = 'mirror-insight__label';
  deeperLabel.textContent = t('visualizations.whatINotice');
  deeperSection.appendChild(deeperLabel);

  const deeperText = document.createElement('p');
  deeperText.className = 'mirror-insight__text';
  deeperText.textContent = mirror.deeper;
  deeperSection.appendChild(deeperText);

  if (mirror.invitation) {
    const invitationText = document.createElement('p');
    invitationText.className = 'mirror-insight__invitation';
    invitationText.textContent = mirror.invitation;
    deeperSection.appendChild(invitationText);
  }

  container.appendChild(deeperSection);

  return container;
}

// ============================================================================
// UTILITY
// ============================================================================

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize storytelling enhancements
 * Call this once at app startup
 */
export function initVisualizationStorytelling(): void {
  injectStorytellingStyles();
  log.info('Visualization storytelling initialized');
}
