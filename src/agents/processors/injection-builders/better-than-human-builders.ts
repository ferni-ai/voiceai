/**
 * "Better Than Human" Injection Builders
 *
 * These capabilities make Ferni genuinely better than a human friend:
 * - Ambient awareness (environment detection)
 * - Boundary checking (detailed guidance)
 * - Health awareness (system health transparency)
 * - User health (Apple HealthKit data)
 * - Visual memory (photo/image recall)
 * - Ambient mode (continuous background presence)
 * - Human transfer (knowing when to bring in a human)
 * - Crisis history (gentle follow-up after crisis)
 *
 * Priority: 72-91 (high but below safety)
 */

import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';
import type { UserData } from '../../shared/types.js';
import { getCachedInjection, setCachedInjection } from './cache.js';
import type { BoundaryCheckContext } from './types.js';

// ============================================================================
// AMBIENT AWARENESS INJECTION BUILDER
// Priority: 77-79
// ============================================================================

/**
 * Build ambient awareness context injection
 *
 * "Better than Human" - A human friend on the phone might not notice
 * you're at a coffee shop or in a car. We do, and we acknowledge it.
 */
export function buildAmbientAwarenessInjections(userData: UserData): ContextInjection[] {
  const injections: ContextInjection[] = [];

  const environment = userData.ambientEnvironment;
  const noiseLevel = userData.ambientNoiseLevel ?? 0;
  const hasOfferedToPause = userData.hasOfferedToPause ?? false;

  if (!environment || environment === 'quiet_room' || environment === 'unknown') {
    return injections;
  }

  const environmentDescriptions: Record<string, string> = {
    office: 'an office (background conversations, typing)',
    coffee_shop: 'a coffee shop (ambient chatter, music)',
    outdoors: 'outside (wind, traffic sounds)',
    car: 'a car (road noise, engine)',
    public_transit: 'public transit (announcements, crowd)',
    noisy: 'somewhere noisy',
  };

  const envDescription = environmentDescriptions[environment] || 'a busy environment';

  if (noiseLevel > 0.6 && !hasOfferedToPause) {
    injections.push({
      category: 'ambient_awareness',
      content: `[🔊 AMBIENT AWARENESS - "Better than Human"]
It sounds like they're in ${envDescription}. The background noise is significant.

Natural acknowledgment: "It sounds like you're somewhere pretty busy - if it's hard to hear or you need to go, just say so."

This shows you're paying attention to THEM, not just their words. A human friend on the phone might not notice. You did.

Keep responses concise and clear for their noisy environment.`,
      priority: 79,
    });

    diag.info('🔊 Noisy environment detected', {
      environment,
      noiseLevel: noiseLevel.toFixed(2),
      suggesting: 'offer_to_pause',
    });
  } else if (noiseLevel > 0.35) {
    injections.push({
      category: 'ambient_awareness',
      content: `[🔊 AMBIENT CONTEXT]
User appears to be in ${envDescription}.

Consideration: Keep responses clear and slightly more concise. Don't mention the environment unless it's natural to do so.`,
      priority: 77,
    });
  } else if (environment === 'car' || environment === 'public_transit') {
    injections.push({
      category: 'ambient_awareness',
      content: `[🚗 ON-THE-GO]
User appears to be traveling (${environment === 'car' ? 'driving/riding' : 'on transit'}).

Keep responses brief and to the point. They're multitasking.`,
      priority: 77,
    });
  }

  return injections;
}

// ============================================================================
// BOUNDARY CHECK DETAILED GUIDANCE
// Priority: 88-91
// ============================================================================

/**
 * Build detailed boundary guidance injections
 *
 * "Better than Human" - We don't just know what topics to avoid,
 * we know HOW to approach sensitive areas with care.
 */
