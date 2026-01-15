import React, { forwardRef, useState, useId } from 'react';
import { colors } from '../tokens';

export type InputType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Success message */
  success?: string;
  /** Input size */
  size?: InputSize;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 16px', fontSize: '16px', height: '52px' },
};

/**
 * Input component with validation states
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    error,
    success,
    size = 'md',
    disabled,
    required,
    className = '',
    style,
    onFocus,
    onBlur,
    ...props
  },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const id = useId();
  const inputId = props.id || id;
  const sizeConfig = SIZE_CONFIG[size];

  const getBorderColor = () => {
    if (error) return colors.error;
    if (success) return colors.success;
    if (isFocused) return colors.ferni;
    return colors.border;
  };

  const getHelperColor = () => {
    if (error) return colors.error;
    if (success) return colors.success;
    return colors.textMuted;
  };

  return (
    <div className={`ferni-input-wrapper ${className}`} style={style}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            marginBottom: '6px',
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: '14px',
            fontWeight: 500,
            color: colors.textPrimary,
          }}
        >
          {label}
          {required && ' *'}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        required={required}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        style={{
          width: '100%',
          padding: sizeConfig.padding,
          fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
          fontSize: sizeConfig.fontSize,
          color: colors.textPrimary,
          background: colors.backgroundElevated,
          border: `1px solid ${getBorderColor()}`,
          borderRadius: '8px',
          outline: 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          boxSizing: 'border-box',
          height: sizeConfig.height,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
          boxShadow: isFocused ? `0 0 0 3px ${colors.ferni}15` : 'none',
        }}
        {...props}
      />

      {(error || success || helperText) && (
        <span
          style={{
            display: 'block',
            marginTop: '6px',
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: '13px',
            color: getHelperColor(),
          }}
        >
          {error || success || helperText}
        </span>
      )}
    </div>
  );
});
