/**
 * Quant Tools for Peter John
 *
 * Three domains of quantitative analysis:
 * 1. MARKET QUANT - Technical indicators, risk metrics, sector analysis
 * 2. PERSONAL FINANCE QUANT - Net worth, savings rate, retirement readiness
 * 3. COACHING QUANT - Behavioral scoring, decision quality, peer benchmarking
 *
 * All tools designed to give Peter the analytical superpowers of a quant
 * while maintaining his warm, Peter Lynch "invest in what you know" personality.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { withRateLimit } from '../../rate-limiter.js';

const log = getLogger();

// ============================================================================
// MARKET QUANT TOOLS - Technical Analysis & Risk Metrics
// ============================================================================

/**
 * Calculate RSI (Relative Strength Index)
 * RSI > 70 = overbought, RSI < 30 = oversold
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Not enough data

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(0, period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Signal line is 9-day EMA of MACD (simplified)
  const signal = macd * 0.2 + (prices[0] - prices[8]) * 0.8 / 8;
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const multiplier = 2 / (period + 1);
  let ema = prices[prices.length - 1]; // Start with oldest price

  for (let i = prices.length - 2; i >= 0; i--) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(
  prices: number[],
  period: number = 20
): { upper: number; middle: number; lower: number; percentB: number } {
  const sma = calculateSMA(prices, period);
  const slice = prices.slice(0, Math.min(period, prices.length));

  // Calculate standard deviation
  const squaredDiffs = slice.map((p) => Math.pow(p - sma, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / slice.length;
  const stdDev = Math.sqrt(variance);

  const upper = sma + 2 * stdDev;
  const lower = sma - 2 * stdDev;
  const currentPrice = prices[0];
  const percentB = (currentPrice - lower) / (upper - lower);

  return { upper, middle: sma, lower, percentB };
}

/**
 * Fetch historical prices from Yahoo Finance
 */
async function fetchHistoricalPrices(symbol: string, days: number = 100): Promise<number[]> {
  return withRateLimit(
    'yahoo-finance',
    async () => {
      const period2 = Math.floor(Date.now() / 1000);
      const period1 = period2 - days * 24 * 60 * 60;

      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) return [];

      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            indicators?: {
              quote?: Array<{ close?: (number | null)[] }>;
            };
          }>;
        };
      };

      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (!closes) return [];

      // Filter nulls and reverse to get most recent first
      return closes.filter((c): c is number => c !== null).reverse();
    },
    []
  );
}

/**
 * Calculate risk metrics for a stock
 */
function calculateRiskMetrics(
  prices: number[],
  benchmarkPrices: number[]
): {
  volatility: number;
  beta: number;
  sharpeRatio: number;
  maxDrawdown: number;
  var95: number;
} {
  if (prices.length < 20) {
    return { volatility: 0, beta: 1, sharpeRatio: 0, maxDrawdown: 0, var95: 0 };
  }

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 0; i < prices.length - 1; i++) {
    returns.push((prices[i] - prices[i + 1]) / prices[i + 1]);
  }

  const benchmarkReturns: number[] = [];
  for (let i = 0; i < benchmarkPrices.length - 1 && i < returns.length; i++) {
    benchmarkReturns.push((benchmarkPrices[i] - benchmarkPrices[i + 1]) / benchmarkPrices[i + 1]);
  }

  // Volatility (annualized standard deviation)
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const volatility = dailyVol * Math.sqrt(252) * 100; // Annualized

  // Beta (covariance with market / variance of market)
  const avgBenchmark = benchmarkReturns.reduce((sum, r) => sum + r, 0) / benchmarkReturns.length;
  let covariance = 0;
  let benchmarkVariance = 0;
  for (let i = 0; i < Math.min(returns.length, benchmarkReturns.length); i++) {
    covariance += (returns[i] - avgReturn) * (benchmarkReturns[i] - avgBenchmark);
    benchmarkVariance += Math.pow(benchmarkReturns[i] - avgBenchmark, 2);
  }
  const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;

  // Sharpe Ratio (assuming 5% risk-free rate)
  const annualizedReturn = avgReturn * 252;
  const riskFreeRate = 0.05;
  const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / (volatility / 100) : 0;

  // Max Drawdown
  let peak = prices[prices.length - 1];
  let maxDrawdown = 0;
  for (const price of prices) {
    if (price > peak) peak = price;
    const drawdown = (peak - price) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Value at Risk (95% confidence) - historical method
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const var95Index = Math.floor(returns.length * 0.05);
  const var95 = Math.abs(sortedReturns[var95Index] || 0) * 100;

  return {
    volatility: Math.round(volatility * 10) / 10,
    beta: Math.round(beta * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 1000) / 10,
    var95: Math.round(var95 * 10) / 10,
  };
}

// ============================================================================
// PERSONAL FINANCE QUANT TOOLS
// ============================================================================

interface NetWorthSnapshot {
  assets: { cash: number; investments: number; property: number; other: number };
  liabilities: { mortgage: number; loans: number; creditCards: number; other: number };
}

