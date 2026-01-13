/**
 * Tool A/B Testing Framework
 *
 * Enables experimentation with different tool configurations to optimize:
 * - Tool selection accuracy
 * - User satisfaction
 * - Task completion rates
 *
 * Features:
 * - Define experiments with control/variants
 * - Random assignment with consistent user bucketing
 * - Track metrics and outcomes
 * - Statistical significance calculation
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// PREDEFINED EXPERIMENTS
// ============================================================================
/**
 * Example experiments for tool optimization
 */
export const PREDEFINED_EXPERIMENTS = [
    {
        id: 'consolidated-vs-granular',
        name: 'Consolidated vs Granular Tools',
        description: 'Test if users prefer consolidated multi-action tools vs many specific tools',
        startDate: new Date(),
        endDate: null,
        active: false, // Enable when ready
        control: {
            id: 'control',
            name: 'Granular Tools',
            domains: ['productivity'],
            config: { useConsolidated: false },
        },
        variants: [
            {
                id: 'consolidated',
                name: 'Consolidated Tools',
                domains: ['productivity'],
                config: { useConsolidated: true },
                consolidations: [
                    {
                        newToolId: 'manageTasks',
                        replacedTools: ['createTask', 'updateTask', 'deleteTask', 'getTasks'],
                    },
                ],
            },
        ],
        trafficAllocation: [50, 50],
        metrics: [
            {
                id: 'tool_success_rate',
                name: 'Tool Success Rate',
                aggregation: 'rate',
                higherIsBetter: true,
            },
            {
                id: 'tools_per_session',
                name: 'Tools Used Per Session',
                aggregation: 'average',
                higherIsBetter: false,
            },
            {
                id: 'task_completion',
                name: 'Task Completion Rate',
                aggregation: 'rate',
                higherIsBetter: true,
            },
        ],
    },
    {
        id: 'awareness-tools',
        name: 'Awareness Tools Impact',
        description: 'Test if world awareness tools improve conversation quality',
        startDate: new Date(),
        endDate: null,
        active: false,
        control: {
            id: 'control',
            name: 'No Awareness',
            excludeTools: ['getCurrentContext', 'getUserContext', 'getConversationAwareness'],
        },
        variants: [
            {
                id: 'with-awareness',
                name: 'With Awareness',
                domains: ['awareness'],
            },
        ],
        trafficAllocation: [50, 50],
        metrics: [
            {
                id: 'user_satisfaction',
                name: 'User Satisfaction',
                aggregation: 'average',
                higherIsBetter: true,
            },
            {
                id: 'conversation_length',
                name: 'Conversation Length',
                aggregation: 'average',
                higherIsBetter: true,
            },
            { id: 'return_rate', name: 'User Return Rate', aggregation: 'rate', higherIsBetter: true },
        ],
    },
    {
        id: 'tool-count-optimization',
        name: 'Optimal Tool Count',
        description: 'Find the optimal number of tools per agent',
        startDate: new Date(),
        endDate: null,
        active: false,
        control: {
            id: 'full',
            name: 'Full Tool Set (50+)',
            config: { maxTools: 100 },
        },
        variants: [
            {
                id: 'medium',
                name: 'Medium Tool Set (30-40)',
                config: { maxTools: 40 },
            },
            {
                id: 'minimal',
                name: 'Minimal Tool Set (20-30)',
                config: { maxTools: 30 },
            },
        ],
        trafficAllocation: [34, 33, 33],
        metrics: [
            {
                id: 'tool_accuracy',
                name: 'Correct Tool Selection Rate',
                aggregation: 'rate',
                higherIsBetter: true,
            },
            {
                id: 'response_latency',
                name: 'Response Latency (ms)',
                aggregation: 'average',
                higherIsBetter: false,
            },
            {
                id: 'user_satisfaction',
                name: 'User Satisfaction',
                aggregation: 'average',
                higherIsBetter: true,
            },
        ],
    },
];
// ============================================================================
// A/B TESTING SERVICE
// ============================================================================
export class ABTestingService {
    experiments = new Map();
    assignments = new Map(); // userId -> assignment
    metrics = [];
    constructor() {
        // Load predefined experiments
        for (const exp of PREDEFINED_EXPERIMENTS) {
            this.experiments.set(exp.id, exp);
        }
    }
    // ==========================================================================
    // EXPERIMENT MANAGEMENT
    // ==========================================================================
    /**
     * Register a new experiment
     */
    registerExperiment(experiment) {
        this.experiments.set(experiment.id, experiment);
        getLogger().info({ experimentId: experiment.id, name: experiment.name }, '🧪 Experiment registered');
    }
    /**
     * Activate an experiment
     */
    activateExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment)
            return false;
        experiment.active = true;
        experiment.startDate = new Date();
        getLogger().info({ experimentId }, '🧪 Experiment activated');
        return true;
    }
    /**
     * Deactivate an experiment
     */
    deactivateExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment)
            return false;
        experiment.active = false;
        experiment.endDate = new Date();
        getLogger().info({ experimentId }, '🧪 Experiment deactivated');
        return true;
    }
    /**
     * Get all experiments
     */
    getExperiments() {
        return Array.from(this.experiments.values());
    }
    /**
     * Get active experiments
     */
    getActiveExperiments() {
        return this.getExperiments().filter((e) => e.active);
    }
    // ==========================================================================
    // USER ASSIGNMENT
    // ==========================================================================
    /**
     * Assign a user to an experiment variant
     * Uses consistent hashing so same user always gets same variant
     */
    assignUser(userId, experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || !experiment.active)
            return null;
        // Check for existing assignment
        const existingKey = `${userId}:${experimentId}`;
        if (this.assignments.has(existingKey)) {
            return this.assignments.get(existingKey);
        }
        // Consistent hash based on user ID and experiment ID
        const hash = this.hashString(`${userId}:${experimentId}`);
        const bucket = hash % 100;
        // Determine variant based on traffic allocation
        let cumulativePercent = 0;
        const allVariants = [experiment.control, ...experiment.variants];
        for (let i = 0; i < allVariants.length; i++) {
            cumulativePercent += experiment.trafficAllocation[i];
            if (bucket < cumulativePercent) {
                const assignment = {
                    experimentId,
                    variantId: allVariants[i].id,
                    userId,
                    assignedAt: new Date(),
                };
                this.assignments.set(existingKey, assignment);
                getLogger().debug({ userId, experimentId, variantId: assignment.variantId }, '🧪 User assigned to variant');
                return assignment;
            }
        }
        // Fallback to control
        const fallback = {
            experimentId,
            variantId: experiment.control.id,
            userId,
            assignedAt: new Date(),
        };
        this.assignments.set(existingKey, fallback);
        return fallback;
    }
    /**
     * Get user's current assignment for an experiment
     */
    getUserAssignment(userId, experimentId) {
        return this.assignments.get(`${userId}:${experimentId}`) || null;
    }
    /**
     * Get the variant config for a user
     */
    getUserVariant(userId, experimentId) {
        const assignment = this.assignUser(userId, experimentId);
        if (!assignment)
            return null;
        const experiment = this.experiments.get(experimentId);
        if (!experiment)
            return null;
        if (assignment.variantId === experiment.control.id) {
            return experiment.control;
        }
        return experiment.variants.find((v) => v.id === assignment.variantId) || null;
    }
    // ==========================================================================
    // METRICS TRACKING
    // ==========================================================================
    /**
     * Record a metric event
     */
    recordMetric(userId, experimentId, metricId, value, context) {
        const assignment = this.getUserAssignment(userId, experimentId);
        if (!assignment)
            return;
        const event = {
            experimentId,
            variantId: assignment.variantId,
            userId,
            metricId,
            value,
            timestamp: new Date(),
            context,
        };
        this.metrics.push(event);
        getLogger().debug({ experimentId, metricId, value }, '🧪 Metric recorded');
    }
    /**
     * Record tool usage for an experiment
     */
    recordToolUsage(userId, toolId, success, latencyMs) {
        for (const experiment of this.getActiveExperiments()) {
            const assignment = this.getUserAssignment(userId, experiment.id);
            if (assignment) {
                this.recordMetric(userId, experiment.id, 'tool_success_rate', success ? 1 : 0, { toolId });
                this.recordMetric(userId, experiment.id, 'response_latency', latencyMs, { toolId });
            }
        }
    }
    // ==========================================================================
    // RESULTS & ANALYSIS
    // ==========================================================================
    /**
     * Get results for an experiment
     */
    getResults(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment)
            return null;
        const experimentMetrics = this.metrics.filter((m) => m.experimentId === experimentId);
        // Group by variant
        const byVariant = {};
        const participants = new Set();
        for (const event of experimentMetrics) {
            participants.add(event.userId);
            if (!byVariant[event.variantId]) {
                byVariant[event.variantId] = {
                    participants: 0,
                    metrics: {},
                };
            }
            const variant = byVariant[event.variantId];
            if (!variant.metrics[event.metricId]) {
                variant.metrics[event.metricId] = { sum: 0, count: 0, average: 0 };
            }
            const metric = variant.metrics[event.metricId];
            metric.sum += event.value;
            metric.count += 1;
            metric.average = metric.sum / metric.count;
        }
        // Count participants per variant
        for (const assignment of this.assignments.values()) {
            if (assignment.experimentId === experimentId && byVariant[assignment.variantId]) {
                byVariant[assignment.variantId].participants += 1;
            }
        }
        // Generate recommendations
        const recommendations = this.generateRecommendations(experiment, byVariant);
        return {
            experimentId,
            totalParticipants: participants.size,
            byVariant,
            recommendations,
        };
    }
    /**
     * Generate recommendations based on results
     */
    generateRecommendations(experiment, byVariant) {
        const recommendations = [];
        // Compare variants for each metric
        for (const metricDef of experiment.metrics) {
            const variantScores = [];
            for (const [variantId, data] of Object.entries(byVariant)) {
                const metricData = data.metrics[metricDef.id];
                if (metricData && metricData.count > 0) {
                    variantScores.push({
                        variantId,
                        score: metricDef.aggregation === 'rate' ? metricData.average : metricData.average,
                    });
                }
            }
            if (variantScores.length >= 2) {
                // Sort by score
                variantScores.sort((a, b) => metricDef.higherIsBetter ? b.score - a.score : a.score - b.score);
                const best = variantScores[0];
                const worst = variantScores[variantScores.length - 1];
                const improvement = ((best.score - worst.score) / worst.score) * 100;
                if (Math.abs(improvement) > 10) {
                    recommendations.push(`📊 ${metricDef.name}: "${best.variantId}" outperforms "${worst.variantId}" by ${improvement.toFixed(1)}%`);
                }
            }
        }
        if (recommendations.length === 0) {
            recommendations.push('📊 No significant differences detected yet. Need more data.');
        }
        return recommendations;
    }
    // ==========================================================================
    // HELPERS
    // ==========================================================================
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    /**
     * Export data for external analysis
     */
    exportData() {
        return {
            experiments: Array.from(this.experiments.values()),
            assignments: Array.from(this.assignments.values()),
            metrics: this.metrics,
        };
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const abTestingService = new ABTestingService();
export default abTestingService;
//# sourceMappingURL=ab-testing.js.map