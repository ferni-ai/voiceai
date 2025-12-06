/**
 * Communication Coaching Tools
 *
 * Tools to help users with communication challenges:
 * - Draft difficult messages with proper frameworks
 * - Practice conversations with role-play scenarios
 * - Get feedback on existing communications
 * - Navigate workplace relationships
 * - Build assertive communication skills
 *
 * NOTE: For new code, use `tools/domains/communication/index.ts` instead.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type ConversationType =
  | 'asking_for_raise'
  | 'asking_for_promotion'
  | 'giving_feedback'
  | 'receiving_feedback'
  | 'declining_request'
  | 'setting_boundary'
  | 'following_up'
  | 'delivering_bad_news'
  | 'resolving_conflict'
  | 'negotiating_deadline'
  | 'addressing_issue'
  | 'building_relationship'
  | 'other';

type Tone = 'formal' | 'professional' | 'friendly' | 'direct' | 'diplomatic' | 'warm';

type MessageFormat = 'email' | 'text' | 'slack' | 'talking_points' | 'script';

interface CoachingSession {
  id: string;
  userId: string;
  conversationType: ConversationType;
  context: string;
  drafts: string[];
  feedback: string[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory session storage
const coachingSessions = new Map<string, CoachingSession>();

// ============================================================================
// COMMUNICATION FRAMEWORKS
// ============================================================================

/**
 * Apply the SBI (Situation-Behavior-Impact) framework for feedback
 */
function applySBIFramework(params: {
  situation: string;
  behavior: string;
  impact: string;
  isPositive: boolean;
}): string {
  const { situation, behavior, impact, isPositive } = params;

  if (isPositive) {
    return `In ${situation}, when you ${behavior}, it ${impact}. I wanted you to know how much that meant.`;
  } else {
    return `I wanted to share something with you. ${situation}, ${behavior}. The impact is that ${impact}. I'm sharing this because I value our working relationship and want us to be successful together.`;
  }
}

/**
 * Apply the Three-Part Assertion framework
 */
function applyAssertionFramework(params: {
  acknowledgment: string;
  statement: string;
  invitation: string;
}): string {
  return `${params.acknowledgment} ${params.statement} ${params.invitation}`;
}

/**
 * Generate follow-up message based on attempt number
 */