function calculateNetWorth(snapshot: NetWorthSnapshot): {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtToAssetRatio: number;
  liquidityRatio: number;
} {
  const totalAssets =
    snapshot.assets.cash +
    snapshot.assets.investments +
    snapshot.assets.property +
    snapshot.assets.other;

  const totalLiabilities =
    snapshot.liabilities.mortgage +
    snapshot.liabilities.loans +
    snapshot.liabilities.creditCards +
    snapshot.liabilities.other;

  const netWorth = totalAssets - totalLiabilities;
  const debtToAssetRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const liquidityRatio =
    totalLiabilities > 0
      ? (snapshot.assets.cash + snapshot.assets.investments) / totalLiabilities
      : Infinity;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    debtToAssetRatio: Math.round(debtToAssetRatio * 100) / 100,
    liquidityRatio: Math.round(liquidityRatio * 100) / 100,
  };
}

function calculateSavingsRate(
  monthlyIncome: number,
  monthlyExpenses: number
): {
  savingsRate: number;
  monthlySavings: number;
  annualSavings: number;
  rating: string;
  advice: string;
} {
  const monthlySavings = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;
  const annualSavings = monthlySavings * 12;

  let rating: string;
  let advice: string;

  if (savingsRate < 0) {
    rating = 'Critical';
    advice = "You're spending more than you earn. Let's find where we can cut back.";
  } else if (savingsRate < 10) {
    rating = 'Needs Work';
    advice = 'Aim for at least 10-15% savings. Even small increases compound hugely over time.';
  } else if (savingsRate < 20) {
    rating = 'Good';
    advice = 'Solid! 15-20% is the sweet spot for most people. Keep it up!';
  } else if (savingsRate < 30) {
    rating = 'Great';
    advice = "You're ahead of most Americans. This puts you on track for early financial freedom.";
  } else if (savingsRate < 50) {
    rating = 'Excellent';
    advice =
      "FIRE territory! At this rate, you're building serious wealth. Just don't forget to enjoy today too.";
  } else {
    rating = 'Exceptional';
    advice = "You're saving like a machine! Make sure you're not sacrificing quality of life unnecessarily.";
  }

  return {
    savingsRate: Math.round(savingsRate * 10) / 10,
    monthlySavings: Math.round(monthlySavings),
    annualSavings: Math.round(annualSavings),
    rating,
    advice,
  };
}

function calculateFIRENumber(
  annualExpenses: number,
  withdrawalRate: number = 4
): {
  fireNumber: number;
  leanFIRE: number;
  fatFIRE: number;
  coastFIRE: { age30: number; age40: number; age50: number };
} {
  const fireNumber = annualExpenses * (100 / withdrawalRate);
  const leanFIRE = (annualExpenses * 0.7) * (100 / withdrawalRate); // 70% of current expenses
  const fatFIRE = (annualExpenses * 1.5) * (100 / withdrawalRate); // 150% of current expenses

  // Coast FIRE - amount needed now to coast to regular retirement
  // Assuming 7% real returns, retiring at 65
  const coastFIRE = {
    age30: Math.round(fireNumber / Math.pow(1.07, 35)),
    age40: Math.round(fireNumber / Math.pow(1.07, 25)),
    age50: Math.round(fireNumber / Math.pow(1.07, 15)),
  };

  return {
    fireNumber: Math.round(fireNumber),
    leanFIRE: Math.round(leanFIRE),
    fatFIRE: Math.round(fatFIRE),
    coastFIRE,
  };
}

function calculateRetirementReadiness(
  currentAge: number,
  targetRetirementAge: number,
  currentSavings: number,
  monthlyContribution: number,
  monthlyExpenses: number,
  expectedReturn: number = 7
): {
  score: number;
  projectedAtRetirement: number;
  yearsOfRetirement: number;
  monthlyIncomeInRetirement: number;
  recommendation: string;
} {
  const yearsToRetirement = targetRetirementAge - currentAge;
  const monthlyReturn = expectedReturn / 100 / 12;

  // Future value of current savings + contributions
  let projectedAtRetirement = currentSavings * Math.pow(1 + expectedReturn / 100, yearsToRetirement);

  // Add future value of monthly contributions (annuity formula)
  const months = yearsToRetirement * 12;
  if (monthlyReturn > 0) {
    projectedAtRetirement +=
      monthlyContribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn);
  }

  // How many years will this last at 4% withdrawal?
  const annualExpenses = monthlyExpenses * 12;
  const yearsOfRetirement = projectedAtRetirement / annualExpenses / (1 / 0.04);

  // Monthly income using 4% rule
  const monthlyIncomeInRetirement = (projectedAtRetirement * 0.04) / 12;

  // Score (0-100)
  const incomeReplacement = (monthlyIncomeInRetirement / monthlyExpenses) * 100;
  const score = Math.min(100, Math.round(incomeReplacement));

  let recommendation: string;
  if (score >= 100) {
    recommendation = "You're on track for a comfortable retirement! Consider whether you want to retire earlier.";
  } else if (score >= 80) {
    recommendation = "Good progress! A small increase in contributions would get you to 100%.";
  } else if (score >= 60) {
    recommendation = "You're making progress, but consider increasing contributions by 3-5% of income.";
  } else if (score >= 40) {
    recommendation = "There's work to do. Focus on increasing income or cutting expenses to save more.";
  } else {
    recommendation = "Let's make a plan. Small changes now compound into big differences later.";
  }

  return {
    score,
    projectedAtRetirement: Math.round(projectedAtRetirement),
    yearsOfRetirement: Math.round(yearsOfRetirement * 10) / 10,
    monthlyIncomeInRetirement: Math.round(monthlyIncomeInRetirement),
    recommendation,
  };
}

