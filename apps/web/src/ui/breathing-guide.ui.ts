/**
 * Breathing Guide UI Component
 *
 * Visual breathing guide synchronized with haptic feedback.
 * Creates a multi-sensory calming experience through sight and touch.
 *
 * @module @ferni/breathing-guide
 */

import { createLogger } from '../utils/logger.js';
import { setEmotionalContext } from './emotional-springs.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('BreathingGuide');

// ============================================================================
// TYPES
// ============================================================================

export type BreathingPattern = 'box' | 'relaxing' | 'energizing' | 'sleep' | 'focus';
export type BreathingPhase = 'inhale' | 'hold' | 'exhale' | 'pause';

export interface BreathingConfig {
  inhaleDuration: number;   // ms
  holdDuration: number;     // ms
  exhaleDuration: number;   // ms
  pauseDuration: number;    // ms
}

export interface BreathingGuideOptions {
  pattern?: BreathingPattern;
  size?: number;
  color?: string;
  showInstructions?: boolean;
  showTimer?: boolean;
  onPhaseChange?: (phase: BreathingPhase) => void;
  onCycleComplete?: (cycleCount: number) => void;
  hapticsEnabled?: boolean;
}

// ============================================================================
// BREATHING PATTERNS
// ============================================================================

const BREATHING_PATTERNS: Record<BreathingPattern, BreathingConfig> = {
  box: {
    inhaleDuration: 4000,
    holdDuration: 4000,
    exhaleDuration: 4000,
    pauseDuration: 4000,
  },
  relaxing: {
    inhaleDuration: 4000,
    holdDuration: 2000,
    exhaleDuration: 6000,
    pauseDuration: 2000,
  },
  energizing: {
    inhaleDuration: 3000,
    holdDuration: 1000,
    exhaleDuration: 3000,
    pauseDuration: 1000,
  },
  sleep: {
    inhaleDuration: 4000,
    holdDuration: 7000,
    exhaleDuration: 8000,
    pauseDuration: 0,
  },
  focus: {
    inhaleDuration: 4000,
    holdDuration: 4000,
    exhaleDuration: 4000,
    pauseDuration: 0,
  },
};

const PHASE_INSTRUCTIONS: Record<BreathingPhase, string> = {
  inhale: 'Breathe in...',
  hold: 'Hold...',
  exhale: 'Breathe out...',
  pause: 'Rest...',
};

const PHASE_COLORS: Record<BreathingPhase, string> = {
  inhale: 'rgba(74, 124, 89, 0.3)',    // Ferni green
  hold: 'rgba(196, 167, 125, 0.3)',    // Warm gold
  exhale: 'rgba(107, 142, 155, 0.3)',  // Calming blue
  pause: 'rgba(139, 115, 85, 0.25)',   // Neutral brown
};

// ============================================================================
// STYLES
// ============================================================================

