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
export { EmailIntelligence, getEmailIntelligence, resetEmailIntelligence, } from './email-intelligence.js';
// Follow-up Tracking
export { FollowUpTracker, getFollowUpTracker, resetFollowUpTracker, } from './follow-up-tracker.js';
// Unsubscribe Detection
export { UnsubscribeDetector, getUnsubscribeDetector, resetUnsubscribeDetector, } from './unsubscribe-detector.js';
// Firestore Persistence
export { getEmailIntelligenceData, saveEmailIntelligenceData, saveSenderProfiles, saveFollowUps, saveNewsletters, saveEmailConfig, deleteEmailIntelligenceData, } from './email-intelligence-store.js';
//# sourceMappingURL=index.js.map