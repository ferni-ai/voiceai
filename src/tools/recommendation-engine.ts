/**
 * Tool Recommendation Engine
 *
 * Generates data-driven recommendations for tool optimization:
 * - New tools to create (based on gaps and feature requests)
 * - Tools to consolidate (based on co-occurrence patterns)
 * - Tools to deprecate (based on usage and feedback)
 * - Experiments to run (based on hypotheses from data)
 *
 * This engine continuously learns from user interactions and
 * automatically generates actionable recommendations.
 */

import { getLogger } from '../utils/safe-logger.js';
import { feedbackCollector, type FeedbackSummary } from './feedback-collector.js';
import { patternAnalyzer, type GapAnalysis, type ConsolidationOpportunity } from './pattern-analyzer.js';
import { deprecationService } from './deprecation.js';
import { abTestingService, type Experiment, type VariantConfig } from './ab-testing.js';
import { toolRegistry } from './registry/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type RecommendationType = 
  | 'create_tool'
  | 'consolidate_tools'
  | 'deprecate_tool'
  | 'run_experiment'
  | 'improve_tool'
  | 'add_domain'
  | 'modify_loading';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rationale: string;
  evidence: Evidence[];
  impact: ImpactAssessment;
  implementation: ImplementationGuide;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
}

export interface Evidence {
  type: 'usage_data' | 'feedback' | 'pattern' | 'experiment_result';
  summary: string;
  dataPoints: number;
  confidence: number;
}

export interface ImpactAssessment {
  userExperience: 'positive' | 'neutral' | 'negative';
  toolCount: number; // Change in tool count
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  estimatedBenefit: string;
}

export interface ImplementationGuide {
  steps: string[];
  estimatedEffort: 'hours' | 'days' | 'weeks';
  requiredChanges: string[];
  testingStrategy: string;
}

export interface ExperimentHypothesis {
  hypothesis: string;
  metric: string;
  expectedChange: string;
  confidence: number;
}

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

export class RecommendationEngine {
  private recommendations: Recommendation[] = [];
  private lastGenerationTime = 0;
  private readonly GENERATION_COOLDOWN = 60 * 60 * 1000; // 1 hour

  // ==========================================================================
  // RECOMMENDATION GENERATION
  // ==========================================================================

  /**
   * Generate all recommendations based on current data
   */
  async generateRecommendations(): Promise<Recommendation[]> {
    // Check cooldown
    if (Date.now() - this.lastGenerationTime < this.GENERATION_COOLDOWN) {
      return this.recommendations;
    }

    const newRecommendations: Recommendation[] = [];

    // 1. Generate tool creation recommendations from gaps
    const createRecs = this.generateToolCreationRecs();
    newRecommendations.push(...createRecs);

    // 2. Generate consolidation recommendations
    const consolidateRecs = this.generateConsolidationRecs();
    newRecommendations.push(...consolidateRecs);

    // 3. Generate deprecation recommendations
    const deprecateRecs = this.generateDeprecationRecs();
    newRecommendations.push(...deprecateRecs);

    // 4. Generate improvement recommendations
    const improveRecs = this.generateImprovementRecs();
    newRecommendations.push(...improveRecs);

    // 5. Generate experiment recommendations
    const experimentRecs = this.generateExperimentRecs();
    newRecommendations.push(...experimentRecs);

    // Sort by priority
    this.recommendations = newRecommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    this.lastGenerationTime = Date.now();

    // Persist recommendations to Firestore (async, non-blocking)
    if (this.recommendations.length > 0) {
      import('../services/optimization-persistence.js')
        .then(({ optimizationPersistence }) => {
          for (const rec of this.recommendations) {
            optimizationPersistence.bufferRecommendation(rec);
          }
        })
        .catch(() => {
          // Persistence failure is non-critical
        });
    }

    getLogger().info(
      { count: this.recommendations.length },
      '💡 Generated tool recommendations'
    );

    return this.recommendations;
  }

  // ==========================================================================
  // TOOL CREATION RECOMMENDATIONS
  // ==========================================================================

