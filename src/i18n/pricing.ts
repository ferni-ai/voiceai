/**
 * Multi-Currency Pricing Configuration
 *
 * Manages localized pricing for different regions and currencies.
 * Uses purchasing power parity (PPP) adjusted pricing where appropriate.
 *
 * Philosophy: Fair pricing worldwide - adjust for local economies.
 */

import { type SupportedLocale, DEFAULT_LOCALE } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'KRW' | 'CNY' | 'TWD' | 'SAR' | 'ILS';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
  thousandsSeparator: string;
  decimalSeparator: string;
}

export interface TierPricing {
  /** Price in the currency's smallest unit (cents, yen, etc.) */
  amountInSmallestUnit: number;
  /** Human-readable formatted price */
  formatted: string;
  /** Currency code for Stripe */
  currency: CurrencyCode;
}

export interface LocalePricing {
  free: TierPricing;
  friend: TierPricing;
  partner: TierPricing;
}

// ============================================================================
// CURRENCY CONFIGURATIONS
// ============================================================================

export const CURRENCY_CONFIG: Record<CurrencyCode, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    symbolPosition: 'after',
    decimalPlaces: 2,
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    symbolPosition: 'before',
    decimalPlaces: 0, // Yen has no decimal places
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  KRW: {
    code: 'KRW',
    symbol: '₩',
    symbolPosition: 'before',
    decimalPlaces: 0, // Won has no decimal places
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  CNY: {
    code: 'CNY',
    symbol: '¥',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  TWD: {
    code: 'TWD',
    symbol: 'NT$',
    symbolPosition: 'before',
    decimalPlaces: 0, // TWD typically shown without decimals
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  SAR: {
    code: 'SAR',
    symbol: 'ر.س',
    symbolPosition: 'after',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  ILS: {
    code: 'ILS',
    symbol: '₪',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
};

// ============================================================================
// LOCALE TO CURRENCY MAPPING
// ============================================================================

export const LOCALE_CURRENCY: Record<SupportedLocale, CurrencyCode> = {
  'en-US': 'USD',
  'en-GB': 'GBP',
  es: 'EUR', // Spain uses EUR
  fr: 'EUR',
  de: 'EUR',
  ja: 'JPY',
  ko: 'KRW',
  'zh-Hans': 'CNY',
  'zh-Hant': 'TWD',
  ar: 'SAR',
  he: 'ILS',
};

// ============================================================================
// PRICING TABLE (PPP-adjusted where appropriate)
// ============================================================================

/**
 * Pricing in smallest currency units (cents, yen, won, etc.)
 * Adjusted for purchasing power parity in different regions
 */
const TIER_PRICING: Record<CurrencyCode, { friend: number; partner: number }> = {
  USD: { friend: 999, partner: 1999 }, // $9.99, $19.99
  EUR: { friend: 899, partner: 1799 }, // €8.99, €17.99
  GBP: { friend: 799, partner: 1599 }, // £7.99, £15.99
  JPY: { friend: 1500, partner: 3000 }, // ¥1500, ¥3000 (no decimals)
  KRW: { friend: 15000, partner: 30000 }, // ₩15,000, ₩30,000 (no decimals)
  CNY: { friend: 69, partner: 139 }, // ¥69, ¥139 (special pricing for China)
  TWD: { friend: 299, partner: 599 }, // NT$299, NT$599
  SAR: { friend: 37, partner: 75 }, // ر.س37, ر.س75
  ILS: { friend: 35, partner: 70 }, // ₪35, ₪70
};

// ============================================================================
// STRIPE PRICE IDS BY CURRENCY
// ============================================================================

/**
 * Stripe Price IDs for each currency and tier
 * These must be created in Stripe Dashboard
 * Format: price_{tier}_{currency}
 *
 * Note: Set these via environment variables in production
 */
export interface StripePriceIds {
  friend: string;
  partner: string;
}

const DEFAULT_STRIPE_PRICE_IDS: Record<CurrencyCode, StripePriceIds> = {
  USD: {
    friend: process.env.STRIPE_PRICE_FRIEND_USD || 'price_friend_usd',
    partner: process.env.STRIPE_PRICE_PARTNER_USD || 'price_partner_usd',
  },
  EUR: {
    friend: process.env.STRIPE_PRICE_FRIEND_EUR || 'price_friend_eur',
    partner: process.env.STRIPE_PRICE_PARTNER_EUR || 'price_partner_eur',
  },
  GBP: {
    friend: process.env.STRIPE_PRICE_FRIEND_GBP || 'price_friend_gbp',
    partner: process.env.STRIPE_PRICE_PARTNER_GBP || 'price_partner_gbp',
  },
  JPY: {
    friend: process.env.STRIPE_PRICE_FRIEND_JPY || 'price_friend_jpy',
    partner: process.env.STRIPE_PRICE_PARTNER_JPY || 'price_partner_jpy',
  },
  KRW: {
    friend: process.env.STRIPE_PRICE_FRIEND_KRW || 'price_friend_krw',
    partner: process.env.STRIPE_PRICE_PARTNER_KRW || 'price_partner_krw',
  },
  CNY: {
    friend: process.env.STRIPE_PRICE_FRIEND_CNY || 'price_friend_cny',
    partner: process.env.STRIPE_PRICE_PARTNER_CNY || 'price_partner_cny',
  },
  TWD: {
    friend: process.env.STRIPE_PRICE_FRIEND_TWD || 'price_friend_twd',
    partner: process.env.STRIPE_PRICE_PARTNER_TWD || 'price_partner_twd',
  },
  SAR: {
    friend: process.env.STRIPE_PRICE_FRIEND_SAR || 'price_friend_sar',
    partner: process.env.STRIPE_PRICE_PARTNER_SAR || 'price_partner_sar',
  },
  ILS: {
    friend: process.env.STRIPE_PRICE_FRIEND_ILS || 'price_friend_ils',
    partner: process.env.STRIPE_PRICE_PARTNER_ILS || 'price_partner_ils',
  },
};

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a price in the given currency
 */
export function formatPrice(amountInSmallestUnit: number, currency: CurrencyCode): string {
  const config = CURRENCY_CONFIG[currency];
  const divisor = config.decimalPlaces > 0 ? Math.pow(10, config.decimalPlaces) : 1;
  const amount = amountInSmallestUnit / divisor;

  // Format the number
  const parts = amount.toFixed(config.decimalPlaces).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const formattedNumber =
    config.decimalPlaces > 0 ? `${integerPart}${config.decimalSeparator}${parts[1]}` : integerPart;

  // Add currency symbol
  if (config.symbolPosition === 'before') {
    return `${config.symbol}${formattedNumber}`;
  } else {
    return `${formattedNumber} ${config.symbol}`;
  }
}

// ============================================================================
// PRICING API
// ============================================================================

/**
 * Get pricing for a specific locale
 */
export function getPricingForLocale(locale: SupportedLocale = DEFAULT_LOCALE): LocalePricing {
  const currency = LOCALE_CURRENCY[locale] || 'USD';
  const prices = TIER_PRICING[currency];

  return {
    free: {
      amountInSmallestUnit: 0,
      formatted: formatPrice(0, currency),
      currency,
    },
    friend: {
      amountInSmallestUnit: prices.friend,
      formatted: formatPrice(prices.friend, currency),
      currency,
    },
    partner: {
      amountInSmallestUnit: prices.partner,
      formatted: formatPrice(prices.partner, currency),
      currency,
    },
  };
}

/**
 * Get currency for a locale
 */
export function getCurrencyForLocale(locale: SupportedLocale = DEFAULT_LOCALE): CurrencyCode {
  return LOCALE_CURRENCY[locale] || 'USD';
}

/**
 * Get Stripe price ID for a tier and currency
 */
export function getStripePriceId(
  tier: 'friend' | 'partner',
  currency: CurrencyCode = 'USD'
): string {
  return DEFAULT_STRIPE_PRICE_IDS[currency][tier];
}

/**
 * Get all Stripe price IDs for a currency
 */
export function getStripePriceIdsForCurrency(currency: CurrencyCode): StripePriceIds {
  return DEFAULT_STRIPE_PRICE_IDS[currency];
}

/**
 * Detect currency from Accept-Language header
 */
export function detectCurrencyFromHeader(acceptLanguage: string | undefined): CurrencyCode {
  if (!acceptLanguage) return 'USD';

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,ja;q=0.8")
  const languages = acceptLanguage.split(',').map((lang) => {
    const parts = lang.trim().split(';');
    return parts[0].toLowerCase();
  });

  // Find first matching locale
  for (const lang of languages) {
    // Try exact match first
    for (const [locale, currency] of Object.entries(LOCALE_CURRENCY)) {
      if (locale.toLowerCase() === lang) {
        return currency;
      }
    }
    // Try base language match
    const baseLang = lang.split('-')[0];
    for (const [locale, currency] of Object.entries(LOCALE_CURRENCY)) {
      if (locale.split('-')[0].toLowerCase() === baseLang) {
        return currency;
      }
    }
  }

  return 'USD';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const pricing = {
  formatPrice,
  getPricingForLocale,
  getCurrencyForLocale,
  getStripePriceId,
  getStripePriceIdsForCurrency,
  detectCurrencyFromHeader,
  CURRENCY_CONFIG,
  LOCALE_CURRENCY,
};

export default pricing;
