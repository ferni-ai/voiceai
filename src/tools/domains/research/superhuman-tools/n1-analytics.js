/**
 * N=1 Personal Analytics Tools
 *
 * These tools track and analyze personal data that no human could
 * consistently track about themselves. The ultimate self-quantification.
 *
 * "Better than Human" because: Humans can't objectively track 50+ variables
 * across years and find the correlations that matter.
 *
 * @module tools/domains/research/superhuman-tools/n1-analytics
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getUserIdFromContext, saveDecision, loadDecisions, updateDecision, saveSleepData, loadSleepData, saveEnergyData, loadEnergyData, } from './firestore-persistence.js';
const log = getLogger();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3)
        return 0;
    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);
    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;
    let numerator = 0;
    let xDenom = 0;
    let yDenom = 0;
    for (let i = 0; i < n; i++) {
        const xDiff = xSlice[i] - xMean;
        const yDiff = ySlice[i] - yMean;
        numerator += xDiff * yDiff;
        xDenom += xDiff * xDiff;
        yDenom += yDiff * yDiff;
    }
    const denominator = Math.sqrt(xDenom * yDenom);
    return denominator === 0 ? 0 : numerator / denominator;
}
function getDayName(dayIndex) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
}
// ============================================================================
// DECISION QUALITY BACKTESTER
// ============================================================================
export const recordDecision = llm.tool({
    description: 'Record a decision you made. Peter will track patterns to show you when you make your best and worst decisions.',
    parameters: z.object({
        decision: z.string().describe('What decision did you make?'),
        domain: z
            .enum(['financial', 'career', 'health', 'relationship', 'habit', 'purchase', 'other'])
            .describe('What area of life?'),
        sleepHours: z.number().optional().describe('Hours of sleep last night'),
        stressLevel: z.number().min(1).max(10).optional().describe('Current stress 1-10'),
        energyLevel: z.number().min(1).max(10).optional().describe('Current energy 1-10'),
        tags: z.array(z.string()).optional().describe('Tags for this decision'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are to track this.';
        const now = new Date();
        const record = {
            id: `dec_${Date.now()}`,
            userId,
            timestamp: now,
            decision: params.decision,
            domain: params.domain,
            context: {
                timeOfDay: now.getHours(),
                dayOfWeek: now.getDay(),
                sleepHours: params.sleepHours,
                stressLevel: params.stressLevel,
                energyLevel: params.energyLevel,
            },
            tags: params.tags || [],
        };
        try {
            await saveDecision(userId, record);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to save decision');
            return 'Had trouble saving that decision. Try again?';
        }
        log.info({ userId, domain: params.domain }, '📝 Decision recorded for quality tracking');
        return [
            `✅ Decision recorded!`,
            '',
            `📝 "${params.decision}"`,
            `🏷️ Domain: ${params.domain}`,
            `⏰ Time: ${now.toLocaleTimeString()} (${getDayName(now.getDay())})`,
            params.sleepHours ? `😴 Sleep: ${params.sleepHours} hours` : '',
            params.stressLevel ? `😰 Stress: ${params.stressLevel}/10` : '',
            params.energyLevel ? `⚡ Energy: ${params.energyLevel}/10` : '',
            '',
            "I'll track this. Come back later to record the outcome!",
            '',
            `**Pro tip:** After a few days, tell me if you reversed this decision or how satisfied you are with it.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
export const recordDecisionOutcome = llm.tool({
    description: 'Record the outcome of a past decision. This helps Peter learn when you make your best decisions.',
    parameters: z.object({
        decisionKeywords: z.string().describe('Keywords to find the decision'),
        wasReversed: z.boolean().describe('Did you reverse or regret this decision?'),
        satisfaction: z.number().min(1).max(10).describe('How satisfied are you? 1-10'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let userDecisions;
        try {
            userDecisions = await loadDecisions(userId);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to load decisions');
            return 'Had trouble loading your decisions. Try again?';
        }
        const keywords = params.decisionKeywords.toLowerCase().split(' ');
        // Find matching decision
        const matchingDecision = userDecisions.find((d) => keywords.some((k) => d.decision.toLowerCase().includes(k)));
        if (!matchingDecision) {
            return `I couldn't find a decision matching "${params.decisionKeywords}". Recent decisions: ${userDecisions
                .slice(-5)
                .map((d) => `"${d.decision.slice(0, 30)}..."`)
                .join(', ')}`;
        }
        const daysSince = Math.floor((Date.now() - new Date(matchingDecision.timestamp).getTime()) / (1000 * 60 * 60 * 24));
        matchingDecision.outcome = {
            wasReversed: params.wasReversed,
            reversedWithin: params.wasReversed ? daysSince : undefined,
            satisfaction: params.satisfaction,
            recordedAt: new Date(),
        };
        try {
            await updateDecision(userId, matchingDecision.id, { outcome: matchingDecision.outcome });
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to update decision outcome');
        }
        const emoji = params.satisfaction >= 7 ? '🎉' : params.satisfaction >= 4 ? '👍' : '📝';
        const timestamp = new Date(matchingDecision.timestamp);
        return [
            `${emoji} Outcome recorded!`,
            '',
            `📝 Decision: "${matchingDecision.decision}"`,
            `📅 Made: ${timestamp.toLocaleDateString()} (${daysSince} days ago)`,
            `${params.wasReversed ? '🔄 Reversed' : '✅ Held firm'}`,
            `⭐ Satisfaction: ${params.satisfaction}/10`,
            '',
            `**Context when you decided:**`,
            `• Time: ${matchingDecision.context.timeOfDay}:00 (${getDayName(matchingDecision.context.dayOfWeek)})`,
            matchingDecision.context.sleepHours
                ? `• Sleep: ${matchingDecision.context.sleepHours} hours`
                : '',
            matchingDecision.context.stressLevel
                ? `• Stress: ${matchingDecision.context.stressLevel}/10`
                : '',
            '',
            'This data helps me find your best decision-making conditions!',
        ]
            .filter(Boolean)
            .join('\n');
    },
});
export const analyzeDecisionQuality = llm.tool({
    description: "Analyze patterns in your decision quality. Find out WHEN you make your best decisions - time of day, day of week, sleep levels, etc. This is something no human friend could track for you.",
    parameters: z.object({
        domain: z
            .enum(['financial', 'career', 'health', 'relationship', 'habit', 'purchase', 'all'])
            .default('all')
            .describe('Which domain to analyze'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let userDecisions;
        try {
            userDecisions = await loadDecisions(userId);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to load decisions');
            return 'Had trouble loading your decisions. Try again?';
        }
        const decisionsWithOutcomes = userDecisions.filter((d) => d.outcome);
        if (decisionsWithOutcomes.length < 5) {
            return [
                `📊 Need more data for pattern analysis`,
                '',
                `You have ${decisionsWithOutcomes.length} decisions with recorded outcomes.`,
                `I need at least 5 to find meaningful patterns.`,
                '',
                `**To build your decision quality profile:**`,
                `1. Record decisions as you make them`,
                `2. Come back after a few days to record outcomes`,
                `3. Once you have 10+ decisions, I can find YOUR patterns`,
                '',
                `**What I'll eventually tell you:**`,
                `• Best time of day for decisions`,
                `• Best day of week`,
                `• How sleep affects your decisions`,
                `• How stress affects your decisions`,
                `• Your reversal rate by domain`,
            ].join('\n');
        }
        const filtered = params.domain === 'all'
            ? decisionsWithOutcomes
            : decisionsWithOutcomes.filter((d) => d.domain === params.domain);
        // Calculate patterns
        const byHour = {};
        const byDay = {};
        for (const d of filtered) {
            const hour = d.context.timeOfDay;
            const day = d.context.dayOfWeek;
            if (!byHour[hour])
                byHour[hour] = { total: 0, satisfaction: 0, reversals: 0 };
            if (!byDay[day])
                byDay[day] = { total: 0, satisfaction: 0, reversals: 0 };
            byHour[hour].total++;
            byHour[hour].satisfaction += d.outcome.satisfaction || 0;
            byHour[hour].reversals += d.outcome.wasReversed ? 1 : 0;
            byDay[day].total++;
            byDay[day].satisfaction += d.outcome.satisfaction || 0;
            byDay[day].reversals += d.outcome.wasReversed ? 1 : 0;
        }
        // Find best/worst times
        let bestHour = 9, worstHour = 15, bestHourQuality = 0, worstHourQuality = 10;
        for (const [hourStr, data] of Object.entries(byHour)) {
            if (data.total < 2)
                continue;
            const avgSat = data.satisfaction / data.total;
            if (avgSat > bestHourQuality) {
                bestHourQuality = avgSat;
                bestHour = parseInt(hourStr);
            }
            if (avgSat < worstHourQuality) {
                worstHourQuality = avgSat;
                worstHour = parseInt(hourStr);
            }
        }
        let bestDay = 1, worstDay = 5, bestDayQuality = 0, worstDayQuality = 10;
        for (const [dayStr, data] of Object.entries(byDay)) {
            if (data.total < 2)
                continue;
            const avgSat = data.satisfaction / data.total;
            if (avgSat > bestDayQuality) {
                bestDayQuality = avgSat;
                bestDay = parseInt(dayStr);
            }
            if (avgSat < worstDayQuality) {
                worstDayQuality = avgSat;
                worstDay = parseInt(dayStr);
            }
        }
        const totalReversals = filtered.filter((d) => d.outcome?.wasReversed).length;
        const reversalRate = (totalReversals / filtered.length) * 100;
        const avgSatisfaction = filtered.reduce((sum, d) => sum + (d.outcome?.satisfaction || 0), 0) / filtered.length;
        // Sleep correlation
        const withSleep = filtered.filter((d) => d.context.sleepHours && d.outcome?.satisfaction);
        let sleepInsight = '';
        if (withSleep.length >= 5) {
            const sleepHours = withSleep.map((d) => d.context.sleepHours);
            const satisfaction = withSleep.map((d) => d.outcome.satisfaction);
            const correlation = calculateCorrelation(sleepHours, satisfaction);
            if (Math.abs(correlation) > 0.3) {
                sleepInsight =
                    correlation > 0
                        ? `💡 More sleep = better decisions (correlation: ${(correlation * 100).toFixed(0)}%)`
                        : `⚠️ Interestingly, you seem to decide better when tired`;
            }
        }
        log.info({ userId, decisions: filtered.length }, '🔬 Decision quality analysis complete');
        return [
            `🧠 **YOUR DECISION QUALITY ANALYSIS**`,
            `Based on ${filtered.length} decisions with outcomes`,
            '',
            `═══════════════════════════════════`,
            `📊 **OVERALL METRICS**`,
            `═══════════════════════════════════`,
            `• Reversal Rate: ${reversalRate.toFixed(1)}%`,
            `• Average Satisfaction: ${avgSatisfaction.toFixed(1)}/10`,
            '',
            `═══════════════════════════════════`,
            `⏰ **TIMING PATTERNS**`,
            `═══════════════════════════════════`,
            ``,
            `🟢 **Best Time:** ${bestHour}:00 (avg satisfaction: ${bestHourQuality.toFixed(1)}/10)`,
            `🔴 **Worst Time:** ${worstHour}:00 (avg satisfaction: ${worstHourQuality.toFixed(1)}/10)`,
            '',
            `🟢 **Best Day:** ${getDayName(bestDay)} (avg: ${bestDayQuality.toFixed(1)}/10)`,
            `🔴 **Worst Day:** ${getDayName(worstDay)} (avg: ${worstDayQuality.toFixed(1)}/10)`,
            '',
            sleepInsight ? `═══════════════════════════════════` : '',
            sleepInsight ? `😴 **SLEEP IMPACT**` : '',
            sleepInsight ? `═══════════════════════════════════` : '',
            sleepInsight,
            '',
            `═══════════════════════════════════`,
            `💡 **RECOMMENDATIONS**`,
            `═══════════════════════════════════`,
            `• Schedule important decisions around ${bestHour}:00`,
            `• Avoid big decisions after ${worstHour}:00 if possible`,
            `• ${getDayName(bestDay)}s are your power days for decisions`,
            bestHourQuality - worstHourQuality > 2
                ? `• TIME OF DAY matters a lot for you - respect this pattern!`
                : '',
            '',
            `**Peter's Take:** This is data no friend could track for you.`,
            `Your patterns are unique. Now you know YOUR optimal conditions.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
// ============================================================================
// SLEEP-BEHAVIOR CORRELATION ENGINE
// ============================================================================
export const recordSleepData = llm.tool({
    description: "Record your sleep data. Peter will correlate this with your spending, mood, productivity, and decisions to find YOUR patterns.",
    parameters: z.object({
        hoursSlept: z.number().min(0).max(24).describe('Hours of sleep last night'),
        quality: z.number().min(1).max(10).optional().describe('Sleep quality 1-10'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const sleepEntry = {
            date: new Date(),
            hours: params.hoursSlept,
            quality: params.quality || 5,
        };
        try {
            await saveSleepData(userId, sleepEntry);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to save sleep data');
            return 'Had trouble saving your sleep data. Try again?';
        }
        let userSleep;
        try {
            userSleep = await loadSleepData(userId);
        }
        catch {
            userSleep = [sleepEntry];
        }
        const avgSleep = userSleep.length > 0
            ? userSleep.slice(-30).reduce((sum, s) => sum + s.hours, 0) /
                Math.min(userSleep.length, 30)
            : params.hoursSlept;
        const comparison = params.hoursSlept > avgSleep + 1
            ? 'above your average'
            : params.hoursSlept < avgSleep - 1
                ? 'below your average'
                : 'around your average';
        return [
            `😴 Sleep logged: ${params.hoursSlept} hours`,
            params.quality ? `Quality: ${params.quality}/10` : '',
            '',
            `This is ${comparison} (${avgSleep.toFixed(1)} hrs).`,
            '',
            userSleep.length >= 14
                ? `I have ${userSleep.length} nights of data. Ready to analyze correlations!`
                : `${14 - userSleep.length} more nights until correlation analysis.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
export const analyzeSleepCorrelations = llm.tool({
    description: "Analyze how your sleep correlates with spending, decisions, and productivity. This reveals patterns you'd never notice yourself.",
    parameters: z.object({}),
    execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let sleepData;
        let decisions;
        try {
            sleepData = await loadSleepData(userId);
            decisions = await loadDecisions(userId);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to load data for sleep correlations');
            return 'Had trouble loading your data. Try again?';
        }
        if (sleepData.length < 14) {
            return [
                `📊 Need more sleep data`,
                '',
                `You have ${sleepData.length} nights recorded.`,
                `I need at least 14 nights to find meaningful correlations.`,
                '',
                `**What I'll analyze once you have enough data:**`,
                `• Sleep vs. spending impulses`,
                `• Sleep vs. decision quality`,
                `• Sleep vs. productivity`,
                `• Sleep vs. mood patterns`,
                `• Your optimal sleep threshold`,
            ].join('\n');
        }
        // Calculate correlations with available data
        const recentSleep = sleepData.slice(-30);
        const avgSleep = recentSleep.reduce((sum, s) => sum + s.hours, 0) / recentSleep.length;
        // Find optimal sleep based on quality ratings
        const withQuality = recentSleep.filter((s) => s.quality);
        let optimalSleep = avgSleep;
        if (withQuality.length >= 7) {
            const byHours = {};
            for (const s of withQuality) {
                const rounded = Math.round(s.hours);
                if (!byHours[rounded])
                    byHours[rounded] = [];
                byHours[rounded].push(s.quality);
            }
            let bestQuality = 0;
            for (const [hours, qualities] of Object.entries(byHours)) {
                if (qualities.length >= 2) {
                    const avg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
                    if (avg > bestQuality) {
                        bestQuality = avg;
                        optimalSleep = parseInt(hours);
                    }
                }
            }
        }
        // Sleep-decision correlation
        let decisionCorrelation = 'insufficient data';
        const decisionsWithSleep = decisions.filter((d) => d.context.sleepHours && d.outcome);
        if (decisionsWithSleep.length >= 5) {
            const sleep = decisionsWithSleep.map((d) => d.context.sleepHours);
            const satisfaction = decisionsWithSleep.map((d) => d.outcome.satisfaction);
            const corr = calculateCorrelation(sleep, satisfaction);
            decisionCorrelation =
                corr > 0.3
                    ? `Strong positive (${(corr * 100).toFixed(0)}%) - more sleep = better decisions`
                    : corr < -0.3
                        ? `Negative (${(corr * 100).toFixed(0)}%) - unusual pattern`
                        : `Weak (${(corr * 100).toFixed(0)}%) - sleep doesn't strongly affect your decisions`;
        }
        // Generate insights
        const belowThreshold = recentSleep.filter((s) => s.hours < optimalSleep - 1).length;
        const aboveThreshold = recentSleep.filter((s) => s.hours > optimalSleep + 1).length;
        log.info({ userId, dataPoints: sleepData.length }, '😴 Sleep correlation analysis');
        return [
            `😴 **YOUR SLEEP-LIFE CORRELATION ANALYSIS**`,
            `Based on ${sleepData.length} nights of data`,
            '',
            `═══════════════════════════════════`,
            `📊 **YOUR SLEEP PROFILE**`,
            `═══════════════════════════════════`,
            `• Average sleep: ${avgSleep.toFixed(1)} hours`,
            `• Optimal for YOU: ~${optimalSleep} hours`,
            `• Below optimal: ${belowThreshold} of last 30 nights`,
            `• Above optimal: ${aboveThreshold} of last 30 nights`,
            '',
            `═══════════════════════════════════`,
            `🔗 **CORRELATIONS FOUND**`,
            `═══════════════════════════════════`,
            ``,
            `**Sleep → Decision Quality:**`,
            `${decisionCorrelation}`,
            '',
            `═══════════════════════════════════`,
            `💡 **INSIGHTS**`,
            `═══════════════════════════════════`,
            ``,
            optimalSleep > avgSleep
                ? `• You're averaging ${(optimalSleep - avgSleep).toFixed(1)} hours LESS than your optimal`
                : optimalSleep < avgSleep
                    ? `• You might be oversleeping - ${avgSleep.toFixed(1)} hrs vs ${optimalSleep} optimal`
                    : `• You're hitting your optimal sleep target!`,
            '',
            belowThreshold > 10
                ? `• ⚠️ Sleep debt is accumulating - ${belowThreshold} underslept nights`
                : '',
            '',
            `**Peter's Take:**`,
            `This is YOUR data. Your ${optimalSleep}-hour optimal is unique to you.`,
            `Protect this number - everything else cascades from sleep.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
// ============================================================================
// ENERGY STATE PREDICTOR
// ============================================================================
export const recordEnergyLevel = llm.tool({
    description: "Record your current energy level. Over time, Peter will learn to PREDICT your energy throughout the day.",
    parameters: z.object({
        level: z.number().min(1).max(10).describe('Current energy level 1-10'),
        notes: z.string().optional().describe('What might be affecting your energy?'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const now = new Date();
        const energyEntry = {
            date: now,
            hour: now.getHours(),
            level: params.level,
        };
        try {
            await saveEnergyData(userId, energyEntry);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to save energy data');
            return 'Had trouble saving your energy data. Try again?';
        }
        let userEnergy;
        try {
            userEnergy = await loadEnergyData(userId);
        }
        catch {
            userEnergy = [energyEntry];
        }
        const sameHourData = userEnergy.filter((e) => e.hour === now.getHours());
        const avgAtThisHour = sameHourData.length > 1
            ? sameHourData.reduce((sum, e) => sum + e.level, 0) / sameHourData.length
            : null;
        return [
            `⚡ Energy logged: ${params.level}/10 at ${now.getHours()}:00`,
            params.notes ? `Notes: ${params.notes}` : '',
            '',
            avgAtThisHour
                ? `Your average at this hour: ${avgAtThisHour.toFixed(1)}/10`
                : 'Building your energy profile...',
            '',
            userEnergy.length >= 50
                ? `Ready for energy prediction analysis!`
                : `${50 - userEnergy.length} more readings until prediction model ready.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
export const predictEnergy = llm.tool({
    description: "Predict your energy levels for today based on your patterns. Know your peaks and valleys BEFORE they happen.",
    parameters: z.object({
        sleepLastNight: z.number().optional().describe('Hours of sleep last night'),
        calendarLoad: z
            .enum(['light', 'moderate', 'heavy', 'overloaded'])
            .optional()
            .describe("Today's calendar density"),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let userEnergy;
        try {
            userEnergy = await loadEnergyData(userId);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to load energy data');
            return 'Had trouble loading your energy data. Try again?';
        }
        if (userEnergy.length < 30) {
            return [
                `📊 Building your energy prediction model`,
                '',
                `You have ${userEnergy.length} energy readings.`,
                `I need at least 30 to make accurate predictions.`,
                '',
                `**Track your energy throughout the day:**`,
                `• Morning (8-10am)`,
                `• Mid-day (12-2pm)`,
                `• Afternoon (3-5pm)`,
                `• Evening (7-9pm)`,
                '',
                `Once I have your patterns, I'll predict your day before it happens!`,
            ].join('\n');
        }
        // Calculate hourly averages
        const byHour = {};
        for (const e of userEnergy) {
            if (!byHour[e.hour])
                byHour[e.hour] = [];
            byHour[e.hour].push(e.level);
        }
        const hourlyAvg = {};
        for (const [hour, levels] of Object.entries(byHour)) {
            hourlyAvg[parseInt(hour)] = levels.reduce((a, b) => a + b, 0) / levels.length;
        }
        // Find peaks and valleys
        const hours = Object.keys(hourlyAvg)
            .map(Number)
            .sort((a, b) => a - b);
        let peakHour = hours[0];
        let valleyHour = hours[0];
        let peakLevel = 0;
        let valleyLevel = 10;
        for (const hour of hours) {
            if (hourlyAvg[hour] > peakLevel) {
                peakLevel = hourlyAvg[hour];
                peakHour = hour;
            }
            if (hourlyAvg[hour] < valleyLevel) {
                valleyLevel = hourlyAvg[hour];
                valleyHour = hour;
            }
        }
        // Apply modifiers
        let sleepModifier = 0;
        if (params.sleepLastNight) {
            let sleepData = [];
            try {
                sleepData = await loadSleepData(userId);
            }
            catch {
                // Use default if we can't load sleep data
            }
            const avgSleep = sleepData.length > 0
                ? sleepData.reduce((sum, s) => sum + s.hours, 0) / sleepData.length
                : 7;
            sleepModifier = (params.sleepLastNight - avgSleep) * 0.3;
        }
        let calendarModifier = 0;
        if (params.calendarLoad) {
            const modifiers = { light: 0.5, moderate: 0, heavy: -0.5, overloaded: -1 };
            calendarModifier = modifiers[params.calendarLoad] || 0;
        }
        // Generate predictions
        const predictions = hours.map((hour) => {
            const base = hourlyAvg[hour] || 5;
            const predicted = Math.max(1, Math.min(10, base + sleepModifier + calendarModifier));
            return { hour, predicted: Math.round(predicted * 10) / 10 };
        });
        log.info({ userId, dataPoints: userEnergy.length }, '🔮 Energy prediction generated');
        return [
            `🔮 **YOUR ENERGY FORECAST FOR TODAY**`,
            '',
            `Based on ${userEnergy.length} historical readings`,
            params.sleepLastNight ? `Sleep modifier: ${sleepModifier > 0 ? '+' : ''}${sleepModifier.toFixed(1)}` : '',
            params.calendarLoad ? `Calendar modifier: ${calendarModifier > 0 ? '+' : ''}${calendarModifier.toFixed(1)}` : '',
            '',
            `═══════════════════════════════════`,
            `📈 **HOURLY PREDICTIONS**`,
            `═══════════════════════════════════`,
            ...predictions.map((p) => {
                const bar = '█'.repeat(Math.round(p.predicted));
                const empty = '░'.repeat(10 - Math.round(p.predicted));
                return `${p.hour.toString().padStart(2, '0')}:00  ${bar}${empty} ${p.predicted}/10`;
            }),
            '',
            `═══════════════════════════════════`,
            `🎯 **KEY TIMES**`,
            `═══════════════════════════════════`,
            ``,
            `🟢 **Peak Energy:** ${peakHour}:00 (${peakLevel.toFixed(1)}/10)`,
            `   → Schedule important/creative work here`,
            '',
            `🔴 **Energy Valley:** ${valleyHour}:00 (${valleyLevel.toFixed(1)}/10)`,
            `   → Avoid big decisions, do routine tasks`,
            '',
            `═══════════════════════════════════`,
            `💡 **TODAY'S STRATEGY**`,
            `═══════════════════════════════════`,
            ``,
            `• Deep work window: ${peakHour - 1}:00 - ${peakHour + 1}:00`,
            `• Admin/routine: ${valleyHour}:00`,
            `• Important meetings: Before ${valleyHour}:00`,
            '',
            `**Peter's Take:** Your energy is predictable!`,
            `Work WITH your patterns, not against them.`,
        ]
            .filter(Boolean)
            .join('\n');
    },
});
// ============================================================================
// PEAK PERFORMANCE MAPPER
// ============================================================================
export const analyzePeakPerformance = llm.tool({
    description: "Map YOUR personal peak performance times for creative work, analytical work, decisions, and communication. No generic advice - this is YOUR data.",
    parameters: z.object({}),
    execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let energy;
        let decisions;
        try {
            energy = await loadEnergyData(userId);
            decisions = await loadDecisions(userId);
        }
        catch (err) {
            log.error({ error: String(err) }, 'Failed to load data for peak performance analysis');
            return 'Had trouble loading your data. Try again?';
        }
        if (energy.length < 20 && decisions.length < 10) {
            return [
                `📊 **Building Your Peak Performance Profile**`,
                '',
                `Need more data to map your peaks:`,
                `• Energy readings: ${energy.length}/20 minimum`,
                `• Decision outcomes: ${decisions.length}/10 minimum`,
                '',
                `**Track these to build your profile:**`,
                `1. Energy levels throughout the day`,
                `2. When you make decisions and their outcomes`,
                `3. When you do your best creative/analytical work`,
                '',
                `Once I have enough data, I'll know YOUR optimal times for everything.`,
            ].join('\n');
        }
        // Calculate energy by hour
        const byHour = {};
        for (const e of energy) {
            if (!byHour[e.hour])
                byHour[e.hour] = [];
            byHour[e.hour].push(e.level);
        }
        // Find peak hours (top 3)
        const hourlyAvg = Object.entries(byHour)
            .map(([h, levels]) => ({
            hour: parseInt(h),
            avg: levels.reduce((a, b) => a + b, 0) / levels.length,
        }))
            .sort((a, b) => b.avg - a.avg);
        const peakHours = hourlyAvg.slice(0, 3).map((h) => h.hour);
        const lowHours = hourlyAvg.slice(-3).map((h) => h.hour);
        // Decision quality by hour
        const decisionsByHour = {};
        for (const d of decisions.filter((d) => d.outcome)) {
            const hour = d.context.timeOfDay;
            if (!decisionsByHour[hour])
                decisionsByHour[hour] = { total: 0, satisfaction: 0 };
            decisionsByHour[hour].total++;
            decisionsByHour[hour].satisfaction += d.outcome.satisfaction || 5;
        }
        const decisionHours = Object.entries(decisionsByHour)
            .filter(([_, d]) => d.total >= 2)
            .map(([h, d]) => ({
            hour: parseInt(h),
            avgSatisfaction: d.satisfaction / d.total,
        }))
            .sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
        const bestDecisionHours = decisionHours.length > 0 ? decisionHours.slice(0, 2).map((h) => h.hour) : peakHours.slice(0, 2);
        log.info({ userId }, '🏆 Peak performance profile generated');
        return [
            `🏆 **YOUR PEAK PERFORMANCE MAP**`,
            '',
            `═══════════════════════════════════`,
            `🎨 **CREATIVE WORK**`,
            `═══════════════════════════════════`,
            `Best hours: ${peakHours.map((h) => `${h}:00`).join(', ')}`,
            `These are your HIGH ENERGY windows.`,
            `→ Writing, brainstorming, design, strategy`,
            '',
            `═══════════════════════════════════`,
            `🔢 **ANALYTICAL WORK**`,
            `═══════════════════════════════════`,
            `Best hours: ${peakHours.slice(0, 2).map((h) => `${h}:00`).join(', ')}`,
            `Requires peak cognitive function.`,
            `→ Financial analysis, complex problems, coding`,
            '',
            `═══════════════════════════════════`,
            `⚖️ **DECISION MAKING**`,
            `═══════════════════════════════════`,
            `Best hours: ${bestDecisionHours.map((h) => `${h}:00`).join(', ')}`,
            decisionHours.length > 0
                ? `Based on ${decisions.filter((d) => d.outcome).length} of your past decisions`
                : `Based on energy patterns (need more decision data)`,
            `→ Important choices, negotiations, planning`,
            '',
            `═══════════════════════════════════`,
            `📧 **COMMUNICATION**`,
            `═══════════════════════════════════`,
            `Best hours: ${peakHours.slice(0, 2).map((h) => `${h}:00`).join(', ')}`,
            `When you're energized, you communicate better.`,
            `→ Difficult conversations, presentations, networking`,
            '',
            `═══════════════════════════════════`,
            `⚠️ **AVOID THESE HOURS FOR IMPORTANT WORK**`,
            `═══════════════════════════════════`,
            `${lowHours.map((h) => `${h}:00`).join(', ')}`,
            `Save routine/admin tasks for these windows.`,
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S RECOMMENDATION**`,
            `═══════════════════════════════════`,
            ``,
            `Block ${peakHours[0]}:00-${peakHours[0] + 2}:00 for your most important work.`,
            `This is YOUR data, not generic advice.`,
            `Respect your biology - it's consistent.`,
        ].join('\n');
    },
});
// ============================================================================
// LIFESTYLE IMPACT CALCULATOR
// ============================================================================
export const calculateLifestyleImpact = llm.tool({
    description: 'Predict how a lifestyle change will ripple through your life. See the cascade effects BEFORE you make the change.',
    parameters: z.object({
        change: z.string().describe('What change are you considering?'),
        type: z
            .enum(['habit_add', 'habit_remove', 'schedule_change', 'diet_change', 'exercise_change', 'sleep_change', 'work_change', 'relationship_change'])
            .describe('Type of change'),
        magnitude: z.enum(['small', 'medium', 'large']).describe('How big is this change?'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        // Impact prediction based on research and common patterns
        const impactMatrix = {
            habit_add: [
                { domain: 'energy', impact: 15, direction: 'positive' },
                { domain: 'stress', impact: -10, direction: 'negative' },
                { domain: 'time', impact: -5, direction: 'negative' },
                { domain: 'self-efficacy', impact: 20, direction: 'positive' },
            ],
            habit_remove: [
                { domain: 'time', impact: 10, direction: 'positive' },
                { domain: 'stress', impact: -5, direction: 'negative' },
                { domain: 'self-efficacy', impact: -10, direction: 'negative' },
            ],
            sleep_change: [
                { domain: 'energy', impact: 25, direction: 'positive' },
                { domain: 'decisions', impact: 20, direction: 'positive' },
                { domain: 'mood', impact: 20, direction: 'positive' },
                { domain: 'productivity', impact: 15, direction: 'positive' },
                { domain: 'spending', impact: 10, direction: 'positive' },
            ],
            exercise_change: [
                { domain: 'energy', impact: 20, direction: 'positive' },
                { domain: 'mood', impact: 25, direction: 'positive' },
                { domain: 'sleep', impact: 15, direction: 'positive' },
                { domain: 'time', impact: -10, direction: 'negative' },
                { domain: 'spending', impact: 5, direction: 'positive' },
            ],
            diet_change: [
                { domain: 'energy', impact: 15, direction: 'positive' },
                { domain: 'mood', impact: 10, direction: 'positive' },
                { domain: 'spending', impact: -5, direction: 'negative' },
            ],
            schedule_change: [
                { domain: 'stress', impact: 15, direction: 'variable' },
                { domain: 'relationships', impact: 10, direction: 'variable' },
                { domain: 'productivity', impact: 10, direction: 'variable' },
            ],
            work_change: [
                { domain: 'stress', impact: 30, direction: 'variable' },
                { domain: 'income', impact: 20, direction: 'variable' },
                { domain: 'time', impact: 15, direction: 'variable' },
                { domain: 'identity', impact: 20, direction: 'variable' },
                { domain: 'relationships', impact: 10, direction: 'variable' },
            ],
            relationship_change: [
                { domain: 'mood', impact: 30, direction: 'variable' },
                { domain: 'stress', impact: 25, direction: 'variable' },
                { domain: 'time', impact: 20, direction: 'variable' },
                { domain: 'spending', impact: 15, direction: 'variable' },
                { domain: 'social', impact: 25, direction: 'variable' },
            ],
        };
        const magnitudeMultiplier = { small: 0.5, medium: 1, large: 1.5 };
        const multiplier = magnitudeMultiplier[params.magnitude];
        const impacts = (impactMatrix[params.type] || impactMatrix.habit_add).map((i) => ({
            ...i,
            impact: Math.round(i.impact * multiplier),
        }));
        const positiveImpacts = impacts.filter((i) => i.direction === 'positive' || i.impact > 0);
        const negativeImpacts = impacts.filter((i) => i.direction === 'negative' || i.impact < 0);
        const netScore = impacts.reduce((sum, i) => sum + (i.direction === 'negative' ? -i.impact : i.impact), 0);
        log.info({ userId, change: params.change, type: params.type }, '🔄 Lifestyle impact calculated');
        return [
            `🔄 **LIFESTYLE IMPACT PREDICTION**`,
            '',
            `Change: "${params.change}"`,
            `Type: ${params.type.replace('_', ' ')} (${params.magnitude})`,
            '',
            `═══════════════════════════════════`,
            `🟢 **POSITIVE RIPPLE EFFECTS**`,
            `═══════════════════════════════════`,
            ...positiveImpacts.map((i) => `• ${i.domain.charAt(0).toUpperCase() + i.domain.slice(1)}: +${i.impact}%`),
            '',
            `═══════════════════════════════════`,
            `🔴 **COSTS/TRADE-OFFS**`,
            `═══════════════════════════════════`,
            ...negativeImpacts.map((i) => `• ${i.domain.charAt(0).toUpperCase() + i.domain.slice(1)}: ${i.impact}%`),
            '',
            `═══════════════════════════════════`,
            `📊 **NET IMPACT SCORE: ${netScore > 0 ? '+' : ''}${netScore}**`,
            `═══════════════════════════════════`,
            '',
            netScore > 20
                ? `✅ Strong positive impact predicted. This change compounds well.`
                : netScore > 0
                    ? `👍 Net positive. Benefits outweigh costs.`
                    : netScore > -10
                        ? `⚠️ Marginal. Consider if the trade-offs are worth it.`
                        : `🔴 Net negative. The costs may outweigh benefits.`,
            '',
            `═══════════════════════════════════`,
            `⏰ **TIMELINE**`,
            `═══════════════════════════════════`,
            ``,
            `• Week 1-2: Initial adjustment (may feel harder)`,
            `• Week 3-4: Adaptation phase`,
            `• Month 2+: Ripple effects manifest`,
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            params.type === 'sleep_change'
                ? `Sleep changes cascade EVERYWHERE. This is high-leverage.`
                : params.type === 'exercise_change'
                    ? `Exercise is a keystone. Changes here ripple to mood, sleep, decisions.`
                    : params.type === 'work_change'
                        ? `Work changes affect identity and stress. Give yourself 3-6 months to adjust.`
                        : `Consider starting small to test the ripple effects before going all-in.`,
        ].join('\n');
    },
});
// ============================================================================
// EXPORT
// ============================================================================
export const n1AnalyticsTools = {
    recordDecision,
    recordDecisionOutcome,
    analyzeDecisionQuality,
    recordSleepData,
    analyzeSleepCorrelations,
    recordEnergyLevel,
    predictEnergy,
    analyzePeakPerformance,
    calculateLifestyleImpact,
};
export default n1AnalyticsTools;
//# sourceMappingURL=n1-analytics.js.map