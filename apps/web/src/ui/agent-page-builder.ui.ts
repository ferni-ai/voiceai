/**
 * Agent Page Builder UI
 *
 * Multi-step wizard for creating and deploying agent landing pages.
 * Uses safe DOM manipulation methods to prevent XSS vulnerabilities.
 *
 * @module agent-page-builder.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { toast } from './toast.ui.js';
import { apiPost } from '../utils/api.js';
import { escapeHtml, escapeAttr } from './engagement-components.js';

const log = createLogger('AgentPageBuilder');

// ============================================================================
// TYPES
// ============================================================================

export interface AgentConfig {
  id: string;
  name: string;
  displayName?: string;
  initials: string;
  tagline: string;
  description: string;
}

export interface BrandConfig {
  primary: string;
  secondary?: string;
  fontFamily?: string;
}

export interface PageBuilderConfig {
  agent: AgentConfig;
  brand: BrandConfig;
  theme: 'zen' | 'dark';
  subdomain?: string;
}

type BuilderStep = 'agent' | 'brand' | 'voice' | 'preview';

export interface PageBuilderCallbacks {
  onClose?: () => void;
  onDeployed?: (url: string, siteId: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS: BuilderStep[] = ['agent', 'brand', 'voice', 'preview'];

const STEP_LABELS: Record<BuilderStep, string> = {
  agent: 'Agent',
  brand: 'Brand',
  voice: 'Voice',
  preview: 'Deploy',
};

const STEP_DESCRIPTIONS: Record<BuilderStep, string> = {
  agent: 'Tell us about your agent',
  brand: 'Choose your colors',
  voice: 'Add a custom voice (optional)',
  preview: 'Review and launch',
};

const PRESET_COLORS = [
  { name: 'Vanguard Red', value: '#96151D' },
  { name: 'Forest Green', value: '#2D5A27' },
  { name: 'Ocean Blue', value: '#1E4D8C' },
  { name: 'Royal Purple', value: '#5B2C6F' },
  { name: 'Sunset Orange', value: '#D35400' },
  { name: 'Slate Gray', value: '#34495E' },
];

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .page-builder-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal-backdrop);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity ${DURATION.NORMAL}ms ${EASING.DECELERATE};
  }

  .page-builder-overlay.visible {
    opacity: 1;
  }

  .page-builder {
    position: relative;
    width: 90vw;
    max-width: 640px;
    max-height: 85vh;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-2xl);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: translateY(20px);
    opacity: 0;
    transition:
      transform ${DURATION.SLOW}ms ${EASING.SPRING},
      opacity ${DURATION.NORMAL}ms ${EASING.DECELERATE};
  }

  .page-builder-overlay.visible .page-builder {
    transform: translateY(0);
    opacity: 1;
  }

  .builder-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .builder-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .builder-close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: var(--radius-full);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: background ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .builder-close:hover,
  .builder-close:focus-visible {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
  }

  .builder-close:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .builder-progress {
    display: flex;
    padding: var(--space-md) var(--space-lg);
    gap: var(--space-xs);
    background: var(--color-bg-secondary);
  }

  .progress-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    cursor: pointer;
    padding: var(--space-sm);
    border-radius: var(--radius-lg);
    transition: background ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .progress-step:hover {
    background: var(--color-bg-tertiary);
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--color-border-medium);
    transition:
      background ${DURATION.NORMAL}ms ${EASING.DECELERATE},
      transform ${DURATION.NORMAL}ms ${EASING.SPRING};
  }

  .progress-step.active .progress-dot {
    background: var(--color-accent-primary);
    transform: scale(1.25);
  }

  .progress-step.completed .progress-dot {
    background: var(--color-semantic-success);
  }

  .progress-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    transition: color ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .progress-step.active .progress-label {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .builder-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-xl) var(--space-lg);
  }

  .step-header {
    margin-bottom: var(--space-lg);
  }

  .step-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-xs);
  }

  .step-description {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .form-group {
    margin-bottom: var(--space-lg);
  }

  .form-label {
    display: block;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: var(--space-xs);
  }

  .form-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    transition:
      border-color ${DURATION.FAST}ms ${EASING.DECELERATE},
      box-shadow ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 3px var(--color-accent-primary-alpha-20);
  }

  .form-input::placeholder {
    color: var(--color-text-dimmed);
  }

  .form-textarea {
    min-height: 80px;
    resize: vertical;
  }

  .form-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-2xs);
  }

  .color-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .color-preset {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    border: 2px solid transparent;
    cursor: pointer;
    transition:
      transform ${DURATION.FAST}ms ${EASING.SPRING},
      border-color ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .color-preset:hover {
    transform: scale(1.1);
  }

  .color-preset:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .color-preset.selected {
    border-color: var(--color-text-primary);
  }

  .color-custom {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .color-input {
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  .voice-upload {
    border: 2px dashed var(--color-border-medium);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    text-align: center;
    transition:
      border-color ${DURATION.FAST}ms ${EASING.DECELERATE},
      background ${DURATION.FAST}ms ${EASING.DECELERATE};
    cursor: pointer;
  }

  .voice-upload:hover,
  .voice-upload.dragover {
    border-color: var(--color-accent-primary);
    background: var(--color-accent-primary-alpha-10);
  }

  .voice-upload-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-md);
    color: var(--color-text-muted);
  }

  .voice-upload-text {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-xs);
  }

  .voice-upload-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .voice-file-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    margin-top: var(--space-md);
  }

  .voice-file-name {
    flex: 1;
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }

  .voice-file-remove {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--text-xs);
    color: var(--color-semantic-error);
    background: transparent;
    border: 1px solid var(--color-semantic-error);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background ${DURATION.FAST}ms ${EASING.DECELERATE};
  }

  .voice-file-remove:hover {
    background: var(--color-semantic-error-alpha-10);
  }

  .preview-card {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .preview-header {
    padding: var(--space-lg);
    text-align: center;
  }

  .preview-avatar {
    width: 80px;
    height: 80px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-2xl);
    font-weight: 700;
    color: white;
    margin: 0 auto var(--space-md);
    box-shadow: var(--shadow-lg);
  }

  .preview-name {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2xs);
  }

  .preview-tagline {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .preview-details {
    padding: var(--space-lg);
    border-top: 1px solid var(--color-border-subtle);
  }

  .preview-row {
    display: flex;
    justify-content: space-between;
    padding: var(--space-sm) 0;
  }

  .preview-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .preview-value {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .subdomain-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-xs) var(--space-md);
  }

  .subdomain-prefix,
  .subdomain-suffix {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .subdomain-input {
    flex: 1;
    padding: var(--space-sm) 0;
    font-size: var(--text-base);
    color: var(--color-text-primary);
    background: transparent;
    border: none;
  }

  .subdomain-input:focus {
    outline: none;
  }

  .builder-footer {
    display: flex;
    justify-content: space-between;
    padding: var(--space-lg);
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-bg-secondary);
  }

  .btn {
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      background ${DURATION.FAST}ms ${EASING.DECELERATE},
      transform ${DURATION.FAST}ms ${EASING.SPRING};
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--color-border-medium);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    background: var(--color-bg-tertiary);
  }

  .btn-primary {
    background: var(--color-accent-primary);
    border: none;
    color: white;
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-deploy {
    background: var(--color-semantic-success);
  }

  .btn-deploy:hover {
    background: var(--color-semantic-success-hover);
  }

  .deploying {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: var(--radius-full);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .skip-link {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: underline;
    cursor: pointer;
    margin-top: var(--space-md);
    display: inline-block;
  }

  .skip-link:hover {
    color: var(--color-text-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    .page-builder,
    .page-builder-overlay,
    .progress-dot,
    .color-preset,
    .btn {
      transition: none;
    }
    .spinner {
      animation: none;
    }
  }
`;

// ============================================================================
// DOM HELPERS (Safe methods)
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    });
  }
  if (children) {
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    });
  }
  return el;
}

function createSvgElement(svg: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = svg.trim();
  return template.content.firstChild as SVGElement;
}

// ============================================================================
// BUILDER CLASS
// ============================================================================

export class AgentPageBuilder {
  private container: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private callbacks: PageBuilderCallbacks = {};

  private currentStep: BuilderStep = 'agent';
  private completedSteps: Set<BuilderStep> = new Set();

  private config: Partial<PageBuilderConfig> = {
    agent: {
      id: '',
      name: '',
      initials: '',
      tagline: '',
      description: '',
    },
    brand: {
      primary: PRESET_COLORS[0]?.value ?? '#96151D',
    },
    theme: 'zen',
  };

  private audioFile: File | null = null;
  private isDeploying = false;

  show(callbacks?: PageBuilderCallbacks): void {
    this.callbacks = callbacks || {};
    this.injectStyles();
    this.render();

    requestAnimationFrame(() => {
      this.container?.classList.add('visible');
    });

    soundUI.play('open');
    log.info('Page builder opened');
  }

  hide(): void {
    this.container?.classList.remove('visible');

    setTimeout(() => {
      this.cleanup();
    }, DURATION.NORMAL);

    soundUI.play('close');
    log.info('Page builder closed');
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = STYLES;
    document.head.appendChild(this.styleElement);
  }

  private render(): void {
    this.cleanup();

    // Build DOM safely using DOM methods
    this.container = createElement('div', { className: 'page-builder-overlay' });

    const dialog = createElement('div', {
      className: 'page-builder',
      role: 'dialog',
      'aria-labelledby': 'builder-title',
    });

    // Header
    const header = this.buildHeader();
    dialog.appendChild(header);

    // Progress
    const progress = this.buildProgress();
    dialog.appendChild(progress);

    // Content
    const content = createElement('div', { className: 'builder-content' });
    this.buildStepContent(content);
    dialog.appendChild(content);

    // Footer
    const footer = createElement('footer', { className: 'builder-footer' });
    this.buildFooter(footer);
    dialog.appendChild(footer);

    this.container.appendChild(dialog);

    // Close on backdrop click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.hide();
        this.callbacks.onClose?.();
      }
    });

    document.body.appendChild(this.container);
  }

  private buildHeader(): HTMLElement {
    const header = createElement('header', { className: 'builder-header' });

    const title = createElement('h2', {
      className: 'builder-title',
      id: 'builder-title',
    }, ['Create Agent Page']);
    header.appendChild(title);

    const closeBtn = createElement('button', {
      className: 'builder-close',
      'aria-label': 'Close',
    });
    closeBtn.appendChild(createSvgElement(`
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `));
    closeBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onClose?.();
    });
    header.appendChild(closeBtn);

    return header;
  }

  private buildProgress(): HTMLElement {
    const progress = createElement('div', { className: 'builder-progress' });

    STEPS.forEach((step, index) => {
      const isActive = step === this.currentStep;
      const isCompleted = this.completedSteps.has(step);
      const classes = ['progress-step'];
      if (isActive) classes.push('active');
      if (isCompleted) classes.push('completed');

      const stepEl = createElement('div', {
        className: classes.join(' '),
        'data-step': step,
      });

      stepEl.appendChild(createElement('div', { className: 'progress-dot' }));
      stepEl.appendChild(createElement('span', { className: 'progress-label' }, [STEP_LABELS[step]]));

      stepEl.addEventListener('click', () => {
        if (this.canNavigateTo(step)) {
          this.currentStep = step;
          this.updateContent();
        }
      });

      progress.appendChild(stepEl);
    });

    return progress;
  }

  private buildStepContent(container: HTMLElement): void {
    container.replaceChildren();

    // Step header
    const stepHeader = createElement('div', { className: 'step-header' });
    stepHeader.appendChild(createElement('h3', { className: 'step-title' }, [STEP_LABELS[this.currentStep]]));
    stepHeader.appendChild(createElement('p', { className: 'step-description' }, [STEP_DESCRIPTIONS[this.currentStep]]));
    container.appendChild(stepHeader);

    // Step-specific content
    switch (this.currentStep) {
      case 'agent':
        this.buildAgentStep(container);
        break;
      case 'brand':
        this.buildBrandStep(container);
        break;
      case 'voice':
        this.buildVoiceStep(container);
        break;
      case 'preview':
        this.buildPreviewStep(container);
        break;
    }
  }

  private buildAgentStep(container: HTMLElement): void {
    const agent = this.config.agent || { id: '', name: '', initials: '', tagline: '', description: '' };

    // Name field
    const nameGroup = this.createFormGroup('Agent Name', 'agent-name', 'text', agent.name, 'e.g., Joel Dickson', 'The full name of your AI agent');
    const nameInput = nameGroup.querySelector('input') as HTMLInputElement;
    nameInput.addEventListener('input', () => {
      if (this.config.agent) {
        this.config.agent.name = nameInput.value;
        this.config.agent.id = nameInput.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        // Auto-generate initials
        const initialsInput = container.querySelector('#agent-initials') as HTMLInputElement;
        if (initialsInput && !initialsInput.dataset.userEdited) {
          const words = nameInput.value.split(' ').filter(Boolean);
          const initials = words.slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
          initialsInput.value = initials;
          this.config.agent.initials = initials;
        }
      }
    });
    container.appendChild(nameGroup);

    // Initials field
    const initialsGroup = this.createFormGroup('Initials', 'agent-initials', 'text', agent.initials, 'e.g., JD', 'Shown on the avatar (2-3 characters)');
    const initialsInput = initialsGroup.querySelector('input') as HTMLInputElement;
    initialsInput.maxLength = 3;
    initialsInput.addEventListener('input', () => {
      initialsInput.dataset.userEdited = 'true';
      if (this.config.agent) {
        this.config.agent.initials = initialsInput.value.toUpperCase();
      }
    });
    container.appendChild(initialsGroup);

    // Tagline field
    const taglineGroup = this.createFormGroup('Tagline', 'agent-tagline', 'text', agent.tagline, 'e.g., Global Head of Investment Strategy', 'A brief title or role description');
    const taglineInput = taglineGroup.querySelector('input') as HTMLInputElement;
    taglineInput.addEventListener('input', () => {
      if (this.config.agent) {
        this.config.agent.tagline = taglineInput.value;
      }
    });
    container.appendChild(taglineGroup);

    // Description field
    const descGroup = this.createFormGroupTextarea('Description', 'agent-description', agent.description, 'Describe what your agent does...', 'This appears in search results and social shares');
    const descInput = descGroup.querySelector('textarea') as HTMLTextAreaElement;
    descInput.addEventListener('input', () => {
      if (this.config.agent) {
        this.config.agent.description = descInput.value;
      }
    });
    container.appendChild(descGroup);
  }

  private buildBrandStep(container: HTMLElement): void {
    const defaultColor = PRESET_COLORS[0]?.value ?? '#96151D';
    const brand = this.config.brand || { primary: defaultColor };
    const selectedColor = brand.primary || defaultColor;

    const group = createElement('div', { className: 'form-group' });
    group.appendChild(createElement('label', { className: 'form-label' }, ['Primary Color']));

    // Color presets
    const presets = createElement('div', { className: 'color-presets' });
    PRESET_COLORS.forEach(c => {
      const btn = createElement('button', {
        className: `color-preset ${c.value === selectedColor ? 'selected' : ''}`,
        'data-color': c.value,
        title: c.name,
        'aria-label': c.name,
      });
      btn.style.background = c.value;
      btn.addEventListener('click', () => {
        if (this.config.brand) {
          this.config.brand.primary = c.value;
          this.updateColorSelection(c.value);
          const colorInput = container.querySelector('#color-custom') as HTMLInputElement;
          const hexInput = container.querySelector('#color-hex') as HTMLInputElement;
          if (colorInput) colorInput.value = c.value;
          if (hexInput) hexInput.value = c.value;
        }
      });
      presets.appendChild(btn);
    });
    group.appendChild(presets);

    // Custom color picker
    const custom = createElement('div', { className: 'color-custom' });
    const colorInput = createElement('input', {
      type: 'color',
      id: 'color-custom',
      className: 'color-input',
      value: selectedColor,
    });
    colorInput.addEventListener('input', () => {
      if (this.config.brand) {
        this.config.brand.primary = colorInput.value;
        const hexInput = container.querySelector('#color-hex') as HTMLInputElement;
        if (hexInput) hexInput.value = colorInput.value;
        this.updateColorSelection(colorInput.value);
      }
    });
    custom.appendChild(colorInput);

    const hexInput = createElement('input', {
      type: 'text',
      id: 'color-hex',
      className: 'form-input',
      placeholder: '#000000',
      value: selectedColor,
    });
    hexInput.style.width = '120px';
    hexInput.addEventListener('input', () => {
      const color = hexInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(color) && this.config.brand) {
        this.config.brand.primary = color;
        colorInput.value = color;
        this.updateColorSelection(color);
      }
    });
    custom.appendChild(hexInput);
    group.appendChild(custom);

    group.appendChild(createElement('p', { className: 'form-hint' }, ['Used for buttons, links, and avatar background']));
    container.appendChild(group);
  }

  private buildVoiceStep(container: HTMLElement): void {
    const dropzone = createElement('div', {
      className: 'voice-upload',
      id: 'voice-dropzone',
    });

    // Upload icon
    dropzone.appendChild(createSvgElement(`
      <svg class="voice-upload-icon" viewBox="0 0 48 48" fill="none">
        <path d="M24 4v28M12 18l12 14 12-14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 36v4a4 4 0 004 4h24a4 4 0 004-4v-4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `));

    dropzone.appendChild(createElement('p', { className: 'voice-upload-text' }, ['Drop an audio file here or click to browse']));
    dropzone.appendChild(createElement('p', { className: 'voice-upload-hint' }, ['MP3, WAV, or M4A (30 seconds to 5 minutes)']));

    const fileInput = createElement('input', {
      type: 'file',
      id: 'voice-file',
      accept: '.mp3,.wav,.m4a,audio/*',
    });
    fileInput.hidden = true;
    dropzone.appendChild(fileInput);

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = (e).dataTransfer?.files;
      if (files?.[0]) this.handleAudioFile(files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) this.handleAudioFile(fileInput.files[0]);
    });

    container.appendChild(dropzone);

    // File info if uploaded
    if (this.audioFile) {
      const info = createElement('div', { className: 'voice-file-info' });
      info.appendChild(createElement('span', { className: 'voice-file-name' }, [this.audioFile.name]));
      const removeBtn = createElement('button', { className: 'voice-file-remove' }, ['Remove']);
      removeBtn.addEventListener('click', () => {
        this.audioFile = null;
        this.updateContent();
      });
      info.appendChild(removeBtn);
      container.appendChild(info);
    }

    // Skip link
    const skipLink = createElement('a', { className: 'skip-link' }, ['Skip this step']);
    skipLink.addEventListener('click', () => this.goNext());
    container.appendChild(skipLink);
  }

  private buildPreviewStep(container: HTMLElement): void {
    const agent = this.config.agent || { id: '', name: '', initials: '', tagline: '', description: '' };
    const brand = this.config.brand || { primary: PRESET_COLORS[0]?.value ?? '#96151D' };
    const subdomain = this.config.subdomain || this.generateSubdomain();

    // Preview card
    const card = createElement('div', { className: 'preview-card' });

    const previewHeader = createElement('div', { className: 'preview-header' });
    previewHeader.style.background = `linear-gradient(135deg, ${brand.primary}20, ${brand.primary}05)`;

    const avatar = createElement('div', { className: 'preview-avatar' }, [agent.initials || 'AI']);
    avatar.style.background = brand.primary;
    previewHeader.appendChild(avatar);

    previewHeader.appendChild(createElement('h3', { className: 'preview-name' }, [agent.name || 'Your Agent']));
    previewHeader.appendChild(createElement('p', { className: 'preview-tagline' }, [agent.tagline || 'AI Assistant']));
    card.appendChild(previewHeader);

    const details = createElement('div', { className: 'preview-details' });

    // Color row
    const colorRow = createElement('div', { className: 'preview-row' });
    colorRow.appendChild(createElement('span', { className: 'preview-label' }, ['Brand Color']));
    const colorValue = createElement('span', { className: 'preview-value' }, [brand.primary]);
    colorValue.style.color = brand.primary;
    colorRow.appendChild(colorValue);
    details.appendChild(colorRow);

    // Voice row
    const voiceRow = createElement('div', { className: 'preview-row' });
    voiceRow.appendChild(createElement('span', { className: 'preview-label' }, ['Voice']));
    voiceRow.appendChild(createElement('span', { className: 'preview-value' }, [this.audioFile ? 'Custom (will be cloned)' : 'Default']));
    details.appendChild(voiceRow);

    // Theme row
    const themeRow = createElement('div', { className: 'preview-row' });
    themeRow.appendChild(createElement('span', { className: 'preview-label' }, ['Theme']));
    themeRow.appendChild(createElement('span', { className: 'preview-value' }, ['Zen']));
    details.appendChild(themeRow);

    card.appendChild(details);
    container.appendChild(card);

    // Subdomain input
    const subdomainGroup = createElement('div', { className: 'form-group' });
    subdomainGroup.style.marginTop = 'var(--space-lg)';
    subdomainGroup.appendChild(createElement('label', { className: 'form-label' }, ['URL']));

    const wrapper = createElement('div', { className: 'subdomain-input-wrapper' });
    wrapper.appendChild(createElement('span', { className: 'subdomain-prefix' }, ['https://']));

    const subdomainInput = createElement('input', {
      type: 'text',
      id: 'subdomain',
      className: 'subdomain-input',
      placeholder: 'your-agent',
      value: subdomain,
    });
    subdomainInput.addEventListener('input', () => {
      const value = subdomainInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      subdomainInput.value = value;
      this.config.subdomain = value;
    });
    wrapper.appendChild(subdomainInput);

    wrapper.appendChild(createElement('span', { className: 'subdomain-suffix' }, ['.ferni.ai']));
    subdomainGroup.appendChild(wrapper);
    subdomainGroup.appendChild(createElement('p', { className: 'form-hint' }, ['Your agent will be live at this URL']));
    container.appendChild(subdomainGroup);
  }

  private buildFooter(footer: HTMLElement): void {
    footer.replaceChildren();

    const isFirst = this.currentStep === 'agent';
    const isLast = this.currentStep === 'preview';

    if (this.isDeploying) {
      footer.appendChild(createElement('div'));
      const deploying = createElement('div', { className: 'deploying' });
      deploying.appendChild(createElement('span', { className: 'spinner' }));
      deploying.appendChild(createElement('span', {}, ['Deploying...']));
      footer.appendChild(deploying);
      return;
    }

    const backBtn = createElement('button', {
      className: 'btn btn-secondary',
    }, ['Back']);
    if (isFirst) {
      (backBtn).disabled = true;
    } else {
      backBtn.addEventListener('click', () => this.goBack());
    }
    footer.appendChild(backBtn);

    if (isLast) {
      const deployBtn = createElement('button', { className: 'btn btn-primary btn-deploy' }, ['Deploy Page']);
      deployBtn.addEventListener('click', () => this.deploy());
      footer.appendChild(deployBtn);
    } else {
      const nextBtn = createElement('button', { className: 'btn btn-primary' }, ['Continue']);
      nextBtn.addEventListener('click', () => this.goNext());
      footer.appendChild(nextBtn);
    }
  }

  private createFormGroup(label: string, id: string, type: string, value: string, placeholder: string, hint: string): HTMLElement {
    const group = createElement('div', { className: 'form-group' });
    group.appendChild(createElement('label', { className: 'form-label', for: id }, [label]));
    group.appendChild(createElement('input', {
      type,
      id,
      className: 'form-input',
      placeholder,
      value,
    }));
    group.appendChild(createElement('p', { className: 'form-hint' }, [hint]));
    return group;
  }

  private createFormGroupTextarea(label: string, id: string, value: string, placeholder: string, hint: string): HTMLElement {
    const group = createElement('div', { className: 'form-group' });
    group.appendChild(createElement('label', { className: 'form-label', for: id }, [label]));
    const textarea = createElement('textarea', {
      id,
      className: 'form-input form-textarea',
      placeholder,
    }, [value]);
    group.appendChild(textarea);
    group.appendChild(createElement('p', { className: 'form-hint' }, [hint]));
    return group;
  }

  private updateColorSelection(color: string): void {
    const presets = this.container?.querySelectorAll('.color-preset');
    presets?.forEach(p => {
      p.classList.toggle('selected', p.getAttribute('data-color') === color);
    });
  }

  private handleAudioFile(file: File): void {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
      toast.error('Use MP3, WAV, or M4A format');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large (max 50MB)');
      return;
    }
    this.audioFile = file;
    this.updateContent();
    toast.success('Audio file added');
  }

  private canNavigateTo(step: BuilderStep): boolean {
    const currentIndex = STEPS.indexOf(this.currentStep);
    const targetIndex = STEPS.indexOf(step);
    if (targetIndex < currentIndex) return true;
    return this.isCurrentStepValid();
  }

  private isCurrentStepValid(): boolean {
    switch (this.currentStep) {
      case 'agent':
        return !!(this.config.agent?.name && this.config.agent?.initials);
      case 'brand':
        return !!this.config.brand?.primary;
      case 'voice':
        return true;
      case 'preview':
        return !!this.config.subdomain;
      default:
        return false;
    }
  }

  private goBack(): void {
    const currentIndex = STEPS.indexOf(this.currentStep);
    if (currentIndex > 0) {
      this.currentStep = STEPS[currentIndex - 1]!;
      this.updateContent();
      soundUI.play('click');
    }
  }

  private goNext(): void {
    if (!this.isCurrentStepValid()) {
      toast.warning('Fill in required fields');
      return;
    }
    this.completedSteps.add(this.currentStep);
    const currentIndex = STEPS.indexOf(this.currentStep);
    if (currentIndex < STEPS.length - 1) {
      this.currentStep = STEPS[currentIndex + 1]!;
      this.updateContent();
      soundUI.play('click');
    }
  }

  private updateContent(): void {
    const progress = this.container?.querySelector('.builder-progress');
    const content = this.container?.querySelector('.builder-content');
    const footer = this.container?.querySelector('.builder-footer');

    if (progress) {
      const newProgress = this.buildProgress();
      progress.replaceWith(newProgress);
    }
    if (content) this.buildStepContent(content as HTMLElement);
    if (footer) this.buildFooter(footer as HTMLElement);
  }

  private generateSubdomain(): string {
    const name = this.config.agent?.name || 'agent';
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private async deploy(): Promise<void> {
    if (this.isDeploying) return;

    const subdomain = this.config.subdomain || this.generateSubdomain();
    if (!subdomain) {
      toast.warning('Enter a URL');
      return;
    }

    this.isDeploying = true;
    this.updateContent();

    try {
      const fullConfig = {
        agent: {
          ...this.config.agent,
          displayName: this.config.agent?.name?.split(' ')[0] || this.config.agent?.name,
        },
        brand: this.config.brand,
        voice: this.audioFile ? { provider: 'cartesia' } : undefined,
        theme: 'zen',
        deployment: { environment: 'production' },
        seo: {
          title: `Meet ${this.config.agent?.name}`,
          description: this.config.agent?.description,
        },
      };

      const response = await apiPost<{
        success: boolean;
        url: string;
        siteId: string;
      }>('/api/sites/generate-and-deploy', {
        config: fullConfig,
        subdomain,
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.error || 'Deployment failed');
      }

      const { url, siteId } = response.data;

      soundUI.play('success');
      toast.success('Page deployed!');

      this.callbacks.onDeployed?.(url, siteId);
      this.hide();

      log.info({ url, siteId }, 'Page deployed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deployment failed';
      log.error({ error: message }, 'Deployment failed');
      toast.error(message);
    } finally {
      this.isDeploying = false;
      this.updateContent();
    }
  }

  private cleanup(): void {
    this.container?.remove();
    this.container = null;
  }
}

export const pageBuilder = new AgentPageBuilder();

export function showPageBuilder(callbacks?: PageBuilderCallbacks): void {
  pageBuilder.show(callbacks);
}
