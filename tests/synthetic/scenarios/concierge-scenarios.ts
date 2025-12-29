/**
 * Concierge Calling Test Scenarios
 *
 * Comprehensive test scenarios covering all appointment/reservation types:
 * - Healthcare (doctor, dentist, specialist)
 * - Dining (restaurants, cafes)
 * - Personal services (salon, spa, etc.)
 * - Edge cases (voicemail, wrong number, disconnects)
 */

import type { MockBusinessConfig, AvailabilityScenario } from '../mocks/mock-business.js';
import {
  createHelpfulDoctorOffice,
  createBusyClinic,
  createPopularRestaurant,
  createSalon,
  createVoicemailBusiness,
  getNextWeekday,
} from '../mocks/mock-business.js';

// ============================================================================
// TYPES
// ============================================================================

export type ExpectedOutcome =
  | 'appointment_confirmed'
  | 'reservation_confirmed'
  | 'no_availability'
  | 'waitlist_added'
  | 'voicemail_left'
  | 'callback_requested'
  | 'wrong_number'
  | 'business_closed'
  | 'call_failed';

export interface ExpectedExtraction {
  appointmentDate?: Date | 'any';
  reservationTime?: Date | 'any';
  confirmationNumber?: string | 'any';
  provider?: string;
  partySize?: number;
  confirmed?: boolean;
  waitlistAdded?: boolean;
}

export interface TestAssertion {
  description: string;
  check: (result: TestResult) => boolean;
}

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: 'healthcare' | 'dining' | 'personal_service' | 'edge_case';

  // Input
  userRequest: string;
  userContext?: {
    storedContacts?: StoredContact[];
    preferences?: Record<string, unknown>;
  };

  // Mock business configuration
  mockBusiness: MockBusinessConfig;

  // Expected results
  expectedOutcome: ExpectedOutcome;
  expectedExtraction?: ExpectedExtraction;

  // Additional assertions
  assertions?: TestAssertion[];

  // Timeout (ms)
  timeout?: number;
}

export interface StoredContact {
  type: string;
  name: string;
  phone: string;
  aliases?: string[];
}

export interface TestResult {
  scenario: TestScenario;
  passed: boolean;
  outcome: string;
  duration: number;
  extractedData: Record<string, unknown>;
  conversationLog: unknown[];
  assertions: {
    description: string;
    passed: boolean;
    details?: string;
  }[];
  error?: string;
}

// ============================================================================
// HEALTHCARE SCENARIOS
// ============================================================================

