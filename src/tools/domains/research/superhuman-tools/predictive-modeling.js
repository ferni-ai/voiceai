/**
 * Predictive Personal Modeling Tools
 *
 * These tools predict YOUR future based on YOUR patterns - not generic
 * advice. Goal success probability, behavioral trajectory, habit survival,
 * counterfactual analysis, and life event impact prediction.
 *
 * "Better than Human" because: No human can objectively predict your
 * future based on systematic analysis of your patterns.
 *
 * @module tools/domains/research/superhuman-tools/predictive-modeling
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getUserIdFromContext, } from './firestore-persistence.js';
const log = getLogger();
// ============================================================================
// LOCAL CACHES (sync with Firestore on read/write)
// ============================================================================
const goalStore = new Map();
const habitStore = new Map();
const decisionStore = new Map();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateGoalVelocity(milestones) {
    if (milestones.length < 2)
        return 0;
    const sorted = [...milestones].sort((a, b) => a.date.getTime() - b.date.getTime());
    const recentMilestones = sorted.slice(-5);
    let totalVelocity = 0;
    for (let i = 1; i < recentMilestones.length; i++) {
        const daysDiff = (recentMilestones[i].date.getTime() - recentMilestones[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
        const progressDiff = recentMilestones[i].progress - recentMilestones[i - 1].progress;
        if (daysDiff > 0) {
            totalVelocity += progressDiff / daysDiff;
        }
    }
    return totalVelocity / (recentMilestones.length - 1);
}
function predictCompletionDate(currentProgress, velocity, targetDate) {
    if (velocity <= 0)
        return null;
    const remainingProgress = 100 - currentProgress;
    const daysToComplete = remainingProgress / velocity;
    const predictedDate = new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000);
    return predictedDate;
}
// ============================================================================
// GOAL SUCCESS PREDICTOR
// ============================================================================
export const recordGoalProgress = llm.tool({
    description: 'Record progress on a goal. Over time, Peter will learn to predict your goal completion probability.',
    parameters: z.object({
        goalName: z.string().describe('Name of the goal'),
        currentProgress: z.number().min(0).max(100).describe('Current progress (0-100%)'),
        notes: z.string().optional().describe('Notes on progress'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userGoals = goalStore.get(userId) || [];
        let goal = userGoals.find(g => g.name.toLowerCase() === params.goalName.toLowerCase());
        if (!goal) {
            goal = {
                id: `goal_${Date.now()}`,
                name: params.goalName,
                type: 'custom',
                startDate: new Date(),
                currentProgress: params.currentProgress,
                milestones: [{ date: new Date(), progress: params.currentProgress }],
                status: 'active',
            };
            userGoals.push(goal);
        }
        else {
            goal.currentProgress = params.currentProgress;
            goal.milestones.push({ date: new Date(), progress: params.currentProgress });
            if (params.currentProgress >= 100) {
                goal.status = 'completed';
            }
        }
        goalStore.set(userId, userGoals);
        const velocity = calculateGoalVelocity(goal.milestones);
        const predictedDate = predictCompletionDate(params.currentProgress, velocity);
        return [
            `✅ Progress recorded: ${params.goalName}`,
            '',
            `📊 Current: ${params.currentProgress}%`,
            goal.milestones.length > 2 ? `📈 Velocity: ${(velocity * 7).toFixed(1)}% per week` : '',
            predictedDate ? `🎯 Predicted completion: ${predictedDate.toLocaleDateString()}` : '',
            '',
            goal.milestones.length < 5
                ? `Track ${5 - goal.milestones.length} more updates for accurate predictions.`
                : `I have enough data to predict your success probability!`,
        ].filter(Boolean).join('\n');
    },
});
export const predictGoalSuccess = llm.tool({
    description: "Predict the probability of completing a goal based on YOUR patterns. Not generic advice - YOUR actual success patterns.",
    parameters: z.object({
        goalName: z.string().describe('Name of the goal to predict'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userGoals = goalStore.get(userId) || [];
        const goal = userGoals.find(g => g.name.toLowerCase().includes(params.goalName.toLowerCase()));
        if (!goal) {
            return [
                `📊 **GOAL PREDICTION**`,
                '',
                `I don't have data on "${params.goalName}".`,
                '',
                `**To get predictions:**`,
                `1. Record goal progress regularly`,
                `2. Include milestones when tracking`,
                `3. At least 3-5 data points needed`,
                '',
                `Your current goals:`,
                ...userGoals.map(g => `• ${g.name} (${g.currentProgress}%)`),
            ].join('\n');
        }
        // Calculate prediction factors
        const velocity = calculateGoalVelocity(goal.milestones);
        const daysSinceStart = (Date.now() - goal.startDate.getTime()) / (1000 * 60 * 60 * 24);
        const expectedProgress = goal.targetDate
            ? (daysSinceStart / ((goal.targetDate.getTime() - goal.startDate.getTime()) / (1000 * 60 * 60 * 24))) * 100
            : null;
        // Historical success rate (simplified)
        const completedGoals = userGoals.filter(g => g.status === 'completed').length;
        const abandonedGoals = userGoals.filter(g => g.status === 'abandoned').length;
        const historicalSuccessRate = completedGoals + abandonedGoals > 0
            ? (completedGoals / (completedGoals + abandonedGoals)) * 100
            : 50;
        // Calculate success probability
        let successProbability = 50; // Base rate
        // Velocity factor
        if (velocity > 0) {
            successProbability += 15;
            if (velocity > 2)
                successProbability += 10; // Strong velocity
        }
        else {
            successProbability -= 20;
        }
        // Progress vs expectation
        if (expectedProgress !== null) {
            if (goal.currentProgress >= expectedProgress) {
                successProbability += 15;
            }
            else if (goal.currentProgress < expectedProgress - 20) {
                successProbability -= 15;
            }
        }
        // Historical factor
        successProbability = (successProbability * 0.7) + (historicalSuccessRate * 0.3);
        successProbability = Math.max(5, Math.min(95, successProbability));
        const predictedDate = predictCompletionDate(goal.currentProgress, velocity, goal.targetDate);
        const riskFactors = [];
        if (velocity <= 0)
            riskFactors.push('Stalled momentum - no recent progress');
        if (goal.milestones.length < 5)
            riskFactors.push('Limited data for accurate prediction');
        if (expectedProgress && goal.currentProgress < expectedProgress - 10) {
            riskFactors.push('Behind schedule');
        }
        const successFactors = [];
        if (velocity > 0)
            successFactors.push('Positive momentum');
        if (goal.currentProgress > 50)
            successFactors.push('Past the halfway point');
        if (historicalSuccessRate > 60)
            successFactors.push('Strong track record');
        log.info({ userId, goal: goal.name, probability: successProbability }, '🔮 Goal prediction');
        return [
            `🔮 **GOAL SUCCESS PREDICTION**`,
            '',
            `Goal: "${goal.name}"`,
            `Current Progress: ${goal.currentProgress}%`,
            '',
            `═══════════════════════════════════`,
            `🎯 **SUCCESS PROBABILITY: ${Math.round(successProbability)}%**`,
            `═══════════════════════════════════`,
            '',
            predictedDate
                ? `📅 **Predicted Completion:** ${predictedDate.toLocaleDateString()}`
                : `📅 **Predicted Completion:** Unable to predict (need more velocity data)`,
            '',
            `═══════════════════════════════════`,
            `📈 **PREDICTION FACTORS**`,
            `═══════════════════════════════════`,
            '',
            `• Current velocity: ${velocity > 0 ? `+${(velocity * 7).toFixed(1)}%/week` : 'Stalled'}`,
            `• Progress vs expectation: ${expectedProgress ? `${goal.currentProgress - expectedProgress > 0 ? 'Ahead' : 'Behind'}` : 'No deadline set'}`,
            `• Your historical success rate: ${Math.round(historicalSuccessRate)}%`,
            '',
            riskFactors.length > 0 ? `═══════════════════════════════════` : '',
            riskFactors.length > 0 ? `🔴 **RISK FACTORS**` : '',
            riskFactors.length > 0 ? `═══════════════════════════════════` : '',
            ...riskFactors.map(r => `• ${r}`),
            '',
            successFactors.length > 0 ? `═══════════════════════════════════` : '',
            successFactors.length > 0 ? `🟢 **SUCCESS FACTORS**` : '',
            successFactors.length > 0 ? `═══════════════════════════════════` : '',
            ...successFactors.map(s => `• ${s}`),
            '',
            `═══════════════════════════════════`,
            `💡 **TO IMPROVE PROBABILITY**`,
            `═══════════════════════════════════`,
            '',
            velocity <= 0 ? `• Take ONE small action today to restart momentum` : '',
            goal.currentProgress < 50 ? `• Break the goal into smaller milestones` : '',
            `• Track progress more frequently (builds accountability)`,
            riskFactors.length > 2 ? `• Consider if this goal needs to be redefined` : '',
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// BEHAVIORAL TRAJECTORY MODELER
// ============================================================================
export const projectBehavioralTrajectory = llm.tool({
    description: "See where your current patterns lead. Project 1, 3, 6, and 12 months into YOUR future based on YOUR data.",
    parameters: z.object({
        domain: z.enum(['spending', 'habits', 'goals', 'energy', 'productivity', 'relationships'])
            .describe('Life domain to project'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        // Get relevant data
        const userGoals = goalStore.get(userId) || [];
        const userHabits = habitStore.get(userId) || [];
        // Calculate current state and trend
        let currentState = 50; // Default middle ground
        let trend = 'stable';
        let dataPoints = 0;
        if (params.domain === 'goals') {
            const activeGoals = userGoals.filter(g => g.status === 'active');
            if (activeGoals.length > 0) {
                const avgProgress = activeGoals.reduce((sum, g) => sum + g.currentProgress, 0) / activeGoals.length;
                currentState = avgProgress;
                const velocities = activeGoals.map(g => calculateGoalVelocity(g.milestones));
                const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
                trend = avgVelocity > 0.5 ? 'improving' : avgVelocity < -0.5 ? 'declining' : 'stable';
                dataPoints = activeGoals.reduce((sum, g) => sum + g.milestones.length, 0);
            }
        }
        else if (params.domain === 'habits') {
            const activeHabits = userHabits.filter(h => h.status === 'active');
            if (activeHabits.length > 0) {
                const avgStreak = activeHabits.reduce((sum, h) => sum + h.streak, 0) / activeHabits.length;
                currentState = Math.min(100, avgStreak * 5);
                dataPoints = activeHabits.reduce((sum, h) => sum + h.completions.length, 0);
            }
        }
        // Project future states
        const trendMultiplier = trend === 'improving' ? 1.05 : trend === 'declining' ? 0.95 : 1;
        const projections = {
            month1: Math.min(100, Math.max(0, currentState * trendMultiplier)),
            month3: Math.min(100, Math.max(0, currentState * Math.pow(trendMultiplier, 3))),
            month6: Math.min(100, Math.max(0, currentState * Math.pow(trendMultiplier, 6))),
            month12: Math.min(100, Math.max(0, currentState * Math.pow(trendMultiplier, 12))),
        };
        // Identify interventions
        const interventions = [];
        if (trend === 'declining') {
            interventions.push('Immediate intervention needed - declining trend will compound');
            interventions.push('Identify the root cause before adding new systems');
        }
        else if (trend === 'stable' && currentState < 50) {
            interventions.push('Stability at a low level - need a positive disruption');
            interventions.push('One keystone change could shift everything');
        }
        else if (trend === 'improving') {
            interventions.push('Momentum is positive - protect what is working');
            interventions.push('Consider raising your targets');
        }
        log.info({ userId, domain: params.domain, trend }, '📈 Behavioral trajectory projection');
        return [
            `📈 **BEHAVIORAL TRAJECTORY: ${params.domain.toUpperCase()}**`,
            '',
            `═══════════════════════════════════`,
            `📊 **CURRENT STATE**`,
            `═══════════════════════════════════`,
            ``,
            `Score: ${Math.round(currentState)}/100`,
            `Trend: ${trend.toUpperCase()} ${trend === 'improving' ? '📈' : trend === 'declining' ? '📉' : '➡️'}`,
            `Data points: ${dataPoints}`,
            '',
            `═══════════════════════════════════`,
            `🔮 **PROJECTIONS (if current patterns continue)**`,
            `═══════════════════════════════════`,
            '',
            `📅 **1 Month:**  ${Math.round(projections.month1)}/100`,
            `📅 **3 Months:** ${Math.round(projections.month3)}/100`,
            `📅 **6 Months:** ${Math.round(projections.month6)}/100`,
            `📅 **12 Months:** ${Math.round(projections.month12)}/100`,
            '',
            `═══════════════════════════════════`,
            `📉 **TRAJECTORY VISUALIZATION**`,
            `═══════════════════════════════════`,
            '',
            `Now   1mo   3mo   6mo   12mo`,
            `${createBar(currentState)} ${createBar(projections.month1)} ${createBar(projections.month3)} ${createBar(projections.month6)} ${createBar(projections.month12)}`,
            '',
            `═══════════════════════════════════`,
            `🎯 **INTERVENTION OPPORTUNITIES**`,
            `═══════════════════════════════════`,
            '',
            ...interventions.map(i => `• ${i}`),
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            trend === 'declining'
                ? `The trajectory is concerning. Small problems compound into big ones. Act now.`
                : trend === 'improving'
                    ? `You're on a good path. The question isn't IF you'll improve, but how fast.`
                    : `Stability can be good or bad. Are you plateaued at a level you want?`,
            '',
            dataPoints < 10
                ? `**Note:** Limited data (${dataPoints} points). Predictions improve with more tracking.`
                : '',
        ].filter(Boolean).join('\n');
    },
});
function createBar(value) {
    // Clamp value between 0 and 100 to prevent negative repeat counts
    const clampedValue = Math.max(0, Math.min(100, value));
    const filled = Math.round(clampedValue / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
// ============================================================================
// HABIT SURVIVAL ANALYZER
// ============================================================================
export const recordHabit = llm.tool({
    description: 'Record a habit completion or break. Over time, Peter will predict which habits will survive.',
    parameters: z.object({
        habitName: z.string().describe('Name of the habit'),
        completed: z.boolean().describe('Did you complete it today?'),
        notes: z.string().optional().describe('Any notes'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userHabits = habitStore.get(userId) || [];
        let habit = userHabits.find(h => h.name.toLowerCase() === params.habitName.toLowerCase());
        if (!habit) {
            habit = {
                id: `habit_${Date.now()}`,
                name: params.habitName,
                type: 'custom',
                startDate: new Date(),
                streak: params.completed ? 1 : 0,
                longestStreak: params.completed ? 1 : 0,
                completions: params.completed ? [new Date()] : [],
                breaks: params.completed ? [] : [{ date: new Date(), reason: params.notes }],
                status: 'active',
            };
            userHabits.push(habit);
        }
        else {
            if (params.completed) {
                habit.streak++;
                habit.longestStreak = Math.max(habit.longestStreak, habit.streak);
                habit.completions.push(new Date());
            }
            else {
                habit.breaks.push({ date: new Date(), reason: params.notes });
                habit.streak = 0;
            }
        }
        habitStore.set(userId, userHabits);
        return [
            params.completed ? `✅ ${params.habitName} completed!` : `📝 ${params.habitName} break recorded`,
            '',
            `🔥 Current streak: ${habit.streak} days`,
            `🏆 Longest streak: ${habit.longestStreak} days`,
            `📊 Total completions: ${habit.completions.length}`,
            '',
            habit.completions.length >= 14
                ? `Ready for habit survival analysis!`
                : `${14 - habit.completions.length} more days until survival prediction.`,
        ].join('\n');
    },
});
export const analyzeHabitSurvival = llm.tool({
    description: "Predict whether a habit will survive based on YOUR patterns. See survival probability over time and risk periods.",
    parameters: z.object({
        habitName: z.string().describe('Name of the habit to analyze'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userHabits = habitStore.get(userId) || [];
        const habit = userHabits.find(h => h.name.toLowerCase().includes(params.habitName.toLowerCase()));
        if (!habit) {
            return [
                `📊 **HABIT SURVIVAL ANALYSIS**`,
                '',
                `I don't have data on "${params.habitName}".`,
                '',
                `Your tracked habits:`,
                ...userHabits.map(h => `• ${h.name} (${h.streak} day streak)`),
            ].join('\n');
        }
        // Calculate survival metrics
        const daysSinceStart = (Date.now() - habit.startDate.getTime()) / (1000 * 60 * 60 * 24);
        const completionRate = daysSinceStart > 0 ? (habit.completions.length / daysSinceStart) * 100 : 0;
        const breakCount = habit.breaks.length;
        // Calculate survival curve (simplified Kaplan-Meier style)
        const survivalCurve = [
            { day: 7, probability: completionRate > 80 ? 90 : completionRate > 50 ? 70 : 40 },
            { day: 14, probability: completionRate > 80 ? 85 : completionRate > 50 ? 55 : 25 },
            { day: 30, probability: completionRate > 80 ? 75 : completionRate > 50 ? 40 : 15 },
            { day: 66, probability: completionRate > 80 ? 65 : completionRate > 50 ? 30 : 10 },
            { day: 90, probability: completionRate > 80 ? 60 : completionRate > 50 ? 25 : 8 },
        ];
        // Identify risk periods
        const riskPeriods = [];
        if (daysSinceStart < 7) {
            riskPeriods.push({ period: 'Days 3-7', risk: 'high', reason: 'Initial motivation fading' });
        }
        if (daysSinceStart < 21) {
            riskPeriods.push({ period: 'Days 14-21', risk: 'high', reason: 'The "21-day myth" danger zone' });
        }
        riskPeriods.push({ period: 'After disruptions', risk: 'medium', reason: 'Travel, illness, holidays' });
        // Current survival probability
        const currentSurvival = survivalCurve.find(s => s.day >= daysSinceStart)?.probability || 60;
        log.info({ userId, habit: habit.name, survival: currentSurvival }, '📊 Habit survival analysis');
        return [
            `📊 **HABIT SURVIVAL ANALYSIS: ${habit.name.toUpperCase()}**`,
            '',
            `═══════════════════════════════════`,
            `📈 **CURRENT STATUS**`,
            `═══════════════════════════════════`,
            '',
            `• Days tracked: ${Math.round(daysSinceStart)}`,
            `• Current streak: ${habit.streak}`,
            `• Longest streak: ${habit.longestStreak}`,
            `• Completion rate: ${completionRate.toFixed(0)}%`,
            `• Total breaks: ${breakCount}`,
            '',
            `═══════════════════════════════════`,
            `🎯 **SURVIVAL PROBABILITY: ${currentSurvival}%**`,
            `═══════════════════════════════════`,
            '',
            `**Survival Curve (probability of still doing this habit):**`,
            '',
            ...survivalCurve.map(s => {
                const bar = '█'.repeat(Math.round(s.probability / 10)) + '░'.repeat(10 - Math.round(s.probability / 10));
                const marker = s.day <= daysSinceStart ? ' ← YOU ARE HERE' : '';
                return `Day ${s.day.toString().padStart(2)}: ${bar} ${s.probability}%${marker}`;
            }),
            '',
            `═══════════════════════════════════`,
            `⚠️ **RISK PERIODS**`,
            `═══════════════════════════════════`,
            '',
            ...riskPeriods.map(r => `• **${r.period}** (${r.risk} risk): ${r.reason}`),
            '',
            `═══════════════════════════════════`,
            `💪 **SURVIVAL FACTORS**`,
            `═══════════════════════════════════`,
            '',
            completionRate > 70 ? `✅ Strong consistency - major survival factor` : `⚠️ Consistency needs work`,
            habit.longestStreak >= 14 ? `✅ Proven ability to maintain streaks` : `⚠️ Build longer streaks`,
            breakCount < 3 ? `✅ Few breaks - good recovery` : `⚠️ Multiple breaks - address root cause`,
            '',
            `═══════════════════════════════════`,
            `🔧 **TO IMPROVE SURVIVAL**`,
            `═══════════════════════════════════`,
            '',
            `• Make it smaller (2-minute version for bad days)`,
            `• Stack it with an existing habit`,
            `• Prepare for risk periods in advance`,
            `• One break doesn't kill a habit - immediate restart does`,
        ].join('\n');
    },
});
// ============================================================================
// COUNTERFACTUAL ANALYZER
// ============================================================================
export const analyzeCounterfactual = llm.tool({
    description: "What would have happened if you'd made a different choice? Backtest your decisions against alternatives.",
    parameters: z.object({
        decision: z.string().describe('The decision you made'),
        alternative: z.string().describe('What you could have done instead'),
        domain: z.enum(['financial', 'career', 'health', 'relationship', 'habit'])
            .describe('Domain of decision'),
        timeframe: z.string().describe('How long ago (e.g., "6 months", "1 year")'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        log.info({ userId, decision: params.decision, domain: params.domain }, '🔄 Counterfactual analysis');
        // Domain-specific counterfactual patterns
        const patterns = {
            financial: {
                factors: [
                    'Market conditions during the period',
                    'Opportunity cost of capital',
                    'Tax implications',
                    'Emotional cost of the alternative',
                ],
                uncertainties: [
                    'Future market movements are unpredictable',
                    'Your behavior might have changed with different choice',
                    'External factors could have shifted',
                ],
            },
            career: {
                factors: [
                    'Skills developed vs. skills missed',
                    'Network effects',
                    'Income trajectory',
                    'Life satisfaction impact',
                ],
                uncertainties: [
                    'The alternative path had its own challenges',
                    'Grass often seems greener',
                    'You might have made different subsequent choices',
                ],
            },
            health: {
                factors: [
                    'Physical outcome differences',
                    'Time investment comparison',
                    'Sustainability of each approach',
                    'Mental health impact',
                ],
                uncertainties: [
                    'Individual response varies significantly',
                    'Adherence affects outcomes',
                    'Other life factors interact',
                ],
            },
            habit: {
                factors: [
                    'Cascade effects to other habits',
                    'Identity shift implications',
                    'Time and energy allocation',
                    'Long-term trajectory difference',
                ],
                uncertainties: [
                    'Consistency matters more than the specific habit',
                    'Your future self might have different priorities',
                    'Both paths had failure modes',
                ],
            },
            relationship: {
                factors: [
                    'Emotional investment comparison',
                    'Opportunity cost (other relationships)',
                    'Personal growth difference',
                    'Support system impact',
                ],
                uncertainties: [
                    'Relationships are co-created',
                    'Both parties would have evolved differently',
                    'External circumstances affect all paths',
                ],
            },
        };
        const domainPatterns = patterns[params.domain] || patterns.habit;
        return [
            `🔄 **COUNTERFACTUAL ANALYSIS**`,
            '',
            `**What you did:** "${params.decision}"`,
            `**What you could have done:** "${params.alternative}"`,
            `**Timeframe:** ${params.timeframe} ago`,
            '',
            `═══════════════════════════════════`,
            `⚖️ **COMPARISON FRAMEWORK**`,
            `═══════════════════════════════════`,
            '',
            `**Factors to consider:**`,
            ...domainPatterns.factors.map(f => `• ${f}`),
            '',
            `═══════════════════════════════════`,
            `❓ **KEY UNCERTAINTIES**`,
            `═══════════════════════════════════`,
            '',
            ...domainPatterns.uncertainties.map(u => `• ${u}`),
            '',
            `═══════════════════════════════════`,
            `🎯 **HONEST ASSESSMENT**`,
            `═══════════════════════════════════`,
            '',
            `The truth about counterfactuals:`,
            '',
            `1. **You can't actually know** - The alternative path had hidden challenges`,
            `2. **Hindsight bias is strong** - You're judging with information you didn't have`,
            `3. **You would have been different** - The alternative choice changes YOU`,
            `4. **Both paths had variance** - Good and bad outcomes were possible either way`,
            '',
            `═══════════════════════════════════`,
            `💡 **USEFUL QUESTIONS**`,
            `═══════════════════════════════════`,
            '',
            `Instead of "what if?", ask:`,
            `• What did I learn from this path that I couldn't have learned otherwise?`,
            `• What would I do differently NOW with what I know?`,
            `• Is there a way to capture some benefits of the alternative going forward?`,
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Counterfactual thinking is useful for learning, dangerous for regret.`,
            ``,
            `The decision you made was the best you could with the information you had.`,
            `Use this analysis to make FUTURE decisions better, not to torture yourself about the past.`,
        ].join('\n');
    },
});
// ============================================================================
// LIFE EVENT IMPACT PREDICTOR
// ============================================================================
export const predictLifeEventImpact = llm.tool({
    description: "Predict how a major life event will ripple through your life. See impacts across domains and timeline.",
    parameters: z.object({
        event: z.string().describe('The life event'),
        eventType: z.enum([
            'job_change',
            'move',
            'relationship_start',
            'relationship_end',
            'child',
            'health_change',
            'financial_windfall',
            'financial_loss',
            'education_start',
            'retirement',
        ]).describe('Type of event'),
        magnitude: z.enum(['minor', 'moderate', 'major']).describe('Size of the event'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        log.info({ userId, event: params.event, type: params.eventType }, '🌊 Life event impact prediction');
        // Impact patterns by event type
        const impactPatterns = {
            job_change: {
                areas: [
                    { area: 'Income', impact: 'major', duration: 'permanent', peakTime: 'immediate' },
                    { area: 'Stress', impact: 'major', duration: '3-6 months', peakTime: 'first month' },
                    { area: 'Relationships', impact: 'moderate', duration: '6 months', peakTime: '2-3 months' },
                    { area: 'Identity', impact: 'moderate', duration: '6-12 months', peakTime: '3-6 months' },
                    { area: 'Habits', impact: 'major', duration: '2-3 months', peakTime: 'first month' },
                ],
                preparation: [
                    'Build 6-month emergency fund',
                    'Document your current routines',
                    'Strengthen key relationships before the change',
                ],
                warnings: [
                    'Existing habits will be disrupted - expect this',
                    'Decision quality decreases during high-stress transitions',
                    "Don't make other big decisions for 3 months",
                ],
                recovery: '3-6 months to new normal',
            },
            move: {
                areas: [
                    { area: 'Routines', impact: 'major', duration: '2-3 months', peakTime: 'first month' },
                    { area: 'Relationships', impact: 'major', duration: '6-12 months', peakTime: '3-6 months' },
                    { area: 'Finances', impact: 'major', duration: '3 months', peakTime: 'first month' },
                    { area: 'Mental health', impact: 'moderate', duration: '6 months', peakTime: '2-3 months' },
                ],
                preparation: [
                    'Identify anchor habits that travel with you',
                    'Schedule regular calls with important people',
                    'Budget for hidden costs (30% more than expected)',
                ],
                warnings: [
                    'Loneliness peaks at 3-6 months, not immediately',
                    'Takes ~2 years to rebuild social network',
                    'Expect productivity dip for 2-3 months',
                ],
                recovery: '6-12 months to feel settled',
            },
            health_change: {
                areas: [
                    { area: 'Energy', impact: 'major', duration: 'varies', peakTime: 'first 3 months' },
                    { area: 'Mood', impact: 'major', duration: '6+ months', peakTime: 'first month' },
                    { area: 'Relationships', impact: 'moderate', duration: 'ongoing', peakTime: '1-2 months' },
                    { area: 'Finances', impact: 'moderate', duration: 'ongoing', peakTime: '2-3 months' },
                    { area: 'Identity', impact: 'major', duration: '12+ months', peakTime: '3-6 months' },
                ],
                preparation: [
                    'Build support system before you need it',
                    'Simplify other areas of life',
                    'Document what helps and what doesn\'t',
                ],
                warnings: [
                    'Grief is normal even for non-terminal changes',
                    'Others may not understand the invisible impacts',
                    'Recovery is rarely linear',
                ],
                recovery: 'Highly individual - be patient',
            },
            relationship_start: {
                areas: [
                    { area: 'Time allocation', impact: 'major', duration: 'permanent', peakTime: 'first 6 months' },
                    { area: 'Friendships', impact: 'moderate', duration: '6-12 months', peakTime: '3-6 months' },
                    { area: 'Finances', impact: 'moderate', duration: 'permanent', peakTime: '6-12 months' },
                    { area: 'Habits', impact: 'moderate', duration: '3-6 months', peakTime: '2-3 months' },
                ],
                preparation: [
                    'Maintain existing friendships intentionally',
                    'Discuss financial approaches early',
                    'Keep some individual identity/activities',
                ],
                warnings: [
                    'NRE (new relationship energy) skews judgment',
                    'Existing habits often slip - protect keystones',
                    "Don't make major decisions in first 6 months",
                ],
                recovery: 'N/A - this is a positive event',
            },
            relationship_end: {
                areas: [
                    { area: 'Emotional wellbeing', impact: 'major', duration: '6-12 months', peakTime: '1-3 months' },
                    { area: 'Social network', impact: 'major', duration: '6+ months', peakTime: '2-4 months' },
                    { area: 'Finances', impact: 'major', duration: '6 months', peakTime: 'immediate' },
                    { area: 'Identity', impact: 'major', duration: '12+ months', peakTime: '3-6 months' },
                    { area: 'Productivity', impact: 'major', duration: '3-6 months', peakTime: '1-2 months' },
                ],
                preparation: [
                    'Secure financial independence',
                    'Identify your support people',
                    'Lower expectations for productivity',
                ],
                warnings: [
                    'Major decisions during grief are often regretted',
                    'The "I\'m fine" phase is often followed by delayed grief',
                    'Recovery is not linear - expect waves',
                ],
                recovery: '6-18 months depending on duration/intensity',
            },
            financial_windfall: {
                areas: [
                    { area: 'Stress (initially)', impact: 'moderate', duration: '1-3 months', peakTime: 'first month' },
                    { area: 'Relationships', impact: 'moderate', duration: '6+ months', peakTime: '2-4 months' },
                    { area: 'Decision quality', impact: 'major', duration: '3 months', peakTime: 'first month' },
                    { area: 'Lifestyle inflation', impact: 'major', duration: 'permanent', peakTime: '3-6 months' },
                ],
                preparation: [
                    'Wait 3-6 months before major decisions',
                    'Tell as few people as possible',
                    'Work with a fee-only financial advisor',
                ],
                warnings: [
                    '70% of lottery winners end up worse off',
                    'Lifestyle inflation is the #1 danger',
                    "Money amplifies existing patterns - good and bad",
                ],
                recovery: 'N/A - focus on not creating problems',
            },
            child: {
                areas: [
                    { area: 'Sleep', impact: 'major', duration: '2+ years', peakTime: 'first year' },
                    { area: 'Relationship', impact: 'major', duration: 'permanent', peakTime: 'first 2 years' },
                    { area: 'Finances', impact: 'major', duration: 'permanent', peakTime: 'ongoing' },
                    { area: 'Identity', impact: 'major', duration: 'permanent', peakTime: 'first year' },
                    { area: 'Time', impact: 'major', duration: 'permanent', peakTime: 'first 5 years' },
                ],
                preparation: [
                    'Build habits NOW that can survive sleep deprivation',
                    'Strengthen relationship before baby arrives',
                    'Build financial buffer for unexpected costs',
                ],
                warnings: [
                    'Everything takes 3x longer than expected',
                    'Relationship satisfaction typically dips - this is normal',
                    "Self-care isn't selfish, it's necessary",
                ],
                recovery: 'New normal emerges around 6-12 months',
            },
            retirement: {
                areas: [
                    { area: 'Identity', impact: 'major', duration: '12-24 months', peakTime: '3-6 months' },
                    { area: 'Purpose', impact: 'major', duration: '12+ months', peakTime: '6-12 months' },
                    { area: 'Social connections', impact: 'major', duration: 'permanent', peakTime: '6-12 months' },
                    { area: 'Health', impact: 'moderate', duration: 'permanent', peakTime: '12+ months' },
                ],
                preparation: [
                    'Develop identity beyond work BEFORE retiring',
                    'Build social connections outside work',
                    'Have a "to" not just "from" - retire TO something',
                ],
                warnings: [
                    'Depression peaks 6-12 months after retirement',
                    'Health often declines without structure',
                    'Marital stress increases with more time together',
                ],
                recovery: '12-24 months to find new rhythm',
            },
            education_start: {
                areas: [
                    { area: 'Time', impact: 'major', duration: 'program length', peakTime: 'first semester' },
                    { area: 'Finances', impact: 'major', duration: 'program length+', peakTime: 'ongoing' },
                    { area: 'Stress', impact: 'major', duration: 'program length', peakTime: 'finals/deadlines' },
                    { area: 'Relationships', impact: 'moderate', duration: 'program length', peakTime: 'first 6 months' },
                ],
                preparation: [
                    'Build sustainable study habits before starting',
                    'Communicate expectations with family/friends',
                    'Create financial plan for the full duration',
                ],
                warnings: [
                    'Imposter syndrome is normal and temporary',
                    'Protect sleep - it affects learning more than extra study time',
                    "First semester grades don't predict success",
                ],
                recovery: 'Adjustment within first semester',
            },
            financial_loss: {
                areas: [
                    { area: 'Stress', impact: 'major', duration: '6-12 months', peakTime: 'first 3 months' },
                    { area: 'Relationships', impact: 'moderate', duration: '6 months', peakTime: '2-4 months' },
                    { area: 'Decision quality', impact: 'major', duration: '3 months', peakTime: 'first month' },
                    { area: 'Identity', impact: 'moderate', duration: '6+ months', peakTime: '2-4 months' },
                ],
                preparation: [
                    'Separate self-worth from net worth',
                    'Focus on what you can control',
                    'Avoid compounding with bad decisions',
                ],
                warnings: [
                    'Shame leads to isolation - stay connected',
                    'Recovery often takes longer than expected',
                    "Don't try to 'make it back' through risk",
                ],
                recovery: '6-24 months depending on severity',
            },
        };
        const pattern = impactPatterns[params.eventType] || impactPatterns.job_change;
        const magnitudeMultiplier = { minor: 0.5, moderate: 1, major: 1.5 };
        return [
            `🌊 **LIFE EVENT IMPACT PREDICTION**`,
            '',
            `Event: "${params.event}"`,
            `Type: ${params.eventType.replace('_', ' ')}`,
            `Magnitude: ${params.magnitude}`,
            '',
            `═══════════════════════════════════`,
            `📊 **PREDICTED IMPACTS BY AREA**`,
            `═══════════════════════════════════`,
            '',
            ...pattern.areas.map(a => [
                `**${a.area}**`,
                `• Impact: ${a.impact}`,
                `• Duration: ${a.duration}`,
                `• Peak difficulty: ${a.peakTime}`,
                '',
            ].join('\n')),
            `═══════════════════════════════════`,
            `📝 **PREPARATION STEPS**`,
            `═══════════════════════════════════`,
            '',
            ...pattern.preparation.map(p => `• ${p}`),
            '',
            `═══════════════════════════════════`,
            `⚠️ **WARNING SIGNALS**`,
            `═══════════════════════════════════`,
            '',
            ...pattern.warnings.map(w => `• ${w}`),
            '',
            `═══════════════════════════════════`,
            `⏰ **RECOVERY TIMELINE**`,
            `═══════════════════════════════════`,
            '',
            pattern.recovery,
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Life events ripple. Knowing the pattern helps you:`,
            `1. Prepare for predictable challenges`,
            `2. Not blame yourself for normal difficulties`,
            `3. Know when to push and when to wait`,
            '',
            `The timeline isn't a deadline - it's a permission slip to take the time you need.`,
        ].join('\n');
    },
});
// ============================================================================
// EXPORT
// ============================================================================
export const predictiveModelingTools = {
    recordGoalProgress,
    predictGoalSuccess,
    projectBehavioralTrajectory,
    recordHabit,
    analyzeHabitSurvival,
    analyzeCounterfactual,
    predictLifeEventImpact,
};
export default predictiveModelingTools;
//# sourceMappingURL=predictive-modeling.js.map