import React from 'react';
import { personas, colors } from '../tokens';
import type { PersonaId } from './Avatar';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SpinnerProps {
  /** Spinner size */
  size?: SpinnerSize;
  /** Persona for coloring */
  persona?: PersonaId;
  /** Custom color */
  color?: string;
  /** Label text */
  label?: string;
  /** Center in container */
  centered?: boolean;
  /** Additional className */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const SIZE_CONFIG: Record<SpinnerSize, { size: number; stroke: number }> = {
  xs: { size: 16, stroke: 2 },
  sm: { size: 24, stroke: 2.5 },
  md: { size: 32, stroke: 3 },
  lg: { size: 48, stroke: 3.5 },
  xl: { size: 64, stroke: 4 },
};

/**
 * Spinner - Loading indicator
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  persona,
  color,
  label,
  centered = true,
  className = '',
  style,
}) => {
  const sizeConfig = SIZE_CONFIG[size];
  const spinnerColor = color || (persona ? personas[persona].colors.primary : colors.ferni);
  const radius = (sizeConfig.size - sizeConfig.stroke) / 2;
  const circumference = radius * 2 * Math.PI;

  return (
    <div
      className={`ferni-spinner-wrapper ${className}`}
      style={{
        display: centered ? 'flex' : 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        ...(centered ? { width: '100%', height: '100%' } : {}),
        ...style,
      }}
    >
      <svg
        width={sizeConfig.size}
        height={sizeConfig.size}
        viewBox={`0 0 ${sizeConfig.size} ${sizeConfig.size}`}
        className="ferni-spinner"
        style={{
          animation: 'ferni-spin 1s linear infinite',
        }}
      >
        <circle
          cx={sizeConfig.size / 2}
          cy={sizeConfig.size / 2}
          r={radius}
          fill="none"
          stroke={spinnerColor}
          strokeWidth={sizeConfig.stroke}
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * 0.75,
          }}
        />
      </svg>

      {label && (
        <span
          style={{
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: '14px',
            color: colors.textSecondary,
          }}
        >
          {label}
        </span>
      )}

      <style>{`
        @keyframes ferni-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-spinner {
            animation: none;
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
};
