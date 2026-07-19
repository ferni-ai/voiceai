import { createLogger } from '../logger.js';
import type {
  DeliveryChannel,
  DeliveryDecision,
  OutreachTrigger,
  WorkerConfig,
} from '../types.js';

const log = createLogger('delivery-adapter');

export interface DeliveryIntentResult {
  triggerId: string;
  status: 'delivered' | 'skipped' | 'failed' | 'processing';
  dryRun: boolean;
  channel: DeliveryChannel;
  reason: string;
}

export async function fulfillDeliveryIntent(
  config: WorkerConfig,
  trigger: OutreachTrigger,
  decision: DeliveryDecision
): Promise<DeliveryIntentResult> {
  const { db, dryRun = false } = config;
  const triggerRef = db.collection('outreach_triggers').doc(trigger.id);

  if (!decision.shouldDeliver || decision.channel === 'none') {
    const reason = decision.reason || 'not eligible';
    await triggerRef.update({
      status: 'skipped',
      processedAt: new Date(),
      cancelReason: reason,
      dryRun,
    });
    return {
      triggerId: trigger.id,
      status: 'skipped',
      dryRun,
      channel: decision.channel,
      reason,
    };
  }

  const deliveryIntent = {
    channel: decision.channel,
    delayMinutes: decision.delayMinutes,
    reason: decision.reason,
    recordedAt: new Date().toISOString(),
  };

  if (dryRun) {
    log.info({ triggerId: trigger.id, deliveryIntent }, '[DRY RUN] Delivery intent recorded');
    await triggerRef.update({
      status: 'delivered',
      processedAt: new Date(),
      deliveredAt: new Date(),
      dryRun: true,
      deliveryIntent,
      decision: {
        channel: decision.channel,
        delayMinutes: decision.delayMinutes,
        reason: decision.reason,
      },
    });
    return {
      triggerId: trigger.id,
      status: 'delivered',
      dryRun: true,
      channel: decision.channel,
      reason: decision.reason,
    };
  }

  // Live path: channel send (Twilio/FCM) is out of sprint scope — creds aren't
  // wired yet. We must NEVER write status `delivered` without a real external
  // send, or DRY_RUN being unset in prod would silently mask uncontacted users.
  // Record the intent and leave the trigger in `processing` so it's visibly
  // "not yet actually delivered" until a real channel adapter lands.
  try {
    await triggerRef.update({
      status: 'processing',
      processedAt: new Date(),
      decision: {
        channel: decision.channel,
        delayMinutes: decision.delayMinutes,
        reason: decision.reason,
      },
      deliveryIntent,
      dryRun: false,
      deliveryNote: 'intent-recorded-awaiting-channel-send',
    });

    return {
      triggerId: trigger.id,
      status: 'processing',
      dryRun: false,
      channel: decision.channel,
      reason: 'external channel send not implemented; intent recorded as processing',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await triggerRef.update({
      status: 'failed',
      processedAt: new Date(),
      error: message,
    });
    return {
      triggerId: trigger.id,
      status: 'failed',
      dryRun: false,
      channel: decision.channel,
      reason: message,
    };
  }
}
