/**
 * Concierge Semantic Routing
 *
 * Routes to: domains/concierge
 * Tools: requestHotelQuotes, makeRestaurantReservation, scheduleHealthcareAppointment,
 *        getServiceQuotes, checkConciergeStatus, prepareForUpcomingEvent, proactiveConciergeCheckIn
 *
 * These tools make actual phone calls to businesses via Twilio.
 * The AI agent calls businesses on the user's behalf.
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// HOTEL QUOTES
// ============================================================================

export const requestHotelQuotesTool: SemanticToolDefinition = {
  id: 'concierge_hotel_quotes',
  name: 'Request Hotel Quotes',
  description: 'Get quotes from hotels by having AI call them on your behalf.',
  shortDescription: 'get hotel quotes',
  category: 'travel',
  priority: 2,

  triggers: {
    phrases: [
      'get me hotel quotes',
      'call hotels for me',
      'find hotel prices',
      'book a hotel room',
      'hotel reservation',
      'get hotel availability',
      'compare hotel prices',
      'need a hotel for',
    ],
    patterns: [
      /\b(get|find|compare)\s+(me\s+)?hotel\s+(quotes|prices|rates)\b/i,
      /\bcall\s+hotels?\s+(for\s+me)?\b/i,
      /\bhotel\s+(reservation|availability|booking)\b/i,
      /\bneed\s+a\s+hotel\s+(for|in)\b/i,
    ],
    keywords: [
      { word: 'hotel', weight: 1.0 },
      { word: 'quotes', weight: 0.9 },
      { word: 'reservation', weight: 0.85 },
      { word: 'book', weight: 0.8 },
      { word: 'room', weight: 0.75 },
      { word: 'stay', weight: 0.7 },
    ],
    antiKeywords: ['already booked', 'cancel hotel'],
  },

  examples: [
    'Get me hotel quotes for my trip to New York',
    'Can you call some hotels and get prices for next weekend',
    'I need a hotel room for my anniversary',
  ],

  counterExamples: ['I need to cancel my hotel reservation'],

  arguments: [
    { name: 'destination', type: 'string', required: true, description: 'Where they need a hotel' },
    { name: 'dates', type: 'string', required: false, description: 'Check-in/out dates' },
    { name: 'preferences', type: 'string', required: false, description: 'Room preferences' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/concierge',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'requestHotelQuotes',
      args,
      delegateTo: 'domains/concierge',
    };
  },
};

// ============================================================================
// RESTAURANT RESERVATION
// ============================================================================

export const makeRestaurantReservationTool: SemanticToolDefinition = {
  id: 'concierge_restaurant_reservation',
  name: 'Make Restaurant Reservation',
  description: 'Book a restaurant table by having AI call on your behalf.',
  shortDescription: 'restaurant reservation',
  category: 'productivity',
  priority: 2,

  triggers: {
    phrases: [
      'make a restaurant reservation',
      'book a table',
      'call the restaurant',
      'reserve a table',
      'get me a reservation',
      'book dinner',
      'make dinner reservations',
      'can you call and reserve',
    ],
    patterns: [
      /\b(make|book|get)\s+(a\s+)?(restaurant\s+)?reservation\b/i,
      /\b(book|reserve)\s+(a\s+)?table\b/i,
      /\bcall\s+(the\s+)?restaurant\b/i,
      /\b(make|book)\s+dinner\s+reservations?\b/i,
    ],
    keywords: [
      { word: 'reservation', weight: 1.0 },
      { word: 'restaurant', weight: 0.95 },
      { word: 'table', weight: 0.9 },
      { word: 'book', weight: 0.85 },
      { word: 'dinner', weight: 0.8 },
      { word: 'lunch', weight: 0.8 },
    ],
    antiKeywords: ['cancel reservation', 'change reservation'],
  },

  examples: [
    'Make a reservation at that Italian place for Saturday',
    'Can you book a table for two tonight',
    'Call the restaurant and get us a reservation',
  ],

  counterExamples: ['I need to cancel my dinner reservation'],

  arguments: [
    { name: 'restaurant', type: 'string', required: false, description: 'Restaurant name/type' },
    { name: 'date', type: 'string', required: false, description: 'Date for reservation' },
    { name: 'partySize', type: 'number', required: false, description: 'Number of people' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.08,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/concierge',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'makeRestaurantReservation',
      args,
      delegateTo: 'domains/concierge',
    };
  },
};

// ============================================================================
// HEALTHCARE APPOINTMENT
// ============================================================================

export const scheduleHealthcareAppointmentTool: SemanticToolDefinition = {
  id: 'concierge_healthcare_appointment',
  name: 'Schedule Healthcare Appointment',
  description: "Schedule a doctor's appointment by having AI call on your behalf.",
  shortDescription: 'doctor appointment',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "schedule a doctor's appointment",
      'book a doctor appointment',
      'make an appointment with my doctor',
      'call the doctor for me',
      "schedule my doctor's visit",
      'book a checkup',
      'schedule a dentist appointment',
      'make an appointment with the specialist',
    ],
    patterns: [
      /\b(schedule|book|make)\s+(a\s+)?(doctor'?s?|dentist|specialist)\s+(appointment|visit)\b/i,
      /\bcall\s+(the\s+|my\s+)?doctor\b/i,
      /\b(schedule|book)\s+(a\s+)?(medical|healthcare)\s+appointment\b/i,
      /\b(schedule|book)\s+(a\s+)?checkup\b/i,
    ],
    keywords: [
      { word: 'doctor', weight: 1.0 },
      { word: 'appointment', weight: 0.95 },
      { word: 'schedule', weight: 0.9 },
      { word: 'dentist', weight: 0.95 },
      { word: 'specialist', weight: 0.9 },
      { word: 'checkup', weight: 0.85 },
    ],
    antiKeywords: ['cancel appointment', 'reschedule'],
  },

  examples: [
    "Schedule a doctor's appointment for next week",
    'Can you call and book my annual checkup',
    'I need to make an appointment with my specialist',
  ],

  counterExamples: ["I need to cancel my doctor's appointment"],

  arguments: [
    { name: 'provider', type: 'string', required: false, description: 'Doctor/clinic name' },
    { name: 'reason', type: 'string', required: false, description: 'Reason for visit' },
    { name: 'preferredDate', type: 'string', required: false, description: 'Preferred date' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/concierge',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'scheduleHealthcareAppointment',
      args,
      delegateTo: 'domains/concierge',
    };
  },
};

// ============================================================================
// SERVICE QUOTES
// ============================================================================

export const getServiceQuotesTool: SemanticToolDefinition = {
  id: 'concierge_service_quotes',
  name: 'Get Service Quotes',
  description: 'Get quotes from service providers by having AI call them.',
  shortDescription: 'get service quotes',
  category: 'productivity',
  priority: 3,

  triggers: {
    phrases: [
      'get me quotes',
      'call for quotes',
      'find a plumber',
      'get estimates',
      'call contractors',
      'find a cleaner',
      'get service quotes',
      'call some companies',
    ],
    patterns: [
      /\b(get|find)\s+(me\s+)?(quotes|estimates)\b/i,
      /\bcall\s+(for\s+)?(quotes|estimates)\b/i,
      /\b(find|get)\s+(a|me\s+a)\s+(plumber|electrician|cleaner|contractor)\b/i,
      /\bcall\s+(some\s+)?(companies|contractors|services)\b/i,
    ],
    keywords: [
      { word: 'quotes', weight: 1.0 },
      { word: 'estimates', weight: 0.95 },
      { word: 'plumber', weight: 0.9 },
      { word: 'electrician', weight: 0.9 },
      { word: 'contractor', weight: 0.85 },
      { word: 'service', weight: 0.75 },
    ],
    antiKeywords: ['already hired', 'cancel service'],
  },

  examples: [
    'Get me quotes from some plumbers',
    'Can you call contractors and get estimates',
    'Find me a house cleaner and get pricing',
  ],

  counterExamples: ['I already have a plumber coming'],

  arguments: [
    { name: 'serviceType', type: 'string', required: true, description: 'Type of service needed' },
    { name: 'details', type: 'string', required: false, description: 'Job details' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/concierge',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getServiceQuotes',
      args,
      delegateTo: 'domains/concierge',
    };
  },
};

// ============================================================================
// CHECK CONCIERGE STATUS
// ============================================================================

export const checkConciergeStatusTool: SemanticToolDefinition = {
  id: 'concierge_check_status',
  name: 'Check Concierge Status',
  description: 'Check the status of pending concierge requests.',
  shortDescription: 'check request status',
  category: 'productivity',
  priority: 4,

  triggers: {
    phrases: [
      'check on my request',
      'status of my reservation',
      'did you hear back',
      'any updates on my booking',
      'what happened with',
      'did the hotel call back',
      'status of my appointment',
    ],
    patterns: [
      /\b(check|what'?s)\s+(on|the)\s+(status|progress)\b/i,
      /\bstatus\s+of\s+(my\s+)?(request|reservation|booking|appointment)\b/i,
      /\b(did\s+)?(you\s+)?hear\s+back\b/i,
      /\bany\s+updates?\s+on\b/i,
    ],
    keywords: [
      { word: 'status', weight: 1.0 },
      { word: 'update', weight: 0.9 },
      { word: 'hear back', weight: 0.85 },
      { word: 'progress', weight: 0.8 },
      { word: 'check', weight: 0.7 },
    ],
    antiKeywords: ['new request', 'make a'],
  },

  examples: [
    'What is the status of my hotel request',
    'Did you hear back from the restaurant',
    'Any updates on my doctor appointment',
  ],

  counterExamples: ['I want to make a new reservation'],

  arguments: [
    { name: 'requestType', type: 'string', required: false, description: 'Type of request' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/concierge',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'checkConciergeStatus',
      args,
      delegateTo: 'domains/concierge',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const conciergeTools: SemanticToolDefinition[] = [
  requestHotelQuotesTool,
  makeRestaurantReservationTool,
  scheduleHealthcareAppointmentTool,
  getServiceQuotesTool,
  checkConciergeStatusTool,
];
