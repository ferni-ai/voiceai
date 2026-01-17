/**
 * Ferni Switch Component
 * 
 * Toggle switch with brand-compliant styling and haptic feedback.
 */

// =============================================================================
// Types
// =============================================================================

export type SwitchSize = 'sm' | 'md' | 'lg';

export interface SwitchOptions {
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Switch size */
  size?: SwitchSize;
  /** Initial checked state */
  checked?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Persona color */
  persona?: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';
  /** Change handler */
  onChange?: (checked: boolean) => void;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG = {
  sm: { track: { width: 36, height: 20 }, thumb: 16, translate: 16 },
  md: { track: { width: 44, height: 24 }, thumb: 20, translate: 20 },
  lg: { track: { width: 52, height: 28 }, thumb: 24, translate: 24 },
};

const PERSONA_COLORS: Record<string, string> = {
  ferni: '#4a6741',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  maya: '#a67a6a',
  jordan: '#c4856a',
  nayan: '#b8956a',
};

// =============================================================================
// Switch Class
// =============================================================================

export class Switch {
  private container: HTMLElement;
  private track: HTMLElement;
  private thumb: HTMLElement;
  private input: HTMLInputElement;
  private options: SwitchOptions;
  private isChecked: boolean;

  constructor(container: HTMLElement, options: SwitchOptions = {}) {
    this.container = container;
    this.options = {
      size: 'md',
      checked: false,
      disabled: false,
      persona: 'ferni',
      ...options,
    };
    this.isChecked = this.options.checked || false;

    this.track = document.createElement('div');
    this.thumb = document.createElement('div');
    this.input = document.createElement('input');
    this.render();
  }

  private render(): void {
    const { label, description, size, disabled, persona } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];
    const color = PERSONA_COLORS[persona || 'ferni'];

    this.container.innerHTML = '';

    // Wrapper
    const wrapper = document.createElement('label');
    wrapper.className = 'ferni-switch-wrapper';
    wrapper.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      opacity: ${disabled ? '0.6' : '1'};
    `;

    // Hidden input for accessibility
    this.input.type = 'checkbox';
    this.input.checked = this.isChecked;
    this.input.disabled = disabled || false;
    this.input.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;

    // Track
    this.track.className = 'ferni-switch-track';
    this.track.style.cssText = `
      position: relative;
      width: ${sizeConfig.track.width}px;
      height: ${sizeConfig.track.height}px;
      background: ${this.isChecked ? color : 'var(--color-background-subtle, #E8E4DC)'};
      border-radius: ${sizeConfig.track.height}px;
      transition: background 0.2s ease;
      flex-shrink: 0;
    `;

    // Thumb
    this.thumb.className = 'ferni-switch-thumb';
    this.thumb.style.cssText = `
      position: absolute;
      top: ${(sizeConfig.track.height - sizeConfig.thumb) / 2}px;
      left: ${this.isChecked ? sizeConfig.translate : 2}px;
      width: ${sizeConfig.thumb}px;
      height: ${sizeConfig.thumb}px;
      background: white;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: left 0.2s ease;
    `;

    this.track.appendChild(this.thumb);

    // Switch container
    const switchContainer = document.createElement('div');
    switchContainer.appendChild(this.input);
    switchContainer.appendChild(this.track);
    wrapper.appendChild(switchContainer);

    // Label and description
    if (label || description) {
      const textContainer = document.createElement('div');
      textContainer.style.cssText = `display: flex; flex-direction: column; gap: 2px;`;

      if (label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'ferni-switch-label';
        labelEl.textContent = label;
        labelEl.style.cssText = `
          font-family: var(--font-body, Inter, system-ui, sans-serif);
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-primary, #2C2520);
        `;
        textContainer.appendChild(labelEl);
      }

      if (description) {
        const descEl = document.createElement('span');
        descEl.className = 'ferni-switch-description';
        descEl.textContent = description;
        descEl.style.cssText = `
          font-family: var(--font-body, Inter, system-ui, sans-serif);
          font-size: 13px;
          color: var(--color-text-muted, #8A847A);
        `;
        textContainer.appendChild(descEl);
      }

      wrapper.appendChild(textContainer);
    }

    this.setupEventListeners();
    this.container.appendChild(wrapper);
  }

  private setupEventListeners(): void {
    this.input.addEventListener('change', () => {
      this.toggle();
    });

    // Keyboard support
    this.input.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private updateVisual(): void {
    const { size, persona } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];
    const color = PERSONA_COLORS[persona || 'ferni'];

    this.track.style.background = this.isChecked ? color : 'var(--color-background-subtle, #E8E4DC)';
    this.thumb.style.left = `${this.isChecked ? sizeConfig.translate : 2}px`;
    this.input.checked = this.isChecked;
  }

  // Public API
  toggle(): void {
    if (this.options.disabled) return;
    this.isChecked = !this.isChecked;
    this.updateVisual();
    this.options.onChange?.(this.isChecked);
  }

  check(): void {
    if (!this.isChecked) {
      this.isChecked = true;
      this.updateVisual();
      this.options.onChange?.(true);
    }
  }

  uncheck(): void {
    if (this.isChecked) {
      this.isChecked = false;
      this.updateVisual();
      this.options.onChange?.(false);
    }
  }

  isOn(): boolean {
    return this.isChecked;
  }

  setDisabled(disabled: boolean): void {
    this.options.disabled = disabled;
    this.render();
  }
}

export function createSwitch(container: HTMLElement, options?: SwitchOptions): Switch {
  return new Switch(container, options);
}
