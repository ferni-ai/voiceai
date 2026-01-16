import React, { useMemo } from 'react';
import { personas } from '../tokens';
import type { PersonaId } from './Avatar';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
export type TurnOwner = 'user' | 'ai' | 'none';

export interface VoiceIndicatorProps {
  /** Current voice state */
  state?: VoiceState;
  /** Who currently has the turn */
  turnOwner?: TurnOwner;
  /** Persona for styling */
  persona?: PersonaId;
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const SIZE_CONFIG = {
  sm: { size: 40, strokeWidth: 2, dotSize: 6 },
  md: { size: 56, strokeWidth: 3, dotSize: 8 },
  lg: { size: 72, strokeWidth: 4, dotSize: 10 },
};

const STATE_LABELS: Record<VoiceState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  interrupted: 'Paused',
};

/**
 * Voice Indicator - Visual feedback for voice interactions
 */
export const VoiceIndicator: React.FC<VoiceIndicatorProps> = ({
  state = 'idle',
  turnOwner: _turnOwner = 'none', // Reserved for future use
  persona = 'ferni',
  size = 'md',
  className = '',
  style,
}) => {
  const sizeConfig = SIZE_CONFIG[size];
  const color = personas[persona]?.colors?.primary || '#4a6741';

  const ringStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: sizeConfig.size,
      height: sizeConfig.size,
      borderRadius: '50%',
      border: `${sizeConfig.strokeWidth}px solid`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
    };

    switch (state) {
      case 'listening':
        return { ...base, borderColor: color, animation: 'voice-pulse 2s ease-in-out infinite' };
      case 'thinking':
        return { ...base, borderColor: `${color}80`, animation: 'voice-rotate 2s linear infinite' };
      case 'speaking':
        return { ...base, borderColor: color, boxShadow: `0 0 20px ${color}40` };
      case 'interrupted':
        return { ...base, borderColor: '#a08054' };
      default:
        return { ...base, borderColor: 'rgba(44, 37, 32, 0.15)' };
    }
  }, [state, color, sizeConfig]);

  const renderInnerContent = () => {
    switch (state) {
      case 'listening':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 8 + Math.random() * 8,
                  background: color,
                  borderRadius: 2,
                  animation: `voice-bar ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        );

      case 'thinking':
        return (
          <div style={{ width: sizeConfig.size * 0.5, height: sizeConfig.size * 0.5, position: 'relative' }}>
            {[0, 1, 2].map((i) => {
              const angle = (i * 120) * (Math.PI / 180);
              const radius = sizeConfig.size * 0.2;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: sizeConfig.dotSize,
                    height: sizeConfig.dotSize,
                    background: color,
                    borderRadius: '50%',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`,
                    animation: 'voice-dot-pulse 1s ease-in-out infinite',
                    animationDelay: `${i * 0.33}s`,
                  }}
                />
              );
            })}
          </div>
        );

      case 'speaking':
        return (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: sizeConfig.size * 0.4,
                  height: sizeConfig.size * 0.4,
                  border: `2px solid ${color}`,
                  borderRadius: '50%',
                  animation: 'voice-speak-ring 1.5s ease-out infinite',
                  animationDelay: `${i * 0.5}s`,
                  opacity: 0,
                }}
              />
            ))}
            <div
              style={{
                width: sizeConfig.dotSize * 2,
                height: sizeConfig.dotSize * 2,
                background: color,
                borderRadius: '50%',
              }}
            />
          </div>
        );

      case 'interrupted':
        return (
          <svg width={sizeConfig.size * 0.3} height={sizeConfig.size * 0.3} viewBox="0 0 24 24" fill={color}>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        );

      default:
        return (
          <div
            style={{
              width: sizeConfig.dotSize,
              height: sizeConfig.dotSize,
              background: '#8A847A',
              borderRadius: '50%',
            }}
          />
        );
    }
  };

  return (
    <div
      className={`ferni-voice-indicator ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      <div style={ringStyle}>{renderInnerContent()}</div>
      
      <span
        style={{
          fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
          fontSize: 12,
          fontWeight: 500,
          color: '#8A847A',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {STATE_LABELS[state]}
      </span>

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes voice-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes voice-bar {
          0% { height: 8px; }
          100% { height: 20px; }
        }
        
        @keyframes voice-dot-pulse {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        
        @keyframes voice-speak-ring {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-voice-indicator * {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
