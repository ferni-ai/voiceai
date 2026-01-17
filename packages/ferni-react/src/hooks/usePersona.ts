import { useMemo } from 'react';
import { personas, type PersonaId } from '../tokens';

/**
 * Persona configuration
 */
export interface PersonaConfig {
  id: PersonaId;
  name: string;
  role: string;
  color: {
    primary: string;
    secondary: string;
    glow: string;
    tint: string;
  };
  animation: {
    timingMultiplier: number;
    easingPreference: string;
  };
}

/**
 * Get persona configuration
 * 
 * @example
 * ```tsx
 * const persona = usePersona('ferni');
 * // persona.color.primary === '#4a6741'
 * // persona.animation.timingMultiplier === 1.0
 * ```
 */
export function usePersona(personaId: PersonaId): PersonaConfig {
  return useMemo(() => {
    const data = personas[personaId];
    
    return {
      id: personaId,
      name: data.name,
      role: data.role,
      color: {
        primary: data.colors.primary,
        secondary: data.colors.secondary,
        glow: data.colors.glow,
        tint: data.colors.tint,
      },
      animation: {
        timingMultiplier: data.animation.timingMultiplier,
        easingPreference: data.animation.easingPreference,
      },
    };
  }, [personaId]);
}

/**
 * Get all persona configurations
 * 
 * @example
 * ```tsx
 * const allPersonas = useAllPersonas();
 * allPersonas.map(p => <Avatar key={p.id} persona={p.id} />)
 * ```
 */
export function useAllPersonas(): PersonaConfig[] {
  return useMemo(() => {
    return (Object.keys(personas) as PersonaId[]).map((id) => {
      const data = personas[id];
      return {
        id,
        name: data.name,
        role: data.role,
        color: {
          primary: data.colors.primary,
          secondary: data.colors.secondary,
          glow: data.colors.glow,
          tint: data.colors.tint,
        },
        animation: {
          timingMultiplier: data.animation.timingMultiplier,
          easingPreference: data.animation.easingPreference,
        },
      };
    });
  }, []);
}
