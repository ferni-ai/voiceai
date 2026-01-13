/**
 * Time-Fading Color System
 *
 * Implements James Gurney's atmospheric perspective principle for temporal design.
 * Older memories desaturate and fade, creating visual depth through time.
 *
 * "In atmospheric perspective, distant objects lose contrast, saturation,
 * and shift toward the color of the atmosphere." - James Gurney, Color and Light
 *
 * Applied to UI: Recent = vivid/present, Old = faded/distant
 *
 * @module color/time-fading
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Time period categories for fading calculation.
 * Each represents a conceptual "distance" in time.
 */
export type TimePeriod =
  | 'now' // Current moment - full vivid
  | 'today' // Within same day
  | 'yesterday' // Previous day
  | 'thisWeek' // Within 7 days
  | 'lastWeek' // 7-14 days ago
  | 'thisMonth' // Within 30 days
  | 'lastMonth' // 30-60 days ago
  | 'older' // 60-180 days ago
  | 'ancient'; // More than 180 days ago

/**
 * Fading parameters for each time period.
 */
export interface FadingParameters {
  /** Saturation multiplier (1.0 = full, 0.0 = grayscale) */
  saturation: number;
  /** Lightness shift (positive = lighter, negative = darker) */
  lightnessShift: number;
  /** Opacity multiplier (1.0 = fully opaque) */
  opacity: number;
  /** Optional hue shift toward atmospheric color (degrees) */
  hueShift: number;
  /** Blur amount for "distant" effect (pixels) */
  blur: number;
}

/**
 * Configuration for time fading system.
 */
export interface TimeFadingConfig {
  /** The date/timestamp to calculate fading from */
  date: Date | number | string;
  /** Base color in hex format */
  baseColor: string;
  /** Whether to apply blur effect */
  applyBlur?: boolean;
  /** Custom atmospheric color (default: soft blue-gray) */
  atmosphericColor?: string;
  /** Intensity of fading effect (0-1, default: 1) */
  intensity?: number;
  /** Persona ID for brand-aligned atmospheric color */
  persona?: string;
}

/**
 * Result of time fading calculation.
 */
