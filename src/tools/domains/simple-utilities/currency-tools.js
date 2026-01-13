/**
 * Currency Conversion Tools
 *
 * Real-time currency conversion with exchange rates.
 * Uses free exchange rate APIs with caching.
 *
 * @module simple-utilities/currency-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
// Cache rates for 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;
let ratesCache = null;
// Common currency symbols and names
const CURRENCY_INFO = {
    USD: { symbol: '$', name: 'US Dollar' },
    EUR: { symbol: '€', name: 'Euro' },
    GBP: { symbol: '£', name: 'British Pound' },
    JPY: { symbol: '¥', name: 'Japanese Yen' },
    CNY: { symbol: '¥', name: 'Chinese Yuan' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar' },
    AUD: { symbol: 'A$', name: 'Australian Dollar' },
    CHF: { symbol: 'Fr', name: 'Swiss Franc' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
    MXN: { symbol: '$', name: 'Mexican Peso' },
    BRL: { symbol: 'R$', name: 'Brazilian Real' },
    KRW: { symbol: '₩', name: 'South Korean Won' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar' },
    HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
    NOK: { symbol: 'kr', name: 'Norwegian Krone' },
    SEK: { symbol: 'kr', name: 'Swedish Krona' },
    DKK: { symbol: 'kr', name: 'Danish Krone' },
    NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
    ZAR: { symbol: 'R', name: 'South African Rand' },
    RUB: { symbol: '₽', name: 'Russian Ruble' },
    THB: { symbol: '฿', name: 'Thai Baht' },
    PHP: { symbol: '₱', name: 'Philippine Peso' },
    PLN: { symbol: 'zł', name: 'Polish Zloty' },
    TRY: { symbol: '₺', name: 'Turkish Lira' },
    ILS: { symbol: '₪', name: 'Israeli Shekel' },
    AED: { symbol: 'د.إ', name: 'UAE Dirham' },
    COP: { symbol: '$', name: 'Colombian Peso' },
    ARS: { symbol: '$', name: 'Argentine Peso' },
    CLP: { symbol: '$', name: 'Chilean Peso' },
    PEN: { symbol: 'S/', name: 'Peruvian Sol' },
};
// Normalize currency input to 3-letter code
function normalizeCurrency(input) {
    const upper = input.toUpperCase().trim();
    // Direct match
    if (CURRENCY_INFO[upper])
        return upper;
    // Common aliases
    const aliases = {
        DOLLAR: 'USD',
        DOLLARS: 'USD',
        BUCK: 'USD',
        BUCKS: 'USD',
        EURO: 'EUR',
        EUROS: 'EUR',
        POUND: 'GBP',
        POUNDS: 'GBP',
        STERLING: 'GBP',
        YEN: 'JPY',
        YUAN: 'CNY',
        RMB: 'CNY',
        RENMINBI: 'CNY',
        RUPEE: 'INR',
        RUPEES: 'INR',
        PESO: 'MXN',
        WON: 'KRW',
        FRANC: 'CHF',
        FRANCS: 'CHF',
        REAL: 'BRL',
        REAIS: 'BRL',
        RUBLE: 'RUB',
        RUBLES: 'RUB',
        LIRA: 'TRY',
        SHEKEL: 'ILS',
        SHEKELS: 'ILS',
        BAHT: 'THB',
        DIRHAM: 'AED',
        DIRHAMS: 'AED',
        CANADIAN: 'CAD',
        AUSSIE: 'AUD',
        AUSTRALIAN: 'AUD',
        BRITISH: 'GBP',
    };
    if (aliases[upper])
        return aliases[upper];
    // Check currency names
    for (const [code, info] of Object.entries(CURRENCY_INFO)) {
        if (info.name.toUpperCase().includes(upper))
            return code;
    }
    return null;
}
// Fetch exchange rates from API
async function fetchRates() {
    // Check cache first
    if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_TTL_MS) {
        return ratesCache;
    }
    try {
        // Using exchangerate-api.com free tier (no API key needed)
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!response.ok) {
            throw new Error(`Exchange rate API returned ${response.status}`);
        }
        const data = await response.json();
        if (data.result !== 'success') {
            throw new Error('Exchange rate API returned error');
        }
        ratesCache = {
            base: 'USD',
            rates: data.rates,
            timestamp: Date.now(),
        };
        log.info({ rateCount: Object.keys(ratesCache.rates).length }, 'Exchange rates updated');
        return ratesCache;
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to fetch exchange rates');
        return ratesCache; // Return stale cache if available
    }
}
// Convert between currencies
function convertAmount(amount, fromCode, toCode, rates) {
    const fromRate = rates[fromCode];
    const toRate = rates[toCode];
    if (!fromRate || !toRate)
        return null;
    // Convert to USD first (base), then to target currency
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
}
// Format currency for display
function formatCurrency(amount, code) {
    const info = CURRENCY_INFO[code];
    const symbol = info?.symbol || code;
    // Determine decimal places (JPY, KRW, etc. don't use decimals)
    const noDecimals = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP'];
    const decimals = noDecimals.includes(code) ? 0 : 2;
    const formatted = amount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return `${symbol}${formatted} ${code}`;
}
// ============================================================================
// CONVERT CURRENCY TOOL
// ============================================================================
const convertCurrencyDef = {
    id: 'convertCurrency',
    name: 'Convert Currency',
    description: 'Convert between currencies with real-time exchange rates',
    domain: 'simple-utilities',
    tags: ['currency', 'money', 'conversion', 'exchange', 'travel', 'finance'],
    create: (_ctx) => {
        return llm.tool({
            description: `Convert money between currencies using real-time exchange rates. Supports 30+ currencies. Use when the user asks "How much is X dollars in euros?", "Convert 100 USD to GBP", or needs currency conversion for travel or business.`,
            parameters: z.object({
                amount: z.number().describe('The amount to convert'),
                fromCurrency: z
                    .string()
                    .describe('The currency to convert from (e.g., USD, EUR, dollars, euros)'),
                toCurrency: z.string().describe('The currency to convert to (e.g., GBP, JPY, pounds, yen)'),
            }),
            execute: async ({ amount, fromCurrency, toCurrency }) => {
                const fromCode = normalizeCurrency(fromCurrency);
                const toCode = normalizeCurrency(toCurrency);
                if (!fromCode) {
                    return `I don't recognize "${fromCurrency}" as a currency. Try using the 3-letter code like USD, EUR, GBP, or a common name like dollars, euros, pounds.`;
                }
                if (!toCode) {
                    return `I don't recognize "${toCurrency}" as a currency. Try using the 3-letter code like USD, EUR, GBP, or a common name like dollars, euros, pounds.`;
                }
                if (fromCode === toCode) {
                    return `${formatCurrency(amount, fromCode)} is... well, ${formatCurrency(amount, toCode)}! Same currency.`;
                }
                log.info({ amount, from: fromCode, to: toCode }, 'Converting currency');
                const rates = await fetchRates();
                if (!rates) {
                    return `I couldn't get current exchange rates. Please try again in a moment.`;
                }
                const converted = convertAmount(amount, fromCode, toCode, rates.rates);
                if (converted === null) {
                    return `I couldn't convert between ${fromCode} and ${toCode}. One of these currencies might not be supported.`;
                }
                // Get the exchange rate for context
                const rate = converted / amount;
                const fromInfo = CURRENCY_INFO[fromCode]?.name || fromCode;
                const toInfo = CURRENCY_INFO[toCode]?.name || toCode;
                const parts = [
                    `**${formatCurrency(amount, fromCode)}** = **${formatCurrency(converted, toCode)}**`,
                    `Rate: 1 ${fromCode} = ${rate.toFixed(4)} ${toCode}`,
                ];
                // Add context for large conversions
                if (amount >= 1000) {
                    parts.push(`(${fromInfo} to ${toInfo})`);
                }
                return parts.join('\n');
            },
        });
    },
};
// ============================================================================
// GET EXCHANGE RATE TOOL
// ============================================================================
const getExchangeRateDef = {
    id: 'getExchangeRate',
    name: 'Get Exchange Rate',
    description: 'Get the current exchange rate between two currencies',
    domain: 'simple-utilities',
    tags: ['currency', 'exchange', 'rate', 'forex'],
    create: (_ctx) => {
        return llm.tool({
            description: `Get the current exchange rate between two currencies without converting a specific amount. Use when the user asks "What's the exchange rate for USD to EUR?", "How much is a dollar worth in yen?", or wants to know the rate.`,
            parameters: z.object({
                fromCurrency: z.string().describe('The base currency (e.g., USD, EUR)'),
                toCurrency: z.string().describe('The quote currency (e.g., GBP, JPY)'),
            }),
            execute: async ({ fromCurrency, toCurrency }) => {
                const fromCode = normalizeCurrency(fromCurrency);
                const toCode = normalizeCurrency(toCurrency);
                if (!fromCode) {
                    return `I don't recognize "${fromCurrency}" as a currency.`;
                }
                if (!toCode) {
                    return `I don't recognize "${toCurrency}" as a currency.`;
                }
                log.info({ from: fromCode, to: toCode }, 'Getting exchange rate');
                const rates = await fetchRates();
                if (!rates) {
                    return `I couldn't get current exchange rates. Please try again in a moment.`;
                }
                const converted = convertAmount(1, fromCode, toCode, rates.rates);
                if (converted === null) {
                    return `I couldn't get the rate between ${fromCode} and ${toCode}.`;
                }
                const fromInfo = CURRENCY_INFO[fromCode]?.name || fromCode;
                const toInfo = CURRENCY_INFO[toCode]?.name || toCode;
                return `**1 ${fromCode}** (${fromInfo}) = **${converted.toFixed(4)} ${toCode}** (${toInfo})`;
            },
        });
    },
};
// ============================================================================
// LIST CURRENCIES TOOL
// ============================================================================
const listCurrenciesDef = {
    id: 'listCurrencies',
    name: 'List Currencies',
    description: 'List supported currencies',
    domain: 'simple-utilities',
    tags: ['currency', 'list', 'help'],
    create: (_ctx) => {
        return llm.tool({
            description: `List available currencies for conversion. Use when the user asks "What currencies do you support?", "List currencies", or needs to know available options.`,
            parameters: z.object({
                region: z
                    .enum(['all', 'americas', 'europe', 'asia', 'popular'])
                    .optional()
                    .describe('Filter by region (default: popular)'),
            }),
            execute: async ({ region = 'popular' }) => {
                const popular = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN'];
                const americas = ['USD', 'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN'];
                const europe = ['EUR', 'GBP', 'CHF', 'NOK', 'SEK', 'DKK', 'PLN', 'RUB', 'TRY'];
                const asia = ['JPY', 'CNY', 'INR', 'KRW', 'SGD', 'HKD', 'THB', 'PHP', 'ILS', 'AED'];
                let codes;
                let title;
                switch (region) {
                    case 'americas':
                        codes = americas;
                        title = 'Americas';
                        break;
                    case 'europe':
                        codes = europe;
                        title = 'Europe';
                        break;
                    case 'asia':
                        codes = asia;
                        title = 'Asia & Middle East';
                        break;
                    case 'popular':
                        codes = popular;
                        title = 'Most Used';
                        break;
                    default:
                        codes = Object.keys(CURRENCY_INFO);
                        title = 'All Supported';
                }
                const list = codes
                    .map((code) => {
                    const info = CURRENCY_INFO[code];
                    return `• ${code} ${info?.symbol || ''} - ${info?.name || code}`;
                })
                    .join('\n');
                return `**${title} Currencies:**\n${list}`;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const currencyToolDefinitions = [
    convertCurrencyDef,
    getExchangeRateDef,
    listCurrenciesDef,
];
export { convertCurrencyDef, getExchangeRateDef, listCurrenciesDef };
//# sourceMappingURL=currency-tools.js.map