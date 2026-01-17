import React, { forwardRef } from 'react';
import { colors, shadow, radius } from '../tokens';

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardSize = 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card variant */
  variant?: CardVariant;
  /** Card size (affects padding) */
  size?: CardSize;
  /** Make card clickable with hover effect */
  clickable?: boolean;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const SIZE_PADDING = {
  sm: '12px',
  md: '16px',
  lg: '24px',
};

const VARIANT_STYLES: Record<CardVariant, React.CSSProperties> = {
  elevated: {
    background: colors.backgroundElevated,
    border: 'none',
    boxShadow: shadow.md,
  },
  outlined: {
    background: colors.backgroundElevated,
    border: `1px solid ${colors.border}`,
    boxShadow: 'none',
  },
  filled: {
    background: colors.backgroundSubtle,
    border: 'none',
    boxShadow: 'none',
  },
};

/**
 * Card component - content container
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = 'elevated',
    size = 'md',
    clickable = false,
    children,
    className = '',
    style,
    onClick,
    ...props
  },
  ref
) {
  const [isHovered, setIsHovered] = React.useState(false);
  const variantStyle = VARIANT_STYLES[variant];

  return (
    <div
      ref={ref}
      className={`ferni-card ${className}`}
      onClick={onClick}
      onMouseEnter={() => clickable && setIsHovered(true)}
      onMouseLeave={() => clickable && setIsHovered(false)}
      style={{
        ...variantStyle,
        borderRadius: radius.lg,
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: clickable ? 'pointer' : 'default',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered ? shadow.lg : variantStyle.boxShadow,
        ...style,
      }}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          // Pass size to child components
          return React.cloneElement(child as React.ReactElement<{ size?: CardSize }>, {
            size: (child.props as { size?: CardSize }).size || size,
          });
        }
        return child;
      })}
    </div>
  );
});

/**
 * Card header
 */
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps & { size?: CardSize }>(
  function CardHeader({ children, className = '', style, size = 'md', ...props }, ref) {
    const padding = SIZE_PADDING[size];

    return (
      <div
        ref={ref}
        className={`ferni-card-header ${className}`}
        style={{
          padding,
          borderBottom: `1px solid ${colors.border}`,
          fontFamily: "var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif)",
          fontWeight: 600,
          color: colors.textPrimary,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

/**
 * Card body
 */
export const CardBody = forwardRef<HTMLDivElement, CardBodyProps & { size?: CardSize }>(
  function CardBody({ children, className = '', style, size = 'md', ...props }, ref) {
    const padding = SIZE_PADDING[size];

    return (
      <div
        ref={ref}
        className={`ferni-card-body ${className}`}
        style={{
          padding,
          fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
          color: colors.textSecondary,
          lineHeight: 1.6,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

/**
 * Card footer
 */
export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps & { size?: CardSize }>(
  function CardFooter({ children, className = '', style, size = 'md', ...props }, ref) {
    const padding = SIZE_PADDING[size];

    return (
      <div
        ref={ref}
        className={`ferni-card-footer ${className}`}
        style={{
          padding,
          borderTop: `1px solid ${colors.border}`,
          background: colors.backgroundSubtle,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
