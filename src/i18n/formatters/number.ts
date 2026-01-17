/**
 * Number and Currency Formatting Utilities
 *
 * Provides locale-aware number and currency formatting using Intl.NumberFormat.
 * Supports multi-currency pricing for international markets.
 */

import { type SupportedLocale, DEFAULT_LOCALE } from '../types.js';

// ============================================================================
// CURRENCY CONFIGURATION
// ============================================================================

/**
 * Currency configuration per locale
 * Maps locales to their default currency
 */
export const CURRENCY_BY_LOCALE: Record<SupportedLocale, string> = {
  'en-US': 'USD',
  'en-GB': 'GBP',
  es: 'EUR',
  fr: 'EUR',
  de: 'EUR',
  ja: 'JPY',
  ko: 'KRW',
  'zh-Hans': 'CNY',
  'zh-Hant': 'TWD',
  ar: 'AED',
  he: 'ILS',
};

/**
 * Stripe-compatible currency codes (lowercase)
 */
export type StripeCurrency = 'usd' | 'eur' | 'gbp' | 'jpy' | 'krw' | 'cny' | 'twd' | 'aed' | 'ils';

/**
 * Currency configuration with display properties
 */
export interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  stripeCurrency: StripeCurrency;
}

/**
 * Full currency configurations
 */
export const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', decimals: 2, stripeCurrency: 'usd' },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, stripeCurrency: 'eur' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, stripeCurrency: 'gbp' },
  JPY: { code: 'JPY', symbol: '¥', decimals: 0, stripeCurrency: 'jpy' },
  KRW: { code: 'KRW', symbol: '₩', decimals: 0, stripeCurrency: 'krw' },
  CNY: { code: 'CNY', symbol: '¥', decimals: 2, stripeCurrency: 'cny' },
  TWD: { code: 'TWD', symbol: 'NT$', decimals: 0, stripeCurrency: 'twd' },
  AED: { code: 'AED', symbol: 'د.إ', decimals: 2, stripeCurrency: 'aed' },
  ILS: { code: 'ILS', symbol: '₪', decimals: 2, stripeCurrency: 'ils' },
};

/**
 * Price points per currency for subscription tiers
 * Values are in the smallest currency unit (cents, yen, etc.)
 */
export const TIER_PRICES: Record<string, Record<string, { friend: number; partner: number }>> = {
  USD: { monthly: { friend: 999, partner: 1999 }, annual: { friend: 9990, partner: 19990 } },
  EUR: { monthly: { friend: 999, partner: 1999 }, annual: { friend: 9990, partner: 19990 } },
  GBP: { monthly: { friend: 899, partner: 1799 }, annual: { friend: 8990, partner: 17990 } },
  JPY: { monthly: { friend: 1480, partner: 2980 }, annual: { friend: 14800, partner: 29800 } },
  KRW: { monthly: { friend: 13900, partner: 27900 }, annual: { friend: 139000, partner: 279000 } },
  CNY: { monthly: { friend: 6900, partner: 13900 }, annual: { friend: 69000, partner: 139000 } },
  TWD: { monthly: { friend: 320, partner: 640 }, annual: { friend: 3200, partner: 6400 } },
  AED: { monthly: { friend: 3699, partner: 7399 }, annual: { friend: 36990, partner: 73990 } },
  ILS: { monthly: { friend: 3699, partner: 7399 }, annual: { friend: 36990, partner: 73990 } },
};

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

/**
 * Format a number according to locale
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a number as an integer (no decimals)
 */
