import React, { useEffect, useState, useCallback, useRef } from 'react';
import { celebrationColors } from '../tokens';

/**
 * Celebration types
 */
export type CelebrationType = 
  | 'smallWin' 
  | 'bigWin' 
  | 'milestone' 
  | 'streak' 
  | 'teamUnlock';

/**
 * Celebration props
 */
export interface CelebrationProps {
  /** Type of celebration */
  type?: CelebrationType;
  /** Trigger the celebration */
  trigger?: boolean;
  /** Called when celebration completes */
  onComplete?: () => void;
  /** Number of particles */
  particleCount?: number;
  /** Duration in ms */
  duration?: number;
  /** Enable haptic feedback */
  haptic?: boolean;
}

/**
 * Particle data
 */
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  delay: number;
}

/**
 * Celebration colors from centralized tokens
 */
const CELEBRATION_COLORS: Record<CelebrationType, readonly string[]> = celebrationColors;

/**
 * Particle counts by type
 */
const PARTICLE_COUNTS: Record<CelebrationType, number> = {
  smallWin: 20,
  bigWin: 60,
  milestone: 80,
  streak: 40,
  teamUnlock: 50,
};

/**
 * Durations by type
 */
const DURATIONS: Record<CelebrationType, number> = {
  smallWin: 1500,
  bigWin: 2500,
  milestone: 3000,
  streak: 2000,
  teamUnlock: 2500,
};

/**
 * Generate random particles
 */
function generateParticles(type: CelebrationType, count: number): Particle[] {
  const colors = CELEBRATION_COLORS[type];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20, // Center-ish
    y: 50,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 4 + Math.random() * 8,
    rotation: Math.random() * 360,
    velocityX: (Math.random() - 0.5) * 15,
    velocityY: -10 - Math.random() * 10,
    delay: Math.random() * 200,
  }));
}

/**
 * Celebration - Confetti and particle effects
 * 
 * @example
 * ```tsx
 * const [showCelebration, setShowCelebration] = useState(false);
 * 
 * <Button onClick={() => setShowCelebration(true)}>
 *   Celebrate!
 * </Button>
 * 
 * <Celebration 
 *   type="bigWin" 
 *   trigger={showCelebration}
 *   onComplete={() => setShowCelebration(false)}
 * />
 * ```
 */
export const Celebration: React.FC<CelebrationProps> = ({
  type = 'smallWin',
  trigger = false,
  onComplete,
  particleCount,
  duration,
  haptic = true,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const actualParticleCount = particleCount ?? PARTICLE_COUNTS[type];
  const actualDuration = duration ?? DURATIONS[type];

  // Start celebration
  const startCelebration = useCallback(() => {
    setParticles(generateParticles(type, actualParticleCount));
    setIsActive(true);

    // Haptic feedback
    if (haptic && 'vibrate' in navigator) {
      const pattern = type === 'bigWin' || type === 'milestone' 
        ? [50, 50, 50, 50, 100] 
        : [30, 30, 50];
      navigator.vibrate(pattern);
    }

    // End celebration
    setTimeout(() => {
      setIsActive(false);
      setParticles([]);
      onComplete?.();
    }, actualDuration);
  }, [type, actualParticleCount, actualDuration, haptic, onComplete]);

  // Watch trigger prop
  useEffect(() => {
    if (trigger && !isActive) {
      startCelebration();
    }
  }, [trigger, isActive, startCelebration]);

  if (!isActive || particles.length === 0) {
    return null;
  }

  return (
    <>
      <div 
        ref={containerRef}
        className="ferni-celebration"
        aria-hidden="true"
      >
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="ferni-celebration__particle"
            style={{
              '--x': `${particle.x}%`,
              '--y': `${particle.y}%`,
              '--color': particle.color,
              '--size': `${particle.size}px`,
              '--rotation': `${particle.rotation}deg`,
              '--velocity-x': particle.velocityX,
              '--velocity-y': particle.velocityY,
              '--delay': `${particle.delay}ms`,
              '--duration': `${actualDuration}ms`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <style>{`
        .ferni-celebration {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          overflow: hidden;
        }

        .ferni-celebration__particle {
          position: absolute;
          left: var(--x);
          top: var(--y);
          width: var(--size);
          height: var(--size);
          background: var(--color);
          border-radius: 2px;
          transform: rotate(var(--rotation));
          animation: ferni-confetti var(--duration) ease-out forwards;
          animation-delay: var(--delay);
          opacity: 0;
        }

        @keyframes ferni-confetti {
          0% {
            opacity: 1;
            transform: 
              translateX(0) 
              translateY(0) 
              rotate(var(--rotation))
              scale(0);
          }
          10% {
            opacity: 1;
            transform: 
              translateX(calc(var(--velocity-x) * 0.1vw)) 
              translateY(calc(var(--velocity-y) * 0.1vh)) 
              rotate(calc(var(--rotation) + 20deg))
              scale(1);
          }
          100% {
            opacity: 0;
            transform: 
              translateX(calc(var(--velocity-x) * 3vw)) 
              translateY(calc(var(--velocity-y) * -3vh + 100vh)) 
              rotate(calc(var(--rotation) + 720deg))
              scale(0.5);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ferni-celebration__particle {
            animation: ferni-confetti-reduced var(--duration) ease-out forwards;
          }
          
          @keyframes ferni-confetti-reduced {
            0% { opacity: 0; }
            20% { opacity: 1; }
            100% { opacity: 0; }
          }
        }
      `}</style>
    </>
  );
};

/**
 * Hook to trigger celebrations imperatively
 */
export function useCelebration() {
  const [state, setState] = useState<{
    active: boolean;
    type: CelebrationType;
  }>({ active: false, type: 'smallWin' });

  const celebrate = useCallback((type: CelebrationType = 'smallWin') => {
    setState({ active: true, type });
  }, []);

  const handleComplete = useCallback(() => {
    setState((prev) => ({ ...prev, active: false }));
  }, []);

  const CelebrationComponent = useCallback(
    () => (
      <Celebration
        type={state.type}
        trigger={state.active}
        onComplete={handleComplete}
      />
    ),
    [state.active, state.type, handleComplete]
  );

  return { celebrate, CelebrationComponent };
}

Celebration.displayName = 'Celebration';
