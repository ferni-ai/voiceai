/**
 * Concierge Service
 *
 * AI-powered outreach on behalf of users - making calls, sending emails,
 * and texting businesses to get quotes, make reservations, and schedule appointments.
 *
 * This is "Better Than Human" - doing what no friend has time to do consistently.
 */

export type * from './types.js';

// Core services
export { ConciergeRouter, createConciergeRouter } from './router.js';
export { TaskTracker, getTaskTracker } from './tracker/task-tracker.js';

// Discovery
export { discoverBusinesses } from './discovery/google-places.js';

// Outreach executors
export { PhoneCaller } from './outreach/phone-caller.js';
export { EmailSender } from './outreach/email-sender.js';
export { SmsSender } from './outreach/sms-sender.js';

// Domain scripts
export { getScript } from './scripts/index.js';

// Parser
export { parseTranscript, parseMultipleTranscripts } from './parser/transcript-parser.js';

// Notifications
export {
  notifyRequestComplete,
  notifyProgress,
  registerNotifier,
} from './notification/result-notifier.js';
