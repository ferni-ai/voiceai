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
import type { RelationGroup } from '../../../memory/domain/index.js';
import { isCallOpeningAmdEnabled } from '../../../config/call-opening-flag.js';
import { flagOn } from '../../../config/env-flag.js';

const log = createLogger({ module: 'context:outbound-call' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * ON_BEHALF_FULL_CONTEXT, set once per call by the agent job from the signed
 * dispatch (agents/voice-agent-entry/on-behalf-full-context.ts). The prompt
 * reads only these, never the flag: absent, the prompt is main's.
 */
export interface FullCallContext {
  fullContext: true;
  /** The canonical relation (person-key.ts relationOf: "mom" → "mother"); never a bare group. */
  relationship?: string;
  /** The relationship's group, or "family" when the contact store saved only that. */
  relationshipGroup?: RelationGroup;
  /** What the requester said about the call: one line, capped. */
  background?: string;
}

interface OutboundCallContext extends Partial<FullCallContext> {
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
  /** The persona placing the call, as it names itself (CALL_AS_PERSONA); Ferni when unset. */
  agentName?: string;
}

/**
 * The opener is the AI disclosure. After it, Ferni doesn't keep announcing it,
 * and never denies it when sincerely asked.
 */
export const AI_DISCLOSURE_RULE =
  "Your opening line already said you're an AI; don't bring it up again or add 'as an AI' disclaimers. If someone sincerely asks whether you're a real person, say plainly that you're an AI, in a few words, then carry on warmly.";

/**
 * A family check-in's opener only says "it's Ferni": the person agreed to
 * Ferni's calls and knows who Ferni is. Ferni still never denies being an AI.
 */
export const CHECKIN_HONESTY_RULE =
  "They know you and agreed to your check-ins, so don't announce that you're an AI or add 'as an AI' disclaimers. If someone sincerely asks whether you're a real person, say plainly that you're an AI, in a few words, then carry on warmly.";

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
      hasRecipientName: Boolean(context.recipientName) && context.recipientName !== 'Unknown', // never the name
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

/**
 * GROUNDED_CLAIMS (#3008). Prod 2026-10-28: on a call placed for the owner, asked
 * whether Ferni had passed on a message "last time", he said "I forgot, but I will
 * tell him." He had no record of an earlier call, so he made up a relay and a failure.
 */
function earlierCallRule(context: OutboundCallContext): string {
  if (!flagOn('GROUNDED_CLAIMS')) return '';
  return `- If they ask about an earlier call or message you can't see here, say you don't have it in
  front of you and offer to pass it on to ${context.userName} now. Never say you forgot, or that you
  already passed something on.
`;
}

/**
 * An on-behalf call's purpose is the user's own request, in their words ("tell
 * her I'm running late"): Ferni passes it on as their message, about them,
 * never as them. A family check-in's purpose is the server's own sentence.
 */
function purposeLine(context: OutboundCallContext): string {
  if (context.kind === 'family_checkin') return `Purpose: ${context.purpose}`;
  const who = context.userName;
  return `Purpose, in ${who}'s own words, for you to pass on as ${who}'s: "${context.purpose}"
Say it about ${who}, in the third person ("${who} asked me to..."). Their "I" means ${who}
("I'm running late" becomes "${who}'s running late"). You are not ${who}: never introduce
yourself as ${who} or speak as if you were them.`;
}

/**
 * ON_BEHALF_FULL_CONTEXT: a contact saved only as a relation ("my mom", or
 * "Sam's mom" on Sam's call) says who they are to the user, not their name.
 * partiesOf owns that reading, as it does for the opener.
 */
function relationOnly(context: OutboundCallContext): string | undefined {
  if (!context.fullContext) return undefined;
  const { recipientName, relation } = partiesOf(context);
  return recipientName ? undefined : relation;
}

/** Who Ferni is calling, as the prompt names them: never a bare "mom" to say back to them. */
function calledAs(context: OutboundCallContext): string {
  const relation = relationOnly(context);
  if (!relation) return context.recipientName;
  const family = context.relationshipGroup === 'family' && context.relationship;
  return `${context.userName}'s ${family || relation}`;
}

/** Who they are to the user, the way you'd brief someone making the call for you. */
function relationshipLine(context: OutboundCallContext): string | undefined {
  const { relationship, relationshipGroup: group, userName: who } = context;
  if (group === 'professional' && relationship) {
    return `This is ${who}'s ${relationship}'s office, and the front desk may answer. Keep it professional and say who you're calling for.`;
  }
  const close = group === 'family' || group === 'friend';
  const warm = close ? ` Be warm, like a friend of ${who}'s they'd be glad to hear from.` : '';
  if (!relationship) {
    return group === 'family' ? `This is someone in ${who}'s family.${warm}` : undefined;
  }
  const { recipientName } = partiesOf(context);
  const whoTheyAre = recipientName
    ? `${recipientName} is ${who}'s ${relationship}.`
    : `This is ${who}'s ${relationship}.`;
  return `${whoTheyAre}${warm}`;
}

/**
 * Who the person is to the user and what the user said about the call, both
 * from a signed dispatch. The background is for Ferni to know, not a second
 * message: "don't tell her about the party" must never be passed on.
 */
function backgroundLines(context: OutboundCallContext): string {
  const who = context.userName;
  const lines = [
    relationshipLine(context),
    context.background &&
      `What ${who} told you about this call (background for you, not a message to pass on unless it says to): "${context.background}"`,
  ].filter(Boolean);
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

function buildPurposeInjection(context: OutboundCallContext): string {
  return `
OUTBOUND CALL ON BEHALF OF USER

You are making a phone call ON BEHALF of ${context.userName}.
You are calling: ${calledAs(context)}
Call type: ${context.callType}

PRIMARY OBJECTIVE: ${context.objective}

${purposeLine(context)}${backgroundLines(context)}

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
${earlierCallRule(context)}- If someone else answers, ask for ${calledAs(context)} warmly and keep the reason to yourself.
- On a family call, if they want to chat a little, follow their lead, then gently come back.

CRITICAL REMINDERS:
- You are ${context.agentName ?? 'Ferni'}, ${context.userName}'s friend. ${context.kind === 'family_checkin' ? CHECKIN_HONESTY_RULE : AI_DISCLOSURE_RULE}
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
4. "Thanks${relationOnly(context) ? '' : `, ${context.recipientName}`}. Bye!" Wait for their goodbye, then call the endCall tool.
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
