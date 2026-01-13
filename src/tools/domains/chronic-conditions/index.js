/**
 * Chronic Conditions Domain
 *
 * Tools for living well with chronic illness, pain, or disability.
 * Your body isn't the enemy. Your limits are information.
 *
 * DOMAIN: chronic-conditions
 * PERSONA AFFINITY: Maya (habits), Ferni (emotional support)
 *
 * TOOLS:
 *   Management: energyBudgeting, pacingPlan, symptomTracking
 *   Coping: griefOfChronicIllness, advocatingForSelf
 *
 * PRINCIPLES:
 * - Chronic illness requires adaptation, not just "pushing through"
 * - Pacing and energy management are essential skills
 * - Grief for the healthy self is valid
 * - You are not your illness
 *
 * SAFETY: Support, not medical advice. Encourage working with healthcare team.
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();
// ============================================================================
// TOOL: Energy Budgeting
// ============================================================================
const energyBudgetingDef = {
    id: 'energyBudgeting',
    name: 'Energy Budgeting',
    description: 'Manage limited energy with chronic conditions (spoon theory)',
    domain: 'chronic-conditions',
    tags: ['chronic', 'energy', 'spoons', 'pacing'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('energyBudgeting'),
            parameters: z.object({
                energyLevel: z.enum(['very-low', 'low', 'moderate', 'good-day']).describe("Today's energy"),
                demands: z.string().optional().describe('What do you need to do today'),
            }),
            execute: async ({ energyLevel, demands }) => {
                log.info({ agentId: ctx.agentId, energyLevel }, 'Energy budgeting');
                let response = '';
                response += '**Energy budgeting (spoon theory):**\n\n';
                response += 'With chronic conditions, you start each day with limited energy. ';
                response +=
                    'Every activity costs energy. The goal is spending wisely, not running out.\n\n';
                // Energy level context
                const levelContext = {
                    'very-low': '**Very low energy day:**\n• Essential tasks only\n• Cancel non-essentials without guilt\n• Rest is productive today\n• Delegate what you can\n• No shame in just surviving this day',
                    low: "**Low energy day:**\n• Prioritize ruthlessly (1-2 main things)\n• Build in rest between activities\n• Lower standards for everything else\n• Don't borrow from tomorrow\n• Good enough is good enough",
                    moderate: "**Moderate energy day:**\n• Pace activities with rest\n• Do demanding tasks when freshest\n• Don't overdo it just because you feel better\n• Save some for tomorrow\n• Watch for the crash",
                    'good-day': "**Good energy day:**\n• CAUTION: Don't use it all!\n• It's tempting to do everything - resist\n• Spread energy across multiple days\n• Future you will thank present you for saving some\n• Good days are for banking, not spending all",
                };
                response += levelContext[energyLevel] + '\n\n';
                // Demands
                if (demands) {
                    response += `**Your demands today:** "${demands}"\n\n`;
                    response += "Given your energy, let's categorize:\n";
                    response += '• **Must do** (health, safety, critical deadlines)\n';
                    response += '• **Should do** (important but flexible)\n';
                    response += '• **Could do** (nice but optional)\n';
                    response += "• **Delegate/cancel** (this isn't your day for this)\n\n";
                }
                response += '**Energy budgeting principles:**\n';
                response += '• Know your spoon count each morning\n';
                response += '• Assign spoon costs to activities\n';
                response += "• Don't spend what you don't have\n";
                response += "• Rest counts as an activity (and it's valuable)\n";
                response += '• Pacing > pushing through\n';
                response += '• Boom-bust cycles make everything worse\n\n';
                response += '**Energy costs (vary by person):**\n';
                response += '• Shower: 1-3 spoons\n';
                response += '• Leaving house: 2-4 spoons\n';
                response += '• Social event: 3-6 spoons\n';
                response += '• Emotional stress: 2-5 spoons\n';
                response += '• Work: varies widely\n\n';
                response += "What absolutely must happen today? Let's budget from there.";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Pacing Plan
// ============================================================================
const pacingPlanDef = {
    id: 'pacingPlan',
    name: 'Pacing Plan',
    description: 'Create a sustainable pacing plan for chronic conditions',
    domain: 'chronic-conditions',
    tags: ['chronic', 'pacing', 'sustainability', 'planning'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('pacingPlan'),
            parameters: z.object({
                currentPattern: z
                    .enum(['boom-bust', 'pushing', 'resting-too-much', 'unsure'])
                    .describe('Current pattern'),
            }),
            execute: async ({ currentPattern }) => {
                log.info({ agentId: ctx.agentId, currentPattern }, 'Creating pacing plan');
                let response = '';
                response += '**Pacing for chronic conditions:**\n\n';
                response +=
                    'Pacing is doing consistent, sustainable activity - not too much, not too little. ';
                response += 'It breaks the boom-bust cycle.\n\n';
                // Pattern-specific
                const patternResponses = {
                    'boom-bust': '**Breaking the boom-bust cycle:**\n\nYou know this pattern: Feel okay → Do all the things → Crash → Rest → Feel okay → Repeat.\n\n**The fix:**\n• On good days: do LESS than you think you can\n• On bad days: do MORE than you think you can\n• The goal is CONSISTENCY, not maximizing good days\n• Stop before you need to\n• Your baseline activity stays constant regardless of how you feel',
                    pushing: "**If you're always pushing:**\n\nPushing through doesn't make it better. It makes it worse.\n\n**Consider:**\n• Rest is productive for chronic conditions\n• Your worth isn't in your productivity\n• Pushing now = crashing later\n• Sustainable > maximum\n• What would you tell a friend with your condition?",
                    'resting-too-much': "**If you're resting too much:**\n\nFor some conditions, too much rest also backfires. Deconditioning is real.\n\n**Consider:**\n• Gentle, consistent activity beats inactivity\n• Start very small and build slowly\n• Movement often helps (in the right dose)\n• The goal is your sustainable baseline\n• Work with healthcare team on appropriate activity",
                    unsure: '**Finding your pattern:**\n\n• Track your activity and symptoms for 2 weeks\n• Look for patterns: When do you crash?\n• Identify your baseline (what you can do consistently)\n• Start from there, not from where you want to be',
                };
                response += patternResponses[currentPattern] + '\n\n';
                response += '**Pacing principles:**\n';
                response += '• **Baseline**: The activity level you can sustain most days\n';
                response += '• **Consistency**: Same-ish activity regardless of how you feel\n';
                response += "• **Breaks**: Rest BEFORE you're exhausted\n";
                response += '• **Gradual increase**: 10% max, if stable for weeks\n';
                response += '• **Listen**: Pain/fatigue signals matter\n\n';
                response += '**Daily pacing checklist:**\n';
                response += '• Planned rest breaks throughout day\n';
                response += '• Activity-rest ratios (e.g., 20 min activity : 10 min rest)\n';
                response += '• Priority tasks matched to best energy times\n';
                response += '• Buffer time for unexpected energy drains\n';
                response += '• Stopping before depletion\n\n';
                response += 'What does a sustainable day look like for you?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Grief of Chronic Illness
// ============================================================================
const griefChronicDef = {
    id: 'griefOfChronicIllness',
    name: 'Grief of Chronic Illness',
    description: 'Process the grief that comes with chronic conditions',
    domain: 'chronic-conditions',
    tags: ['chronic', 'grief', 'loss', 'acceptance'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('griefOfChronicIllness'),
            parameters: z.object({
                loss: z.string().optional().describe('What have you lost to your condition'),
            }),
            execute: async ({ loss }) => {
                log.info({ agentId: ctx.agentId }, 'Chronic illness grief');
                let response = '';
                response += '**Grief of chronic illness:**\n\n';
                if (loss) {
                    response += `You're grieving: "${loss}"\n\n`;
                }
                response +=
                    'Chronic illness brings grief. This is real, valid, and often invisible to others.\n\n';
                response += '**What you might be grieving:**\n';
                response += '• Your healthy self\n';
                response += '• The life you planned\n';
                response += '• Energy and spontaneity\n';
                response += '• Activities you loved\n';
                response += "• Relationships that couldn't handle it\n";
                response += '• Career possibilities\n';
                response += '• Independence\n';
                response += '• Feeling "normal"\n\n';
                response += '**The unique nature of chronic illness grief:**\n';
                response += "• It's ongoing (not a one-time loss)\n";
                response += "• Others often don't recognize it\n";
                response += '• You may grieve anew with each flare or loss\n';
                response += '• There\'s no "getting over it"\n';
                response += "• Acceptance isn't giving up\n\n";
                response += '**Holding space for grief:**\n';
                response += '• Your feelings are valid\n';
                response += '• You can grieve and live fully\n';
                response += '• Grief and acceptance can coexist\n';
                response += "• Bad days don't erase progress\n";
                response += "• You're allowed to be angry/sad/frustrated\n\n";
                response += '**Moving with grief (not past it):**\n';
                response += "• Let yourself feel (don't bypass)\n";
                response += '• Find community who understands\n';
                response += '• Celebrate what you can do\n';
                response += '• Adapt rather than abandon activities\n';
                response += '• Build a meaningful life with the illness, not despite it\n\n';
                response += "What are you grieving right now? I'm here to listen.";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Advocating for Self
// ============================================================================
const advocatingForSelfDef = {
    id: 'advocatingForSelf',
    name: 'Advocating for Self',
    description: 'Advocate for your needs with healthcare and others',
    domain: 'chronic-conditions',
    tags: ['chronic', 'advocacy', 'healthcare', 'communication'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('advocatingForSelf'),
            parameters: z.object({
                situation: z
                    .enum(['healthcare', 'work', 'family', 'friends', 'general'])
                    .describe('Where you need to advocate'),
            }),
            execute: async ({ situation }) => {
                log.info({ agentId: ctx.agentId, situation }, 'Self-advocacy');
                let response = '';
                response += `**Advocating for yourself (${situation}):**\n\n`;
                response += 'Self-advocacy is essential with chronic conditions. ';
                response += 'You know your body. Your needs are valid.\n\n';
                const situationAdvice = {
                    healthcare: '**With healthcare providers:**\n\n• You are the expert on your experience\n• Prepare: write down symptoms, questions, concerns\n• Bring a list of medications and tried treatments\n• Ask for explanations you understand\n• Get second opinions when needed\n• If dismissed: "I need you to take this seriously"\n• Document everything\n• You can fire your doctor\n\n**Scripts:**\n• "I need you to document that in my chart"\n• "What else could this be?"\n• "I\'d like to try [treatment]. Can you explain why not?"\n• "I\'m not satisfied with this explanation"',
                    work: '**At work:**\n\n• Know your rights (ADA in US, etc.)\n• You don\'t have to disclose everything\n• Focus on accommodations, not diagnosis\n• Be specific about what you need\n• Document requests and responses\n• HR is a resource (and witness)\n\n**Scripts:**\n• "I need [specific accommodation] to do my job effectively"\n• "I have a medical condition that affects [X]. I need [Y]."\n• "What\'s the process for requesting accommodations?"',
                    family: '**With family:**\n\n• They may not understand invisible illness\n• Education helps (send articles, explain)\n• Be specific about what you need\n• Set boundaries on unsolicited advice\n• It\'s okay if they don\'t get it completely\n\n**Scripts:**\n• "I know you can\'t see it, but this is real"\n• "I need you to believe me"\n• "What would help is [specific thing], not advice"\n• "I\'m not being lazy - I\'m managing an illness"',
                    friends: '**With friends:**\n\n• Real friends want to understand\n• Be honest about limitations\n• Suggest accessible activities\n• Don\'t over-apologize for needs\n• It\'s okay to decline/cancel\n\n**Scripts:**\n• "I\'d love to come but might need to leave early"\n• "Can we do [accessible alternative] instead?"\n• "I need to cancel - my body isn\'t cooperating today"\n• "Thanks for understanding"',
                    general: "**General self-advocacy:**\n\n• Your needs are valid\n• You don't owe explanations to everyone\n• Practice saying no without over-explaining\n• It's okay to ask for what you need\n• You are the authority on your experience\n• Advocating isn't complaining",
                };
                response += situationAdvice[situation] + '\n\n';
                response += '**Self-advocacy principles:**\n';
                response += '• You deserve to be believed\n';
                response += '• Reasonable accommodations are your right\n';
                response += "• You don't have to earn basic respect\n";
                response += '• Speaking up gets easier with practice\n\n';
                response += 'What specific situation do you need to advocate in?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Symptom Tracking
// ============================================================================
const symptomTrackingDef = {
    id: 'symptomTracking',
    name: 'Symptom Tracking',
    description: 'Track symptoms to identify patterns and communicate with healthcare',
    domain: 'chronic-conditions',
    tags: ['chronic', 'symptoms', 'tracking', 'patterns'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('symptomTracking'),
            parameters: z.object({
                goal: z
                    .enum(['find-triggers', 'doctor-visit', 'track-treatment', 'general'])
                    .describe("What's the tracking goal"),
            }),
            execute: async ({ goal }) => {
                log.info({ agentId: ctx.agentId, goal }, 'Symptom tracking guidance');
                let response = '';
                response += '**Symptom tracking:**\n\n';
                response += 'Tracking symptoms helps you find patterns, communicate with doctors, ';
                response += 'and understand your condition better.\n\n';
                // Goal-specific
                const goalAdvice = {
                    'find-triggers': '**To find triggers, track:**\n• Symptoms (severity 1-10)\n• Time of day\n• What you ate\n• Sleep quality/quantity\n• Activity level\n• Stress level\n• Weather/barometric pressure\n• Menstrual cycle (if applicable)\n• New exposures (foods, products, environments)\n\nLook for patterns: Does symptom X worsen after Y?',
                    'doctor-visit': "**For doctor visits, prepare:**\n• Symptom log (what, when, severity)\n• Pattern observations\n• Questions written out\n• Medication list with doses\n• What you've tried and results\n• Specific requests\n\nBring a summary: \"Since last visit, [X] symptom has been [better/worse/same]. I've noticed [pattern]. I'd like to discuss [concern].\"",
                    'track-treatment': '**To track treatment effectiveness:**\n• Baseline symptoms before starting\n• Regular symptom ratings (same time daily)\n• Side effects\n• Any changes in function/quality of life\n• Give it enough time (track for weeks, not days)\n\nCompare: Are symptoms actually better, or just a good day?',
                    general: "**General tracking tips:**\n• Keep it simple (you'll stick with it)\n• Track daily at consistent time\n• Use an app or paper - whatever works\n• Include both physical and emotional\n• Note energy levels\n• Track sleep and activity\n• Review weekly for patterns",
                };
                response += goalAdvice[goal] + '\n\n';
                response += '**What to track:**\n';
                response += '• Date/time\n';
                response += '• Symptom severity (1-10 scale)\n';
                response += '• Energy level\n';
                response += '• Sleep (hours + quality)\n';
                response += '• Activity level\n';
                response += '• Stress/mood\n';
                response += '• Potential triggers\n';
                response += '• Anything notable\n\n';
                response += '**The balance:**\n';
                response += 'Track enough to be useful, not so much it becomes another burden. ';
                response += 'Simple and sustainable beats detailed and abandoned.\n\n';
                response += 'What would be most helpful for you to track?';
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const chronicConditionsTools = [
    energyBudgetingDef,
    pacingPlanDef,
    griefChronicDef,
    advocatingForSelfDef,
    symptomTrackingDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('chronic-conditions', chronicConditionsTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map