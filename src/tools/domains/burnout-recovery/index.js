/**
 * Burnout Recovery Domain
 *
 * Tools for recognizing, recovering from, and preventing burnout.
 * Burnout is not a badge of honor - it's a serious condition.
 *
 * DOMAIN: burnout-recovery
 * PERSONA AFFINITY: Maya (habits/rest), Ferni (emotional support)
 *
 * TOOLS:
 *   Assessment: assessBurnout, burnoutWarningSign
 *   Recovery: restAsSkill, recoveryPlan, boundariesForRecovery
 *
 * PRINCIPLES:
 * - Burnout is a system failure, not a personal weakness
 * - Rest is a skill that must be learned
 * - Recovery requires structural changes, not just time off
 * - Prevention is easier than recovery
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();
// ============================================================================
// BURNOUT STAGES
// ============================================================================
const BURNOUT_STAGES = {
    honeymoon: {
        description: 'High energy, commitment, taking on everything',
        signs: [
            'Optimistic',
            'High productivity',
            'Saying yes to everything',
            'Not setting boundaries',
        ],
        risk: 'Without boundaries, this stage depletes resources',
    },
    onset: {
        description: 'Beginning signs of stress',
        signs: [
            'Fatigue at end of day',
            'Less job satisfaction',
            'Escaping into distractions',
            'Mild cynicism',
        ],
        risk: 'Often ignored or pushed through',
    },
    chronic: {
        description: 'Persistent symptoms',
        signs: [
            'Chronic exhaustion',
            'Cynicism about work',
            'Decreased performance',
            'Physical symptoms',
        ],
        risk: 'Point where intervention is critical',
    },
    crisis: {
        description: 'Symptoms become critical',
        signs: [
            'Complete exhaustion',
            'Depersonalization',
            'Feeling empty',
            'Physical/mental health issues',
        ],
        risk: 'Often requires time off and professional help',
    },
    enmeshment: {
        description: 'Burnout becomes embedded',
        signs: [
            'Chronic sadness',
            'Physical symptoms chronic',
            'Unable to function normally',
            'Depression',
        ],
        risk: 'Requires significant recovery time',
    },
};
// ============================================================================
// TOOL: Assess Burnout
// ============================================================================
const assessBurnoutDef = {
    id: 'assessBurnout',
    name: 'Assess Burnout',
    description: 'Evaluate current burnout level and stage',
    domain: 'burnout-recovery',
    tags: ['burnout', 'assessment', 'exhaustion', 'work'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('assessBurnout'),
            parameters: z.object({
                symptoms: z.string().describe('What symptoms are you experiencing'),
                duration: z.string().optional().describe('How long has this been going on'),
                workSituation: z.string().optional().describe("What's your work situation like"),
            }),
            execute: async ({ symptoms, duration, workSituation }) => {
                log.info({ agentId: ctx.agentId }, 'Assessing burnout');
                let response = '';
                response += '**Burnout Assessment:**\n\n';
                response +=
                    "Burnout isn't just being tired. It's a state of chronic stress that leads to:\n";
                response += '• **Physical and emotional exhaustion**\n';
                response += '• **Cynicism and detachment**\n';
                response += '• **Feelings of ineffectiveness**\n\n';
                // Symptoms analysis
                response += `**Your symptoms:** "${symptoms}"\n\n`;
                if (duration) {
                    response += `**Duration:** ${duration}\n`;
                    response += 'The longer symptoms persist, the deeper the recovery needed.\n\n';
                }
                // The three dimensions
                response += '**The three dimensions of burnout (check yourself):**\n\n';
                response += '**1. Exhaustion:**\n';
                response += '• Feeling drained even after rest?\n';
                response += "• Physical fatigue that doesn't lift?\n";
                response += '• Difficulty getting started each day?\n\n';
                response += '**2. Cynicism/Detachment:**\n';
                response += '• Negative/cynical about work that used to matter?\n';
                response += '• Emotionally distant from colleagues/clients?\n';
                response += '• Going through the motions?\n\n';
                response += '**3. Inefficacy:**\n';
                response += '• Feeling like nothing you do matters?\n';
                response += '• Decreased sense of accomplishment?\n';
                response += '• Doubting your competence despite evidence?\n\n';
                // Stage identification
                response += '**Burnout stages:**\n';
                for (const [stage, info] of Object.entries(BURNOUT_STAGES)) {
                    response += `\n**${stage.charAt(0).toUpperCase() + stage.slice(1)}**: ${info.description}\n`;
                    response += `Signs: ${info.signs.slice(0, 3).join(', ')}\n`;
                }
                response += '\n**Which stage resonates most with where you are?**';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Rest as Skill
// ============================================================================
const restAsSkillDef = {
    id: 'restAsSkill',
    name: 'Rest as Skill',
    description: 'Learn to rest effectively - not just stop working',
    domain: 'burnout-recovery',
    tags: ['burnout', 'rest', 'recovery', 'skill'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('restAsSkill'),
            parameters: z.object({
                restStuggle: z
                    .enum(['cant-relax', 'feel-guilty', 'still-exhausted', 'dont-know-how', 'no-time'])
                    .describe('What makes rest hard for you'),
            }),
            execute: async ({ restStuggle }) => {
                log.info({ agentId: ctx.agentId, restStuggle }, 'Teaching rest as skill');
                let response = '';
                response += '**Rest as a skill:**\n\n';
                response += "Rest isn't just 'not working.' It's an active process that must be learned, ";
                response += "especially if you've been conditioned to see rest as laziness.\n\n";
                // Address specific struggle
                const struggleResponses = {
                    'cant-relax': "If you can't relax, your nervous system is stuck in 'on.' This requires rewiring. Start with body-based rest: gentle movement, warm baths, nature. Your mind won't settle until your body does.",
                    'feel-guilty': "Guilt about resting is productivity culture damage. Rest isn't earned or deserved - it's required for function. You wouldn't guilt-trip your phone for needing to charge.",
                    'still-exhausted': "If rest isn't restoring you, you may be doing the wrong type. Not all rest is equal. You need rest that matches your depletion type.",
                    'dont-know-how': "If you don't know how to rest, you've been running on fumes so long you forgot what it feels like. Let's rebuild your rest repertoire.",
                    'no-time': "'No time' for rest means you're already in deficit. Small pockets of rest prevent the collapse that steals all your time. This isn't optional - it's urgent.",
                };
                response += `**About your struggle (${restStuggle}):**\n`;
                response += struggleResponses[restStuggle] + '\n\n';
                // Types of rest
                response += '**The 7 types of rest** (Dr. Saundra Dalton-Smith):\n\n';
                response += '1. **Physical** - Sleep, naps, stretching, massage\n';
                response += '2. **Mental** - Breaks from thinking, reduced inputs, mindless activities\n';
                response += '3. **Sensory** - Silence, darkness, reduced stimulation\n';
                response += '4. **Creative** - Beauty, nature, art, wonder\n';
                response += "5. **Emotional** - Space from others' emotions, therapy, journaling\n";
                response += '6. **Social** - Alone time OR meaningful connection (depends on depletion)\n';
                response += '7. **Spiritual** - Purpose, meaning, community, contribution\n\n';
                response += '**Which type do you most need right now?**';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Recovery Plan
// ============================================================================
const recoveryPlanDef = {
    id: 'burnoutRecoveryPlan',
    name: 'Recovery Plan',
    description: 'Create a structured burnout recovery plan',
    domain: 'burnout-recovery',
    tags: ['burnout', 'recovery', 'plan', 'structure'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('burnoutRecoveryPlan'),
            parameters: z.object({
                stage: z
                    .enum(['onset', 'chronic', 'crisis', 'recovering'])
                    .describe('Current burnout stage'),
                constraints: z
                    .string()
                    .optional()
                    .describe("What constraints do you have (can't quit job, etc)"),
            }),
            execute: async ({ stage, constraints }) => {
                log.info({ agentId: ctx.agentId, stage }, 'Creating recovery plan');
                let response = '';
                response += `**Burnout Recovery Plan (${stage} stage):**\n\n`;
                // Stage-appropriate plans
                const stagePlans = {
                    onset: {
                        immediate: [
                            'Set one clear boundary this week',
                            "Cut one commitment that isn't essential",
                            'Protect your sleep ruthlessly',
                        ],
                        shortTerm: [
                            'Build recovery time INTO your schedule',
                            'Identify and reduce energy drains',
                            'Reconnect with things that fill you up',
                        ],
                        longTerm: [
                            'Restructure workload sustainably',
                            'Build regular boundaries and stick to them',
                            'Create early warning system for future',
                        ],
                    },
                    chronic: {
                        immediate: [
                            'Talk to doctor/therapist - this is medical',
                            'Take any available time off NOW',
                            'Reduce to essential tasks only',
                        ],
                        shortTerm: [
                            'Request workload adjustments',
                            'Explore leave options if needed',
                            'Build support system',
                        ],
                        longTerm: [
                            'Consider whether this role/situation is sustainable',
                            'Develop exit plan if needed',
                            'Rebuild from foundations, not surface',
                        ],
                    },
                    crisis: {
                        immediate: [
                            'STOP. This is a health emergency.',
                            'See a doctor immediately',
                            'Take medical leave if available',
                        ],
                        shortTerm: [
                            'Complete rest - no "working on recovery"',
                            'Professional mental health support',
                            'Let others take over responsibilities',
                        ],
                        longTerm: [
                            'Fundamental life redesign required',
                            'Cannot return to pre-burnout patterns',
                            'Extended recovery timeline (months)',
                        ],
                    },
                    recovering: {
                        immediate: [
                            'Continue protecting recovery time',
                            'Resist urge to "catch up"',
                            'Monitor warning signs daily',
                        ],
                        shortTerm: [
                            'Gradually increase load (very slowly)',
                            'Build new sustainable habits',
                            'Create strong boundaries before returning fully',
                        ],
                        longTerm: [
                            'Develop personal burnout prevention system',
                            'Regular check-ins with self',
                            "Career/life design that doesn't require burnout pace",
                        ],
                    },
                };
                const plan = stagePlans[stage];
                response += '**Immediate (this week):**\n';
                plan.immediate.forEach((i) => (response += `• ${i}\n`));
                response += '\n**Short-term (this month):**\n';
                plan.shortTerm.forEach((s) => (response += `• ${s}\n`));
                response += '\n**Long-term (3-6 months):**\n';
                plan.longTerm.forEach((l) => (response += `• ${l}\n`));
                // Constraints
                if (constraints) {
                    response += `\n**Working within your constraints** ("${constraints}"):\n`;
                    response += 'Even with constraints, something must change. ';
                    response += "What's the smallest change that could make the biggest difference?\n";
                }
                response += '\n**What feels most possible to start with?**';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Burnout Warning Signs
// ============================================================================
const burnoutWarningSignsDef = {
    id: 'burnoutWarningSigns',
    name: 'Burnout Warning Signs',
    description: 'Identify early warning signs before full burnout',
    domain: 'burnout-recovery',
    tags: ['burnout', 'prevention', 'warning', 'awareness'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('burnoutWarningSigns'),
            parameters: z.object({}),
            execute: async () => {
                log.info('Sharing burnout warning signs');
                let response = '';
                response += '**Early warning signs of burnout:**\n\n';
                response += 'Catching these early prevents full burnout:\n\n';
                response += '**Physical:**\n';
                response += '• Persistent fatigue not relieved by sleep\n';
                response += '• Frequent illness (immune system suppressed)\n';
                response += '• Changes in appetite or sleep\n';
                response += '• Physical tension, headaches, GI issues\n\n';
                response += '**Emotional:**\n';
                response += '• Increased cynicism or negativity\n';
                response += '• Feeling detached or numb\n';
                response += '• Loss of motivation or satisfaction\n';
                response += '• Increased irritability\n';
                response += '• Sense of dread about work\n\n';
                response += '**Behavioral:**\n';
                response += '• Withdrawing from responsibilities\n';
                response += '• Isolating from others\n';
                response += '• Procrastinating more than usual\n';
                response += '• Using food/alcohol/screens to cope\n';
                response += '• Taking work frustrations out on others\n\n';
                response += '**Cognitive:**\n';
                response += '• Difficulty concentrating\n';
                response += '• Forgetfulness\n';
                response += '• Decreased creativity\n';
                response += '• Pessimistic outlook\n\n';
                response += '**Your personal warning signs:**\n';
                response += 'Everyone has unique early signals. What shows up for YOU first?\n\n';
                response += "**If you're seeing these signs:** This is your body asking for change. ";
                response += 'Ignoring these leads to full burnout. What change can you make TODAY?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Boundaries for Recovery
// ============================================================================
const boundariesForRecoveryDef = {
    id: 'boundariesForRecovery',
    name: 'Boundaries for Recovery',
    description: 'Set protective boundaries essential for burnout recovery',
    domain: 'burnout-recovery',
    tags: ['burnout', 'boundaries', 'protection', 'recovery'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('boundariesForRecovery'),
            parameters: z.object({
                area: z
                    .enum(['work', 'personal', 'digital', 'emotional', 'all'])
                    .describe('Area needing boundaries'),
            }),
            execute: async ({ area }) => {
                log.info({ agentId: ctx.agentId, area }, 'Setting boundaries for recovery');
                let response = '';
                response += '**Boundaries essential for burnout recovery:**\n\n';
                response +=
                    "Without boundaries, recovery is impossible. You can't heal while the wound is still open.\n\n";
                const boundaries = {
                    work: [
                        'Clear end-of-day time (and stick to it)',
                        'No work communications outside hours',
                        'Lunch away from desk',
                        'Say no to new projects during recovery',
                        'Delegate what you can',
                        'Protect recovery time like important meetings',
                    ],
                    personal: [
                        'Schedule recovery time first, then other things',
                        'Limit draining social obligations',
                        'Ask for help with responsibilities',
                        "Lower standards temporarily (house doesn't need to be perfect)",
                        'Let some things go undone',
                    ],
                    digital: [
                        'Phone-free periods/spaces',
                        'Turn off notifications',
                        'No screens before bed',
                        'Time limits on draining apps',
                        'Unsubscribe/unfollow what drains you',
                    ],
                    emotional: [
                        'Limit time with energy-draining people',
                        "Say no to others' emotional crises (temporarily)",
                        'Protect yourself from news/content that overwhelms',
                        'Allow yourself to feel without fixing',
                        'Seek support instead of giving it (for now)',
                    ],
                };
                if (area === 'all') {
                    for (const [cat, items] of Object.entries(boundaries)) {
                        response += `**${cat.charAt(0).toUpperCase() + cat.slice(1)}:**\n`;
                        items.slice(0, 3).forEach((item) => (response += `• ${item}\n`));
                        response += '\n';
                    }
                }
                else {
                    response += `**${area.charAt(0).toUpperCase() + area.slice(1)} boundaries:**\n`;
                    boundaries[area].forEach((item) => (response += `• ${item}\n`));
                }
                response += '\n**Scripts for boundary-setting during recovery:**\n';
                response += '• "I\'m not available for that right now."\n';
                response += '• "I need to protect my recovery - I can\'t take that on."\n';
                response += '• "My doctor/therapist has advised I reduce my load."\n';
                response +=
                    '• "I\'m at capacity. Something would have to come off for me to add this."\n\n';
                response += "**What's the most important boundary for you to set this week?**";
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const burnoutRecoveryTools = [
    assessBurnoutDef,
    restAsSkillDef,
    recoveryPlanDef,
    burnoutWarningSignsDef,
    boundariesForRecoveryDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('burnout-recovery', burnoutRecoveryTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map