export const HEALTHCARE_SCENARIOS: TestScenario[] = [
  {
    id: 'hc-001',
    name: 'Doctor - Quick Appointment with Known Doctor',
    description: 'User has stored doctor, gets quick appointment',
    category: 'healthcare',
    userRequest: 'Call my doctor and schedule a checkup',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Chen',
          phone: '+14155551234',
          aliases: ['my doctor', 'primary care', 'doctor'],
        },
      ],
    },
    mockBusiness: createHelpfulDoctorOffice({
      name: "Dr. Chen's Office",
      availability: {
        type: 'available',
        slots: [
          { datetime: getNextWeekday(2, 9), provider: 'Dr. Chen' },
          { datetime: getNextWeekday(4, 14), provider: 'Dr. Chen' },
        ],
      },
    }),
    expectedOutcome: 'appointment_confirmed',
    expectedExtraction: {
      appointmentDate: 'any',
      provider: 'Dr. Chen',
      confirmed: true,
    },
    assertions: [
      {
        description: 'Resolved "my doctor" to Dr. Chen',
        check: (r) => r.conversationLog.some((t: any) => 
          t.content?.toString().toLowerCase().includes('dr. chen')
        ),
      },
      {
        description: 'Used professional greeting',
        check: (r) => r.conversationLog.some((t: any) => 
          t.content?.toString().toLowerCase().includes('on behalf of')
        ),
      },
    ],
  },

  {
    id: 'hc-002',
    name: 'Doctor - Unknown Doctor (Learning Flow)',
    description: 'User mentions doctor but we dont have it stored - should ask',
    category: 'healthcare',
    userRequest: 'Schedule an appointment with my dentist',
    userContext: {
      storedContacts: [], // No stored contacts
    },
    mockBusiness: createHelpfulDoctorOffice({ name: 'Generic Clinic' }),
    expectedOutcome: 'callback_requested', // Can't call without number
    assertions: [
      {
        description: 'Asked for dentist information',
        check: (r) => r.extractedData.askedForContactInfo === true,
      },
    ],
  },

  {
    id: 'hc-003',
    name: 'Doctor - IVR Navigation',
    description: 'Navigate through IVR menu to reach scheduling',
    category: 'healthcare',
    userRequest: 'I need to see Dr. Martinez for a follow-up',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Martinez',
          phone: '+14155559999',
          aliases: ['dr martinez', 'martinez'],
        },
      ],
    },
    mockBusiness: createBusyClinic({
      name: 'City Medical Center',
      availability: {
        type: 'available',
        slots: [{ datetime: getNextWeekday(3, 11), provider: 'Dr. Martinez' }],
      },
    }),
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Successfully navigated IVR',
        check: (r) => r.conversationLog.some((t: any) => t.from === 'agent' && t.content?.type === 'dtmf'),
      },
      {
        description: 'Waited through hold',
        check: (r) => r.extractedData.waitedOnHold === true,
      },
    ],
    timeout: 180000, // 3 min for IVR + hold
  },

  {
    id: 'hc-004',
    name: 'Doctor - Long Hold Time',
    description: 'Patient agent waits through extended hold',
    category: 'healthcare',
    userRequest: 'Schedule a checkup with my primary care doctor',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Williams',
          phone: '+14155558888',
          aliases: ['primary care', 'my doctor'],
        },
      ],
    },
    mockBusiness: {
      ...createBusyClinic(),
      name: 'Very Busy Clinic',
      holdTime: 180000, // 3 minutes
      scenarios: ['long_hold_music'],
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Held for full duration without hanging up',
        check: (r) => r.extractedData.holdDuration >= 170000,
      },
    ],
    timeout: 300000, // 5 min
  },

  {
    id: 'hc-005',
    name: 'Doctor - No Availability',
    description: 'Doctor is fully booked, should ask about waitlist',
    category: 'healthcare',
    userRequest: 'I need to see my dermatologist soon',
    userContext: {
      storedContacts: [
        {
          type: 'specialist',
          name: 'Dr. Skin',
          phone: '+14155557777',
          aliases: ['dermatologist', 'skin doctor'],
        },
      ],
    },
    mockBusiness: createHelpfulDoctorOffice({
      name: 'Dermatology Associates',
      availability: { type: 'fully_booked', suggestedCallback: getNextWeekday(10, 9) },
    }),
    expectedOutcome: 'no_availability',
    assertions: [
      {
        description: 'Asked about waitlist or cancellation list',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' &&
          (t.content?.toString().toLowerCase().includes('waitlist') ||
           t.content?.toString().toLowerCase().includes('cancellation'))
        ),
      },
      {
        description: 'Captured callback suggestion',
        check: (r) => r.extractedData.suggestedCallback !== undefined,
      },
    ],
  },

  {
    id: 'hc-006',
    name: 'Doctor - Goes to Voicemail',
    description: 'Office doesnt answer, leaves appropriate voicemail',
    category: 'healthcare',
    userRequest: 'Schedule a cleaning with my dentist',
    userContext: {
      storedContacts: [
        {
          type: 'dentist',
          name: 'Smile Dental',
          phone: '+14155556666',
          aliases: ['dentist', 'my dentist'],
        },
      ],
    },
    mockBusiness: createVoicemailBusiness({
      name: 'Smile Dental',
      type: 'dentist_office',
    }),
    expectedOutcome: 'voicemail_left',
    assertions: [
      {
        description: 'Left voicemail with patient name',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().includes('behalf of')
        ),
      },
      {
        description: 'Included callback number in voicemail',
        check: (r) => r.extractedData.voicemailIncludedCallback === true,
      },
    ],
  },

  {
    id: 'hc-007',
    name: 'Doctor - Urgent Appointment',
    description: 'User needs urgent appointment, agent conveys urgency',
    category: 'healthcare',
    userRequest: 'I need to see a doctor urgently - I think I have an infection',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: "Dr. Quick's Urgent Care",
          phone: '+14155554444',
          aliases: ['urgent care', 'doctor'],
        },
      ],
    },
    mockBusiness: createHelpfulDoctorOffice({
      name: "Dr. Quick's Urgent Care",
      answerDelay: 1000,
      availability: {
        type: 'available',
        slots: [{ datetime: new Date(Date.now() + 3600000), provider: 'Dr. Quick' }], // In 1 hour
      },
    }),
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Conveyed urgency to receptionist',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().toLowerCase().includes('urgent')
        ),
      },
      {
        description: 'Got same-day appointment',
        check: (r) => {
          const apptDate = r.extractedData.appointmentDate as Date;
          const today = new Date();
          return apptDate && apptDate.getDate() === today.getDate();
        },
      },
    ],
  },
];

// ============================================================================
// RESTAURANT SCENARIOS
// ============================================================================

