/**
 * Financial Domain Tools
 *
 * Barrel export for all financial-related tools:
 * - Market data (stocks, indices)
 * - Economic indicators (Fed, inflation)
 * - Calculators (compound growth, fees)
 * - Personal finance (banking, loans)
 */

export {
  createMarketDataTools,
  getStockQuote,
  getMarketOverview,
  getMarketStatus,
} from './finance/market-data.js';
export { createEconomicTools } from './finance/economic.js';
export { createCalculatorTools } from './finance/calculators.js';
export { createPersonalFinanceTools } from './finance/personal-finance.js';
