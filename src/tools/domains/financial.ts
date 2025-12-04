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
} from '../market-data.js';
export { createEconomicTools } from '../economic.js';
export { createCalculatorTools } from '../calculators.js';
export { createPersonalFinanceTools } from '../personal-finance.js';