export const RESTAURANT_SCENARIOS: TestScenario[] = [
  {
    id: 'rest-001',
    name: 'Restaurant - Simple Reservation',
    description: 'Book a table at known restaurant',
    category: 'dining',
    userRequest: 'Make a reservation at Nobu for 4 people Saturday at 7',
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: 'Nobu',
          phone: '+14155551111',
          aliases: ['nobu', 'favorite sushi place'],
        },
      ],
    },
    mockBusiness: {
      ...createPopularRestaurant(),
      name: 'Nobu',
      availability: {
        type: 'available',
        slots: [
          { datetime: getNextWeekday(6, 19) }, // Saturday 7pm
          { datetime: getNextWeekday(6, 21) }, // Saturday 9pm
        ],
      },
    },
    expectedOutcome: 'reservation_confirmed',
    expectedExtraction: {
      reservationTime: 'any',
      partySize: 4,
      confirmed: true,
    },
    assertions: [
      {
        description: 'Specified party size',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().includes('4')
        ),
      },
    ],
  },

  {
    id: 'rest-002',
    name: 'Restaurant - Alternative Time Offered',
    description: 'Requested time unavailable, accepts alternative',
    category: 'dining',
    userRequest: 'Book dinner at my favorite Italian place Friday at 7',
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: "Luigi's",
          phone: '+14155552222',
          aliases: ['favorite italian', 'luigis', 'italian place'],
        },
      ],
    },
    mockBusiness: {
      ...createPopularRestaurant(),
      name: "Luigi's",
      availability: {
        type: 'busy',
        nextAvailable: getNextWeekday(5, 20, 30), // Friday 8:30pm
      },
    },
    expectedOutcome: 'reservation_confirmed',
    assertions: [
      {
        description: 'Asked about alternative times',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' &&
          (t.content?.toString().toLowerCase().includes('earlier') ||
           t.content?.toString().toLowerCase().includes('later') ||
           t.content?.toString().toLowerCase().includes('work'))
        ),
      },
      {
        description: 'Accepted reasonable alternative',
        check: (r) => r.extractedData.confirmed === true,
      },
    ],
  },

  {
    id: 'rest-003',
    name: 'Restaurant - Special Occasion',
    description: 'Mention special occasion (birthday) for extra attention',
    category: 'dining',
    userRequest: "Book a table at The Capital Grille for my wife's birthday, 6 people Saturday",
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: 'The Capital Grille',
          phone: '+14155553333',
          aliases: ['capital grille', 'steakhouse'],
        },
      ],
    },
    mockBusiness: {
      ...createPopularRestaurant(),
      name: 'The Capital Grille',
      personality: 'professional',
      availability: {
        type: 'available',
        slots: [{ datetime: getNextWeekday(6, 19) }],
      },
    },
    expectedOutcome: 'reservation_confirmed',
    assertions: [
      {
        description: 'Mentioned birthday/special occasion',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().toLowerCase().includes('birthday')
        ),
      },
    ],
  },

  {
    id: 'rest-004',
    name: 'Restaurant - Dietary Requirements',
    description: 'Include dietary needs in reservation request',
    category: 'dining',
    userRequest: 'Reserve a table for 4 at that new Thai place, we have a peanut allergy',
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: 'Thai Garden',
          phone: '+14155554444',
          aliases: ['thai place', 'new thai'],
        },
      ],
    },
    mockBusiness: {
      ...createPopularRestaurant(),
      name: 'Thai Garden',
      scenarios: ['asks_for_callback_number'],
      availability: {
        type: 'available',
        slots: [{ datetime: getNextWeekday(3, 19) }],
      },
    },
    expectedOutcome: 'reservation_confirmed',
    assertions: [
      {
        description: 'Mentioned allergy/dietary need',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' &&
          (t.content?.toString().toLowerCase().includes('peanut') ||
           t.content?.toString().toLowerCase().includes('allergy'))
        ),
      },
    ],
  },
];

// ============================================================================
// PERSONAL SERVICE SCENARIOS
// ============================================================================

