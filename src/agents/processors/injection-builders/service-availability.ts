/**
 * Service availability injection: tells the model which integrations the
 * caller has NOT connected, so it never offers to play Spotify or check a
 * calendar it can't reach.
 *
 * Each turn used to make four Firestore reads (IntegrationHub only caches
 * connected services, and most callers have none connected), which missed
 * the 50 ms budget on every measured turn, so the note never reached the
 * prompt. Connection state rarely changes mid-call: the result is cached
 * per user (cache.ts, 60 s), and a lookup still running from an earlier
 * turn is shared instead of restarted, so it lands from the next turn on.
 *
 * @module agents/processors/injection-builders/service-availability
 */
import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';
import { getCachedInjection, setCachedInjection } from './cache.js';
import type { InjectionBuilderContext } from './types.js';

interface ServiceAvailability {
  serviceId: string;
  serviceName: string;
  isConnected: boolean;
  unavailableCapabilities?: string[];
}

/**
 * Build service availability injection
 *
 * CRITICAL: Prevents LLM from promising features that aren't available
 */
export async function buildServiceAvailabilityInjection(
  ctx: InjectionBuilderContext
): Promise<ContextInjection | null> {
  const userId = ctx.services.userId;
  if (!userId) return null;

  const cacheKey = `${userId}:service-availability`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) return cached;

  // A lookup that missed last turn's budget is still running: share it.
  let lookup = inFlight.get(userId);
  if (!lookup) {
    lookup = lookUpServiceAvailability(userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, lookup);
  }
  return lookup;
}

const inFlight = new Map<string, Promise<ContextInjection | null>>();

async function lookUpServiceAvailability(userId: string): Promise<ContextInjection | null> {
  const cacheKey = `${userId}:service-availability`;
  try {
    const { getIntegrationHub } = await import('../../../services/integrations/index.js');
    const hub = getIntegrationHub();

    const servicesToCheck: Array<{
      id: string;
      name: string;
      unavailableCapabilities: string[];
    }> = [
      {
        id: 'spotify',
        name: 'Spotify',
        unavailableCapabilities: ['play music on Spotify', 'create playlists', 'control playback'],
      },
      {
        id: 'google_calendar',
        name: 'Google Calendar',
        unavailableCapabilities: ['schedule events', 'check your calendar', 'set reminders'],
      },
      {
        id: 'gmail',
        name: 'Gmail',
        unavailableCapabilities: ['send emails', 'read your inbox', 'draft messages'],
      },
      {
        id: 'plaid',
        name: 'Banking (Plaid)',
        unavailableCapabilities: [
          'check account balances',
          'review transactions',
          'track spending',
        ],
      },
    ];

    const availabilityResults: ServiceAvailability[] = await Promise.all(
      servicesToCheck.map(async (service) => ({
        serviceId: service.id,
        serviceName: service.name,
        isConnected: await hub.isConnectedAsync(userId, service.id),
        unavailableCapabilities: service.unavailableCapabilities,
      }))
    );

    const connectedServices = availabilityResults.filter((s) => s.isConnected);
    const disconnectedServices = availabilityResults.filter((s) => !s.isConnected);

    if (disconnectedServices.length === 0) {
      setCachedInjection(cacheKey, null);
      return null;
    }

    const unavailableLines = disconnectedServices.map((service) => {
      const caps = service.unavailableCapabilities?.join(', ') || 'use this service';
      return `- ${service.serviceName}: NOT CONNECTED - Do NOT offer to ${caps}`;
    });

    const connectedLine =
      connectedServices.length > 0
        ? `\n\nConnected services: ${connectedServices.map((s) => s.serviceName).join(', ')}`
        : '';

    const injection: ContextInjection = {
      category: 'service_availability',
      content: `[🔌 SERVICE AVAILABILITY - What you CAN and CANNOT do]

The following services are NOT connected for this user:
${unavailableLines.join('\n')}

CRITICAL: Do NOT promise or offer features from disconnected services.
Instead, say "I'd need you to connect [Service] to do that" if the user asks.${connectedLine}`,
      priority: 80,
    };
    setCachedInjection(cacheKey, injection);
    return injection;
  } catch (error) {
    diag.debug('Service availability injection failed (graceful skip)', {
      userId,
      error: String(error),
    });
    return null;
  }
}