export interface TimeFadingResult {
  /** The faded color in hex format */
  color: string;
  /** The faded color in HSL format */
  hsl: { h: number; s: number; l: number };
  /** The calculated time period */
  period: TimePeriod;
  /** Opacity to apply */
  opacity: number;
  /** Blur amount if enabled */
  blur: number;
  /** CSS filter string for easy application */
  cssFilter: string;
  /** CSS variables for styling */
  cssVariables: Record<string, string>;
  /** Human-readable time description */
  timeDescription: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Fading parameters for each time period.
 * Based on Gurney's atmospheric perspective principles.
 */
export const TIME_FADING_PARAMS: Record<TimePeriod, FadingParameters> = {
  now: {
    saturation: 1.0,
    lightnessShift: 0,
    opacity: 1.0,
    hueShift: 0,
    blur: 0,
  },
  today: {
    saturation: 0.95,
    lightnessShift: 2,
    opacity: 1.0,
    hueShift: 0,
    blur: 0,
  },
  yesterday: {
    saturation: 0.88,
    lightnessShift: 4,
    opacity: 0.97,
    hueShift: 2,
    blur: 0,
  },
  thisWeek: {
    saturation: 0.78,
    lightnessShift: 7,
    opacity: 0.94,
    hueShift: 5,
    blur: 0.5,
  },
  lastWeek: {
    saturation: 0.68,
    lightnessShift: 10,
    opacity: 0.90,
    hueShift: 8,
    blur: 0.75,
  },
  thisMonth: {
    saturation: 0.55,
    lightnessShift: 14,
    opacity: 0.85,
    hueShift: 12,
    blur: 1,
  },
  lastMonth: {
    saturation: 0.42,
    lightnessShift: 18,
    opacity: 0.78,
    hueShift: 16,
    blur: 1.25,
  },
  older: {
    saturation: 0.30,
    lightnessShift: 22,
    opacity: 0.70,
    hueShift: 20,
    blur: 1.5,
  },
  ancient: {
    saturation: 0.18,
    lightnessShift: 26,
    opacity: 0.60,
    hueShift: 25,
    blur: 2,
  },
};

/**
 * Atmospheric colors per persona.
 * These are the colors that distant/old items shift toward.
 */
const PERSONA_ATMOSPHERIC_COLORS: Record<string, string> = {
  ferni: '#8fa89a', // Soft sage mist
  maya: '#c4a69a', // Warm desert haze
  peter: '#8a9fab', // Cool analytical fog
  jordan: '#d4b09a', // Golden sunset haze
  alex: '#9aa4b8', // Professional blue mist
  nayan: '#c8b08a', // Wisdom gold haze
  default: '#a8b0b8', // Neutral atmospheric gray-blue
};

/**
 * Time period thresholds in milliseconds.
 */
const TIME_THRESHOLDS: Record<TimePeriod, number> = {
  now: 0,
  today: 0, // Calculated dynamically based on start of day
  yesterday: 24 * 60 * 60 * 1000, // 1 day
  thisWeek: 7 * 24 * 60 * 60 * 1000, // 7 days
  lastWeek: 14 * 24 * 60 * 60 * 1000, // 14 days
  thisMonth: 30 * 24 * 60 * 60 * 1000, // 30 days
  lastMonth: 60 * 24 * 60 * 60 * 1000, // 60 days
  older: 180 * 24 * 60 * 60 * 1000, // 180 days
  ancient: Infinity,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert hex color to HSL.
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to hex color.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number): string => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Interpolate between two HSL colors.
 */
function interpolateHSL(
  hsl1: { h: number; s: number; l: number },
  hsl2: { h: number; s: number; l: number },
  factor: number
): { h: number; s: number; l: number } {
  // Handle hue interpolation (shortest path around color wheel)
  let hDiff = hsl2.h - hsl1.h;
  if (hDiff > 180) hDiff -= 360;
  if (hDiff < -180) hDiff += 360;

  return {
    h: (hsl1.h + hDiff * factor + 360) % 360,
    s: hsl1.s + (hsl2.s - hsl1.s) * factor,
    l: hsl1.l + (hsl2.l - hsl1.l) * factor,
  };
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Determine the time period for a given date.
 */
export function getTimePeriod(date: Date | number | string): TimePeriod {
  const targetDate = new Date(date);
  const now = new Date();

  // Get start of today
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const targetTime = targetDate.getTime();
  const nowTime = now.getTime();
  const startOfTodayTime = startOfToday.getTime();

  // Calculate age in milliseconds
  const age = nowTime - targetTime;

  // Check if it's today (same calendar day)
  if (targetTime >= startOfTodayTime) {
    // Check if it's recent (within last 5 minutes)
    if (age < 5 * 60 * 1000) {
      return 'now';
    }
    return 'today';
  }

  // Check other periods
  if (age < TIME_THRESHOLDS.yesterday) return 'yesterday';
  if (age < TIME_THRESHOLDS.thisWeek) return 'thisWeek';
  if (age < TIME_THRESHOLDS.lastWeek) return 'lastWeek';
  if (age < TIME_THRESHOLDS.thisMonth) return 'thisMonth';
  if (age < TIME_THRESHOLDS.lastMonth) return 'lastMonth';
  if (age < TIME_THRESHOLDS.older) return 'older';

  return 'ancient';
}

/**
 * Get human-readable time description.
 */
export function getTimeDescription(date: Date | number | string): string {
  const targetDate = new Date(date);
  const now = new Date();
  const age = now.getTime() - targetDate.getTime();

  const minutes = Math.floor(age / (60 * 1000));
  const hours = Math.floor(age / (60 * 60 * 1000));
  const days = Math.floor(age / (24 * 60 * 60 * 1000));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (weeks === 1) return 'Last week';
  if (weeks < 4) return `${weeks} weeks ago`;
  if (months === 1) return 'Last month';
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Calculate faded color based on time.
 * Core implementation of Gurney's atmospheric perspective.
 */
export function calculateTimeFading(config: TimeFadingConfig): TimeFadingResult {
  const {
    date,
    baseColor,
    applyBlur = false,
    atmosphericColor,
    intensity = 1,
    persona = 'default',
  } = config;

  // Get time period
  const period = getTimePeriod(date);
  const params = TIME_FADING_PARAMS[period];

  // Get atmospheric color for this persona (with fallback to default)
  const defaultAtmosColor = '#a8b0b8'; // Neutral atmospheric gray-blue
  const personaAtmos = PERSONA_ATMOSPHERIC_COLORS[persona];
  const atmosColor: string = atmosphericColor ?? personaAtmos ?? defaultAtmosColor;

  // Convert colors to HSL
  const baseHSL = hexToHSL(baseColor);
  const atmosHSL = hexToHSL(atmosColor);

  // Apply saturation reduction
  const fadedSaturation = baseHSL.s * (params.saturation + (1 - intensity) * (1 - params.saturation));

  // Apply lightness shift (items fade lighter, like distant mountains)
  const fadedLightness = clamp(baseHSL.l + params.lightnessShift * intensity, 0, 100);

  // Apply hue shift toward atmospheric color
  const hueShiftAmount = params.hueShift * intensity;
  let fadedHue = baseHSL.h;
  if (hueShiftAmount > 0) {
    // Shift hue toward atmospheric hue
    const hueDiff = atmosHSL.h - baseHSL.h;
    const normalizedDiff = hueDiff > 180 ? hueDiff - 360 : hueDiff < -180 ? hueDiff + 360 : hueDiff;
    fadedHue = (baseHSL.h + (normalizedDiff * hueShiftAmount) / 360 + 360) % 360;
  }

  // Build final HSL
  const finalHSL = {
    h: Math.round(fadedHue),
    s: Math.round(fadedSaturation),
    l: Math.round(fadedLightness),
  };

  // Convert back to hex
  const finalColor = hslToHex(finalHSL.h, finalHSL.s, finalHSL.l);

  // Calculate opacity
  const finalOpacity = params.opacity + (1 - intensity) * (1 - params.opacity);

  // Calculate blur
  const finalBlur = applyBlur ? params.blur * intensity : 0;

  // Build CSS filter
  const filterParts: string[] = [];
  if (finalOpacity < 1) {
    filterParts.push(`opacity(${finalOpacity})`);
  }
  if (finalBlur > 0) {
    filterParts.push(`blur(${finalBlur}px)`);
  }
  // Add subtle desaturation via filter for extra effect
  if (params.saturation < 0.7) {
    filterParts.push(`saturate(${0.8 + params.saturation * 0.2})`);
  }

  return {
    color: finalColor,
    hsl: finalHSL,
    period,
    opacity: finalOpacity,
    blur: finalBlur,
    cssFilter: filterParts.length > 0 ? filterParts.join(' ') : 'none',
    cssVariables: {
      '--time-faded-color': finalColor,
      '--time-faded-opacity': String(finalOpacity),
      '--time-faded-blur': `${finalBlur}px`,
      '--time-period': period,
    },
    timeDescription: getTimeDescription(date),
  };
}

/**
 * Apply time fading to an HTML element.
 */
export function applyTimeFading(
  element: HTMLElement,
  config: TimeFadingConfig
): () => void {
  const result = calculateTimeFading(config);

  // Store original styles
  const originalColor = element.style.color;
  const originalBgColor = element.style.backgroundColor;
  const originalFilter = element.style.filter;
  const originalOpacity = element.style.opacity;

  // Apply CSS variables
  Object.entries(result.cssVariables).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });

  // Apply faded color if element has text color
  if (element.style.color || getComputedStyle(element).color) {
    element.style.color = result.color;
  }

  // Apply filter for blur/opacity effects
  if (result.cssFilter !== 'none') {
    element.style.filter = result.cssFilter;
  }

  // Apply opacity
  element.style.opacity = String(result.opacity);

  // Add data attribute for debugging/styling
  element.dataset.timePeriod = result.period;
  element.dataset.timeDescription = result.timeDescription;

  // Return cleanup function
  return () => {
    element.style.color = originalColor;
    element.style.backgroundColor = originalBgColor;
    element.style.filter = originalFilter;
    element.style.opacity = originalOpacity;
    delete element.dataset.timePeriod;
    delete element.dataset.timeDescription;
    Object.keys(result.cssVariables).forEach((key) => {
      element.style.removeProperty(key);
    });
  };
}

/**
 * Generate CSS for time-faded colors.
 */
export function generateTimeFadingCSS(
  selector: string,
  baseColor: string,
  persona?: string
): string {
  const periods: TimePeriod[] = [
    'now',
    'today',
    'yesterday',
    'thisWeek',
    'lastWeek',
    'thisMonth',
    'lastMonth',
    'older',
    'ancient',
  ];

  const rules: string[] = [];

  periods.forEach((period) => {
    // Create a mock date for each period
    const mockDates: Record<TimePeriod, number> = {
      now: Date.now(),
      today: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      yesterday: Date.now() - 30 * 60 * 60 * 1000, // 30 hours ago
      thisWeek: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
      lastWeek: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      thisMonth: Date.now() - 20 * 24 * 60 * 60 * 1000, // 20 days ago
      lastMonth: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45 days ago
      older: Date.now() - 120 * 24 * 60 * 60 * 1000, // 120 days ago
      ancient: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
    };

    const result = calculateTimeFading({
      date: mockDates[period],
      baseColor,
      persona,
      applyBlur: true,
    });

    rules.push(`
${selector}[data-time-period="${period}"] {
  --time-faded-color: ${result.color};
  --time-faded-opacity: ${result.opacity};
  --time-faded-blur: ${result.blur}px;
  color: var(--time-faded-color);
  opacity: var(--time-faded-opacity);
  filter: blur(var(--time-faded-blur));
}`);
  });

  return rules.join('\n');
}

/**
 * Create animated transition between time states.
 * Useful for when an item ages across a threshold during viewing.
 */
export function animateTimeFading(
  element: HTMLElement,
  fromDate: Date,
  toDate: Date,
  config: Omit<TimeFadingConfig, 'date'>,
  duration: number = 1000
): Promise<void> {
  return new Promise((resolve) => {
    const fromResult = calculateTimeFading({ ...config, date: fromDate });
    const toResult = calculateTimeFading({ ...config, date: toDate });

    const fromHSL = fromResult.hsl;
    const toHSL = toResult.hsl;
    const startTime = performance.now();

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Skip animation, apply final state immediately
      applyTimeFading(element, { ...config, date: toDate });
      resolve();
      return;
    }

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use ease-out for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Interpolate HSL values
      const currentHSL = interpolateHSL(fromHSL, toHSL, eased);
      const currentColor = hslToHex(currentHSL.h, currentHSL.s, currentHSL.l);

      // Interpolate opacity
      const currentOpacity = fromResult.opacity + (toResult.opacity - fromResult.opacity) * eased;

      // Apply current state
      element.style.color = currentColor;
      element.style.opacity = String(currentOpacity);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Apply final state with cleanup function
        applyTimeFading(element, { ...config, date: toDate });
        resolve();
      }
    }