export const PERSONAL_SERVICE_SCENARIOS: TestScenario[] = [
  {
    id: 'ps-001',
    name: 'Salon - Book with Specific Stylist',
    description: 'Request specific person at salon',
    category: 'personal_service',
    userRequest: 'Schedule a haircut with Sarah at the salon',
    userContext: {
      storedContacts: [
        {
          type: 'salon',
          name: 'Style Studio',
          phone: '+14155555555',
          aliases: ['salon', 'hair place', 'style studio'],
        },
      ],
    },
    mockBusiness: createSalon({
      availability: {
        type: 'available',
        slots: [
          { datetime: getNextWeekday(2, 10), provider: 'Sarah' },
          { datetime: getNextWeekday(3, 14), provider: 'Sarah' },
        ],
      },
    }),
    expectedOutcome: 'appointment_confirmed',
    expectedExtraction: {
      provider: 'Sarah',
      confirmed: true,
    },
    assertions: [
      {
        description: 'Requested Sarah specifically',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().toLowerCase().includes('sarah')
        ),
      },
    ],
  },

  {
    id: 'ps-002',
    name: 'Spa - Book Treatment',
    description: 'Schedule spa treatment',
    category: 'personal_service',
    userRequest: 'Book a massage at my spa for next weekend',
    userContext: {
      storedContacts: [
        {
          type: 'spa',
          name: 'Serenity Spa',
          phone: '+14155556666',
          aliases: ['spa', 'my spa', 'serenity'],
        },
      ],
    },
    mockBusiness: {
      name: 'Serenity Spa',
      type: 'spa',
      answerDelay: 3000,
      hasIVR: false,
      ivrDepth: 0,
      holdTime: 0,
      goesToVoicemail: false,
      voicemailAfter: 5,
      personality: 'helpful',
      comprehension: 'perfect',
      availability: {
        type: 'available',
        slots: [
          { datetime: getNextWeekday(6, 11) },
          { datetime: getNextWeekday(0, 14) },
        ],
      },
      scenarios: ['asks_for_service_type'],
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Specified massage as service type',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' && t.content?.toString().toLowerCase().includes('massage')
        ),
      },
    ],
  },
];

// ============================================================================
// EDGE CASE SCENARIOS
// ============================================================================