  private generateToolCreationRecs(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const featureRequests = feedbackCollector.getTopFeatureRequests(20);
    const gaps = patternAnalyzer.analyzeGaps(featureRequests);

    for (const gap of gaps.slice(0, 5)) {
      recommendations.push({
        id: `create_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'create_tool',
        priority: gap.priority === 'high' ? 'high' : 'medium',
        title: `Create "${gap.suggestedToolName}" tool`,
        description: gap.description,
        rationale: `${gap.requestCount} users have requested this capability`,
        evidence: [
          {
            type: 'feedback',
            summary: `Feature requested ${gap.requestCount} times`,
            dataPoints: gap.requestCount,
            confidence: Math.min(gap.requestCount / 20, 1),
          },
        ],
        impact: {
          userExperience: 'positive',
          toolCount: 1,
          complexity: 'medium',
          riskLevel: 'low',
          estimatedBenefit: `Satisfy ${gap.requestCount} user requests`,
        },
        implementation: {
          steps: [
            `Create tool in ${gap.suggestedDomain} domain`,
            `Implement ${gap.suggestedToolName} function`,
            'Add to agent manifests',
            'Write tests',
            'Deploy and monitor',
          ],
          estimatedEffort: 'days',
          requiredChanges: [`src/tools/domains/${gap.suggestedDomain}/index.ts`],
          testingStrategy: 'A/B test with 10% of users',
        },
        createdAt: new Date(),
        status: 'pending',
      });
    }

    return recommendations;
  }

  // ==========================================================================
  // CONSOLIDATION RECOMMENDATIONS
  // ==========================================================================

  private generateConsolidationRecs(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const opportunities = patternAnalyzer.findConsolidationOpportunities();

    for (const opp of opportunities.slice(0, 3)) {
      recommendations.push({
        id: `consolidate_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'consolidate_tools',
        priority: opp.confidence > 0.8 ? 'high' : 'medium',
        title: `Consolidate ${opp.tools.join(' + ')} → ${opp.suggestedName}`,
        description: opp.reason,
        rationale: `Tools show ${(opp.confidence * 100).toFixed(0)}% correlation in usage`,
        evidence: [
          {
            type: 'pattern',
            summary: opp.reason,
            dataPoints: 0, // Would be filled from actual data
            confidence: opp.confidence,
          },
        ],
        impact: {
          userExperience: 'positive',
          toolCount: -(opp.tools.length - 1),
          complexity: 'medium',
          riskLevel: 'medium',
          estimatedBenefit: opp.expectedBenefit,
        },
        implementation: {
          steps: [
            `Create consolidated ${opp.suggestedName} tool`,
            `Migrate functionality from ${opp.tools.join(', ')}`,
            'Update agent manifests',
            'Deprecate old tools',
            'Monitor for regressions',
          ],
          estimatedEffort: 'days',
          requiredChanges: opp.tools.map(t => `Tool: ${t}`),
          testingStrategy: 'A/B test consolidated vs granular',
        },
        createdAt: new Date(),
        status: 'pending',
      });
    }

    return recommendations;
  }

  // ==========================================================================
  // DEPRECATION RECOMMENDATIONS
  // ==========================================================================

  private generateDeprecationRecs(): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Get problematic tools from feedback
    const problematic = feedbackCollector.getProblematicTools();

