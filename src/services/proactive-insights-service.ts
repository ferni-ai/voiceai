/**
 * Proactive Insights Service
 * 
 * Peter (The Quant) runs periodic scans across all domains to surface
 * insights BEFORE users ask for them. This is Peter's signature capability.
 * 
 * SCAN TYPES:
 * - Daily: Anomaly detection, pattern breaks
 * - Weekly: Correlation analysis, trend projections
 * - Monthly: Deep cross-domain synthesis, goal trajectory
 * 
 * INTEGRATION:
 * - Receives context from Alex (calendar), Maya (spending/habits), 
 *   Jordan (goals), Jack (portfolio)
 * - Uses Maya's financial store for real spending data
 * - Surfaces insights via proactive notifications
 */

import { log } from '@livekit/agents';
import { getAgentBus } from './agent-bus.js';
import { getMayaFinancialStore } from './maya-financial-store.js';
import { getLifeDataStore } from './life-data-store.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveInsight {
  id: string;
  type: 'warning' | 'opportunity' | 'milestone' | 'pattern' | 'anomaly' | 'correlation';
  severity: 'low' | 'medium' | 'high';
  title: string;
  insight: string;
  action?: string;
  domains: string[];
  timestamp: Date;
  userId: string;
  delivered: boolean;
}

export interface InsightScanResult {
  userId: string;
  scanType: 'daily' | 'weekly' | 'monthly';
  timestamp: Date;
  insights: ProactiveInsight[];
  metrics: {
    domainsScanned: number;
    patternsChecked: number;
    insightsFound: number;
  };
}

// ============================================================================
// PROACTIVE INSIGHTS SERVICE
// ============================================================================

class ProactiveInsightsService {
  private isRunning = false;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private insightQueue: Map<string, ProactiveInsight[]> = new Map();
  
