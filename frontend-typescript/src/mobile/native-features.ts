/**
 * Native Features Service
 * 
 * Ferni-specific integrations for native mobile features.
 * Provides high-level APIs for sharing, deep linking, and secure storage.
 */

import { createLogger } from '../utils/logger.js';
import {
  share,
  canShare,
  onDeepLink,
  secureStore,
  secureRetrieve,
  secureDelete,
  isNative,
} from '../utils/platform.js';

const log = createLogger('NativeFeatures');

// ============================================================================
// SHARING
// ============================================================================

/**
 * Share an insight or achievement from Ferni.
 */
export async function shareInsight(insight: {
  title: string;
  description: string;
  category?: string;
}): Promise<boolean> {
  const text = `💡 ${insight.title}\n\n${insight.description}`;
  
  return share({
    title: 'Ferni Insight',
    text,
    url: 'https://ferni.app',
    dialogTitle: 'Share your insight',
  });
}

/**
 * Share a streak milestone.
 */
export async function shareStreak(days: number): Promise<boolean> {
  const text = `🔥 I'm on a ${days}-day streak with Ferni, my AI life coach! Every conversation helps me grow.`;
  
  return share({
    title: 'Ferni Streak',
    text,
    url: 'https://ferni.app',
    dialogTitle: 'Share your progress',
  });
}

/**
 * Share an invitation to try Ferni.
 */
export async function shareInvite(referralCode?: string): Promise<boolean> {
  const url = referralCode 
    ? `https://ferni.app/invite?ref=${referralCode}`
    : 'https://ferni.app';
  
  const text = `I've been talking to Ferni, an AI life coach who actually listens. It's like having a wise friend in your pocket. Try it!`;
  
  return share({
    title: 'Try Ferni',
    text,
    url,
    dialogTitle: 'Invite a friend',
  });
}

/**
 * Check if sharing is available.
 */
export { canShare };

// ============================================================================
// DEEP LINKING / OAUTH
// ============================================================================

/** Deep link route handlers */
type RouteHandler = (params: Record<string, string>) => void | Promise<void>;
const routeHandlers = new Map<string, RouteHandler>();

/**
 * Register a handler for a specific deep link route.
 * e.g., registerRoute('oauth/callback', (params) => handleOAuth(params.code))
 */
export function registerDeepLinkRoute(route: string, handler: RouteHandler): () => void {
  routeHandlers.set(route, handler);
  return () => routeHandlers.delete(route);
}

/**
 * Initialize deep link routing.
 * Call once at app startup after registering routes.
 */
export function initDeepLinkRouting(): () => void {
  return onDeepLink((data) => {
    const route = data.path;
    const params = data.params;
    log.info(`📲 Processing deep link: ${route}`, params);
    
    const handler = routeHandlers.get(route);
    if (handler) {
      void handler(params);
    } else {
      // Check for partial matches (e.g., "oauth/callback" matches "oauth/callback/spotify")
      for (const [registeredRoute, routeHandler] of routeHandlers) {
        if (route.startsWith(registeredRoute)) {
          void routeHandler(params);
          return;
        }
      }
      log.warn(`No handler for deep link route: ${route}`);
    }
  });
}

// ============================================================================
// SECURE AUTH TOKEN STORAGE
// ============================================================================

const TOKEN_KEYS = {
  accessToken: 'auth_access_token',
  refreshToken: 'auth_refresh_token',
  spotifyToken: 'spotify_access_token',
  spotifyRefresh: 'spotify_refresh_token',
} as const;

/**
 * Store authentication tokens securely.
 */
export async function storeAuthTokens(tokens: {
  accessToken?: string;
  refreshToken?: string;
}): Promise<void> {
  if (tokens.accessToken) {
    await secureStore(TOKEN_KEYS.accessToken, tokens.accessToken);
  }
  if (tokens.refreshToken) {
    await secureStore(TOKEN_KEYS.refreshToken, tokens.refreshToken);
  }
  log.debug('🔐 Auth tokens stored securely');
}

/**
 * Retrieve authentication tokens.
 */
export async function getAuthTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    secureRetrieve(TOKEN_KEYS.accessToken),
    secureRetrieve(TOKEN_KEYS.refreshToken),
  ]);
  return { accessToken, refreshToken };
}

/**
 * Clear authentication tokens (logout).
 */
export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    secureDelete(TOKEN_KEYS.accessToken),
    secureDelete(TOKEN_KEYS.refreshToken),
  ]);
  log.debug('🔐 Auth tokens cleared');
}

/**
 * Store Spotify tokens securely.
 */
export async function storeSpotifyTokens(tokens: {
  accessToken: string;
  refreshToken?: string;
}): Promise<void> {
  await secureStore(TOKEN_KEYS.spotifyToken, tokens.accessToken);
  if (tokens.refreshToken) {
    await secureStore(TOKEN_KEYS.spotifyRefresh, tokens.refreshToken);
  }
  log.debug('🎵 Spotify tokens stored securely');
}

/**
 * Retrieve Spotify tokens.
 */
export async function getSpotifyTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    secureRetrieve(TOKEN_KEYS.spotifyToken),
    secureRetrieve(TOKEN_KEYS.spotifyRefresh),
  ]);
  return { accessToken, refreshToken };
}

/**
 * Clear Spotify tokens (disconnect).
 */
export async function clearSpotifyTokens(): Promise<void> {
  await Promise.all([
    secureDelete(TOKEN_KEYS.spotifyToken),
    secureDelete(TOKEN_KEYS.spotifyRefresh),
  ]);
  log.debug('🎵 Spotify tokens cleared');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all native features.
 * Call once at app startup.
 */
export function initNativeFeatures(): void {
  if (!isNative()) {
    log.debug('Running in web mode - native features limited');
    return;
  }

  // Set up deep link routing
  initDeepLinkRouting();

  // Register common routes
  registerDeepLinkRoute('oauth/spotify', (params) => {
    if (params.code) {
      log.info('Spotify OAuth callback received');
      // Dispatch event for Spotify service to handle
      window.dispatchEvent(new CustomEvent('spotify:oauth', { detail: params }));
    }
  });

  registerDeepLinkRoute('conversation', (params) => {
    if (params.id) {
      log.info('Deep link to conversation:', params.id);
      window.dispatchEvent(new CustomEvent('navigate:conversation', { detail: params }));
    }
  });

  registerDeepLinkRoute('persona', (params) => {
    if (params.id) {
      log.info('Deep link to persona:', params.id);
      window.dispatchEvent(new CustomEvent('navigate:persona', { detail: params }));
    }
  });

  log.info('📱 Native features initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const nativeFeatures = {
  // Sharing
  shareInsight,
  shareStreak,
  shareInvite,
  canShare,
  
  // Deep linking
  registerDeepLinkRoute,
  initDeepLinkRouting,
  
  // Secure storage
  storeAuthTokens,
  getAuthTokens,
  clearAuthTokens,
  storeSpotifyTokens,
  getSpotifyTokens,
  clearSpotifyTokens,
  
  // Init
  init: initNativeFeatures,
};

export default nativeFeatures;

