import React from 'react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconName =
  // Voice
  | 'microphone' | 'microphone-off' | 'waveform' | 'volume' | 'volume-off' | 'headphones' | 'speech-bubble' | 'speech-bubble-typing'
  // AI
  | 'brain' | 'sparkles' | 'lightbulb' | 'thinking' | 'memory' | 'neural' | 'uncertainty'
  // Emotion
  | 'calm' | 'joy' | 'concern' | 'support' | 'growth' | 'reflection' | 'breath' | 'energy'
  // Persona
  | 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan'
  // Action
  | 'play' | 'pause' | 'stop' | 'skip-forward' | 'skip-back' | 'refresh' | 'settings' | 'close' | 'check' | 'plus' | 'minus'
  // Status
  | 'connected' | 'disconnected' | 'loading' | 'success' | 'error' | 'info'
  // Navigation
  | 'home' | 'menu' | 'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down' | 'chevron-left' | 'chevron-right';

export interface IconProps extends React.SVGAttributes<SVGElement> {
  /** Icon name */
  name: IconName;
  /** Icon size */
  size?: IconSize;
  /** Icon color (defaults to currentColor) */
  color?: string;
  /** Accessibility label */
  label?: string;
}

const SIZES: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

const PATHS: Record<IconName, string> = {
  // Voice
  'microphone': 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8',
  'microphone-off': 'M2 2l20 20M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M19 10v1a7 7 0 0 1-.11 1.23M12 19v3M8 22h8M5 10v1a7 7 0 0 0 1.78 4.66',
  'waveform': 'M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0',
  'volume': 'M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
  'volume-off': 'M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6',
  'headphones': 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
  'speech-bubble': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'speech-bubble-typing': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h0M12 10h0M16 10h0',
  
  // AI
  'brain': 'M12 2a4 4 0 0 0-4 4c0 1.1.45 2.1 1.17 2.83L9 9a3 3 0 0 0 0 6l.17.17A4 4 0 0 0 8 18a4 4 0 0 0 8 0 4 4 0 0 0-1.17-2.83L15 15a3 3 0 0 0 0-6l-.17-.17A4 4 0 0 0 16 6a4 4 0 0 0-4-4z',
  'sparkles': 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5zM19 5l.5 1.5L21 7l-1.5.5L19 9l-.5-1.5L17 7l1.5-.5z',
  'lightbulb': 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 21h6M10 21v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1',
  'thinking': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 9h0M12 9h0M16 9h0M8 14s1.5 2 4 2 4-2 4-2',
  'memory': 'M4 4h16v16H4zM9 9v6M15 9v6M4 12h16',
  'neural': 'M12 4v4M12 16v4M4 12h4M16 12h4M6.34 6.34l2.83 2.83M14.83 14.83l2.83 2.83M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83',
  'uncertainty': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 8c1.1 0 2 .9 2 2 0 .74-.4 1.39-1 1.73V13h-2v-2h1a1 1 0 1 0-1-1H9c0-1.66 1.34-3 3-3zM13 17h-2v-2h2z',
  
  // Emotion
  'calm': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 14s1.5 2 4 2 4-2 4-2M9 9h0M15 9h0',
  'joy': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 14s1.5 3 4 3 4-3 4-3M9 9h0M15 9h0',
  'concern': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM16 14s-1.5 2-4 2-4-2-4-2M9 9l1 1M15 9l-1 1',
  'support': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  'growth': 'M12 22V8M5 12l7-7 7 7M8 22h8',
  'reflection': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  'breath': 'M12 22c4-2.5 7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 3 8.5 7 11z',
  'energy': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  
  // Persona
  'ferni': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 20c-2.67 0-5.02-1.37-6.39-3.44C7.02 14.92 9.39 14 12 14s4.98.92 6.39 2.56C17.02 18.63 14.67 20 12 20z',
  'maya': 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  'peter': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  'alex': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
  'jordan': 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'nayan': 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM12 17v4M8 21h8',
  
  // Action
  'play': 'M5 3l14 9-14 9V3z',
  'pause': 'M6 4h4v16H6zM14 4h4v16h-4z',
  'stop': 'M6 6h12v12H6z',
  'skip-forward': 'M5 4l10 8-10 8V4zM19 5v14',
  'skip-back': 'M19 20L9 12l10-8v16zM5 19V5',
  'refresh': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'settings': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  'close': 'M18 6L6 18M6 6l12 12',
  'check': 'M20 6L9 17l-5-5',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  
  // Status
  'connected': 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h0',
  'disconnected': 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M5 12.86a10 10 0 0 1 2.12-1.44M10.66 5c4.01-.36 8.14.9 11.34 3.76M15 10a6.3 6.3 0 0 1 4 2.3M12 20h0',
  'loading': 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  'success': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  'error': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 8v4M12 16h0',
  'info': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 16v-4M12 8h0',
  
  // Navigation
  'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  'menu': 'M3 12h18M3 6h18M3 18h18',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14M5 12l7 7 7-7',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
};

/**
 * Ferni Icon Component
 * 
 * Custom icons designed for voice-first AI experiences
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 'md',
  color,
  label,
  className = '',
  style,
  ...props
}) => {
  const px = SIZES[size];
  const path = PATHS[name];

  if (!path) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ferni-icon ferni-icon-${name} ${className}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={!label}
      style={style}
      {...props}
    >
      <path d={path} />
    </svg>
  );
};

/**
 * Get all available icon names
 */
export const iconNames: IconName[] = Object.keys(PATHS) as IconName[];
