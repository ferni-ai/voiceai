/**
 * Environmental Health Types
 *
 * Type definitions for air quality, UV, pollen, and outdoor activity tools.
 */
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
export type AQICategory = 'good' | 'moderate' | 'unhealthy_sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
export declare const AQI_THRESHOLDS: Record<AQICategory, {
    min: number;
    max: number;
    color: string;
}>;
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
export declare const UV_THRESHOLDS: Record<UVCategory, {
    min: number;
    max: number;
}>;
export type SkinType = 'very_fair' | 'fair' | 'medium' | 'olive' | 'brown' | 'dark';
export declare const SKIN_TYPE_BURN_TIMES: Record<SkinType, number>;
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
export declare const POLLEN_DESCRIPTIONS: Record<PollenLevel, string>;
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
export interface UserHealthContext {
    hasAllergies: boolean;
    allergyTypes?: string[];
    hasAsthma: boolean;
    skinType?: SkinType;
    isOutdoorAthlete: boolean;
    sensitiveToHeat: boolean;
    sensitiveToUV: boolean;
}
//# sourceMappingURL=types.d.ts.map