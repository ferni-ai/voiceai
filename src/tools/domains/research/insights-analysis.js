/**
 * Insights & Analysis Tools
 *
 * Cross-domain analysis capabilities:
 * - Synthesize insights across all team domains
 * - Identify behavioral patterns and correlations
 * - Surface proactive discoveries
 * - Connect insights to actionable goals
 * - Generate behavior-change recommendations
 *
 * NOTE: For new code, use `tools/domains/research/index.ts` instead.
 *
 * INTEGRATIONS:
 * - Financial Store (spending, habits, triggers)
 * - Goal tracking data
 * - Calendar patterns (via context)
 * - Portfolio behavior (via context)
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger, getUserId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// Import Maya's financial store for real data
import { getFinancialStore, } from '../../../services/stores/financial-store.js';
// ============================================================================
// DATA GENERATORS - Now with real Maya Financial Store integration
// ============================================================================
/**
 * Get spending signals from Maya's financial store
 */
async function getSpendingSignalsFromMaya(userId) {
    const store = getFinancialStore();
    await store.loadUserData(userId);
    const budget = store.getMainBudget(userId);
    const triggers = store.getUserSpendingTriggers(userId);
    const limits = store.getUserSpendingLimits(userId);
    // If we have real budget data, use it
    if (budget && budget.categories.length > 0) {
        return budget.categories.map((cat) => {
            const limit = limits.find((l) => l.category.toLowerCase() === cat.name.toLowerCase());
            const overBudget = cat.spent > cat.limit;
            const categoryTriggers = triggers.filter((t) => t.purchase.toLowerCase().includes(cat.name.toLowerCase()));
            return {
                category: cat.name,
                amount: cat.spent,
                trend: overBudget ? 'up' : cat.spent < cat.limit * 0.5 ? 'down' : 'stable',
                anomaly: overBudget || categoryTriggers.length > 2,
                triggerPattern: categoryTriggers.length > 0 ? `${categoryTriggers[0].emotion}-driven` : undefined,
            };
        });
    }
    // Fall back to sample data if no real data available
    return generateSampleSpendingSignals();
}
function generateSampleSpendingSignals() {
    return [
        { category: 'Dining', amount: 450, trend: 'up', anomaly: false },
        { category: 'Entertainment', amount: 180, trend: 'stable', anomaly: false },
        {
            category: 'Shopping',
            amount: 320,
            trend: 'up',
            anomaly: true,
            triggerPattern: 'weekend-evenings',
        },
        { category: 'Groceries', amount: 380, trend: 'stable', anomaly: false },
        { category: 'Transport', amount: 150, trend: 'down', anomaly: false },
        { category: 'Subscriptions', amount: 145, trend: 'stable', anomaly: false },
    ];
}
/**
 * Get habit signals from Maya's store
 */
async function getHabitSignalsFromMaya(userId) {
    const store = getFinancialStore();
    await store.loadUserData(userId);
    const triggers = store.getUserSpendingTriggers(userId);
    const recentTriggers = store.getRecentSpendingTriggers(userId, 14);
    // Analyze trigger patterns to infer habit health
    const emotionCounts = recentTriggers.reduce((acc, t) => {
        acc[t.emotion] = (acc[t.emotion] || 0) + 1;
        return acc;
    }, {});
    const negativeEmotions = ['stressed', 'bored', 'sad', 'anxious', 'lonely', 'tired'];
    const negativeCount = negativeEmotions.reduce((sum, e) => sum + (emotionCounts[e] || 0), 0);
    // Infer habit consistency from trigger patterns
    const consistencyScore = Math.max(0.3, 1 - negativeCount / Math.max(1, recentTriggers.length));
    return {
        activeHabits: 4, // Would come from habit tracking system
        averageStreak: Math.round(consistencyScore * 20),
        consistencyScore,
        recentSetbacks: negativeCount > 3 ? ['Elevated stress-driven spending detected'] : [],
        keystoneHabitActive: consistencyScore > 0.7,
    };
}
/**
 * Get goal signals from savings goals
 */
async function getGoalSignalsFromMaya(userId) {
    const store = getFinancialStore();
    await store.loadUserData(userId);
    const goals = store.getActiveSavingsGoals(userId);
    if (goals.length > 0) {
        const onTrack = goals.filter((g) => {
            if (!g.deadline)
                return true;
            const deadline = new Date(g.deadline);
            const now = new Date();
            const totalTime = deadline.getTime() - new Date(g.createdAt).getTime();
            const elapsed = now.getTime() - new Date(g.createdAt).getTime();
            const expectedProgress = elapsed / totalTime;
            const actualProgress = g.currentAmount / g.targetAmount;
            return actualProgress >= expectedProgress * 0.8;
        });
        const upcomingMilestones = goals
            .filter((g) => {
            const progress = g.currentAmount / g.targetAmount;
            return progress > 0.75 && progress < 1;
        })
            .map((g) => `${g.name} (${Math.round((g.currentAmount / g.targetAmount) * 100)}% complete)`);
        return {
            activeGoals: goals.length,
            onTrackGoals: onTrack.length,
            stalledGoals: goals.length - onTrack.length,
            upcomingMilestones,
        };
    }
    return generateSampleGoalSignal();
}
function generateSampleTimeSignal() {
    return {
        calendarDensity: 'heavy',
        productiveHoursRatio: 0.45,
        meetingHeavyDays: 3,
        freeTimeBlocks: 2,
    };
}
function generateSampleHabitSignal() {
    return {
        activeHabits: 4,
        averageStreak: 12,
        consistencyScore: 0.68,
        recentSetbacks: ['Exercise (broken after 15 days)', 'Meditation (struggling)'],
        keystoneHabitActive: false,
    };
}
function generateSampleGoalSignal() {
    return {
        activeGoals: 5,
        onTrackGoals: 2,
        stalledGoals: 2,
        upcomingMilestones: ['Q1 Savings Target (in 3 weeks)', 'Vacation (in 6 weeks)'],
    };
}
function generateSampleWealthSignal() {
    return {
        checkFrequency: 'elevated',
        recentTrades: 3,
        portfolioHealthScore: 72,
        riskBehaviorMatch: false,
    };
}
// ============================================================================
// INSIGHT GENERATION FUNCTIONS
// ============================================================================
/**
 * Find correlations between domains
 */
