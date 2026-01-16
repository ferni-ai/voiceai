import React, { forwardRef, useState, useId } from 'react';
import { colors } from '../tokens';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select options */
  options: SelectOption[];
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Select size */
  size?: SelectSize;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 32px 8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 36px 10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 40px 12px 16px', fontSize: '16px', height: '52px' },
};

/**
 * Select dropdown component
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    options,
    label,
    placeholder,
    helperText,
    error,
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
  const selectId = props.id || id;
  const sizeConfig = SIZE_CONFIG[size];

  const getBorderColor = () => {
    if (error) return colors.error;
    if (isFocused) return colors.ferni;
    return colors.border;
  };

  return (
    <div className={`ferni-select-wrapper ${className}`} style={style}>
      {label && (
        <label
          htmlFor={selectId}
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

      <div style={{ position: 'relative' }}>
        <select
          ref={ref}
          id={selectId}
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
            cursor: disabled ? 'not-allowed' : 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            height: sizeConfig.height,
            opacity: disabled ? 0.6 : 1,
            boxShadow: isFocused ? `0 0 0 3px ${colors.ferni}15` : 'none',
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom arrow */}
        <div
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: colors.textMuted,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {(error || helperText) && (
        <span
          style={{
            display: 'block',
            marginTop: '6px',
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: '13px',
            color: error ? colors.error : colors.textMuted,
          }}
        >
          {error || helperText}
        </span>
      )}
    </div>
  );
});
