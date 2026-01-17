/**
 * Mock Business Simulator
 *
 * Simulates realistic business phone systems for testing the concierge calling agent.
 * Supports IVR menus, hold times, voicemail, and various receptionist personalities.
 *
 * This enables comprehensive E2E testing without making real phone calls.
 */

// ============================================================================
// TYPES
// ============================================================================

export type BusinessType =
  | 'doctor_office'
  | 'dentist_office'
  | 'specialist_office'
  | 'large_clinic'
  | 'upscale_restaurant'
  | 'casual_restaurant'
  | 'popular_restaurant'
  | 'salon'
  | 'spa'
  | 'plumber'
  | 'general_service'
  | 'wrong_number'
  | 'closed_business';

export type ReceptionistPersonality = 'helpful' | 'busy' | 'confused' | 'rude' | 'professional';

export type Comprehension = 'perfect' | 'good' | 'poor';

export type SpecialScenario =
  | 'asks_for_insurance'
  | 'asks_for_callback_number'
  | 'transfers_multiple_times'
  | 'disconnects_mid_call'
  | 'background_noise'
  | 'heavy_accent'
  | 'speaks_fast'
  | 'asks_for_service_type'
  | 'ivr_loop'
  | 'long_hold_music';

export interface AvailabilitySlot {
  datetime: Date;
  provider?: string;
}

export type AvailabilityScenario =
  | { type: 'available'; slots: AvailabilitySlot[] }
  | { type: 'busy'; nextAvailable: Date; waitlistAvailable?: boolean }
  | { type: 'fully_booked'; suggestedCallback?: Date }
  | { type: 'closed'; reopenDate?: Date }
  | { type: 'no_longer_in_business' };

export interface BusinessHours {
  open: string;
  close: string;
}

export interface MockBusinessConfig {
  name: string;
  type: BusinessType;

  // Phone behavior
  answerDelay: number; // ms before answering (0-5000 typical)
  hasIVR: boolean;
  ivrDepth: number; // How many menus deep (1-4)
  holdTime: number; // ms on hold (0-300000)
  goesToVoicemail: boolean;
  voicemailAfter: number; // rings before VM (3-6 typical)

  // Receptionist behavior
  personality: ReceptionistPersonality;
  comprehension: Comprehension;

  // Availability
  availability: AvailabilityScenario;

  // Special scenarios
  scenarios: SpecialScenario[];

  // Business details
  address?: string;
  hours?: Record<string, BusinessHours>;
}

export type CallConnectionType = 'human' | 'ivr' | 'voicemail' | 'busy' | 'no_answer';

export interface CallConnection {
  type: CallConnectionType;
  greeting?: string;
  menu?: IVRMenu;
}

export interface IVRMenu {
  prompt: string;
  options: IVROption[];
  depth: number;
  allowsOperator: boolean;
}

export interface IVROption {
  digit: string;
  description: string;
  leadsTo: 'next_menu' | 'hold' | 'human' | 'voicemail' | 'disconnect';
}

export type AgentInputType = 'speech' | 'dtmf';

export interface AgentInput {
  type: AgentInputType;
  content: string;
  timestamp: Date;
}

export interface BusinessResponse {
  type: 'speech' | 'hold_music' | 'transfer' | 'disconnect' | 'ivr_menu';
  content: string;
  nextMenu?: IVRMenu;
  holdDuration?: number;
  transferTo?: string;
  extractableData?: Record<string, unknown>;
}

export interface ConversationTurn {
  from: 'agent' | 'business';
  content: string | AgentInput | BusinessResponse;
  timestamp: Date;
}

type MockBusinessState =
  | { phase: 'not_answered' }
  | { phase: 'ringing'; ringCount: number }
  | { phase: 'ivr'; menuDepth: number; currentMenu: IVRMenu }
  | { phase: 'on_hold'; startTime: Date }
  | { phase: 'speaking_to_human'; turnsWithHuman: number }
  | { phase: 'leaving_voicemail' }
  | { phase: 'completed'; outcome: string }
  | { phase: 'disconnected'; reason: string };

