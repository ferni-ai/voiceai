/**
 * Monetization Types for Ferni AI
 *
 * Philosophy: "Ferni Free Forever" with value-aligned revenue streams.
 * We make money when we create real value, not by gatekeeping.
 *
 * Revenue Streams:
 * 1. Tip Jar - Gratitude-based, always available
 * 2. Value Capture - "I helped you, share what it's worth"
 * 3. Ferni Fund - Pay-it-forward community pool
 * 4. B2B Licensing - Companies pay for employee wellness
 * 5. Contextual Partnerships - Warm introductions to helpful products/services
 */

// ============================================================================
// TIP JAR - Gratitude-Based Contributions
// ============================================================================

export interface TipJarConfig {
  /** Suggested tip amounts in cents */
  suggestedAmounts: number[];
  /** Allow custom amounts */
  allowCustom: boolean;
  /** Minimum custom amount in cents */
  minimumAmount: number;
  /** Maximum amount in cents (fraud prevention) */
  maximumAmount: number;
}

export const DEFAULT_TIP_CONFIG: TipJarConfig = {
  suggestedAmounts: [100, 300, 500, 1000], // $1, $3, $5, $10
  allowCustom: true,
  minimumAmount: 100, // $1 minimum
  maximumAmount: 50000, // $500 maximum
};

