/**
 * Outbound Call Context Builder
 *
 * Injects awareness into agents during outbound calls made ON BEHALF of users.
 * This is the critical bridge between the call orchestrator and the agent -
 * without it, the agent wouldn't know why it's calling or what to accomplish.
 *
 * Injections:
 * - Call purpose and objective
 * - Call script with greeting and guidelines
 * - Compliance requirements (AI disclosure, recording consent)
 * - Must-confirm and must-not-do guardrails
 *
 * @module intelligence/context-builders/external/outbound-call-context
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { outboundOpener, partiesOf } from '../../../services/outreach/opening-line.js';
import { isCallOpeningAmdEnabled } from '../../../config/call-opening-flag.js';

const log = createLogger({ module: 'context:outbound-call' });

// ============================================================================
// TYPES
// ============================================================================

interface OutboundCallContext {
  callId: string;
  recipientName: string;
  recipientPhone: string;
  purpose: string;
  callType: 'healthcare' | 'restaurant' | 'business' | 'personal';
  objective: string;
  script: string;
  complianceScript: string;
  mustConfirm: string[];
  mustNotDo: string[];
  informationToGather: string[];
  userName: string;
  originalSessionId: string;
  /** Words to open with when the dispatcher wrote them (a family check-in's opening line). */
  openingLine?: string;
  /** The user the call is for, and which kind of call: where its outcome is recorded. */
  requesterUserId?: string;
  kind?: 'on_behalf' | 'family_checkin';
}

/**
 * The opener is the AI disclosure. After it, Ferni doesn't keep announcing it,
 * and never denies it when sincerely asked.
 */
export const AI_DISCLOSURE_RULE =
  "Your opening line already said you're an AI; don't bring it up again or add 'as an AI' disclaimers. If someone sincerely asks whether you're a real person, say plainly that you're an AI, in a few words, then carry on warmly.";

// In-memory store for outbound call contexts (set by orchestrator)
const outboundCallContexts = new Map<string, OutboundCallContext>();

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

/**
 * Store outbound call context for a room/session
 * Called by the on-behalf-call-orchestrator when spawning an agent
 */
export function setOutboundCallContext(
  roomOrSessionId: string,
  context: OutboundCallContext
): void {
  outboundCallContexts.set(roomOrSessionId, context);
  log.info(
    {
      roomOrSessionId,
      callId: context.callId,
      recipientName: context.recipientName,
      callType: context.callType,
    },
    'Stored outbound call context'
  );
}

/**
 * Get outbound call context for a room/session
 */
export function getOutboundCallContext(roomOrSessionId: string): OutboundCallContext | undefined {
  return outboundCallContexts.get(roomOrSessionId);
}

/**
 * Clear outbound call context after call completes
 */