const BREATHING_STYLES = `
  .ferni-breathing-guide {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    user-select: none;
  }

  .ferni-breathing-orb {
    position: relative;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease-out;
    cursor: pointer;
  }

  .ferni-breathing-orb__core {
    position: absolute;
    width: 60%;
    height: 60%;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%,
      rgba(255, 255, 255, 0.2) 0%,
      rgba(255, 255, 255, 0.05) 50%,
      transparent 70%
    );
  }

  .ferni-breathing-orb__glow {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    filter: blur(20px);
    opacity: 0.5;
    transition: opacity 0.3s ease;
  }

  .ferni-breathing-orb__ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .ferni-breathing-orb__progress {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .ferni-breathing-orb__progress-ring {
    fill: none;
    stroke: var(--breathing-color, rgba(74, 124, 89, 0.5));
    stroke-width: 3;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke 0.5s ease;
  }

  .ferni-breathing-instruction {
    margin-top: 24px;
    font-size: 18px;
    font-weight: 500;
    color: var(--color-text-primary, #ffffff);
    text-align: center;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .ferni-breathing-instruction--visible {
    opacity: 1;
    transform: translateY(0);
  }

  .ferni-breathing-timer {
    margin-top: 8px;
    font-size: 32px;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary, #a0a0a0);
    opacity: 0.8;
  }

  .ferni-breathing-info {
    margin-top: 20px;
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--color-text-muted, #888);
    opacity: 0.7;
  }

  .ferni-breathing-info__item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ferni-breathing-controls {
    margin-top: 24px;
    display: flex;
    gap: 12px;
  }

  .ferni-breathing-controls__button {
    padding: 12px 24px;
    border: none;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .ferni-breathing-controls__button:hover {
    transform: scale(1.02);
  }

  .ferni-breathing-controls__button:focus-visible {
    outline: 2px solid var(--color-accent-primary, #4A7C59);
    outline-offset: 2px;
  }

  .ferni-breathing-controls__button--primary {
    background: var(--color-accent, #4A7C59);
    color: white;
  }

  .ferni-breathing-controls__button--secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-primary, #ffffff);
  }

  @media (prefers-reduced-motion: reduce) {
    .ferni-breathing-orb,
    .ferni-breathing-instruction {
      transition: none;
    }
  }
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createInfoItem(label: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'ferni-breathing-info__item';
  const span = document.createElement('span');
  span.textContent = label;
  item.appendChild(span);
  return item;
}

function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// ============================================================================
// BREATHING GUIDE CLASS
// ============================================================================

export class BreathingGuide {
  private container: HTMLElement;
  private orb!: HTMLElement;
  private instruction!: HTMLElement;
  private timer!: HTMLElement;
  private info!: HTMLElement;
  private progressRing!: SVGCircleElement;

  private pattern: BreathingPattern;
  private config: BreathingConfig;
  private options: BreathingGuideOptions;

  private isRunning = false;
  private currentPhase: BreathingPhase = 'inhale';
  private cycleCount = 0;
  private phaseStartTime = 0;
  private animationFrameId: number | null = null;

  private baseSize: number;
  private expandedScale = 1.3;
  private currentScale = 1;

  // Reference to haptics service (optional)
  private hapticsService: {
    startBreathingHaptics: (options: Partial<BreathingConfig>) => void;
    stopBreathingHaptics: () => void;
  } | null = null;

  constructor(container: HTMLElement, options: BreathingGuideOptions = {}) {
    this.container = container;
    this.options = {
      pattern: 'relaxing',
      size: 200,
      color: '#4A7C59',
      showInstructions: true,
      showTimer: true,
      hapticsEnabled: true,
      ...options,
    };

    this.pattern = this.options.pattern!;
    this.config = BREATHING_PATTERNS[this.pattern];
    this.baseSize = this.options.size!;

    this.injectStyles();
    this.createUI();
    this.setupHaptics();

    log.info('Breathing guide initialized', { pattern: this.pattern });
  }

  private injectStyles(): void {
    if (document.getElementById('ferni-breathing-styles')) return;

    const style = document.createElement('style');
    style.id = 'ferni-breathing-styles';
    style.textContent = BREATHING_STYLES;
    document.head.appendChild(style);
  }

  private createUI(): void {
    clearElement(this.container);
    this.container.className = 'ferni-breathing-guide';

    // Main orb
    this.orb = document.createElement('div');
    this.orb.className = 'ferni-breathing-orb';
    this.orb.style.width = `${this.baseSize}px`;
    this.orb.style.height = `${this.baseSize}px`;
    this.orb.style.background = `radial-gradient(circle at 50% 50%,
      ${this.options.color}40 0%,
      ${this.options.color}20 50%,
      ${this.options.color}10 100%
    )`;

    // Core highlight
    const core = document.createElement('div');
    core.className = 'ferni-breathing-orb__core';
    this.orb.appendChild(core);

    // Glow effect
    const glow = document.createElement('div');
    glow.className = 'ferni-breathing-orb__glow';
    glow.style.background = this.options.color || '#4A7C59';
    this.orb.appendChild(glow);

    // Outer ring
    const ring = document.createElement('div');
    ring.className = 'ferni-breathing-orb__ring';
    this.orb.appendChild(ring);

    // Progress ring (SVG)
    const progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    progressSvg.setAttribute('class', 'ferni-breathing-orb__progress');
    progressSvg.setAttribute('viewBox', `0 0 ${this.baseSize} ${this.baseSize}`);
    progressSvg.setAttribute('aria-hidden', 'true');

    const radius = (this.baseSize - 6) / 2;
    const circumference = 2 * Math.PI * radius;

    this.progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.progressRing.setAttribute('class', 'ferni-breathing-orb__progress-ring');
    this.progressRing.setAttribute('cx', String(this.baseSize / 2));
    this.progressRing.setAttribute('cy', String(this.baseSize / 2));
    this.progressRing.setAttribute('r', String(radius));
    this.progressRing.setAttribute('stroke-dasharray', String(circumference));
    this.progressRing.setAttribute('stroke-dashoffset', String(circumference));

    progressSvg.appendChild(this.progressRing);
    this.orb.appendChild(progressSvg);

    this.container.appendChild(this.orb);

    // Instruction text
    this.instruction = document.createElement('div');
    this.instruction.className = 'ferni-breathing-instruction';
    this.instruction.setAttribute('aria-live', 'polite');
    if (this.options.showInstructions) {
      this.instruction.textContent = t('breathing.tapToBegin');
      this.container.appendChild(this.instruction);
    }

    // Timer
    this.timer = document.createElement('div');
    this.timer.className = 'ferni-breathing-timer';
    this.timer.setAttribute('aria-label', 'Seconds remaining');
    if (this.options.showTimer) {
      this.timer.textContent = '0';
      this.container.appendChild(this.timer);
    }

    // Pattern info
    this.info = document.createElement('div');
    this.info.className = 'ferni-breathing-info';
    this.updateInfoDisplay();
    this.container.appendChild(this.info);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'ferni-breathing-controls';

    const startBtn = document.createElement('button');
    startBtn.className = 'ferni-breathing-controls__button ferni-breathing-controls__button--primary';
    startBtn.textContent = t('common.start');
    startBtn.setAttribute('aria-label', 'Start breathing exercise');
    startBtn.addEventListener('click', () => this.toggle());
    controls.appendChild(startBtn);

    const patternBtn = document.createElement('button');
    patternBtn.className = 'ferni-breathing-controls__button ferni-breathing-controls__button--secondary';
    patternBtn.textContent = t('breathing.pattern');
    patternBtn.setAttribute('aria-label', 'Change breathing pattern');
    patternBtn.addEventListener('click', () => this.cyclePattern());
    controls.appendChild(patternBtn);

    this.container.appendChild(controls);

    // Click to start/stop
    this.orb.addEventListener('click', () => this.toggle());
  }

  private updateInfoDisplay(): void {
    clearElement(this.info);
    this.info.appendChild(createInfoItem(`In: ${this.config.inhaleDuration / 1000}s`));
    this.info.appendChild(createInfoItem(`Hold: ${this.config.holdDuration / 1000}s`));
    this.info.appendChild(createInfoItem(`Out: ${this.config.exhaleDuration / 1000}s`));
  }

  private setupHaptics(): void {
    if (!this.options.hapticsEnabled) return;

    // Try to import haptics service dynamically
    import('../services/haptics.service.js').then(module => {
      const service = module.getHapticsService();
      if (service) {
        this.hapticsService = service;
        log.debug('Haptics service connected');
      }
    }).catch(() => {
      log.debug('Haptics service not available');
    });
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.cycleCount = 0;
    this.currentPhase = 'inhale';
    this.phaseStartTime = performance.now();

    setEmotionalContext('ethereal');

    // Start haptics if available
    if (this.hapticsService && this.options.hapticsEnabled) {
      this.hapticsService.startBreathingHaptics({
        inhaleDuration: this.config.inhaleDuration,
        holdDuration: this.config.holdDuration,
        exhaleDuration: this.config.exhaleDuration,
        pauseDuration: this.config.pauseDuration,
      });
    }

    this.animate();
    log.info('Breathing started', { pattern: this.pattern });
    
    // 🤲 Sidekick: Dispatch breathing exercise event for avatar sidekick
    document.dispatchEvent(new CustomEvent('ferni:breathing-exercise', {
      detail: { pattern: this.pattern }
    }));
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop haptics
    if (this.hapticsService) {
      this.hapticsService.stopBreathingHaptics();
    }

    // Reset UI
    this.updateOrbScale(1);
    this.updateInstruction('Tap to begin');

    log.info('Breathing stopped', { cycleCount: this.cycleCount });
  }

  toggle(): void {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  setPattern(pattern: BreathingPattern): void {
    this.pattern = pattern;
    this.config = BREATHING_PATTERNS[pattern];
    log.debug('Pattern changed', { pattern });

    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  cyclePattern(): void {
    const patterns: BreathingPattern[] = ['box', 'relaxing', 'energizing', 'sleep', 'focus'];
    const currentIndex = patterns.indexOf(this.pattern);
    const nextIndex = (currentIndex + 1) % patterns.length;
    this.setPattern(patterns[nextIndex]);
    this.updateInfoDisplay();
  }

  destroy(): void {
    this.stop();
    clearElement(this.container);
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================

  private animate(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const elapsed = now - this.phaseStartTime;
    const phaseDuration = this.getPhaseDuration(this.currentPhase);

    // Calculate progress through current phase (0-1)
    const progress = Math.min(elapsed / phaseDuration, 1);

    // Update visuals
    this.updateVisuals(progress);

    // Check for phase transition
    if (elapsed >= phaseDuration) {
      this.transitionToNextPhase();
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  private getPhaseDuration(phase: BreathingPhase): number {
    switch (phase) {
      case 'inhale': return this.config.inhaleDuration;
      case 'hold': return this.config.holdDuration;
      case 'exhale': return this.config.exhaleDuration;
      case 'pause': return this.config.pauseDuration;
    }
  }

  private transitionToNextPhase(): void {
    const phases: BreathingPhase[] = ['inhale', 'hold', 'exhale', 'pause'];
    const currentIndex = phases.indexOf(this.currentPhase);

    // Skip phases with 0 duration
    let nextIndex = (currentIndex + 1) % phases.length;
    while (this.getPhaseDuration(phases[nextIndex]) === 0 && nextIndex !== currentIndex) {
      nextIndex = (nextIndex + 1) % phases.length;
    }

    const nextPhase = phases[nextIndex];

    // Check for cycle completion
    if (nextPhase === 'inhale' && this.currentPhase !== 'inhale') {
      this.cycleCount++;
      this.options.onCycleComplete?.(this.cycleCount);
      log.debug('Cycle completed', { count: this.cycleCount });
    }

    this.currentPhase = nextPhase;
    this.phaseStartTime = performance.now();
    this.options.onPhaseChange?.(nextPhase);
  }

  private updateVisuals(progress: number): void {
    // Calculate scale based on phase
    let targetScale: number;
    switch (this.currentPhase) {
      case 'inhale':
        targetScale = 1 + (this.expandedScale - 1) * this.easeOutCubic(progress);
        break;
      case 'hold':
        targetScale = this.expandedScale;
        break;
      case 'exhale':
        targetScale = this.expandedScale - (this.expandedScale - 1) * this.easeInOutCubic(progress);
        break;
      case 'pause':
        targetScale = 1;
        break;
    }

    this.updateOrbScale(targetScale);
    this.updateProgressRing(progress);
    this.updateInstruction(PHASE_INSTRUCTIONS[this.currentPhase]);
    this.updateTimer();

    // Update color based on phase
    const color = PHASE_COLORS[this.currentPhase];
    this.progressRing.style.stroke = color;
  }

  private updateOrbScale(scale: number): void {
    this.currentScale = scale;
    this.orb.style.transform = `scale(${scale})`;
  }

  private updateProgressRing(progress: number): void {
    const radius = (this.baseSize - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress * circumference);
    this.progressRing.setAttribute('stroke-dashoffset', String(offset));
  }

  private updateInstruction(text: string): void {
    if (!this.instruction) return;

    if (this.instruction.textContent !== text) {
      this.instruction.classList.remove('ferni-breathing-instruction--visible');

      setTimeout(() => {
        this.instruction.textContent = text;
        this.instruction.classList.add('ferni-breathing-instruction--visible');
      }, 150);
    } else {
      this.instruction.classList.add('ferni-breathing-instruction--visible');
    }
  }

  private updateTimer(): void {
    if (!this.timer) return;

    const elapsed = performance.now() - this.phaseStartTime;
    const remaining = Math.max(0, this.getPhaseDuration(this.currentPhase) - elapsed);
    const seconds = Math.ceil(remaining / 1000);
    this.timer.textContent = String(seconds);
  }

  // Easing functions
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a breathing guide in the specified container
 */
export function createBreathingGuide(
  container: HTMLElement,
  options?: BreathingGuideOptions
): BreathingGuide {
  return new BreathingGuide(container, options);
}

// ============================================================================
// QUICK BREATHING PATTERNS (for use without full UI)
// ============================================================================

/**
 * Get breathing timing for a specific pattern
 */
export function getBreathingPattern(pattern: BreathingPattern): BreathingConfig {
  return { ...BREATHING_PATTERNS[pattern] };
}

/**
 * Get all available patterns
 */
export function getAvailablePatterns(): BreathingPattern[] {
  return Object.keys(BREATHING_PATTERNS) as BreathingPattern[];
}
