/**
 * Personal Experimentation Tools
 *
 * These tools help users apply scientific method to their own lives:
 * A/B testing, Bayesian belief updating, hypothesis tracking,
 * confound detection, and effect size calculation.
 *
 * "Better than Human" because: No friend can help you design proper
 * experiments and interpret results without bias.
 *
 * @module tools/domains/research/superhuman-tools/experimentation
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getUserIdFromContext, saveExperiment, saveBelief, saveHypothesis, } from './firestore-persistence.js';
const log = getLogger();
// ============================================================================
// LOCAL CACHES (sync with Firestore on read/write)
// ============================================================================
const experimentStore = new Map();
const beliefStore = new Map();
const hypothesisStore = new Map();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateCohenD(group1, group2) {
    const mean1 = group1.reduce((a, b) => a + b, 0) / group1.length;
    const mean2 = group2.reduce((a, b) => a + b, 0) / group2.length;
    const var1 = group1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (group1.length - 1);
    const var2 = group2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (group2.length - 1);
    const pooledSD = Math.sqrt(((group1.length - 1) * var1 + (group2.length - 1) * var2) / (group1.length + group2.length - 2));
    return pooledSD === 0 ? 0 : (mean1 - mean2) / pooledSD;
}
function interpretEffectSize(d) {
    const absD = Math.abs(d);
    if (absD < 0.2)
        return 'negligible';
    if (absD < 0.5)
        return 'small';
    if (absD < 0.8)
        return 'medium';
    if (absD < 1.2)
        return 'large';
    return 'very_large';
}
// ============================================================================
// PERSONAL A/B TEST DESIGNER
// ============================================================================
export const designExperiment = llm.tool({
    description: "Design a personal A/B test with proper experimental methodology. Test if an intervention actually works for YOU, not just in general.",
    parameters: z.object({
        hypothesis: z.string().describe('What you want to test (e.g., "Morning exercise improves my focus")'),
        intervention: z.string().describe('What you will change (e.g., "30 min morning workout")'),
        metric: z.string().describe('How you will measure success (e.g., "Focus score 1-10")'),
        duration: z.number().min(7).max(90).describe('Days to run the experiment'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const experiment = {
            id: `exp_${Date.now()}`,
            userId,
            hypothesis: params.hypothesis,
            variable: params.intervention,
            controlCondition: 'No intervention (baseline)',
            treatmentCondition: params.intervention,
            metric: params.metric,
            startDate: new Date(),
            status: 'designing',
            dataPoints: [],
        };
        const userExperiments = experimentStore.get(userId) || [];
        userExperiments.push(experiment);
        experimentStore.set(userId, userExperiments);
        // Persist to Firestore
        try {
            await saveExperiment(userId, experiment);
        }
        catch (err) {
            log.error({ err }, 'Failed to persist experiment');
        }
        // Calculate schedule
        const controlDays = Math.floor(params.duration / 2);
        const treatmentDays = params.duration - controlDays;
        log.info({ userId, hypothesis: params.hypothesis }, '🧪 Experiment designed');
        return [
            `🧪 **PERSONAL EXPERIMENT DESIGNED**`,
            '',
            `═══════════════════════════════════`,
            `📋 **EXPERIMENT OVERVIEW**`,
            `═══════════════════════════════════`,
            '',
            `**Hypothesis:** ${params.hypothesis}`,
            `**Intervention:** ${params.intervention}`,
            `**Metric:** ${params.metric}`,
            `**Duration:** ${params.duration} days`,
            '',
            `═══════════════════════════════════`,
            `📅 **EXPERIMENTAL DESIGN**`,
            `═══════════════════════════════════`,
            '',
            `**Phase 1: Control (Baseline)**`,
            `• Days 1-${controlDays}`,
            `• NO intervention`,
            `• Record ${params.metric} daily`,
            '',
            `**Phase 2: Treatment**`,
            `• Days ${controlDays + 1}-${params.duration}`,
            `• Apply: ${params.intervention}`,
            `• Record ${params.metric} daily`,
            '',
            `═══════════════════════════════════`,
            `⚠️ **METHODOLOGY RULES**`,
            `═══════════════════════════════════`,
            '',
            `1. **Same time each day** - Measure at consistent time`,
            `2. **Blind yourself** - Don't let expectations bias scores`,
            `3. **No other changes** - Keep everything else constant`,
            `4. **Record honestly** - Write before you think`,
            `5. **Complete both phases** - Partial data is misleading`,
            '',
            `═══════════════════════════════════`,
            `🎯 **SUCCESS CRITERIA**`,
            `═══════════════════════════════════`,
            '',
            `For this to be meaningful:`,
            `• Need ${Math.min(14, controlDays)} measurements per phase minimum`,
            `• Effect size should be "medium" (0.5+) to be noticeable`,
            `• Consistency matters more than magnitude`,
            '',
            `═══════════════════════════════════`,
            `💡 **GETTING STARTED**`,
            `═══════════════════════════════════`,
            '',
            `Start recording "${params.metric}" TODAY.`,
            `Tell me your daily scores and I'll track everything.`,
            '',
            `When you're ready to record: "Log experiment data: [score]"`,
        ].join('\n');
    },
});
export const recordExperimentData = llm.tool({
    description: "Record a data point for your active experiment.",
    parameters: z.object({
        value: z.number().describe('Your measurement for today'),
        condition: z.enum(['control', 'treatment']).describe('Are you in control or treatment phase?'),
        notes: z.string().optional().describe('Any relevant notes'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userExperiments = experimentStore.get(userId) || [];
        const activeExperiment = userExperiments.find(e => e.status === 'designing' || e.status === 'running');
        if (!activeExperiment) {
            return 'No active experiment found. Design one first with "Design an experiment"';
        }
        activeExperiment.status = 'running';
        activeExperiment.dataPoints.push({
            date: new Date(),
            condition: params.condition,
            value: params.value,
        });
        const controlData = activeExperiment.dataPoints.filter(d => d.condition === 'control');
        const treatmentData = activeExperiment.dataPoints.filter(d => d.condition === 'treatment');
        return [
            `✅ Data recorded!`,
            '',
            `**${params.condition.toUpperCase()}:** ${params.value}`,
            params.notes ? `Notes: ${params.notes}` : '',
            '',
            `**Progress:**`,
            `• Control data points: ${controlData.length}`,
            `• Treatment data points: ${treatmentData.length}`,
            '',
            controlData.length >= 7 && treatmentData.length >= 7
                ? `🎯 Ready for analysis! Say "Analyze my experiment"`
                : `Keep recording. Need at least 7 points per phase.`,
        ].filter(Boolean).join('\n');
    },
});
export const analyzeExperiment = llm.tool({
    description: "Analyze your personal experiment results. Get effect size, statistical interpretation, and actionable conclusion.",
    parameters: z.object({}),
    execute: async (_params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userExperiments = experimentStore.get(userId) || [];
        const experiment = userExperiments.find(e => e.status === 'running');
        if (!experiment) {
            return 'No running experiment found. Design and run one first.';
        }
        const controlData = experiment.dataPoints.filter(d => d.condition === 'control').map(d => d.value);
        const treatmentData = experiment.dataPoints.filter(d => d.condition === 'treatment').map(d => d.value);
        if (controlData.length < 5 || treatmentData.length < 5) {
            return [
                `⚠️ **INSUFFICIENT DATA**`,
                '',
                `Control points: ${controlData.length} (need 5+)`,
                `Treatment points: ${treatmentData.length} (need 5+)`,
                '',
                `Keep recording data before analysis.`,
            ].join('\n');
        }
        // Calculate statistics
        const controlMean = controlData.reduce((a, b) => a + b, 0) / controlData.length;
        const treatmentMean = treatmentData.reduce((a, b) => a + b, 0) / treatmentData.length;
        const effectSize = calculateCohenD(treatmentData, controlData);
        const interpretation = interpretEffectSize(effectSize);
        const direction = treatmentMean > controlMean ? 'positive' : treatmentMean < controlMean ? 'negative' : 'none';
        // Mark complete
        experiment.status = 'complete';
        experiment.endDate = new Date();
        experiment.result = {
            effectSize,
            significant: Math.abs(effectSize) >= 0.5,
            confidence: Math.min(0.95, 0.5 + (controlData.length + treatmentData.length) * 0.02),
            conclusion: Math.abs(effectSize) >= 0.5
                ? `The intervention appears to have a ${interpretation} effect.`
                : `The intervention does not appear to have a meaningful effect.`,
        };
        log.info({ userId, effectSize, interpretation }, '📊 Experiment analyzed');
        return [
            `📊 **EXPERIMENT RESULTS**`,
            '',
            `**Hypothesis:** ${experiment.hypothesis}`,
            `**Intervention:** ${experiment.variable}`,
            '',
            `═══════════════════════════════════`,
            `📈 **DATA SUMMARY**`,
            `═══════════════════════════════════`,
            '',
            `**Control Phase:**`,
            `• Data points: ${controlData.length}`,
            `• Average: ${controlMean.toFixed(2)}`,
            '',
            `**Treatment Phase:**`,
            `• Data points: ${treatmentData.length}`,
            `• Average: ${treatmentMean.toFixed(2)}`,
            '',
            `**Change:** ${direction === 'positive' ? '+' : ''}${(treatmentMean - controlMean).toFixed(2)} (${((treatmentMean - controlMean) / controlMean * 100).toFixed(1)}%)`,
            '',
            `═══════════════════════════════════`,
            `🎯 **EFFECT SIZE ANALYSIS**`,
            `═══════════════════════════════════`,
            '',
            `**Cohen's d:** ${effectSize.toFixed(2)}`,
            `**Interpretation:** ${interpretation.toUpperCase()}`,
            '',
            `Effect Size Scale:`,
            `• 0.0-0.2: Negligible`,
            `• 0.2-0.5: Small`,
            `• 0.5-0.8: Medium ← Noticeable in daily life`,
            `• 0.8-1.2: Large`,
            `• 1.2+: Very Large`,
            '',
            `═══════════════════════════════════`,
            `✅ **CONCLUSION**`,
            `═══════════════════════════════════`,
            '',
            Math.abs(effectSize) >= 0.8
                ? `🟢 **STRONG EFFECT DETECTED**\n\nThe intervention has a large effect. This is meaningful and likely worth continuing.`
                : Math.abs(effectSize) >= 0.5
                    ? `🟢 **MODERATE EFFECT DETECTED**\n\nThe intervention has a noticeable effect. Consider continuing and monitoring.`
                    : Math.abs(effectSize) >= 0.2
                        ? `🟡 **WEAK EFFECT**\n\nThere's a small effect, but it may not be worth the effort. Consider if easier alternatives exist.`
                        : `🔴 **NO MEANINGFUL EFFECT**\n\nThe intervention doesn't appear to make a difference for YOU. Try something else.`,
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `This is YOUR data, not a study average.`,
            `What works for others may not work for you - and now you KNOW.`,
            '',
            Math.abs(effectSize) >= 0.5
                ? `The effect is real. The question is: Is it worth the cost (time, effort, money)?`
                : `Don't force what doesn't work. Your time is better spent testing something else.`,
        ].join('\n');
    },
});
// ============================================================================
// BAYESIAN BELIEF UPDATER
// ============================================================================
export const createBelief = llm.tool({
    description: "Track a belief and update it with evidence over time. See how your confidence should change based on new information.",
    parameters: z.object({
        statement: z.string().describe('The belief statement'),
        initialProbability: z.number().min(1).max(99).describe('Your initial probability estimate (1-99%)'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const belief = {
            beliefId: `belief_${Date.now()}`,
            statement: params.statement,
            priorProbability: params.initialProbability / 100,
            posteriorProbability: params.initialProbability / 100,
            evidenceHistory: [],
            currentConfidence: params.initialProbability < 20 ? 'very_low'
                : params.initialProbability < 40 ? 'low'
                    : params.initialProbability < 60 ? 'moderate'
                        : params.initialProbability < 80 ? 'high'
                            : 'very_high',
        };
        const userBeliefs = beliefStore.get(userId) || [];
        userBeliefs.push(belief);
        beliefStore.set(userId, userBeliefs);
        // Persist to Firestore
        try {
            await saveBelief(userId, belief);
        }
        catch (err) {
            log.error({ err }, 'Failed to persist belief');
        }
        return [
            `🧠 **BELIEF TRACKER CREATED**`,
            '',
            `**Statement:** "${params.statement}"`,
            `**Initial Probability:** ${params.initialProbability}%`,
            '',
            `═══════════════════════════════════`,
            `📊 **HOW THIS WORKS**`,
            `═══════════════════════════════════`,
            '',
            `When you encounter evidence:`,
            `1. Tell me what you learned`,
            `2. Rate how strongly it supports/opposes the belief`,
            `3. I'll calculate your new rational probability`,
            '',
            `This prevents:`,
            `• Confirmation bias (ignoring counter-evidence)`,
            `• Overconfidence (not updating enough)`,
            `• Underconfidence (updating too much)`,
            '',
            `**To add evidence:** "Update belief: [evidence]"`,
        ].join('\n');
    },
});
export const updateBelief = llm.tool({
    description: "Update a belief with new evidence. Uses Bayesian reasoning to calculate your new rational probability.",
    parameters: z.object({
        beliefKeyword: z.string().describe('Keyword to find the belief'),
        evidence: z.string().describe('What new evidence did you encounter?'),
        direction: z.enum(['supports', 'opposes', 'neutral']).describe('Does it support or oppose the belief?'),
        strength: z.enum(['weak', 'moderate', 'strong']).describe('How strong is the evidence?'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const userBeliefs = beliefStore.get(userId) || [];
        const belief = userBeliefs.find(b => b.statement.toLowerCase().includes(params.beliefKeyword.toLowerCase()));
        if (!belief) {
            return [
                `Belief not found. Your tracked beliefs:`,
                ...userBeliefs.map(b => `• "${b.statement.slice(0, 50)}..."`),
            ].join('\n');
        }
        // Calculate likelihood ratio based on evidence strength and direction
        const strengthMultipliers = { weak: 1.5, moderate: 2.5, strong: 5 };
        const multiplier = strengthMultipliers[params.strength];
        let likelihoodRatio;
        if (params.direction === 'supports') {
            likelihoodRatio = multiplier;
        }
        else if (params.direction === 'opposes') {
            likelihoodRatio = 1 / multiplier;
        }
        else {
            likelihoodRatio = 1;
        }
        // Bayesian update: P(H|E) = P(E|H) * P(H) / P(E)
        // Simplified: posterior odds = prior odds * likelihood ratio
        const priorOdds = belief.posteriorProbability / (1 - belief.posteriorProbability);
        const posteriorOdds = priorOdds * likelihoodRatio;
        const newProbability = posteriorOdds / (1 + posteriorOdds);
        // Bound probability
        const boundedProbability = Math.max(0.01, Math.min(0.99, newProbability));
        belief.evidenceHistory.push({
            date: new Date(),
            evidence: params.evidence,
            likelihoodRatio,
            newProbability: boundedProbability,
        });
        const oldProbability = belief.posteriorProbability;
        belief.posteriorProbability = boundedProbability;
        belief.currentConfidence = boundedProbability < 0.2 ? 'very_low'
            : boundedProbability < 0.4 ? 'low'
                : boundedProbability < 0.6 ? 'moderate'
                    : boundedProbability < 0.8 ? 'high'
                        : 'very_high';
        const change = boundedProbability - oldProbability;
        const changeEmoji = change > 0.1 ? '📈' : change < -0.1 ? '📉' : '➡️';
        log.info({ userId, belief: belief.statement.slice(0, 30), newProb: boundedProbability }, '🧠 Belief updated');
        return [
            `🧠 **BELIEF UPDATED**`,
            '',
            `**Belief:** "${belief.statement}"`,
            '',
            `═══════════════════════════════════`,
            `📊 **EVIDENCE PROCESSED**`,
            `═══════════════════════════════════`,
            '',
            `**Evidence:** ${params.evidence}`,
            `**Direction:** ${params.direction}`,
            `**Strength:** ${params.strength}`,
            '',
            `═══════════════════════════════════`,
            `${changeEmoji} **PROBABILITY UPDATE**`,
            `═══════════════════════════════════`,
            '',
            `Before: ${(oldProbability * 100).toFixed(1)}%`,
            `After: ${(boundedProbability * 100).toFixed(1)}%`,
            `Change: ${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`,
            '',
            `**Confidence Level:** ${belief.currentConfidence.replace('_', ' ').toUpperCase()}`,
            '',
            `═══════════════════════════════════`,
            `📜 **EVIDENCE HISTORY**`,
            `═══════════════════════════════════`,
            '',
            `Starting probability: ${(belief.priorProbability * 100).toFixed(1)}%`,
            ...belief.evidenceHistory.slice(-5).map((e, i) => `${i + 1}. ${e.evidence.slice(0, 40)}... → ${(e.newProbability * 100).toFixed(1)}%`),
            '',
            `═══════════════════════════════════`,
            `💡 **WHAT THIS MEANS**`,
            `═══════════════════════════════════`,
            '',
            boundedProbability > 0.8
                ? `High confidence. Act as if this is likely true.`
                : boundedProbability > 0.6
                    ? `Moderately confident. Worth acting on but stay open.`
                    : boundedProbability > 0.4
                        ? `Uncertain. Gather more evidence before acting.`
                        : boundedProbability > 0.2
                            ? `Leaning against. Probably not true.`
                            : `Very unlikely. Consider abandoning this belief.`,
        ].join('\n');
    },
});
// ============================================================================
// HYPOTHESIS TRACKER
// ============================================================================
export const trackHypothesis = llm.tool({
    description: "Track a hypothesis about your life. Build a record of what you test and learn.",
    parameters: z.object({
        hypothesis: z.string().describe('Your hypothesis'),
        domain: z.enum(['health', 'productivity', 'relationships', 'finances', 'habits', 'career', 'other'])
            .describe('Life domain'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        let tracker = hypothesisStore.get(userId);
        if (!tracker) {
            tracker = { userId, hypotheses: [], summary: { total: 0, confirmed: 0, refuted: 0, inconclusive: 0, untested: 0 } };
            hypothesisStore.set(userId, tracker);
        }
        const newHypothesis = {
            id: `hyp_${Date.now()}`,
            userId,
            hypothesis: params.hypothesis,
            domain: params.domain,
            status: 'untested',
            evidence: [],
            testCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        tracker.hypotheses.push({
            id: newHypothesis.id,
            hypothesis: params.hypothesis,
            domain: params.domain,
            status: 'untested',
            evidence: [],
            testCount: 0,
        });
        tracker.summary.total++;
        tracker.summary.untested++;
        // Persist to Firestore
        try {
            await saveHypothesis(userId, newHypothesis);
        }
        catch (err) {
            log.error({ err }, 'Failed to persist hypothesis');
        }
        return [
            `📝 **HYPOTHESIS TRACKED**`,
            '',
            `"${params.hypothesis}"`,
            `Domain: ${params.domain}`,
            '',
            `**Your Hypothesis Portfolio:**`,
            `• Total: ${tracker.summary.total}`,
            `• Untested: ${tracker.summary.untested}`,
            `• Confirmed: ${tracker.summary.confirmed}`,
            `• Refuted: ${tracker.summary.refuted}`,
            `• Inconclusive: ${tracker.summary.inconclusive}`,
            '',
            `**Next steps:**`,
            `1. Design a test for this hypothesis`,
            `2. Record evidence as you gather it`,
            `3. Update the status when you have a conclusion`,
        ].join('\n');
    },
});
export const updateHypothesis = llm.tool({
    description: "Update a hypothesis with evidence or conclusion.",
    parameters: z.object({
        hypothesisKeyword: z.string().describe('Keyword to find the hypothesis'),
        evidence: z.string().optional().describe('New evidence gathered'),
        newStatus: z.enum(['testing', 'confirmed', 'refuted', 'inconclusive']).optional()
            .describe('Update the status'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        if (!userId)
            return 'I need to know who you are.';
        const tracker = hypothesisStore.get(userId);
        if (!tracker)
            return 'No hypotheses tracked yet.';
        const hypothesis = tracker.hypotheses.find(h => h.hypothesis.toLowerCase().includes(params.hypothesisKeyword.toLowerCase()));
        if (!hypothesis) {
            return [
                `Hypothesis not found. Your hypotheses:`,
                ...tracker.hypotheses.map(h => `• "${h.hypothesis.slice(0, 50)}..."`),
            ].join('\n');
        }
        if (params.evidence) {
            hypothesis.evidence.push(params.evidence);
            hypothesis.testCount++;
            hypothesis.lastTested = new Date();
        }
        if (params.newStatus) {
            const oldStatus = hypothesis.status;
            hypothesis.status = params.newStatus;
            // Update summary counts
            if (oldStatus === 'untested')
                tracker.summary.untested--;
            else if (oldStatus === 'confirmed')
                tracker.summary.confirmed--;
            else if (oldStatus === 'refuted')
                tracker.summary.refuted--;
            else if (oldStatus === 'inconclusive')
                tracker.summary.inconclusive--;
            if (params.newStatus === 'confirmed')
                tracker.summary.confirmed++;
            else if (params.newStatus === 'refuted')
                tracker.summary.refuted++;
            else if (params.newStatus === 'inconclusive')
                tracker.summary.inconclusive++;
        }
        return [
            `✅ **HYPOTHESIS UPDATED**`,
            '',
            `"${hypothesis.hypothesis}"`,
            '',
            `Status: ${hypothesis.status.toUpperCase()}`,
            `Tests conducted: ${hypothesis.testCount}`,
            '',
            hypothesis.evidence.length > 0 ? `**Evidence:**` : '',
            ...hypothesis.evidence.slice(-5).map(e => `• ${e}`),
            '',
            `**Portfolio Summary:**`,
            `• Confirmed: ${tracker.summary.confirmed}`,
            `• Refuted: ${tracker.summary.refuted}`,
            `• Inconclusive: ${tracker.summary.inconclusive}`,
            `• Untested: ${tracker.summary.untested}`,
        ].filter(Boolean).join('\n');
    },
});
// ============================================================================
// CONFOUND DETECTOR
// ============================================================================
export const detectConfounds = llm.tool({
    description: "Find potential confounding variables in a correlation you observed. Don't be fooled by spurious relationships.",
    parameters: z.object({
        observation: z.string().describe('The correlation you observed (e.g., "When I exercise, I sleep better")'),
        domain: z.enum(['health', 'productivity', 'finances', 'relationships', 'habits'])
            .describe('Domain of the observation'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        log.info({ userId, observation: params.observation }, '🔍 Detecting confounds');
        // Domain-specific common confounds
        const confoundDatabase = {
            health: [
                { variable: 'Season/Weather', explanation: 'Outdoor activities, vitamin D, and mood all vary by season' },
                { variable: 'Stress levels', explanation: 'Stress affects almost all health outcomes simultaneously' },
                { variable: 'Sleep quality', explanation: 'Sleep impacts energy, mood, cognition, and physical health' },
                { variable: 'Social activity', explanation: 'Social engagement correlates with multiple health behaviors' },
                { variable: 'Work schedule', explanation: 'Work demands affect diet, exercise, sleep, and stress' },
            ],
            productivity: [
                { variable: 'Energy levels', explanation: 'Energy affects both the intervention and the outcome' },
                { variable: 'Time of day', explanation: 'Circadian rhythms affect many cognitive outcomes' },
                { variable: 'Workload variation', explanation: 'External demands affect both behavior and results' },
                { variable: 'Motivation cycles', explanation: 'Motivation affects multiple behaviors simultaneously' },
                { variable: 'Sleep quality', explanation: 'Sleep impacts all cognitive functions' },
            ],
            finances: [
                { variable: 'Income changes', explanation: 'Income affects both spending ability and saving behavior' },
                { variable: 'Life stage', explanation: 'Age, family status affect many financial patterns' },
                { variable: 'Economic conditions', explanation: 'Macro factors affect spending and investing' },
                { variable: 'Stress', explanation: 'Financial stress affects both behavior and outcomes' },
                { variable: 'Social comparison', explanation: 'Peer behavior affects multiple financial decisions' },
            ],
            relationships: [
                { variable: 'Your mood', explanation: 'Your emotional state affects how you perceive and act' },
                { variable: 'Life stress', explanation: 'Stress affects all relationships simultaneously' },
                { variable: 'Time availability', explanation: 'Available time affects quality of all relationships' },
                { variable: 'Their circumstances', explanation: 'Other person\'s situation affects their behavior' },
                { variable: 'Shared context', explanation: 'Events affecting both people can create false correlations' },
            ],
            habits: [
                { variable: 'Willpower depletion', explanation: 'Self-control affects multiple habits at once' },
                { variable: 'Routine disruptions', explanation: 'Travel, illness affect all habits together' },
                { variable: 'Motivation waves', explanation: 'General motivation affects multiple behaviors' },
                { variable: 'Environmental changes', explanation: 'Context changes affect habit cues' },
                { variable: 'Stress/energy', explanation: 'Physical/mental resources affect all habits' },
            ],
        };
        const confounds = confoundDatabase[params.domain] || confoundDatabase.habits;
        return [
            `🔍 **CONFOUND ANALYSIS**`,
            '',
            `**Your observation:** "${params.observation}"`,
            '',
            `═══════════════════════════════════`,
            `⚠️ **POTENTIAL CONFOUNDING VARIABLES**`,
            `═══════════════════════════════════`,
            '',
            ...confounds.map((c, i) => [
                `**${i + 1}. ${c.variable}**`,
                `   ${c.explanation}`,
                '',
            ].join('\n')),
            `═══════════════════════════════════`,
            `🎯 **HOW TO TELL IF IT'S REAL**`,
            `═══════════════════════════════════`,
            '',
            `**Test these questions:**`,
            '',
            `1. Does the relationship hold when [confound] is constant?`,
            `2. Can you explain the mechanism (HOW would A cause B)?`,
            `3. Does the timing make sense (A happens BEFORE B)?`,
            `4. Is there a dose-response (more A = more B)?`,
            '',
            `═══════════════════════════════════`,
            `🧪 **HOW TO CONTROL FOR CONFOUNDS**`,
            `═══════════════════════════════════`,
            '',
            `• Track the potential confound alongside your variables`,
            `• Only compare days when the confound is similar`,
            `• Use A/B testing to isolate the effect`,
            `• Look for natural experiments (forced changes)`,
            '',
            `═══════════════════════════════════`,
            `💡 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Most correlations we notice are confounded.`,
            `The human brain is a pattern-finding machine that doesn't check for confounds.`,
            '',
            `Your observation MIGHT be real. But now you know what to rule out.`,
            `Design a test that controls for the most likely confound.`,
        ].join('\n');
    },
});
// ============================================================================
// EFFECT SIZE CALCULATOR
// ============================================================================
export const calculateEffectSize = llm.tool({
    description: "Calculate whether a change you made actually matters. Raw numbers can be deceiving - effect size tells the truth.",
    parameters: z.object({
        beforeValues: z.array(z.number()).describe('Measurements before the change'),
        afterValues: z.array(z.number()).describe('Measurements after the change'),
        context: z.string().describe('What change are you measuring?'),
    }),
    execute: async (params, { ctx }) => {
        const userId = getUserIdFromContext(ctx);
        log.info({ userId, context: params.context }, '📊 Calculating effect size');
        if (params.beforeValues.length < 3 || params.afterValues.length < 3) {
            return 'Need at least 3 measurements in each group for meaningful analysis.';
        }
        const beforeMean = params.beforeValues.reduce((a, b) => a + b, 0) / params.beforeValues.length;
        const afterMean = params.afterValues.reduce((a, b) => a + b, 0) / params.afterValues.length;
        const rawChange = afterMean - beforeMean;
        const percentChange = (rawChange / beforeMean) * 100;
        const effectSize = calculateCohenD(params.afterValues, params.beforeValues);
        const interpretation = interpretEffectSize(effectSize);
        // Calculate standard deviation for context
        const beforeSD = Math.sqrt(params.beforeValues.reduce((sum, x) => sum + Math.pow(x - beforeMean, 2), 0) / (params.beforeValues.length - 1));
        return [
            `📊 **EFFECT SIZE ANALYSIS**`,
            '',
            `**Context:** ${params.context}`,
            '',
            `═══════════════════════════════════`,
            `📈 **RAW NUMBERS**`,
            `═══════════════════════════════════`,
            '',
            `Before: ${beforeMean.toFixed(2)} (n=${params.beforeValues.length})`,
            `After: ${afterMean.toFixed(2)} (n=${params.afterValues.length})`,
            `Change: ${rawChange > 0 ? '+' : ''}${rawChange.toFixed(2)} (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%)`,
            '',
            `═══════════════════════════════════`,
            `🎯 **EFFECT SIZE (Cohen's d)**`,
            `═══════════════════════════════════`,
            '',
            `**d = ${effectSize.toFixed(2)}**`,
            `**Interpretation: ${interpretation.toUpperCase()}**`,
            '',
            `What this means:`,
            `• The change moved you ${Math.abs(effectSize).toFixed(1)} standard deviations`,
            effectSize > 0
                ? `• That's better than ${Math.round(50 + 50 * (1 - Math.exp(-0.7 * Math.abs(effectSize))))}% of your baseline performance`
                : `• That's worse than ${Math.round(50 + 50 * (1 - Math.exp(-0.7 * Math.abs(effectSize))))}% of your baseline`,
            '',
            `═══════════════════════════════════`,
            `📏 **EFFECT SIZE SCALE**`,
            `═══════════════════════════════════`,
            '',
            `${interpretation === 'negligible' ? '→' : ' '} 0.0-0.2: Negligible (barely detectable)`,
            `${interpretation === 'small' ? '→' : ' '} 0.2-0.5: Small (noticeable if looking)`,
            `${interpretation === 'medium' ? '→' : ' '} 0.5-0.8: Medium (clearly noticeable)`,
            `${interpretation === 'large' ? '→' : ' '} 0.8-1.2: Large (obvious to anyone)`,
            `${interpretation === 'very_large' ? '→' : ' '} 1.2+: Very Large (dramatic)`,
            '',
            `═══════════════════════════════════`,
            `💡 **PRACTICAL SIGNIFICANCE**`,
            `═══════════════════════════════════`,
            '',
            Math.abs(effectSize) >= 0.8
                ? `🟢 **MEANINGFUL CHANGE**\n\nThis is a real, noticeable difference in daily life. Worth keeping.`
                : Math.abs(effectSize) >= 0.5
                    ? `🟢 **MODERATE CHANGE**\n\nThis is a real effect. You'll notice it over time. Probably worth it.`
                    : Math.abs(effectSize) >= 0.2
                        ? `🟡 **SMALL CHANGE**\n\nReal but small. Ask: Is the effort/cost worth this improvement?`
                        : `🔴 **NO MEANINGFUL CHANGE**\n\nThe difference is within normal variation. Not worth the effort.`,
            '',
            `═══════════════════════════════════`,
            `🎯 **PETER'S TAKE**`,
            `═══════════════════════════════════`,
            '',
            `Percent changes can be misleading. A 50% improvement in something small is still small.`,
            `Effect size tells you if the change MATTERS in the context of your normal variation.`,
            '',
            `Your typical day-to-day variation (SD): ${beforeSD.toFixed(2)}`,
            `The change moved you: ${Math.abs(effectSize).toFixed(1)}x that variation`,
        ].join('\n');
    },
});
// ============================================================================
// EXPORT
// ============================================================================
export const experimentationTools = {
    designExperiment,
    recordExperimentData,
    analyzeExperiment,
    createBelief,
    updateBelief,
    trackHypothesis,
    updateHypothesis,
    detectConfounds,
    calculateEffectSize,
};
export default experimentationTools;
//# sourceMappingURL=experimentation.js.map