export function clearOutboundCallContext(roomOrSessionId: string): void {
  outboundCallContexts.delete(roomOrSessionId);
  log.debug({ roomOrSessionId }, 'Cleared outbound call context');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const outboundCallContextBuilder: ContextBuilder = {
  name: 'outbound-call-context',
  description: 'Injects call purpose, script, and compliance guidance for outbound on-behalf calls',
  priority: 5, // Very high priority - must run early to set the stage
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;

    // Get session ID to look up call context
    const sessionId = services?.sessionId;
    if (!sessionId) {
      return [];
    }

    // Check if this is an on-behalf call session
    const callContext = getOutboundCallContext(sessionId);
    if (!callContext) {
      // Not an on-behalf call - nothing to inject
      return [];
    }

    log.debug(
      {
        sessionId,
        callId: callContext.callId,
        recipientName: callContext.recipientName,
      },
      'Building outbound call context'
    );

    const injections: ContextInjection[] = [];

    // ---------------------------------------------------------
    // 1. CRITICAL: Call Purpose & Identity
    // ---------------------------------------------------------
    const purposeContent = buildPurposeInjection(callContext);
    injections.push(
      createStandardInjection('outbound_call_purpose', purposeContent, {
        category: 'outbound-call',
        confidence: 1.0,
      })
    );

    // ---------------------------------------------------------
    // 2. CRITICAL: Compliance Requirements
    // ---------------------------------------------------------
    if (callContext.complianceScript) {
      injections.push(
        createStandardInjection('outbound_call_compliance', callContext.complianceScript, {
          category: 'compliance',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 3. Call Script & Guidelines
    // ---------------------------------------------------------
    const scriptContent = buildScriptInjection(callContext);
    injections.push(
      createStandardInjection('outbound_call_script', scriptContent, {
        category: 'outbound-call',
        confidence: 0.95,
      })
    );

    // ---------------------------------------------------------
    // 4. Guardrails: Must-Not-Do
    // ---------------------------------------------------------
    if (callContext.mustNotDo.length > 0) {
      const guardrails = buildGuardrailsInjection(callContext.mustNotDo, callContext.userName);
      injections.push(
        createStandardInjection('outbound_call_guardrails', guardrails, {
          category: 'constraints',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 5. Information to Gather
    // ---------------------------------------------------------
    if (callContext.informationToGather.length > 0) {
      const gatherContent = buildInformationGatherInjection(callContext);
      injections.push(
        createStandardInjection('outbound_call_gather', gatherContent, {
          category: 'outbound-call',
          confidence: 0.9,
        })
      );
    }

    log.info(
      {
        sessionId,
        callId: callContext.callId,
        injectionCount: injections.length,
      },
      'Built outbound call context injections'
    );

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

/**
 * With CALL_OPENING_AMD on, the person speaks first and Ferni's reply to their
 * "Hello?" is the opener. With it off, Ferni has already said the opener
 * itself, so the prompt asks for no second one.
 */
function firstReplyRule(context: OutboundCallContext): string {
  if (!isCallOpeningAmdEnabled()) return '';
  return `- They speak first. Your FIRST reply after they answer ("Hello?") is exactly this, and only this:
  "${outboundOpener(partiesOf(context))}"
  Then stop and let them respond. This replaces only the greeting in the script below; follow
  everything else in it. Never introduce yourself again after that.
`;
}

function buildPurposeInjection(context: OutboundCallContext): string {
  return `
OUTBOUND CALL ON BEHALF OF USER

You are making a phone call ON BEHALF of ${context.userName}.
You are calling: ${context.recipientName}
Call type: ${context.callType}

PRIMARY OBJECTIVE: ${context.objective}

Purpose: ${context.purpose}

TALK THE WAY PEOPLE DO ON THE PHONE:
${firstReplyRule(context)}- After they respond, say why you're calling in one or two sentences. Don't open with small
  talk or ask "how are you" yourself; if they ask how you are, answer in a few words
  ("Doing well, thanks!") and carry on.
- Short turns, one or two sentences, then let them talk. React like a person before moving on
  ("Oh, that's great", "Mm, sorry to hear that").
- Speak clearly and a touch slower than usual, but never talk down: no pet names, no "we",
  no over-explaining. If they didn't catch something, say it again in different words.
- When they give a date, time, number or address, let them finish, then read it back.
- Never pretend to be ${context.userName}, and don't promise things for ${context.userName}; say
  you'll pass it on.
- If someone else answers, ask for ${context.recipientName} warmly and keep the reason to yourself.
- On a family call, if they want to chat a little, follow their lead, then gently come back.

CRITICAL REMINDERS:
- You are Ferni, ${context.userName}'s friend. ${AI_DISCLOSURE_RULE}
- You are authorized by ${context.userName} to make this call.
- Be professional but warm - you represent ${context.userName}.
- If they seem confused about an AI calling, reassure them and explain briefly.
- If they refuse to speak with an AI, thank them and end gracefully.

This call has ID: ${context.callId} (reference if needed)
`.trim();
}

function buildScriptInjection(context: OutboundCallContext): string {
  return `
CALL SCRIPT GUIDANCE

${context.script}

MUST CONFIRM before ending the call:
${context.mustConfirm.map((item) => `- ${item}`).join('\n')}

---

## 📞 SUPERHUMAN CALL MANAGEMENT (Critical!)

### Closing the Call (people never just stop; they wind down together)
When the reason for the call is done, or they say they need to go:
1. Wind down: "Okay..." or "Well, I'll let you get back to your evening" (echo something they
   mentioned if you can).
2. Leave room once: "Anything you'd like me to pass along to ${context.userName}?" If they bring
   up something new, that's normal: follow it, then wind down again.
3. Recap in one sentence what you'll tell ${context.userName}.
4. "Thanks, ${context.recipientName}. Bye!" Wait for their goodbye, then call the endCall tool.
If they're rushed or frustrated, skip to a one-line recap and goodbye. If they say bye first,
say bye back and call endCall.

endCall outcomes: "completed" after a goodbye; "refused" if they don't want to talk with an AI
(thank them first); "wrong_number" if it isn't the right person (apologize briefly first).
Your goodbye finishes playing before the line drops. Never keep talking after the goodbyes.

### Voicemail
Voicemail is usually detected before you speak. If you still realize mid-call that you're
talking to a recording, leave ONE short, warm message (under 20 seconds): who you are, that
you're calling for ${context.userName}, the gist, and that they can just call or text
${context.userName}. No questions to a recording. Then call endCall with "voicemail_left".

### Detecting Frustration (SUPERHUMAN AWARENESS)
Watch for these signals and BACK OFF gracefully:
- Short, clipped answers → They're busy, wrap up quickly
- "Uh-huh", "okay", "sure" repeatedly → They're distracted, get to the point
- Sighing, impatient tone → Apologize for the interruption, offer to have ${context.userName} call directly
- "Can you get to the point?" → Summarize in one sentence, then wrap up

### Call Pacing (BETTER THAN HUMAN)
- Most calls should be 2-5 minutes
- For personal calls (family): Can be longer if they're enjoying the conversation
- For business calls: Be efficient, respect their time
- If they're chatty, match their energy - but still end when objective is achieved

### REPORTING BACK (Your Internal Summary)
As you end the call, mentally note:
1. ✅/❌ Was the objective achieved?
2. 📝 What key information did you gather?
3. 🔄 Does ${context.userName} need to call them back?
4. ⏰ Any dates, times, or deadlines mentioned?
5. 💬 Any message they want passed to ${context.userName}?

This information will be automatically captured and reported to ${context.userName}.
`.trim();
}

function buildGuardrailsInjection(mustNotDo: string[], userName: string): string {
  return `
CALL GUARDRAILS - DO NOT VIOLATE

${mustNotDo.map((item) => `- ${item}`).join('\n')}

These are hard constraints. If you're unsure about something, err on the side of caution and say you'll have ${userName} follow up directly.
`.trim();
}

function buildInformationGatherInjection(context: OutboundCallContext): string {
  return `
INFORMATION TO GATHER

Try to obtain the following during the call:
${context.informationToGather.map((item) => `- ${item}`).join('\n')}

Note: Not all information may be available. Gather what you can naturally without being pushy.
`.trim();
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(outboundCallContextBuilder);
