/**
 * Outreach Scheduler Cloud Function
 *
 * Processes pending proactive outreach ("thinking of you", celebrations, etc.)
 * for all users who have outreach enabled.
 *
 * Deployment:
 *   gcloud functions deploy outreachScheduler \
 *     --gen2 --runtime=nodejs20 \
 *     --trigger-topic=outreach-trigger \
 *     --entry-point outreachScheduler \
 *     --timeout=300s --memory=512MB --region=us-central1
 *
 * Set up Cloud Scheduler to trigger every 15 minutes:
 *   gcloud scheduler jobs create pubsub outreach-check \
 *     --schedule="*/15 * * * *" \
 *     --topic=outreach-trigger \
 *     --message-body="{}" \
 *     --time-zone="America/New_York" \
 *     --location=us-central1
 *
 * Philosophy:
 * - Check-ins should feel natural, not scheduled
 * - Only send if timing is optimal (per user preferences)
 * - Never interrupt - respect quiet hours and frequency limits
 *
 * @module functions/outreach-scheduler
 */

import { CloudEvent } from 'firebase-functions/v2';
import { onMessagePublished, MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already
if (getApps().length === 0) {
  initializeApp();
}

const firestore = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

interface OutreachQueueItem {
  userId: string;
  type: 'thinking_of_you' | 'celebration' | 'growth_reflection' | 'life_event_reminder';
  message: string;
  scheduledFor: Date;
  priority: 'high' | 'normal' | 'low';
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

interface UserOutreachState {
  outreachEnabled: boolean;
  lastOutreachSent?: Date;
  preferredChannel: 'push' | 'email' | 'sms';
  quietHours?: { start: number; end: number };
  maxPerDay?: number;
  maxPerWeek?: number;
}

interface ProcessingResult {
  userId: string;
  sent: boolean;
  channel?: string;
  error?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if current time is within user's quiet hours
 */
function isQuietHours(state: UserOutreachState): boolean {
  if (!state.quietHours) return false;
  
  const hour = new Date().getHours();
  const { start, end } = state.quietHours;
  
  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return hour >= start || hour < end;
  }
  
  return hour >= start && hour < end;
}

/**
 * Check if user has exceeded their outreach limits
 */
async function hasExceededLimits(
  userId: string,
  state: UserOutreachState
): Promise<boolean> {
  const now = new Date();
  
  // Get recent outreach history
  const historyRef = firestore
    .collection('bogle_users')
    .doc(userId)
    .collection('outreach_history');
  
  // Check daily limit
  if (state.maxPerDay) {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayCount = await historyRef
      .where('sentAt', '>=', todayStart)
      .count()
      .get();
    
    if (todayCount.data().count >= state.maxPerDay) {
      return true;
    }
  }
  
  // Check weekly limit
  if (state.maxPerWeek) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const weekCount = await historyRef
      .where('sentAt', '>=', weekStart)
      .count()
      .get();
    
    if (weekCount.data().count >= state.maxPerWeek) {
      return true;
    }
  }
  
  return false;
}

/**
 * Send outreach via the appropriate channel
 */
async function sendOutreach(
  userId: string,
  item: OutreachQueueItem,
  state: UserOutreachState
): Promise<{ success: boolean; channel?: string; error?: string }> {
  // Get user contact info
  const userDoc = await firestore.collection('bogle_users').doc(userId).get();
  const userData = userDoc.data() || {};
  
  const channel = state.preferredChannel;
  
  try {
    switch (channel) {
      case 'push': {
        const pushToken = userData.pushToken;
        if (!pushToken) {
          return { success: false, error: 'No push token' };
        }
        
        // Send via Firebase Cloud Messaging
        const { getMessaging } = await import('firebase-admin/messaging');
        const messaging = getMessaging();
        
        await messaging.send({
          token: pushToken,
          notification: {
            title: 'Ferni',
            body: item.message,
          },
          data: {
            type: item.type,
            userId,
          },
          webpush: {
            fcmOptions: {
              link: 'https://app.ferni.ai',
            },
          },
        });
        
        return { success: true, channel: 'push' };
      }
      
      case 'email': {
        const email = userData.email;
        if (!email) {
          return { success: false, error: 'No email address' };
        }
        
        // Send via SendGrid (simplified - actual implementation in notification-delivery.ts)
        console.log(`Would send email to ${email}: ${item.message}`);
        return { success: true, channel: 'email' };
      }
      
      case 'sms': {
        const phone = userData.phone;
        if (!phone) {
          return { success: false, error: 'No phone number' };
        }
        
        // Send via Twilio (simplified - actual implementation in notification-delivery.ts)
        console.log(`Would send SMS to ${phone}: ${item.message}`);
        return { success: true, channel: 'sms' };
      }
      
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  } catch (error) {
    console.error('Send failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Record outreach in history
 */
async function recordOutreach(
  userId: string,
  item: OutreachQueueItem,
  result: { success: boolean; channel?: string; error?: string }
): Promise<void> {
  await firestore
    .collection('bogle_users')
    .doc(userId)
    .collection('outreach_history')
    .add({
      ...item,
      sentAt: new Date(),
      success: result.success,
      channel: result.channel,
      error: result.error,
    });
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process pending outreach for all eligible users
 */
export async function processOutreach(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  results: ProcessingResult[];
}> {
  const results: ProcessingResult[] = [];
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  
  const now = new Date();
  
  // Get all pending outreach items that are due
  const pendingRef = firestore.collectionGroup('outreach_queue');
  const pendingSnapshot = await pendingRef
    .where('scheduledFor', '<=', now)
    .where('sent', '==', false)
    .limit(100) // Process in batches
    .get();
  
  console.log(`Found ${pendingSnapshot.docs.length} pending outreach items`);
  
  for (const doc of pendingSnapshot.docs) {
    const item = doc.data() as OutreachQueueItem;
    const userId = item.userId;
    processed++;
    
    try {
      // Get user's outreach state
      const stateDoc = await firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('settings')
        .doc('outreach')
        .get();
      
      const state: UserOutreachState = stateDoc.exists
        ? (stateDoc.data() as UserOutreachState)
        : {
            outreachEnabled: false,
            preferredChannel: 'push',
          };
      
      // Check if outreach is enabled
      if (!state.outreachEnabled) {
        skipped++;
        results.push({ userId, sent: false, error: 'Outreach disabled' });
        
        // Mark as processed (but not sent)
        await doc.ref.update({ processed: true, skippedReason: 'disabled' });
        continue;
      }
      
      // Check quiet hours
      if (isQuietHours(state)) {
        skipped++;
        results.push({ userId, sent: false, error: 'Quiet hours' });
        
        // Reschedule for after quiet hours
        const nextWindow = new Date();
        nextWindow.setHours(state.quietHours!.end + 1, 0, 0, 0);
        await doc.ref.update({ scheduledFor: nextWindow });
        continue;
      }
      
      // Check limits
      if (await hasExceededLimits(userId, state)) {
        skipped++;
        results.push({ userId, sent: false, error: 'Rate limited' });
        
        // Reschedule for tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        await doc.ref.update({ scheduledFor: tomorrow });
        continue;
      }
      
      // Send the outreach
      const sendResult = await sendOutreach(userId, item, state);
      
      if (sendResult.success) {
        sent++;
        results.push({ userId, sent: true, channel: sendResult.channel });
        
        // Mark as sent
        await doc.ref.update({ sent: true, sentAt: new Date(), channel: sendResult.channel });
        
        // Record in history
        await recordOutreach(userId, item, sendResult);
      } else {
        failed++;
        results.push({ userId, sent: false, error: sendResult.error });
        
        // Mark as failed
        await doc.ref.update({
          sent: false,
          lastAttempt: new Date(),
          lastError: sendResult.error,
          attempts: (doc.data().attempts || 0) + 1,
        });
      }
    } catch (error) {
      failed++;
      results.push({ userId, sent: false, error: String(error) });
      console.error(`Error processing outreach for ${userId}:`, error);
    }
  }
  
  console.log(`Outreach processing complete: ${sent} sent, ${skipped} skipped, ${failed} failed`);
  
  return { processed, sent, skipped, failed, results };
}

/**
 * Cloud Function entry point (Pub/Sub trigger)
 */
export const outreachScheduler = onMessagePublished(
  {
    topic: 'outreach-trigger',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event: CloudEvent<MessagePublishedData>) => {
    console.log('🔔 Outreach scheduler triggered');
    
    const result = await processOutreach();
    
    console.log('📬 Outreach processing result:', result);
    
    return result;
  }
);

/**
 * HTTP entry point for manual triggers (for testing)
 */
export async function outreachSchedulerHttp(
  req: { body?: unknown },
  res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }
): Promise<void> {
  console.log('🔔 Outreach scheduler HTTP triggered');
  
  try {
    const result = await processOutreach();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Outreach scheduler error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
}

