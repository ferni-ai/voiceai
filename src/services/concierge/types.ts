/**
 * Concierge Service Types
 *
 * Core types for the Concierge feature - AI-powered outreach on behalf of users.
 */

// ============================================================================
// DOMAINS
// ============================================================================

export type ConciergeDomain =
  | 'hotel'
  | 'restaurant'
  | 'healthcare'
  | 'local_service'
  | 'airline'
  | 'car_rental'
  | 'insurance'
  | 'utility'
  | 'government'
  | 'other';

export type ConciergeRequestType =
  | 'quote' // Get pricing
  | 'booking' // Make a reservation/booking
  | 'appointment' // Schedule an appointment
  | 'inquiry' // General question
  | 'complaint' // Issue resolution
  | 'status'; // Check on existing request

export type OutreachChannel = 'phone' | 'email' | 'sms';

// ============================================================================
// REQUEST LIFECYCLE
// ============================================================================

export type RequestStatus =
  | 'pending' // Not yet started
  | 'discovering' // Finding contacts
  | 'in_progress' // Outreach underway
  | 'awaiting_user' // Need user decision
  | 'completed' // Successfully finished
  | 'failed' // Could not complete
  | 'cancelled'; // User cancelled

export type TargetStatus =
  | 'pending' // Not yet contacted
  | 'queued' // In queue for outreach
  | 'calling' // Currently on call
  | 'on_hold' // On hold with business
  | 'emailed' // Email sent, awaiting response
  | 'texted' // SMS sent
  | 'completed' // Got result
  | 'no_answer' // Couldn't reach
  | 'failed'; // Error occurred

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface ConciergeRequest {
  id: string;
  userId: string;
  sessionId?: string;

  // Request classification
  domain: ConciergeDomain;
  type: ConciergeRequestType;
  description: string;

  // User's requirements
  requirements: ConciergeRequirements;

  // Targets to contact
  targets: ConciergeTarget[];

  // Current status
  status: RequestStatus;
  statusMessage?: string;

  // Results and recommendation
  results: ConciergeResult[];
  recommendation?: ConciergeRecommendation;

  // Preferences
  preferredChannel: OutreachChannel;
  maxTargets: number;
  maxAttempts: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface ConciergeRequirements {
  // Common fields
  location?: string;
  dateRange?: { start: Date; end: Date };
  date?: Date;
  timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';

  // Hotel-specific
  guests?: number;
  rooms?: number;
  roomType?: string;
  amenities?: string[];

  // Restaurant-specific
  partySize?: number;
  dietaryRestrictions?: string[];
  occasion?: string;

  // Healthcare-specific
  providerType?: string;
  urgency?: 'routine' | 'soon' | 'urgent';
  insuranceProvider?: string;
  reason?: string;

  // Service-specific
  serviceType?: string;
  serviceDescription?: string;

  // General
  budget?: { min?: number; max?: number };
  specialRequests?: string[];
  notes?: string;
}

export interface ConciergeTarget {
  id: string;
  requestId: string;

  // Business info
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;

  // Source
  source: 'google_places' | 'yelp' | 'user_contacts' | 'manual' | 'previous';
  sourceId?: string; // e.g., Google Place ID
  rating?: number;
  priceLevel?: number; // 1-4

  // Outreach status
  status: TargetStatus;
  attempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;

  // Priority (lower = higher priority)
  priority: number;
}

export interface ConciergeResult {
  id: string;
  requestId: string;
  targetId: string;

  // Outreach details
  channel: OutreachChannel;
  attemptNumber: number;

  // Outcome
  success: boolean;
  summary: string;

  // Extracted data (domain-specific)
  data: ConciergeResultData;

  // Contact info from call
  contactName?: string;
  referenceNumber?: string;

  // Validity
  expiresAt?: Date;
  validUntil?: string; // e.g., "Must book by Friday"

  // Raw data for debugging
  transcriptUrl?: string;
  callDurationSeconds?: number;
  emailThreadId?: string;

  // Timestamps
  timestamp: Date;
}

export interface ConciergeResultData {
  // Pricing
  price?: number;
  pricePerUnit?: number; // per night, per hour, etc.
  totalPrice?: number;
  currency?: string;
  discount?: string;
  discountAmount?: number;

  // Availability
  available?: boolean;
  availableDates?: Date[];
  availableTimes?: string[];
  waitlist?: boolean;
  waitlistPosition?: number;

  // Booking
  confirmationNumber?: string;
  depositRequired?: number;
  cancellationPolicy?: string;

  // Domain-specific
  roomType?: string; // hotel
  tableLocation?: string; // restaurant
  providerName?: string; // healthcare
  estimatedDuration?: string; // service

  // Additional notes
  notes?: string;
  caveats?: string[];

  // Reply content (from SMS/email webhooks)
  messageBody?: string;
  emailBody?: string;
}

export interface ConciergeRecommendation {
  targetId: string;
  targetName: string;
  reason: string;
  confidence: number; // 0-1
  highlights: string[];
  caveats?: string[];
}

// ============================================================================
// OUTREACH SCRIPTS
// ============================================================================

export interface OutreachScript {
  domain: ConciergeDomain;
  type: ConciergeRequestType;

  // Opening
  greeting: string;
  introduction: string;

  // Main request
  requestTemplate: string;

  // Follow-up questions by topic
  followUps: Record<string, string[]>;

  // Closing
  thankYou: string;
  callbackRequest?: string;

  // Response handling
  extractionPrompts: string[];
}

// ============================================================================
// DISCOVERY
// ============================================================================

export interface DiscoveryOptions {
  domain: ConciergeDomain;
  location: string;
  radius?: number; // meters
  keyword?: string;
  limit?: number;
  minRating?: number;
  priceLevel?: number[];
  openNow?: boolean;
}

export interface DiscoveredBusiness {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  openNow?: boolean;
  businessHours?: string[];
  location: { lat: number; lng: number };
}

// ============================================================================
// EVENTS
// ============================================================================

export type ConciergeEventType =
  | 'request_created'
  | 'discovery_started'
  | 'discovery_completed'
  | 'outreach_started'
  | 'call_started'
  | 'call_completed'
  | 'email_sent'
  | 'sms_sent'
  | 'result_received'
  | 'awaiting_user'
  | 'request_completed'
  | 'request_failed';

export interface ConciergeEvent {
  type: ConciergeEventType;
  requestId: string;
  targetId?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

export interface ConciergeUserPreferences {
  userId: string;

  // Permissions
  enabledDomains: ConciergeDomain[];
  allowPhoneCalls: boolean;
  allowEmails: boolean;
  allowSms: boolean;

  // Defaults
  preferredChannel: OutreachChannel;
  maxCallsPerRequest: number;

  // Personal info for outreach
  displayName?: string;
  callbackNumber?: string;
  email?: string;

  // Memberships for discounts
  memberships?: string[]; // e.g., ['AAA', 'AARP', 'Marriott Bonvoy']

  // Saved payment methods (references only, not actual card data)
  savedPaymentMethods?: Array<{
    id: string;
    type: 'visa' | 'mastercard' | 'amex' | 'discover';
    last4: string;
    isDefault: boolean;
  }>;
}
