/**
 * Best Time Tool
 *
 * Query the best times to reach a specific contact.
 * "When's the best time to call mom?"
 *
 * @module tools/domains/family/best-time-tool
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'best-time-tool' });

// ============================================================================
// SCHEMAS
// ============================================================================

export const getBestTimeSchema = z.object({
  contactName: z.string().describe('Who you want to call - name or relationship like "mom"'),
});

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Get best time to reach a contact
 */
export async function getBestTimeToCall(
  params: z.infer<typeof getBestTimeSchema>,
  ctx: { userId: string }
): Promise<string> {
  const { contactName } = params;

  log.info({ contactName, userId: ctx.userId }, 'Getting best time to call');

  try {
    // Resolve contact phone
    let contactPhone: string | undefined;
    let resolvedName = contactName;

    try {
      const { findContactForTelephony, isEntityStoreReady } =
        await import('../../../memory/entity-store/integration.js');
      if (isEntityStoreReady()) {
        const contact = await findContactForTelephony(ctx.userId, contactName);
        if (contact) {
          contactPhone = contact.phone;
          resolvedName = contact.name;
        }
      }
    } catch {
      // Continue without phone resolution
    }

    if (!contactPhone) {
      return (
        `I don't have ${contactName}'s phone number saved yet, so I can't tell you the best time to reach them. ` +
        `Want to add their contact info?`
      );
    }

    // Get best times
    const { getBestTimesForContact } =
      await import('../../../intelligence/context-builders/family/best-time-awareness.js');

    const timing = await getBestTimesForContact(ctx.userId, contactPhone);

    if (!timing || timing.bestTimes.length === 0) {
      return (
        `I haven't called ${resolvedName} enough times yet to know when they're most likely to answer. ` +
        `After a few more calls, I'll learn their patterns and can tell you the best times to reach them.`
      );
    }

    return formatBestTimeResponse(resolvedName, timing);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get best time');
    return 'I had trouble looking up timing data. Let me try again later.';
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatBestTimeResponse(
  contactName: string,
  timing: {
    bestTimes: string[];
    worstTimes: string[];
    suggestion: string;
  }
): string {
  const parts: string[] = [];

  // Main suggestion
  parts.push(`Based on past calls, here's what I know about reaching ${contactName}:`);
  parts.push('');

  // Best times
  if (timing.bestTimes.length > 0) {
    parts.push('**Best times:**');
    for (const time of timing.bestTimes) {
      parts.push(`✅ ${time}`);
    }
    parts.push('');
  }

  // Times to avoid
  if (timing.worstTimes.length > 0) {
    parts.push('**Times with past no-answers:**');
    for (const time of timing.worstTimes) {
      parts.push(`⚠️ ${time}`);
    }
    parts.push('');
  }

  // Suggestion
  parts.push(`💡 ${timing.suggestion}`);

  // Current time assessment
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 9 && hour <= 19) {
    parts.push('');
    parts.push('Right now is within typical calling hours - want me to try them?');
  } else if (hour < 9) {
    parts.push('');
    parts.push("It's a bit early right now. I can try later when they're more likely to be up.");
  } else {
    parts.push('');
    parts.push("It's getting late. Should I try tomorrow at a better time?");
  }

  return parts.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const bestTimeTool = {
  name: 'getBestTimeToCall',
  description:
    'Find out the best time to reach a specific contact based on call history. "When\'s the best time to call mom?"',
  schema: getBestTimeSchema,
  execute: getBestTimeToCall,
};

export default bestTimeTool;
