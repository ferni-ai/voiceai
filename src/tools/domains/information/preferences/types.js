/**
 * User Information Preferences Types
 *
 * Type definitions for personalized information delivery.
 * This enables "Better Than Human" features like knowing your favorite teams,
 * stocks you follow, and topics you care about.
 */
// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================
export const DEFAULT_PREFERENCES = {
    // News
    newsInterests: [],
    avoidTopics: [],
    newsDepth: 'summaries',
    newsFrequency: 'moderate',
    // Finance
    stockWatchlist: [],
    stockAlertThreshold: 5, // 5% change triggers alert
    includeCrypto: false,
    // Sports
    favoriteTeams: [],
    favoriteLeagues: [],
    sportAlerts: false,
    // Locations
    homeLocation: undefined,
    workLocation: undefined,
    savedLocations: [],
    commuteMode: 'driving',
    // Health
    allergies: [],
    skinType: undefined,
    hasRespiratoryConditions: false,
    environmentalAlerts: true,
    // Delivery
    morningBriefingTime: undefined,
    eveningReflectionTime: undefined,
    includeWeatherInBriefing: true,
    includeCommuteInBriefing: true,
    // Metadata
    updatedAt: new Date(),
    version: 1,
};
//# sourceMappingURL=types.js.map