function generateFollowUp(params: {
  context: string;
  attemptNumber: number;
  originalRequest: string;
}): string {
  const { context, attemptNumber, originalRequest } = params;

  switch (attemptNumber) {
    case 1:
      return `Hi! Wanted to make sure this didn't get buried. ${originalRequest} Let me know if you need anything from me to move forward.`;
    case 2:
      return `Circling back on this. Is there a better time to discuss, or anything I can clarify?`;
    case 3:
      return `I know things get busy. I'll assume the timing isn't right now—feel free to reach out when it works better. Happy to help whenever.`;
    default:
      return `Following up on ${context}. Would love to find a time to connect on this.`;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createCommunicationCoachingTools() {
  return {
    // ========== DRAFT DIFFICULT MESSAGE ==========

    draftDifficultMessage: llm.tool({
      description: `Help draft a difficult or sensitive message.
Use when the user needs help with:
- Asking for a raise or promotion
- Giving or receiving feedback
- Declining a request gracefully
- Setting a boundary
- Delivering bad news
- Addressing a conflict
- Any message they're nervous to send

Alex will apply communication frameworks (SBI, assertion, etc.) to help craft the message.`,
      parameters: z.object({
        conversationType: z
          .enum([
            'asking_for_raise',
            'asking_for_promotion',
            'giving_feedback',
            'receiving_feedback',
            'declining_request',
            'setting_boundary',
            'following_up',
            'delivering_bad_news',
            'resolving_conflict',
            'negotiating_deadline',
            'addressing_issue',
            'building_relationship',
            'other',
          ])
          .describe('Type of difficult conversation'),
        recipient: z.string().describe('Who this message is for (name and role)'),
        context: z.string().describe('Background situation - what led to this?'),
        keyPoints: z.string().describe('Main things you want to communicate'),
        desiredOutcome: z.string().describe('What outcome are you hoping for?'),
        format: z
          .enum(['email', 'text', 'slack', 'talking_points', 'script'])
          .default('email')
          .describe('Format of the message'),
        tone: z
          .enum(['formal', 'professional', 'friendly', 'direct', 'diplomatic', 'warm'])
          .default('professional')
          .describe('Desired tone'),
      }),
      execute: async ({
        conversationType,
        recipient,
        context,
        keyPoints,
        desiredOutcome,
        format,
        tone,
      }) => {
        getLogger().info(
          { conversationType, recipient, format },
          '💬 Alex: Coaching on difficult message'
        );

        // Build the draft based on conversation type
        let draft = '';
        let coachingNote = '';

        switch (conversationType) {
          case 'asking_for_raise':
            draft = generateRaiseRequest({ recipient, context, keyPoints, tone });
            coachingNote =
              "Key moves here: Lead with value you've delivered, cite specific accomplishments, give a concrete number (not a range), and end with an invitation for dialogue. Don't apologize for asking—you're making a business case.";
            break;

          case 'asking_for_promotion':
            draft = generatePromotionRequest({ recipient, context, keyPoints, tone });
            coachingNote =
              "Notice I'm framing this as 'already doing the work at that level' rather than 'I want a title.' Asking 'what would you need to see?' puts them in advisor mode instead of gatekeeper mode.";
            break;

          case 'giving_feedback':
            draft = generateFeedbackMessage({ recipient, context, keyPoints, tone, format });
            coachingNote =
              'Using the SBI framework here: Situation, Behavior, Impact. Facts over feelings. Specific over vague. The goal is information, not accusation.';
            break;

          case 'declining_request':
            draft = generateDecline({ recipient, context, keyPoints, tone, format });
            coachingNote =
              "Key: 'I can\\'t' is stronger than 'I don\\'t think I can.' Brief explanation, no over-justifying. Offering an alternative shows you're still invested in the outcome.";
            break;

          case 'setting_boundary':
            draft = generateBoundary({ recipient, context, keyPoints, tone, format });
            coachingNote =
              "Using the Three-Part Assertion: Acknowledge their perspective, state your boundary clearly, invite a path forward. You're not fighting them—you're partnering with them.";
            break;

          case 'delivering_bad_news':
            draft = generateBadNews({ recipient, context, keyPoints, tone, format });
            coachingNote =
              "Lead with the news—don't bury it. Brief explanation, take responsibility where appropriate, propose solution, offer to discuss. No long preambles.";
            break;

          case 'resolving_conflict':
            draft = generateConflictResolution({ recipient, context, keyPoints, tone, format });
            coachingNote =
              "The STAR approach: acknowledge their perspective first, share yours without accusation, focus on moving forward. It's not about winning—it's about the relationship.";
            break;

          case 'following_up':
            draft = generateFollowUpMessage({ recipient, context, keyPoints, tone, format });
            coachingNote =
              'Persistent without pushy. Each follow-up adds value or context. The third follow-up includes a graceful exit—releases pressure while leaving door open.';
            break;

          case 'negotiating_deadline':
            draft = generateDeadlineNegotiation({ recipient, context, keyPoints, tone, format });
            coachingNote =
              "Acknowledge the deadline matters, be clear about what IS possible, offer alternatives. You're problem-solving together, not making excuses.";
            break;

          default:
            draft = generateGenericDifficult({
              recipient,
              context,
              keyPoints,
              desiredOutcome,
              tone,
              format,
            });
            coachingNote =
              'General principle: clarity is kindness. Say what you mean, leave room for them to respond, and focus on the relationship, not just this moment.';
        }

        // Format the output
        let response = `📝 **Draft for ${recipient}** (${format})\n\n`;
        response += '---\n';
        response += draft;
        response += '\n---\n\n';
        response += `💡 **Coaching Note:**\n${coachingNote}\n\n`;
        response += `**Questions to consider:**\n`;
        response += `- Does this say what you actually mean?\n`;
        response += `- How might they receive this?\n`;
        response += `- Is there anything you'd want to soften or strengthen?\n\n`;
        response += `Want me to adjust anything?`;

        return response;
      },
    }),

    // ========== PRACTICE CONVERSATION ==========

    practiceConversation: llm.tool({
      description: `Role-play a difficult conversation to prepare the user.
Alex will play the other person and help the user practice their responses.
Use when:
- User is nervous about an upcoming conversation
- User wants to rehearse before a meeting
- User needs to build confidence
- User wants to anticipate objections`,
      parameters: z.object({
        scenario: z.string().describe('What conversation are we practicing?'),
        otherPerson: z.string().describe("Who is Alex playing? (name, role, what they're like)"),
        userGoal: z.string().describe('What does the user want to achieve?'),
        anticipatedChallenges: z
          .string()
          .optional()
          .describe('What objections or pushback to expect'),
      }),
      execute: async ({ scenario, otherPerson, userGoal, anticipatedChallenges }) => {
        getLogger().info({ scenario, otherPerson }, '🎭 Alex: Starting role-play practice');

        let response = `🎭 **Practice Session: ${scenario}**\n\n`;
        response += `I'll play ${otherPerson}. Your goal is: ${userGoal}\n\n`;

        if (anticipatedChallenges) {
          response += `I'll include realistic pushback around: ${anticipatedChallenges}\n\n`;
        }

        response += `**Ground Rules:**\n`;
        response += `- I'll respond like ${otherPerson} might actually respond\n`;
        response += `- After we practice, I'll give you feedback\n`;
        response += `- We can try different approaches\n\n`;
        response += `**Ready?** Start the conversation whenever you are. Just talk to me like you'd talk to ${otherPerson}.`;

        return response;
      },
    }),

    // ========== GIVE FEEDBACK ON MESSAGE ==========

    reviewMessage: llm.tool({
      description: `Review a message the user has drafted and give feedback.
Use when:
- User has written something and wants a second opinion
- User isn't sure about tone
- User wants to make sure it lands well
- User is second-guessing themselves

Alex will analyze clarity, tone, structure, and likely reception.`,
      parameters: z.object({
        message: z.string().describe('The draft message to review'),
        context: z.string().describe('Background: who is this to, what is the situation'),
        concern: z.string().optional().describe('Specific concern or question about the message'),
      }),
      execute: async ({ message, context, concern }) => {
        getLogger().info({ messageLength: message.length }, '📋 Alex: Reviewing message');

        // Analyze the message
        const analysis = analyzeMessage(message);

        let response = `📋 **Message Review**\n\n`;
        response += `**Context:** ${context}\n\n`;

        // Strengths
        response += `**What's Working:**\n`;
        for (const strength of analysis.strengths) {
          response += `✅ ${strength}\n`;
        }
        response += '\n';

        // Suggestions
        if (analysis.suggestions.length > 0) {
          response += `**Suggestions:**\n`;
          for (const suggestion of analysis.suggestions) {
            response += `💡 ${suggestion}\n`;
          }
          response += '\n';
        }

        // Tone check
        response += `**Tone:** ${analysis.tone}\n`;
        response += `**Clarity:** ${analysis.clarity}/10\n`;
        response += `**Likely reception:** ${analysis.reception}\n\n`;

        // Address specific concern if provided
        if (concern) {
          response += `**Your concern (${concern}):**\n`;
          response += `${addressConcern(message, concern)}\n\n`;
        }

        // Offer rewrite
        response += `Want me to suggest a revision, or does this feel good to send?`;

        return response;
      },
    }),

    // ========== COMMUNICATION STRATEGY ==========

    planCommunicationStrategy: llm.tool({
      description: `Help plan a communication strategy for a complex situation.
Use when:
- User has multiple stakeholders to manage
- User needs to sequence communications carefully
- User is managing a sensitive situation over time
- User wants to think through all angles`,
      parameters: z.object({
        situation: z.string().describe('What is the overall situation?'),
        stakeholders: z.string().describe('Who are the key people involved?'),
        goal: z.string().describe('What is the ultimate outcome you want?'),
        constraints: z
          .string()
          .optional()
          .describe('Any timing, political, or relationship constraints?'),
        timeline: z.string().optional().describe('When does this need to happen?'),
      }),
      execute: async ({ situation, stakeholders, goal, constraints, timeline }) => {
        getLogger().info({ situation }, '🎯 Alex: Planning communication strategy');

        let response = `🎯 **Communication Strategy**\n\n`;
        response += `**Situation:** ${situation}\n`;
        response += `**Goal:** ${goal}\n`;
        if (timeline) response += `**Timeline:** ${timeline}\n`;
        response += `\n`;

        response += `**Stakeholder Analysis:**\n`;
        response += `Let's think through each person:\n`;
        response += `- Who needs to know what, and when?\n`;
        response += `- Who might resist, and why?\n`;
        response += `- Who are your allies?\n\n`;

        response += `**Recommended Sequence:**\n`;
        response += `1. **First:** Have the most important/sensitive conversation first (usually the person most affected)\n`;
        response += `2. **Then:** Inform key stakeholders before broader communication\n`;
        response += `3. **Finally:** Broader communication if needed\n\n`;

        if (constraints) {
          response += `**Navigating Constraints:**\n`;
          response += `Given: ${constraints}\n`;
          response += `Consider: timing each conversation to minimize risk and maximize buy-in.\n\n`;
        }

        response += `**Key Messages to Prepare:**\n`;
        response += `- The main message (same core message for everyone)\n`;
        response += `- Tailored framing for each stakeholder\n`;
        response += `- Anticipated questions and your responses\n\n`;

        response += `Want me to help draft specific communications for any of these stakeholders?`;

        return response;
      },
    }),

    // ========== QUICK TONE CHECK ==========

    checkTone: llm.tool({
      description: `Quick tone check on a short message.
Use when user wants a fast sanity check before sending.`,
      parameters: z.object({
        message: z.string().describe('The message to check'),
        intendedTone: z.string().describe('What tone are you going for?'),
      }),
      execute: async ({ message, intendedTone }) => {
        const actualTone = detectTone(message);
        const match = actualTone.toLowerCase().includes(intendedTone.toLowerCase());

        if (match) {
          return `✅ Tone check passed! This reads as ${actualTone}, which matches your intent. Good to send.`;
        } else {
          return `⚠️ Heads up: You're going for "${intendedTone}" but this reads more "${actualTone}". Want me to suggest adjustments?`;
        }
      },
    }),

    // ========== TRANSFORM TONE ==========

    transformTone: llm.tool({
      description: `Rewrite a message with a different tone.
Use when:
- User wrote something too harsh/soft
- User needs to formalize or casualize
- User wants to see different versions`,
      parameters: z.object({
        message: z.string().describe('The original message'),
        currentTone: z.string().describe('How it currently reads'),
        targetTone: z
          .enum(['more_direct', 'softer', 'more_formal', 'more_casual', 'warmer', 'more_assertive'])
          .describe('How to transform it'),
      }),
      execute: async ({ message, currentTone, targetTone }) => {
        const transformed = transformMessage(message, targetTone);

        let response = `✨ **Tone Transformation**\n\n`;
        response += `**Original** (${currentTone}):\n"${message}"\n\n`;
        response += `**Transformed** (${targetTone}):\n"${transformed}"\n\n`;
        response += `Better? Want to adjust further?`;

        return response;
      },
    }),

    // ========== ASSERTIVENESS COACHING ==========

    buildAssertiveResponse: llm.tool({
      description: `Help user respond more assertively to a situation.
Use when:
- User is being pushed around
- User doesn't know how to say no
- User is avoiding a necessary conversation
- User is being too passive`,
      parameters: z.object({
        situation: z.string().describe('What is happening?'),
        currentResponse: z
          .string()
          .optional()
          .describe('How user is currently handling it (or planning to)'),
        whatUserWants: z.string().describe('What does user actually want/need?'),
        fear: z
          .string()
          .optional()
          .describe("What is user afraid will happen if they're assertive?"),
      }),
      execute: async ({ situation, currentResponse, whatUserWants, fear }) => {
        let response = `💪 **Building Assertiveness**\n\n`;
        response += `**Situation:** ${situation}\n`;
        response += `**What you want:** ${whatUserWants}\n\n`;

        if (fear) {
          response += `**Your fear:** ${fear}\n`;
          response += `**Reality check:** ${addressFear(fear)}\n\n`;
        }

        response += `**Assertive Response Framework:**\n\n`;

        // Generate assertive response using Three-Part Assertion
        response += `1. **Acknowledge** their perspective (shows you hear them)\n`;
        response += `2. **State** what you need (clear, not apologetic)\n`;
        response += `3. **Invite** a path forward (collaborative, not confrontational)\n\n`;

        const assertiveScript = generateAssertiveScript(situation, whatUserWants);
        response += `**Try saying:**\n"${assertiveScript}"\n\n`;

        if (currentResponse) {
          response += `**Comparison:**\n`;
          response += `Your current approach: "${currentResponse}"\n`;
          response += `More assertive version: "${assertiveScript}"\n\n`;
        }

        response += `**Remember:** Being assertive isn't about being aggressive. It's about being clear. Clarity is kindness—to them AND to you.\n\n`;
        response += `Want to practice this, or adjust the wording?`;

        return response;
      },
    }),

    // ========== FOLLOW-UP STRATEGY ==========

    planFollowUp: llm.tool({
      description: `Plan a follow-up strategy for something that's stalled.
Use when:
- User sent something and got no response
- User needs to persist without being annoying
- User doesn't know when/how to follow up`,
      parameters: z.object({
        originalRequest: z.string().describe('What was the original request/message about?'),
        recipient: z.string().describe('Who are you following up with?'),
        daysSinceOriginal: z.number().describe('How many days since original message?'),
        previousFollowUps: z.number().default(0).describe('How many times have you followed up?'),
        urgency: z
          .enum(['low', 'medium', 'high'])
          .default('medium')
          .describe('How urgent is this?'),
      }),
      execute: async ({
        originalRequest,
        recipient,
        daysSinceOriginal,
        previousFollowUps,
        urgency,
      }) => {
        let response = `📬 **Follow-Up Strategy**\n\n`;
        response += `**Original request:** ${originalRequest}\n`;
        response += `**To:** ${recipient}\n`;
        response += `**Days elapsed:** ${daysSinceOriginal}\n`;
        response += `**Previous follow-ups:** ${previousFollowUps}\n\n`;

        // Generate recommendation
        const recommendation = generateFollowUpStrategy(
          daysSinceOriginal,
          previousFollowUps,
          urgency
        );

        response += `**Recommendation:** ${recommendation.action}\n\n`;
        response += `**Suggested message:**\n"${recommendation.script}"\n\n`;
        response += `**Timing:** ${recommendation.timing}\n\n`;
        response += `**Pro tip:** ${recommendation.tip}\n\n`;
        response += `Want me to draft something different?`;

        return response;
      },
    }),

    // ========== ANALYZE INCOMING MESSAGE ==========

    analyzeIncomingMessage: llm.tool({
      description: `Analyze an email or message someone sent to the user and help craft a response.
Use when:
- User received a message and isn't sure how to respond
- User wants help understanding the tone/intent of a message
- User needs to respond to something tricky
- User asks "how should I respond to this?"`,
      parameters: z.object({
        incomingMessage: z.string().describe('The message they received'),
        sender: z.string().describe('Who sent it (name, relationship, role)'),
        userContext: z.string().optional().describe("Any context about the user's situation"),
        userGoal: z
          .string()
          .optional()
          .describe('What outcome does user want from their response?'),
      }),
      execute: async ({ incomingMessage, sender, userContext, userGoal }) => {
        getLogger().info(
          { sender, messageLength: incomingMessage.length },
          '📨 Alex: Analyzing incoming message'
        );

        // Analyze the incoming message
        const analysis = analyzeIncomingContent(incomingMessage);

        let response = `📨 **Message Analysis**\n\n`;
        response += `**From:** ${sender}\n\n`;

        // Tone analysis
        response += `**Their tone:** ${analysis.senderTone}\n`;
        response += `**Likely intent:** ${analysis.likelyIntent}\n`;
        response += `**Urgency level:** ${analysis.urgency}\n\n`;

        // Key points
        response += `**What they're asking for:**\n`;
        for (const point of analysis.keyPoints) {
          response += `• ${point}\n`;
        }
        response += '\n';

        // Subtext if any
        if (analysis.subtext) {
          response += `**Reading between the lines:** ${analysis.subtext}\n\n`;
        }

        // Response recommendations
        response += `**Recommended response approach:**\n`;
        response += `• Tone: ${analysis.recommendedResponseTone}\n`;
        response += `• Priority: ${analysis.responsePriority}\n`;
        response += `• Key things to address: ${analysis.mustAddress.join(', ')}\n\n`;

        // Draft response
        const draftResponse = generateResponseToMessage(
          incomingMessage,
          sender,
          userGoal || 'address their request professionally',
          analysis
        );
        response += `**Draft Response:**\n---\n${draftResponse}\n---\n\n`;

        response += `Does this capture what you want to say? I can adjust the tone or approach.`;

        return response;
      },
    }),

    // ========== COMMUNICATION PATTERN ANALYSIS ==========

    analyzeCommPattern: llm.tool({
      description: `Analyze a user's communication patterns and give coaching feedback.
Use when:
- User wants to understand their communication style
- User has ongoing issues with how messages are received
- User wants to improve their overall communication`,
      parameters: z.object({
        sampleMessages: z
          .string()
          .describe('Examples of messages the user has sent (paste multiple)'),
        context: z
          .string()
          .describe(
            'What kind of communications are these? Work, personal, specific relationship?'
          ),
        challenge: z.string().describe('What communication challenge are they experiencing?'),
      }),
      execute: async ({ sampleMessages, context, challenge }) => {
        getLogger().info({ context }, '🔍 Alex: Analyzing communication patterns');

        const patterns = analyzePatterns(sampleMessages);

        let response = `🔍 **Communication Pattern Analysis**\n\n`;
        response += `**Context:** ${context}\n`;
        response += `**Your challenge:** ${challenge}\n\n`;

        response += `**Patterns I noticed:**\n`;
        for (const pattern of patterns.observed) {
          response += `• ${pattern}\n`;
        }
        response += '\n';

        if (patterns.strengths.length > 0) {
          response += `**Your strengths:**\n`;
          for (const strength of patterns.strengths) {
            response += `✅ ${strength}\n`;
          }
          response += '\n';
        }

        if (patterns.growthAreas.length > 0) {
          response += `**Growth opportunities:**\n`;
          for (const area of patterns.growthAreas) {
            response += `🎯 ${area}\n`;
          }
          response += '\n';
        }

        response += `**Specific recommendations:**\n`;
        for (const rec of patterns.recommendations) {
          response += `1. ${rec}\n`;
        }
        response += '\n';

        response += `**Coaching exercise:** ${patterns.exercise}\n\n`;
        response += `Want to work on any of these areas specifically?`;

        return response;
      },
    }),
  };
}

// ============================================================================
// ADDITIONAL HELPER FUNCTIONS
// ============================================================================

function analyzeIncomingContent(message: string): {
  senderTone: string;
  likelyIntent: string;
  urgency: string;
  keyPoints: string[];
  subtext: string | null;
  recommendedResponseTone: string;
  responsePriority: string;
  mustAddress: string[];
} {
  const lower = message.toLowerCase();
  const keyPoints: string[] = [];
  const mustAddress: string[] = [];

  // Detect tone
  let senderTone = 'Neutral/Professional';
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('immediately')) {
    senderTone = 'Urgent/Pressing';
  } else if (
    lower.includes('disappointed') ||
    lower.includes('concerned') ||
    lower.includes('frustrated')
  ) {
    senderTone = 'Concerned/Frustrated';
  } else if (
    lower.includes('thank') ||
    lower.includes('appreciate') ||
    lower.includes('grateful')
  ) {
    senderTone = 'Appreciative/Warm';
  } else if (
    lower.includes('!') &&
    (lower.includes('great') || lower.includes('excited') || lower.includes('love'))
  ) {
    senderTone = 'Enthusiastic/Positive';
  } else if (
    lower.includes('unfortunately') ||
    lower.includes('regret') ||
    lower.includes('unable')
  ) {
    senderTone = 'Apologetic/Delivering bad news';
  }

  // Detect intent
  let likelyIntent = 'Information sharing';
  if (
    lower.includes('?') ||
    lower.includes('could you') ||
    lower.includes('can you') ||
    lower.includes('would you')
  ) {
    likelyIntent = 'Request/Asking for something';
    mustAddress.push('Their request');
  }
  if (lower.includes('let me know') || lower.includes('thoughts') || lower.includes('feedback')) {
    likelyIntent = 'Seeking input/feedback';
    mustAddress.push('Provide your perspective');
  }
  if (
    lower.includes('following up') ||
    lower.includes('checking in') ||
    lower.includes('any update')
  ) {
    likelyIntent = 'Following up on something';
    mustAddress.push('Status update');
  }
  if (lower.includes('concern') || lower.includes('issue') || lower.includes('problem')) {
    likelyIntent = 'Raising a concern';
    mustAddress.push('Acknowledge the concern');
  }

  // Detect urgency
  let urgency = 'Normal';
  if (
    lower.includes('urgent') ||
    lower.includes('asap') ||
    lower.includes('today') ||
    lower.includes('immediately')
  ) {
    urgency = 'High';
  } else if (
    lower.includes('when you get a chance') ||
    lower.includes('no rush') ||
    lower.includes('whenever')
  ) {
    urgency = 'Low';
  }

  // Extract key points (simplified)
  const sentences = message.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  for (const sentence of sentences.slice(0, 3)) {
    if (
      sentence.includes('?') ||
      sentence.toLowerCase().includes('please') ||
      sentence.toLowerCase().includes('need')
    ) {
      keyPoints.push(sentence.trim());
    }
  }
  if (keyPoints.length === 0 && sentences.length > 0) {
    keyPoints.push(sentences[0].trim());
  }

  // Detect subtext
  let subtext: string | null = null;
  if (lower.includes('just checking') || lower.includes('wanted to follow up')) {
    subtext = 'They may be frustrated about lack of response—consider acknowledging the delay.';
  }
  if (lower.includes('when you get a chance') && lower.includes('?')) {
    subtext =
      "Despite the soft language, they likely need this soon. Don't let the softness fool you.";
  }
  if (lower.includes("i understand you're busy")) {
    subtext = "They're being polite, but this likely matters to them. Prioritize accordingly.";
  }

  // Recommended response
  let recommendedResponseTone = 'Professional and clear';
  let responsePriority = 'Normal - respond within 24 hours';

  if (senderTone === 'Concerned/Frustrated') {
    recommendedResponseTone = 'Empathetic and solution-focused';
    responsePriority = 'High - respond same day';
    mustAddress.push('Acknowledge their frustration');
  } else if (senderTone === 'Urgent/Pressing') {
    recommendedResponseTone = 'Direct and efficient';
    responsePriority = 'Urgent - respond ASAP';
  } else if (senderTone === 'Appreciative/Warm') {
    recommendedResponseTone = 'Warm and gracious';
  }

  if (mustAddress.length === 0) {
    mustAddress.push('Acknowledge receipt');
    mustAddress.push('Provide relevant information');
  }

  return {
    senderTone,
    likelyIntent,
    urgency,
    keyPoints,
    subtext,
    recommendedResponseTone,
    responsePriority,
    mustAddress,
  };
}

function generateResponseToMessage(
  incoming: string,
  sender: string,
  userGoal: string,
  analysis: ReturnType<typeof analyzeIncomingContent>
): string {
  const senderName = sender.split(' ')[0];

  let response = `Hi ${senderName},\n\n`;

  // Acknowledgment based on tone
  if (analysis.senderTone === 'Concerned/Frustrated') {
    response += `Thank you for bringing this to my attention. I understand your concern.\n\n`;
  } else if (analysis.senderTone === 'Appreciative/Warm') {
    response += `Thank you so much for your kind words!\n\n`;
  } else if (analysis.likelyIntent === 'Following up on something') {
    response += `Thanks for following up on this.\n\n`;
  } else {
    response += `Thanks for reaching out.\n\n`;
  }

  // Address the main point
  response += `[Address their main point: ${analysis.keyPoints[0] || 'their message'}]\n\n`;

  // Next steps
  if (analysis.likelyIntent.includes('Request')) {
    response += `[Your response to their request]\n\n`;
  } else if (analysis.likelyIntent.includes('feedback')) {
    response += `Here's my perspective: [Your thoughts]\n\n`;
  }

  // Close based on urgency
  if (analysis.urgency === 'High') {
    response += `Let me know if you need anything else—I'm on it.`;
  } else {
    response += `Let me know if you have any questions.`;
  }

  response += `\n\nBest,\n[Your name]`;

  return response;
}

function analyzePatterns(messages: string): {
  observed: string[];
  strengths: string[];
  growthAreas: string[];
  recommendations: string[];
  exercise: string;
} {
  const lower = messages.toLowerCase();
  const observed: string[] = [];
  const strengths: string[] = [];
  const growthAreas: string[] = [];
  const recommendations: string[] = [];

  // Check for hedging
  const hedgeCount = (lower.match(/just|maybe|kind of|sort of|i think|i feel like/g) || []).length;
  if (hedgeCount > 3) {
    observed.push(`High use of hedging language (${hedgeCount} instances)`);
    growthAreas.push('Reducing unnecessary hedging to project more confidence');
    recommendations.push("Replace 'I think' with 'I believe' or just state your point directly");
  } else if (hedgeCount === 0) {
    strengths.push('Confident, direct language');
  }

  // Check for over-apologizing
  const sorryCount = (lower.match(/sorry|apologize/g) || []).length;
  if (sorryCount > 2) {
    observed.push(`Frequent apologizing (${sorryCount} instances)`);
    growthAreas.push('Reserving apologies for when you actually did something wrong');
    recommendations.push("Replace 'Sorry for the delay' with 'Thanks for your patience'");
  }

  // Check for clear asks
  const questionCount = (messages.match(/\?/g) || []).length;
  if (questionCount > 0) {
    strengths.push('Clear questions and calls to action');
  } else {
    observed.push('No clear questions or calls to action');
    growthAreas.push('Ending messages with specific questions or next steps');
    recommendations.push('Every message should end with a clear ask or next step');
  }

  // Check message length patterns
  const avgLength = messages.length / Math.max((messages.match(/\n\n/g) || []).length, 1);
  if (avgLength > 500) {
    observed.push('Tendency toward longer messages');
    growthAreas.push('Brevity - could the same point be made in fewer words?');
    recommendations.push('Try the "three sentence challenge" - can you say it in three sentences?');
  } else if (avgLength < 100) {
    strengths.push('Concise communication');
  }

  // Check for specific vs vague
  if (lower.includes('asap') || lower.includes('soon') || lower.includes('whenever')) {
    observed.push('Vague timing language');
    growthAreas.push("Replacing 'ASAP' and 'soon' with specific dates");
    recommendations.push('Always give specific deadlines: "by Friday at 5pm" instead of "soon"');
  }

  // Default observations if none found
  if (observed.length === 0) {
    observed.push('Generally professional communication style');
    strengths.push('Clear and appropriate messaging');
  }

  // Exercise
  let exercise =
    'Take your next important email and try removing every hedge word. Read it aloud. Does it still sound like you?';
  if (growthAreas.includes('Brevity')) {
    exercise =
      'Take your last email and cut it in half. What got lost? Probably nothing important.';
  }
  if (sorryCount > 2) {
    exercise =
      "For the next week, notice every time you're about to apologize. Ask: did I actually do something wrong? If not, rephrase.";
  }

  return { observed, strengths, growthAreas, recommendations, exercise };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateRaiseRequest(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
}): string {
  return `Hi ${params.recipient.split(' ')[0]},

I'd like to schedule some time to discuss my compensation.

Over the past [time period], I've [specific accomplishments - pull from: ${params.keyPoints}]. These contributions have [measurable impact].

Based on my research into market rates for this role and my contributions, I believe a salary of [specific number] would be appropriate.

I'd love to hear your thoughts on this. When would be a good time to discuss?

Thanks,
[Your name]`;
}

function generatePromotionRequest(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
}): string {
  return `Hi ${params.recipient.split(' ')[0]},

I've been thinking about my growth here and wanted to discuss moving into [target role].

Over the past [time], I've already been taking on responsibilities at that level: ${params.keyPoints}

I see [specific opportunity] where I could contribute even more in this expanded role.

I'd value your perspective: What would you need to see to feel confident about this transition?

[Your name]`;
}