    for (const tool of problematic.slice(0, 3)) {
      const isHighRetry = tool.retryRate > 0.3;
      const isHighAbandon = tool.abandonRate > 0.2;
      const isLowScore = tool.averageScore < -0.3;

      if (isHighRetry || isHighAbandon || isLowScore) {
        recommendations.push({
          id: `deprecate_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'deprecate_tool',
          priority: isLowScore && isHighAbandon ? 'high' : 'medium',
          title: `Review "${tool.toolId}" for deprecation`,
          description: `Tool has poor user feedback metrics`,
          rationale: this.buildDeprecationRationale(tool),
          evidence: [
            {
              type: 'feedback',
              summary: `${tool.negativeCount} negative, ${tool.positiveCount} positive feedback`,
              dataPoints: tool.totalFeedback,
              confidence: Math.min(tool.totalFeedback / 50, 1),
            },
            {
              type: 'usage_data',
              summary: `${(tool.retryRate * 100).toFixed(0)}% retry rate, ${(tool.abandonRate * 100).toFixed(0)}% abandon rate`,
              dataPoints: tool.totalFeedback,
              confidence: 0.8,
            },
          ],
          impact: {
            userExperience: 'positive',
            toolCount: -1,
            complexity: 'low',
            riskLevel: 'medium',
            estimatedBenefit: 'Reduce user frustration',
          },
          implementation: {
            steps: [
              'Investigate root cause of issues',
              'Decide: fix, replace, or remove',
              'If removing, identify alternatives',
              'Deprecate with migration guide',
              'Monitor replacement adoption',
            ],
            estimatedEffort: 'hours',
            requiredChanges: [`Tool: ${tool.toolId}`],
            testingStrategy: 'Monitor feedback after changes',
          },
          createdAt: new Date(),
          status: 'pending',
        });
      }
    }

    return recommendations;
  }

  private buildDeprecationRationale(tool: FeedbackSummary): string {
    const issues: string[] = [];

    if (tool.averageScore < -0.3) {
      issues.push(`low satisfaction score (${(tool.averageScore * 100).toFixed(0)}%)`);
    }
    if (tool.retryRate > 0.3) {
      issues.push(`high retry rate (${(tool.retryRate * 100).toFixed(0)}%)`);
    }
    if (tool.abandonRate > 0.2) {
      issues.push(`high abandon rate (${(tool.abandonRate * 100).toFixed(0)}%)`);
    }

    return `Tool shows ${issues.join(', ')}`;
  }

  // ==========================================================================
  // IMPROVEMENT RECOMMENDATIONS
  // ==========================================================================

  private generateImprovementRecs(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const allFeedback = feedbackCollector.getAllFeedback();

    // Find tools with high usage but mediocre scores
    const improvementCandidates = allFeedback
      .filter(f => f.totalFeedback >= 20 && f.averageScore > -0.2 && f.averageScore < 0.3)
      .slice(0, 3);

    for (const tool of improvementCandidates) {
      recommendations.push({
        id: `improve_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'improve_tool',
        priority: 'medium',
        title: `Improve "${tool.toolId}" performance`,
        description: `Popular tool with room for improvement`,
        rationale: `High usage (${tool.totalFeedback} interactions) but mediocre satisfaction (${(tool.averageScore * 100).toFixed(0)}%)`,
        evidence: [
          {
            type: 'feedback',
            summary: `${tool.totalFeedback} total interactions`,
            dataPoints: tool.totalFeedback,
            confidence: 0.8,
          },
        ],
        impact: {
          userExperience: 'positive',
          toolCount: 0,
          complexity: 'medium',
          riskLevel: 'low',
          estimatedBenefit: 'Improve experience for many users',
        },
        implementation: {
          steps: [
            'Analyze specific feedback for this tool',
            'Identify common failure patterns',
            'Improve error handling and fallbacks',
            'Enhance response quality',
            'A/B test improvements',
          ],
          estimatedEffort: 'days',
          requiredChanges: [`Tool: ${tool.toolId}`],
          testingStrategy: 'A/B test old vs improved',
        },
        createdAt: new Date(),
        status: 'pending',
      });
    }

    return recommendations;
  }

  // ==========================================================================
  // EXPERIMENT RECOMMENDATIONS
  // ==========================================================================

