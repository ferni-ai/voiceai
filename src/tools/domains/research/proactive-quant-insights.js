/**
 * Proactive Quant Insights System
 *
 * Generates and delivers automated insights for Peter's quant tools:
 * - Daily market briefings
 * - Portfolio alerts (RSI overbought, etc.)
 * - FIRE milestone celebrations
 * - Behavioral pattern recognition
 * - Economic indicator alerts
 *
 * @module tools/domains/research/proactive-quant-insights
 */
import { getLogger } from '../../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getQuantFirestore, } from './quant-firestore.js';
import { getCompanyFundamentals, getEconomicDashboard } from './external-apis.js';
const log = getLogger();
// ============================================================================
// INSIGHT GENERATORS
// ============================================================================
/**
 * Generate insights for a user's portfolio
 */
export async function generatePortfolioInsights(userId, portfolio) {
    const insights = [];
    const firestore = getQuantFirestore();
    for (const holding of portfolio.holdings) {
        try {
            const fundamentals = await getCompanyFundamentals(holding.symbol);
            if (!fundamentals)
                continue;
            // Check for oversold/overbought based on P/E vs historical
            if (fundamentals.peRatio > 0) {
                if (fundamentals.peRatio > 40) {
                    insights.push({
                        id: uuidv4(),
                        date: new Date(),
                        type: 'portfolio',
                        title: `${holding.symbol} May Be Overvalued`,
                        summary: `P/E ratio of ${fundamentals.peRatio.toFixed(1)} is significantly above market average`,
                        details: `${holding.symbol} is trading at a P/E of ${fundamentals.peRatio.toFixed(1)}, which is well above the S&P 500 average of ~25. This could indicate the stock is pricing in significant growth expectations. Consider whether the growth story still supports this valuation.`,
                        actionable: true,
                        priority: 'medium',
                        symbols: [holding.symbol],
                        metrics: { peRatio: fundamentals.peRatio },
                        acknowledged: false,
                    });
                }
                // Check if trading near 52-week low
                const currentPrice = fundamentals.fiftyTwoWeekLow * 1.05; // Approximate
                const lowDistance = (currentPrice - fundamentals.fiftyTwoWeekLow) / fundamentals.fiftyTwoWeekLow;
                if (lowDistance < 0.1 && fundamentals.peRatio < 20) {
                    insights.push({
                        id: uuidv4(),
                        date: new Date(),
                        type: 'portfolio',
                        title: `${holding.symbol} Near 52-Week Low`,
                        summary: `Trading within 10% of 52-week low with reasonable valuation`,
                        details: `${holding.symbol} is near its 52-week low of $${fundamentals.fiftyTwoWeekLow.toFixed(2)} with a P/E of ${fundamentals.peRatio.toFixed(1)}. This could be a value opportunity - or a sign of trouble. Worth investigating the story.`,
                        actionable: true,
                        priority: 'medium',
                        symbols: [holding.symbol],
                        metrics: {
                            fiftyTwoWeekLow: fundamentals.fiftyTwoWeekLow,
                            peRatio: fundamentals.peRatio,
                        },
                        acknowledged: false,
                    });
                }
            }
            // Check dividend changes
            if (holding.accountType !== '401k' && fundamentals.dividendYield > 0.04) {
                insights.push({
                    id: uuidv4(),
                    date: new Date(),
                    type: 'portfolio',
                    title: `${holding.symbol} High Dividend Alert`,
                    summary: `${(fundamentals.dividendYield * 100).toFixed(1)}% yield - unusually high`,
                    details: `${holding.symbol} has a dividend yield of ${(fundamentals.dividendYield * 100).toFixed(1)}%, which is above 4%. Very high yields can indicate a stock price drop or potential dividend cut. Verify the dividend is sustainable.`,
                    actionable: true,
                    priority: 'low',
                    symbols: [holding.symbol],
                    metrics: { dividendYield: fundamentals.dividendYield },
                    acknowledged: false,
                });
            }
        }
        catch (error) {
            log.error({ error: String(error), symbol: holding.symbol }, 'Failed to generate portfolio insight');
        }
    }
    // Save insights to Firestore
    for (const insight of insights) {
        await firestore.saveInsight(userId, insight);
    }
    return insights;
}
/**
 * Generate behavioral insights based on tracking data
 */