function generateFeedbackMessage(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  // Use SBI framework
  return `Hey ${params.recipient.split(' ')[0]},

I wanted to share something with you.

[Situation]: ${params.context}

[Behavior]: ${params.keyPoints}

[Impact]: This affected [specific impact].

I'm bringing this up because I value our working relationship and want us to be successful together. How do you see it?`;
}

function generateDecline(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `Thanks for thinking of me for this.

I won't be able to take this on right now—${params.keyPoints}

[Alternative if applicable]: What I can do is [offer alternative]. Would that help?

Let me know.`;
}

function generateBoundary(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `I understand ${params.context}—I can see why this matters.

Here's where I'm at: ${params.keyPoints}

How can we work together to find a solution that works for both of us?`;
}

function generateBadNews(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `I need to let you know: ${params.keyPoints}

Here's what happened: ${params.context}

I've already [action taken or proposed solution].

Want to hop on a quick call to discuss, or does this plan work for you?`;
}

function generateConflictResolution(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `Hey, I want to clear the air about ${params.context}.

I know from your perspective [acknowledge their view]. Here's where I was coming from: ${params.keyPoints}

What I really want is [desired outcome]. How can we get there together?`;
}

function generateFollowUpMessage(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `Hi ${params.recipient.split(' ')[0]},

Circling back on ${params.context}. ${params.keyPoints}

Let me know if there's anything you need from me, or if there's a better time to discuss.`;
}

