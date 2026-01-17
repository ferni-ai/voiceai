/**
 * Email Services
 *
 * Comprehensive email intelligence system:
 * - Email prioritization and scoring
 * - Follow-up tracking
 * - Newsletter/unsubscribe management
 * - Firestore persistence
 *
 * @module services/email
 */

// Email Intelligence
export {
  EmailIntelligence,
  getEmailIntelligence,
  resetEmailIntelligence,
  type EmailPriority,
  type EmailCategory,
  type EmailScore,
  type SenderProfile,
  type EmailIntelligenceConfig,
} from './email-intelligence.js';

// Follow-up Tracking
export {
  FollowUpTracker,
  getFollowUpTracker,
  resetFollowUpTracker,
  type FollowUp,
  type FollowUpStatus,
  type FollowUpPriority,
  type ContactResponsePattern,
  type FollowUpSummary,
} from './follow-up-tracker.js';

// Unsubscribe Detection
export {
  UnsubscribeDetector,
  getUnsubscribeDetector,
  resetUnsubscribeDetector,
  type UnsubscribeLink,
  type UnsubscribeRequest,
  type UnsubscribeMethod,
  type UnsubscribeStatus,
  type NewsletterSubscription,
} from './unsubscribe-detector.js';

// Firestore Persistence
export {
  getEmailIntelligenceData,
  saveEmailIntelligenceData,
  saveSenderProfiles,
  saveFollowUps,
  saveNewsletters,
  saveEmailConfig,
  deleteEmailIntelligenceData,
  type EmailIntelligenceData,
} from './email-intelligence-store.js';
