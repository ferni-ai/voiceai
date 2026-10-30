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
 * LINK_STATUS_V2: Google Calendar, Gmail and Spotify are read from the stores
 * the connect callbacks write (integrations/connection-status.ts), not from the
 * hub's oauth_tokens collection that nothing writes. A store that can't be read
 * is "unknown": the note says so instead of "NOT CONNECTED", and isn't cached.
 * Follow-up once the flag is on everywhere: delete the hub read for those three.
 *
 * @module agents/processors/injection-builders/service-availability
 */
import { flagOn } from '../../../config/env-flag.js';
import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';
import { getCachedInjection, setCachedInjection } from './cache.js';
import type { InjectionBuilderContext } from './types.js';
import type { LinkState } from '../../../services/integrations/index.js';

interface ServiceAvailability {
  serviceId: string;
  serviceName: string;
  state: LinkState;
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

const capsOf = (service: ServiceAvailability): string =>
  service.unavailableCapabilities?.join(', ') || 'use this service';

/** The note for what was found, or null when everything is connected. */
function describeAvailability(results: ServiceAvailability[]): ContextInjection | null {
  const inState = (state: LinkState): ServiceAvailability[] =>
    results.filter((s) => s.state === state);
  const connected = inState('connected');
  const disconnected = inState('not_connected');
  const reauth = inState('needs_reauth');
  const unknown = inState('unknown');
  if (disconnected.length + reauth.length + unknown.length === 0) return null;

  const sections: string[] = [];
  if (disconnected.length > 0) {
    const lines = disconnected.map(
      (s) => `- ${s.serviceName}: NOT CONNECTED - Do NOT offer to ${capsOf(s)}`
    );
    sections.push(`The following services are NOT connected for this user:
${lines.join('\n')}

CRITICAL: Do NOT promise or offer features from disconnected services.
Instead, say "I'd need you to connect [Service] to do that" if the user asks.`);
  }
  if (reauth.length > 0) {
    const lines = reauth.map(
      (s) => `- ${s.serviceName}: Do NOT offer to ${capsOf(s)} until they reconnect it`
    );
    sections.push(`The user linked these, but the link has expired and must be reconnected:
${lines.join('\n')}`);
  }
  if (unknown.length > 0) {
    sections.push(`Could not check right now whether these are connected: ${unknown.map((s) => s.serviceName).join(', ')}.
Do not say they are connected or that they are not. If the user asks for one, try it and report honestly what happens.`);
  }
  const connectedLine =
    connected.length > 0
      ? `\n\nConnected services: ${connected.map((s) => s.serviceName).join(', ')}`
      : '';

  return {
    category: 'service_availability',
    content: `[🔌 SERVICE AVAILABILITY - What you CAN and CANNOT do]

${sections.join('\n\n')}${connectedLine}`,
    priority: 80,
  };
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

    const linkV2 = flagOn('LINK_STATUS_V2');
    const { getLinkState, isLinkProvider } = linkV2
      ? await import('../../../services/integrations/index.js')
      : { getLinkState: undefined, isLinkProvider: undefined };

    const availabilityResults: ServiceAvailability[] = await Promise.all(
      servicesToCheck.map(async (service) => ({
        serviceId: service.id,
        serviceName: service.name,
        state:
          getLinkState && isLinkProvider?.(service.id)
            ? await getLinkState(userId, service.id)
            : (await hub.isConnectedAsync(userId, service.id))
              ? ('connected' as const)
              : ('not_connected' as const),
        unavailableCapabilities: service.unavailableCapabilities,
      }))
    );

    const injection = describeAvailability(availabilityResults);
    // A service we couldn't check is looked up again next turn, not remembered for 60 s.
    if (!availabilityResults.some((s) => s.state === 'unknown')) {
      setCachedInjection(cacheKey, injection);
    }
    return injection;
  } catch (error) {
    diag.debug('Service availability injection failed (graceful skip)', {
      userId,
      error: String(error),
    });
    return null;
  }
}
