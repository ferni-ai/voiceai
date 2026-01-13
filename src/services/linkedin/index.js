/**
 * LinkedIn Integration Service
 *
 * Provides OAuth integration and profile data fetching for LinkedIn.
 * "Better than Human" - know about career milestones and opportunities.
 *
 * Superhuman Capabilities:
 * - "Your 5-year work anniversary at Acme is next week!"
 * - "I noticed your connection Sarah just started a new role - might be worth reaching out"
 * - "Based on your profile, you might be interested in this industry trend"
 *
 * LinkedIn API Scopes Used:
 * - r_liteprofile: Basic profile data
 * - r_emailaddress: Email address
 * - w_member_social: Post on behalf (optional)
 *
 * @module services/linkedin
 */
import { getStore } from '../../memory/store-factory.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'LinkedIn' });
// Circuit breaker for LinkedIn API
const linkedInCircuitBreaker = getCircuitBreaker('linkedin-api', {
    failureThreshold: 5,
    resetTimeout: 120_000, // 2 minutes
    successThreshold: 2,
});
// ============================================================================
// STATE
// ============================================================================
const userLinkedIn = new Map();
// Sync interval
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// ============================================================================
// TOKEN PERSISTENCE
// ============================================================================
/**
 * Save LinkedIn tokens to persistent storage
 */
async function persistTokens(userId, data) {
    try {
        const store = await getStore();
        const profile = await store.getOrCreateProfile(userId);
        const tokensToSave = {
            accessToken: data.tokens.accessToken,
            refreshToken: data.tokens.refreshToken,
            expiresAt: data.tokens.expiresAt.toISOString(),
            scope: data.tokens.scope,
            lastSync: data.lastSync.toISOString(),
        };
        // Store tokens in user profile
        const updatedProfile = {
            ...profile,
            linkedInTokens: tokensToSave,
        };
        await store.saveProfile(updatedProfile);
        log.debug({ userId }, 'LinkedIn tokens persisted');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to persist LinkedIn tokens');
    }
}
/**
 * Load LinkedIn tokens from persistent storage
 */
async function loadTokens(userId) {
    try {
        const store = await getStore();
        const profile = await store.getOrCreateProfile(userId);
        const persisted = profile.linkedInTokens;
        if (!persisted)
            return null;
        return {
            accessToken: persisted.accessToken,
            refreshToken: persisted.refreshToken,
            expiresAt: new Date(persisted.expiresAt),
            scope: persisted.scope,
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load LinkedIn tokens');
        return null;
    }
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Check if user has LinkedIn connected
 */
export function hasLinkedInConnected(userId) {
    const data = userLinkedIn.get(userId);
    if (data && data.tokens.expiresAt > new Date()) {
        return true;
    }
    return false;
}
/**
 * Initialize LinkedIn connection from persisted tokens
 */
export async function initializeLinkedIn(userId) {
    const existing = userLinkedIn.get(userId);
    if (existing && existing.tokens.expiresAt > new Date()) {
        return true;
    }
    const tokens = await loadTokens(userId);
    if (!tokens)
        return false;
    // Check if tokens are still valid
    if (tokens.expiresAt <= new Date()) {
        // Try to refresh
        const refreshed = await refreshLinkedInToken(userId, tokens);
        if (!refreshed)
            return false;
    }
    // Create user data structure
    userLinkedIn.set(userId, {
        userId,
        tokens,
        profile: null,
        positions: [],
        education: [],
        certifications: [],
        upcomingMilestones: [],
        connectionUpdates: [],
        lastSync: new Date(0),
    });
    // Trigger background sync
    void syncLinkedInData(userId);
    return true;
}
/**
 * Connect LinkedIn with OAuth tokens
 */
export async function connectLinkedIn(userId, accessToken, refreshToken, expiresIn, scope) {
    try {
        const tokens = {
            accessToken,
            refreshToken,
            expiresAt: new Date(Date.now() + expiresIn * 1000),
            scope,
        };
        const userData = {
            userId,
            tokens,
            profile: null,
            positions: [],
            education: [],
            certifications: [],
            upcomingMilestones: [],
            connectionUpdates: [],
            lastSync: new Date(0),
        };
        userLinkedIn.set(userId, userData);
        // Persist tokens
        await persistTokens(userId, userData);
        // Sync data
        await syncLinkedInData(userId);
        log.info({ userId }, 'LinkedIn connected successfully');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to connect LinkedIn');
        return false;
    }
}
/**
 * Disconnect LinkedIn
 */
export async function disconnectLinkedIn(userId) {
    userLinkedIn.delete(userId);
    try {
        const store = await getStore();
        const profile = await store.getOrCreateProfile(userId);
        // Remove tokens from profile
        const updatedProfile = { ...profile };
        delete updatedProfile.linkedInTokens;
        await store.saveProfile(updatedProfile);
        log.info({ userId }, 'LinkedIn disconnected');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to clean up LinkedIn tokens');
    }
}
/**
 * Refresh LinkedIn access token
 */
async function refreshLinkedInToken(userId, tokens) {
    if (!tokens.refreshToken) {
        log.warn({ userId }, 'No refresh token available');
        return false;
    }
    try {
        // LinkedIn OAuth token refresh
        const response = await linkedInCircuitBreaker.execute(async () => {
            const clientId = process.env.LINKEDIN_CLIENT_ID;
            const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
            if (!clientId || !clientSecret) {
                throw new Error('LinkedIn OAuth credentials not configured');
            }
            const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: tokens.refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                }),
            });
            if (!res.ok) {
                throw new Error(`Token refresh failed: ${res.status}`);
            }
            return res.json();
        });
        const newTokens = {
            accessToken: response.access_token,
            refreshToken: response.refresh_token || tokens.refreshToken,
            expiresAt: new Date(Date.now() + response.expires_in * 1000),
            scope: tokens.scope,
        };
        const userData = userLinkedIn.get(userId);
        if (userData) {
            userData.tokens = newTokens;
            await persistTokens(userId, userData);
        }
        log.debug({ userId }, 'LinkedIn token refreshed');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to refresh LinkedIn token');
        return false;
    }
}
// ============================================================================
// DATA SYNC
// ============================================================================
/**
 * Sync LinkedIn profile and career data
 */
