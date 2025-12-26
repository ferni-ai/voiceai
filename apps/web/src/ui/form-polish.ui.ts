/**
 * Form Field Polish - Apple/Google Quality Micro-interactions
 *
 * Provides Material Design 3 inspired form fields with:
 * - Floating labels that animate on focus/content
 * - Error shake animations
 * - Focus ring animations
 * - Validation feedback
 * - Touch-friendly input areas (44px minimum)
 *
 * @module form-polish.ui
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants';
import { createLogger } from '../utils/logger';
import { getHapticsService } from '../services/haptics.service';

const log = createLogger('FormPolish');
const haptics = getHapticsService();

// ============================================================================
// TYPES
// ============================================================================

export interface FormFieldConfig {
  /** Enable floating label behavior */
  floatingLabel?: boolean;
  /** Enable error shake animation */
  errorShake?: boolean;
  /** Enable success checkmark */
  successIndicator?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

// ============================================================================
// STYLES
// ============================================================================

const FORM_POLISH_STYLES = `
/* ============================================
   FORM POLISH - Material Design 3 Inspired
   ============================================ */

/* Base floating label container */
.form-field {
  position: relative;
  margin-bottom: var(--space-4);
  min-height: 56px; /* Touch-friendly height */
}

/* Input styling */
.form-field__input {
  width: 100%;
  min-height: 56px;
  padding: 24px 16px 8px 16px;
  border: 2px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  transition: 
    border-color ${DURATION.NORMAL}ms ${EASING.STANDARD},
    background-color ${DURATION.NORMAL}ms ${EASING.STANDARD},
    box-shadow ${DURATION.NORMAL}ms ${EASING.STANDARD};
}

/* Floating label */
.form-field__label {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-base);
  pointer-events: none;
  transition: 
    transform ${DURATION.NORMAL}ms ${EASING.SPRING},
    font-size ${DURATION.NORMAL}ms ${EASING.SPRING},
    color ${DURATION.NORMAL}ms ${EASING.STANDARD},
    top ${DURATION.NORMAL}ms ${EASING.SPRING};
  transform-origin: left center;
  background: transparent;
  padding: 0 4px;
}

/* Label floated state - on focus or when input has content */
.form-field__input:focus + .form-field__label,
.form-field__input:not(:placeholder-shown) + .form-field__label,
.form-field--has-value .form-field__label {
  top: 12px;
  transform: translateY(0);
  font-size: var(--text-xs);
  color: var(--persona-text);
  background: linear-gradient(to bottom, 
    transparent 0%, 
    transparent 45%, 
    var(--color-background-secondary) 45%, 
    var(--color-background-secondary) 100%
  );
}

/* Focus state */
.form-field__input:focus {
  outline: none;
  border-color: var(--persona-text);
  background: var(--color-background-elevated);
  box-shadow: 
    0 0 0 3px var(--persona-tint),
    0 2px 8px var(--persona-glow);
}

.form-field__input:focus + .form-field__label {
  color: var(--persona-text);
}

/* Hover state */
.form-field__input:hover:not(:focus) {
  border-color: var(--color-border-medium);
}

/* Error state */
.form-field--error .form-field__input {
  border-color: var(--color-semantic-error);
  background: color-mix(in srgb, var(--color-semantic-error) 5%, var(--color-background-secondary));
}

.form-field--error .form-field__label {
  color: var(--color-semantic-error) !important;
}

.form-field--error .form-field__input:focus {
  box-shadow: 
    0 0 0 3px var(--color-semantic-errorGlow),
    0 2px 8px var(--color-semantic-errorGlow);
}

/* Error message */
.form-field__error {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding: 0 var(--space-4);
  color: var(--color-semantic-error);
  font-size: var(--text-sm);
  animation: formErrorSlideIn ${DURATION.NORMAL}ms ${EASING.SPRING};
}

@keyframes formErrorSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Error shake animation */
@keyframes formErrorShake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

.form-field--shake {
  animation: formErrorShake 400ms ${EASING.SPRING};
}

/* Success state */
.form-field--success .form-field__input {
  border-color: var(--color-semantic-success);
}

.form-field--success .form-field__label {
  color: var(--color-semantic-success) !important;
}

.form-field__success-indicator {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-semantic-success);
  animation: formSuccessCheck ${DURATION.SLOW}ms ${EASING.SPRING};
}

@keyframes formSuccessCheck {
  0% {
    opacity: 0;
    transform: translateY(-50%) scale(0.5);
  }
  50% {
    transform: translateY(-50%) scale(1.2);
  }
  100% {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
}

/* Character counter */
.form-field__counter {
  position: absolute;
  right: 16px;
  bottom: -20px;
  font-size: var(--text-xs);
  color: var(--color-text-dimmed);
  transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
}

.form-field__counter--warning {
  color: var(--color-semantic-warning);
}

.form-field__counter--error {
  color: var(--color-semantic-error);
}

/* Helper text */
.form-field__helper {
  margin-top: var(--space-1);
  padding: 0 var(--space-4);
  color: var(--color-text-dimmed);
  font-size: var(--text-sm);
}

/* Disabled state */
.form-field__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--color-background-tertiary);
}

.form-field__input:disabled + .form-field__label {
  color: var(--color-text-dimmed);
}

/* Textarea specific */
textarea.form-field__input {
  min-height: 120px;
  padding-top: 28px;
  resize: vertical;
}

/* Compact variant */
.form-field--compact .form-field__input {
  min-height: 44px;
  padding: 12px 16px;
}

.form-field--compact .form-field__label {
  display: none;
}

/* Dense form layout */
.form-dense .form-field {
  margin-bottom: var(--space-2);
}

/* Input group - for prefixes/suffixes */
.form-field--group {
  display: flex;
  align-items: stretch;
}

.form-field__prefix,
.form-field__suffix {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  background: var(--color-background-tertiary);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  border: 2px solid var(--color-border-subtle);
}

.form-field__prefix {
  border-right: none;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}

.form-field__suffix {
  border-left: none;
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
}

.form-field--group .form-field__input {
  border-radius: 0;
}

.form-field--group .form-field__input:first-child {
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}

.form-field--group .form-field__input:last-child {
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
}

/* Focus-within for entire field */
.form-field:focus-within {
  /* Subtle glow on container */
}

/* Reduce motion */
@media (prefers-reduced-motion: reduce) {
  .form-field__label,
  .form-field__input,
  .form-field__error,
  .form-field__success-indicator {
    transition: none !important;
    animation: none !important;
  }
}
`;

