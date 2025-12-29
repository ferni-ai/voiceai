/**
 * Environmental Health Types
 *
 * Type definitions for air quality, UV, pollen, and outdoor activity tools.
 */

// ============================================================================
// AIR QUALITY
// ============================================================================

export interface AirQualityData {
  aqi: number;
  category: AQICategory;
  dominantPollutant: string;
  pollutants: {
    pm25?: number;
    pm10?: number;
    o3?: number;
    no2?: number;
    so2?: number;
    co?: number;
  };
  healthRecommendation: string;
  sensitiveGroups: string[];
  timestamp: Date;
  source: string;
}

export type AQICategory =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

export const AQI_THRESHOLDS: Record<AQICategory, { min: number; max: number; color: string }> = {
  good: { min: 0, max: 50, color: 'green' },
  moderate: { min: 51, max: 100, color: 'yellow' },
  unhealthy_sensitive: { min: 101, max: 150, color: 'orange' },
  unhealthy: { min: 151, max: 200, color: 'red' },
  very_unhealthy: { min: 201, max: 300, color: 'purple' },
  hazardous: { min: 301, max: 500, color: 'maroon' },
};

// ============================================================================
// UV INDEX
// ============================================================================

export interface UVIndexData {
  uvIndex: number;
  category: UVCategory;
  peakTime: string;
  sunscreenAdvice: string;
  exposureLimit: string;
  skinTypeAdvice?: string;
  timestamp: Date;
}

export type UVCategory = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';

export const UV_THRESHOLDS: Record<UVCategory, { min: number; max: number }> = {
  low: { min: 0, max: 2 },
  moderate: { min: 3, max: 5 },
  high: { min: 6, max: 7 },
  very_high: { min: 8, max: 10 },
  extreme: { min: 11, max: 15 },
};

export type SkinType = 'very_fair' | 'fair' | 'medium' | 'olive' | 'brown' | 'dark';

export const SKIN_TYPE_BURN_TIMES: Record<SkinType, number> = {
  very_fair: 10, // Minutes to burn without protection at UV 6
  fair: 15,
  medium: 20,
  olive: 30,
  brown: 45,
  dark: 60,
};

// ============================================================================
// POLLEN
// ============================================================================

export interface PollenData {
  overall: PollenLevel;
  types: {
    tree?: PollenLevel;
    grass?: PollenLevel;
    weed?: PollenLevel;
    mold?: PollenLevel;
  };
  dominantType?: string;
  healthAdvice: string;
  allergyAlert: boolean;
  forecast: {
    today: PollenLevel;
    tomorrow: PollenLevel;
    trend: 'increasing' | 'stable' | 'decreasing';
  };
  timestamp: Date;
}

export type PollenLevel = 'none' | 'low' | 'moderate' | 'high' | 'very_high';

export const POLLEN_DESCRIPTIONS: Record<PollenLevel, string> = {
  none: 'No significant pollen detected',
  low: 'Low pollen - good day for outdoor activities',
  moderate: 'Moderate pollen - sensitive individuals may notice symptoms',
  high: 'High pollen - allergy sufferers should take precautions',
  very_high: 'Very high pollen - consider staying indoors if you have allergies',
};

// ============================================================================
// OUTDOOR ACTIVITY ADVICE
// ============================================================================

export interface OutdoorActivityAdvice {
  overallRating: 'excellent' | 'good' | 'fair' | 'poor' | 'avoid';
  factors: {
    weather: FactorRating;
    airQuality: FactorRating;
    uvIndex: FactorRating;
    pollen: FactorRating;
  };
  recommendation: string;
  bestTimeWindow?: string;
  precautions: string[];
  alternatives?: string[];
}

export interface FactorRating {
  value: string;
  impact: 'positive' | 'neutral' | 'negative' | 'severe';
  advice?: string;
}

// ============================================================================
// USER HEALTH CONTEXT
// ============================================================================

export interface UserHealthContext {
  hasAllergies: boolean;
  allergyTypes?: string[];
  hasAsthma: boolean;
  skinType?: SkinType;
  isOutdoorAthlete: boolean;
  sensitiveToHeat: boolean;
  sensitiveToUV: boolean;
}
