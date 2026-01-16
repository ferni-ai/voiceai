import React from 'react';
import { personas, colors } from '../tokens';
import type { PersonaId } from './Avatar';

// =============================================================================
// Uncertainty Component
// =============================================================================

export interface UncertaintyProps {
  /** Confidence level 0-1 */
  confidence: number;
  /** Show as inline or block */
  display?: 'inline' | 'block';
  /** Show confidence value */
  showValue?: boolean;
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Persona for styling */
  persona?: PersonaId;
  /** Label text */
  label?: string;
  /** Children content */
  children?: React.ReactNode;
}

/**
 * Uncertainty - Visualize AI confidence levels
 * 
 * Used to communicate certainty/uncertainty about AI responses
 */
export const Uncertainty: React.FC<UncertaintyProps> = ({
  confidence,
  display = 'inline',
  showValue = false,
  size = 'md',
  persona = 'ferni',
  label,
  children,
}) => {
  const personaColor = personas[persona]?.colors?.primary || colors.ferni;
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  
  const sizeConfig = {
    sm: { height: 4, fontSize: 11 },
    md: { height: 6, fontSize: 13 },
    lg: { height: 8, fontSize: 14 },
  };
  
  const config = sizeConfig[size];
  
  // Color based on confidence
  const getColor = () => {
    if (clampedConfidence >= 0.8) return personaColor;
    if (clampedConfidence >= 0.5) return colors.warning;
    return colors.textMuted;
  };

  const getLabel = () => {
    if (label) return label;
    if (clampedConfidence >= 0.9) return 'Very confident';
    if (clampedConfidence >= 0.7) return 'Confident';
    if (clampedConfidence >= 0.5) return 'Somewhat uncertain';
    if (clampedConfidence >= 0.3) return 'Uncertain';
    return 'Very uncertain';
  };

  return (
    <div
      className="ferni-uncertainty"
      style={{
        display: display === 'inline' ? 'inline-flex' : 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: display === 'inline' ? 'center' : 'flex-start',
      }}
    >
      {children && (
        <div style={{ opacity: 0.7 + clampedConfidence * 0.3 }}>
          {children}
        </div>
      )}
      
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Progress bar */}
        <div
          style={{
            width: display === 'inline' ? 60 : '100%',
            minWidth: 40,
            height: config.height,
            background: colors.backgroundSubtle,
            borderRadius: config.height,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${clampedConfidence * 100}%`,
              height: '100%',
              background: getColor(),
              borderRadius: config.height,
              transition: 'width 0.3s ease, background 0.3s ease',
            }}
          />
        </div>
        
        {showValue && (
          <span
            style={{
              fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
              fontSize: config.fontSize,
              fontWeight: 500,
              color: colors.textMuted,
              minWidth: 36,
            }}
          >
            {Math.round(clampedConfidence * 100)}%
          </span>
        )}
      </div>
      
      {display === 'block' && (
        <span
          style={{
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: config.fontSize - 1,
            color: colors.textMuted,
          }}
        >
          {getLabel()}
        </span>
      )}
    </div>
  );
};

// =============================================================================
// Thinking Process Component
// =============================================================================

export interface ThinkingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'skipped';
  detail?: string;
}

export interface ThinkingProcessProps {
  /** Steps in the thinking process */
  steps: ThinkingStep[];
  /** Current active step index */
  currentStep?: number;
  /** Show step details */
  showDetails?: boolean;
  /** Persona for styling */
  persona?: PersonaId;
  /** Compact mode */
  compact?: boolean;
}

/**
 * ThinkingProcess - Show AI reasoning steps
 */
export const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
  steps,
  currentStep: _currentStep, // Reserved for step highlighting
  showDetails = true,
  persona = 'ferni',
  compact = false,
}) => {
  const personaColor = personas[persona]?.colors?.primary || colors.ferni;

  const getStepColor = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete': return personaColor;
      case 'active': return personaColor;
      case 'skipped': return colors.textMuted;
      default: return colors.border;
    }
  };

  const getStepIcon = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'active':
        return <div className="thinking-dot" />;
      case 'skipped':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="ferni-thinking-process">
      <div
        style={{
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          gap: compact ? 8 : 12,
        }}
      >
        {steps.map((step) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: compact ? 'center' : 'flex-start',
              gap: 12,
              opacity: step.status === 'pending' ? 0.5 : 1,
            }}
          >
            {/* Step indicator */}
            <div
              style={{
                width: compact ? 20 : 24,
                height: compact ? 20 : 24,
                borderRadius: '50%',
                background: step.status === 'pending' ? 'transparent' : getStepColor(step.status),
                border: `2px solid ${getStepColor(step.status)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.3s ease, border-color 0.3s ease',
              }}
            >
              {getStepIcon(step.status)}
            </div>

            {/* Step content */}
            {!compact && (
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                    fontSize: 14,
                    fontWeight: step.status === 'active' ? 600 : 400,
                    color: step.status === 'pending' ? colors.textMuted : colors.textPrimary,
                  }}
                >
                  {step.label}
                </div>
                {showDetails && step.detail && step.status !== 'pending' && (
                  <div
                    style={{
                      fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                      fontSize: 13,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {step.detail}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes thinking-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1); opacity: 1; }
        }
        
        .thinking-dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: thinking-pulse 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

// =============================================================================
// Memory Recall Component
// =============================================================================

export interface MemoryItem {
  id: string;
  content: string;
  timestamp: Date;
  relevance: number; // 0-1
  source?: string;
}

export interface MemoryRecallProps {
  /** Memories being recalled */
  memories: MemoryItem[];
  /** Is currently searching */
  isSearching?: boolean;
  /** Search query */
  query?: string;
  /** Persona for styling */
  persona?: PersonaId;
  /** On memory click */
  onMemoryClick?: (memory: MemoryItem) => void;
}

/**
 * MemoryRecall - Visualize memory retrieval
 */
export const MemoryRecall: React.FC<MemoryRecallProps> = ({
  memories,
  isSearching = false,
  query,
  persona = 'ferni',
  onMemoryClick,
}) => {
  const personaColor = personas[persona]?.colors?.primary || colors.ferni;

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div className="ferni-memory-recall">
      {/* Search header */}
      {query && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            padding: '8px 12px',
            background: colors.backgroundSubtle,
            borderRadius: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
              fontSize: 13,
              color: colors.textSecondary,
            }}
          >
            Recalling: "{query}"
          </span>
          {isSearching && (
            <div
              style={{
                width: 16,
                height: 16,
                border: `2px solid ${colors.border}`,
                borderTopColor: personaColor,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          )}
        </div>
      )}

      {/* Memory list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {memories.map((memory, index) => (
          <div
            key={memory.id}
            onClick={() => onMemoryClick?.(memory)}
            style={{
              padding: 12,
              background: colors.backgroundElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              cursor: onMemoryClick ? 'pointer' : 'default',
              opacity: 0.5 + memory.relevance * 0.5,
              transform: `translateX(${(1 - memory.relevance) * 10}px)`,
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              animation: `memory-appear 0.3s ease ${index * 0.1}s both`,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                fontSize: 14,
                color: colors.textPrimary,
                marginBottom: 4,
              }}
            >
              {memory.content}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              <span>{formatTimeAgo(memory.timestamp)}</span>
              {memory.source && (
                <>
                  <span>•</span>
                  <span>{memory.source}</span>
                </>
              )}
              <span style={{ marginLeft: 'auto' }}>
                {Math.round(memory.relevance * 100)}% match
              </span>
            </div>
          </div>
        ))}
      </div>

      {memories.length === 0 && !isSearching && (
        <div
          style={{
            textAlign: 'center',
            padding: 24,
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: 14,
            color: colors.textMuted,
          }}
        >
          No memories found
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes memory-appear {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// =============================================================================
// Emotional Mirror Component
// =============================================================================

export interface EmotionalMirrorProps {
  /** Detected emotion */
  emotion: string;
  /** Confidence of detection */
  confidence: number;
  /** Show mirroring animation */
  showMirror?: boolean;
  /** Persona for styling */
  persona?: PersonaId;
  /** Size */
  size?: 'sm' | 'md' | 'lg';
}

const EMOTION_COLORS: Record<string, string> = {
  happy: '#4a6741',
  sad: '#5a6b8a',
  anxious: '#a08054',
  calm: '#4a6741',
  excited: '#c4856a',
  frustrated: '#a05454',
  neutral: '#8A847A',
};

/**
 * EmotionalMirror - Show detected emotion reflection
 */
export const EmotionalMirror: React.FC<EmotionalMirrorProps> = ({
  emotion,
  confidence,
  showMirror = true,
  persona: _persona = 'ferni', // Reserved for persona-specific styling
  size = 'md',
}) => {
  const emotionColor = EMOTION_COLORS[emotion.toLowerCase()] || colors.textMuted;
  const sizeConfig = {
    sm: { size: 48, fontSize: 12 },
    md: { size: 64, fontSize: 14 },
    lg: { size: 80, fontSize: 16 },
  };
  const config = sizeConfig[size];

  return (
    <div
      className="ferni-emotional-mirror"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Mirror visualization */}
      <div
        style={{
          width: config.size,
          height: config.size,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${emotionColor}30, ${emotionColor}10)`,
          border: `2px solid ${emotionColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          animation: showMirror ? 'mirror-pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        {/* Emotion indicator */}
        <div
          style={{
            width: config.size * 0.4,
            height: config.size * 0.4,
            borderRadius: '50%',
            background: emotionColor,
            opacity: confidence,
            transition: 'opacity 0.3s ease',
          }}
        />
        
        {/* Ripple effect */}
        {showMirror && (
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: `2px solid ${emotionColor}`,
              animation: 'mirror-ripple 2s ease-out infinite',
              opacity: 0,
            }}
          />
        )}
      </div>

      {/* Label */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: config.fontSize,
            fontWeight: 500,
            color: colors.textPrimary,
            textTransform: 'capitalize',
          }}
        >
          {emotion}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
            fontSize: config.fontSize - 2,
            color: colors.textMuted,
          }}
        >
          {Math.round(confidence * 100)}% detected
        </div>
      </div>

      <style>{`
        @keyframes mirror-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes mirror-ripple {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