export function formatInteger(value: number, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number with specific decimal places
 */
export function formatDecimal(
  value: number,
  decimals: number,
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a percentage
 */
export function formatPercent(
  value: number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  decimals = 0
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a compact number (e.g., 1.2K, 3.5M)
 */
export function formatCompact(value: number, locale: SupportedLocale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

// ============================================================================
// CURRENCY FORMATTING
// ============================================================================

/**
 * Format a currency value
 *
 * @param value - Amount in the currency's smallest unit (cents, yen, etc.)
 * @param currency - Currency code (USD, EUR, etc.)
 * @param locale - Locale for formatting
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const config = CURRENCIES[currency] ??
    CURRENCIES.USD ?? { code: 'USD', symbol: '$', decimals: 2 };
  const decimals = config.decimals ?? 2;
  const displayValue = decimals > 0 ? value / Math.pow(10, decimals) : value;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: config.code ?? 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);
}

/**
 * Format a price with period (e.g., "$9.99/mo")
 *
 * @param cents - Amount in smallest currency unit
 * @param currency - Currency code
 * @param period - Billing period
 * @param locale - Locale for formatting
 */
export function formatPrice(
  cents: number,
  currency = 'USD',
  period: 'monthly' | 'annual' = 'monthly',
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const formatted = formatCurrency(cents, currency, locale);

  // Period suffixes by locale
  const periodSuffix: Record<SupportedLocale, Record<string, string>> = {
    'en-US': { monthly: '/mo', annual: '/yr' },
    'en-GB': { monthly: '/mo', annual: '/yr' },
    es: { monthly: '/mes', annual: '/año' },
    fr: { monthly: '/mois', annual: '/an' },
    de: { monthly: '/Mon.', annual: '/Jahr' },
    ja: { monthly: '/月', annual: '/年' },
    ko: { monthly: '/월', annual: '/년' },
    'zh-Hans': { monthly: '/月', annual: '/年' },
    'zh-Hant': { monthly: '/月', annual: '/年' },
    ar: { monthly: '/شهر', annual: '/سنة' },
    he: { monthly: '/חודש', annual: '/שנה' },
  };

  const suffix = periodSuffix[locale]?.[period] || periodSuffix['en-US'][period];
  return `${formatted}${suffix}`;
}

/**
 * Get the currency for a locale
 */
export function getCurrencyForLocale(locale: SupportedLocale): string {
  return CURRENCY_BY_LOCALE[locale] || 'USD';
}

/**
 * Get tier price for a locale
 */
export function getTierPrice(
  tier: 'friend' | 'partner',
  period: 'monthly' | 'annual',
  locale: SupportedLocale = DEFAULT_LOCALE
): { amount: number; currency: string; formatted: string } {
  const currency = getCurrencyForLocale(locale);
  const prices = TIER_PRICES[currency] ?? TIER_PRICES.USD;
  const periodPrices = prices?.[period];
  const amount = periodPrices?.[tier] ?? 0;

  return {
    amount,
    currency,
    formatted: formatPrice(amount, currency, period, locale),
  };
}

/**
 * Format a price range (e.g., "$9.99 - $19.99")
 */
export function formatPriceRange(
  minCents: number,
  maxCents: number,
  currency = 'USD',
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const minFormatted = formatCurrency(minCents, currency, locale);
  const maxFormatted = formatCurrency(maxCents, currency, locale);
  return `${minFormatted} - ${maxFormatted}`;
}

/**
 * Format savings amount (e.g., "Save $20")
 */
export function formatSavings(
  cents: number,
  currency = 'USD',
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const formatted = formatCurrency(cents, currency, locale);

  // "Save" translations
  const saveText: Record<SupportedLocale, string> = {
    'en-US': 'Save',
    'en-GB': 'Save',
    es: 'Ahorra',
    fr: 'Économisez',
    de: 'Spare',
    ja: '節約',
    ko: '절약',
    'zh-Hans': '节省',
    'zh-Hant': '節省',
    ar: 'وفر',
    he: 'חסוך',
  };

  return `${saveText[locale] || 'Save'} ${formatted}`;
}

// ============================================================================
// STRIPE HELPERS
// ============================================================================

/**
 * Get Stripe-compatible currency code (lowercase)
 */
export function getStripeCurrency(locale: SupportedLocale): StripeCurrency {
  const currency = CURRENCY_BY_LOCALE[locale];
  const config = CURRENCIES[currency];
  return config?.stripeCurrency || 'usd';
}

/**
 * Convert amount to Stripe's expected format
 * Stripe expects amounts in smallest currency unit
 */
export function toStripeAmount(displayAmount: number, currency: string): number {
  const config = CURRENCIES[currency] ?? CURRENCIES.USD;
  const decimals = config?.decimals ?? 2;
  return Math.round(displayAmount * Math.pow(10, decimals));
}

/**
 * Convert Stripe amount to display amount
 */
export function fromStripeAmount(stripeAmount: number, currency: string): number {
  const config = CURRENCIES[currency] ?? CURRENCIES.USD;
  const decimals = config?.decimals ?? 2;
  return stripeAmount / Math.pow(10, decimals);
}