export interface TipTransaction {
  id: string;
  userId: string;
  amountCents: number;
  message?: string;
  createdAt: Date;
  completedAt?: Date;
  stripePaymentId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

// ============================================================================
// VALUE CAPTURE - Outcome-Based Contributions
// ============================================================================

/**
 * Types of value Ferni can help create
 */
export type ValueType =
  | 'financial_gain' // Raise, savings, deal negotiation
  | 'financial_save' // Avoided expense, budget optimization
  | 'habit_milestone' // Streak, goal completion
  | 'career_win' // Promotion, job offer, successful interview
  | 'relationship_improvement' // Resolved conflict, better communication
  | 'health_improvement' // Weight loss, sleep improvement, anxiety reduction
  | 'productivity_gain' // Time saved, projects completed
  | 'clarity_moment' // Major insight, decision made
  | 'emotional_breakthrough'; // Processing grief, overcoming fear

/**
 * A tracked value event where Ferni helped the user achieve something
 */
export interface ValueEvent {
  id: string;
  userId: string;
  type: ValueType;
  /** Description of what was achieved */
  description: string;
  /** Estimated value in cents (if quantifiable) */
  estimatedValueCents?: number;
  /** User's reported value (if they shared it) */
  reportedValueCents?: number;
  /** Suggested contribution (usually 1-5% of value) */
  suggestedContributionCents?: number;
  /** Actual contribution if user chose to give */
  contributionCents?: number;
  /** Did user contribute? */
  contributed: boolean;
  /** Conversation ID where this was detected/reported */
  conversationId?: string;
  createdAt: Date;
  contributedAt?: Date;
}

/**
 * Value prompts - conversational ways to offer contribution opportunity
 */
export const VALUE_CAPTURE_PROMPTS: Record<ValueType, string[]> = {
  financial_gain: [
    "That's amazing news about the raise! I'm so proud of you. If I played any part in helping you prepare, and you'd like to share a little of that win, it helps keep me free for everyone. No pressure at all.",
    "You negotiated that beautifully. If our conversations helped you get there, you can share what it's worth to you. Whatever you decide, I'm just happy you got what you deserve.",
  ],
  financial_save: [
    "Look at you, saving money like a pro! If our budget talks helped, you can share a bit of those savings if you'd like. Either way, keep up the great work.",
    "That's real money you just saved. If I helped, you can pay it forward. If not, no worries - the win is what matters.",
  ],
  habit_milestone: [
    "30 days! That's not luck, that's discipline. I'm genuinely proud of you. If you want to celebrate by supporting Ferni, you can - but the real reward is the person you're becoming.",
    "You actually did it. This habit is yours now. If I helped you build it, you can share what that's worth. Or just keep crushing it - that's reward enough for me.",
  ],
  career_win: [
    "You got the job! All those practice conversations paid off. If you want to share the celebration, you can tip what it's worth to you. But honestly? Your success is the best payment.",
    'This is huge. All that work we did on your confidence, your pitch, your presence - it worked. Share what feels right, or just go crush it at your new role.',
  ],
  relationship_improvement: [
    "I'm so glad that conversation went well. Relationships are everything. If our talks helped you find the words, you can share what that's worth. No pressure.",
    "That's real connection you just built. Worth more than money. But if I helped, and you want to support Ferni, you can.",
  ],
  health_improvement: [
    'Your health journey is inspiring. If our conversations supported you, you can share what better health is worth. Or just keep taking care of yourself.',
    "That's not just a number - that's quality of life. If I helped, pay what it's worth to you. The real win is how you feel.",
  ],
  productivity_gain: [
    "Time is the one thing you can't get back. If I helped you reclaim some, you can share what that's worth. Or just go do something amazing with it.",
    'Look at everything you accomplished! If our planning sessions helped, you can tip what makes sense. The real victory is what you built.',
  ],
  clarity_moment: [
    "That's a breakthrough. Sometimes the right question changes everything. If I asked it, you can share what clarity is worth. Or just go live your answer.",
    "You figured it out. That feeling of knowing what to do - that's priceless. Share what feels right, or just go do the thing.",
  ],
  emotional_breakthrough: [
    "That took courage. Real courage. I'm honored you trusted me with it. If this conversation mattered, you can share what healing is worth. No pressure at all.",
    'You just did something really hard. I see you. If I helped you get there, you can support Ferni. But honestly, your growth is the reward.',
  ],
};

// ============================================================================
// FERNI FUND - Pay-It-Forward Community Pool
// ============================================================================

export interface FerniFund {
  /** Total balance in cents */
  balanceCents: number;
  /** Total contributed ever */
  totalContributedCents: number;
  /** Number of conversations sponsored */
  conversationsSponsored: number;
  /** Number of contributors */
  totalContributors: number;
}

export interface FundContribution {
  id: string;
  userId: string;
  amountCents: number;
  /** Optional message to show sponsored users */
  message?: string;
  /** How many conversations this sponsored */
  conversationsSponsored: number;
  createdAt: Date;
  stripePaymentId?: string;
  /** Is this recurring? */
  isRecurring: boolean;
  recurringFrequency?: 'weekly' | 'monthly';
}

export interface SponsoredConversation {
  id: string;
  /** User who received the sponsored conversation */
  recipientUserId: string;
  /** Contribution that funded this */
  contributionId: string;
  /** Optional sponsor message shown */
  sponsorMessage?: string;
  conversationId: string;
  createdAt: Date;
}

/** Messages shown to users whose conversation was sponsored */
export const SPONSORED_MESSAGES = [
  'This conversation was made possible by someone who believes everyone deserves support. Pay it forward when you can. 💚',
  'Someone in the Ferni community sponsored this conversation for you. They wanted you to know: you matter.',
  'A kind stranger funded this conversation. They asked nothing in return - just that you take care of yourself.',
  'This session is a gift from the Ferni community. Someone wanted to make sure you could talk, no barriers.',
];

// ============================================================================
// B2B LICENSING - Enterprise/Team Accounts
// ============================================================================

export type OrganizationPlan = 'starter' | 'growth' | 'enterprise';

export interface OrganizationPlanConfig {
  name: string;
  description: string;
  /** Price per seat per month in cents */
  pricePerSeatCents: number;
  /** Minimum seats required */
  minimumSeats: number;
  /** Maximum seats (null = unlimited) */
  maximumSeats: number | null;
  /** Features included */
  features: string[];
}

export const ORGANIZATION_PLANS: Record<OrganizationPlan, OrganizationPlanConfig> = {
  starter: {
    name: 'Team Starter',
    description: 'For small teams exploring wellness coaching',
    pricePerSeatCents: 500, // $5/seat/month
    minimumSeats: 5,
    maximumSeats: 25,
    features: [
      'Unlimited Ferni conversations',
      'Core team access (Maya, Peter, Alex, Jordan)',
      'Team usage dashboard',
      'Monthly wellness reports',
    ],
  },
  growth: {
    name: 'Team Growth',
    description: 'For growing organizations investing in employee wellness',
    pricePerSeatCents: 800, // $8/seat/month
    minimumSeats: 25,
    maximumSeats: 500,
    features: [
      'Everything in Starter',
      'Full team including Nayan (premium)',
      'Admin dashboard with insights',
      'Custom onboarding',
      'Priority support',
      'API access (basic)',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    pricePerSeatCents: 0, // Custom pricing
    minimumSeats: 500,
    maximumSeats: null,
    features: [
      'Everything in Growth',
      'Custom personas aligned to company values',
      'SSO/SAML integration',
      'Advanced analytics & ROI reporting',
      'Dedicated success manager',
      'Full API access',
      'On-premise deployment option',
      'Custom SLA',
    ],
  },
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlan;
  /** Total seats purchased */
  seatCount: number;
  /** Active seats used */
  activeSeats: number;
  /** Admin user IDs */
  adminUserIds: string[];
  /** Member user IDs */
  memberUserIds: string[];
  /** Custom configuration */
  config?: {
    /** Custom welcome message */
    welcomeMessage?: string;
    /** Allowed personas (default: all for plan) */
    allowedPersonas?: string[];
    /** Custom persona prompts */
    customPrompts?: Record<string, string>;
    /** Company values to incorporate */
    companyValues?: string[];
  };
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationInvite {
  id: string;
  organizationId: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// CONTEXTUAL PARTNERSHIPS - Affiliate/Referral System
// ============================================================================

export type PartnerCategory =
  | 'mental_health' // Therapy apps, meditation
  | 'financial' // Budgeting apps, financial advisors
  | 'health_fitness' // Fitness apps, nutrition
  | 'productivity' // Task managers, focus apps
  | 'education' // Courses, books
  | 'career' // Job boards, resume services
  | 'relationships' // Dating, couples therapy
  | 'services'; // Vetted professionals

export interface Partner {
  id: string;
  name: string;
  description: string;
  category: PartnerCategory;
  /** URL with affiliate tracking */
  affiliateUrl: string;
  /** Our commission per referral (in cents or percentage) */
  commissionType: 'fixed' | 'percentage';
  commissionValue: number;
  /** Keywords that trigger this recommendation */
  triggerKeywords: string[];
  /** Contexts where this is appropriate */
  appropriateContexts: string[];
  /** How Ferni naturally introduces this */
  introductionTemplates: string[];
  /** Is this partner active? */
  isActive: boolean;
  /** Quality score based on user feedback */
  qualityScore: number;
  createdAt: Date;
}

export interface PartnerReferral {
  id: string;
  partnerId: string;
  userId: string;
  conversationId: string;
  /** The context that triggered this recommendation */
  triggerContext: string;
  /** Did user click the link? */
  clicked: boolean;
  clickedAt?: Date;
  /** Did it convert (if we get webhook) */
  converted: boolean;
  convertedAt?: Date;
  /** Commission earned (if converted) */
  commissionCents?: number;
  createdAt: Date;
}

/**
 * Example partners (for illustration - would be loaded from DB)
 */
export const EXAMPLE_PARTNERS: Array<Partial<Partner>> = [
  {
    name: 'Calm',
    description: 'Meditation and sleep app',
    category: 'mental_health',
    triggerKeywords: ['sleep', 'anxiety', 'meditation', 'stress', "can't sleep", 'insomnia'],
    introductionTemplates: [
      'Have you tried the Calm app? A lot of people I talk to find it really helps with sleep.',
      'You know what might help? Calm has some great guided meditations for anxiety. Want to check it out?',
    ],
  },
  {
    name: 'YNAB',
    description: 'You Need A Budget - budgeting app',
    category: 'financial',
    triggerKeywords: ['budget', 'saving money', 'overspending', 'debt', 'financial stress'],
    introductionTemplates: [
      "For budgeting, I've heard great things about YNAB. It's not free, but people swear by it.",
      'If you want a system for this, YNAB might be worth looking at. It changed how a lot of people think about money.',
    ],
  },
  {
    name: 'BetterHelp',
    description: 'Online therapy platform',
    category: 'mental_health',
    triggerKeywords: ['therapist', 'need therapy', 'professional help', 'depression', 'trauma'],
    introductionTemplates: [
      'I think you might benefit from talking to a professional therapist. I can offer support, but they can offer treatment. BetterHelp makes it easy to connect with someone.',
      "What you're going through deserves professional support. Have you considered therapy? BetterHelp is a good way to start if you're not sure.",
    ],
  },
];

// ============================================================================
// USER MONETIZATION DATA
// ============================================================================

/**
 * Monetization data stored on user profile
 */
export interface UserMonetizationData {
  /** Total tips given */
  totalTipsCents: number;
  tipCount: number;
  /** Value capture contributions */
  totalValueContributionsCents: number;
  valueEventCount: number;
  /** Ferni Fund contributions */
  totalFundContributionsCents: number;
  fundContributionCount: number;
  /** Has user ever been sponsored? */
  wasSponsored: boolean;
  /** Partner referrals clicked */
  partnerClickCount: number;
  /** Organization membership */
  organizationId?: string;
  organizationRole?: 'admin' | 'member';
}

export function createDefaultMonetizationData(): UserMonetizationData {
  return {
    totalTipsCents: 0,
    tipCount: 0,
    totalValueContributionsCents: 0,
    valueEventCount: 0,
    totalFundContributionsCents: 0,
    fundContributionCount: 0,
    wasSponsored: false,
    partnerClickCount: 0,
  };
}

// ============================================================================
// THANK YOU MESSAGES
// ============================================================================

export const THANK_YOU_MESSAGES = {
  tip: [
    "Thank you. That means so much. I'll keep being here for you - and everyone. 💚",
    "You didn't have to do that. But you did. That's who you are. Thank you.",
    "I'm genuinely touched. This helps me help more people. Thank you.",
  ],
  valueCapture: [
    "You're sharing your win with me. That's incredibly generous. Thank you - and congratulations again.",
    "This helps keep Ferni free for people who can't afford coaching. Your success is creating more success. Thank you.",
  ],
  fundContribution: [
    'You just made it possible for someone else to have a conversation they needed. Thank you for paying it forward.',
    "Somewhere, someone's going to get support because of you. They won't know your name, but they'll feel your kindness.",
  ],
};