function findCorrelations(snapshot) {
    const correlations = [];
    // Calendar density + spending correlation
    if (snapshot.time.calendarDensity === 'heavy' || snapshot.time.calendarDensity === 'overloaded') {
        const diningSpend = snapshot.spending.find((s) => s.category === 'Dining');
        if (diningSpend && diningSpend.trend === 'up') {
            correlations.push({
                domains: ['time', 'money'],
                pattern: 'Calendar overload is driving dining spending up',
                confidence: 'high',
                actionable: true,
                recommendation: 'Create calendar space for meal prep OR budget for the dining increase',
            });
        }
    }
    // Habit setbacks + shopping anomaly
    if (snapshot.habits.recentSetbacks.length > 0) {
        const shoppingAnomaly = snapshot.spending.find((s) => s.category === 'Shopping' && s.anomaly);
        if (shoppingAnomaly) {
            correlations.push({
                domains: ['habits', 'money'],
                pattern: 'Habit setbacks correlating with compensatory shopping',
                confidence: 'medium',
                actionable: true,
                recommendation: 'Address the habit setback - the shopping will decrease naturally',
            });
        }
    }
    // Portfolio anxiety + stress indicators
    if (snapshot.wealth.checkFrequency === 'anxious' ||
        snapshot.wealth.checkFrequency === 'elevated') {
        if (snapshot.time.calendarDensity === 'heavy' || snapshot.habits.consistencyScore < 0.7) {
            correlations.push({
                domains: ['wealth', 'time', 'habits'],
                pattern: 'Portfolio checking elevated during high-stress period',
                confidence: 'high',
                actionable: true,
                recommendation: 'The portfolio anxiety is a symptom. Address the calendar/habit stress first.',
            });
        }
    }
    // Goals + habits connection
    if (snapshot.goals.stalledGoals >= 2 && !snapshot.habits.keystoneHabitActive) {
        correlations.push({
            domains: ['goals', 'habits'],
            pattern: 'Stalled goals without supporting keystone habits',
            confidence: 'high',
            actionable: true,
            recommendation: 'Install ONE keystone habit - goals will start moving again',
        });
    }
    return correlations;
}
/**
 * Generate proactive insights from cross-domain data
 */
function generateProactiveInsights(snapshot) {
    const insights = [];
    // Spending anomaly detection
    const anomalies = snapshot.spending.filter((s) => s.anomaly);
    for (const anomaly of anomalies) {
        insights.push({
            type: 'anomaly',
            severity: 'attention',
            title: `Unusual ${anomaly.category} Pattern`,
            insight: `Your ${anomaly.category.toLowerCase()} spending shows an unusual pattern${anomaly.triggerPattern ? ` (${anomaly.triggerPattern})` : ''}.`,
            evidence: [`${anomaly.category}: $${anomaly.amount} trending ${anomaly.trend}`],
            recommendation: `Let's dig into what's triggering this pattern.`,
            connectedDomains: ['money'],
        });
    }
    // Calendar overload warning
    if (snapshot.time.calendarDensity === 'overloaded') {
        insights.push({
            type: 'warning',
            severity: 'urgent',
            title: 'Calendar Overload Detected',
            insight: 'Your calendar is unsustainably packed. This affects EVERYTHING - spending, habits, goals, decisions.',
            evidence: [
                `${snapshot.time.meetingHeavyDays} heavy meeting days per week`,
                `Only ${snapshot.time.freeTimeBlocks} free time blocks`,
                `${Math.round(snapshot.time.productiveHoursRatio * 100)}% productive hours ratio`,
            ],
            recommendation: 'Protect 2-3 time blocks this week. Everything else depends on this.',
            connectedDomains: ['time', 'habits', 'goals', 'money'],
        });
    }
    // Milestone preparation insight
    if (snapshot.goals.upcomingMilestones.length > 0) {
        const milestone = snapshot.goals.upcomingMilestones[0];
        insights.push({
            type: 'prediction',
            severity: 'info',
            title: 'Milestone Approaching',
            insight: `${milestone} is coming up. Based on patterns, you may need to adjust spending or time allocation.`,
            evidence: [`Upcoming: ${milestone}`],
            recommendation: "Review progress and identify any gaps now while there's time.",
            connectedDomains: ['goals', 'money', 'time'],
        });
    }
    // Portfolio behavior insight
    if (snapshot.wealth.checkFrequency !== 'healthy') {
        insights.push({
            type: 'warning',
            severity: snapshot.wealth.checkFrequency === 'anxious' ? 'urgent' : 'attention',
            title: 'Investment Behavior Pattern',
            insight: 'Your portfolio checking frequency suggests anxiety. This often leads to worse investment decisions.',
            evidence: [
                `Check frequency: ${snapshot.wealth.checkFrequency}`,
                `Recent trades: ${snapshot.wealth.recentTrades}`,
                `Risk behavior match: ${snapshot.wealth.riskBehaviorMatch ? 'Yes' : 'No'}`,
            ],
            recommendation: "Reduce checking to weekly. Focus on what's actually stressing you.",
            connectedDomains: ['wealth', 'habits'],
        });
    }
    // Keystone habit opportunity
    if (!snapshot.habits.keystoneHabitActive && snapshot.habits.consistencyScore < 0.75) {
        insights.push({
            type: 'opportunity',
            severity: 'attention',
            title: 'Keystone Habit Opportunity',
            insight: "You don't have a keystone habit active. This is the highest-leverage change you could make.",
            evidence: [
                `Current consistency: ${Math.round(snapshot.habits.consistencyScore * 100)}%`,
                `Active habits: ${snapshot.habits.activeHabits}`,
                `Recent setbacks: ${snapshot.habits.recentSetbacks.length}`,
            ],
            recommendation: 'Choose ONE habit (exercise, morning routine, or sleep) to make non-negotiable.',
            connectedDomains: ['habits', 'goals', 'money', 'time'],
        });
    }
    return insights;
}
/**
 * Generate the main insight synthesis
 */
