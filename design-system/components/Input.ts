/**
 * Ferni Input Component
 * 
 * Text input with brand-compliant styling, validation states,
 * and accessible labels.
 */

// =============================================================================
// Types
// =============================================================================

export type InputType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputState = 'default' | 'focus' | 'error' | 'success' | 'disabled';

export interface InputOptions {
  /** Input type */
  type?: InputType;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message (shows error state) */
  error?: string;
  /** Success message (shows success state) */
  success?: string;
  /** Input size */
  size?: InputSize;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Initial value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Focus handler */
  onFocus?: () => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Enter key handler */
  onEnter?: (value: string) => void;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 16px', fontSize: '16px', height: '52px' },
};

// =============================================================================
// Input Class
// =============================================================================

export class Input {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private wrapper: HTMLElement;
  private labelEl: HTMLLabelElement | null = null;
  private helperEl: HTMLElement | null = null;
  private options: InputOptions;
  private state: InputState = 'default';

  constructor(container: HTMLElement, options: InputOptions = {}) {
    this.container = container;
    this.options = {
      type: 'text',
      size: 'md',
      disabled: false,
      required: false,
      ...options,
    };

    this.wrapper = document.createElement('div');
    this.input = document.createElement('input');
    this.render();
  }

  private render(): void {
    const { type, placeholder, label, helperText, error, success, size, disabled, required, value } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];

    // Clear container
    this.container.innerHTML = '';

    // Wrapper
    this.wrapper.className = 'ferni-input-wrapper';
    this.wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    `;

    // Label
    if (label) {
      this.labelEl = document.createElement('label');
      this.labelEl.className = 'ferni-input-label';
      this.labelEl.textContent = label + (required ? ' *' : '');
      this.labelEl.style.cssText = `
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      `;
      this.wrapper.appendChild(this.labelEl);
    }

    // Input
    this.input.type = type || 'text';
    this.input.className = 'ferni-input';
    this.input.placeholder = placeholder || '';
    this.input.disabled = disabled || false;
    this.input.required = required || false;
    if (value) this.input.value = value;

    this.updateInputStyles(sizeConfig);
    this.setupEventListeners();
    this.wrapper.appendChild(this.input);

    // Helper text / error / success
    if (error || success || helperText) {
      this.helperEl = document.createElement('span');
      this.helperEl.className = 'ferni-input-helper';
      this.updateHelperText(error, success, helperText);
      this.wrapper.appendChild(this.helperEl);
    }

    // Set state
    if (error) this.state = 'error';
    else if (success) this.state = 'success';
    else if (disabled) this.state = 'disabled';

    this.container.appendChild(this.wrapper);
  }

  private updateInputStyles(sizeConfig: typeof SIZE_CONFIG['md']): void {
    const borderColor = this.getBorderColor();
    const shadowColor = this.getShadowColor();

    this.input.style.cssText = `
      width: 100%;
      padding: ${sizeConfig.padding};
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: ${sizeConfig.fontSize};
      color: var(--color-text-primary, #2C2520);
      background: var(--color-background-elevated, #FFFFFF);
      border: 1px solid ${borderColor};
      border-radius: var(--radius-md, 8px);
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      box-sizing: border-box;
      height: ${sizeConfig.height};
      ${this.state === 'focus' ? `box-shadow: 0 0 0 3px ${shadowColor};` : ''}
    `;

    if (this.options.disabled) {
      this.input.style.opacity = '0.6';
      this.input.style.cursor = 'not-allowed';
    }
  }

  private getBorderColor(): string {
    switch (this.state) {
      case 'error': return 'var(--color-error, #a05454)';
      case 'success': return 'var(--color-success, #4a6741)';
      case 'focus': return 'var(--color-ferni, #4a6741)';
      default: return 'var(--color-border, rgba(44, 37, 32, 0.15))';
    }
  }

  private getShadowColor(): string {
    switch (this.state) {
      case 'error': return 'rgba(160, 84, 84, 0.15)';
      case 'success': return 'rgba(74, 103, 65, 0.15)';
      default: return 'rgba(74, 103, 65, 0.1)';
    }
  }

  private updateHelperText(error?: string, success?: string, helperText?: string): void {
    if (!this.helperEl) return;

    const text = error || success || helperText || '';
    this.helperEl.textContent = text;

    let color = 'var(--color-text-muted, #8A847A)';
    if (error) color = 'var(--color-error, #a05454)';
    else if (success) color = 'var(--color-success, #4a6741)';

    this.helperEl.style.cssText = `
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: 13px;
      color: ${color};
    `;
  }

  private setupEventListeners(): void {
    const sizeConfig = SIZE_CONFIG[this.options.size || 'md'];

    this.input.addEventListener('focus', () => {
      this.state = 'focus';
      this.updateInputStyles(sizeConfig);
      this.options.onFocus?.();
    });

    this.input.addEventListener('blur', () => {
      this.state = this.options.error ? 'error' : this.options.success ? 'success' : 'default';
      this.updateInputStyles(sizeConfig);
      this.options.onBlur?.();
    });

    this.input.addEventListener('input', () => {
      this.options.onChange?.(this.input.value);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.options.onEnter?.(this.input.value);
      }
    });
  }

  // Public API
  getValue(): string {
    return this.input.value;
  }

  setValue(value: string): void {
    this.input.value = value;
  }

  setError(message: string): void {
    this.state = 'error';
    this.options.error = message;
    this.updateHelperText(message);
    this.updateInputStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  clearError(): void {
    this.state = 'default';
    this.options.error = undefined;
    this.updateHelperText(undefined, this.options.success, this.options.helperText);
    this.updateInputStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  setSuccess(message: string): void {
    this.state = 'success';
    this.options.success = message;
    this.updateHelperText(undefined, message);
    this.updateInputStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  focus(): void {
    this.input.focus();
  }

  blur(): void {
    this.input.blur();
  }

  disable(): void {
    this.options.disabled = true;
    this.input.disabled = true;
    this.state = 'disabled';
    this.updateInputStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  enable(): void {
    this.options.disabled = false;
    this.input.disabled = false;
    this.state = 'default';
    this.updateInputStyles(SIZE_CONFIG[this.options.size || 'md']);
  }
}

/**
 * Create an input (convenience function)
 */
export function createInput(container: HTMLElement, options?: InputOptions): Input {
  return new Input(container, options);
}
