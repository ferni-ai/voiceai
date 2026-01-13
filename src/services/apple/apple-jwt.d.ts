/**
 * Apple JWT Token Generation
 *
 * Generates JWT tokens for Apple APIs (MusicKit, WeatherKit)
 *
 * Setup:
 * 1. Go to developer.apple.com/account/resources/authkeys
 * 2. Create a key with MusicKit and/or WeatherKit enabled
 * 3. Download the .p8 private key file
 * 4. Set environment variables:
 *    - APPLE_TEAM_ID (10-char team ID from membership page)
 *    - APPLE_KEY_ID (from the key you created)
 *    - APPLE_PRIVATE_KEY (contents of .p8 file, or path to it)
 *    - APPLE_MUSIC_APP_ID (optional, for MusicKit)
 */
/**
 * Check if Apple credentials are configured
 */
export declare function isAppleConfigured(): boolean;
/**
 * Generate a JWT token for Apple APIs
 *
 * @param service - 'musickit' or 'weatherkit'
 * @param expirationHours - How long the token should be valid (default 12 hours)
 */
export declare function generateAppleJWT(service: 'musickit' | 'weatherkit', expirationHours?: number): string;
/**
 * Get MusicKit developer token
 */
export declare function getMusicKitToken(): string;
/**
 * Get WeatherKit token
 */
export declare function getWeatherKitToken(): string;
declare const _default: {
    isAppleConfigured: typeof isAppleConfigured;
    generateAppleJWT: typeof generateAppleJWT;
    getMusicKitToken: typeof getMusicKitToken;
    getWeatherKitToken: typeof getWeatherKitToken;
};
export default _default;
//# sourceMappingURL=apple-jwt.d.ts.map