    requestAnimationFrame(animate);
  });
}

/**
 * Interpolate fading parameters for smooth transitions between periods.
 */
export function interpolateFadingParams(
  period1: TimePeriod,
  period2: TimePeriod,
  factor: number
): FadingParameters {
  const p1 = TIME_FADING_PARAMS[period1];
  const p2 = TIME_FADING_PARAMS[period2];

  return {
    saturation: p1.saturation + (p2.saturation - p1.saturation) * factor,
    lightnessShift: p1.lightnessShift + (p2.lightnessShift - p1.lightnessShift) * factor,
    opacity: p1.opacity + (p2.opacity - p1.opacity) * factor,
    hueShift: p1.hueShift + (p2.hueShift - p1.hueShift) * factor,
    blur: p1.blur + (p2.blur - p1.blur) * factor,
  };
}

/**
 * Get the ordered list of time periods from newest to oldest.
 */
export function getTimePeriodOrder(): TimePeriod[] {
  return ['now', 'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'older', 'ancient'];
}

/**
 * Check if one time period is older than another.
 */
export function isOlderPeriod(period: TimePeriod, thanPeriod: TimePeriod): boolean {
  const order = getTimePeriodOrder();
  return order.indexOf(period) > order.indexOf(thanPeriod);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Apply time fading to multiple elements based on their data-date attribute.
 */
export function applyTimeFadingToAll(
  container: HTMLElement,
  config: Omit<TimeFadingConfig, 'date'>
): (() => void)[] {
  const elements = container.querySelectorAll<HTMLElement>('[data-date]');
  const cleanups: (() => void)[] = [];

  elements.forEach((element) => {
    const dateStr = element.dataset.date;
    if (dateStr) {
      const cleanup = applyTimeFading(element, {
        ...config,
        date: new Date(dateStr),
      });
      cleanups.push(cleanup);
    }
  });

  return cleanups;
}

/**
 * Create a CSS stylesheet for time-faded elements.
 * Injects into document head.
 */
export function injectTimeFadingStyles(baseColor: string = '#4a6741', persona?: string): void {
  const styleId = 'ferni-time-fading-styles';

  // Remove existing styles
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.remove();
  }

  // Generate and inject new styles
  const css = generateTimeFadingCSS('.time-faded', baseColor, persona);
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

// ============================================================================
// DEVICE-ADAPTIVE RENDERING
// ============================================================================

/**
 * Get device-appropriate fading intensity.
 * Reduces effect on smaller screens for readability.
 */
export function getDeviceAdaptiveIntensity(): number {
  if (typeof window === 'undefined') return 1;

  const width = window.innerWidth;

  // Watch: Minimal fading (readability critical)
  if (width < 300) return 0.3;

  // Phone: Reduced fading
  if (width < 768) return 0.6;

  // Tablet: Moderate fading
  if (width < 1024) return 0.8;

  // Desktop/TV: Full fading effect
  return 1;
}
