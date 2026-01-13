/**
 * Plaid Token Store
 *
 * Shared storage for Plaid access tokens.
 * Used by both the UI server (for storing after OAuth) and the agent (for querying).
 *
 * In production, this would use Redis or a database.
 * For development, we use a shared JSON file.
 */
interface PlaidTokenData {
    access_token: string;
    item_id: string;
    institution?: {
        institution_id?: string;
        name?: string;
    };
    linked_at: string;
}
/**
 * Store a Plaid access token for a user
 */
export declare function storeAccessToken(userId: string, accessToken: string, itemId?: string, institution?: {
    institution_id?: string;
    name?: string;
}): void;
/**
 * Get Plaid access token for a user
 */
export declare function getStoredAccessToken(userId: string): string | null;
/**
 * Check if user has linked a Plaid account
 */
export declare function hasLinkedAccounts(userId: string): boolean;
/**
 * Get full token data for a user
 */
export declare function getTokenData(userId: string): PlaidTokenData | null;
/**
 * Remove Plaid token for a user (unlink account)
 */
export declare function removeAccessToken(userId: string): boolean;
/**
 * Get all linked user IDs (for admin/debugging)
 */
export declare function getAllLinkedUserIds(): string[];
export {};
//# sourceMappingURL=plaid-store.d.ts.map