/**
 * Concierge Router
 *
 * Routes user requests to appropriate discovery and outreach channels.
 * Determines the domain, validates permissions, and orchestrates the workflow.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  ConciergeRequest,
  ConciergeDomain,
  ConciergeRequestType,
  ConciergeRequirements,
  ConciergeUserPreferences,
  OutreachChannel,
} from './types.js';
import { getTaskTracker } from './tracker/task-tracker.js';
import { discoverBusinesses } from './discovery/google-places.js';

const log = createLogger({ module: 'concierge-router' });

// Domain keywords for classification
const DOMAIN_KEYWORDS: Record<ConciergeDomain, string[]> = {
  hotel: ['hotel', 'motel', 'inn', 'resort', 'lodging', 'stay', 'room', 'suite', 'accommodation'],
  restaurant: [
    'restaurant',
    'dinner',
    'lunch',
    'breakfast',
    'reservation',
    'table',
    'dining',
    'eat',
  ],
  healthcare: [
    'doctor',
    'dentist',
    'appointment',
    'medical',
    'clinic',
    'physician',
    'specialist',
    'checkup',
  ],
  local_service: [
    'plumber',
    'electrician',
    'cleaner',
    'handyman',
    'contractor',
    'repair',
    'service',
  ],
  airline: ['flight', 'airline', 'airplane', 'travel', 'ticket', 'booking'],
  car_rental: ['car rental', 'rent a car', 'vehicle', 'hertz', 'enterprise', 'avis'],
  insurance: ['insurance', 'claim', 'coverage', 'policy', 'premium'],
  utility: ['utility', 'electric', 'gas', 'water', 'internet', 'cable', 'phone service'],
  government: ['dmv', 'passport', 'license', 'permit', 'government', 'city hall'],
  other: [],
};

// Request type keywords
const REQUEST_TYPE_KEYWORDS: Record<ConciergeRequestType, string[]> = {
  quote: ['quote', 'price', 'cost', 'rate', 'how much', 'pricing'],
  booking: ['book', 'reserve', 'reservation', 'schedule'],
  appointment: ['appointment', 'schedule', 'visit', 'see'],
  inquiry: ['question', 'ask', 'find out', 'check', 'inquire'],
  complaint: ['complaint', 'issue', 'problem', 'wrong', 'unhappy'],
  status: ['status', 'update', 'check on', 'follow up'],
};

export interface RouteResult {
  success: boolean;
  requestId?: string;
  error?: string;
  estimatedTargets?: number;
}

export interface ConciergeRouterOptions {
  userId: string;
  sessionId?: string;
  userPreferences?: ConciergeUserPreferences;
}

export class ConciergeRouter {
  private userId: string;
  private sessionId?: string;
  private userPreferences?: ConciergeUserPreferences;

  constructor(options: ConciergeRouterOptions) {
    this.userId = options.userId;
    this.sessionId = options.sessionId;
    this.userPreferences = options.userPreferences;
  }

  /**
   * Classify a natural language request into domain and type
   */
  classifyRequest(description: string): { domain: ConciergeDomain; type: ConciergeRequestType } {
    const lowerDesc = description.toLowerCase();

    // Determine domain
    let domain: ConciergeDomain = 'other';
    let maxMatches = 0;

    for (const [d, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matches = keywords.filter((k) => lowerDesc.includes(k)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        domain = d as ConciergeDomain;
      }
    }

    // Determine request type
    let type: ConciergeRequestType = 'inquiry';
    for (const [t, keywords] of Object.entries(REQUEST_TYPE_KEYWORDS)) {
      if (keywords.some((k) => lowerDesc.includes(k))) {
        type = t as ConciergeRequestType;
        break;
      }
    }

    log.debug({ domain, type, description }, 'Classified request');
    return { domain, type };
  }

  /**
   * Check if user has permission to use concierge for a domain
   */
  checkPermissions(domain: ConciergeDomain, channel: OutreachChannel): boolean {
    if (!this.userPreferences) {
      // Default: allow all if no preferences set
      return true;
    }

    // Check domain permission
    if (!this.userPreferences.enabledDomains.includes(domain)) {
      log.info({ domain, userId: this.userId }, 'Domain not enabled for user');
      return false;
    }

    // Check channel permission
    if (channel === 'phone' && !this.userPreferences.allowPhoneCalls) {
      return false;
    }
    if (channel === 'email' && !this.userPreferences.allowEmails) {
      return false;
    }
    if (channel === 'sms' && !this.userPreferences.allowSms) {
      return false;
    }

    return true;
  }

  /**
   * Get the best channel for a domain
   */
  getBestChannel(domain: ConciergeDomain): OutreachChannel {
    // Phone is best for real-time negotiation
    const phoneFirst: ConciergeDomain[] = ['hotel', 'restaurant', 'healthcare', 'airline'];
    if (phoneFirst.includes(domain)) {
      return 'phone';
    }

    // Email for formal/documented requests
    const emailFirst: ConciergeDomain[] = ['insurance', 'government'];
    if (emailFirst.includes(domain)) {
      return 'email';
    }

    // SMS for quick local services
    const smsFirst: ConciergeDomain[] = ['local_service'];
    if (smsFirst.includes(domain)) {
      return 'sms';
    }

    // Default to phone
    return this.userPreferences?.preferredChannel || 'phone';
  }

  /**
   * Route a user request to create a concierge task
   */
  async routeRequest(
    description: string,
    requirements: ConciergeRequirements,
    options?: {
      maxTargets?: number;
      preferredChannel?: OutreachChannel;
    }
  ): Promise<RouteResult> {
    try {
      // Classify the request
      const { domain, type } = this.classifyRequest(description);

      // Determine channel
      const channel = options?.preferredChannel || this.getBestChannel(domain);

      // Check permissions
      if (!this.checkPermissions(domain, channel)) {
        return {
          success: false,
          error: `Concierge ${channel} not enabled for ${domain}. Check your preferences.`,
        };
      }

      // Validate requirements
      if (!requirements.location && domain !== 'other') {
        return {
          success: false,
          error: 'Location is required for this type of request',
        };
      }

      // Discover businesses
      log.info({ domain, location: requirements.location }, 'Discovering businesses');

      const businesses = await discoverBusinesses({
        domain,
        location: requirements.location || '',
        limit: options?.maxTargets || 5,
        minRating: 3.5,
      });

      if (businesses.length === 0) {
        return {
          success: false,
          error: `No ${domain} businesses found in ${requirements.location}`,
        };
      }

      // Create the request
      const tracker = getTaskTracker();
      const request = await tracker.createRequest({
        userId: this.userId,
        sessionId: this.sessionId,
        domain,
        type,
        description,
        requirements,
        preferredChannel: channel,
        maxTargets: options?.maxTargets || 5,
        businesses,
      });

      log.info(
        { requestId: request.id, domain, type, targets: request.targets.length },
        'Concierge request created'
      );

      return {
        success: true,
        requestId: request.id,
        estimatedTargets: request.targets.length,
      };
    } catch (error) {
      log.error({ error: String(error), description }, 'Failed to route concierge request');
      return {
        success: false,
        error: 'Failed to create concierge request',
      };
    }
  }
}

// Factory function for creating routers
export function createConciergeRouter(options: ConciergeRouterOptions): ConciergeRouter {
  return new ConciergeRouter(options);
}
