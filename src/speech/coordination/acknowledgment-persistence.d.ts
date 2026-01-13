/**
 * Acknowledgment Preferences Persistence
 *
 * Saves and loads user acknowledgment preferences to Firestore.
 * Enables preferences to survive across sessions for improved personalization.
 *
 * @module speech/coordination/acknowledgment-persistence
 */
/** Stored preferences format */
export interface StoredAcknowledgmentPreferences {
    userId: string;
    preferredCategories: string[];
    preferredPhrases: string[];
    dislikedPhrases: string[];
    lengthPreference: 'short' | 'medium' | 'long';
    sampleCount: number;
    updatedAt: number;
}
/**
 * Save acknowledgment preferences to Firestore.
 */
export declare function saveAcknowledgmentPreferences(userId: string, preferences: Omit<StoredAcknowledgmentPreferences, 'userId' | 'updatedAt'>): Promise<void>;
/**
 * Load acknowledgment preferences from Firestore.
 */
export declare function loadAcknowledgmentPreferences(userId: string): Promise<StoredAcknowledgmentPreferences | null>;
/**
 * Delete acknowledgment preferences from Firestore.
 */
export declare function deleteAcknowledgmentPreferences(userId: string): Promise<void>;
/**
 * Get preferences with cache-first strategy.
 */
export declare function getAcknowledgmentPreferences(userId: string): Promise<StoredAcknowledgmentPreferences | null>;
/**
 * Update preferences with debounced persistence.
 * Updates cache immediately, saves to Firestore after delay.
 */
export declare function updateAcknowledgmentPreferences(userId: string, updates: Partial<Omit<StoredAcknowledgmentPreferences, 'userId' | 'updatedAt'>>): void;
/**
 * Flush all pending saves (call on session cleanup).
 */
export declare function flushPendingSaves(): Promise<void>;
/**
 * Clear cache for a user (call on session end).
 */
export declare function clearUserPreferencesCache(userId: string): void;
//# sourceMappingURL=acknowledgment-persistence.d.ts.map