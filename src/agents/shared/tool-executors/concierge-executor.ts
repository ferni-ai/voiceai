/**
 * Concierge Domain Tool Executor
 *
 * Handles AI-powered outreach tools: hotel quotes, restaurant reservations,
 * healthcare appointments, and local service quotes.
 * Routes JSON function calls to the concierge service.
 *
 * Wired up to:
 * - src/services/concierge/router.ts (request routing)
 * - src/services/concierge/tracker/task-tracker.ts (request tracking)
 *
 * @module agents/shared/tool-executors/concierge-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ConciergeExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'requesthotelquotes',
  'makerestaurantreservation',
  'schedulehealthcareappointment',
  'getservicequotes',
  'checkconciergerstatus',
] as const;

/**
 * Execute concierge-related tools with real backend integration.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  const userId = ctx.userId || 'unknown';
  const sessionId = ctx.sessionId;

  // Lazy load dependencies
  const loadRouter = async () => import('../../../services/concierge/router.js');
  const loadTracker = async () => import('../../../services/concierge/tracker/task-tracker.js');

  // ========================================
  // REQUEST HOTEL QUOTES
  // ========================================
  if (fnLower === 'requesthotelquotes') {
    const destination = args.destination as string;
    const checkIn = args.checkIn as string;
    const checkOut = args.checkOut as string;

    log.info({ destination, checkIn, checkOut, userId }, '🏨 Requesting hotel quotes');

    if (!destination) {
      return 'Where would you like to stay? Give me a city or neighborhood.';
    }

    try {
      const { createConciergeRouter } = await loadRouter();
      const router = createConciergeRouter({ userId, sessionId });

      // Build date range if dates provided
      const dateRange =
        checkIn || checkOut
          ? {
              start: checkIn ? new Date(checkIn) : new Date(),
              end: checkOut ? new Date(checkOut) : new Date(),
            }
          : undefined;

      const result = await router.routeRequest(
        `Find hotel rates in ${destination}${checkIn ? ` for ${checkIn}` : ''}${checkOut ? ` to ${checkOut}` : ''}`,
        { location: destination, dateRange }
      );

      if (result.success) {
        return `Got it! I'll call ${result.estimatedTargets} hotels in ${destination} and get back to you with rates. This usually takes a few minutes.`;
      } else {
        return result.error || "I couldn't start that search. Try again?";
      }
    } catch (err) {
      log.error({ error: String(err) }, '🏨 Failed to request hotel quotes');
      return 'I had trouble starting that hotel search. Try again in a moment.';
    }
  }

  // ========================================
  // MAKE RESTAURANT RESERVATION
  // ========================================
  if (fnLower === 'makerestaurantreservation') {
    const restaurantName = args.restaurantName as string;
    const date = args.date as string;
    const partySize = args.partySize as number;
    const location = args.location as string;

    log.info({ restaurantName, date, partySize, userId }, '🍽️ Making restaurant reservation');

    if (!restaurantName && !location) {
      return 'Which restaurant would you like me to book, or what area should I look in?';
    }

    try {
      const { createConciergeRouter } = await loadRouter();
      const router = createConciergeRouter({ userId, sessionId });

      const request = restaurantName
        ? `Make a reservation at ${restaurantName}${partySize ? ` for ${partySize} people` : ''}${date ? ` on ${date}` : ''}`
        : `Find a restaurant in ${location}${partySize ? ` for ${partySize} people` : ''}${date ? ` on ${date}` : ''}`;

      const result = await router.routeRequest(request, {
        location: location || restaurantName,
        partySize,
        date: date ? new Date(date) : undefined,
      });

      if (result.success) {
        return `I'm on it! I'll call ${restaurantName ? 'them' : `restaurants in ${location}`} and confirm a table${partySize ? ` for ${partySize}` : ''}${date ? ` on ${date}` : ''}. I'll text you when it's booked.`;
      } else {
        return result.error || "I couldn't start that reservation. Try again?";
      }
    } catch (err) {
      log.error({ error: String(err) }, '🍽️ Failed to make reservation');
      return 'I had trouble starting that reservation. Try again in a moment.';
    }
  }

  // ========================================
  // SCHEDULE HEALTHCARE APPOINTMENT
  // ========================================
  if (fnLower === 'schedulehealthcareappointment') {
    const providerType = args.providerType as string;
    const location = args.location as string;
    const rawUrgency = args.urgency as string;
    const urgency: 'routine' | 'soon' | 'urgent' =
      rawUrgency === 'urgent' ? 'urgent' : rawUrgency === 'soon' ? 'soon' : 'routine';

    log.info({ providerType, location, urgency, userId }, '🏥 Scheduling healthcare appointment');

    if (!providerType) {
      return 'What type of appointment do you need? Doctor, dentist, specialist?';
    }

    try {
      const { createConciergeRouter } = await loadRouter();
      const router = createConciergeRouter({ userId, sessionId });

      const result = await router.routeRequest(
        `Schedule an appointment with a ${providerType}${urgency === 'urgent' ? ' as soon as possible' : ''}`,
        { location, providerType, urgency }
      );

      if (result.success) {
        const urgencyMsg =
          urgency === 'urgent'
            ? "I'll prioritize finding the earliest available slot."
            : "I'll find convenient options for you.";
        return `I'll call ${providerType} offices${location ? ` near ${location}` : ''} and find you an appointment. ${urgencyMsg}`;
      } else {
        return result.error || "I couldn't start that search. Try again?";
      }
    } catch (err) {
      log.error({ error: String(err) }, '🏥 Failed to schedule appointment');
      return 'I had trouble starting that appointment search. Try again in a moment.';
    }
  }

  // ========================================
  // GET SERVICE QUOTES
  // ========================================
  if (fnLower === 'getservicequotes') {
    const serviceType = args.serviceType as string;
    const description = args.description as string;
    const location = args.location as string;

    log.info({ serviceType, location, userId }, '🔧 Getting service quotes');

    if (!serviceType) {
      return 'What kind of service do you need? Plumber, electrician, cleaner?';
    }

    try {
      const { createConciergeRouter } = await loadRouter();
      const router = createConciergeRouter({ userId, sessionId });

      const result = await router.routeRequest(
        `Get quotes from ${serviceType}s${description ? ` for ${description}` : ''}`,
        { location, serviceType, serviceDescription: description }
      );

      if (result.success) {
        return `I'll reach out to ${result.estimatedTargets} ${serviceType}s${location ? ` near ${location}` : ''} and get you quotes. This usually takes 15-30 minutes.`;
      } else {
        return result.error || "I couldn't start that search. Try again?";
      }
    } catch (err) {
      log.error({ error: String(err) }, '🔧 Failed to get service quotes');
      return 'I had trouble starting that search. Try again in a moment.';
    }
  }

  // ========================================
  // CHECK CONCIERGE STATUS
  // ========================================
  if (fnLower === 'checkconciergerstatus') {
    const requestId = args.requestId as string;

    log.info({ requestId, userId }, '📋 Checking concierge status');

    try {
      const { getTaskTracker } = await loadTracker();
      const tracker = getTaskTracker();

      if (requestId) {
        // Check specific request
        const request = await tracker.getRequest(requestId);
        if (!request) {
          return "I couldn't find that request. It may have been completed or expired.";
        }

        const statusEmoji: Record<string, string> = {
          pending: '⏳',
          discovering: '🔍',
          in_progress: '📞',
          awaiting_user: '⏰',
          completed: '✅',
          failed: '❌',
          cancelled: '🚫',
        };

        return `${statusEmoji[request.status] || '❓'} ${request.domain} request: ${request.status}. ${request.targets.length} businesses contacted.`;
      }

      // Get all user requests
      const requests = await tracker.getUserRequests(userId);
      const active = requests.filter(
        (r) =>
          r.status === 'pending' ||
          r.status === 'discovering' ||
          r.status === 'in_progress' ||
          r.status === 'awaiting_user'
      );

      if (active.length === 0) {
        return "You don't have any active outreach requests right now.";
      }

      const summary = active
        .map((r, i) => {
          const emoji =
            r.domain === 'hotel'
              ? '🏨'
              : r.domain === 'restaurant'
                ? '🍽️'
                : r.domain === 'healthcare'
                  ? '🏥'
                  : '🔧';
          return `${i + 1}. ${emoji} ${r.domain}: ${r.status} (${r.targets.length} contacts)`;
        })
        .join('\n');

      return `You have ${active.length} active request${active.length > 1 ? 's' : ''}:\n${summary}`;
    } catch (err) {
      log.error({ error: String(err) }, '📋 Failed to check status');
      return "I couldn't check the status right now. Try again in a moment.";
    }
  }

  return null;
}

export const conciergeExecutor: DomainExecutor = {
  domain: 'concierge',
  handles: HANDLED_TOOLS,
  execute,
};

export default conciergeExecutor;
