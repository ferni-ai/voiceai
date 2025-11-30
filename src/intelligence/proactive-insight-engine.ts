/**
 * Proactive Insight Engine
 * 
 * Analyzes user data to generate proactive suggestions and insights.
 * Jack doesn't just respond - he notices patterns and proactively helps.
 * 
 * Examples:
 * - "You always check the market on Monday mornings - want me to summarize?"
 * - "You've mentioned Sarah's college fund 3 times - shall we make a plan?"
 * - "Based on your spending, you could save $200/month on subscriptions"
 * - "It's been 2 weeks since we talked - just checking in!"
 */

import { log } from '@livekit/agents';
import type { UserProfile, FinancialGoal, KeyMoment } from '../types/user-profile.js';
import type { LearnedConversationPatterns } from './conversation-pattern-analyzer.js';
import type { LearnedResponsePreferences } from './response-quality-tracker.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type of proactive insight
 */
export type InsightType =
  | 'pattern_noticed'      // "You often ask about X on Mondays"
  | 'goal_check_in'        // "How's progress on your retirement goal?"
  | 'milestone_approaching' // "Sarah's college fund target is 6 months away"
  | 'concern_follow_up'    // "Last time you were worried about..."
  | 'spending_observation' // "You've mentioned subscription costs 3x"
  | 'relationship_milestone' // "We've been talking for 6 months now!"
  | 'market_context'       // "Given the recent market, wanted to check in"
  | 'seasonal_reminder'    // "Tax season coming up - shall we review?"
  | 'behavior_suggestion'  // "You seem more engaged when we discuss X"
  | 'opportunity_spotted'  // "Based on your situation, consider..."
  | 'overdue_check_in'     // "It's been a while - how are things?"
  | 'celebration';         // "Congrats on reaching your milestone!"

/**
 * Priority level for insight
 */
export type InsightPriority = 'high' | 'medium' | 'low';

/**
 * A single proactive insight
 */
export interface ProactiveInsight {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  
  // Content
  title: string;           // Brief summary
  message: string;         // What Jack should say
  context: string;         // Why this insight was generated
  
  // Metadata
  generatedAt: Date;
  expiresAt?: Date;        // Some insights are time-sensitive
  relatedGoalId?: string;
  relatedTopics: string[];
  
  // State
  delivered: boolean;
  deliveredAt?: Date;
  userReaction?: 'positive' | 'neutral' | 'dismissed' | 'negative';
}

/**
 * Insight generation result
 */
export interface InsightGenerationResult {
  insights: ProactiveInsight[];
  highPriorityCount: number;
  suggestedConversationStarter?: string;
}

// ============================================================================
// PROACTIVE INSIGHT ENGINE
// ============================================================================

export class ProactiveInsightEngine {
  private userId: string;
  private generatedInsights: ProactiveInsight[] = [];
  private deliveredInsightIds: Set<string> = new Set();
  
  constructor(userId: string, existingInsights?: ProactiveInsight[]) {
    this.userId = userId;
    if (existingInsights) {
      this.generatedInsights = existingInsights;
      for (const insight of existingInsights) {
        if (insight.delivered) {
          this.deliveredInsightIds.add(insight.id);
        }
      }
    }
  }
  
  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================
  
  /**
   * Generate all applicable insights for a user
   */
  generateInsights(
    profile: UserProfile,
    patterns?: LearnedConversationPatterns,
    responsePrefs?: LearnedResponsePreferences
  ): InsightGenerationResult {
    const insights: ProactiveInsight[] = [];
    
    // 1. Check for overdue conversation
    const overdueInsight = this.checkOverdueConversation(profile, patterns);
    if (overdueInsight) insights.push(overdueInsight);
    
    // 2. Goal-related insights
    const goalInsights = this.checkGoals(profile);
    insights.push(...goalInsights);
    
    // 3. Key moment follow-ups
    const momentInsights = this.checkKeyMoments(profile);
    insights.push(...momentInsights);
    
    // 4. Pattern-based insights
    if (patterns) {
      const patternInsights = this.checkPatterns(profile, patterns);
      insights.push(...patternInsights);
    }
    
    // 5. Seasonal/calendar insights
    const seasonalInsights = this.checkSeasonalOpportunities(profile);
    insights.push(...seasonalInsights);
    
    // 6. Relationship milestones
    const relationshipInsight = this.checkRelationshipMilestones(profile);
    if (relationshipInsight) insights.push(relationshipInsight);
    
    // 7. Behavior-based suggestions
    if (responsePrefs) {
      const behaviorInsights = this.checkBehaviorPatterns(profile, responsePrefs);
      insights.push(...behaviorInsights);
    }
    
    // Filter out already delivered insights
    const newInsights = insights.filter(i => !this.deliveredInsightIds.has(i.id));
    
    // Sort by priority
    newInsights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    // Store new insights
    this.generatedInsights.push(...newInsights);
    
    // Keep only last 50 insights
    if (this.generatedInsights.length > 50) {
      this.generatedInsights = this.generatedInsights.slice(-50);
    }
    
    const highPriorityCount = newInsights.filter(i => i.priority === 'high').length;
    
    return {
      insights: newInsights,
      highPriorityCount,
      suggestedConversationStarter: newInsights[0]?.message,
    };
  }
  
