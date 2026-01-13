/**
 * Location Preference Service
 *
 * Stores and retrieves user's preferred location for weather and other
 * location-based tools.
 *
 * Location is detected at session start from the user's IP address via the
 * UI server (which can see the real client IP). The voice agent receives this
 * in the token metadata and should call `setSessionLocation()` to make it
 * available for tools.
 *
 * Priority:
 * 1. Session location (from IP geo at token generation - most accurate)
 * 2. User's explicit preference (if they told us their city)
 */
/**
 * Set the current active session for native tool access.
 * Called when a voice session starts.
 */
export declare function setCurrentActiveSession(userId: string, location?: string, sessionId?: string): void;
/**
 * Clear the current active session.
 * Called when a voice session ends.
 */
export declare function clearCurrentActiveSession(): void;
/**
 * Get location for the current active session.
 * Used by native tools that don't receive userId in their execute function.
 *
 * Priority:
 * 1. Direct session location (set at session start)
 * 2. Cached location for the user (from IP geo or explicit preference)
 */
export declare function getCurrentSessionLocation(): string | null;
/**
 * Set user's location from session metadata (IP geolocation done by UI server)
 *
 * This should be called when the voice agent receives the session metadata
 * which contains the user's IP-detected city from the token endpoint.
 *
 * @param userId - User ID
 * @param city - City name (e.g., "San Francisco")
 * @param regionCode - State/region code (e.g., "CA" or "California")
 * @param countryCode - Country code (e.g., "US")
 */
export declare function setSessionLocation(userId: string, city?: string, regionCode?: string, _countryCode?: string): void;
/**
 * Get user's location preference
 * Returns the cached location (from session or explicit preference)
 *
 * Note: Currently sync but kept async for future Firestore persistence
 */
export declare function getUserLocationPreference(userId: string): string | null;
/**
 * Save user's explicit location preference
 * Called when user tells us their city in conversation
 * This overrides the IP-detected session location
 *
 * Note: Currently sync but kept with Promise return for future Firestore persistence
 */
export declare function setUserLocationPreference(userId: string, location: string): boolean;
/**
 * Clear user's location preference cache (useful for testing or explicit clear)
 */
export declare function clearLocationCache(userId?: string): void;
/**
 * Check if a string looks like a location (not "current" or empty)
 */
export declare function isValidLocation(location: string | undefined | null): boolean;
//# sourceMappingURL=location-preference.d.ts.map