function generateDeadlineNegotiation(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `I know the ${params.context} deadline is important.

Here's my situation: ${params.keyPoints}

What I CAN deliver by then: [partial deliverable]
What I'd need more time for: [full deliverable]

Which works better for your needs?`;
}

function generateGenericDifficult(params: {
  recipient: string;
  context: string;
  keyPoints: string;
  desiredOutcome: string;
  tone: Tone;
  format: MessageFormat;
}): string {
  return `Hi ${params.recipient.split(' ')[0]},

I wanted to reach out about ${params.context}.

${params.keyPoints}

Ideally, I'm hoping we can ${params.desiredOutcome}.

What are your thoughts?`;
}

function analyzeMessage(message: string): {
  strengths: string[];
  suggestions: string[];
  tone: string;
  clarity: number;
  reception: string;
} {
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Check length
  if (message.length < 500) {
    strengths.push('Good length - concise and respectful of their time');
  } else {
    suggestions.push('Consider trimming - shorter messages get better response rates');
  }

  // Check for clarity signals
  if (message.includes('?')) {
    strengths.push('Clear call to action with a question');
  } else {
    suggestions.push('Consider ending with a clear question or next step');
  }

  // Check for apologetic language
  if (message.toLowerCase().includes('sorry') || message.toLowerCase().includes('apologize')) {
    suggestions.push(
      'Watch for over-apologizing - only apologize if you actually did something wrong'
    );
  }

  // Check for hedging
  const hedgeWords = ['just', 'maybe', 'kind of', 'sort of', 'i think', 'i feel like'];
  const hasHedging = hedgeWords.some((word) => message.toLowerCase().includes(word));
  if (hasHedging) {
    suggestions.push("Consider removing hedge words ('just', 'maybe') for more confidence");
  } else {
    strengths.push('Confident tone - no excessive hedging');
  }

  // Check for specific vs vague
  if (message.includes('ASAP') || message.includes('soon') || message.includes('whenever')) {
    suggestions.push("Replace vague timing ('ASAP', 'soon') with specific dates");
  }

  // Determine tone
  let tone = 'Professional and clear';
  if (message.includes('!')) {
    tone = 'Enthusiastic and friendly';
  }
  if (message.toLowerCase().includes('urgent') || message.toLowerCase().includes('immediately')) {
    tone = 'Urgent and direct';
  }

  // Estimate clarity
  const clarity = 10 - suggestions.length;

  // Predict reception
  let reception = 'Should land well - professional and clear';
  if (suggestions.length > 2) {
    reception = 'Might be misunderstood - consider revising';
  }

  return { strengths, suggestions, tone, clarity, reception };
}