// ============================================================================
// INITIALIZATION
// ============================================================================

let stylesInjected = false;

/**
 * Injects form polish styles into the document.
 */
function injectStyles(): void {
  if (stylesInjected || document.getElementById('form-polish-styles')) return;

  const style = document.createElement('style');
  style.id = 'form-polish-styles';
  style.textContent = FORM_POLISH_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
  log.debug('Form polish styles injected.');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Enhances a form field with floating label and micro-interactions.
 * @param input The input element to enhance.
 * @param config Configuration options.
 */
export function enhanceFormField(input: HTMLInputElement | HTMLTextAreaElement, _config: FormFieldConfig = {}): void {
  injectStyles();

  const wrapper = input.closest('.form-field');
  if (!wrapper) {
    log.warn('Form field enhancement requires wrapper with class .form-field');
    return;
  }

  // Track has-value state for floating label
  const updateHasValue = () => {
    if (input.value) {
      wrapper.classList.add('form-field--has-value');
    } else {
      wrapper.classList.remove('form-field--has-value');
    }
  };

  input.addEventListener('input', updateHasValue);
  input.addEventListener('change', updateHasValue);
  updateHasValue(); // Initial state

  // Add focus haptic
  input.addEventListener('focus', () => {
    haptics.play('softTap');
  });

  log.debug('Form field enhanced:', input.name || input.id);
}

/**
 * Shows an error state on a form field with shake animation.
 * @param input The input element.
 * @param message Error message to display.
 */
export function showFieldError(input: HTMLInputElement | HTMLTextAreaElement, message: string): void {
  const wrapper = input.closest('.form-field');
  if (!wrapper) return;

  // Add error class
  wrapper.classList.add('form-field--error');
  wrapper.classList.remove('form-field--success');

  // Add shake animation
  if (!prefersReducedMotion()) {
    wrapper.classList.add('form-field--shake');
    haptics.play('error');

    setTimeout(() => {
      wrapper.classList.remove('form-field--shake');
    }, 400);
  }

  // Show or update error message
  let errorEl = wrapper.querySelector('.form-field__error') as HTMLElement;
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'form-field__error';
    wrapper.appendChild(errorEl);
  }
  errorEl.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    ${message}
  `;

  // Focus the input
  input.focus();

  log.debug('Field error shown:', message);
}

/**
 * Clears error state from a form field.
 * @param input The input element.
 */
export function clearFieldError(input: HTMLInputElement | HTMLTextAreaElement): void {
  const wrapper = input.closest('.form-field');
  if (!wrapper) return;

  wrapper.classList.remove('form-field--error', 'form-field--shake');
  wrapper.querySelector('.form-field__error')?.remove();

  log.debug('Field error cleared');
}

/**
 * Shows success state on a form field.
 * @param input The input element.
 */
export function showFieldSuccess(input: HTMLInputElement | HTMLTextAreaElement): void {
  const wrapper = input.closest('.form-field');
  if (!wrapper) return;

  wrapper.classList.remove('form-field--error');
  wrapper.classList.add('form-field--success');
  wrapper.querySelector('.form-field__error')?.remove();

  // Add success indicator
  if (!wrapper.querySelector('.form-field__success-indicator')) {
    const indicator = document.createElement('div');
    indicator.className = 'form-field__success-indicator';
    indicator.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    wrapper.appendChild(indicator);
    haptics.play('success');
  }

  log.debug('Field success shown');
}

/**
 * Clears success state from a form field.
 * @param input The input element.
 */
export function clearFieldSuccess(input: HTMLInputElement | HTMLTextAreaElement): void {
  const wrapper = input.closest('.form-field');
  if (!wrapper) return;

  wrapper.classList.remove('form-field--success');
  wrapper.querySelector('.form-field__success-indicator')?.remove();

  log.debug('Field success cleared');
}

/**
 * Auto-enhances all form fields matching a selector.
 * @param selector CSS selector for form fields.
 */
export function autoEnhanceFormFields(selector: string = '.form-field__input'): void {
  injectStyles();

  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);
  inputs.forEach(input => {
    enhanceFormField(input);
  });

  log.info(`Auto-enhanced ${inputs.length} form fields`);
}

/**
 * Creates a floating label form field programmatically.
 * @param options Field options.
 * @returns The created form field wrapper element.
 */
export function createFormField(options: {
  type?: 'text' | 'email' | 'password' | 'textarea' | 'tel' | 'url' | 'number';
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  helperText?: string;
  prefix?: string;
  suffix?: string;
}): HTMLElement {
  injectStyles();

  const wrapper = document.createElement('div');
  wrapper.className = 'form-field';
  if (options.prefix || options.suffix) {
    wrapper.classList.add('form-field--group');
  }

  let html = '';

  if (options.prefix) {
    html += `<span class="form-field__prefix">${options.prefix}</span>`;
  }

  if (options.type === 'textarea') {
    html += `
      <textarea
        class="form-field__input"
        name="${options.name}"
        id="${options.name}"
        placeholder=" "
        ${options.required ? 'required' : ''}
        ${options.maxLength ? `maxlength="${options.maxLength}"` : ''}
      ></textarea>
    `;
  } else {
    html += `
      <input
        type="${options.type || 'text'}"
        class="form-field__input"
        name="${options.name}"
        id="${options.name}"
        placeholder=" "
        ${options.required ? 'required' : ''}
        ${options.maxLength ? `maxlength="${options.maxLength}"` : ''}
      />
    `;
  }

  html += `<label class="form-field__label" for="${options.name}">${options.label}</label>`;

  if (options.suffix) {
    html += `<span class="form-field__suffix">${options.suffix}</span>`;
  }

  if (options.helperText) {
    html += `<div class="form-field__helper">${options.helperText}</div>`;
  }

  if (options.maxLength) {
    html += `<div class="form-field__counter">0 / ${options.maxLength}</div>`;
  }

  wrapper.innerHTML = html;

  // Enhance the input
  const input = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement>('.form-field__input');
  if (input) {
    enhanceFormField(input);

    // Character counter
    if (options.maxLength) {
      const counter = wrapper.querySelector('.form-field__counter');
      input.addEventListener('input', () => {
        if (counter) {
          const length = input.value.length;
          counter.textContent = `${length} / ${options.maxLength}`;
          counter.classList.toggle('form-field__counter--warning', length > options.maxLength! * 0.8);
          counter.classList.toggle('form-field__counter--error', length >= options.maxLength!);
        }
      });
    }
  }

  return wrapper;
}

/**
 * Disposes form polish styles and cleans up.
 */
export function disposeFormPolish(): void {
  document.getElementById('form-polish-styles')?.remove();
  stylesInjected = false;
  log.debug('Form polish disposed');
}