// ============================================================================
// COACHING QUANT TOOLS - Behavioral Finance
// ============================================================================

interface FinancialBehavior {
  panicSells: number; // Times sold during market drops
  timingAttempts: number; // Times tried to time the market
  impulsePurchases: number; // Unplanned big purchases
  budgetAdherence: number; // 0-100 how well they stick to budget
  savingsConsistency: number; // 0-100 how consistent they save
  debtPaymentConsistency: number; // 0-100 how consistent with debt payments
}

function calculateBehavioralScore(behavior: FinancialBehavior): {
  overallScore: number;
  emotionalControl: number;
  discipline: number;
  patience: number;
  strengths: string[];
  improvements: string[];
} {
  // Emotional control (panic selling, timing attempts)
  const emotionalPenalty = Math.min(50, behavior.panicSells * 15 + behavior.timingAttempts * 10);
  const emotionalControl = Math.max(0, 100 - emotionalPenalty);

  // Discipline (budget adherence, impulse control)
  const impulsePenalty = Math.min(30, behavior.impulsePurchases * 10);
  const discipline = Math.round((behavior.budgetAdherence * 0.7 + (100 - impulsePenalty) * 0.3));

  // Patience (savings and debt consistency)
  const patience = Math.round((behavior.savingsConsistency + behavior.debtPaymentConsistency) / 2);

  // Overall score
  const overallScore = Math.round((emotionalControl * 0.3 + discipline * 0.35 + patience * 0.35));

  // Identify strengths and improvements
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (emotionalControl >= 80) strengths.push('Excellent emotional control - you stay calm in volatility');
  else if (emotionalControl < 60) improvements.push('Work on staying calm during market drops');

  if (discipline >= 80) strengths.push('Strong financial discipline');
  else if (discipline < 60) improvements.push('Focus on sticking to your budget');

  if (patience >= 80) strengths.push('Consistent saver - the key to building wealth');
  else if (patience < 60) improvements.push('Automate savings to improve consistency');

  if (behavior.panicSells === 0) strengths.push("You haven't panic sold - that's rare and valuable!");
  if (behavior.impulsePurchases === 0) strengths.push('No impulse purchases - great self-control');

  return {
    overallScore,
    emotionalControl,
    discipline,
    patience,
    strengths: strengths.length > 0 ? strengths : ['Making progress - keep building good habits'],
    improvements: improvements.length > 0 ? improvements : ['Keep doing what you\'re doing!'],
  };
}

interface PeerBenchmark {
  savingsRate: number;
  netWorth: number;
  debtToIncome: number;
  emergencyFundMonths: number;
}