function detectTone(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('urgent') || lower.includes('immediately') || lower.includes('asap')) {
    return 'Urgent/Pressing';
  }
  if (lower.includes('please') && lower.includes('thank')) {
    return 'Polite and professional';
  }
  if (lower.includes('!') && !lower.includes('urgent')) {
    return 'Friendly and enthusiastic';
  }
  if (lower.includes('disappointed') || lower.includes('concerned')) {
    return 'Serious/Concerned';
  }
  if (lower.includes('sorry') || lower.includes('apologize')) {
    return 'Apologetic';
  }

  return 'Neutral/Professional';
}

function transformMessage(message: string, targetTone: string): string {
  // This would be more sophisticated with actual NLP
  // For now, provide template transformations
  switch (targetTone) {
    case 'more_direct':
      return message
        .replace(/I was wondering if/gi, '')
        .replace(/Would it be possible to/gi, 'Please')
        .replace(/I think maybe/gi, '')
        .replace(/just/gi, '')
        .trim();

    case 'softer':
      return `I wanted to reach out about this. ${message} I appreciate your time.`;

    case 'more_formal':
      return message
        .replace(/Hey/gi, 'Dear')
        .replace(/Thanks!/gi, 'Thank you for your consideration.')
        .replace(/!/g, '.');

    case 'more_casual':
      return message
        .replace(/Dear/gi, 'Hey')
        .replace(/Thank you for your consideration/gi, 'Thanks!')
        .replace(/\./g, '!');

    case 'warmer':
      return `I hope this finds you well! ${message} Really appreciate you.`;

    case 'more_assertive':
      return message
        .replace(/I think/gi, 'I believe')
        .replace(/maybe/gi, '')
        .replace(/I was hoping/gi, 'I need')
        .replace(/if possible/gi, '');

    default:
      return message;
  }
}

