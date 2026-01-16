/**
 * Ferni Textarea Component
 * 
 * Multi-line text input with brand-compliant styling and auto-resize.
 */

// =============================================================================
// Types
// =============================================================================

export type TextareaSize = 'sm' | 'md' | 'lg';

export interface TextareaOptions {
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text below textarea */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Success message */
  success?: string;
  /** Textarea size */
  size?: TextareaSize;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Initial value */
  value?: string;
  /** Number of rows */
  rows?: number;
  /** Maximum characters */
  maxLength?: number;
  /** Show character count */
  showCount?: boolean;
  /** Auto-resize to content */
  autoResize?: boolean;
  /** Change handler */
  onChange?: (value: string) => void;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px', lineHeight: '1.5' },
  md: { padding: '10px 14px', fontSize: '15px', lineHeight: '1.6' },
  lg: { padding: '12px 16px', fontSize: '16px', lineHeight: '1.6' },
};

// =============================================================================
// Textarea Class
// =============================================================================

export class Textarea {
  private container: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private wrapper: HTMLElement;
  private labelEl: HTMLLabelElement | null = null;
  private footerEl: HTMLElement | null = null;
  private options: TextareaOptions;
  private state: 'default' | 'focus' | 'error' | 'success' = 'default';

  constructor(container: HTMLElement, options: TextareaOptions = {}) {
    this.container = container;
    this.options = {
      size: 'md',
      rows: 4,
      disabled: false,
      required: false,
      showCount: false,
      autoResize: false,
      ...options,
    };

    this.wrapper = document.createElement('div');
    this.textarea = document.createElement('textarea');
    this.render();
  }

  private render(): void {
    const { label, helperText, error, success, size, disabled, required, value, rows, placeholder, maxLength, showCount, autoResize } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];

    this.container.innerHTML = '';

    // Wrapper
    this.wrapper.className = 'ferni-textarea-wrapper';
    this.wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    `;

    // Label
    if (label) {
      this.labelEl = document.createElement('label');
      this.labelEl.className = 'ferni-textarea-label';
      this.labelEl.textContent = label + (required ? ' *' : '');
      this.labelEl.style.cssText = `
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      `;
      this.wrapper.appendChild(this.labelEl);
    }

    // Textarea
    this.textarea.className = 'ferni-textarea';
    this.textarea.placeholder = placeholder || '';
    this.textarea.disabled = disabled || false;
    this.textarea.required = required || false;
    this.textarea.rows = rows || 4;
    if (value) this.textarea.value = value;
    if (maxLength) this.textarea.maxLength = maxLength;

    this.updateTextareaStyles(sizeConfig);
    this.setupEventListeners();
    
    if (autoResize) {
      this.textarea.style.overflow = 'hidden';
      this.textarea.style.resize = 'none';
    }

    this.wrapper.appendChild(this.textarea);

    // Footer (helper text + character count)
    if (error || success || helperText || showCount) {
      this.footerEl = document.createElement('div');
      this.footerEl.className = 'ferni-textarea-footer';
      this.footerEl.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 13px;
      `;
      this.updateFooter();
      this.wrapper.appendChild(this.footerEl);
    }

    // Set state
    if (error) this.state = 'error';
    else if (success) this.state = 'success';

    this.container.appendChild(this.wrapper);
  }

  private updateTextareaStyles(sizeConfig: typeof SIZE_CONFIG['md']): void {
    const borderColor = this.getBorderColor();

    this.textarea.style.cssText = `
      width: 100%;
      padding: ${sizeConfig.padding};
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: ${sizeConfig.fontSize};
      line-height: ${sizeConfig.lineHeight};
      color: var(--color-text-primary, #2C2520);
      background: var(--color-background-elevated, #FFFFFF);
      border: 1px solid ${borderColor};
      border-radius: var(--radius-md, 8px);
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      box-sizing: border-box;
      resize: ${this.options.autoResize ? 'none' : 'vertical'};
      min-height: 100px;
      ${this.state === 'focus' ? `box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);` : ''}
      ${this.options.disabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}
    `;
  }

  private getBorderColor(): string {
    switch (this.state) {
      case 'error': return 'var(--color-error, #a05454)';
      case 'success': return 'var(--color-success, #4a6741)';
      case 'focus': return 'var(--color-ferni, #4a6741)';
      default: return 'var(--color-border, rgba(44, 37, 32, 0.15))';
    }
  }

  private updateFooter(): void {
    if (!this.footerEl) return;

    const { error, success, helperText, showCount, maxLength } = this.options;
    const text = error || success || helperText || '';
    
    let color = 'var(--color-text-muted, #8A847A)';
    if (error) color = 'var(--color-error, #a05454)';
    else if (success) color = 'var(--color-success, #4a6741)';

    const countText = showCount 
      ? `${this.textarea.value.length}${maxLength ? `/${maxLength}` : ''}`
      : '';

    this.footerEl.innerHTML = `
      <span style="color: ${color}">${text}</span>
      ${countText ? `<span style="color: var(--color-text-muted, #8A847A)">${countText}</span>` : ''}
    `;
  }

  private setupEventListeners(): void {
    const sizeConfig = SIZE_CONFIG[this.options.size || 'md'];

    this.textarea.addEventListener('focus', () => {
      this.state = 'focus';
      this.updateTextareaStyles(sizeConfig);
    });

    this.textarea.addEventListener('blur', () => {
      this.state = this.options.error ? 'error' : this.options.success ? 'success' : 'default';
      this.updateTextareaStyles(sizeConfig);
    });

    this.textarea.addEventListener('input', () => {
      this.options.onChange?.(this.textarea.value);
      this.updateFooter();
      
      if (this.options.autoResize) {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = this.textarea.scrollHeight + 'px';
      }
    });
  }

  // Public API
  getValue(): string {
    return this.textarea.value;
  }

  setValue(value: string): void {
    this.textarea.value = value;
    this.updateFooter();
    if (this.options.autoResize) {
      this.textarea.style.height = 'auto';
      this.textarea.style.height = this.textarea.scrollHeight + 'px';
    }
  }

  setError(message: string): void {
    this.state = 'error';
    this.options.error = message;
    this.updateFooter();
    this.updateTextareaStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  clearError(): void {
    this.state = 'default';
    this.options.error = undefined;
    this.updateFooter();
    this.updateTextareaStyles(SIZE_CONFIG[this.options.size || 'md']);
  }

  focus(): void {
    this.textarea.focus();
  }
}

export function createTextarea(container: HTMLElement, options?: TextareaOptions): Textarea {
  return new Textarea(container, options);
}