export async function syncLinkedInData(userId) {
    const userData = userLinkedIn.get(userId);
    if (!userData)
        return;
    // Check if sync needed
    if (Date.now() - userData.lastSync.getTime() < SYNC_INTERVAL_MS) {
        return;
    }
    try {
        // Check token validity
        if (userData.tokens.expiresAt <= new Date()) {
            const refreshed = await refreshLinkedInToken(userId, userData.tokens);
            if (!refreshed)
                return;
        }
        // Fetch profile
        const profile = await fetchLinkedInProfile(userData.tokens.accessToken);
        if (profile) {
            userData.profile = profile;
        }
        // Fetch positions for milestone detection
        const positions = await fetchLinkedInPositions(userData.tokens.accessToken);
        if (positions) {
            userData.positions = positions;
        }
        // Calculate upcoming milestones
        userData.upcomingMilestones = calculateUpcomingMilestones(userData.positions);
        userData.lastSync = new Date();
        log.info({ userId, positionCount: userData.positions.length }, 'LinkedIn data synced');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to sync LinkedIn data');
    }
}
/**
 * Fetch LinkedIn profile
 */
async function fetchLinkedInProfile(accessToken) {
    try {
        const response = await linkedInCircuitBreaker.execute(async () => {
            const res = await fetch('https://api.linkedin.com/v2/me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            if (!res.ok) {
                throw new Error(`Profile fetch failed: ${res.status}`);
            }
            return res.json();
        });
        return {
            id: response.id,
            firstName: response.localizedFirstName,
            lastName: response.localizedLastName,
            headline: response.headline?.localized?.en_US,
            vanityName: response.vanityName,
        };
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to fetch LinkedIn profile');
        return null;
    }
}
/**
 * Fetch LinkedIn positions (work history)
 */
