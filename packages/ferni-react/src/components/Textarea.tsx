import React, { forwardRef, useState, useId, useRef, useEffect } from 'react';
import { colors } from '../tokens';

export type TextareaSize = 'sm' | 'md' | 'lg';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Success message */
  success?: string;
  /** Textarea size */
  size?: TextareaSize;
  /** Show character count */
  showCount?: boolean;
  /** Auto-resize to content */
  autoResize?: boolean;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px' },
  md: { padding: '10px 14px', fontSize: '15px' },
  lg: { padding: '12px 16px', fontSize: '16px' },
};

/**
 * Textarea component with validation and auto-resize
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helperText,
    error,
    success,
    size = 'md',
    showCount,
    autoResize,
    disabled,
    required,
    maxLength,
    className = '',
    style,
    onFocus,
    onBlur,
    onChange,
    value,
    defaultValue,
    ...props
  },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();
  const textareaId = props.id || id;
  const sizeConfig = SIZE_CONFIG[size];

  // Handle auto-resize
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value, autoResize]);

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCharCount(e.target.value.length);
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
    onChange?.(e);
  };

  return (
    <div className={`ferni-textarea-wrapper ${className}`} style={style}>
      {label && (
        <label
          htmlFor={textareaId}
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

      <textarea
        ref={(node) => {
          textareaRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        id={textareaId}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        onChange={handleChange}
        style={{
          width: '100%',
          padding: sizeConfig.padding,
          fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
          fontSize: sizeConfig.fontSize,
          lineHeight: 1.6,
          color: colors.textPrimary,
          background: colors.backgroundElevated,
          border: `1px solid ${getBorderColor()}`,
          borderRadius: '8px',
          outline: 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          boxSizing: 'border-box',
          minHeight: '100px',
          resize: autoResize ? 'none' : 'vertical',
          overflow: autoResize ? 'hidden' : 'auto',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
          boxShadow: isFocused ? `0 0 0 3px ${colors.ferni}15` : 'none',
        }}
        {...props}
      />

      {(error || success || helperText || showCount) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '6px',
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: '13px',
          }}
        >
          <span style={{ color: getHelperColor() }}>
            {error || success || helperText}
          </span>
          {showCount && (
            <span style={{ color: colors.textMuted }}>
              {charCount}{maxLength ? `/${maxLength}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
