import React, { forwardRef, useMemo } from 'react';
import { personas, type PersonaId as TokenPersonaId } from '../tokens';

/**
 * Available Ferni personas
 */
export type PersonaId = TokenPersonaId;

/**
 * Avatar states
 */
export type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking' | 'celebrating' | 'concerned';

/**
 * Expression types (subset - full list in design-system/tokens/expressions.json)
 */
export type Expression =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'concerned'
  | 'thinking'
  | 'excited'
  | 'sleepy'
  | 'surprised'
  | 'warm';

/**
 * Avatar component props
 */
export interface AvatarProps {
  /** Which persona to display */
  persona?: PersonaId;
  /** Size in pixels */
  size?: number;
  /** Current state */
  state?: AvatarState;
  /** Enable breathing animation */
  breathing?: boolean;
  /** Enable glow ring */
  glow?: boolean;
  /** Facial expression */
  expression?: Expression;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Get persona color from centralized tokens
 */
const getPersonaColor = (personaId: PersonaId): string => {
  return personas[personaId]?.colors.primary ?? '#4a6741';
};

/**
 * Avatar - The heart of Ferni
 * 
 * Animated persona representation with Luxo-style eyes (white orbs, no pupils).
 * Expression is conveyed through lid position, body movement, and glow.
 * 
 * @example
 * ```tsx
 * <Avatar persona="ferni" size={200} breathing />
 * ```
 */
export const Avatar = forwardRef<SVGSVGElement, AvatarProps>(function Avatar(
  {
    persona = 'ferni',
    size = 200,
    state = 'idle',
    breathing = true,
    glow = true,
    expression = 'neutral',
    onClick,
    className = '',
    style,
  },
  ref
) {
  const color = getPersonaColor(persona);
  
  // Build CSS classes
  const classes = useMemo(() => {
    const baseClasses = ['ferni-avatar'];
    if (breathing) baseClasses.push('breathing');
    if (state === 'speaking') baseClasses.push('speaking');
    if (state === 'celebrating') baseClasses.push('celebrating');
    if (className) baseClasses.push(className);
    return baseClasses.join(' ');
  }, [breathing, state, className]);
  
  // Ring opacity based on state
  const ringOpacity = useMemo(() => {
    if (!glow) return 0;
    switch (state) {
      case 'celebrating': return 0.6;
      case 'speaking': return 0.4;
      case 'listening': return 0.35;
      default: return 0.2;
    }
  }, [glow, state]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={classes}
      style={{
        '--persona-primary': color,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      } as React.CSSProperties}
      onClick={onClick}
      role="img"
      aria-label={`${persona}, your ${persona === 'ferni' ? 'life coach' : 'team member'}`}
    >
      <defs>
        <filter id={`glow-${persona}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Presence Ring */}
      <circle 
        cx="100" 
        cy="100" 
        r="85"
        fill="none"
        stroke={color}
        strokeWidth={state === 'celebrating' ? 2.5 : 1}
        opacity={ringOpacity}
        filter={`url(#glow-${persona})`}
        style={{
          transition: 'opacity 0.4s ease, stroke-width 0.4s ease',
        }}
      />
      
      {/* Body Group */}
      <g 
        className="ferni-body-group"
        style={{
          transformOrigin: 'center center',
        }}
      >
        {/* Main Body */}
        <circle 
          cx="100" 
          cy="100" 
          r="70"
          fill={color}
        />
        
        {/* Eyes (white orbs - NO pupils!) */}
        <g className="ferni-eyes-group">
          <ellipse 
            cx="70" 
            cy="88" 
            rx="15" 
            ry="12"
            fill="white"
            className="ferni-eye"
          />
          <ellipse 
            cx="130" 
            cy="88" 
            rx="15" 
            ry="12"
            fill="white"
            className="ferni-eye"
          />
        </g>
        
        {/* Smile crease (for warm expressions) */}
        {(expression === 'happy' || expression === 'warm' || expression === 'excited') && (
          <path 
            d="M75 115 Q100 125, 125 115"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
            style={{
              filter: 'brightness(0.85)',
            }}
          />
        )}
      </g>
      
      <style>{`
        .ferni-avatar {
          user-select: none;
        }
        
        .ferni-avatar.breathing .ferni-body-group {
          animation: ferni-breathe 4s ease-in-out infinite;
        }
        
        .ferni-avatar.speaking .ferni-body-group {
          animation: ferni-speak 0.4s ease-in-out infinite alternate;
        }
        
        .ferni-avatar.celebrating .ferni-body-group {
          animation: ferni-celebrate 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes ferni-breathe {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          50% { transform: scaleY(1.018) scaleX(0.994); }
        }
        
        @keyframes ferni-speak {
          0% { transform: scaleY(1) scaleX(1); }
          100% { transform: scaleY(1.03) scaleX(0.98); }
        }
        
        @keyframes ferni-celebrate {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.08); }
          100% { transform: translateY(0) scale(1); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-avatar .ferni-body-group {
            animation: none !important;
          }
        }
      `}</style>
    </svg>
  );
});

Avatar.displayName = 'Avatar';