  /**
   * Start the proactive insights service
   */
  start(): void {
    if (this.isRunning) {
      getLogger().debug('Proactive Insights Service already running');
      return;
    }
    
    this.isRunning = true;
    
    // Run daily scans every 6 hours (for active users)
    this.scanInterval = setInterval(() => {
      this.runScheduledScans().catch(err => {
        getLogger().error({ error: err }, 'Error running scheduled insight scans');
      });
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    getLogger().info('🔬 Proactive Insights Service started');
  }
  
  /**
   * Stop the proactive insights service
   */
  stop(): void {
    if (!this.isRunning) return;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    this.isRunning = false;
    getLogger().info('🔬 Proactive Insights Service stopped');
  }
  
  /**
   * Run a proactive insight scan for a specific user
   */
  async runScanForUser(userId: string, scanType: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<InsightScanResult> {
    getLogger().info({ userId, scanType }, '🔬 Peter running proactive insight scan');
    
    const insights: ProactiveInsight[] = [];
    let domainsScanned = 0;
    let patternsChecked = 0;
    
    // === SPENDING DOMAIN ===
    try {
      const spendingInsights = await this.scanSpendingDomain(userId);
      insights.push(...spendingInsights);
      domainsScanned++;
      patternsChecked += 5;
    } catch (error) {
      getLogger().warn({ error, userId }, 'Error scanning spending domain');
    }
    
    // === GOALS DOMAIN ===
    try {
      const goalInsights = await this.scanGoalsDomain(userId);
      insights.push(...goalInsights);
      domainsScanned++;
      patternsChecked += 4;
    } catch (error) {
      getLogger().warn({ error, userId }, 'Error scanning goals domain');
    }
    
    // === BEHAVIORAL DOMAIN ===
    try {
      const behavioralInsights = await this.scanBehavioralDomain(userId);
      insights.push(...behavioralInsights);
      domainsScanned++;
      patternsChecked += 3;
    } catch (error) {
      getLogger().warn({ error, userId }, 'Error scanning behavioral domain');
    }
    
    // === CROSS-DOMAIN CORRELATIONS (weekly/monthly only) ===
    if (scanType !== 'daily') {
      try {
        const correlationInsights = await this.findCrossDomainCorrelations(userId);
        insights.push(...correlationInsights);
        patternsChecked += 6;
      } catch (error) {
        getLogger().warn({ error, userId }, 'Error finding cross-domain correlations');
      }
    }
    
    // Store insights for delivery
    this.insightQueue.set(userId, insights);
    
    const result: InsightScanResult = {
      userId,
      scanType,
      timestamp: new Date(),
      insights,
      metrics: {
        domainsScanned,
        patternsChecked,
        insightsFound: insights.length,
      },
    };
    
    getLogger().info(
      { userId, insightCount: insights.length, domainsScanned, patternsChecked },
      '🔬 Peter completed proactive insight scan'
    );
    
    return result;
  }
  
  /**
   * Scan spending domain for insights
   */
  private async scanSpendingDomain(userId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const store = getMayaFinancialStore();
    await store.loadUserData(userId);
    
    const budget = store.getMainBudget(userId);
    const triggers = store.getRecentSpendingTriggers(userId, 14);
    const limits = store.getUserSpendingLimits(userId);
    
    // Check budget pace
    if (budget) {
      const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
      const dayOfMonth = new Date().getDate();
      const expectedPercent = (dayOfMonth / 30) * 100;
      
      if (percentUsed > expectedPercent + 20) {
        insights.push({
          id: `spend-pace-${Date.now()}`,
          type: 'warning',
          severity: 'high',
          title: 'Spending Pace Alert',
          insight: `Budget is at ${Math.round(percentUsed)}% but we're only ${Math.round(expectedPercent)}% through the month`,
          action: 'Consider reviewing discretionary spending',
          domains: ['spending'],
          timestamp: new Date(),
          userId,
          delivered: false,
        });
      }
      
      // Check over-budget categories
      const overCategories = budget.categories.filter(c => c.spent > c.limit);
      if (overCategories.length >= 2) {
        insights.push({
          id: `multi-over-${Date.now()}`,
          type: 'warning',
          severity: 'medium',
          title: 'Multiple Categories Over Budget',
          insight: `${overCategories.length} categories are over limit: ${overCategories.map(c => c.name).join(', ')}`,
          action: 'This pattern suggests a systemic issue, not isolated overspending',
          domains: ['spending'],
          timestamp: new Date(),
          userId,
          delivered: false,
        });
      }
    }
    
    // Check spending trigger patterns
    if (triggers.length >= 5) {
      const emotionCounts = triggers.reduce((acc, t) => {
        acc[t.emotion] = (acc[t.emotion] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const dominantEmotion = Object.entries(emotionCounts)
        .sort((a, b) => b[1] - a[1])[0];
      
      if (dominantEmotion && dominantEmotion[1] >= 4) {
        insights.push({
          id: `emotion-pattern-${Date.now()}`,
          type: 'pattern',
          severity: 'medium',
          title: 'Emotional Spending Pattern Detected',
          insight: `"${dominantEmotion[0]}" appears ${dominantEmotion[1]} times in recent triggers`,
          action: `Address the ${dominantEmotion[0]} rather than the spending`,
          domains: ['spending', 'behavioral'],
          timestamp: new Date(),
          userId,
          delivered: false,
        });
      }
    }
    
    return insights;
  }
  
  /**
   * Scan goals domain for insights
   */
  private async scanGoalsDomain(userId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const store = getLifeDataStore();
    
    const goals = await store.getGoals(userId);
    const milestones = await store.getMilestones(userId);
    
    // Check for stalled goals
    const stalledGoals = goals.filter(g => {
      if (g.status === 'completed') return false;
      if (!g.updatedAt) return true;
      const daysSinceUpdate = (Date.now() - new Date(g.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 14 && (g.progressPercent || 0) < 90;
    });
    
    if (stalledGoals.length > 0) {
      insights.push({
        id: `stalled-goals-${Date.now()}`,
        type: 'warning',
        severity: stalledGoals.length >= 2 ? 'high' : 'medium',
        title: `${stalledGoals.length} Goal${stalledGoals.length > 1 ? 's' : ''} Stalled`,
        insight: `These goals haven't seen progress in 14+ days: ${stalledGoals.map(g => g.title).join(', ')}`,
        action: 'Consider whether these goals still align with priorities',
        domains: ['goals'],
        timestamp: new Date(),
        userId,
        delivered: false,
      });
    }
    
    // Check for approaching milestones
    const now = new Date();
    const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const approachingMilestones = milestones.filter(m => {
      if (!m.targetDate) return false;
      const date = new Date(m.targetDate);
      return date >= now && date <= fourteenDaysOut && m.status !== 'completed';
    });
    
    if (approachingMilestones.length > 0) {
      insights.push({
        id: `milestone-approaching-${Date.now()}`,
        type: 'milestone',
        severity: 'low',
        title: 'Milestone Approaching',
        insight: `Coming up in the next 2 weeks: ${approachingMilestones.map(m => m.name).join(', ')}`,
        action: 'Review preparation checklist',
        domains: ['goals'],
        timestamp: new Date(),
        userId,
        delivered: false,
      });
    }
    
    // Check for near-completion goals
    const nearComplete = goals.filter(g => {
      const progress = g.progressPercent || 0;
      return progress >= 85 && progress < 100 && g.status !== 'completed';
    });
    
    if (nearComplete.length > 0) {
      insights.push({
        id: `near-complete-${Date.now()}`,
        type: 'opportunity',
        severity: 'low',
        title: 'Goal Almost Complete!',
        insight: `So close! ${nearComplete.map(g => `${g.title} (${g.progressPercent}%)`).join(', ')}`,
        action: 'A small push will get you there',
        domains: ['goals'],
        timestamp: new Date(),
        userId,
        delivered: false,
      });
    }
    
    return insights;
  }
  
  /**
   * Scan behavioral domain for insights
   */
  private async scanBehavioralDomain(userId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const mayaStore = getMayaFinancialStore();
    await mayaStore.loadUserData(userId);
    
    const triggers = mayaStore.getRecentSpendingTriggers(userId, 7);
    
    // Look for stress accumulation
    const stressTriggers = triggers.filter(t => 
      ['stressed', 'anxious', 'overwhelmed', 'tired', 'exhausted'].includes(t.emotion.toLowerCase())
    );
    
    if (stressTriggers.length >= 3) {
      insights.push({
        id: `stress-accumulation-${Date.now()}`,
        type: 'warning',
        severity: 'high',
        title: 'Stress Pattern Detected',
        insight: `${stressTriggers.length} stress-related triggers in the past week. This often precedes larger behavioral shifts.`,
        action: 'Address the underlying stress before it cascades to other areas',
        domains: ['behavioral', 'wellbeing'],
        timestamp: new Date(),
        userId,
        delivered: false,
      });
    }
    
    // Look for time-of-day patterns
    const eveningTriggers = triggers.filter(t => {
      const hour = new Date(t.timestamp).getHours();
      return hour >= 20 || hour <= 2; // 8pm - 2am
    });
    
    if (eveningTriggers.length >= 3) {
      insights.push({
        id: `evening-pattern-${Date.now()}`,
        type: 'pattern',
        severity: 'medium',
        title: 'Late Night Trigger Pattern',
        insight: `${eveningTriggers.length} spending triggers occurring after 8pm. Evening is often when willpower is lowest.`,
        action: 'Consider implementing evening routines or cooling-off periods',
        domains: ['behavioral', 'habits'],
        timestamp: new Date(),
        userId,
        delivered: false,
      });
    }
    
    return insights;
  }
  
  /**
   * Find cross-domain correlations
   */
  private async findCrossDomainCorrelations(userId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    
    // This would use context received from other personas
    // For now, we generate insights based on available data patterns
    
    const mayaStore = getMayaFinancialStore();
    await mayaStore.loadUserData(userId);
    const lifeStore = getLifeDataStore();
    
    const budget = mayaStore.getMainBudget(userId);
    const goals = await lifeStore.getGoals(userId);
    const savingsGoals = mayaStore.getActiveSavingsGoals(userId);
    
    // Correlation: Spending vs Goals
    if (budget && savingsGoals.length > 0) {
      const overBudget = budget.spent > budget.monthlyLimit;
      // Check for goals with low progress (behind pace)
      const behindOnGoals = savingsGoals.filter(g => {
        const progress = g.currentAmount / g.targetAmount;
        return progress < 0.25 && g.status === 'active';
      }).length;
      
      if (overBudget && behindOnGoals > 0) {
        insights.push({
          id: `spend-goal-correlation-${Date.now()}`,
          type: 'correlation',
          severity: 'high',
          title: 'Spending-Goal Conflict Detected',
          insight: `Overspending this month while ${behindOnGoals} savings goal(s) are behind. These are connected.`,
          action: 'Current spending patterns are directly competing with goal progress',
          domains: ['spending', 'goals'],
          timestamp: new Date(),
          userId,
          delivered: false,
        });
      }
    }
    
    return insights;
  }
  
  /**
   * Get pending insights for a user
   */
  getPendingInsights(userId: string): ProactiveInsight[] {
    return this.insightQueue.get(userId) || [];
  }
  
  /**
   * Mark insights as delivered
   */
  markInsightsDelivered(userId: string, insightIds: string[]): void {
    const insights = this.insightQueue.get(userId) || [];
    insights.forEach(i => {
      if (insightIds.includes(i.id)) {
        i.delivered = true;
      }
    });
  }
  
  /**
   * Run scheduled scans for all active users
   */
  private async runScheduledScans(): Promise<void> {
    // In production, this would iterate through active users
    // For now, this is a placeholder that would be triggered by user activity
    getLogger().debug('Scheduled insight scan check (runs when users are active)');
  }
}

// Singleton instance
let insightsServiceInstance: ProactiveInsightsService | null = null;

export function getProactiveInsightsService(): ProactiveInsightsService {
  if (!insightsServiceInstance) {
    insightsServiceInstance = new ProactiveInsightsService();
  }
  return insightsServiceInstance;
}

export default ProactiveInsightsService;

