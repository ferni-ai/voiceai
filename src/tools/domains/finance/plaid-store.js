/**
 * Plaid Token Store
 *
 * Shared storage for Plaid access tokens.
 * Used by both the UI server (for storing after OAuth) and the agent (for querying).
 *
 * In production, this would use Redis or a database.
 * For development, we use a shared JSON file.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../../utils/safe-logger.js';
// File-based storage (shared with ui-server.js)
const TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json');
// In-memory cache
const tokenCache = new Map();
let lastLoadTime = 0;
const CACHE_TTL_MS = 5000; // Reload from file every 5 seconds
/**
 * Load tokens from the shared file
 */
function loadTokensFromFile() {
    try {
        if (fs.existsSync(TOKENS_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
            tokenCache.clear();
            for (const [userId, tokenData] of Object.entries(data)) {
                tokenCache.set(userId, tokenData);
            }
            lastLoadTime = Date.now();
            getLogger().debug({ count: tokenCache.size }, 'Loaded Plaid tokens from file');
        }
    }
    catch (err) {
        getLogger().warn({ error: err }, 'Could not load Plaid tokens from file');
    }
}
/**
 * Save tokens to the shared file
 */
function saveTokensToFile() {
    try {
        const data = {};
        for (const [userId, tokenData] of tokenCache.entries()) {
            data[userId] = tokenData;
        }
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
        getLogger().debug({ count: tokenCache.size }, 'Saved Plaid tokens to file');
    }
    catch (err) {
        getLogger().warn({ error: err }, 'Could not save Plaid tokens to file');
    }
}
/**
 * Ensure cache is fresh (reload from file if stale)
 */
function ensureFreshCache() {
    if (Date.now() - lastLoadTime > CACHE_TTL_MS) {
        loadTokensFromFile();
    }
}
/**
 * Store a Plaid access token for a user
 */
export function storeAccessToken(userId, accessToken, itemId, institution) {
    tokenCache.set(userId, {
        access_token: accessToken,
        item_id: itemId || '',
        institution,
        linked_at: new Date().toISOString(),
    });
    saveTokensToFile();
    getLogger().info({ userId, institution: institution?.name }, '🔐 Plaid access token stored');
}
/**
 * Get Plaid access token for a user
 */
export function getStoredAccessToken(userId) {
    ensureFreshCache();
    const data = tokenCache.get(userId);
    return data?.access_token || null;
}
/**
 * Check if user has linked a Plaid account
 */
export function hasLinkedAccounts(userId) {
    ensureFreshCache();
    return tokenCache.has(userId);
}
/**
 * Get full token data for a user
 */
export function getTokenData(userId) {
    ensureFreshCache();
    return tokenCache.get(userId) || null;
}
/**
 * Remove Plaid token for a user (unlink account)
 */
export function removeAccessToken(userId) {
    const existed = tokenCache.delete(userId);
    if (existed) {
        saveTokensToFile();
        getLogger().info({ userId }, '🔓 Plaid access token removed');
    }
    return existed;
}
/**
 * Get all linked user IDs (for admin/debugging)
 */
export function getAllLinkedUserIds() {
    ensureFreshCache();
    return Array.from(tokenCache.keys());
}
// Initial load
loadTokensFromFile();
//# sourceMappingURL=plaid-store.js.map