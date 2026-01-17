import React from 'react';
import { personas, colors } from '../tokens';
import type { PersonaId } from './Avatar';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'persona';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  /** Badge content */
  children: React.ReactNode;
  /** Badge variant */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Persona for persona variant */
  persona?: PersonaId;
  /** Show dot indicator */
  dot?: boolean;
  /** Pulsing animation */
  pulse?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const SIZE_CONFIG: Record<BadgeSize, { padding: string; fontSize: string; dotSize: string }> = {
  sm: { padding: '2px 8px', fontSize: '11px', dotSize: '6px' },
  md: { padding: '4px 10px', fontSize: '12px', dotSize: '8px' },
  lg: { padding: '6px 12px', fontSize: '13px', dotSize: '10px' },
};

const VARIANT_COLORS: Record<Exclude<BadgeVariant, 'persona'>, { bg: string; text: string; dot: string }> = {
  default: {
    bg: colors.backgroundSubtle,
    text: colors.textSecondary,
    dot: colors.textMuted,
  },
  success: {
    bg: `${colors.success}15`,
    text: colors.success,
    dot: colors.success,
  },
  warning: {
    bg: `${colors.warning}15`,
    text: colors.warning,
    dot: colors.warning,
  },
  error: {
    bg: `${colors.error}15`,
    text: colors.error,
    dot: colors.error,
  },
  info: {
    bg: `${colors.info}15`,
    text: colors.info,
    dot: colors.info,
  },
};

/**
 * Badge - Status indicator
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  persona,
  dot = false,
  pulse = false,
  onClick,
  className = '',
  style,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const sizeConfig = SIZE_CONFIG[size];

  // Get colors
  let colorConfig: { bg: string; text: string; dot: string };
  if (variant === 'persona' && persona) {
    const personaColor = personas[persona].colors.primary;
    colorConfig = {
      bg: `${personaColor}15`,
      text: personaColor,
      dot: personaColor,
    };
  } else {
    colorConfig = VARIANT_COLORS[variant as Exclude<BadgeVariant, 'persona'>];
  }

  return (
    <span
      className={`ferni-badge ${className}`}
      onClick={onClick}
      onMouseEnter={() => onClick && setIsHovered(true)}
      onMouseLeave={() => onClick && setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: sizeConfig.padding,
        fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
        fontSize: sizeConfig.fontSize,
        fontWeight: 500,
        color: colorConfig.text,
        background: colorConfig.bg,
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease',
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        ...style,
      }}
    >
      {dot && (
        <span
          className="ferni-badge-dot"
          style={{
            width: sizeConfig.dotSize,
            height: sizeConfig.dotSize,
            borderRadius: '50%',
            background: colorConfig.dot,
            animation: pulse ? 'ferni-badge-pulse 2s ease-in-out infinite' : 'none',
          }}
        />
      )}
      {children}

      {pulse && (
        <style>{`
          @keyframes ferni-badge-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.1); }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .ferni-badge-dot {
              animation: none !important;
            }
          }
        `}</style>
      )}
    </span>
  );
};