function calculatePeerComparison(
  userMetrics: PeerBenchmark,
  ageGroup: '20s' | '30s' | '40s' | '50s' | '60s'
): {
  savingsRatePercentile: number;
  netWorthPercentile: number;
  debtPercentile: number;
  emergencyFundPercentile: number;
  overallPercentile: number;
  standoutAreas: string[];
} {
  // Median benchmarks by age group (based on Federal Reserve data, simplified)
  const benchmarks: Record<string, { savingsRate: number; netWorth: number; debtToIncome: number; emergencyFund: number }> = {
    '20s': { savingsRate: 8, netWorth: 10000, debtToIncome: 0.8, emergencyFund: 1 },
    '30s': { savingsRate: 10, netWorth: 50000, debtToIncome: 1.2, emergencyFund: 2 },
    '40s': { savingsRate: 12, netWorth: 150000, debtToIncome: 1.0, emergencyFund: 3 },
    '50s': { savingsRate: 15, netWorth: 300000, debtToIncome: 0.7, emergencyFund: 4 },
    '60s': { savingsRate: 18, netWorth: 500000, debtToIncome: 0.4, emergencyFund: 6 },
  };

  const benchmark = benchmarks[ageGroup];

  // Calculate percentiles (simplified - actual would use distribution)
  const savingsRatePercentile = Math.min(99, Math.round((userMetrics.savingsRate / benchmark.savingsRate) * 50));
  const netWorthPercentile = Math.min(99, Math.round((userMetrics.netWorth / benchmark.netWorth) * 50));
  const debtPercentile = Math.min(99, Math.round((1 - userMetrics.debtToIncome / benchmark.debtToIncome) * 50 + 50));
  const emergencyFundPercentile = Math.min(99, Math.round((userMetrics.emergencyFundMonths / benchmark.emergencyFund) * 50));

  const overallPercentile = Math.round(
    (savingsRatePercentile + netWorthPercentile + debtPercentile + emergencyFundPercentile) / 4
  );

  const standoutAreas: string[] = [];
  if (savingsRatePercentile >= 75) standoutAreas.push(`Savings rate in top 25% for your age group`);
  if (netWorthPercentile >= 75) standoutAreas.push(`Net worth in top 25% for your age group`);
  if (debtPercentile >= 75) standoutAreas.push(`Debt management in top 25% for your age group`);
  if (emergencyFundPercentile >= 75) standoutAreas.push(`Emergency fund in top 25% for your age group`);

  return {
    savingsRatePercentile,
    netWorthPercentile,
    debtPercentile,
    emergencyFundPercentile,
    overallPercentile,
    standoutAreas: standoutAreas.length > 0 ? standoutAreas : ['Keep building - every step counts!'],
  };
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createQuantTools() {
  return {
    // MARKET QUANT: Technical Indicators
    technicalIndicators: llm.tool({
      description:
        'Calculate technical indicators for any stock: RSI (overbought/oversold), MACD (momentum), moving averages (trend), Bollinger Bands (volatility). Great for timing analysis.',
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol'),
        indicators: z
          .array(z.enum(['rsi', 'macd', 'sma', 'bollinger', 'all']))
          .optional()
          .describe('Which indicators to calculate (default: all)'),
      }),
      execute: async ({ symbol, indicators = ['all'] }) => {
        log.info({ symbol, indicators }, 'Calculating technical indicators');

        const prices = await fetchHistoricalPrices(symbol.toUpperCase(), 100);
        if (prices.length < 26) {
          return `I need more historical data for ${symbol} to calculate technical indicators. This might be a newer stock or ETF.`;
        }

        const showAll = indicators.includes('all');
        const results: string[] = [`Technical Analysis for ${symbol.toUpperCase()}:`];

        if (showAll || indicators.includes('rsi')) {
          const rsi = calculateRSI(prices);
          const rsiSignal =
            rsi > 70 ? 'OVERBOUGHT - might be due for a pullback' : rsi < 30 ? 'OVERSOLD - could be a buying opportunity' : 'NEUTRAL';
          results.push(`• RSI (14-day): ${rsi.toFixed(1)} - ${rsiSignal}`);
        }

        if (showAll || indicators.includes('macd')) {
          const macd = calculateMACD(prices);
          const macdSignal =
            macd.histogram > 0 ? 'BULLISH momentum' : macd.histogram < 0 ? 'BEARISH momentum' : 'NEUTRAL';
          results.push(`• MACD: ${macd.macd.toFixed(2)} (Signal: ${macd.signal.toFixed(2)}) - ${macdSignal}`);
        }

        if (showAll || indicators.includes('sma')) {
          const sma20 = calculateSMA(prices, 20);
          const sma50 = calculateSMA(prices, 50);
          const currentPrice = prices[0];
          const trend = currentPrice > sma20 && sma20 > sma50 ? 'UPTREND' : currentPrice < sma20 && sma20 < sma50 ? 'DOWNTREND' : 'SIDEWAYS';
          results.push(`• Moving Averages: 20-day $${sma20.toFixed(2)}, 50-day $${sma50.toFixed(2)} - ${trend}`);
        }

        if (showAll || indicators.includes('bollinger')) {
          const bb = calculateBollingerBands(prices);
          const bbSignal =
            bb.percentB > 1 ? 'ABOVE upper band - extended' : bb.percentB < 0 ? 'BELOW lower band - oversold' : 'WITHIN bands';
          results.push(`• Bollinger Bands: $${bb.lower.toFixed(2)} - $${bb.upper.toFixed(2)} - ${bbSignal}`);
        }

        results.push('\nRemember: Technical analysis is just one piece of the puzzle. Always consider the fundamentals too!');
        return results.join('\n');
      },
    }),

    // MARKET QUANT: Risk Metrics
    riskAnalysis: llm.tool({
      description:
        'Calculate risk metrics for stocks: Beta (market sensitivity), Sharpe Ratio (risk-adjusted returns), Volatility, Max Drawdown, and Value at Risk (VaR). Essential for understanding risk.',
      parameters: z.object({
        symbols: z.array(z.string()).describe('Stock ticker symbols to analyze'),
      }),
      execute: async ({ symbols }) => {
        log.info({ symbols }, 'Calculating risk metrics');

        // Fetch benchmark (S&P 500)
        const benchmarkPrices = await fetchHistoricalPrices('SPY', 252);
        if (benchmarkPrices.length < 50) {
          return "I'm having trouble getting market data right now. Try again in a moment.";
        }

        const results: string[] = ['Risk Analysis:'];

        for (const symbol of symbols.slice(0, 5)) {
          const prices = await fetchHistoricalPrices(symbol.toUpperCase(), 252);
          if (prices.length < 50) {
            results.push(`\n${symbol.toUpperCase()}: Not enough historical data`);
            continue;
          }

          const metrics = calculateRiskMetrics(prices, benchmarkPrices);

          results.push(`\n${symbol.toUpperCase()}:`);
          results.push(`  • Beta: ${metrics.beta} ${metrics.beta > 1 ? '(more volatile than market)' : metrics.beta < 1 ? '(less volatile than market)' : '(moves with market)'}`);
          results.push(`  • Volatility: ${metrics.volatility}% annualized`);
          results.push(`  • Sharpe Ratio: ${metrics.sharpeRatio} ${metrics.sharpeRatio > 1 ? '(good risk-adjusted returns)' : metrics.sharpeRatio > 0.5 ? '(decent)' : '(poor risk-adjusted returns)'}`);
          results.push(`  • Max Drawdown: ${metrics.maxDrawdown}% (worst decline from peak)`);
          results.push(`  • VaR (95%): ${metrics.var95}% (could lose this much on a bad day)`);
        }

        results.push('\nRemember: Past volatility doesn\'t predict future volatility, but it gives us a baseline!');
        return results.join('\n');
      },
    }),

    // PERSONAL FINANCE QUANT: Savings Rate
    analyzeSavingsRate: llm.tool({
      description:
        'Calculate and analyze your savings rate. Shows where you stand, how much you\'re saving annually, and personalized advice to improve.',
      parameters: z.object({
        monthlyIncome: z.number().describe('Total monthly take-home income'),
        monthlyExpenses: z.number().describe('Total monthly expenses (including bills, food, entertainment)'),
      }),
      execute: async ({ monthlyIncome, monthlyExpenses }) => {
        log.info({ monthlyIncome, monthlyExpenses }, 'Analyzing savings rate');

        const analysis = calculateSavingsRate(monthlyIncome, monthlyExpenses);

        return [
          'Savings Rate Analysis:',
          '',
          `💰 Savings Rate: ${analysis.savingsRate}%`,
          `📊 Rating: ${analysis.rating}`,
          `💵 Monthly Savings: $${analysis.monthlySavings.toLocaleString()}`,
          `📅 Annual Savings: $${analysis.annualSavings.toLocaleString()}`,
          '',
          `💡 ${analysis.advice}`,
          '',
          'Fun fact: Increasing your savings rate by just 1% can shave years off your working career!',
        ].join('\n');
      },
    }),

    // PERSONAL FINANCE QUANT: FIRE Calculator
    calculateFIRE: llm.tool({
      description:
        'Calculate your Financial Independence number - how much you need to retire early. Shows regular FIRE, Lean FIRE, Fat FIRE, and Coast FIRE numbers.',
      parameters: z.object({
        annualExpenses: z.number().describe('Your current annual expenses'),
        withdrawalRate: z.number().optional().describe('Safe withdrawal rate (default 4%)'),
      }),
      execute: async ({ annualExpenses, withdrawalRate = 4 }) => {
        log.info({ annualExpenses, withdrawalRate }, 'Calculating FIRE number');

        const fire = calculateFIRENumber(annualExpenses, withdrawalRate);

        return [
          'Financial Independence Numbers:',
          '',
          `🎯 Your FIRE Number: $${fire.fireNumber.toLocaleString()}`,
          `   (Using ${withdrawalRate}% safe withdrawal rate)`,
          '',
          `🌱 Lean FIRE: $${fire.leanFIRE.toLocaleString()}`,
          '   (70% of current lifestyle - frugal but free)',
          '',
          `🚀 Fat FIRE: $${fire.fatFIRE.toLocaleString()}`,
          '   (150% of current lifestyle - live large)',
          '',
          '☕ Coast FIRE (stop contributing, let it grow):',
          `   • At age 30: Need $${fire.coastFIRE.age30.toLocaleString()} now`,
          `   • At age 40: Need $${fire.coastFIRE.age40.toLocaleString()} now`,
          `   • At age 50: Need $${fire.coastFIRE.age50.toLocaleString()} now`,
          '',
          'The beauty of FIRE: Once you hit your number, work becomes optional!',
        ].join('\n');
      },
    }),

    // PERSONAL FINANCE QUANT: Retirement Readiness
    retirementReadiness: llm.tool({
      description:
        'Calculate your retirement readiness score. Projects your savings at retirement, estimates years of retirement income, and gives personalized recommendations.',
      parameters: z.object({
        currentAge: z.number().describe('Your current age'),
        targetRetirementAge: z.number().describe('When you want to retire'),
        currentSavings: z.number().describe('Total retirement savings (401k, IRA, investments)'),
        monthlyContribution: z.number().describe('How much you save per month for retirement'),
        monthlyExpenses: z.number().describe('Your expected monthly expenses in retirement'),
        expectedReturn: z.number().optional().describe('Expected annual return (default 7%)'),
      }),
      execute: async ({
        currentAge,
        targetRetirementAge,
        currentSavings,
        monthlyContribution,
        monthlyExpenses,
        expectedReturn = 7,
      }) => {
        log.info({ currentAge, targetRetirementAge, currentSavings }, 'Calculating retirement readiness');

        const readiness = calculateRetirementReadiness(
          currentAge,
          targetRetirementAge,
          currentSavings,
          monthlyContribution,
          monthlyExpenses,
          expectedReturn
        );

        const scoreEmoji = readiness.score >= 100 ? '🎉' : readiness.score >= 80 ? '👍' : readiness.score >= 60 ? '📈' : '💪';

        return [
          'Retirement Readiness Analysis:',
          '',
          `${scoreEmoji} Readiness Score: ${readiness.score}/100`,
          '',
          `📊 Projected at age ${targetRetirementAge}: $${readiness.projectedAtRetirement.toLocaleString()}`,
          `📅 Years of retirement covered: ${readiness.yearsOfRetirement}`,
          `💰 Monthly income in retirement: $${readiness.monthlyIncomeInRetirement.toLocaleString()}`,
          `   (vs. $${monthlyExpenses.toLocaleString()} needed)`,
          '',
          `💡 ${readiness.recommendation}`,
          '',
          `Note: Assumes ${expectedReturn}% annual returns. Social Security not included!`,
        ].join('\n');
      },
    }),

    // COACHING QUANT: Behavioral Score
    behavioralScore: llm.tool({
      description:
        'Analyze your financial behavior patterns. Scores emotional control, discipline, and patience. Identifies strengths and areas for improvement.',
      parameters: z.object({
        panicSells: z.number().describe('Times you\'ve sold investments during market drops'),
        timingAttempts: z.number().describe('Times you\'ve tried to time the market'),
        impulsePurchases: z.number().describe('Unplanned large purchases in past year'),
        budgetAdherence: z.number().min(0).max(100).describe('How well you stick to budget (0-100)'),
        savingsConsistency: z.number().min(0).max(100).describe('How consistently you save (0-100)'),
        debtPaymentConsistency: z.number().min(0).max(100).describe('How consistently you pay debt (0-100)'),
      }),
      execute: async (behavior) => {
        log.info('Calculating behavioral score');

        const score = calculateBehavioralScore(behavior);

        const overallEmoji =
          score.overallScore >= 80 ? '🏆' : score.overallScore >= 60 ? '👍' : score.overallScore >= 40 ? '📈' : '💪';

        return [
          'Financial Behavior Analysis:',
          '',
          `${overallEmoji} Overall Score: ${score.overallScore}/100`,
          '',
          '📊 Component Scores:',
          `  • Emotional Control: ${score.emotionalControl}/100 ${score.emotionalControl >= 80 ? '✨' : ''}`,
          `  • Financial Discipline: ${score.discipline}/100 ${score.discipline >= 80 ? '✨' : ''}`,
          `  • Patience & Consistency: ${score.patience}/100 ${score.patience >= 80 ? '✨' : ''}`,
          '',
          '💪 Strengths:',
          ...score.strengths.map((s) => `  • ${s}`),
          '',
          '🎯 Areas to Improve:',
          ...score.improvements.map((i) => `  • ${i}`),
          '',
          'Remember: Behavior is the biggest factor in long-term wealth building!',
        ].join('\n');
      },
    }),

    // COACHING QUANT: Peer Comparison
    peerComparison: llm.tool({
      description:
        'See how you compare to others in your age group. Shows percentiles for savings rate, net worth, debt management, and emergency fund.',
      parameters: z.object({
        ageGroup: z.enum(['20s', '30s', '40s', '50s', '60s']).describe('Your age group'),
        savingsRate: z.number().describe('Your savings rate as percentage'),
        netWorth: z.number().describe('Your net worth (assets minus debts)'),
        debtToIncome: z.number().describe('Your debt-to-income ratio (e.g., 0.5 = 50%)'),
        emergencyFundMonths: z.number().describe('Months of expenses in emergency fund'),
      }),
      execute: async ({ ageGroup, savingsRate, netWorth, debtToIncome, emergencyFundMonths }) => {
        log.info({ ageGroup }, 'Calculating peer comparison');

        const comparison = calculatePeerComparison(
          { savingsRate, netWorth, debtToIncome, emergencyFundMonths },
          ageGroup
        );

        const percentileEmoji = (p: number) => (p >= 75 ? '🏆' : p >= 50 ? '👍' : p >= 25 ? '📈' : '💪');

        return [
          `Peer Comparison (vs. others in their ${ageGroup}):`,
          '',
          `🎯 Overall Percentile: ${comparison.overallPercentile}th`,
          '',
          '📊 Category Percentiles:',
          `  ${percentileEmoji(comparison.savingsRatePercentile)} Savings Rate: ${comparison.savingsRatePercentile}th percentile`,
          `  ${percentileEmoji(comparison.netWorthPercentile)} Net Worth: ${comparison.netWorthPercentile}th percentile`,
          `  ${percentileEmoji(comparison.debtPercentile)} Debt Management: ${comparison.debtPercentile}th percentile`,
          `  ${percentileEmoji(comparison.emergencyFundPercentile)} Emergency Fund: ${comparison.emergencyFundPercentile}th percentile`,
          '',
          '✨ Standout Areas:',
          ...comparison.standoutAreas.map((s) => `  • ${s}`),
          '',
          'Note: Based on Federal Reserve data. Comparison is just context - focus on your own progress!',
        ].join('\n');
      },
    }),
  };
}

