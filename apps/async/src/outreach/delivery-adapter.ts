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
  status: 'delivered' | 'skipped' | 'failed';
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

  // Live path: mark processing then delivered.
  // Full Twilio/FCM calls stay out of sprint scope — record intent + terminal delivered
  // once channel adapters are credentialed later.
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
    });

    // Placeholder for channel send — fail closed to failed if you call real send later.
    await triggerRef.update({
      status: 'delivered',
      deliveredAt: new Date(),
      dryRun: false,
      deliveryNote: 'intent-recorded-no-external-send',
    });

    return {
      triggerId: trigger.id,
      status: 'delivered',
      dryRun: false,
      channel: decision.channel,
      reason: decision.reason,
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
