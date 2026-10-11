/**
 * The production edges for the proactive check-in run: the app's message panel.
 *
 * @module services/outreach/proactive-channels/default-deps
 */

import { saveInAppMessage } from '../unified-delivery.js';
import type { ProactiveDeps } from './proactive-tick.js';

export function defaultProactiveDeps(): ProactiveDeps {
  return {
    async sendInApp(userId, trigger) {
      const result = await saveInAppMessage(userId, {
        type: `proactive_${trigger.kind}`,
        personaId: 'ferni',
        text: trigger.text,
        reason: trigger.reason,
        triggerId: trigger.sourceId,
      });
      return result.success;
    },
  };
}