function addressConcern(message: string, concern: string): string {
  const lowerConcern = concern.toLowerCase();

  if (lowerConcern.includes('harsh') || lowerConcern.includes('mean')) {
    return "It doesn't read as harsh to me - it's direct, which is respectful. If you're worried, you could add 'I value our relationship' somewhere to signal good intent.";
  }

  if (lowerConcern.includes('weak') || lowerConcern.includes('pushover')) {
    return "It's clear and professional. If you want more strength, remove any 'just' or 'maybe' words and make your ask more specific.";
  }

  if (lowerConcern.includes('long')) {
    return 'Fair point - shorter is usually better. Try cutting the middle paragraph and see if the meaning survives.';
  }

  return 'Trust your instincts here. If something feels off, that feeling is worth exploring. What specifically is bothering you?';
}

function addressFear(fear: string): string {
  const lowerFear = fear.toLowerCase();

  if (lowerFear.includes('upset') || lowerFear.includes('angry')) {
    return 'Most people respect clear communication more than they resent it. Their momentary discomfort is better than ongoing resentment from unspoken issues.';
  }

  if (lowerFear.includes('fired') || lowerFear.includes('trouble')) {
    return 'Setting reasonable boundaries professionally is not a fireable offense. If it were, that would tell you something important about the environment.';
  }

  if (lowerFear.includes('relationship') || lowerFear.includes('like me')) {
    return 'Healthy relationships can handle honest communication. If being clear damages the relationship, the relationship was already fragile.';
  }

  return 'Fear is natural. But ask yourself: is this fear protecting you from actual harm, or just from discomfort? Discomfort is temporary.';
}