export async function generateBehavioralInsights(userId, tracking) {
    const insights = [];
    const firestore = getQuantFirestore();
    // Check emotional control score
    if (tracking.currentEmotionalControlScore < 70) {
        insights.push({
            id: uuidv4(),
            date: new Date(),
            type: 'behavioral',
            title: 'Emotional Control Alert',
            summary: 'Recent emotional decisions detected in your investing',
            details: `Your emotional control score has dropped to ${tracking.currentEmotionalControlScore}/100. This is often caused by panic selling or market timing attempts. Remember: time in the market beats timing the market. Let's work on staying the course.`,
            actionable: true,
            priority: 'high',
            metrics: { emotionalControlScore: tracking.currentEmotionalControlScore },
            acknowledged: false,
        });
    }
    // Check discipline score
    if (tracking.currentDisciplineScore < 60) {
        insights.push({
            id: uuidv4(),
            date: new Date(),
            type: 'behavioral',
            title: 'Financial Discipline Dip',
            summary: 'Budget adherence and savings consistency have room for improvement',
            details: `Your discipline score is ${tracking.currentDisciplineScore}/100. Small improvements in budget adherence and consistent saving can compound into huge differences over time. Consider automating your savings.`,
            actionable: true,
            priority: 'medium',
            metrics: { disciplineScore: tracking.currentDisciplineScore },
            acknowledged: false,
        });
    }
    // Celebrate streaks
    const recentBudget = tracking.budgetAdherence.slice(-3);
    if (recentBudget.length === 3 && recentBudget.every((m) => m.value >= 90)) {
        insights.push({
            id: uuidv4(),
            date: new Date(),
            type: 'behavioral',
            title: '🎉 Budget Champion!',
            summary: '3 months of excellent budget adherence!',
            details: `You've maintained 90%+ budget adherence for three consecutive months! This discipline is the foundation of financial freedom. Keep it up!`,
            actionable: false,
            priority: 'low',
            metrics: { streakMonths: 3 },
            acknowledged: false,
        });
    }
    // Check for panic sell recovery
    const recentPanicSells = tracking.panicSells.filter((e) => new Date(e.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    if (recentPanicSells.length === 0 && tracking.panicSells.length > 0) {
        insights.push({
            id: uuidv4(),
            date: new Date(),
            type: 'behavioral',
            title: '💪 90 Days No Panic Selling!',
            summary: "You haven't panic sold in over 3 months",
            details: `Great progress! You haven't made any panic-driven investment decisions in over 90 days. This emotional discipline is what separates successful long-term investors from the crowd.`,
            actionable: false,
            priority: 'low',
            acknowledged: false,
        });
    }
    // Save insights
    for (const insight of insights) {
        await firestore.saveInsight(userId, insight);
    }
    return insights;
}
/**
 * Generate FIRE milestone insights
 */
export async function generateFIREInsights(userId, profile, currentSnapshot, previousSnapshot) {
    const insights = [];
    const firestore = getQuantFirestore();
    // Check milestone achievements
    const milestones = [10, 25, 50, 75, 90, 100];
    for (const milestone of milestones) {
        if (currentSnapshot.percentToFire >= milestone) {
            const previouslyAchieved = previousSnapshot && previousSnapshot.percentToFire >= milestone;
            if (!previouslyAchieved) {
                insights.push({
                    id: uuidv4(),
                    date: new Date(),
                    type: 'fire',
                    title: `🔥 FIRE Milestone: ${milestone}%!`,
                    summary: `You've reached ${milestone}% of your FIRE number!`,
                    details: milestone === 100
                        ? `🎉 CONGRATULATIONS! You've achieved Financial Independence! Your net worth of $${currentSnapshot.netWorth.toLocaleString()} exceeds your FIRE number of $${currentSnapshot.fireNumber.toLocaleString()}. You now have the freedom to choose.`
                        : `You're ${milestone}% of the way to FIRE! Your current net worth is $${currentSnapshot.netWorth.toLocaleString()} toward your goal of $${currentSnapshot.fireNumber.toLocaleString()}. Keep going!`,
                    actionable: false,
                    priority: milestone >= 90 ? 'high' : 'medium',
                    metrics: {
                        percentToFire: currentSnapshot.percentToFire,
                        netWorth: currentSnapshot.netWorth,
                        fireNumber: currentSnapshot.fireNumber,
                    },
                    acknowledged: false,
                });
            }
        }
    }
    // Check savings rate changes
    if (previousSnapshot) {
        const rateChange = currentSnapshot.savingsRate - previousSnapshot.savingsRate;
        if (rateChange >= 5) {
            insights.push({
                id: uuidv4(),
                date: new Date(),
                type: 'fire',
                title: '📈 Savings Rate Increase!',
                summary: `Your savings rate jumped ${rateChange.toFixed(1)}%`,
                details: `Your savings rate increased from ${previousSnapshot.savingsRate.toFixed(1)}% to ${currentSnapshot.savingsRate.toFixed(1)}%. This kind of improvement can shave years off your FIRE timeline!`,
                actionable: false,
                priority: 'low',
                metrics: {
                    previousSavingsRate: previousSnapshot.savingsRate,
                    currentSavingsRate: currentSnapshot.savingsRate,
                },
                acknowledged: false,
            });
        }
        else if (rateChange <= -5) {
            insights.push({
                id: uuidv4(),
                date: new Date(),
                type: 'fire',
                title: '⚠️ Savings Rate Alert',
                summary: `Your savings rate dropped ${Math.abs(rateChange).toFixed(1)}%`,
                details: `Your savings rate decreased from ${previousSnapshot.savingsRate.toFixed(1)}% to ${currentSnapshot.savingsRate.toFixed(1)}%. Life happens, but let's check if this is temporary or if we need to adjust.`,
                actionable: true,
                priority: 'medium',
                metrics: {
                    previousSavingsRate: previousSnapshot.savingsRate,
                    currentSavingsRate: currentSnapshot.savingsRate,
                },
                acknowledged: false,
            });
        }
    }
    // Save insights
    for (const insight of insights) {
        await firestore.saveInsight(userId, insight);
    }
    return insights;
}
/**
 * Generate economic condition insights
 */
export async function generateEconomicInsights(userId) {
    const insights = [];
    const firestore = getQuantFirestore();
    try {
        const { yieldCurve } = await getEconomicDashboard();
        // Yield curve inversion alert
        if (yieldCurve.status === 'inverted') {
            insights.push({
                id: uuidv4(),
                date: new Date(),
                type: 'market',
                title: '⚠️ Yield Curve Inverted',
                summary: 'Historical recession indicator is flashing',
                details: `The yield curve (10Y-2Y spread) is inverted at ${yieldCurve.spread.toFixed(2)}%. Historically, yield curve inversions have preceded recessions by 6-18 months. This doesn't mean panic - it means be thoughtful about risk and have cash reserves ready.`,
                actionable: true,
                priority: 'high',
                metrics: { yieldSpread: yieldCurve.spread },
                acknowledged: false,
            });
        }
        // Save insights
        for (const insight of insights) {
            await firestore.saveInsight(userId, insight);
        }
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to generate economic insights');
    }
    return insights;
}
// ============================================================================
// DAILY BRIEFING GENERATOR
// ============================================================================
/**
 * Generate comprehensive daily briefing
 */
export async function generateDailyBriefing(userId) {
    const firestore = getQuantFirestore();
    const [profile, portfolio, behavioral, fireHistory, economicDashboard] = await Promise.all([
        firestore.loadFinancialProfile(userId),
        firestore.loadPortfolio(userId),
        firestore.loadBehavioralTracking(userId),
        firestore.loadFIREHistory(userId, 2),
        getEconomicDashboard(),
    ]);
    const briefing = {
        date: new Date(),
        marketSummary: economicDashboard.summary,
        portfolioHighlights: [],
        economicAlerts: [],
        behavioralCoaching: [],
        fireProgress: null,
        actionItems: [],
    };
    // Portfolio highlights
    if (portfolio && portfolio.holdings.length > 0) {
        briefing.portfolioHighlights.push(`You're tracking ${portfolio.holdings.length} holdings`);
        const totalCostBasis = portfolio.holdings.reduce((sum, h) => sum + h.costBasis, 0);
        briefing.portfolioHighlights.push(`Total cost basis: $${totalCostBasis.toLocaleString()}`);
    }
    // Economic alerts
    if (economicDashboard.yieldCurve.status === 'inverted') {
        briefing.economicAlerts.push('⚠️ Yield curve remains inverted');
    }
    // Behavioral coaching
    if (behavioral) {
        if (behavioral.currentEmotionalControlScore >= 90) {
            briefing.behavioralCoaching.push('💪 Your emotional discipline is excellent!');
        }
        else if (behavioral.currentEmotionalControlScore < 70) {
            briefing.behavioralCoaching.push('Focus on staying calm during market volatility');
        }
        if (behavioral.currentDisciplineScore >= 90) {
            briefing.behavioralCoaching.push('🎯 Financial discipline on point!');
        }
    }
    // FIRE progress
    if (fireHistory.length > 0) {
        const latest = fireHistory[0];
        briefing.fireProgress = `${latest.percentToFire.toFixed(1)}% to FIRE ($${latest.netWorth.toLocaleString()} / $${latest.fireNumber.toLocaleString()})`;
        if (fireHistory.length > 1) {
            const previous = fireHistory[1];
            const progress = latest.percentToFire - previous.percentToFire;
            if (progress > 0) {
                briefing.fireProgress += ` (+${progress.toFixed(1)}% since last snapshot)`;
            }
        }
    }
    // Action items from insights
    const actionableInsights = await firestore.getActionableInsights(userId);
    briefing.actionItems = actionableInsights
        .filter((i) => i.priority === 'high')
        .map((i) => i.title);
    return briefing;
}
/**
 * Format daily briefing as speech
 */
export function formatBriefingForSpeech(briefing) {
    const lines = [];
    lines.push(`Good ${getTimeOfDay()}! Here's your daily financial briefing.\n`);
    if (briefing.fireProgress) {
        lines.push(`**FIRE Progress:** ${briefing.fireProgress}\n`);
    }
    if (briefing.portfolioHighlights.length > 0) {
        lines.push('**Portfolio:**');
        briefing.portfolioHighlights.forEach((h) => lines.push(`• ${h}`));
        lines.push('');
    }
    if (briefing.economicAlerts.length > 0) {
        lines.push('**Economic Alerts:**');
        briefing.economicAlerts.forEach((a) => lines.push(`• ${a}`));
        lines.push('');
    }
    if (briefing.behavioralCoaching.length > 0) {
        lines.push('**Behavioral Notes:**');
        briefing.behavioralCoaching.forEach((c) => lines.push(`• ${c}`));
        lines.push('');
    }
    if (briefing.actionItems.length > 0) {
        lines.push('**Action Items:**');
        briefing.actionItems.forEach((a) => lines.push(`• ${a}`));
        lines.push('');
    }
    lines.push('_Remember: Long-term thinking beats short-term noise._');
    return lines.join('\n');
}
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'morning';
    if (hour < 17)
        return 'afternoon';
    return 'evening';
}
// ============================================================================
// SCHEDULED INSIGHT GENERATION
// ============================================================================
/**
 * Run all insight generators for a user
 */
export async function generateAllInsights(userId) {
    const firestore = getQuantFirestore();
    const allInsights = [];
    const errors = [];
    try {
        // Load user data
        const [profile, portfolio, behavioral, fireHistory] = await Promise.all([
            firestore.loadFinancialProfile(userId),
            firestore.loadPortfolio(userId),
            firestore.loadBehavioralTracking(userId),
            firestore.loadFIREHistory(userId, 2),
        ]);
        // Generate portfolio insights
        if (portfolio && portfolio.holdings.length > 0) {
            try {
                const insights = await generatePortfolioInsights(userId, portfolio);
                allInsights.push(...insights);
            }
            catch (error) {
                errors.push(`Portfolio insights: ${String(error)}`);
            }
        }
        // Generate behavioral insights
        if (behavioral) {
            try {
                const insights = await generateBehavioralInsights(userId, behavioral);
                allInsights.push(...insights);
            }
            catch (error) {
                errors.push(`Behavioral insights: ${String(error)}`);
            }
        }
        // Generate FIRE insights
        if (profile && fireHistory.length > 0) {
            try {
                const insights = await generateFIREInsights(userId, profile, fireHistory[0], fireHistory[1] || null);
                allInsights.push(...insights);
            }
            catch (error) {
                errors.push(`FIRE insights: ${String(error)}`);
            }
        }
        // Generate economic insights
        try {
            const insights = await generateEconomicInsights(userId);
            allInsights.push(...insights);
        }
        catch (error) {
            errors.push(`Economic insights: ${String(error)}`);
        }
        log.info({
            userId,
            insightsGenerated: allInsights.length,
            errorCount: errors.length,
        }, 'Completed insight generation');
    }
    catch (error) {
        errors.push(`General error: ${String(error)}`);
        log.error({ error: String(error), userId }, 'Failed to generate insights');
    }
    return {
        generated: allInsights,
        errors,
    };
}
// Note: All functions are exported inline with `export async function`
//# sourceMappingURL=proactive-quant-insights.js.map