  private generateExperimentRecs(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const hypotheses = this.generateHypotheses();

    for (const hypothesis of hypotheses.slice(0, 3)) {
      const experiment = this.createExperimentFromHypothesis(hypothesis);

      recommendations.push({
        id: `experiment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'run_experiment',
        priority: hypothesis.confidence > 0.7 ? 'high' : 'medium',
        title: `Run experiment: ${hypothesis.hypothesis}`,
        description: `Test if ${hypothesis.expectedChange}`,
        rationale: `Hypothesis confidence: ${(hypothesis.confidence * 100).toFixed(0)}%`,
        evidence: [
          {
            type: 'pattern',
            summary: 'Based on observed usage patterns',
            dataPoints: 0,
            confidence: hypothesis.confidence,
          },
        ],
        impact: {
          userExperience: 'neutral',
          toolCount: 0,
          complexity: 'low',
          riskLevel: 'low',
          estimatedBenefit: 'Data-driven optimization',
        },
        implementation: {
          steps: [
            'Register experiment with A/B testing service',
            `Activate experiment: ${experiment.id}`,
            'Wait for statistical significance (100+ users per variant)',
            'Analyze results',
            'Roll out winner or iterate',
          ],
          estimatedEffort: 'days',
          requiredChanges: ['Experiment configuration only'],
          testingStrategy: 'Automated A/B test',
        },
        createdAt: new Date(),
        status: 'pending',
      });
    }

    return recommendations;
  }

  private generateHypotheses(): ExperimentHypothesis[] {
    const hypotheses: ExperimentHypothesis[] = [];
    const coOccurrences = patternAnalyzer.getCoOccurrences(10);
    const journeys = patternAnalyzer.identifyJourneys();

    // Hypothesis from co-occurrences
    for (const coOcc of coOccurrences.slice(0, 2)) {
      if (coOcc.correlation > 0.5) {
        hypotheses.push({
          hypothesis: `Pre-loading ${coOcc.toolB} when ${coOcc.toolA} is used`,
          metric: 'task_completion_time',
          expectedChange: `reduces task completion time by 10-20%`,
          confidence: coOcc.correlation,
        });
      }
    }

    // Hypothesis from journeys
    for (const journey of journeys.slice(0, 2)) {
      if (journey.avgSuccess < 0.7) {
        hypotheses.push({
          hypothesis: `Guided workflow for "${journey.name}"`,
          metric: 'journey_success_rate',
          expectedChange: `improves success rate from ${(journey.avgSuccess * 100).toFixed(0)}% to >80%`,
          confidence: 0.6,
        });
      }
    }

    return hypotheses;
  }

  private createExperimentFromHypothesis(hypothesis: ExperimentHypothesis): Experiment {
    return {
      id: `auto_${hypothesis.metric}_${Date.now()}`,
      name: hypothesis.hypothesis,
      description: `Testing if ${hypothesis.expectedChange}`,
      startDate: new Date(),
      endDate: null,
      active: false,
      control: {
        id: 'control',
        name: 'Current Behavior',
      },
      variants: [
        {
          id: 'treatment',
          name: 'New Behavior',
          config: { hypothesis: hypothesis.hypothesis },
        },
      ],
      trafficAllocation: [50, 50],
      metrics: [
        {
          id: hypothesis.metric,
          name: hypothesis.metric.replace(/_/g, ' '),
          aggregation: 'average',
          higherIsBetter: true,
        },
      ],
    };
  }

  // ==========================================================================
  // RECOMMENDATION MANAGEMENT
  // ==========================================================================

  /**
   * Get all pending recommendations
   */
  getPendingRecommendations(): Recommendation[] {
    return this.recommendations.filter(r => r.status === 'pending');
  }

  /**
   * Get recommendations by type
   */
  getRecommendationsByType(type: RecommendationType): Recommendation[] {
    return this.recommendations.filter(r => r.type === type);
  }

  /**
   * Approve a recommendation
   */
  approveRecommendation(id: string): boolean {
    const rec = this.recommendations.find(r => r.id === id);
    if (rec) {
      rec.status = 'approved';
      getLogger().info({ id, title: rec.title }, '✅ Recommendation approved');
      return true;
    }
    return false;
  }

  /**
   * Reject a recommendation
   */
  rejectRecommendation(id: string, reason?: string): boolean {
    const rec = this.recommendations.find(r => r.id === id);
    if (rec) {
      rec.status = 'rejected';
      getLogger().info({ id, title: rec.title, reason }, '❌ Recommendation rejected');
      return true;
    }
    return false;
  }

  /**
   * Mark recommendation as implemented
   */
  markImplemented(id: string): boolean {
    const rec = this.recommendations.find(r => r.id === id);
    if (rec) {
      rec.status = 'implemented';
      getLogger().info({ id, title: rec.title }, '🚀 Recommendation implemented');
      return true;
    }
    return false;
  }

  // ==========================================================================
  // AUTO-IMPLEMENTATION
  // ==========================================================================

  /**
   * Auto-implement low-risk recommendations
   */
  async autoImplement(dryRun = true): Promise<string[]> {
    const implemented: string[] = [];
    const pending = this.getPendingRecommendations();

    for (const rec of pending) {
      // Only auto-implement low-risk experiments
      if (
        rec.type === 'run_experiment' &&
        rec.impact.riskLevel === 'low' &&
        rec.priority !== 'low'
      ) {
        if (!dryRun) {
          // Create and activate the experiment
          const hypothesis = this.generateHypotheses().find(
            h => rec.title.includes(h.hypothesis)
          );

          if (hypothesis) {
            const experiment = this.createExperimentFromHypothesis(hypothesis);
            abTestingService.registerExperiment(experiment);
            abTestingService.activateExperiment(experiment.id);
            rec.status = 'implemented';
            implemented.push(rec.id);
          }
        } else {
          implemented.push(`[DRY RUN] Would implement: ${rec.title}`);
        }
      }

      // Auto-flag tools for deprecation review
      if (
        rec.type === 'deprecate_tool' &&
        rec.priority === 'high' &&
        rec.impact.riskLevel !== 'high'
      ) {
        if (!dryRun) {
          const toolId = rec.title.match(/"([^"]+)"/)?.[1];
          if (toolId) {
            deprecationService.flagForDeprecation(toolId, 'productivity', 'high_error_rate');
            rec.status = 'implemented';
            implemented.push(rec.id);
          }
        } else {
          implemented.push(`[DRY RUN] Would flag: ${rec.title}`);
        }
      }
    }

    getLogger().info({ count: implemented.length, dryRun }, '🤖 Auto-implementation complete');
    return implemented;
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Generate recommendation report
   */
  generateReport(): string {
    let report = '═══════════════════════════════════════════════════════════════\n';
    report += '                   TOOL RECOMMENDATIONS REPORT                   \n';
    report += '═══════════════════════════════════════════════════════════════\n\n';

    const byType = {
      create_tool: this.getRecommendationsByType('create_tool'),
      consolidate_tools: this.getRecommendationsByType('consolidate_tools'),
      deprecate_tool: this.getRecommendationsByType('deprecate_tool'),
      improve_tool: this.getRecommendationsByType('improve_tool'),
      run_experiment: this.getRecommendationsByType('run_experiment'),
    };

    // Summary
    report += '📊 SUMMARY\n';
    report += '─────────────────────────────────────────────────────────────────\n';
    report += `  Total Recommendations: ${this.recommendations.length}\n`;
    report += `  Pending:               ${this.getPendingRecommendations().length}\n`;
    report += `  By Priority:\n`;
    report += `    Critical: ${this.recommendations.filter(r => r.priority === 'critical').length}\n`;
    report += `    High:     ${this.recommendations.filter(r => r.priority === 'high').length}\n`;
    report += `    Medium:   ${this.recommendations.filter(r => r.priority === 'medium').length}\n`;
    report += `    Low:      ${this.recommendations.filter(r => r.priority === 'low').length}\n\n`;

    // By type
    for (const [type, recs] of Object.entries(byType)) {
      if (recs.length === 0) continue;

      const icon = {
        create_tool: '➕',
        consolidate_tools: '🔗',
        deprecate_tool: '🗑️',
        improve_tool: '⬆️',
        run_experiment: '🧪',
      }[type] || '📋';

      report += `${icon} ${type.toUpperCase().replace(/_/g, ' ')} (${recs.length})\n`;
      report += '─────────────────────────────────────────────────────────────────\n';

      for (const rec of recs.slice(0, 3)) {
        const priorityBadge = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢',
        }[rec.priority];

        report += `  ${priorityBadge} ${rec.title}\n`;
        report += `     ${rec.description}\n`;
        report += `     Rationale: ${rec.rationale}\n\n`;
      }

      if (recs.length > 3) {
        report += `  ... and ${recs.length - 3} more\n\n`;
      }
    }

    report += '═══════════════════════════════════════════════════════════════\n';
    return report;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const recommendationEngine = new RecommendationEngine();

export default recommendationEngine;