function generateAssertiveScript(situation: string, whatUserWants: string): string {
  return `I understand where you're coming from, and I want to find a solution. Here's what I need: ${whatUserWants}. How can we make this work for both of us?`;
}

function generateFollowUpStrategy(
  daysSince: number,
  previousFollowUps: number,
  urgency: string
): {
  action: string;
  script: string;
  timing: string;
  tip: string;
} {
  if (previousFollowUps === 0 && daysSince >= 2) {
    return {
      action: 'Send first follow-up',
      script:
        "Hi! Wanted to make sure this didn't get buried. Let me know if you need anything from me to move forward.",
      timing: 'Send today',
      tip: "Keep it light - don't assume they're ignoring you.",
    };
  }

  if (previousFollowUps === 1 && daysSince >= 5) {
    return {
      action: 'Send second follow-up',
      script:
        'Circling back on this. Is there a better time to discuss, or anything I can clarify?',
      timing: 'Send today or tomorrow',
      tip: 'Add value - offer clarification or new information.',
    };
  }

  if (previousFollowUps >= 2) {
    return {
      action: 'Send graceful exit',
      script:
        "I know things get busy. I'll assume the timing isn't right now. Feel free to reach out when it works better—happy to help whenever.",
      timing: 'Send within the next few days',
      tip: 'This releases pressure while leaving the door open. Often prompts a response.',
    };
  }

  return {
    action: 'Wait a bit longer',
    script: '',
    timing: `Wait ${3 - daysSince} more days before following up`,
    tip: "Patience signals confidence. Don't crowd them.",
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createCommunicationCoachingTools;
