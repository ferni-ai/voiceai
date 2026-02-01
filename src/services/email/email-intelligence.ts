/**
 * Email Intelligence Service
 *
 * ML-based email prioritization and intelligence:
 * - Importance scoring
 * - Sender reputation tracking
 * - Response urgency detection
 * - Email categorization
 * - Smart summarization
 *
 * @module services/email/email-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EmailSummary } from '../gmail/gmail-service.js';

const log = createLogger({ module: 'email-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type EmailPriority = 'critical' | 'high' | 'normal' | 'low' | 'bulk';
export type EmailCategory =
  | 'primary'
  | 'updates'
  | 'social'
  | 'promotions'
  | 'forums'
  | 'receipts'
  | 'newsletters'
  | 'automated'
  | 'personal';

export interface EmailScore {
  emailId: string;
  priority: EmailPriority;
  priorityScore: number; // 0-100
  urgencyScore: number; // 0-100
  importanceScore: number; // 0-100
  category: EmailCategory;
  confidence: number; // 0-1

  // Signal breakdown
  signals: {
    senderReputation: number;
    subjectUrgency: number;
    bodyImportance: number;
    timeRelevance: number;
    threadActivity: number;
    personalConnection: number;
  };

  // Actions
  suggestedAction:
    | 'respond_now'
    | 'respond_today'
    | 'respond_this_week'
    | 'archive'
    | 'unsubscribe'
    | 'review';
  responseTimeHours?: number;

  scoredAt: Date;
}

export interface SenderProfile {
  email: string;
  name?: string;
  domain: string;

  // Reputation
  reputationScore: number; // 0-100
  emailCount: number;
  responseRate: number; // How often user responds
  avgResponseTimeHours: number;

  // Classification
  isVip: boolean;
  isAutomatic: boolean;
  isNewsletter: boolean;
  isPersonal: boolean;

  // Categories this sender typically sends
  categories: EmailCategory[];

  // Last interaction
  lastEmailAt?: Date;
  lastResponseAt?: Date;

  // User actions
  unsubscribeRequested: boolean;
  blocked: boolean;

  updatedAt: Date;
}

export interface EmailIntelligenceConfig {
  userId: string;
  vipSenders: string[];
  priorityKeywords: string[];
  lowPriorityKeywords: string[];
  blockedDomains: string[];
  autoArchiveSenders: string[];
  workHoursStart: number; // 0-23
  workHoursEnd: number;
  timezone: string;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const WEIGHTS = {
  sender: 0.35,
  subject: 0.25,
  body: 0.15,
  time: 0.1,
  thread: 0.1,
  personal: 0.05,
};

const URGENCY_KEYWORDS = [
  'urgent',
  'asap',
  'immediately',
  'critical',
  'emergency',
  'deadline',
  'today',
  'tonight',
  'now',
  'time sensitive',
  'action required',
  'response needed',
  'please respond',
  'waiting for',
  'overdue',
];

const LOW_PRIORITY_KEYWORDS = [
  'newsletter',
  'unsubscribe',
  'no reply',
  'noreply',
  'automated',
  'weekly digest',
  'monthly update',
  'promotional',
  'sale',
  'discount',
  'off',
  '% off',
  'free',
  'limited time',
  "don't miss",
];

const PERSONAL_INDICATORS = [
  'call me',
  "let's meet",
  'lunch',
  'dinner',
  'coffee',
  'chat',
  'your thoughts',
  'what do you think',
  'advice',
  'help',
];

// ============================================================================
// EMAIL INTELLIGENCE CLASS
// ============================================================================

export class EmailIntelligence {
  private senderProfiles: Map<string, SenderProfile> = new Map();
  private config: EmailIntelligenceConfig;

  constructor(config: EmailIntelligenceConfig) {
    this.config = config;
    log.info({ userId: config.userId }, 'Email intelligence initialized');
  }

  // ==========================================================================
  // SCORING
  // ==========================================================================

  /**
   * Score an email for prioritization
   */
  scoreEmail(email: EmailSummary): EmailScore {
    const senderProfile = this.getSenderProfile(email.fromEmail);

    // Calculate individual signals
    const signals = {
      senderReputation: this.scoreSender(email, senderProfile),
      subjectUrgency: this.scoreSubject(email.subject),
      bodyImportance: this.scoreBody(email.snippet),
      timeRelevance: this.scoreTimeRelevance(email.date),
      threadActivity: email.threadId ? 60 : 40, // Simplified - would check thread activity
      personalConnection: this.scorePersonalConnection(email, senderProfile),
    };

    // Calculate weighted score
    const priorityScore = Math.round(
      signals.senderReputation * WEIGHTS.sender +
        signals.subjectUrgency * WEIGHTS.subject +
        signals.bodyImportance * WEIGHTS.body +
        signals.timeRelevance * WEIGHTS.time +
        signals.threadActivity * WEIGHTS.thread +
        signals.personalConnection * WEIGHTS.personal
    );

    // Determine priority level
    const priority = this.determinePriority(priorityScore, email, senderProfile);

    // Determine category
    const category = this.categorizeEmail(email, senderProfile);

    // Determine urgency
    const urgencyScore = Math.round(
      signals.subjectUrgency * 0.5 + signals.timeRelevance * 0.3 + signals.senderReputation * 0.2
    );

    // Suggested action
    const suggestedAction = this.suggestAction(priority, urgencyScore, category);

    const score: EmailScore = {
      emailId: email.id,
      priority,
      priorityScore,
      urgencyScore,
      importanceScore: signals.senderReputation,
      category,
      confidence: 0.75, // Would use ML model confidence in production
      signals,
      suggestedAction,
      responseTimeHours: this.estimateResponseTime(priority, urgencyScore),
      scoredAt: new Date(),
    };

    return score;
  }

  /**
   * Batch score multiple emails
   */
  scoreEmails(emails: EmailSummary[]): EmailScore[] {
    return emails.map((email) => this.scoreEmail(email));
  }

  /**
   * Get top priority emails
   */
  getTopPriorityEmails(scores: EmailScore[], limit: number = 5): EmailScore[] {
    return scores
      .filter((s) => s.priority !== 'bulk' && s.priority !== 'low')
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);
  }

  // ==========================================================================
  // SIGNAL SCORING
  // ==========================================================================

  private scoreSender(email: EmailSummary, profile: SenderProfile): number {
    // VIP senders get high score
    if (this.config.vipSenders.includes(email.fromEmail.toLowerCase())) {
      return 95;
    }

    // Blocked domains get zero
    if (this.config.blockedDomains.some((d) => email.fromEmail.toLowerCase().includes(d))) {
      return 0;
    }

    // Use sender profile if available
    if (profile.reputationScore > 0) {
      let score = profile.reputationScore;

      // Boost for personal contacts
      if (profile.isPersonal) score = Math.min(100, score + 15);

      // Reduce for newsletters/automated
      if (profile.isNewsletter || profile.isAutomatic) score = Math.max(0, score - 20);

      return score;
    }

    // Default scoring based on email characteristics
    let score = 50;

    // Known domains get slight boost
    const knownDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'];
    if (knownDomains.some((d) => email.fromEmail.toLowerCase().endsWith(d))) {
      score += 5;
    }

    // Important/starred emails
    if (email.isImportant) score += 20;
    if (email.isStarred) score += 15;

    return Math.min(100, Math.max(0, score));
  }

  private scoreSubject(subject: string): number {
    const lower = subject.toLowerCase();
    let score = 50;

    // Check urgency keywords
    for (const keyword of URGENCY_KEYWORDS) {
      if (lower.includes(keyword)) {
        score += 15;
        break;
      }
    }

    // Check priority keywords from config
    for (const keyword of this.config.priorityKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 20;
        break;
      }
    }

    // Check low priority keywords
    for (const keyword of LOW_PRIORITY_KEYWORDS) {
      if (lower.includes(keyword)) {
        score -= 20;
        break;
      }
    }

    // RE: or FW: indicates ongoing conversation
    if (lower.startsWith('re:') || lower.startsWith('fw:')) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private scoreBody(snippet: string): number {
    const lower = snippet.toLowerCase();
    let score = 50;

    // Check for questions directed at user
    if (lower.includes('?')) score += 10;

    // Check for personal indicators
    for (const indicator of PERSONAL_INDICATORS) {
      if (lower.includes(indicator)) {
        score += 15;
        break;
      }
    }

    // Check for promotional content
    for (const keyword of LOW_PRIORITY_KEYWORDS) {
      if (lower.includes(keyword)) {
        score -= 15;
        break;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  private scoreTimeRelevance(emailDate: Date): number {
    const now = new Date();
    const ageHours = (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

    // Recent emails are more relevant
    if (ageHours < 1) return 100;
    if (ageHours < 4) return 85;
    if (ageHours < 12) return 70;
    if (ageHours < 24) return 55;
    if (ageHours < 48) return 40;
    if (ageHours < 72) return 30;
    return 20;
  }

  private scorePersonalConnection(email: EmailSummary, profile: SenderProfile): number {
    let score = 40;

    if (profile.isPersonal) score += 30;
    if (profile.responseRate > 0.5) score += 20;
    if (profile.isVip) score += 30;
    if (profile.isAutomatic) score -= 30;

    return Math.min(100, Math.max(0, score));
  }

  // ==========================================================================
  // CLASSIFICATION
  // ==========================================================================

  private determinePriority(
    score: number,
    email: EmailSummary,
    profile: SenderProfile
  ): EmailPriority {
    // VIP always high priority
    if (profile.isVip || this.config.vipSenders.includes(email.fromEmail.toLowerCase())) {
      return score > 70 ? 'critical' : 'high';
    }

    // Newsletter/automated always low or bulk
    if (profile.isNewsletter || profile.isAutomatic) {
      return score > 60 ? 'low' : 'bulk';
    }

    // Score-based
    if (score >= 80) return 'critical';
    if (score >= 65) return 'high';
    if (score >= 45) return 'normal';
    if (score >= 25) return 'low';
    return 'bulk';
  }

  private categorizeEmail(email: EmailSummary, profile: SenderProfile): EmailCategory {
    // Use profile categories if available
    if (profile.categories.length > 0) {
      return profile.categories[0];
    }

    const lower = (email.subject + ' ' + email.snippet).toLowerCase();

    // Receipts
    if (
      lower.includes('receipt') ||
      lower.includes('order confirmation') ||
      lower.includes('invoice')
    ) {
      return 'receipts';
    }

    // Newsletters
    if (lower.includes('newsletter') || lower.includes('unsubscribe') || profile.isNewsletter) {
      return 'newsletters';
    }

    // Promotions
    if (lower.includes('sale') || lower.includes('discount') || lower.includes('% off')) {
      return 'promotions';
    }

    // Automated
    if (profile.isAutomatic || lower.includes('noreply') || lower.includes('do not reply')) {
      return 'automated';
    }

    // Social
    if (email.labels.includes('CATEGORY_SOCIAL')) {
      return 'social';
    }

    // Forums
    if (email.labels.includes('CATEGORY_FORUMS')) {
      return 'forums';
    }

    // Updates
    if (email.labels.includes('CATEGORY_UPDATES')) {
      return 'updates';
    }

    // Personal if high personal connection score
    if (profile.isPersonal || profile.responseRate > 0.3) {
      return 'personal';
    }

    return 'primary';
  }

  private suggestAction(
    priority: EmailPriority,
    urgencyScore: number,
    category: EmailCategory
  ): EmailScore['suggestedAction'] {
    if (category === 'newsletters' || category === 'promotions') {
      return urgencyScore > 30 ? 'review' : 'unsubscribe';
    }

    if (category === 'automated' || category === 'receipts') {
      return 'archive';
    }

    switch (priority) {
      case 'critical':
        return 'respond_now';
      case 'high':
        return urgencyScore > 70 ? 'respond_now' : 'respond_today';
      case 'normal':
        return 'respond_this_week';
      case 'low':
        return 'review';
      case 'bulk':
        return 'archive';
      default:
        return 'review';
    }
  }

  private estimateResponseTime(priority: EmailPriority, urgencyScore: number): number | undefined {
    if (priority === 'bulk' || priority === 'low') {
      return undefined;
    }

    if (priority === 'critical' || urgencyScore > 80) {
      return 2;
    }
    if (priority === 'high') {
      return 12;
    }
    if (priority === 'normal') {
      return 48;
    }
    return 72;
  }

  // ==========================================================================
  // SENDER PROFILES
  // ==========================================================================

  /**
   * Get or create sender profile
   */
  getSenderProfile(email: string): SenderProfile {
    const lowerEmail = email.toLowerCase();
    let profile = this.senderProfiles.get(lowerEmail);

    if (!profile) {
      profile = this.createDefaultProfile(lowerEmail);
      this.senderProfiles.set(lowerEmail, profile);
    }

    return profile;
  }

  /**
   * Update sender profile based on user action
   */
  updateSenderProfile(email: string, update: Partial<SenderProfile>): void {
    const profile = this.getSenderProfile(email);
    Object.assign(profile, update, { updatedAt: new Date() });
    this.senderProfiles.set(email.toLowerCase(), profile);
  }

  /**
   * Mark sender as VIP
   */
  markAsVip(email: string): void {
    this.updateSenderProfile(email, { isVip: true, reputationScore: 95 });
    if (!this.config.vipSenders.includes(email.toLowerCase())) {
      this.config.vipSenders.push(email.toLowerCase());
    }
  }

  /**
   * Block sender
   */
  blockSender(email: string): void {
    this.updateSenderProfile(email, { blocked: true, reputationScore: 0 });
  }

  /**
   * Request unsubscribe
   */
  requestUnsubscribe(email: string): void {
    this.updateSenderProfile(email, { unsubscribeRequested: true, isNewsletter: true });
  }

  private createDefaultProfile(email: string): SenderProfile {
    const domain = email.split('@')[1] || '';

    // Detect known automated/newsletter domains
    const isAutomatic = ['noreply', 'no-reply', 'donotreply', 'mailer'].some((n) =>
      email.includes(n)
    );
    const isNewsletter = ['newsletter', 'news', 'update', 'digest'].some((n) => email.includes(n));

    return {
      email,
      domain,
      reputationScore: 50,
      emailCount: 1,
      responseRate: 0,
      avgResponseTimeHours: 0,
      isVip: false,
      isAutomatic,
      isNewsletter,
      isPersonal: false,
      categories: [],
      unsubscribeRequested: false,
      blocked: false,
      updatedAt: new Date(),
    };
  }

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  /**
   * Get emails that should be auto-archived
   */
  getAutoArchiveCandidates(scores: EmailScore[]): EmailScore[] {
    return scores.filter(
      (s) =>
        s.suggestedAction === 'archive' || s.category === 'automated' || s.category === 'receipts'
    );
  }

  /**
   * Get newsletters for potential unsubscribe
   */
  getUnsubscribeCandidates(scores: EmailScore[]): EmailScore[] {
    return scores.filter(
      (s) =>
        s.category === 'newsletters' ||
        s.category === 'promotions' ||
        s.suggestedAction === 'unsubscribe'
    );
  }

  /**
   * Get summary of inbox health
   */
  getInboxHealth(scores: EmailScore[]): {
    totalEmails: number;
    criticalCount: number;
    needsAttention: number;
    canArchive: number;
    unsubscribeCandidates: number;
    avgPriorityScore: number;
  } {
    const critical = scores.filter((s) => s.priority === 'critical').length;
    const high = scores.filter((s) => s.priority === 'high').length;
    const autoArchive = this.getAutoArchiveCandidates(scores).length;
    const unsubscribe = this.getUnsubscribeCandidates(scores).length;

    const avgScore =
      scores.length > 0 ? scores.reduce((sum, s) => sum + s.priorityScore, 0) / scores.length : 0;

    return {
      totalEmails: scores.length,
      criticalCount: critical,
      needsAttention: critical + high,
      canArchive: autoArchive,
      unsubscribeCandidates: unsubscribe,
      avgPriorityScore: Math.round(avgScore),
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, EmailIntelligence> = new Map();

export function getEmailIntelligence(userId: string): EmailIntelligence {
  let instance = instances.get(userId);

  if (!instance) {
    instance = new EmailIntelligence({
      userId,
      vipSenders: [],
      priorityKeywords: ['urgent', 'deadline', 'meeting', 'interview'],
      lowPriorityKeywords: ['newsletter', 'unsubscribe', 'promo'],
      blockedDomains: [],
      autoArchiveSenders: [],
      workHoursStart: 9,
      workHoursEnd: 18,
      timezone: 'America/New_York',
    });
    instances.set(userId, instance);
  }

  return instance;
}

export function resetEmailIntelligence(userId: string): void {
  instances.delete(userId);
}
