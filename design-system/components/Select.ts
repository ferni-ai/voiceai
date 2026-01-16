/**
 * Ferni Select Component
 * 
 * Dropdown select with brand-compliant styling.
 */

// =============================================================================
// Types
// =============================================================================

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectOptions {
  /** Select options */
  options: SelectOption[];
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Select size */
  size?: SelectSize;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Initial value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG = {
  sm: { padding: '8px 32px 8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 36px 10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 40px 12px 16px', fontSize: '16px', height: '52px' },
};

// =============================================================================
// Select Class
// =============================================================================

export class Select {
  private container: HTMLElement;
  private select: HTMLSelectElement;
  private wrapper: HTMLElement;
  private options: SelectOptions;
  private state: 'default' | 'focus' | 'error' = 'default';

  constructor(container: HTMLElement, options: SelectOptions) {
    this.container = container;
    this.options = {
      size: 'md',
      disabled: false,
      required: false,
      ...options,
    };

    this.wrapper = document.createElement('div');
    this.select = document.createElement('select');
    this.render();
  }

  private render(): void {
    const { options: selectOptions, label, helperText, error, size, disabled, required, value, placeholder } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];

    this.container.innerHTML = '';

    // Wrapper
    this.wrapper.className = 'ferni-select-wrapper';
    this.wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    `;

    // Label
    if (label) {
      const labelEl = document.createElement('label');
      labelEl.className = 'ferni-select-label';
      labelEl.textContent = label + (required ? ' *' : '');
      labelEl.style.cssText = `
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      `;
      this.wrapper.appendChild(labelEl);
    }

    // Select wrapper (for custom arrow)
    const selectWrapper = document.createElement('div');
    selectWrapper.style.cssText = `position: relative;`;

    // Select
    this.select.className = 'ferni-select';
    this.select.disabled = disabled || false;
    this.select.required = required || false;

    // Add placeholder option
    if (placeholder) {
      const placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = placeholder;
      placeholderOpt.disabled = true;
      placeholderOpt.selected = !value;
      this.select.appendChild(placeholderOpt);
    }

    // Add options
    selectOptions.forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      optEl.disabled = opt.disabled || false;
      if (value === opt.value) optEl.selected = true;
      this.select.appendChild(optEl);
    });

    this.updateSelectStyles(sizeConfig);
    this.setupEventListeners();

    selectWrapper.appendChild(this.select);

    // Custom arrow
    const arrow = document.createElement('div');
    arrow.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    arrow.style.cssText = `
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--color-text-muted, #8A847A);
    `;
    selectWrapper.appendChild(arrow);

    this.wrapper.appendChild(selectWrapper);

    // Helper text / error
    if (error || helperText) {
      const helperEl = document.createElement('span');
      helperEl.className = 'ferni-select-helper';
      helperEl.textContent = error || helperText || '';
      helperEl.style.cssText = `
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 13px;
        color: ${error ? 'var(--color-error, #a05454)' : 'var(--color-text-muted, #8A847A)'};
      `;
      this.wrapper.appendChild(helperEl);
    }

    if (error) this.state = 'error';

    this.container.appendChild(this.wrapper);
  }

  private updateSelectStyles(sizeConfig: typeof SIZE_CONFIG['md']): void {
    const borderColor = this.state === 'error' 
      ? 'var(--color-error, #a05454)' 
      : this.state === 'focus' 
        ? 'var(--color-ferni, #4a6741)' 
        : 'var(--color-border, rgba(44, 37, 32, 0.15))';

    this.select.style.cssText = `
      width: 100%;
      padding: ${sizeConfig.padding};
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: ${sizeConfig.fontSize};
      color: var(--color-text-primary, #2C2520);
      background: var(--color-background-elevated, #FFFFFF);
      border: 1px solid ${borderColor};
      border-radius: var(--radius-md, 8px);
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      height: ${sizeConfig.height};
      ${this.state === 'focus' ? 'box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);' : ''}
      ${this.options.disabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}
    `;
  }

  private setupEventListeners(): void {
    const sizeConfig = SIZE_CONFIG[this.options.size || 'md'];

    this.select.addEventListener('focus', () => {
      this.state = 'focus';
      this.updateSelectStyles(sizeConfig);
    });

    this.select.addEventListener('blur', () => {
      this.state = this.options.error ? 'error' : 'default';
      this.updateSelectStyles(sizeConfig);
    });

    this.select.addEventListener('change', () => {
      this.options.onChange?.(this.select.value);
    });
  }

  // Public API
  getValue(): string {
    return this.select.value;
  }

  setValue(value: string): void {
    this.select.value = value;
  }

  setError(message: string): void {
    this.state = 'error';
    this.options.error = message;
    this.render();
  }

  clearError(): void {
    this.state = 'default';
    this.options.error = undefined;
    this.render();
  }

  setOptions(options: SelectOption[]): void {
    this.options.options = options;
    this.render();
  }
}

export function createSelect(container: HTMLElement, options: SelectOptions): Select {
  return new Select(container, options);
}
