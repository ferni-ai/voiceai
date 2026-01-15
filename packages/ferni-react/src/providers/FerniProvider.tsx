import React, { createContext, useContext, useState, useMemo } from 'react';
import type { PersonaId } from '../components/Avatar';

/**
 * Ferni context value
 */
export interface FerniContextValue {
  /** Current active persona */
  persona: PersonaId;
  /** Set the active persona */
  setPersona: (persona: PersonaId) => void;
  /** Current theme mode */
  theme: 'light' | 'dark' | 'auto';
  /** Set theme mode */
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  /** User ID for relationship tracking */
  userId?: string;
  /** Whether haptics are enabled */
  hapticsEnabled: boolean;
  /** Toggle haptics */
  setHapticsEnabled: (enabled: boolean) => void;
  /** Whether sounds are enabled */
  soundEnabled: boolean;
  /** Toggle sounds */
  setSoundEnabled: (enabled: boolean) => void;
}

/**
 * Ferni provider props
 */
export interface FerniProviderProps {
  children: React.ReactNode;
  /** User ID for relationship tracking */
  userId?: string;
  /** Initial persona */
  initialPersona?: PersonaId;
  /** Enable haptic feedback */
  enableHaptics?: boolean;
  /** Enable sounds */
  enableSound?: boolean;
  /** Theme mode */
  theme?: 'light' | 'dark' | 'auto';
}

const FerniContext = createContext<FerniContextValue | null>(null);

/**
 * FerniProvider - Wrap your app to enable Ferni features
 * 
 * @example
 * ```tsx
 * <FerniProvider userId="user-123">
 *   <App />
 * </FerniProvider>
 * ```
 */
export const FerniProvider: React.FC<FerniProviderProps> = ({
  children,
  userId,
  initialPersona = 'ferni',
  enableHaptics = true,
  enableSound = true,
  theme: initialTheme = 'auto',
}) => {
  const [persona, setPersona] = useState<PersonaId>(initialPersona);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(initialTheme);
  const [hapticsEnabled, setHapticsEnabled] = useState(enableHaptics);
  const [soundEnabled, setSoundEnabled] = useState(enableSound);

  const value = useMemo<FerniContextValue>(
    () => ({
      persona,
      setPersona,
      theme,
      setTheme,
      userId,
      hapticsEnabled,
      setHapticsEnabled,
      soundEnabled,
      setSoundEnabled,
    }),
    [persona, theme, userId, hapticsEnabled, soundEnabled]
  );

  return (
    <FerniContext.Provider value={value}>
      {children}
    </FerniContext.Provider>
  );
};

/**
 * Hook to access Ferni context
 * 
 * @example
 * ```tsx
 * const { persona, setPersona } = useFerni();
 * ```
 */
export const useFerni = (): FerniContextValue => {
  const context = useContext(FerniContext);
  if (!context) {
    throw new Error('useFerni must be used within a FerniProvider');
  }
  return context;
};