  /**
   * Check if it's been too long since last conversation
   */
  private checkOverdueConversation(
    profile: UserProfile,
    patterns?: LearnedConversationPatterns
  ): ProactiveInsight | null {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(profile.lastContact).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Use learned pattern or default to 14 days
    const expectedGap = patterns?.avgTimeBetweenConversations || 14;
    const threshold = Math.max(expectedGap * 1.5, 7);
    
    if (daysSinceContact >= threshold) {
      return {
        id: `overdue_${Date.now()}`,
        type: 'overdue_check_in',
        priority: daysSinceContact > 30 ? 'high' : 'medium',
        title: 'Time for a check-in',
        message: daysSinceContact > 30
          ? `It's been ${daysSinceContact} days since we last talked! I was thinking about you - how have things been going?`
          : `Hey! It's been a couple of weeks. Just wanted to check in and see how you're doing.`,
        context: `${daysSinceContact} days since last contact (typical gap: ${Math.round(expectedGap)} days)`,
        generatedAt: new Date(),
        relatedTopics: [],
        delivered: false,
      };
    }
    
    return null;
  }
  
  /**
   * Check goals for insights
   */
  private checkGoals(profile: UserProfile): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    
    for (const goal of profile.goals) {
      // Check for milestone approaching
      if (goal.targetDate) {
        const daysToTarget = Math.floor(
          (new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysToTarget > 0 && daysToTarget <= 90) {
          insights.push({
            id: `goal_approaching_${goal.id}_${daysToTarget}`,
            type: 'milestone_approaching',
            priority: daysToTarget <= 30 ? 'high' : 'medium',
            title: `${goal.name} target approaching`,
            message: daysToTarget <= 30
              ? `Your ${goal.name} target date is coming up in ${daysToTarget} days! Want to review where things stand?`
              : `Just a heads up - your ${goal.name} goal has about ${Math.round(daysToTarget / 30)} months left. How's progress feeling?`,
            context: `Target date is ${new Date(goal.targetDate).toLocaleDateString()}`,
            generatedAt: new Date(),
            expiresAt: new Date(goal.targetDate),
            relatedGoalId: goal.id,
            relatedTopics: [goal.type, goal.name],
            delivered: false,
          });
        }
      }
      
      // Check for stalled goals
      const daysSinceUpdate = goal.updatedAt
        ? Math.floor((Date.now() - new Date(goal.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      if (goal.status === 'active' && daysSinceUpdate > 30) {
        insights.push({
          id: `goal_stalled_${goal.id}_${daysSinceUpdate}`,
          type: 'goal_check_in',
          priority: 'medium',
          title: `Check in on ${goal.name}`,
          message: `We haven't talked about your ${goal.name} goal in a while. How's that going? Any obstacles I can help think through?`,
          context: `Goal hasn't been updated in ${daysSinceUpdate} days`,
          generatedAt: new Date(),
          relatedGoalId: goal.id,
          relatedTopics: [goal.type],
          delivered: false,
        });
      }
      
      // Celebrate achieved goals
      if (goal.status === 'achieved' && goal.updatedAt) {
        const daysSinceAchieved = Math.floor(
          (Date.now() - new Date(goal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceAchieved <= 7) {
          insights.push({
            id: `goal_achieved_${goal.id}`,
            type: 'celebration',
            priority: 'high',
            title: `Congratulations on ${goal.name}!`,
            message: `You know what? I'm really proud of you for reaching your ${goal.name} goal. That takes discipline. How does it feel?`,
            context: `Goal marked achieved ${daysSinceAchieved} days ago`,
            generatedAt: new Date(),
            relatedGoalId: goal.id,
            relatedTopics: [goal.type, 'achievement'],
            delivered: false,
          });
        }
      }
    }
    
    return insights;
  }
  
  /**
   * Check key moments that need follow-up
   */
  private checkKeyMoments(profile: UserProfile): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    
    for (const moment of profile.keyMoments) {
      if (!moment.followUpNeeded) continue;
      
      const daysSinceMoment = Math.floor(
        (Date.now() - new Date(moment.timestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Follow up on concerns after a few days
      if (moment.type === 'concern' && daysSinceMoment >= 3 && daysSinceMoment <= 14) {
        insights.push({
          id: `moment_followup_${moment.id}`,
          type: 'concern_follow_up',
          priority: moment.emotionalWeight === 'heavy' ? 'high' : 'medium',
          title: `Follow up on ${moment.summary.slice(0, 30)}...`,
          message: `I've been thinking about what you shared - ${moment.summary.toLowerCase()}. How are you feeling about that now?`,
          context: `Key concern from ${daysSinceMoment} days ago`,
          generatedAt: new Date(),
          relatedTopics: moment.topics,
          delivered: false,
        });
      }
      
      // Check in on breakthroughs
      if (moment.type === 'breakthrough' && daysSinceMoment >= 7 && daysSinceMoment <= 21) {
        insights.push({
          id: `breakthrough_followup_${moment.id}`,
          type: 'goal_check_in',
          priority: 'medium',
          title: 'Breakthrough follow-up',
          message: `Remember when you had that realization about ${moment.summary.toLowerCase()}? Has that perspective stuck with you?`,
          context: `Breakthrough moment from ${daysSinceMoment} days ago`,
          generatedAt: new Date(),
          relatedTopics: moment.topics,
          delivered: false,
        });
      }
    }
    
    return insights;
  }
  
  /**
   * Check conversation patterns for insights
   */
  private checkPatterns(
    profile: UserProfile,
    patterns: LearnedConversationPatterns
  ): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    
    // Notice if user often asks about same topics
    if (patterns.topicsThatLeadToEngagement.length > 0) {
      const topTopic = patterns.topicsThatLeadToEngagement[0];
      
      // Only mention if we haven't recently
      const daysSinceLastContact = Math.floor(
        (Date.now() - new Date(profile.lastContact).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastContact >= 7) {
        insights.push({
          id: `topic_pattern_${topTopic}_${Date.now()}`,
          type: 'pattern_noticed',
          priority: 'low',
          title: `Interest in ${topTopic}`,
          message: `You know, I've noticed you really engage when we talk about ${topTopic}. Want to explore that today?`,
          context: `User shows high engagement with ${topTopic}`,
          generatedAt: new Date(),
          relatedTopics: [topTopic],
          delivered: false,
        });
      }
    }
    
    return insights;
  }
  
  /**
   * Check for seasonal opportunities
   */
  private checkSeasonalOpportunities(profile: UserProfile): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const now = new Date();
    const month = now.getMonth();
    const dayOfMonth = now.getDate();
    
    // Tax season (January - April)
    if (month >= 0 && month <= 3) {
      const taxInsightId = `tax_season_${now.getFullYear()}`;
      if (!this.deliveredInsightIds.has(taxInsightId)) {
        insights.push({
          id: taxInsightId,
          type: 'seasonal_reminder',
          priority: month <= 1 ? 'medium' : 'high',
          title: 'Tax season reminder',
          message: month <= 1
            ? "Tax season is coming up! Now's a good time to gather your documents. Want to talk through any tax-advantaged strategies?"
            : "We're in the thick of tax season. Have you had a chance to review your contributions and deductions?",
          context: `Tax season ${now.getFullYear()}`,
          generatedAt: new Date(),
          expiresAt: new Date(now.getFullYear(), 3, 15),
          relatedTopics: ['taxes', 'retirement', '401k', 'IRA'],
          delivered: false,
        });
      }
    }
    
    // Year-end planning (October - December)
    if (month >= 9 && month <= 11) {
      const yearEndId = `year_end_${now.getFullYear()}`;
      if (!this.deliveredInsightIds.has(yearEndId)) {
        insights.push({
          id: yearEndId,
          type: 'seasonal_reminder',
          priority: 'medium',
          title: 'Year-end planning',
          message: "The year's winding down - it's a good time to review your portfolio and max out any retirement contributions. Want to do a quick year-end check?",
          context: `Year-end planning ${now.getFullYear()}`,
          generatedAt: new Date(),
          expiresAt: new Date(now.getFullYear(), 11, 31),
          relatedTopics: ['planning', 'retirement', 'rebalancing'],
          delivered: false,
        });
      }
    }
    
    // Market volatility context (would need market data integration)
    // This is a placeholder for future enhancement
    
    return insights;
  }
  
  /**
   * Check relationship milestones
   */
  private checkRelationshipMilestones(profile: UserProfile): ProactiveInsight | null {
    const firstContact = new Date(profile.firstContact);
    const monthsSinceFirst = Math.floor(
      (Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    
    // Celebrate milestone months (6, 12, 24, etc.)
    const milestones = [6, 12, 24, 36, 48, 60];
    const milestone = milestones.find(m => 
      monthsSinceFirst >= m && monthsSinceFirst < m + 1
    );
    
    if (milestone) {
      const milestoneId = `relationship_${milestone}mo_${profile.id}`;
      if (!this.deliveredInsightIds.has(milestoneId)) {
        const years = milestone >= 12 ? `${Math.floor(milestone / 12)} year${milestone >= 24 ? 's' : ''}` : null;
        const timeStr = years || `${milestone} months`;
        
        return {
          id: milestoneId,
          type: 'relationship_milestone',
          priority: 'low',
          title: `${timeStr} together`,
          message: milestone === 12
            ? `You know, it's been a year since we first started talking! It's been a real pleasure getting to know you.`
            : `I just realized we've been talking for ${timeStr} now. I really enjoy our conversations.`,
          context: `${monthsSinceFirst} months since first contact`,
          generatedAt: new Date(),
          relatedTopics: ['relationship'],
          delivered: false,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Check behavior patterns for suggestions
   */
  private checkBehaviorPatterns(
    profile: UserProfile,
    responsePrefs: LearnedResponsePreferences
  ): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    
    // Only generate if we have enough data
    if (responsePrefs.totalSignals < 10) return insights;
    
    // Notice high-engagement topics the user might not realize
    if (responsePrefs.highEngagementTopics.length > 0) {
      const unexploredTopic = responsePrefs.highEngagementTopics.find(
        t => !profile.preferredTopics.includes(t)
      );
      
      if (unexploredTopic) {
        insights.push({
          id: `behavior_topic_${unexploredTopic}_${Date.now()}`,
          type: 'behavior_suggestion',
          priority: 'low',
          title: `Interest noticed in ${unexploredTopic}`,
          message: `I've noticed you really light up when we talk about ${unexploredTopic}. Would you like to explore that more?`,
          context: `High engagement detected on topic not in stated preferences`,
          generatedAt: new Date(),
          relatedTopics: [unexploredTopic],
          delivered: false,
        });
      }
    }
    
    return insights;
  }
  
  // ============================================================================
  // INSIGHT MANAGEMENT
  // ============================================================================
  
  /**
   * Mark an insight as delivered
   */
  markDelivered(insightId: string, reaction?: 'positive' | 'neutral' | 'dismissed' | 'negative'): void {
    this.deliveredInsightIds.add(insightId);
    
    const insight = this.generatedInsights.find(i => i.id === insightId);
    if (insight) {
      insight.delivered = true;
      insight.deliveredAt = new Date();
      insight.userReaction = reaction;
    }
    
    getLogger().info({ insightId, reaction }, 'Insight marked as delivered');
  }
  
  /**
   * Get undelivered insights
   */
  getUndeliveredInsights(): ProactiveInsight[] {
    return this.generatedInsights.filter(i => !i.delivered);
  }
  
  /**
   * Get the next best insight to deliver
   */
  getNextInsight(): ProactiveInsight | null {
    const undelivered = this.getUndeliveredInsights();
    
    // Filter out expired insights
    const valid = undelivered.filter(i => 
      !i.expiresAt || new Date(i.expiresAt) > new Date()
    );
    
    // Sort by priority
    valid.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    return valid[0] || null;
  }
  
  /**
   * Get all insights for persistence
   */
  getAllInsights(): ProactiveInsight[] {
    return [...this.generatedInsights];
  }
  
  /**
   * Get insight stats
   */
  getStats(): {
    total: number;
    delivered: number;
    pending: number;
    positiveReactions: number;
    negativeReactions: number;
  } {
    const delivered = this.generatedInsights.filter(i => i.delivered);
    const positive = delivered.filter(i => i.userReaction === 'positive').length;
    const negative = delivered.filter(i => 
      i.userReaction === 'negative' || i.userReaction === 'dismissed'
    ).length;
    
    return {
      total: this.generatedInsights.length,
      delivered: delivered.length,
      pending: this.generatedInsights.length - delivered.length,
      positiveReactions: positive,
      negativeReactions: negative,
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, ProactiveInsightEngine>();

export function getProactiveInsightEngine(
  userId: string,
  existingInsights?: ProactiveInsight[]
): ProactiveInsightEngine {
  let engine = engines.get(userId);
  if (!engine) {
    engine = new ProactiveInsightEngine(userId, existingInsights);
    engines.set(userId, engine);
  }
  return engine;
}

export function removeProactiveInsightEngine(userId: string): void {
  engines.delete(userId);
}

export default ProactiveInsightEngine;