// ============================================================================
// PERSISTENCE-BACKED TOOLS
// ============================================================================

/**
 * Create tools that integrate with Firestore persistence
 * These require userId from context
 */
export function createPersistentQuantTools() {
  return {
    // FINANCIAL PROFILE MANAGEMENT
    saveFinancialProfile: llm.tool({
      description:
        'Save or update your financial profile. Stores income, expenses, age, retirement goals, and risk tolerance for personalized analysis.',
      parameters: z.object({
        monthlyIncome: z.number().describe('Your monthly income'),
        monthlyExpenses: z.number().describe('Your monthly expenses'),
        currentAge: z.number().describe('Your current age'),
        targetRetirementAge: z.number().describe('When you want to retire'),
        currentRetirementSavings: z.number().describe('Current retirement savings'),
        riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).describe('Your risk tolerance'),
      }),
      execute: async (
        { monthlyIncome, monthlyExpenses, currentAge, targetRetirementAge, currentRetirementSavings, riskTolerance },
        { ctx }
      ) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to save your profile. Please try again.';

        const { getQuantFirestore } = await import('./quant-firestore.js');
        const firestore = getQuantFirestore();

        await firestore.saveFinancialProfile({
          userId,
          monthlyIncome,
          monthlyExpenses,
          monthlyDebtPayments: 0,
          emergencyFundMonths: 0,
          retirementContribution: 0,
          currentAge,
          targetRetirementAge,
          currentRetirementSavings,
          riskTolerance,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const savingsRate = ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;

        return [
          '✅ Financial profile saved!',
          '',
          '📊 Your Profile Summary:',
          `• Monthly Income: $${monthlyIncome.toLocaleString()}`,
          `• Monthly Expenses: $${monthlyExpenses.toLocaleString()}`,
          `• Savings Rate: ${savingsRate.toFixed(1)}%`,
          `• Current Age: ${currentAge}`,
          `• Target Retirement: ${targetRetirementAge}`,
          `• Retirement Savings: $${currentRetirementSavings.toLocaleString()}`,
          `• Risk Tolerance: ${riskTolerance}`,
          '',
          "Now I can give you personalized insights and track your progress over time!",
        ].join('\n');
      },
    }),

    // PORTFOLIO MANAGEMENT
    addToPortfolio: llm.tool({
      description: 'Add a stock or fund holding to your tracked portfolio.',
      parameters: z.object({
        symbol: z.string().describe('Stock/fund ticker symbol (e.g., AAPL, VTI)'),
        shares: z.number().describe('Number of shares'),
        costBasis: z.number().describe('Total cost basis (what you paid)'),
        accountType: z.enum(['taxable', 'ira', '401k', 'roth', 'other']).describe('Type of account'),
      }),
      execute: async ({ symbol, shares, costBasis, accountType }, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to track your portfolio.';

        const { getQuantFirestore } = await import('./quant-firestore.js');
        const firestore = getQuantFirestore();

        await firestore.addHolding(userId, {
          symbol: symbol.toUpperCase(),
          shares,
          costBasis,
          purchaseDate: new Date(),
          accountType,
        });

        const avgPrice = costBasis / shares;

        return [
          `✅ Added ${symbol.toUpperCase()} to your portfolio!`,
          '',
          `📈 Holding Details:`,
          `• Shares: ${shares}`,
          `• Cost Basis: $${costBasis.toLocaleString()}`,
          `• Average Price: $${avgPrice.toFixed(2)}`,
          `• Account: ${accountType.toUpperCase()}`,
          '',
          'I can now track this position and alert you to opportunities or risks.',
        ].join('\n');
      },
    }),

    viewPortfolio: llm.tool({
      description: 'View your tracked portfolio holdings.',
      parameters: z.object({}),
      execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to show your portfolio.';

        const { getQuantFirestore } = await import('./quant-firestore.js');
        const firestore = getQuantFirestore();

        const portfolio = await firestore.loadPortfolio(userId);

        if (!portfolio || portfolio.holdings.length === 0) {
          return "You haven't added any holdings yet. Use addToPortfolio to start tracking your investments!";
        }

        const byAccount = new Map<string, typeof portfolio.holdings>();
        for (const h of portfolio.holdings) {
          const account = h.accountType || 'other';
          if (!byAccount.has(account)) byAccount.set(account, []);
          byAccount.get(account)!.push(h);
        }

        const lines = ['📊 Your Portfolio:', ''];

        for (const [account, holdings] of byAccount) {
          lines.push(`**${account.toUpperCase()} Account:**`);
          for (const h of holdings) {
            const avgPrice = h.costBasis / h.shares;
            lines.push(`  • ${h.symbol}: ${h.shares} shares @ $${avgPrice.toFixed(2)} avg ($${h.costBasis.toLocaleString()} basis)`);
          }
          lines.push('');
        }

        const totalBasis = portfolio.holdings.reduce((sum, h) => sum + h.costBasis, 0);
        lines.push(`💰 Total Cost Basis: $${totalBasis.toLocaleString()}`);

        return lines.join('\n');
      },
    }),

    // DAILY BRIEFING
    getDailyBriefing: llm.tool({
      description: 'Get your personalized daily financial briefing with market updates, portfolio insights, and action items.',
      parameters: z.object({}),
      execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to generate your briefing.';

        const { generateDailyBriefing, formatBriefingForSpeech } = await import('./proactive-quant-insights.js');

        const briefing = await generateDailyBriefing(userId);
        return formatBriefingForSpeech(briefing);
      },
    }),

    // BEHAVIORAL TRACKING
    recordBehavior: llm.tool({
      description: 'Record a financial behavior for tracking. Use this when you notice yourself making emotional or impulsive financial decisions.',
      parameters: z.object({
        type: z.enum(['panicSell', 'timingAttempt', 'impulsePurchase']).describe('Type of behavior'),
        description: z.string().describe('What happened'),
        amount: z.number().optional().describe('Amount involved if applicable'),
      }),
      execute: async ({ type, description, amount }, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to track this.';

        const { getQuantFirestore } = await import('./quant-firestore.js');
        const firestore = getQuantFirestore();

        await firestore.recordBehaviorEvent(userId, type, { description, amount });

        const messages: Record<string, string[]> = {
          panicSell: [
            '📝 Panic sell recorded.',
            '',
            "First: it's okay. We all feel the urge to sell when markets drop.",
            '',
            '💡 Studies show panic sellers miss the best recovery days.',
            'The average investor underperforms by 1.5% annually due to emotional decisions.',
            '',
            "Let's talk about what triggered this - understanding the pattern helps prevent future ones.",
          ],
          timingAttempt: [
            '📝 Market timing attempt recorded.',
            '',
            "Trying to time the market is tempting but rarely works.",
            '',
            "💡 Time in the market > timing the market.",
            "Even missing the 10 best days over 20 years cuts returns in half.",
            '',
            "What made you think now was a good time to time? Let's examine the reasoning.",
          ],
          impulsePurchase: [
            '📝 Impulse purchase recorded.',
            '',
            'Good awareness! Recognizing impulse purchases is the first step.',
            '',
            '💡 Try the 24-hour rule: Wait a day before unplanned big purchases.',
            '',
            'What triggered this purchase? Understanding your patterns helps build discipline.',
          ],
        };

        return messages[type].join('\n');
      },
    }),

    // FIRE PROGRESS SNAPSHOT
    recordFIREProgress: llm.tool({
      description: 'Record your current FIRE progress for tracking over time.',
      parameters: z.object({
        netWorth: z.number().describe('Your current total net worth'),
        monthlyPassiveIncome: z.number().optional().describe('Monthly passive income if any'),
      }),
      execute: async ({ netWorth, monthlyPassiveIncome = 0 }, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId) return 'I need to know who you are to track your progress.';

        const quantFirestoreModule = await import('./quant-firestore.js');
        const firestore = quantFirestoreModule.getQuantFirestore();

        // Load profile to calculate FIRE numbers
        const profile = await firestore.loadFinancialProfile(userId);
        if (!profile) {
          return 'Please save your financial profile first so I can calculate your FIRE progress!';
        }

        const annualExpenses = profile.monthlyExpenses * 12;
        const fireNumber = annualExpenses * 25; // 4% rule
        const percentToFire = (netWorth / fireNumber) * 100;
        const savingsRate = ((profile.monthlyIncome - profile.monthlyExpenses) / profile.monthlyIncome) * 100;

        // Calculate projected FIRE date
        let projectedFireDate: Date | null = null;
        if (percentToFire < 100 && savingsRate > 0) {
          const monthlyNet = profile.monthlyIncome - profile.monthlyExpenses;
          const remaining = fireNumber - netWorth;
          const monthsToFire = remaining / (monthlyNet * 1.005); // Rough estimate with growth
          projectedFireDate = new Date(Date.now() + monthsToFire * 30 * 24 * 60 * 60 * 1000);
        }

        const snapshot = {
          date: new Date(),
          netWorth,
          fireNumber,
          percentToFire,
          projectedFireDate,
          savingsRate,
          monthlyPassiveIncome,
        };

        await firestore.saveFIRESnapshot(userId, snapshot);

        const previousSnapshot = await firestore.getLatestFIRESnapshot(userId);
        let progressMessage = '';
        if (previousSnapshot) {
          const change = percentToFire - previousSnapshot.percentToFire;
          if (change > 0) {
            progressMessage = `📈 Up ${change.toFixed(1)}% since last snapshot!`;
          } else if (change < 0) {
            progressMessage = `Market volatility - down ${Math.abs(change).toFixed(1)}% (normal!)`;
          }
        }

        const progressEmoji = percentToFire >= 100 ? '🎉' : percentToFire >= 75 ? '🔥' : percentToFire >= 50 ? '🚀' : percentToFire >= 25 ? '💪' : '🌱';

        return [
          '✅ FIRE Progress Recorded!',
          '',
          `${progressEmoji} ${percentToFire.toFixed(1)}% to FIRE`,
          progressMessage,
          '',
          '📊 Snapshot:',
          `• Net Worth: $${netWorth.toLocaleString()}`,
          `• FIRE Number: $${fireNumber.toLocaleString()}`,
          `• Savings Rate: ${savingsRate.toFixed(1)}%`,
          projectedFireDate ? `• Projected FIRE: ${projectedFireDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}` : '',
          '',
          "I'll track your progress and celebrate milestones with you!",
        ].filter(Boolean).join('\n');
      },
    }),
  };
}

/**
 * Helper to extract userId from LiveKit context
 */
function getUserIdFromContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== 'object') return null;
  
  // Try different context patterns
  if ('userId' in ctx && typeof (ctx as Record<string, unknown>).userId === 'string') {
    return (ctx as Record<string, unknown>).userId as string;
  }
  
  if ('room' in ctx && typeof ctx === 'object') {
    const room = (ctx as Record<string, unknown>).room;
    if (room && typeof room === 'object' && 'name' in room) {
      // Room name often contains userId
      return String((room as Record<string, unknown>).name);
    }
  }

  return null;
}

export default createQuantTools;