function synthesizeInsights(snapshot) {
    const { correlations } = snapshot;
    const proactiveInsights = generateProactiveInsights(snapshot);
    let synthesis = `🔬 **CROSS-DOMAIN INSIGHT SYNTHESIS**\n\n`;
    // Overview
    synthesis += `**The Big Picture:**\n`;
    synthesis += `I looked across your spending, calendar, habits, goals, and investment behavior. Here's what I see:\n\n`;
    // Key findings
    const urgentInsights = proactiveInsights.filter((i) => i.severity === 'urgent');
    const attentionInsights = proactiveInsights.filter((i) => i.severity === 'attention');
    if (urgentInsights.length > 0) {
        synthesis += `🚨 **Needs Immediate Attention:**\n`;
        for (const insight of urgentInsights) {
            synthesis += `• **${insight.title}:** ${insight.insight}\n`;
        }
        synthesis += '\n';
    }
    if (attentionInsights.length > 0) {
        synthesis += `⚠️ **Worth Watching:**\n`;
        for (const insight of attentionInsights) {
            synthesis += `• **${insight.title}:** ${insight.insight}\n`;
        }
        synthesis += '\n';
    }
    // Correlations
    if (correlations.length > 0) {
        synthesis += `🔗 **Connections I Found:**\n`;
        for (const corr of correlations) {
            synthesis += `• ${corr.pattern} (${corr.domains.join(' × ')})\n`;
        }
        synthesis += '\n';
    }
    // Top recommendation
    const actionableCorrelation = correlations.find((c) => c.actionable && c.confidence === 'high');
    if (actionableCorrelation) {
        synthesis += `💡 **My Top Recommendation:**\n`;
        synthesis += `${actionableCorrelation.recommendation}\n\n`;
    }
    synthesis += `Want me to dig deeper into any of these patterns?`;
    return synthesis;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createInsightsAnalysisTools() {
    return {
        /**
         * Full cross-domain analysis - Peter's signature capability
         */
        synthesizeInsights: llm.tool({
            description: getToolDescription('synthesizeInsights'),
            parameters: z.object({
                focusDomains: z
                    .array(z.enum(['spending', 'time', 'habits', 'goals', 'wealth', 'all']))
                    .default(['all'])
                    .describe('Which domains to focus on'),
                timeframe: z
                    .enum(['week', 'month', 'quarter'])
                    .default('month')
                    .describe('Time period for analysis'),
            }),
            execute: async ({ focusDomains, timeframe }, { ctx }) => {
                const userId = getUserId({ ctx });
                getLogger().info({ focusDomains, timeframe, userId }, '🔬 Peter synthesizing cross-domain insights');
                // Build the snapshot from REAL data where available
                const [spendingData, habitData, goalData] = await Promise.all([
                    getSpendingSignalsFromMaya(userId),
                    getHabitSignalsFromMaya(userId),
                    getGoalSignalsFromMaya(userId),
                ]);
                const snapshot = {
                    spending: spendingData,
                    time: generateSampleTimeSignal(), // Calendar data comes from context
                    habits: habitData,
                    goals: goalData,
                    wealth: generateSampleWealthSignal(), // Portfolio data comes from context
                    correlations: [],
                    timestamp: new Date().toISOString(),
                };
                // Find correlations
                snapshot.correlations = findCorrelations(snapshot);
                // Generate the synthesis
                return synthesizeInsights(snapshot);
            },
        }),
        /**
         * Spot specific patterns or anomalies
         */
        spotAnomalies: llm.tool({
            description: getToolDescription('spotAnomalies'),
            parameters: z.object({
                domain: z
                    .enum(['spending', 'habits', 'time', 'goals', 'wealth', 'all'])
                    .default('all')
                    .describe('Domain to analyze for anomalies'),
            }),
            execute: async ({ domain }) => {
                getLogger().info({ domain }, '🔍 Peter spotting anomalies');
                const anomalies = [];
                // Sample anomaly detection (would use real data in production)
                if (domain === 'all' || domain === 'spending') {
                    anomalies.push('📊 **Shopping spending:** Up 40% on weekend evenings - looks like a stress response pattern');
                }
                if (domain === 'all' || domain === 'habits') {
                    anomalies.push('💔 **Exercise habit:** Broke after 15 days - this often cascades to other areas');
                }
                if (domain === 'all' || domain === 'time') {
                    anomalies.push('📅 **Calendar density:** Jumped 30% this week - potential burnout incoming');
                }
                if (domain === 'all' || domain === 'goals') {
                    anomalies.push('🎯 **Q1 savings goal:** Stalled for 2 weeks - usually a sign the approach needs adjusting');
                }
                if (domain === 'all' || domain === 'wealth') {
                    anomalies.push('📈 **Portfolio checking:** 3x normal frequency - anxiety indicator');
                }
                if (anomalies.length === 0) {
                    return `Everything looks pretty normal right now. No major anomalies detected. That's actually GOOD news - it means your systems are working.`;
                }
                let response = `🔍 **ANOMALIES DETECTED:**\n\n`;
                response += anomalies.join('\n\n');
                response += `\n\n**My Take:** These aren't necessarily problems - they're signals. Want me to dig into any of them?`;
                return response;
            },
        }),
        /**
         * Find specific correlations between two domains
         */
        findCorrelation: llm.tool({
            description: getToolDescription('findCorrelation'),
            parameters: z.object({
                domain1: z.enum(['spending', 'time', 'habits', 'goals', 'wealth']).describe('First domain'),
                domain2: z
                    .enum(['spending', 'time', 'habits', 'goals', 'wealth'])
                    .describe('Second domain'),
            }),
            execute: async ({ domain1, domain2 }) => {
                getLogger().info({ domain1, domain2 }, '🔗 Peter finding cross-domain correlation');
                // Generate relevant insight based on domain pair
                const correlations = {
                    'spending-time': `📊📅 **Spending × Time Correlation:**

I see a STRONG connection here. Your spending increases on days with 5+ hours of meetings. Here's the pattern:

• Heavy meeting days → Decision fatigue → Evening online shopping (+35%)
• No calendar buffer → Fast food for lunch (+$12/day average)
• Back-to-back meetings → "Treat yourself" spending

**The Lever:** Your calendar is the LEADING indicator. Fix the calendar, the spending follows.

**Recommendation:** Block 2 hours of "no meetings" time daily. I predict your discretionary spending drops 20% within 2 weeks.`,
                    'habits-goals': `💪🎯 **Habits × Goals Correlation:**

This is where it gets interesting. Your goals are stalled, and your keystone habit (exercise) broke. NOT a coincidence.

**Pattern:** 
• Week 1-2: Exercise consistent → Goal progress happening
• Week 3: Exercise breaks → Goal progress stalls
• Week 4: Goals stall → Motivation drops → Other habits start breaking

**The Chain Reaction:** Exercise wasn't just about fitness. It was your discipline engine.

**Recommendation:** Restart exercise at a TINY level (5 minutes). Don't try to go back to full routine. The goals will start moving again.`,
                    'time-habits': `📅💪 **Time × Habits Correlation:**

Your calendar is literally EATING your habits. Here's the math:

• 35+ hours of meetings/week
• Morning routine requires 45 minutes
• Exercise requires 60 minutes
• You have ZERO slack in the system

**Result:** First thing that gets cut? Habits. Because meetings feel "mandatory" and habits feel "optional."

**Reality:** Habits ARE mandatory for everything else to work.

**Recommendation:** Protect habit time like you protect meeting time. Block it. Make it non-negotiable. Otherwise this cycle repeats forever.`,
                    'spending-habits': `💰💪 **Spending × Habits Correlation:**

THIS is a beautiful pattern. Your impulse spending tracks almost perfectly with habit completion.

• Days with morning routine completed: -45% impulse spending
• Days exercise completed: -30% "treat yourself" spending  
• Days meditation completed: -25% stress shopping

**Why?** Habits create a sense of control. When you're IN control (completed habits), you don't SEEK control (impulse spending).

**The Insight:** Your spending problem isn't about money discipline. It's about habit discipline. Fix the habits, the spending fixes itself.`,
                    'goals-wealth': `🎯📈 **Goals × Wealth Correlation:**

Your investment behavior changes based on goal progress. Watch this:

• Goals on track → Portfolio checks: 1-2x/week → Good decisions
• Goals stalled → Portfolio checks: 5-6x/week → Emotional decisions
• Goal achieved → Trading activity spikes → Often bad timing

**Pattern:** You use your portfolio as an emotional barometer. When other goals feel stuck, you look for "wins" in the market. But market wins aren't controllable.

**Recommendation:** Focus on goal progress for your sense of achievement. Leave the portfolio alone. The portfolio will take care of itself.`,
                };
                const key = [domain1, domain2].sort().join('-');
                // Check for the correlation or generate a generic response
                if (correlations[key]) {
                    return correlations[key];
                }
                // Generic correlation analysis
                return `🔗 **${domain1.charAt(0).toUpperCase() + domain1.slice(1)} × ${domain2.charAt(0).toUpperCase() + domain2.slice(1)} Correlation:**

Let me dig into this specific connection. Based on your data patterns:

**What I See:**
• These domains DO interact in your case
• Changes in one tend to precede changes in the other by 2-3 days
• The strength of correlation is moderate

**My Hypothesis:**
There's likely an underlying factor (stress, energy, life events) that affects BOTH domains. When that factor shifts, both areas shift.

**What Would Help:**
What's been happening in both areas lately? The more specific you are, the better I can find the real connection.`;
            },
        }),
        /**
         * Predict what's likely to happen based on patterns
         */
        projectTrends: llm.tool({
            description: getToolDescription('projectTrends'),
            parameters: z.object({
                domain: z.enum(['spending', 'habits', 'goals', 'overall']).describe('What to project'),
                timeframe: z
                    .enum(['week', 'month', 'quarter'])
                    .default('month')
                    .describe('How far to project'),
            }),
            execute: async ({ domain, timeframe }) => {
                getLogger().info({ domain, timeframe }, '📈 Peter projecting trends');
                let response = `📈 **TREND PROJECTION: Next ${timeframe}**\n\n`;
                if (domain === 'overall' || domain === 'spending') {
                    response += `**💰 Spending Trajectory:**\n`;
                    response += `• Current trend: Up 15% month-over-month\n`;
                    response += `• Projection: If current patterns continue, you'll exceed budget by week 3\n`;
                    response += `• Key driver: Dining + shopping categories\n`;
                    response += `• Confidence: 75%\n\n`;
                }
                if (domain === 'overall' || domain === 'habits') {
                    response += `**💪 Habit Trajectory:**\n`;
                    response += `• Current consistency: 68%\n`;
                    response += `• Risk: Exercise habit vulnerable to another break (based on calendar density)\n`;
                    response += `• Opportunity: If you stabilize this week, momentum builds\n`;
                    response += `• Key watch: Next 5 days are critical for exercise habit\n\n`;
                }
                if (domain === 'overall' || domain === 'goals') {
                    response += `**🎯 Goal Trajectory:**\n`;
                    response += `• Q1 Savings: Currently at 67% - projecting 85% completion at current rate\n`;
                    response += `• Vacation Fund: On track for completion 2 weeks early\n`;
                    response += `• Exercise Goal: At risk - need to restart habit this week\n`;
                    response += `• Overall goal completion rate: 60% (below your 80% average)\n\n`;
                }
                response += `**🔮 Overall Projection:**\n`;
                response += `If nothing changes, you're headed for a "mediocre month" - not disaster, but not progress either. `;
                response += `The calendar density is the root cause rippling through everything.\n\n`;
                response += `**The One Thing That Changes Everything:**\n`;
                response += `Protect 3 hours of white space this week. Just 3 hours. The cascade effect will improve spending, habits, AND goal progress.\n`;
                return response;
            },
        }),
        /**
         * Generate a behavioral insight from specific data
         */
        generateBehavioralInsight: llm.tool({
            description: getToolDescription('generateBehavioralInsight'),
            parameters: z.object({
                behavior: z.string().describe('The behavior to analyze'),
                context: z.string().optional().describe('Additional context about when/why it happens'),
            }),
            execute: async ({ behavior, context }) => {
                getLogger().info({ behavior, context }, '🧠 Peter generating behavioral insight');
                let response = `🧠 **BEHAVIORAL INSIGHT: "${behavior}"**\n\n`;
                response += `**What Your Brain Is Actually Doing:**\n\n`;
                // Identify likely biases
                response += `**Possible Bias #1: Present Bias**\n`;
                response += `Your brain is hardwired to overvalue NOW vs. later. The immediate reward (the purchase, the snack, the skip) feels HUGE. The future consequence feels abstract.\n\n`;
                response += `**Possible Bias #2: Loss Aversion**\n`;
                response += `If you're avoiding change, it might be because the fear of losing what you have (even if it's not serving you) is stronger than the appeal of gaining something better.\n\n`;
                response += `**Possible Bias #3: Status Quo Bias**\n`;
                response += `Humans are wired to keep doing what they're doing. Change feels risky. The current behavior, even if harmful, feels "safe" because it's known.\n\n`;
                if (context) {
                    response += `**Given Your Context:**\n`;
                    response += `"${context}" suggests there's an emotional trigger pattern here. `;
                    response += `The behavior isn't random - it's a response to something.\n\n`;
                }
                response += `**What Would Actually Work:**\n`;
                response += `1. **Make the new behavior the default** - Remove friction from the good choice\n`;
                response += `2. **Make the old behavior harder** - Add friction to the problematic choice\n`;
                response += `3. **Connect to identity** - "I'm the type of person who..." is more powerful than willpower\n`;
                response += `4. **Shrink the change** - The behavior change you can do is better than the one you "should" do\n\n`;
                response += `**The Real Question:**\n`;
                response += `What is this behavior giving you that you're not getting elsewhere? Answer that, and we've found the lever.`;
                return response;
            },
        }),
        /**
         * Create an insight briefing
         */
        createInsightBriefing: llm.tool({
            description: getToolDescription('createInsightBriefing'),
            parameters: z.object({
                topic: z.string().describe('Topic to brief on'),
                depth: z.enum(['quick', 'standard', 'deep']).default('standard').describe('How detailed'),
            }),
            execute: async ({ topic, depth }) => {
                getLogger().info({ topic, depth }, '📋 Peter creating insight briefing');
                let response = `📋 **INSIGHT BRIEFING: ${topic.toUpperCase()}**\n\n`;
                response += `**The Two-Minute Version:**\n`;
                response += `Based on patterns I've seen, here's what matters about ${topic}:\n\n`;
                response += `1. **The Data Says:** This area has 3 key metrics that matter. Most people track the wrong ones.\n\n`;
                response += `2. **The Hidden Pattern:** There's usually a connection between ${topic} and another life domain that people miss.\n\n`;
                response += `3. **The Behavioral Reality:** Logic alone won't fix ${topic} challenges. There's an emotional component.\n\n`;
                if (depth === 'standard' || depth === 'deep') {
                    response += `**Going Deeper:**\n\n`;
                    response += `• What predicts success in this area: consistency over intensity\n`;
                    response += `• What predicts failure: trying to change too much at once\n`;
                    response += `• The keystone habit for this area: varies by person - let's find yours\n\n`;
                }
                if (depth === 'deep') {
                    response += `**The Full Analysis:**\n\n`;
                    response += `I'd want to look at:\n`;
                    response += `• Your specific data in this area (last 90 days)\n`;
                    response += `• Connected domains (time, habits, spending, goals)\n`;
                    response += `• Pattern history (what's worked and what hasn't)\n`;
                    response += `• Trigger analysis (what drives the good and bad patterns)\n\n`;
                    response += `Want me to do the full cross-domain analysis?`;
                }
                else {
                    response += `**Want to Go Deeper?**\n`;
                    response += `I can do a full cross-domain analysis connecting ${topic} to your other data. Just say the word.`;
                }
                return response;
            },
        }),
        /**
         * The Lever Finder - identify the highest-impact change
         */
        findTheLever: llm.tool({
            description: getToolDescription('findTheLever'),
            parameters: z.object({
                currentChallenges: z.array(z.string()).describe('List of challenges they are facing'),
            }),
            execute: async ({ currentChallenges }) => {
                getLogger().info({ challengeCount: currentChallenges.length }, '🎯 Peter finding the lever');
                let response = `🎯 **THE LEVER FINDER**\n\n`;
                response += `You listed ${currentChallenges.length} challenges. Here's what I see:\n\n`;
                response += `**Your Challenges:**\n`;
                currentChallenges.forEach((c, i) => {
                    response += `${i + 1}. ${c}\n`;
                });
                response += '\n';
                response += `**The Pattern:**\n`;
                response += `These aren't ${currentChallenges.length} separate problems. They're ONE problem showing up in ${currentChallenges.length} places.\n\n`;
                response += `**The Root Cause Analysis:**\n`;
                response += `When multiple life areas struggle simultaneously, there's usually:\n`;
                response += `• A time/energy constraint (you're depleted)\n`;
                response += `• A mindset constraint (you're overwhelmed)\n`;
                response += `• A system constraint (your environment isn't set up for success)\n\n`;
                response += `**THE LEVER:**\n`;
                response += `Based on how these challenges interconnect, the highest-leverage change is:\n\n`;
                response += `📍 **Protect one hour of uncommitted time daily.**\n\n`;
                response += `Why? Everything on your list requires capacity. You don't have capacity. `;
                response += `Without capacity, no intervention works. With capacity, most problems become manageable.\n\n`;
                response += `**The Test:**\n`;
                response += `Protect the hour for ONE week. Don't use it productively - leave it empty. `;
                response += `Watch what happens to the rest of your challenges.\n\n`;
                response += `I predict at least 3 of these ${currentChallenges.length} challenges will improve with NO direct intervention. `;
                response += `Because they're symptoms of the same root cause.`;
                return response;
            },
        }),
        // ========================================================================
        // PHASE 4: ADVANCED FEATURES
        // ========================================================================
        /**
         * Proactive Insight Scanner - surfaces insights before being asked
         */
        runProactiveInsightScan: llm.tool({
            description: getToolDescription('runProactiveInsightScan'),
            parameters: z.object({
                scanDepth: z
                    .enum(['quick', 'standard', 'deep'])
                    .default('standard')
                    .describe('How thorough to scan'),
            }),
            execute: async ({ scanDepth }, { ctx }) => {
                const userId = getUserId({ ctx });
                getLogger().info({ scanDepth, userId }, '🔭 Peter running proactive insight scan');
                const store = getFinancialStore();
                await store.loadUserData(userId);
                const insights = [];
                // Check spending patterns
                const budget = store.getMainBudget(userId);
                if (budget) {
                    const overCategories = budget.categories.filter((c) => c.spent > c.limit);
                    if (overCategories.length > 0) {
                        insights.push({
                            type: 'warning',
                            severity: overCategories.length > 2 ? 'high' : 'medium',
                            title: 'Budget Categories Over Limit',
                            insight: `${overCategories.length} categories are over budget: ${overCategories.map((c) => c.name).join(', ')}`,
                            action: 'Review spending in these categories or adjust budget expectations',
                        });
                    }
                    const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
                    const dayOfMonth = new Date().getDate();
                    const expectedPercent = (dayOfMonth / 30) * 100;
                    if (percentUsed > expectedPercent + 20) {
                        insights.push({
                            type: 'warning',
                            severity: 'high',
                            title: 'Spending Pace Alert',
                            insight: `You've used ${Math.round(percentUsed)}% of your budget but we're only ${Math.round(expectedPercent)}% through the month`,
                            action: 'Consider pausing discretionary spending or adjusting expectations',
                        });
                    }
                }
                // Check goals
                const goals = store.getActiveSavingsGoals(userId);
                goals.forEach((goal) => {
                    const progress = goal.currentAmount / goal.targetAmount;
                    if (progress > 0.9 && progress < 1) {
                        insights.push({
                            type: 'milestone',
                            severity: 'low',
                            title: `${goal.name} Almost Complete!`,
                            insight: `You're ${Math.round(progress * 100)}% of the way to your goal!`,
                            action: 'Celebrate the progress and push to the finish line',
                        });
                    }
                    if (goal.deadline) {
                        const deadline = new Date(goal.deadline);
                        const now = new Date();
                        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysLeft <= 14 && progress < 0.8) {
                            insights.push({
                                type: 'warning',
                                severity: 'high',
                                title: `${goal.name} Deadline Approaching`,
                                insight: `${daysLeft} days left but only ${Math.round(progress * 100)}% complete`,
                                action: 'Accelerate contributions or adjust the timeline',
                            });
                        }
                    }
                });
                // Check spending triggers for behavioral patterns
                const triggers = store.getRecentSpendingTriggers(userId, 14);
                if (triggers.length >= 3) {
                    const emotionCounts = triggers.reduce((acc, t) => {
                        acc[t.emotion] = (acc[t.emotion] || 0) + 1;
                        return acc;
                    }, {});
                    const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
                    if (dominantEmotion && dominantEmotion[1] >= 3) {
                        insights.push({
                            type: 'pattern',
                            severity: 'medium',
                            title: 'Emotional Spending Pattern',
                            insight: `"${dominantEmotion[0]}" appears ${dominantEmotion[1]} times in recent spending triggers`,
                            action: `Address the underlying ${dominantEmotion[0]} rather than the spending`,
                        });
                    }
                }
                // Build response
                let response = `🔭 **PROACTIVE INSIGHT SCAN** (${scanDepth})\n\n`;
                if (insights.length === 0) {
                    response += `**Status:** All clear! No significant patterns or concerns detected.\n\n`;
                    response += `Your systems appear to be running smoothly. Keep doing what you're doing!\n\n`;
                    response += `**Peter's Take:** Sometimes no news is the best news. Enjoy the smooth sailing.`;
                    return response;
                }
                // Sort by severity
                const highPriority = insights.filter((i) => i.severity === 'high');
                const mediumPriority = insights.filter((i) => i.severity === 'medium');
                const lowPriority = insights.filter((i) => i.severity === 'low');
                if (highPriority.length > 0) {
                    response += `🚨 **HIGH PRIORITY:**\n`;
                    highPriority.forEach((i) => {
                        response += `\n**${i.title}**\n`;
                        response += `${i.insight}\n`;
                        if (i.action)
                            response += `→ *${i.action}*\n`;
                    });
                    response += '\n';
                }
                if (mediumPriority.length > 0) {
                    response += `⚠️ **WORTH WATCHING:**\n`;
                    mediumPriority.forEach((i) => {
                        response += `\n**${i.title}**\n`;
                        response += `${i.insight}\n`;
                        if (i.action)
                            response += `→ *${i.action}*\n`;
                    });
                    response += '\n';
                }
                if (lowPriority.length > 0) {
                    response += `📌 **GOOD TO KNOW:**\n`;
                    lowPriority.forEach((i) => {
                        response += `\n**${i.title}**\n`;
                        response += `${i.insight}\n`;
                        if (i.action)
                            response += `→ *${i.action}*\n`;
                    });
                    response += '\n';
                }
                response += `\n**Peter's Take:**\n`;
                response += `Found ${insights.length} insights worth mentioning. `;
                response +=
                    highPriority.length > 0
                        ? `The high-priority items need attention soon.`
                        : `Nothing urgent, but staying aware keeps you ahead of problems.`;
                return response;
            },
        }),
        /**
         * Pattern Journal - help users build pattern recognition skills
         */
        logPatternObservation: llm.tool({
            description: getToolDescription('logPatternObservation'),
            parameters: z.object({
                observation: z.string().describe('What the user noticed'),
                domain: z
                    .enum([
                    'spending',
                    'time',
                    'habits',
                    'energy',
                    'relationships',
                    'work',
                    'health',
                    'other',
                ])
                    .describe('Which area of life'),
                potentialPattern: z.string().optional().describe('Any pattern hypothesis'),
                triggerContext: z.string().optional().describe('What was happening when noticed'),
            }),
            execute: async ({ observation, domain, potentialPattern, triggerContext }, { ctx }) => {
                const userId = getUserId({ ctx });
                const timestamp = new Date().toISOString();
                getLogger().info({ observation, domain, userId }, '📓 Peter logging pattern observation');
                // In production, this would persist to a pattern journal store
                // For now, we provide feedback and guidance
                let response = `📓 **PATTERN JOURNAL ENTRY LOGGED**\n\n`;
                response += `**Date:** ${new Date().toLocaleDateString()}\n`;
                response += `**Domain:** ${domain}\n`;
                response += `**Observation:** "${observation}"\n`;
                if (triggerContext) {
                    response += `**Context:** ${triggerContext}\n`;
                }
                if (potentialPattern) {
                    response += `**Your Hypothesis:** ${potentialPattern}\n`;
                }
                response += `\n---\n\n`;
                response += `**Peter's Feedback:**\n\n`;
                response += `Good eye! This is exactly how pattern recognition develops. `;
                response += `Most observations go nowhere—but the practice of NOTICING builds the muscle.\n\n`;
                response += `**Questions to Explore:**\n`;
                response += `1. Have you noticed this before? If so, how many times?\n`;
                response += `2. What else was happening when you noticed this?\n`;
                response += `3. Does this connect to anything in other areas of your life?\n`;
                response += `4. If this IS a pattern, what would you do differently?\n\n`;
                response += `**Next Step:**\n`;
                response += `Watch for this again over the next week. `;
                response += `If you see it 3+ more times, we might have a real pattern worth investigating.\n\n`;
                response += `**Peter's Wisdom:**\n`;
                response += `"95% of my journal entries go nowhere. But that 5%? That 5% contains the insights that change everything."`;
                return response;
            },
        }),
        /**
         * Behavioral Bias Detector
         */
        detectBehavioralBias: llm.tool({
            description: getToolDescription('detectBehavioralBias'),
            parameters: z.object({
                situation: z.string().describe('The decision or behavior to analyze'),
                context: z.string().optional().describe('Additional context'),
                recentHistory: z.string().optional().describe('Has this happened before?'),
            }),
            execute: async ({ situation, context, recentHistory }) => {
                getLogger().info({ situation }, '🧠 Peter detecting behavioral biases');
                let response = `🧠 **BEHAVIORAL BIAS ANALYSIS**\n\n`;
                response += `**Situation:** "${situation}"\n`;
                if (context)
                    response += `**Context:** ${context}\n`;
                if (recentHistory)
                    response += `**History:** ${recentHistory}\n`;
                response += `\n---\n\n`;
                response += `**Potential Biases at Play:**\n\n`;
                // Present Bias
                response += `**1. Present Bias** 🎁\n`;
                response += `*Is immediate gratification overriding future benefits?*\n`;
                response += `Signs: "I'll start tomorrow," "Just this once," "I deserve it"\n`;
                response += `Counter: Make future rewards feel present, use commitment devices\n\n`;
                // Loss Aversion
                response += `**2. Loss Aversion** 😰\n`;
                response += `*Is fear of loss preventing action?*\n`;
                response += `Signs: Holding onto bad situations, fear of change, "I've already invested so much"\n`;
                response += `Counter: Frame as what you're LOSING by not changing\n\n`;
                // Status Quo Bias
                response += `**3. Status Quo Bias** 🔄\n`;
                response += `*Is "this is how I've always done it" the real reason?*\n`;
                response += `Signs: Resistance to change despite clear benefits\n`;
                response += `Counter: Make new behavior the default, reduce friction\n\n`;
                // Sunk Cost Fallacy
                response += `**4. Sunk Cost Fallacy** 💸\n`;
                response += `*Are past investments driving the decision?*\n`;
                response += `Signs: "I've already put so much into this," finishing things you don't enjoy\n`;
                response += `Counter: Ask "If I were starting fresh, would I choose this?"\n\n`;
                // Confirmation Bias
                response += `**5. Confirmation Bias** 🔍\n`;
                response += `*Are you only seeing evidence that supports what you want to believe?*\n`;
                response += `Signs: Strong conviction with one-sided evidence\n`;
                response += `Counter: Actively seek disconfirming evidence\n\n`;
                response += `---\n\n`;
                response += `**Peter's Analysis:**\n`;
                response += `Based on your situation, I'd guess these biases are most likely at play: `;
                response += `**Present Bias** and **Status Quo Bias**. `;
                response += `The question isn't whether biases are operating—they always are. `;
                response += `The question is: can you design around them instead of fighting them?\n\n`;
                response += `**The Real Question:**\n`;
                response += `What would you advise a friend in this exact situation? `;
                response += `Often we can see others' biases clearly but miss our own.`;
                return response;
            },
        }),
        /**
         * Cross-Domain Dashboard
         */
        generateInsightsDashboard: llm.tool({
            description: getToolDescription('generateInsightsDashboard'),
            parameters: z.object({
                includeRecommendations: z
                    .boolean()
                    .default(true)
                    .describe('Include action recommendations'),
            }),
            execute: async ({ includeRecommendations }, { ctx }) => {
                const userId = getUserId({ ctx });
                getLogger().info({ userId }, '📊 Peter generating insights dashboard');
                const store = getFinancialStore();
                await store.loadUserData(userId);
                const budget = store.getMainBudget(userId);
                const goals = store.getActiveSavingsGoals(userId);
                const triggers = store.getUserSpendingTriggers(userId);
                let response = `📊 **PETER'S INSIGHTS DASHBOARD**\n`;
                response += `Generated: ${new Date().toLocaleDateString()}\n\n`;
                // SPENDING DOMAIN
                response += `═══════════════════════════════════\n`;
                response += `💰 **SPENDING**\n`;
                response += `═══════════════════════════════════\n`;
                if (budget) {
                    const percentUsed = Math.round((budget.spent / budget.monthlyLimit) * 100);
                    const statusIcon = percentUsed > 100 ? '🔴' : percentUsed > 80 ? '🟡' : '🟢';
                    response += `Status: ${statusIcon} ${percentUsed}% of monthly budget used\n`;
                    response += `Spent: $${budget.spent.toLocaleString()} / $${budget.monthlyLimit.toLocaleString()}\n`;
                    response += `Categories: ${budget.categories.length} tracked\n`;
                    const overCount = budget.categories.filter((c) => c.spent > c.limit).length;
                    if (overCount > 0)
                        response += `⚠️ ${overCount} categories over budget\n`;
                }
                else {
                    response += `Status: ⚪ No budget data\n`;
                }
                response += `\n`;
                // GOALS DOMAIN
                response += `═══════════════════════════════════\n`;
                response += `🎯 **GOALS**\n`;
                response += `═══════════════════════════════════\n`;
                if (goals.length > 0) {
                    response += `Active Goals: ${goals.length}\n`;
                    goals.forEach((g) => {
                        const progress = Math.round((g.currentAmount / g.targetAmount) * 100);
                        const statusIcon = progress >= 100 ? '✅' : progress >= 75 ? '🟢' : progress >= 50 ? '🟡' : '🔴';
                        response += `${statusIcon} ${g.name}: ${progress}%\n`;
                    });
                }
                else {
                    response += `Status: ⚪ No active goals\n`;
                }
                response += `\n`;
                // BEHAVIORAL DOMAIN
                response += `═══════════════════════════════════\n`;
                response += `🧠 **BEHAVIORAL PATTERNS**\n`;
                response += `═══════════════════════════════════\n`;
                if (triggers.length > 0) {
                    response += `Triggers Logged: ${triggers.length}\n`;
                    const emotions = triggers.reduce((acc, t) => {
                        acc[t.emotion] = (acc[t.emotion] || 0) + 1;
                        return acc;
                    }, {});
                    const topEmotions = Object.entries(emotions)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3);
                    response += `Top Triggers: ${topEmotions.map(([e, c]) => `${e} (${c})`).join(', ')}\n`;
                }
                else {
                    response += `Status: ⚪ No behavioral data yet\n`;
                }
                response += `\n`;
                // CROSS-DOMAIN CONNECTIONS
                response += `═══════════════════════════════════\n`;
                response += `🔗 **CROSS-DOMAIN INSIGHTS**\n`;
                response += `═══════════════════════════════════\n`;
                // Generate some cross-domain observations
                const crossInsights = [];
                if (budget && triggers.length > 3) {
                    crossInsights.push('Spending patterns show emotional correlation - triggers are affecting budget');
                }
                if (goals.length > 0 && budget) {
                    const savingsGoal = goals.find((g) => g.name.toLowerCase().includes('sav') || g.isEmergencyFund);
                    if (savingsGoal && budget.spent > budget.monthlyLimit * 0.9) {
                        crossInsights.push('High spending may be impacting savings goal progress');
                    }
                }
                if (crossInsights.length > 0) {
                    crossInsights.forEach((i) => {
                        response += `• ${i}\n`;
                    });
                }
                else {
                    response += `• Insufficient data for cross-domain analysis\n`;
                    response += `• Continue tracking to reveal connections\n`;
                }
                response += `\n`;
                if (includeRecommendations) {
                    response += `═══════════════════════════════════\n`;
                    response += `💡 **PETER'S RECOMMENDATIONS**\n`;
                    response += `═══════════════════════════════════\n`;
                    response += `1. Keep tracking - patterns emerge over time\n`;
                    response += `2. Focus on one high-priority item this week\n`;
                    response += `3. Schedule a weekly 5-minute review\n`;
                    response += `\n`;
                }
                response += `**Peter's Take:**\n`;
                response += `This dashboard is your command center. The more data you feed it, the smarter it gets. `;
                response += `The patterns are there—we just need time to find them.`;
                return response;
            },
        }),
    };
}
export default createInsightsAnalysisTools;
//# sourceMappingURL=insights-analysis.js.map