export const EDGE_CASE_SCENARIOS: TestScenario[] = [
  {
    id: 'edge-001',
    name: 'Wrong Number',
    description: 'Stored number is wrong, agent detects and handles',
    category: 'edge_case',
    userRequest: 'Call my doctor',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Smith',
          phone: '+14155550000', // Wrong number
          aliases: ['doctor', 'my doctor'],
        },
      ],
    },
    mockBusiness: {
      name: "Mike's Pizza",
      type: 'wrong_number',
      answerDelay: 2000,
      hasIVR: false,
      ivrDepth: 0,
      holdTime: 0,
      goesToVoicemail: false,
      voicemailAfter: 5,
      personality: 'confused',
      comprehension: 'perfect',
      availability: { type: 'available', slots: [] },
      scenarios: [],
    },
    expectedOutcome: 'wrong_number',
    assertions: [
      {
        description: 'Detected wrong number quickly',
        check: (r) => r.duration < 30000, // Under 30 seconds
      },
      {
        description: 'Flagged contact for update',
        check: (r) => r.extractedData.contactNeedsUpdate === true,
      },
    ],
  },

  {
    id: 'edge-002',
    name: 'Business Permanently Closed',
    description: 'Business no longer operating',
    category: 'edge_case',
    userRequest: 'Make a reservation at that Thai place',
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: 'Thai Orchid',
          phone: '+14155551111',
          aliases: ['thai place', 'thai orchid'],
        },
      ],
    },
    mockBusiness: {
      name: 'Thai Orchid (Closed)',
      type: 'closed_business',
      answerDelay: 2000,
      hasIVR: false,
      ivrDepth: 0,
      holdTime: 0,
      goesToVoicemail: false,
      voicemailAfter: 5,
      personality: 'helpful',
      comprehension: 'perfect',
      availability: { type: 'no_longer_in_business' },
      scenarios: [],
    },
    expectedOutcome: 'business_closed',
    assertions: [
      {
        description: 'Detected business closure',
        check: (r) => r.extractedData.businessClosed === true,
      },
      {
        description: 'Marked contact as inactive',
        check: (r) => r.extractedData.contactMarkedInactive === true,
      },
    ],
  },

  {
    id: 'edge-003',
    name: 'IVR Hell - Deep Menu',
    description: 'Navigate through 4-level deep IVR',
    category: 'edge_case',
    userRequest: 'Schedule appointment at the clinic',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Mega Health System',
          phone: '+14155552222',
          aliases: ['clinic', 'mega health'],
        },
      ],
    },
    mockBusiness: {
      name: 'Mega Health System',
      type: 'large_clinic',
      answerDelay: 5000,
      hasIVR: true,
      ivrDepth: 4,
      holdTime: 60000,
      goesToVoicemail: false,
      voicemailAfter: 10,
      personality: 'professional',
      comprehension: 'good',
      availability: {
        type: 'available',
        slots: [{ datetime: getNextWeekday(4, 10) }],
      },
      scenarios: ['ivr_loop'],
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Navigated through all IVR levels',
        check: (r) => {
          const dtmfInputs = r.conversationLog.filter((t: any) => 
            t.from === 'agent' && t.content?.type === 'dtmf'
          );
          return dtmfInputs.length >= 2;
        },
      },
      {
        description: 'Eventually reached human',
        check: (r) => r.extractedData.reachedHuman === true,
      },
    ],
    timeout: 300000, // 5 minutes
  },

  {
    id: 'edge-004',
    name: 'Call Disconnected Mid-Conversation',
    description: 'Handle unexpected disconnection',
    category: 'edge_case',
    userRequest: 'Book a table for dinner',
    userContext: {
      storedContacts: [
        {
          type: 'restaurant',
          name: 'Unreliable Diner',
          phone: '+14155553333',
          aliases: ['diner'],
        },
      ],
    },
    mockBusiness: {
      ...createPopularRestaurant(),
      name: 'Unreliable Diner',
      scenarios: ['disconnects_mid_call'],
    },
    expectedOutcome: 'call_failed',
    assertions: [
      {
        description: 'Detected disconnection',
        check: (r) => r.extractedData.disconnected === true,
      },
      {
        description: 'Queued retry attempt',
        check: (r) => r.extractedData.retryQueued === true,
      },
    ],
  },

  {
    id: 'edge-005',
    name: 'Insurance Verification Required',
    description: 'Handle insurance questions during healthcare call',
    category: 'edge_case',
    userRequest: 'Schedule a checkup with my doctor',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Careful',
          phone: '+14155554444',
          aliases: ['doctor', 'my doctor'],
        },
      ],
      preferences: {
        insurance: 'Blue Cross Blue Shield',
      },
    },
    mockBusiness: {
      ...createHelpfulDoctorOffice(),
      name: "Dr. Careful's Office",
      scenarios: ['asks_for_insurance'],
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      {
        description: 'Provided insurance information when asked',
        check: (r) => r.conversationLog.some((t: any) =>
          t.from === 'agent' &&
          t.content?.toString().toLowerCase().includes('blue cross')
        ),
      },
    ],
  },

  {
    id: 'edge-006',
    name: 'Multiple Doctors - Clarification Needed',
    description: 'User has multiple doctors, need to clarify which one',
    category: 'edge_case',
    userRequest: 'Call my doctor',
    userContext: {
      storedContacts: [
        {
          type: 'doctor',
          name: 'Dr. Heart',
          phone: '+14155551111',
          aliases: ['cardiologist', 'heart doctor'],
        },
        {
          type: 'doctor',
          name: 'Dr. General',
          phone: '+14155552222',
          aliases: ['primary care', 'family doctor'],
        },
      ],
    },
    mockBusiness: createHelpfulDoctorOffice(), // Won't actually reach business
    expectedOutcome: 'callback_requested', // Need clarification first
    assertions: [
      {
        description: 'Asked which doctor',
        check: (r) => r.extractedData.askedForClarification === true,
      },
      {
        description: 'Listed options',
        check: (r) => r.extractedData.presentedOptions?.includes('Dr. Heart') ?? false,
      },
    ],
  },
];

// ============================================================================
// ALL SCENARIOS COMBINED
// ============================================================================

export const ALL_SCENARIOS: TestScenario[] = [
  ...HEALTHCARE_SCENARIOS,
  ...RESTAURANT_SCENARIOS,
  ...PERSONAL_SERVICE_SCENARIOS,
  ...EDGE_CASE_SCENARIOS,
];

// ============================================================================
// SCENARIO HELPERS
// ============================================================================

export function getScenariosByCategory(
  category: TestScenario['category']
): TestScenario[] {
  return ALL_SCENARIOS.filter((s) => s.category === category);
}

export function getScenarioById(id: string): TestScenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id);
}

export function getQuickTestScenarios(): TestScenario[] {
  // Scenarios that complete quickly (< 30 seconds)
  return ALL_SCENARIOS.filter((s) => !s.timeout || s.timeout < 30000);
}

export function getFullTestScenarios(): TestScenario[] {
  // All scenarios including long-running ones
  return ALL_SCENARIOS;
}

export function getScenarioSummary(): {
  total: number;
  byCategory: Record<string, number>;
  byOutcome: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};

  for (const scenario of ALL_SCENARIOS) {
    byCategory[scenario.category] = (byCategory[scenario.category] || 0) + 1;
    byOutcome[scenario.expectedOutcome] = (byOutcome[scenario.expectedOutcome] || 0) + 1;
  }

  return {
    total: ALL_SCENARIOS.length,
    byCategory,
    byOutcome,
  };
}
