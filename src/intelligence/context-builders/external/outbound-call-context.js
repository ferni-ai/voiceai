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
import { registerContextBuilder, createStandardInjection, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'context:outbound-call' });
// In-memory store for outbound call contexts (set by orchestrator)
const outboundCallContexts = new Map();
// ============================================================================
// CONTEXT STORAGE
// ============================================================================
/**
 * Store outbound call context for a room/session
 * Called by the on-behalf-call-orchestrator when spawning an agent
 */
export function setOutboundCallContext(roomOrSessionId, context) {
    outboundCallContexts.set(roomOrSessionId, context);
    log.info({
        roomOrSessionId,
        callId: context.callId,
        recipientName: context.recipientName,
        callType: context.callType,
    }, 'Stored outbound call context');
}
/**
 * Get outbound call context for a room/session
 */
export function getOutboundCallContext(roomOrSessionId) {
    return outboundCallContexts.get(roomOrSessionId);
}
/**
 * Clear outbound call context after call completes
 */
export function clearOutboundCallContext(roomOrSessionId) {
    outboundCallContexts.delete(roomOrSessionId);
    log.debug({ roomOrSessionId }, 'Cleared outbound call context');
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
export const outboundCallContextBuilder = {
    name: 'outbound-call-context',
    description: 'Injects call purpose, script, and compliance guidance for outbound on-behalf calls',
    priority: 5, // Very high priority - must run early to set the stage
    category: BuilderCategory.CONTEXT,
    build: async (input) => {
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
        log.debug({
            sessionId,
            callId: callContext.callId,
            recipientName: callContext.recipientName,
        }, 'Building outbound call context');
        const injections = [];
        // ---------------------------------------------------------
        // 1. CRITICAL: Call Purpose & Identity
        // ---------------------------------------------------------
        const purposeContent = buildPurposeInjection(callContext);
        injections.push(createStandardInjection('outbound_call_purpose', purposeContent, {
            category: 'outbound-call',
            confidence: 1.0,
        }));
        // ---------------------------------------------------------
        // 2. CRITICAL: Compliance Requirements
        // ---------------------------------------------------------
        if (callContext.complianceScript) {
            injections.push(createStandardInjection('outbound_call_compliance', callContext.complianceScript, {
                category: 'compliance',
                confidence: 1.0,
            }));
        }
        // ---------------------------------------------------------
        // 3. Call Script & Guidelines
        // ---------------------------------------------------------
        const scriptContent = buildScriptInjection(callContext);
        injections.push(createStandardInjection('outbound_call_script', scriptContent, {
            category: 'outbound-call',
            confidence: 0.95,
        }));
        // ---------------------------------------------------------
        // 4. Guardrails: Must-Not-Do
        // ---------------------------------------------------------
        if (callContext.mustNotDo.length > 0) {
            const guardrails = buildGuardrailsInjection(callContext.mustNotDo);
            injections.push(createStandardInjection('outbound_call_guardrails', guardrails, {
                category: 'constraints',
                confidence: 1.0,
            }));
        }
        // ---------------------------------------------------------
        // 5. Information to Gather
        // ---------------------------------------------------------
        if (callContext.informationToGather.length > 0) {
            const gatherContent = buildInformationGatherInjection(callContext);
            injections.push(createStandardInjection('outbound_call_gather', gatherContent, {
                category: 'outbound-call',
                confidence: 0.9,
            }));
        }
        log.info({
            sessionId,
            callId: callContext.callId,
            injectionCount: injections.length,
        }, 'Built outbound call context injections');
        return injections;
    },
};
// ============================================================================
// INJECTION BUILDERS
// ============================================================================
function buildPurposeInjection(context) {
    return `
OUTBOUND CALL ON BEHALF OF USER

You are making a phone call ON BEHALF of ${context.userName}.
You are calling: ${context.recipientName}
Call type: ${context.callType}

PRIMARY OBJECTIVE: ${context.objective}

Purpose: ${context.purpose}

CRITICAL REMINDERS:
- You are Ferni, an AI assistant. You must identify yourself as an AI.
- You are authorized by ${context.userName} to make this call.
- Be professional but warm - you represent ${context.userName}.
- If they seem confused about an AI calling, reassure them and explain briefly.
- If they refuse to speak with an AI, thank them and end gracefully.

This call has ID: ${context.callId} (reference if needed)
`.trim();
}
function buildScriptInjection(context) {
    return `
CALL SCRIPT GUIDANCE

${context.script}

MUST CONFIRM before ending the call:
${context.mustConfirm.map((item) => `- ${item}`).join('\n')}

---

## 📞 SUPERHUMAN CALL MANAGEMENT (Critical!)

### When to END the Call
END the conversation when ANY of these occur:
- They say "goodbye", "bye", "take care", "talk later" → Say goodbye warmly, then STOP TALKING
- The objective is achieved → Summarize briefly, thank them, say goodbye
- They say they need to go → Acknowledge gracefully, wrap up in 1-2 sentences
- They sound frustrated or rushed → "I can tell this isn't a good time. I'll let ${context.userName} know. Thank you!"
- 3+ awkward silences → "I think I have what I need. Thank you so much for your time!"
- They explicitly say "I'm done" or "we're done" → Thank them and end immediately

### How the Call Ends
When the conversation is over, simply say your goodbye. The call will end naturally when:
1. They hang up (most common)
2. You both say goodbye and there's silence
3. The system detects the call is complete

DO NOT keep talking after goodbyes. DO NOT ask "is there anything else?" after wrapping up.

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
function buildGuardrailsInjection(mustNotDo) {
    return `
CALL GUARDRAILS - DO NOT VIOLATE

${mustNotDo.map((item) => `- ${item}`).join('\n')}

These are hard constraints. If you're unsure about something, err on the side of caution and say you'll have ${'{userName}'} follow up directly.
`.trim();
}
function buildInformationGatherInjection(context) {
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
//# sourceMappingURL=outbound-call-context.js.map