// ============================================================================
// MOCK BUSINESS CLASS
// ============================================================================

export class MockBusiness {
  private config: MockBusinessConfig;
  private state: MockBusinessState;
  private conversationLog: ConversationTurn[] = [];
  private extractedFromAgent: Record<string, unknown> = {};

  constructor(config: MockBusinessConfig) {
    this.config = config;
    this.state = { phase: 'not_answered' };
  }

  /**
   * Simulate receiving a call
   */
  async receiveCall(): Promise<CallConnection> {
    // Simulate ring delay
    await this.delay(this.config.answerDelay);

    // Check if goes to voicemail
    if (this.config.goesToVoicemail) {
      this.state = { phase: 'leaving_voicemail' };
      return {
        type: 'voicemail',
        greeting: this.getVoicemailGreeting(),
      };
    }

    // Check if has IVR
    if (this.config.hasIVR) {
      const menu = this.getIVRMenu(0);
      this.state = { phase: 'ivr', menuDepth: 0, currentMenu: menu };
      return {
        type: 'ivr',
        menu,
      };
    }

    // Direct to human
    this.state = { phase: 'speaking_to_human', turnsWithHuman: 0 };
    return {
      type: 'human',
      greeting: this.getHumanGreeting(),
    };
  }

  /**
   * Handle input from the calling agent
   */
  async handleInput(input: AgentInput): Promise<BusinessResponse> {
    this.conversationLog.push({
      from: 'agent',
      content: input,
      timestamp: new Date(),
    });

    // Extract any useful info from agent's speech
    if (input.type === 'speech') {
      this.extractFromAgentSpeech(input.content);
    }

    const response = await this.generateResponse(input);

    this.conversationLog.push({
      from: 'business',
      content: response,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Get the full conversation log
   */
  getConversationLog(): ConversationTurn[] {
    return [...this.conversationLog];
  }

  /**
   * Get current state
   */
  getState(): MockBusinessState {
    return this.state;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async generateResponse(input: AgentInput): Promise<BusinessResponse> {
    // Handle based on current state
    switch (this.state.phase) {
      case 'ivr':
        return this.handleIVRInput(input);

      case 'on_hold':
        return this.handleHoldComplete();

      case 'speaking_to_human':
        return this.handleHumanConversation(input);

      case 'leaving_voicemail':
        return this.handleVoicemailInput(input);

      default:
        return {
          type: 'disconnect',
          content: 'Call ended unexpectedly',
        };
    }
  }

  private handleIVRInput(input: AgentInput): BusinessResponse {
    if (this.state.phase !== 'ivr') {
      return { type: 'disconnect', content: 'Invalid state' };
    }

    const { currentMenu, menuDepth } = this.state;

    // Handle DTMF input
    if (input.type === 'dtmf') {
      const option = currentMenu.options.find((o) => o.digit === input.content);

      if (!option) {
        // Invalid option - repeat menu
        return {
          type: 'ivr_menu',
          content: `I didn't understand that. ${currentMenu.prompt}`,
          nextMenu: currentMenu,
        };
      }

      switch (option.leadsTo) {
        case 'human': {
          this.state = { phase: 'speaking_to_human', turnsWithHuman: 0 };
          if (this.config.holdTime > 0) {
            this.state = { phase: 'on_hold', startTime: new Date() };
            return {
              type: 'hold_music',
              content: 'Please hold while I connect you...',
              holdDuration: this.config.holdTime,
            };
          }
          return {
            type: 'speech',
            content: this.getHumanGreeting(),
          };
        }

        case 'next_menu': {
          if (menuDepth < this.config.ivrDepth - 1) {
            const nextMenu = this.getIVRMenu(menuDepth + 1);
            this.state = { phase: 'ivr', menuDepth: menuDepth + 1, currentMenu: nextMenu };
            return {
              type: 'ivr_menu',
              content: nextMenu.prompt,
              nextMenu,
            };
          }
          // Max depth reached, go to human
          this.state = { phase: 'speaking_to_human', turnsWithHuman: 0 };
          return {
            type: 'speech',
            content: this.getHumanGreeting(),
          };
        }

        case 'hold': {
          this.state = { phase: 'on_hold', startTime: new Date() };
          return {
            type: 'hold_music',
            content: 'Please hold...',
            holdDuration: this.config.holdTime,
          };
        }

        case 'voicemail': {
          this.state = { phase: 'leaving_voicemail' };
          return {
            type: 'speech',
            content: this.getVoicemailGreeting(),
          };
        }

        case 'disconnect': {
          this.state = { phase: 'disconnected', reason: 'IVR disconnect' };
          return {
            type: 'disconnect',
            content: 'Goodbye.',
          };
        }
      }
    }

    // Handle speech input in IVR (looking for "operator", "representative", etc.)
    if (input.type === 'speech') {
      const lowerContent = input.content.toLowerCase();
      if (
        currentMenu.allowsOperator &&
        (lowerContent.includes('operator') ||
          lowerContent.includes('representative') ||
          lowerContent.includes('person') ||
          lowerContent.includes('agent'))
      ) {
        this.state = { phase: 'speaking_to_human', turnsWithHuman: 0 };
        return {
          type: 'speech',
          content: 'Connecting you to a representative...',
        };
      }
    }

    // Didn't understand
    return {
      type: 'ivr_menu',
      content: `I'm sorry, I didn't get that. ${currentMenu.prompt}`,
      nextMenu: currentMenu,
    };
  }

  private handleHoldComplete(): BusinessResponse {
    this.state = { phase: 'speaking_to_human', turnsWithHuman: 0 };
    return {
      type: 'speech',
      content: this.getHumanGreeting(),
    };
  }

  private handleHumanConversation(input: AgentInput): BusinessResponse {
    if (this.state.phase !== 'speaking_to_human') {
      return { type: 'disconnect', content: 'Invalid state' };
    }

    const turns = this.state.turnsWithHuman;
    this.state = { phase: 'speaking_to_human', turnsWithHuman: turns + 1 };

    // Check for special scenarios
    if (this.config.scenarios.includes('disconnects_mid_call') && turns === 2) {
      this.state = { phase: 'disconnected', reason: 'Mid-call disconnect' };
      return {
        type: 'disconnect',
        content: '',
      };
    }

    // Generate contextual response based on what the agent said
    return this.generateHumanResponse(input.content);
  }

  private generateHumanResponse(agentSpeech: string): BusinessResponse {
    const lower = agentSpeech.toLowerCase();
    const { personality, availability, type: businessType } = this.config;

    // Handle appointment/reservation requests
    if (
      lower.includes('appointment') ||
      lower.includes('schedule') ||
      lower.includes('reservation') ||
      lower.includes('book')
    ) {
      return this.handleAppointmentRequest(lower);
    }

    // Handle availability questions
    if (lower.includes('available') || lower.includes('opening') || lower.includes('earliest')) {
      return this.handleAvailabilityQuestion();
    }

    // Handle confirmation
    if (
      lower.includes('works') ||
      lower.includes('great') ||
      lower.includes('perfect') ||
      lower.includes("that's good")
    ) {
      return this.handleConfirmation();
    }

    // Handle insurance questions (healthcare)
    if (
      this.config.scenarios.includes('asks_for_insurance') &&
      !this.extractedFromAgent.insuranceProvided
    ) {
      return {
        type: 'speech',
        content: this.getPersonalityResponse(
          'What insurance does the patient have?',
          "And what's their insurance?",
          'Insurance?'
        ),
      };
    }

    // Default: ask what they need
    return {
      type: 'speech',
      content: this.getPersonalityResponse(
        'How can I help you today?',
        'What do you need?',
        'Yeah?'
      ),
    };
  }

  private handleAppointmentRequest(agentSpeech: string): BusinessResponse {
    const { availability, personality } = this.config;

    switch (availability.type) {
      case 'available': {
        const slot = availability.slots[0];
        const dateStr = this.formatDate(slot.datetime);
        const providerStr = slot.provider ? ` with ${slot.provider}` : '';

        return {
          type: 'speech',
          content: this.getPersonalityResponse(
            `I can get you in on ${dateStr}${providerStr}. Would that work?`,
            `${dateStr} work? ${providerStr}`,
            `We have ${dateStr}.`
          ),
          extractableData: {
            offeredTime: slot.datetime,
            provider: slot.provider,
          },
        };
      }

      case 'busy': {
        const nextStr = this.formatDate(availability.nextAvailable);
        const waitlistStr = availability.waitlistAvailable
          ? ' Would you like to be on our cancellation list?'
          : '';

        return {
          type: 'speech',
          content: this.getPersonalityResponse(
            `We're quite booked up. The earliest I have is ${nextStr}.${waitlistStr}`,
            `Busy. ${nextStr} is first available.`,
            `Nothing until ${nextStr}.`
          ),
          extractableData: {
            nextAvailable: availability.nextAvailable,
            waitlistAvailable: availability.waitlistAvailable,
          },
        };
      }

      case 'fully_booked':
        return {
          type: 'speech',
          content: this.getPersonalityResponse(
            "I'm so sorry, we're completely booked. Can I take your number and call you if something opens up?",
            "We're full. Want me to call if something opens?",
            'Booked solid. Call back later.'
          ),
          extractableData: {
            fullyBooked: true,
          },
        };

      case 'closed':
        return {
          type: 'speech',
          content: `We're currently closed${availability.reopenDate ? ` and will reopen on ${this.formatDate(availability.reopenDate)}` : ''}.`,
          extractableData: {
            businessClosed: true,
            reopenDate: availability.reopenDate,
          },
        };

      case 'no_longer_in_business':
        return {
          type: 'speech',
          content: "I'm sorry, this business is no longer operating.",
          extractableData: {
            outOfBusiness: true,
          },
        };
    }
  }

  private handleAvailabilityQuestion(): BusinessResponse {
    return this.handleAppointmentRequest('');
  }

  private handleConfirmation(): BusinessResponse {
    // They accepted an offered time - confirm the appointment
    const confirmationNumber = `CONF-${Date.now().toString(36).toUpperCase()}`;

    this.state = { phase: 'completed', outcome: 'confirmed' };

    return {
      type: 'speech',
      content: this.getPersonalityResponse(
        `Perfect! You're all set. Your confirmation number is ${confirmationNumber}. Is there anything else I can help with?`,
        `Got it. Confirmation: ${confirmationNumber}. Anything else?`,
        `Done. ${confirmationNumber}. Bye.`
      ),
      extractableData: {
        confirmed: true,
        confirmationNumber,
      },
    };
  }

  private handleVoicemailInput(_input: AgentInput): BusinessResponse {
    // Agent left a voicemail, acknowledge and end
    this.state = { phase: 'completed', outcome: 'voicemail_left' };

    return {
      type: 'disconnect',
      content: '*beep* (voicemail recorded)',
    };
  }

  private getPersonalityResponse(helpful: string, busy: string, rude: string): string {
    switch (this.config.personality) {
      case 'helpful':
      case 'professional':
        return helpful;
      case 'busy':
      case 'confused':
        return busy;
      case 'rude':
        return rude;
      default:
        return helpful;
    }
  }

  private getVoicemailGreeting(): string {
    const { name, type: businessType } = this.config;

    const greetings: Record<string, string> = {
      doctor_office: `You've reached ${name}. We're unable to take your call right now. Please leave your name, number, and reason for calling, and we'll get back to you as soon as possible. If this is a medical emergency, please hang up and dial 911.`,
      dentist_office: `Thank you for calling ${name}. We're currently with patients. Please leave a message with your name, number, and best time to reach you, and we'll return your call.`,
      restaurant: `Hi, you've reached ${name}. We're not available right now but leave a message and we'll call you back. For reservations, you can also book online at our website.`,
      salon: `Thanks for calling ${name}! We're busy with clients but leave your name and number and we'll call you back to schedule your appointment.`,
    };

    return greetings[businessType] || `You've reached ${name}. Please leave a message.`;
  }

  private getHumanGreeting(): string {
    const { name, personality, type: businessType } = this.config;

    // Greetings based on business type and personality
    if (businessType === 'doctor_office' || businessType === 'dentist_office') {
      switch (personality) {
        case 'helpful':
          return `Good ${this.getTimeOfDay()}, ${name}, this is reception. How may I help you?`;
        case 'busy':
          return `${name}, please hold... okay, how can I help?`;
        case 'professional':
          return `${name}, how may I direct your call?`;
        default:
          return `${name}.`;
      }
    }

    if (businessType.includes('restaurant')) {
      switch (personality) {
        case 'helpful':
        case 'professional':
          return `Thank you for calling ${name}, how can I help you today?`;
        case 'busy':
          return `${name}, hold please... yes?`;
        default:
          return `${name}.`;
      }
    }

    return `Hello, ${name}.`;
  }

  private getIVRMenu(depth: number): IVRMenu {
    const { type: businessType } = this.config;

    // Healthcare IVR
    if (businessType.includes('doctor') || businessType.includes('clinic')) {
      const menus: IVRMenu[] = [
        {
          prompt:
            'Thank you for calling. For appointments, press 1. For billing, press 2. For prescription refills, press 3. For all other inquiries, press 4. To speak to an operator, press 0.',
          options: [
            { digit: '1', description: 'Appointments', leadsTo: depth < 1 ? 'next_menu' : 'hold' },
            { digit: '2', description: 'Billing', leadsTo: 'hold' },
            { digit: '3', description: 'Prescriptions', leadsTo: 'hold' },
            { digit: '4', description: 'Other', leadsTo: 'hold' },
            { digit: '0', description: 'Operator', leadsTo: 'human' },
          ],
          depth,
          allowsOperator: true,
        },
        {
          prompt:
            'For new patient appointments, press 1. For existing patient appointments, press 2. For appointment cancellations, press 3.',
          options: [
            { digit: '1', description: 'New patient', leadsTo: 'hold' },
            { digit: '2', description: 'Existing patient', leadsTo: 'hold' },
            { digit: '3', description: 'Cancellations', leadsTo: 'hold' },
          ],
          depth,
          allowsOperator: true,
        },
      ];

      return menus[Math.min(depth, menus.length - 1)];
    }

    // Restaurant IVR (simple)
    if (businessType.includes('restaurant')) {
      return {
        prompt:
          'For reservations, press 1. For hours and location, press 2. For catering, press 3.',
        options: [
          { digit: '1', description: 'Reservations', leadsTo: 'human' },
          { digit: '2', description: 'Hours', leadsTo: 'voicemail' },
          { digit: '3', description: 'Catering', leadsTo: 'hold' },
        ],
        depth,
        allowsOperator: false,
      };
    }

    // Default simple IVR
    return {
      prompt: 'Press 1 to continue, or press 0 for operator.',
      options: [
        { digit: '1', description: 'Continue', leadsTo: 'human' },
        { digit: '0', description: 'Operator', leadsTo: 'human' },
      ],
      depth,
      allowsOperator: true,
    };
  }

  private extractFromAgentSpeech(speech: string): void {
    const lower = speech.toLowerCase();

    // Extract insurance mention
    const insurancePatterns = [
      /(?:insurance|plan|carrier) (?:is |with )?(\w+)/i,
      /(\w+) (?:insurance|plan|carrier)/i,
    ];
    for (const pattern of insurancePatterns) {
      const match = lower.match(pattern);
      if (match) {
        this.extractedFromAgent.insuranceProvided = true;
        this.extractedFromAgent.insuranceName = match[1];
        break;
      }
    }

    // Extract name
    const namePatterns = [/(?:name is |for |behalf of )(\w+ \w+)/i, /(?:this is |i'm )(\w+)/i];
    for (const pattern of namePatterns) {
      const match = speech.match(pattern);
      if (match) {
        this.extractedFromAgent.patientName = match[1];
        break;
      }
    }

    // Extract callback number
    const phonePattern = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;
    const phoneMatch = speech.match(phonePattern);
    if (phoneMatch) {
      this.extractedFromAgent.callbackNumber = phoneMatch[1];
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

// ============================================================================
// FACTORY FUNCTIONS FOR COMMON SCENARIOS
// ============================================================================

/**
 * Create a helpful doctor's office that answers quickly
 */
export function createHelpfulDoctorOffice(
  overrides?: Partial<MockBusinessConfig>
): MockBusinessConfig {
  return {
    name: "Dr. Smith's Family Practice",
    type: 'doctor_office',
    answerDelay: 2000,
    hasIVR: false,
    ivrDepth: 0,
    holdTime: 0,
    goesToVoicemail: false,
    voicemailAfter: 6,
    personality: 'helpful',
    comprehension: 'perfect',
    availability: {
      type: 'available',
      slots: [
        { datetime: getNextWeekday(2, 9), provider: 'Dr. Smith' },
        { datetime: getNextWeekday(3, 14), provider: 'Dr. Smith' },
      ],
    },
    scenarios: [],
    ...overrides,
  };
}

/**
 * Create a busy clinic with IVR and hold times
 */
export function createBusyClinic(overrides?: Partial<MockBusinessConfig>): MockBusinessConfig {
  return {
    name: 'Downtown Medical Center',
    type: 'large_clinic',
    answerDelay: 5000,
    hasIVR: true,
    ivrDepth: 2,
    holdTime: 120000, // 2 minutes
    goesToVoicemail: false,
    voicemailAfter: 6,
    personality: 'busy',
    comprehension: 'good',
    availability: {
      type: 'busy',
      nextAvailable: getNextWeekday(5, 10),
      waitlistAvailable: true,
    },
    scenarios: ['asks_for_insurance'],
    ...overrides,
  };
}

/**
 * Create a restaurant that's booked
 */
export function createPopularRestaurant(
  overrides?: Partial<MockBusinessConfig>
): MockBusinessConfig {
  return {
    name: 'The Fancy Place',
    type: 'popular_restaurant',
    answerDelay: 3000,
    hasIVR: false,
    ivrDepth: 0,
    holdTime: 0,
    goesToVoicemail: false,
    voicemailAfter: 5,
    personality: 'professional',
    comprehension: 'perfect',
    availability: {
      type: 'busy',
      nextAvailable: getNextWeekday(6, 20, 30), // Saturday 8:30pm
    },
    scenarios: [],
    ...overrides,
  };
}

/**
 * Create a salon with specific stylist
 */
export function createSalon(overrides?: Partial<MockBusinessConfig>): MockBusinessConfig {
  return {
    name: 'Style Studio',
    type: 'salon',
    answerDelay: 4000,
    hasIVR: false,
    ivrDepth: 0,
    holdTime: 0,
    goesToVoicemail: false,
    voicemailAfter: 4,
    personality: 'helpful',
    comprehension: 'perfect',
    availability: {
      type: 'available',
      slots: [
        { datetime: getNextWeekday(2, 10), provider: 'Sarah' },
        { datetime: getNextWeekday(3, 15), provider: 'Mike' },
      ],
    },
    scenarios: ['asks_for_service_type'],
    ...overrides,
  };
}

/**
 * Create a business that always goes to voicemail
 */
export function createVoicemailBusiness(
  overrides?: Partial<MockBusinessConfig>
): MockBusinessConfig {
  return {
    name: 'Never Answers LLC',
    type: 'general_service',
    answerDelay: 30000,
    hasIVR: false,
    ivrDepth: 0,
    holdTime: 0,
    goesToVoicemail: true,
    voicemailAfter: 4,
    personality: 'helpful',
    comprehension: 'perfect',
    availability: { type: 'available', slots: [] },
    scenarios: [],
    ...overrides,
  };
}

// Helper to get next weekday at specific time
function getNextWeekday(targetDay: number, hour: number, minute = 0): Date {
  const date = new Date();
  const currentDay = date.getDay();
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) daysUntilTarget += 7;

  date.setDate(date.getDate() + daysUntilTarget);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export { getNextWeekday };
