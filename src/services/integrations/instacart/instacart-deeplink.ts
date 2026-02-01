/**
 * Instacart Deep Link Generator
 *
 * Generates deep links to Instacart app/website as a fallback
 * when the API partnership is not available.
 *
 * @module services/integrations/instacart/instacart-deeplink
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'instacart-deeplink' });

// ============================================================================
// TYPES
// ============================================================================

export interface DeepLinkOptions {
  /** Store name or ID */
  store?: string;
  /** Search query for products */
  query?: string;
  /** Product IDs to add to cart */
  products?: string[];
  /** Zipcode for delivery */
  zipcode?: string;
  /** Prefer mobile app over web */
  preferApp?: boolean;
}

export interface DeepLinkResult {
  /** Universal link (works on mobile and web) */
  universalLink: string;
  /** iOS app deep link */
  iosLink?: string;
  /** Android app deep link */
  androidLink?: string;
  /** Web URL fallback */
  webUrl: string;
  /** Link type */
  type: 'search' | 'store' | 'product' | 'home';
}

// ============================================================================
// DEEP LINK GENERATOR
// ============================================================================

const INSTACART_WEB_BASE = 'https://www.instacart.com';
const INSTACART_IOS_SCHEME = 'instacart://';
const INSTACART_ANDROID_PACKAGE = 'com.instacart.client';

/**
 * Generate deep link for Instacart home
 */
export function getHomeDeepLink(): DeepLinkResult {
  return {
    universalLink: INSTACART_WEB_BASE,
    iosLink: `${INSTACART_IOS_SCHEME}home`,
    androidLink: `intent://home#Intent;scheme=instacart;package=${INSTACART_ANDROID_PACKAGE};end`,
    webUrl: INSTACART_WEB_BASE,
    type: 'home',
  };
}

/**
 * Generate deep link for store search
 */
export function getStoreSearchDeepLink(query?: string, zipcode?: string): DeepLinkResult {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (zipcode) params.set('zipcode', zipcode);

  const queryString = params.toString();
  const webUrl = queryString
    ? `${INSTACART_WEB_BASE}/store?${queryString}`
    : `${INSTACART_WEB_BASE}/store`;

  return {
    universalLink: webUrl,
    iosLink: `${INSTACART_IOS_SCHEME}stores${queryString ? `?${queryString}` : ''}`,
    androidLink: `intent://stores${queryString ? `?${queryString}` : ''}#Intent;scheme=instacart;package=${INSTACART_ANDROID_PACKAGE};end`,
    webUrl,
    type: 'store',
  };
}

/**
 * Generate deep link for product search at a specific store
 */
export function getProductSearchDeepLink(storeName: string, searchQuery: string): DeepLinkResult {
  // Format store name for URL (e.g., "Whole Foods" -> "whole-foods")
  const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const params = new URLSearchParams({ q: searchQuery });
  const webUrl = `${INSTACART_WEB_BASE}/store/${storeSlug}/search?${params.toString()}`;

  return {
    universalLink: webUrl,
    iosLink: `${INSTACART_IOS_SCHEME}search?store=${encodeURIComponent(storeName)}&q=${encodeURIComponent(searchQuery)}`,
    androidLink: `intent://search?store=${encodeURIComponent(storeName)}&q=${encodeURIComponent(searchQuery)}#Intent;scheme=instacart;package=${INSTACART_ANDROID_PACKAGE};end`,
    webUrl,
    type: 'search',
  };
}

/**
 * Generate deep link for a specific product
 */
export function getProductDeepLink(
  storeName: string,
  productSlug: string,
  productId?: string
): DeepLinkResult {
  const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const webUrl = `${INSTACART_WEB_BASE}/store/${storeSlug}/products/${productSlug}`;

  return {
    universalLink: webUrl,
    iosLink: `${INSTACART_IOS_SCHEME}product/${productId || productSlug}`,
    androidLink: `intent://product/${productId || productSlug}#Intent;scheme=instacart;package=${INSTACART_ANDROID_PACKAGE};end`,
    webUrl,
    type: 'product',
  };
}