export async function buildBoundaryCheckInjections(
  ctx: BoundaryCheckContext
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  try {
    const { getActiveBoundaries, getProbingDepth } =
      await import('../../../services/trust-systems/boundary-memory.js');

    const boundaries = getActiveBoundaries(ctx.userId);

    if (boundaries.length > 0) {
      const topicLower = ctx.currentTopic?.toLowerCase() || '';

      for (const boundary of boundaries) {
        const isNearBoundary =
          topicLower.includes(boundary.topic.toLowerCase()) ||
          boundary.relatedTerms.some((term) => topicLower.includes(term.toLowerCase()));

        if (isNearBoundary) {
          const approachGuidance =
            boundary.strength === 'absolute'
              ? `ABSOLUTE BOUNDARY: Do NOT bring up "${boundary.topic}" directly. If they bring it up, follow their lead but don't probe.`
              : boundary.strength === 'strong'
                ? `SENSITIVE AREA: "${boundary.topic}" caused distress before. If it comes up naturally, acknowledge gently without dwelling.`
                : `APPROACH WITH CARE: "${boundary.topic}" is a sensitive area. Be thoughtful in how you engage.`;

          injections.push({
            category: 'boundary_guidance',
            content: `[🛡️ BOUNDARY AWARENESS - "Better than Human"]
${approachGuidance}

Context: ${boundary.context?.slice(0, 100) || 'No context available'}
Type: ${boundary.type} (${boundary.strength})
${boundary.userReopened ? 'Note: They have reopened this topic before - follow their lead.' : ''}

A human friend might accidentally stumble into painful territory. You know better. Honor their boundaries.`,
            priority: boundary.strength === 'absolute' ? 91 : 88,
          });

          diag.info('🛡️ Near boundary detected', {
            topic: boundary.topic,
            strength: boundary.strength,
            type: boundary.type,
          });
        }
      }
    }

    const probingDepth = getProbingDepth(ctx.userId);
    if (probingDepth === 'low') {
      injections.push({
        category: 'probing_preference',
        content: `[PROBING PREFERENCE: GENTLE]
This person prefers surface-level conversations. Don't dig too deep or ask probing follow-ups.
Respect their boundaries around emotional depth.`,
        priority: 78,
      });
    }
  } catch (error) {
    diag.warn('Boundary check injection failed (non-fatal)', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// HEALTH AWARENESS INJECTION BUILDER
// Priority: 76
// ============================================================================

/**
 * Build health awareness injections (system health transparency)
 */
export async function buildHealthAwarenessInjections(): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  try {
    const { getHealthContext, getSystemPromptInjection } =
      await import('../../../services/self-healing/conversation-health.js');

    const healthContext = getHealthContext();

    if (
      healthContext.degradedServices.length === 0 &&
      healthContext.recoveryMessages.length === 0
    ) {
      return injections;
    }

    let content = '[🏥 SYSTEM HEALTH AWARENESS - "Better than Human"]\n';

    if (healthContext.recoveryMessages.length > 0) {
      content += `\nGOOD NEWS: ${healthContext.recoveryMessages[0]}\n`;
      content += `You can mention this naturally if the topic comes up.\n`;
    }

    if (healthContext.degradedServices.length > 0) {
      const systemInjection = getSystemPromptInjection();
      if (systemInjection) {
        content += systemInjection;
      }

      content += `
IMPORTANT: Even if a service is degraded, STILL TRY THE TOOL.
- Output the JSON function call - the system has fallbacks
- Don't pre-apologize - let the tool execution determine the result
- If the tool actually fails, the result will tell you what to say
- Example: User asks for weather → Output {"fn":"getWeather","args":{}} anyway
`;
    }

    if (healthContext.affectedCapabilities.length > 0) {
      content += `\nAffected capabilities: ${healthContext.affectedCapabilities.join(', ')}\n`;
    }

    injections.push({
      category: 'health_awareness',
      content,
      priority: 76,
    });

    diag.debug('🏥 Health awareness injected', {
      degradedCount: healthContext.degradedServices.length,
      recoveries: healthContext.recoveryMessages.length,
      overall: healthContext.overallHealth,
    });
  } catch (error) {
    diag.debug('Health awareness injection skipped', { error: String(error) });
  }

  return injections;
}

// ============================================================================
// USER HEALTH INJECTION (Apple HealthKit)
// Priority: 72-78
// PERFORMANCE: Cached for 60s
// ============================================================================

/**
 * Build user health awareness injection (Apple HealthKit data)
 */
export async function buildUserHealthInjection(userId: string): Promise<ContextInjection | null> {
  const cacheKey = `${userId}:health`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Health injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildHealthAwarenessInjection } = await import('../../../services/health/index.js');
    const coreInjection = await buildHealthAwarenessInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('User health injection skipped', { userId, error: String(error) });
    setCachedInjection(cacheKey, null);
    return null;
  }
}

// ============================================================================
// VISUAL MEMORY INJECTION
// PERFORMANCE: Cached for 60s
// ============================================================================

/**
 * Build visual memory injection (photo/image recall)
 */