async function fetchLinkedInPositions(accessToken) {
    try {
        const response = await linkedInCircuitBreaker.execute(async () => {
            const res = await fetch('https://api.linkedin.com/v2/positions?projection=(elements*(id,title,company,timePeriod,isCurrent,locationName))', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            if (!res.ok) {
                // This endpoint may require additional permissions
                log.debug({ status: res.status }, 'Positions endpoint not available');
                return { elements: [] };
            }
            return res.json();
        });
        return (response.elements || []).map((pos) => ({
            id: pos.id,
            title: pos.title,
            companyName: pos.company?.name || 'Unknown Company',
            startDate: pos.timePeriod?.startDate || { year: new Date().getFullYear() },
            endDate: pos.timePeriod?.endDate,
            isCurrent: pos.isCurrent ?? false,
            location: pos.locationName,
        }));
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to fetch LinkedIn positions');
        return [];
    }
}
// ============================================================================
// MILESTONE DETECTION
// ============================================================================
/**
 * Calculate upcoming career milestones from positions
 */
function calculateUpcomingMilestones(positions) {
    const milestones = [];
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    for (const position of positions) {
        if (!position.startDate.year)
            continue;
        const startMonth = position.startDate.month || 1;
        const startYear = position.startDate.year;
        // Check for work anniversaries
        for (let yearsAgo = 1; yearsAgo <= 20; yearsAgo++) {
            const anniversaryDate = new Date(startYear + yearsAgo, startMonth - 1, 1);
            if (anniversaryDate >= now && anniversaryDate <= thirtyDaysFromNow) {
                milestones.push({
                    type: 'work_anniversary',
                    title: `${yearsAgo}-Year Anniversary`,
                    description: `${yearsAgo} years at ${position.companyName}`,
                    date: anniversaryDate,
                    metadata: {
                        company: position.companyName,
                        years: yearsAgo,
                        title: position.title,
                    },
                });
            }
        }
    }
    // Sort by date
    milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
    return milestones;
}
// ============================================================================
// INSIGHT GENERATION
// ============================================================================
/**
 * Get LinkedIn profile for user
 */
export function getLinkedInProfile(userId) {
    return userLinkedIn.get(userId)?.profile || null;
}
/**
 * Get upcoming career milestones
 */
export function getUpcomingMilestones(userId) {
    return userLinkedIn.get(userId)?.upcomingMilestones || [];
}
/**
 * Get current position
 */
export function getCurrentPosition(userId) {
    const positions = userLinkedIn.get(userId)?.positions || [];
    return positions.find((p) => p.isCurrent) || null;
}
/**
 * Generate LinkedIn insight for context injection
 */
export function generateLinkedInInsight(userId) {
    const userData = userLinkedIn.get(userId);
    if (!userData)
        return null;
    // Check for upcoming milestones
    const upcomingMilestones = userData.upcomingMilestones;
    const soonMilestone = upcomingMilestones.find((m) => {
        const daysUntil = Math.ceil((m.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return daysUntil >= 0 && daysUntil <= 7;
    });
    if (soonMilestone) {
        const daysUntil = Math.ceil((soonMilestone.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return {
            type: 'milestone',
            title: soonMilestone.title,
            message: daysUntil === 0
                ? `Today is their ${soonMilestone.description}! Consider acknowledging this milestone.`
                : `In ${daysUntil} day${daysUntil > 1 ? 's' : ''}: ${soonMilestone.description}. Worth mentioning if work comes up.`,
            priority: daysUntil <= 1 ? 'high' : 'normal',
            actionable: true,
            metadata: soonMilestone.metadata,
        };
    }
    // Check for connection updates
    const recentUpdates = userData.connectionUpdates.filter((u) => {
        const daysSince = Math.floor((Date.now() - u.date.getTime()) / (24 * 60 * 60 * 1000));
        return daysSince <= 7;
    });
    if (recentUpdates.length > 0) {
        const update = recentUpdates[0];
        return {
            type: 'connection',
            title: 'Connection Update',
            message: `${update.connectionName}: ${update.details}`,
            priority: 'low',
        };
    }
    return null;
}
/**
 * Generate OAuth URL for LinkedIn authorization
 */
export function getLinkedInAuthUrl(redirectUri, state) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
        throw new Error('LinkedIn OAuth not configured');
    }
    const scopes = ['r_liteprofile', 'r_emailaddress'];
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: scopes.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}
/**
 * Exchange authorization code for tokens
 */
export async function exchangeLinkedInCode(code, redirectUri) {
    try {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error('LinkedIn OAuth credentials not configured');
        }
        const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });
        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.status}`);
        }
        const data = await response.json();
        // LinkedIn returns scope as a space-separated string
        const scopeString = data.scope || 'r_liteprofile r_emailaddress';
        const scope = scopeString.split(' ').filter(Boolean);
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            scope,
        };
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to exchange LinkedIn code');
        return null;
    }
}
//# sourceMappingURL=index.js.map