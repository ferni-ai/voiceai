/**
 * Concierge Service Types
 *
 * Core types for the Concierge feature - AI-powered outreach on behalf of users.
 */
export type ConciergeDomain = 'hotel' | 'restaurant' | 'healthcare' | 'local_service' | 'airline' | 'car_rental' | 'insurance' | 'utility' | 'government' | 'other';
export type ConciergeRequestType = 'quote' | 'booking' | 'appointment' | 'inquiry' | 'complaint' | 'status';
export type OutreachChannel = 'phone' | 'email' | 'sms';
export type RequestStatus = 'pending' | 'discovering' | 'in_progress' | 'awaiting_user' | 'completed' | 'failed' | 'cancelled';
export type TargetStatus = 'pending' | 'queued' | 'calling' | 'on_hold' | 'emailed' | 'texted' | 'completed' | 'no_answer' | 'failed';
export interface ConciergeRequest {
    id: string;
    userId: string;
    sessionId?: string;
    domain: ConciergeDomain;
    type: ConciergeRequestType;
    description: string;
    requirements: ConciergeRequirements;
    targets: ConciergeTarget[];
    status: RequestStatus;
    statusMessage?: string;
    results: ConciergeResult[];
    recommendation?: ConciergeRecommendation;
    preferredChannel: OutreachChannel;
    maxTargets: number;
    maxAttempts: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    metadata?: Record<string, unknown>;
}
export interface ConciergeRequirements {
    location?: string;
    dateRange?: {
        start: Date;
        end: Date;
    };
    date?: Date;
    timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
    guests?: number;
    rooms?: number;
    roomType?: string;
    amenities?: string[];
    partySize?: number;
    dietaryRestrictions?: string[];
    occasion?: string;
    providerType?: string;
    urgency?: 'routine' | 'soon' | 'urgent';
    insuranceProvider?: string;
    reason?: string;
    serviceType?: string;
    serviceDescription?: string;
    budget?: {
        min?: number;
        max?: number;
    };
    specialRequests?: string[];
    notes?: string;
}
export interface ConciergeTarget {
    id: string;
    requestId: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
    source: 'google_places' | 'yelp' | 'user_contacts' | 'manual' | 'previous';
    sourceId?: string;
    rating?: number;
    priceLevel?: number;
    status: TargetStatus;
    attempts: number;
    lastAttemptAt?: Date;
    nextAttemptAt?: Date;
    priority: number;
}
export interface ConciergeResult {
    id: string;
    requestId: string;
    targetId: string;
    channel: OutreachChannel;
    attemptNumber: number;
    success: boolean;
    summary: string;
    data: ConciergeResultData;
    contactName?: string;
    referenceNumber?: string;
    expiresAt?: Date;
    validUntil?: string;
    transcriptUrl?: string;
    callDurationSeconds?: number;
    emailThreadId?: string;
    timestamp: Date;
}
export interface ConciergeResultData {
    price?: number;
    pricePerUnit?: number;
    totalPrice?: number;
    currency?: string;
    discount?: string;
    discountAmount?: number;
    available?: boolean;
    availableDates?: Date[];
    availableTimes?: string[];
    waitlist?: boolean;
    waitlistPosition?: number;
    confirmationNumber?: string;
    depositRequired?: number;
    cancellationPolicy?: string;
    roomType?: string;
    tableLocation?: string;
    providerName?: string;
    estimatedDuration?: string;
    notes?: string;
    caveats?: string[];
    messageBody?: string;
    emailBody?: string;
}
export interface ConciergeRecommendation {
    targetId: string;
    targetName: string;
    reason: string;
    confidence: number;
    highlights: string[];
    caveats?: string[];
}
export interface OutreachScript {
    domain: ConciergeDomain;
    type: ConciergeRequestType;
    greeting: string;
    introduction: string;
    requestTemplate: string;
    followUps: Record<string, string[]>;
    thankYou: string;
    callbackRequest?: string;
    extractionPrompts: string[];
}
export interface DiscoveryOptions {
    domain: ConciergeDomain;
    location: string;
    radius?: number;
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
    location: {
        lat: number;
        lng: number;
    };
}
export type ConciergeEventType = 'request_created' | 'discovery_started' | 'discovery_completed' | 'outreach_started' | 'call_started' | 'call_completed' | 'email_sent' | 'sms_sent' | 'result_received' | 'awaiting_user' | 'request_completed' | 'request_failed';
export interface ConciergeEvent {
    type: ConciergeEventType;
    requestId: string;
    targetId?: string;
    data?: Record<string, unknown>;
    timestamp: Date;
}
export interface ConciergeUserPreferences {
    userId: string;
    enabledDomains: ConciergeDomain[];
    allowPhoneCalls: boolean;
    allowEmails: boolean;
    allowSms: boolean;
    preferredChannel: OutreachChannel;
    maxCallsPerRequest: number;
    displayName?: string;
    callbackNumber?: string;
    email?: string;
    memberships?: string[];
    savedPaymentMethods?: Array<{
        id: string;
        type: 'visa' | 'mastercard' | 'amex' | 'discover';
        last4: string;
        isDefault: boolean;
    }>;
}
//# sourceMappingURL=types.d.ts.map