export async function buildVisualMemoryInjections(
  userId: string
): Promise<ContextInjection | null> {
  const cacheKey = `${userId}:visual`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Visual memory injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildVisualMemoryInjection } = await import('../../../services/visual-memory/index.js');
    const coreInjection = await buildVisualMemoryInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('Visual memory injection skipped', { userId, error: String(error) });
    setCachedInjection(cacheKey, null);
    return null;
  }
}

// ============================================================================
// AMBIENT MODE INJECTION
// PERFORMANCE: Cached for 60s
// ============================================================================

/**
 * Build ambient mode injection (continuous background presence)
 */
export async function buildAmbientModeInjections(userId: string): Promise<ContextInjection | null> {
  const cacheKey = `${userId}:ambient`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Ambient mode injection cache hit', { userId });
    return cached;
  }

  try {
    const { buildAmbientModeInjection } = await import('../../../services/ambient-mode/index.js');
    const coreInjection = await buildAmbientModeInjection(userId);

    let result: ContextInjection | null = null;
    if (coreInjection) {
      result = {
        category: coreInjection.category || 'better_than_human',
        content: coreInjection.content,
        priority:
          coreInjection.priority === 'critical' ? 95 : coreInjection.priority === 'high' ? 80 : 60,
      };
    }

    setCachedInjection(cacheKey, result);
    return result;
  } catch (error) {
    diag.debug('Ambient mode injection skipped', { userId, error: String(error) });
    setCachedInjection(cacheKey, null);
    return null;
  }
}

// ============================================================================
// HUMAN TRANSFER INJECTION
// ============================================================================

/**
 * Build human transfer awareness injection
 */
export async function buildHumanTransferInjections(
  userText: string,
  userId?: string
): Promise<ContextInjection | null> {
  try {
    const { humanTransfer, buildTransferAwarenessContext, logCrisisSignal } =
      await import('../../../services/human-transfer/index.js');

    const signals = humanTransfer.detectCrisisSignals(userText);

    if (userId && signals.severity > 0) {
      logCrisisSignal(userId, signals, userText).catch((err: Error) => {
        diag.debug('Crisis signal logging failed', { error: String(err) });
      });
    }

    const decision = humanTransfer.evaluateTransferNeed(userText);

    if (decision.type === 'none') {
      return null;
    }

    const content = buildTransferAwarenessContext(decision);
    if (!content) return null;

    const priority = decision.urgency === 'immediate' ? 95 : decision.urgency === 'soon' ? 88 : 80;

    diag.info('🆘 Human transfer awareness injected', {
      type: decision.type,
      urgency: decision.urgency,
      reason: decision.reason.slice(0, 100),
    });

    return {
      category: 'better_than_human',
      content,
      priority,
    };
  } catch (error) {
    diag.debug('Human transfer injection skipped', { error: String(error) });
    return null;
  }
}

// ============================================================================
// CRISIS HISTORY INJECTION
// Priority: 85
// ============================================================================

/**
 * Build crisis history context injection for users who had recent crisis.
 */
export async function buildCrisisHistoryInjection(
  userId: string
): Promise<ContextInjection | null> {
  try {
    const { hadRecentCrisis } = await import('../../../services/human-transfer/index.js');

    const { hasCrisis, lastCrisis } = await hadRecentCrisis(userId, 7);

    if (!hasCrisis || !lastCrisis) {
      return null;
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(lastCrisis.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    );

    const sections: string[] = [];
    sections.push('[CRISIS FOLLOW-UP - Better Than Human]');
    sections.push('');
    sections.push(`This user had a difficult moment ${daysSince} day(s) ago.`);
    sections.push(`Type: ${lastCrisis.escalationType}`);
    sections.push('');
    sections.push('GENTLE CHECK-IN GUIDANCE:');
    sections.push("- Don't immediately bring it up - let them lead");
    sections.push('- If they seem down, you might ask: "How have you been doing since last time?"');
    sections.push(
      '- If they mention struggling again, acknowledge: "I remember last time was hard."'
    );
    sections.push('- Be ready to provide resources again if needed');
    sections.push('');
    sections.push('This is better-than-human: we remember what matters.');

    diag.info('🔁 Crisis follow-up context injected', {
      userId,
      daysSince,
      escalationType: lastCrisis.escalationType,
    });

    return {
      category: 'better_than_human',
      content: sections.join('\n'),
      priority: 85,
    };
  } catch (error) {
    diag.debug('Crisis history injection skipped', { error: String(error) });
    return null;
  }
}