/**
 * Generate a shopping list link
 * Opens Instacart with pre-populated search terms
 */
export function getShoppingListDeepLink(items: string[], preferredStore?: string): DeepLinkResult {
  // Instacart doesn't support adding multiple items via URL,
  // so we create a search for the first item and include context
  const firstItem = items[0] || 'groceries';

  if (preferredStore) {
    return getProductSearchDeepLink(preferredStore, firstItem);
  }

  // Generic search
  const params = new URLSearchParams({ q: firstItem });
  const webUrl = `${INSTACART_WEB_BASE}/store/search?${params.toString()}`;

  return {
    universalLink: webUrl,
    iosLink: `${INSTACART_IOS_SCHEME}search?q=${encodeURIComponent(firstItem)}`,
    androidLink: `intent://search?q=${encodeURIComponent(firstItem)}#Intent;scheme=instacart;package=${INSTACART_ANDROID_PACKAGE};end`,
    webUrl,
    type: 'search',
  };
}

// ============================================================================
// FALLBACK SERVICE
// ============================================================================

/**
 * Check if Instacart API is available
 * Returns false since API requires partnership
 */
export function isInstacartApiAvailable(): boolean {
  const hasCredentials = !!(process.env.INSTACART_CLIENT_ID && process.env.INSTACART_CLIENT_SECRET);

  if (!hasCredentials) {
    log.debug('Instacart API not available - using deep links');
  }

  return hasCredentials;
}

/**
 * Get the best available link for grocery shopping
 * Falls back to deep link if API is not available
 */
export function getGroceryLink(options: DeepLinkOptions = {}): DeepLinkResult {
  // If we have a search query, use product search
  if (options.query && options.store) {
    return getProductSearchDeepLink(options.store, options.query);
  }

  // If we have a search query without store, do general search
  if (options.query) {
    return getShoppingListDeepLink([options.query]);
  }

  // If we have a store, go to that store
  if (options.store) {
    return getStoreSearchDeepLink(options.store, options.zipcode);
  }

  // Default to home
  return getHomeDeepLink();
}

/**
 * Generate user-friendly message with link
 */
export function getInstacartFallbackMessage(options: DeepLinkOptions = {}): {
  message: string;
  link: DeepLinkResult;
} {
  const link = getGroceryLink(options);

  let message: string;

  if (options.query && options.store) {
    message = `I'll help you find "${options.query}" at ${options.store}. Tap here to open Instacart:`;
  } else if (options.query) {
    message = `I'll search for "${options.query}" on Instacart. Tap here to continue:`;
  } else if (options.store) {
    message = `I'll open ${options.store} on Instacart. Tap here to continue:`;
  } else {
    message = "I'll open Instacart for you. Tap here to start shopping:";
  }

  return { message, link };
}

// ============================================================================
// POPULAR STORE MAPPINGS
// ============================================================================

/** Known store slugs for accurate deep linking */
export const STORE_SLUGS: Record<string, string> = {
  'whole foods': 'whole-foods',
  'whole foods market': 'whole-foods',
  'trader joes': 'trader-joes',
  "trader joe's": 'trader-joes',
  costco: 'costco',
  safeway: 'safeway',
  kroger: 'kroger',
  publix: 'publix',
  albertsons: 'albertsons',
  target: 'target',
  walmart: 'walmart',
  cvs: 'cvs',
  walgreens: 'walgreens',
  sprouts: 'sprouts',
  'harris teeter': 'harris-teeter',
  'food lion': 'food-lion',
  giant: 'giant',
  'stop & shop': 'stop-and-shop',
  wegmans: 'wegmans',
  heb: 'h-e-b',
  'h-e-b': 'h-e-b',
  aldi: 'aldi',
  'food city': 'food-city',
  'winn dixie': 'winn-dixie',
  'piggly wiggly': 'piggly-wiggly',
};

/**
 * Get the correct store slug for a store name
 */
export function getStoreSlug(storeName: string): string {
  const normalized = storeName.toLowerCase().trim();
  return STORE_SLUGS[normalized] || normalized.replace(/[^a-z0-9]+/g, '-');
}
