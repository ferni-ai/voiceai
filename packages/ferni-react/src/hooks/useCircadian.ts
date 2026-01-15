import { useMemo, useEffect, useState } from 'react';

/**
 * Time periods for circadian design
 */
export type CircadianPeriod =
  | 'earlyMorning'  // 5-7am
  | 'morning'       // 7-10am
  | 'midday'        // 10am-2pm
  | 'afternoon'     // 2-5pm
  | 'evening'       // 5-8pm
  | 'night'         // 8-10pm
  | 'lateNight'     // 10pm-12am
  | 'deepNight';    // 12-5am

/**
 * Circadian configuration
 */
export interface CircadianConfig {
  /** Current time period */
  period: CircadianPeriod;
  /** Warmth factor (0-1, higher at night) */
  warmth: number;
  /** Brightness factor (0-1, lower at night) */
  brightness: number;
  /** Animation speed multiplier (slower at night) */
  animationSpeed: number;
  /** Whether it's nighttime (8pm-7am) */
  isNight: boolean;
  /** Current hour (0-23) */
  hour: number;
}

/**
 * Period configurations
 */
const PERIOD_CONFIG: Record<CircadianPeriod, Omit<CircadianConfig, 'period' | 'isNight' | 'hour'>> = {
  earlyMorning: { warmth: 0.25, brightness: 0.85, animationSpeed: 0.9 },
  morning: { warmth: 0.15, brightness: 1.0, animationSpeed: 1.0 },
  midday: { warmth: 0.1, brightness: 1.0, animationSpeed: 1.1 },
  afternoon: { warmth: 0.15, brightness: 0.95, animationSpeed: 1.0 },
  evening: { warmth: 0.25, brightness: 0.9, animationSpeed: 0.95 },
  night: { warmth: 0.3, brightness: 0.8, animationSpeed: 0.85 },
  lateNight: { warmth: 0.35, brightness: 0.75, animationSpeed: 0.75 },
  deepNight: { warmth: 0.35, brightness: 0.7, animationSpeed: 0.6 },
};

/**
 * Get period from hour
 */
function getPeriodFromHour(hour: number): CircadianPeriod {
  if (hour >= 5 && hour < 7) return 'earlyMorning';
  if (hour >= 7 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  if (hour >= 20 && hour < 22) return 'night';
  if (hour >= 22 || hour < 0) return 'lateNight';
  return 'deepNight';
}

/**
 * Hook for circadian (time-of-day) design adaptation
 * 
 * @example
 * ```tsx
 * const { period, warmth, brightness, isNight } = useCircadian();
 * 
 * // Adjust UI based on time
 * const bgOpacity = brightness * 0.95;
 * ```
 */
export function useCircadian(): CircadianConfig {
  const [hour, setHour] = useState(() => new Date().getHours());

  // Update hour periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setHour(new Date().getHours());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const period = getPeriodFromHour(hour);
    const config = PERIOD_CONFIG[period];
    const isNight = hour >= 20 || hour < 7;

    return {
      period,
      ...config,
      isNight,
      hour,
    };
  }, [hour]);
}

/**
 * Get time-appropriate greeting
 * 
 * @example
 * ```tsx
 * const greeting = useGreeting();
 * // "Good morning" / "Good afternoon" / "Good evening"
 * ```
 */
export function useGreeting(): string {
  const { period } = useCircadian();

  return useMemo(() => {
    switch (period) {
      case 'earlyMorning':
        return 'Good early morning';
      case 'morning':
        return 'Good morning';
      case 'midday':
      case 'afternoon':
        return 'Good afternoon';
      case 'evening':
        return 'Good evening';
      case 'night':
      case 'lateNight':
      case 'deepNight':
        return "Hey, you're up late";
      default:
        return 'Hello';
    }
  }, [period]);
}
