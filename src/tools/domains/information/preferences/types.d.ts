/**
 * User Information Preferences Types
 *
 * Type definitions for personalized information delivery.
 * This enables "Better Than Human" features like knowing your favorite teams,
 * stocks you follow, and topics you care about.
 */
/**
 * User's information preferences
 *
 * This is the central store for personalization data that makes
 * Ferni's information tools "better than human"
 */
export interface UserInfoPreferences {
    /** News topics user is interested in */
    newsInterests: string[];
    /** Topics to AVOID showing (triggers, anxiety-inducing) */
    avoidTopics: string[];
    /** Preferred news depth */
    newsDepth: 'headlines' | 'summaries' | 'detailed';
    /** How much news they want */
    newsFrequency: 'heavy' | 'moderate' | 'light' | 'minimal';
    /** Stock ticker symbols to watch */
    stockWatchlist: string[];
    /** Alert threshold for stock price changes (percentage) */
    stockAlertThreshold: number;
    /** Whether to include crypto in financial news */
    includeCrypto: boolean;
    /** Favorite teams (e.g., "Eagles", "Phillies") */
    favoriteTeams: TeamPreference[];
    /** Leagues user follows */
    favoriteLeagues: string[];
    /** Whether to get game day alerts */
    sportAlerts: boolean;
    /** Primary home location */
    homeLocation?: LocationPreference;
    /** Work location */
    workLocation?: LocationPreference;
    /** Other saved locations (gym, parents, etc.) */
    savedLocations: LocationPreference[];
    /** Preferred commute mode */
    commuteMode: 'driving' | 'transit' | 'walking' | 'cycling';
    /** Allergy types for environmental alerts */
    allergies: string[];
    /** Skin type for UV recommendations */
    skinType?: 'very_fair' | 'fair' | 'medium' | 'olive' | 'brown' | 'dark';
    /** Has respiratory conditions (asthma, COPD) */
    hasRespiratoryConditions: boolean;
    /** Whether to proactively alert about environmental conditions */
    environmentalAlerts: boolean;
    /** Preferred briefing time (morning) */
    morningBriefingTime?: string;
    /** Preferred evening reflection time */
    eveningReflectionTime?: string;
    /** Whether to include weather in daily briefing */
    includeWeatherInBriefing: boolean;
    /** Whether to include commute in daily briefing */
    includeCommuteInBriefing: boolean;
    /** When preferences were last updated */
    updatedAt: Date;
    /** Version for migrations */
    version: number;
}
export interface TeamPreference {
    /** Team name (e.g., "Eagles") */
    name: string;
    /** League (e.g., "NFL") */
    league: string;
    /** Full team name for API lookups (e.g., "Philadelphia Eagles") */
    fullName?: string;
    /** How important (for ordering in updates) */
    priority: 'primary' | 'secondary' | 'casual';
}
export interface LocationPreference {
    /** User-friendly name (e.g., "Home", "Work", "Mom's house") */
    name: string;
    /** Address or city */
    address: string;
    /** Geocoded coordinates (cached) */
    coordinates?: {
        latitude: number;
        longitude: number;
    };
}
export declare const DEFAULT_PREFERENCES: UserInfoPreferences;
/** Partial update to preferences */
export type PreferenceUpdate = Partial<Omit<UserInfoPreferences, 'updatedAt' | 'version'>>;
/** Result of preference operations */
export interface PreferenceOperationResult {
    success: boolean;
    message: string;
    preferences?: UserInfoPreferences;
}
//# sourceMappingURL=types.d.ts.map