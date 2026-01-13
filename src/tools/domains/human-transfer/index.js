/**
 * Human Expert Transfer Domain Tools
 *
 * > "Better than human means knowing when to bring in a human."
 *
 * Tools for connecting users with professional help when AI
 * life coaching isn't enough.
 *
 * DOMAIN: human-transfer
 * TOOLS:
 *   - evaluateHumanTransfer: Assess if professional help is needed
 *   - connectToHumanExpert: Initiate warm handoff
 *   - provideCrisisResources: Surface crisis support resources
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { humanTransfer, } from '../../../services/human-transfer/index.js';
const log = getLogger();
// ============================================================================
// EVALUATE HUMAN TRANSFER TOOL
// ============================================================================
const evaluateHumanTransferDef = {
    id: 'evaluateHumanTransfer',
    name: 'Evaluate Human Transfer',
    description: 'Assess if the user would benefit from professional human support',
    domain: 'crisis',
    tags: ['safety', 'crisis', 'therapy', 'transfer', 'professional'],
    create: (ctx) => {
        return llm.tool({
            description: `Evaluate if the user would benefit from connecting with a human professional.
Use this when:
- User expresses suicidal thoughts or self-harm
- User describes symptoms of mental health conditions
- User is in a domestic violence situation
- User needs legal, medical, or financial professional help
- Conversation is beyond life coaching scope

Returns assessment with recommendation and resources.`,
            parameters: z.object({
                userStatement: z.string().describe('What the user said that triggered evaluation'),
                context: z.string().optional().describe('Additional conversation context'),
            }),
            execute: async ({ userStatement, context }) => {
                log.info({ agentId: ctx.agentId }, 'Evaluating human transfer need');
                try {
                    // Detect crisis signals and classify
                    const decision = humanTransfer.evaluateTransferNeed(userStatement);
                    // Build response based on decision
                    let response = '';
                    if (decision.type === 'none') {
                        response = `**Assessment:** Within life coaching scope.

This conversation can continue with Ferni's support. No professional transfer needed at this time.

However, always listen for:
- Expressions of hopelessness or suicidal thoughts
- Descriptions of abuse or safety concerns
- Persistent symptoms that suggest a clinical condition`;
                        return response;
                    }
                    // Build detailed assessment
                    response = `**Assessment:** ${decision.type.replace(/_/g, ' ').toUpperCase()}

**Urgency:** ${decision.urgency}
**Reason:** ${decision.reason}
**Confidence:** ${(decision.confidence * 100).toFixed(0)}%

**Suggested Action:** ${decision.suggestedService || 'Connect with appropriate professional'}

`;
                    // Add safety flags if present
                    if (decision.safetyFlags) {
                        const flags = Object.entries(decision.safetyFlags)
                            .filter(([_, v]) => v)
                            .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim());
                        if (flags.length > 0) {
                            response += `**Safety Flags:** ${flags.join(', ')}\n\n`;
                        }
                    }
                    // Add available resources
                    const services = humanTransfer.getAvailableServices(decision.type);
                    if (services.length > 0) {
                        response += `**Immediate Resources:**\n`;
                        for (const service of services) {
                            response += `- **${service.name}**: ${service.phone || service.sms || service.url}\n`;
                        }
                    }
                    response += `\n**Next Step:** Use connectToHumanExpert tool to initiate transfer with user consent.`;
                    return response;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Error evaluating human transfer');
                    // Always return crisis resources on error
                    return `**Assessment Error** - Returning default crisis resources:

📞 **988 Suicide & Crisis Lifeline** - Call or text 988 (24/7)
📱 **Crisis Text Line** - Text HOME to 741741 (24/7)

If there's any concern about safety, please surface these resources to the user.`;
                }
            },
        });
    },
};
// ============================================================================
// CONNECT TO HUMAN EXPERT TOOL
// ============================================================================
const connectToHumanExpertDef = {
    id: 'connectToHumanExpert',
    name: 'Connect to Human Expert',
    description: 'Initiate warm handoff to human professional',
    domain: 'crisis',
    tags: ['safety', 'transfer', 'therapy', 'professional', 'handoff'],
    create: (ctx) => {
        return llm.tool({
            description: `Initiate warm handoff to human professional.
ALWAYS get user consent before sharing any information.
Use after evaluateHumanTransfer indicates transfer is appropriate.`,
            parameters: z.object({
                transferType: z
                    .enum([
                    'crisis_immediate',
                    'crisis_support',
                    'therapy',
                    'psychiatry',
                    'coaching',
                    'legal',
                    'medical',
                    'financial',
                ])
                    .describe('Type of professional help needed'),
                userConsent: z
                    .enum(['full_summary', 'minimal', 'topics_only', 'none'])
                    .describe('What level of information sharing user consented to'),
                keyTopics: z
                    .array(z.string())
                    .optional()
                    .describe('Key topics to include in handoff (if consented)'),
            }),
            execute: async ({ transferType, userConsent, keyTopics }) => {
                log.info({ agentId: ctx.agentId, transferType, consent: userConsent }, 'Initiating human transfer');
                try {
                    // Get resources for this transfer type
                    const services = humanTransfer.getAvailableServices(transferType);
                    let response = '';
                    // CRISIS - Always provide resources immediately
                    if (transferType === 'crisis_immediate' || transferType === 'crisis_support') {
                        response = `**Connecting to Crisis Support**

I want to make sure you have the support you need right now.

📞 **988 Suicide & Crisis Lifeline**
   Call or text 988 - Available 24/7
   Trained counselors ready to help

📱 **Crisis Text Line**
   Text HOME to 741741
   If talking feels too hard, texting is okay

These professionals understand what you're going through. There's no judgment, just support.

I'm also still here with you. Whatever you need.`;
                        return response;
                    }
                    // THERAPY - Provide resources based on consent level
                    if (transferType === 'therapy' || transferType === 'psychiatry') {
                        response = `**Finding the Right Therapist**

Finding a good therapist is an important step. Here are some resources:

🔍 **Psychology Today Directory**
   psychologytoday.com/us/therapists
   Filter by location, insurance, and specialty

💻 **BetterHelp / Talkspace**
   Online therapy with flexible scheduling

💰 **Open Path Collective**
   openpathcollective.org
   Affordable therapy ($30-80/session)

**Tips:**
- Many therapists offer free 15-minute consultations
- It's okay to try a few before finding the right fit`;
                        if (keyTopics && keyTopics.length > 0 && userConsent !== 'none') {
                            response += `\n\n**Based on our conversations, look for someone who works with:**\n`;
                            for (const topic of keyTopics.slice(0, 3)) {
                                response += `- ${topic}\n`;
                            }
                        }
                        response += `\n\nI'll still be here between sessions. We make a good team.`;
                        return response;
                    }
                    // LEGAL
                    if (transferType === 'legal') {
                        response = `**Legal Resources**

Legal situations need professional legal advice. Here are some options:

📋 **Free/Low-Cost Help:**
- Legal Aid (search "legal aid" + your city)
- Law school clinics
- Your state bar referral service

🌐 **LawHelp.org**
   Find free legal aid in your area

I'm still here to support you emotionally through this.`;
                        return response;
                    }
                    // FINANCIAL
                    if (transferType === 'financial') {
                        response = `**Financial Resources**

📞 **Call 211**
   Connects you to local services:
   - Rent/housing assistance
   - Utility bill help
   - Food assistance
   - Emergency funds

💳 **NFCC (National Foundation for Credit Counseling)**
   1-800-388-2227
   Free nonprofit credit counseling

I'm here to support you through this. The financial stress is real.`;
                        return response;
                    }
                    // MEDICAL
                    if (transferType === 'medical') {
                        response = `**Medical Resources**

🚨 **For Emergencies:** Call 911

🏥 **For Urgent (Non-Emergency):**
- Urgent Care clinics
- Telehealth services (same-day video visits)
- Your primary care doctor

📞 **Nurse Advice Lines:**
   Many insurance plans have 24/7 nurse lines

Please don't delay getting checked out. Your health matters.`;
                        return response;
                    }
                    // COACHING
                    if (transferType === 'coaching') {
                        response = `**Professional Coaching Resources**

For more intensive coaching support:

🎯 **International Coach Federation (ICF)**
   coachfederation.org
   Find certified coaches

💼 **BetterUp / CoachHub**
   Professional executive coaching

I can continue supporting you, and a dedicated coach could add another layer of support.`;
                        return response;
                    }
                    // Default
                    return `I'd like to help connect you with the right support. What specific area would be most helpful?`;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Error initiating human transfer');
                    // Always return crisis resources
                    return `I encountered an issue, but here are resources that can help:

📞 **988** - Crisis support (24/7)
📱 **211** - Local services
🌐 **psychologytoday.com** - Find therapists

I'm still here with you.`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK CRISIS RESOURCES TOOL
// ============================================================================
const quickCrisisResourcesDef = {
    id: 'quickCrisisResources',
    name: 'Quick Crisis Resources',
    description: 'Immediately surface crisis support resources',
    domain: 'crisis',
    tags: ['safety', 'crisis', 'resources', 'immediate'],
    create: (ctx) => {
        return llm.tool({
            description: `Immediately surface crisis support resources.
Use when:
- User expresses thoughts of suicide or self-harm
- User mentions wanting to hurt themselves
- User is in immediate distress
- User asks about crisis support

ALWAYS safe to call - never wrong to surface these resources.`,
            parameters: z.object({
                situation: z
                    .enum([
                    'suicidal-thoughts',
                    'self-harm',
                    'panic-attack',
                    'domestic-violence',
                    'substance-crisis',
                    'general-crisis',
                ])
                    .optional()
                    .describe('Type of crisis situation if known'),
            }),
            execute: async ({ situation }) => {
                log.info({ agentId: ctx.agentId, situation }, 'Surfacing crisis resources');
                let response = '';
                // Specialized resources based on situation
                if (situation === 'domestic-violence') {
                    response = `**Support is Available**

📞 **National Domestic Violence Hotline**
   1-800-799-7233 (24/7)
   Text START to 88788
   
   Confidential support and safety planning

📞 **988 Suicide & Crisis Lifeline**
   Call or text 988

You deserve to be safe. These trained professionals can help.`;
                    return response;
                }
                if (situation === 'substance-crisis') {
                    response = `**Support is Available**

📞 **SAMHSA National Helpline**
   1-800-662-4357 (24/7, 365 days)
   Free, confidential treatment referrals

📞 **988 Suicide & Crisis Lifeline**
   Call or text 988

Recovery is possible. These professionals understand.`;
                    return response;
                }
                // Default crisis resources
                response = `**You Don't Have to Face This Alone**

📞 **988 Suicide & Crisis Lifeline**
   Call or text 988
   Available 24/7
   Trained counselors ready to help

📱 **Crisis Text Line**
   Text HOME to 741741
   If calling feels too hard, texting is okay

These professionals genuinely care. There's no judgment.

I'm also here with you. We can talk, or just sit together.`;
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const humanTransferTools = [
    evaluateHumanTransferDef,
    connectToHumanExpertDef,
    quickCrisisResourcesDef,
];
export const { getToolDefinitions, domain, definitions } = createDomainExport('crisis', humanTransferTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map