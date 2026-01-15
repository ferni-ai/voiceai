import React, { forwardRef, useCallback } from 'react';

/**
 * Button variants
 */
export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost';

/**
 * Button sizes
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button component props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size */
  size?: ButtonSize;
  /** Leading icon */
  icon?: React.ReactNode;
  /** Trailing icon */
  iconRight?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Enable haptic feedback (on supported devices) */
  haptic?: boolean;
}

/**
 * Button - Warm, tactile button with haptic feedback
 * 
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Continue
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'default',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    haptic = true,
    disabled,
    onClick,
    className = '',
    style,
    ...props
  },
  ref
) {
  // Handle click with optional haptic feedback
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      
      // Trigger haptic feedback if available
      if (haptic && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      
      onClick?.(e);
    },
    [disabled, loading, haptic, onClick]
  );

  const classes = [
    'ferni-button',
    `ferni-button--${variant}`,
    `ferni-button--${size}`,
    loading && 'ferni-button--loading',
    disabled && 'ferni-button--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        onClick={handleClick}
        style={style}
        {...props}
      >
        {loading ? (
          <span className="ferni-button__spinner" aria-hidden="true" />
        ) : (
          <>
            {icon && <span className="ferni-button__icon">{icon}</span>}
            <span className="ferni-button__text">{children}</span>
            {iconRight && <span className="ferni-button__icon ferni-button__icon--right">{iconRight}</span>}
          </>
        )}
      </button>
      
      <style>{`
        .ferni-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 9999px;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        
        .ferni-button:focus-visible {
          outline: 2px solid #4a6741;
          outline-offset: 2px;
        }
        
        .ferni-button:active:not(:disabled) {
          transform: scale(0.97);
        }
        
        /* Sizes */
        .ferni-button--sm {
          padding: 8px 16px;
          font-size: 0.875rem;
        }
        
        .ferni-button--md {
          padding: 12px 24px;
          font-size: 1rem;
        }
        
        .ferni-button--lg {
          padding: 16px 32px;
          font-size: 1.125rem;
        }
        
        /* Variants */
        .ferni-button--default {
          background: #f5f3f0;
          color: #2C2520;
        }
        
        .ferni-button--default:hover:not(:disabled) {
          background: #eae7e3;
        }
        
        .ferni-button--primary {
          background: #4a6741;
          color: white;
        }
        
        .ferni-button--primary:hover:not(:disabled) {
          background: #3d5a35;
        }
        
        .ferni-button--secondary {
          background: white;
          color: #2C2520;
          border: 1px solid rgba(44, 37, 32, 0.1);
        }
        
        .ferni-button--secondary:hover:not(:disabled) {
          border-color: #4a6741;
        }
        
        .ferni-button--ghost {
          background: transparent;
          color: #2C2520;
        }
        
        .ferni-button--ghost:hover:not(:disabled) {
          background: rgba(44, 37, 32, 0.05);
        }
        
        /* States */
        .ferni-button--disabled,
        .ferni-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .ferni-button--loading {
          cursor: wait;
        }
        
        /* Icon */
        .ferni-button__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1em;
          height: 1em;
        }
        
        /* Spinner */
        .ferni-button__spinner {
          width: 1em;
          height: 1em;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: ferni-spin 0.6s linear infinite;
        }
        
        @keyframes ferni-spin {
          to { transform: rotate(360deg); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-button {
            transition: none;
          }
          .ferni-button__spinner {
            animation: none;
          }
        }
      `}</style>
    </>
  );
});

Button.displayName = 'Button';
