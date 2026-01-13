/**
 * Coaching & Support Domain Tools
 *
 * EXTENDS: self-compassion domain
 *
 * Comprehensive coaching tools that complement the core self-compassion domain.
 * While self-compassion has foundational tools (inner critic, self-acceptance,
 * Kristin Neff methods), this module adds practical life coaching tools:
 * - Motivation, discipline, procrastination
 * - Boundaries, communication, conflict resolution
 * - Burnout recovery, energy restoration
 * - Parenting, elder care, family support
 * - Dating, relationships, breakup support
 * - Habits, sleep, anger management
 *
 * NOTE: All tools register under 'self-compassion' domain to consolidate
 * related coaching functionality in one domain namespace.
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
const log = getLogger();
// ============================================================================
// MOTIVATION & DISCIPLINE TOOLS
// ============================================================================
const motivationCoachingDef = {
    id: 'motivationCoaching',
    name: 'Motivation Coaching',
    description: 'Help find and sustain motivation',
    domain: 'self-compassion',
    tags: ['motivation', 'coaching', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide motivation coaching based on what drives the user',
            parameters: z.object({
                area: z.string().optional().describe('Area needing motivation'),
                currentState: z
                    .enum(['stuck', 'discouraged', 'procrastinating', 'overwhelmed', 'general'])
                    .optional(),
            }),
            execute: async ({ area, currentState }) => {
                log.info({ agentId: ctx.agentId, area }, 'Providing motivation coaching');
                let response = `**Finding Your Motivation**\n\n`;
                if (area) {
                    response += `Let's explore what's happening with ${area}.\n\n`;
                }
                response += `**Understanding What Drives You:**\n\n`;
                response += `Motivation isn't one-size-fits-all. What works depends on your type:\n\n`;
                response += `**1. Intrinsic Motivation** (Doing it for the love of it)\n`;
                response += `- Connect to meaning: Why does this matter to you personally?\n`;
                response += `- Focus on mastery: What skills are you building?\n`;
                response += `- Find the joy: What part of this do you actually enjoy?\n\n`;
                response += `**2. External Motivation** (Goals and rewards)\n`;
                response += `- Set clear milestones and celebrate them\n`;
                response += `- Create accountability through sharing goals\n`;
                response += `- Design rewards that feel meaningful\n\n`;
                response += `**3. Fear-Based Motivation** (Use carefully)\n`;
                response += `- What's at stake if you don't do this?\n`;
                response += `- This works short-term but burns out long-term\n\n`;
                if (currentState === 'stuck') {
                    response += `---\n\n**For feeling stuck:**\n`;
                    response += `- Start impossibly small (2 minutes)\n`;
                    response += `- Change your environment\n`;
                    response += `- Ask: "What would I do if I weren't afraid?"\n`;
                }
                else if (currentState === 'discouraged') {
                    response += `---\n\n**For feeling discouraged:**\n`;
                    response += `- Look at how far you've come, not how far you have to go\n`;
                    response += `- Talk to yourself like you'd talk to a friend\n`;
                    response += `- Remember: Setbacks are data, not failure\n`;
                }
                else if (currentState === 'overwhelmed') {
                    response += `---\n\n**For feeling overwhelmed:**\n`;
                    response += `- What's the ONE thing that matters most right now?\n`;
                    response += `- Break it into smaller pieces\n`;
                    response += `- Give yourself permission to do less but better\n`;
                }
                response += `\n\nWhat's getting in the way of your motivation right now?`;
                return response;
            },
        });
    },
};
const disciplineStrategyDef = {
    id: 'disciplineStrategy',
    name: 'Discipline Strategy',
    description: 'Build discipline and consistency',
    domain: 'self-compassion',
    tags: ['discipline', 'consistency', 'habits'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help develop discipline strategies',
            parameters: z.object({
                area: z.string().optional().describe('Area needing discipline'),
                challenge: z.string().optional().describe('Main challenge with discipline'),
            }),
            execute: async ({ area, challenge }) => {
                log.info({ agentId: ctx.agentId, area }, 'Building discipline strategy');
                let response = `**Building Discipline**\n\n`;
                response += `Here's the truth: Discipline isn't about willpower. It's about systems.\n\n`;
                response += `**The Discipline Framework:**\n\n`;
                response += `**1. Reduce Friction**\n`;
                response += `- Make the good thing easier to do\n`;
                response += `- Prepare in advance (lay out clothes, prep meals)\n`;
                response += `- Remove obstacles before you need to act\n\n`;
                response += `**2. Increase Friction for Bad Habits**\n`;
                response += `- Make distractions harder to access\n`;
                response += `- Add steps between you and temptation\n`;
                response += `- Use app blockers, move your phone\n\n`;
                response += `**3. Commitment Devices**\n`;
                response += `- Tell others your goals (social accountability)\n`;
                response += `- Pre-schedule your activities\n`;
                response += `- Put money on the line if helpful\n\n`;
                response += `**4. Identity-Based Approach**\n`;
                response += `- "I am someone who [behavior]"\n`;
                response += `- Every action is a vote for who you want to be\n`;
                response += `- Focus on being, not just doing\n\n`;
                response += `**5. Energy Management**\n`;
                response += `- Do hard things when your energy is highest\n`;
                response += `- Protect sleep, nutrition, exercise\n`;
                response += `- Discipline depletes with fatigue\n\n`;
                if (challenge) {
                    response += `---\n\nYou mentioned: "${challenge}"\n`;
                    response += `Let's design a specific system for this. What's the behavior you want to be more consistent with?`;
                }
                else {
                    response += `What area would you like to build more discipline around?`;
                }
                return response;
            },
        });
    },
};
const procrastinationSupportDef = {
    id: 'procrastinationSupport',
    name: 'Procrastination Support',
    description: 'Overcome procrastination patterns',
    domain: 'self-compassion',
    tags: ['procrastination', 'productivity', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help overcome procrastination',
            parameters: z.object({
                task: z.string().optional().describe('Task being avoided'),
                reason: z.string().optional().describe('Why procrastinating if known'),
            }),
            execute: async ({ task, reason }) => {
                log.info({ agentId: ctx.agentId, task }, 'Providing procrastination support');
                let response = `**Understanding Your Procrastination**\n\n`;
                if (task) {
                    response += `The task: ${task}\n\n`;
                }
                response += `Procrastination isn't laziness - it's usually emotional avoidance.\n\n`;
                response += `**Common Underlying Causes:**\n\n`;
                response += `- **Fear of failure** - "What if I try and it's not good enough?"\n`;
                response += `- **Perfectionism** - "I can't start until conditions are perfect"\n`;
                response += `- **Overwhelm** - "I don't know where to start"\n`;
                response += `- **Lack of meaning** - "Why does this even matter?"\n`;
                response += `- **Rebellion** - "I shouldn't have to do this"\n\n`;
                response += `**Breaking Through:**\n\n`;
                response += `**1. The 2-Minute Start**\n`;
                response += `Just do 2 minutes. Often starting is the hardest part.\n\n`;
                response += `**2. Shrink the Task**\n`;
                response += `What's the smallest possible action? Do that.\n\n`;
                response += `**3. Embrace Imperfect**\n`;
                response += `A mediocre start beats a perfect plan you never execute.\n\n`;
                response += `**4. Schedule It**\n`;
                response += `Put it on your calendar. Treat it like a meeting.\n\n`;
                response += `**5. Understand the Cost**\n`;
                response += `What's this procrastination actually costing you emotionally?\n\n`;
                if (reason) {
                    response += `---\n\nYou mentioned: "${reason}"\n`;
                    response += `That's helpful self-awareness. `;
                }
                response += `What do you think is really behind this avoidance?`;
                return response;
            },
        });
    },
};
// ============================================================================
// BOUNDARY & RELATIONSHIP TOOLS
// ============================================================================
const boundaryCoachingDef = {
    id: 'boundaryCoaching',
    name: 'Boundary Coaching',
    description: 'Learn to set and maintain healthy boundaries',
    domain: 'self-compassion',
    tags: ['boundaries', 'relationships', 'coaching'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help with setting and maintaining boundaries',
            parameters: z.object({
                relationship: z.string().optional().describe('Relationship needing boundaries'),
                situation: z.string().optional().describe('Specific situation'),
            }),
            execute: async ({ relationship, situation }) => {
                log.info({ agentId: ctx.agentId, relationship }, 'Providing boundary coaching');
                let response = `**Setting Healthy Boundaries**\n\n`;
                if (relationship) {
                    response += `Relationship: ${relationship}\n\n`;
                }
                response += `Boundaries aren't walls - they're guidelines for how you want to be treated.\n\n`;
                response += `**The Boundary Framework:**\n\n`;
                response += `**1. Identify the Need**\n`;
                response += `- What's not working for you right now?\n`;
                response += `- What would feel better?\n`;
                response += `- What do you need to protect?\n\n`;
                response += `**2. Communicate Clearly**\n`;
                response += `- Use "I" statements: "I need..." not "You always..."\n`;
                response += `- Be specific about the behavior and your need\n`;
                response += `- State consequences if needed, without threatening\n\n`;
                response += `**3. Sample Scripts**\n`;
                response += `- "I need some time to myself in the evenings."\n`;
                response += `- "I'm not available for work calls after 6pm."\n`;
                response += `- "I can't take on that project right now."\n`;
                response += `- "When you [behavior], I feel [feeling]. I need [request]."\n\n`;
                response += `**4. Hold the Boundary**\n`;
                response += `- Pushback is normal - hold firm\n`;
                response += `- You don't need to justify or over-explain\n`;
                response += `- Follow through on stated consequences\n\n`;
                response += `**Remember:**\n`;
                response += `- You're allowed to have needs\n`;
                response += `- "No" is a complete sentence\n`;
                response += `- Others' discomfort with your boundary is theirs to manage\n\n`;
                if (situation) {
                    response += `---\n\nFor your situation: "${situation}"\n`;
                }
                response += `What boundary would you like to work on?`;
                return response;
            },
        });
    },
};
const communicationStrategyDef = {
    id: 'communicationStrategy',
    name: 'Communication Strategy',
    description: 'Develop better communication approaches',
    domain: 'self-compassion',
    tags: ['communication', 'relationships', 'strategy'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help develop communication strategies',
            parameters: z.object({
                context: z.string().optional().describe('Communication context'),
                challenge: z.string().optional().describe('Communication challenge'),
            }),
            execute: async ({ context, challenge }) => {
                log.info({ agentId: ctx.agentId, context }, 'Developing communication strategy');
                let response = `**Communication Strategy**\n\n`;
                if (context) {
                    response += `Context: ${context}\n\n`;
                }
                response += `**Core Communication Principles:**\n\n`;
                response += `**1. Listen First**\n`;
                response += `- Seek to understand before being understood\n`;
                response += `- Ask questions before sharing your view\n`;
                response += `- Reflect back what you hear\n\n`;
                response += `**2. Be Clear and Direct**\n`;
                response += `- Say what you mean\n`;
                response += `- Ask for what you need\n`;
                response += `- Don't hint or expect mind-reading\n\n`;
                response += `**3. Own Your Experience**\n`;
                response += `- "I feel..." not "You make me feel..."\n`;
                response += `- "I need..." not "You should..."\n`;
                response += `- Your perception is valid even if it differs\n\n`;
                response += `**4. Difficult Conversations Framework:**\n`;
                response += `- **Open:** "I want to talk about something important."\n`;
                response += `- **Observe:** Share facts, not judgments\n`;
                response += `- **Feel:** Share your emotional experience\n`;
                response += `- **Need:** State what you need\n`;
                response += `- **Request:** Make a specific ask\n\n`;
                if (challenge) {
                    response += `---\n\nYour challenge: "${challenge}"\n`;
                    response += `Let's work through how to approach this conversation.`;
                }
                else {
                    response += `What conversation would you like help with?`;
                }
                return response;
            },
        });
    },
};
const conflictResolutionDef = {
    id: 'conflictResolution',
    name: 'Conflict Resolution',
    description: 'Navigate and resolve conflicts',
    domain: 'self-compassion',
    tags: ['conflict', 'relationships', 'resolution'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help navigate conflict situations',
            parameters: z.object({
                parties: z.string().optional().describe('Who is involved'),
                issue: z.string().optional().describe('Core issue'),
            }),
            execute: async ({ parties, issue }) => {
                log.info({ agentId: ctx.agentId, parties }, 'Providing conflict resolution guidance');
                let response = `**Navigating Conflict**\n\n`;
                if (issue) {
                    response += `The issue: ${issue}\n\n`;
                }
                response += `Conflict isn't inherently bad - it's how we handle it that matters.\n\n`;
                response += `**Conflict Resolution Steps:**\n\n`;
                response += `**1. Cool Down First**\n`;
                response += `- Don't engage when emotions are at their peak\n`;
                response += `- Take time if needed: "I need to think about this."\n`;
                response += `- But don't avoid indefinitely\n\n`;
                response += `**2. Understand Their Side**\n`;
                response += `- What might their experience be?\n`;
                response += `- What do they need that they're not getting?\n`;
                response += `- What's the most generous interpretation?\n\n`;
                response += `**3. Express Without Blame**\n`;
                response += `- "When X happened, I felt Y"\n`;
                response += `- Focus on impact, not intent\n`;
                response += `- Avoid "always" and "never"\n\n`;
                response += `**4. Find Common Ground**\n`;
                response += `- What do you both want?\n`;
                response += `- What can you agree on?\n`;
                response += `- Work from shared goals outward\n\n`;
                response += `**5. Problem-Solve Together**\n`;
                response += `- "How can we solve this?"\n`;
                response += `- Generate options without judging\n`;
                response += `- Find solutions that work for both\n\n`;
                response += `**If Resolution Isn't Possible:**\n`;
                response += `- Accept what you can't change\n`;
                response += `- Set boundaries to protect yourself\n`;
                response += `- Consider if the relationship is sustainable\n\n`;
                response += `What aspect of this conflict would you like to explore?`;
                return response;
            },
        });
    },
};
// ============================================================================
// SELF-COMPASSION TOOLS
// ============================================================================
const selfCompassionCoachingDef = {
    id: 'selfCompassionCoaching',
    name: 'Self-Compassion Coaching',
    description: 'Develop self-compassion practices',
    domain: 'self-compassion',
    tags: ['self-compassion', 'mindfulness', 'coaching'],
    create: (ctx) => {
        return llm.tool({
            description: 'Guide self-compassion practice',
            parameters: z.object({
                situation: z.string().optional().describe('Current difficult situation'),
                innerCritic: z.string().optional().describe('What the inner critic is saying'),
            }),
            execute: async ({ situation, innerCritic }) => {
                log.info({ agentId: ctx.agentId }, 'Providing self-compassion coaching');
                let response = `**Self-Compassion Practice**\n\n`;
                response += `Self-compassion isn't self-indulgence - it's treating yourself with the same kindness you'd show a good friend.\n\n`;
                response += `**The Three Components:**\n\n`;
                response += `**1. Self-Kindness** (vs. Self-Judgment)\n`;
                response += `- Talk to yourself like you'd talk to a friend\n`;
                response += `- "This is hard" instead of "I'm failing"\n`;
                response += `- Allow imperfection\n\n`;
                response += `**2. Common Humanity** (vs. Isolation)\n`;
                response += `- Everyone struggles - this is part of being human\n`;
                response += `- You're not uniquely flawed\n`;
                response += `- Suffering connects us all\n\n`;
                response += `**3. Mindfulness** (vs. Over-Identification)\n`;
                response += `- Notice difficult feelings without drowning in them\n`;
                response += `- "I'm having the thought that..." not "I am..."\n`;
                response += `- Observe without judgment\n\n`;
                if (innerCritic) {
                    response += `---\n\n**Your inner critic says:** "${innerCritic}"\n\n`;
                    response += `**Compassionate reframe:**\n`;
                    response += `What would you say to a friend who told you they felt this way about themselves?\n\n`;
                }
                if (situation) {
                    response += `**For your situation:** ${situation}\n\n`;
                }
                response += `**Self-Compassion Break:**\n`;
                response += `1. "This is a moment of suffering" (mindfulness)\n`;
                response += `2. "Suffering is part of life" (common humanity)\n`;
                response += `3. "May I be kind to myself" (self-kindness)\n\n`;
                response += `What's making it hard to be compassionate with yourself right now?`;
                return response;
            },
        });
    },
};
const affirmWorthDef = {
    id: 'affirmWorth',
    name: 'Affirm Worth',
    description: 'Reconnect with inherent self-worth',
    domain: 'self-compassion',
    tags: ['self-worth', 'affirmation', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help affirm self-worth',
            parameters: z.object({
                struggle: z.string().optional().describe('What is challenging self-worth'),
            }),
            execute: async ({ struggle }) => {
                log.info({ agentId: ctx.agentId }, 'Affirming worth');
                let response = `**Your Inherent Worth**\n\n`;
                if (struggle) {
                    response += `I hear you're struggling with: ${struggle}\n\n`;
                }
                response += `Here's what I want you to know:\n\n`;
                response += `**Your worth is not:**\n`;
                response += `- Based on your productivity\n`;
                response += `- Determined by others' opinions\n`;
                response += `- Dependent on your achievements\n`;
                response += `- Conditional on being "enough"\n`;
                response += `- Something you need to earn\n\n`;
                response += `**Your worth is:**\n`;
                response += `- Inherent - you were born with it\n`;
                response += `- Unchanging - it doesn't fluctuate with circumstances\n`;
                response += `- Unconditional - no strings attached\n`;
                response += `- Already complete - nothing to prove\n\n`;
                response += `**Reflection:**\n`;
                response += `Think of a child you love. Their worth isn't conditional on what they do or achieve. They are worthy simply because they exist.\n\n`;
                response += `You are the same. You always have been.\n\n`;
                response += `**Today's Practice:**\n`;
                response += `Place your hand on your heart and say: "I am worthy of love and belonging, exactly as I am."\n\n`;
                response += `What makes it hard to believe this about yourself?`;
                return response;
            },
        });
    },
};
const addressPerfectionismDef = {
    id: 'addressPerfectionism',
    name: 'Address Perfectionism',
    description: 'Work with perfectionist patterns',
    domain: 'self-compassion',
    tags: ['perfectionism', 'self-compassion', 'growth'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help address perfectionism',
            parameters: z.object({
                area: z.string().optional().describe('Area where perfectionism shows up'),
            }),
            execute: async ({ area }) => {
                log.info({ agentId: ctx.agentId, area }, 'Addressing perfectionism');
                let response = `**Understanding Your Perfectionism**\n\n`;
                if (area) {
                    response += `Area: ${area}\n\n`;
                }
                response += `Perfectionism isn't about high standards - it's about fear. Fear of failure, judgment, or not being "enough."\n\n`;
                response += `**Perfectionism vs. Excellence:**\n\n`;
                response += `| Perfectionism | Excellence |\n`;
                response += `| Fear-driven | Growth-driven |\n`;
                response += `| All-or-nothing | Progress-focused |\n`;
                response += `| Focused on avoiding failure | Focused on learning |\n`;
                response += `| Never satisfied | Celebrates wins |\n`;
                response += `| Paralyzing | Energizing |\n\n`;
                response += `**Strategies for Perfectionism:**\n\n`;
                response += `**1. Embrace "Good Enough"**\n`;
                response += `- Done is better than perfect\n`;
                response += `- Ask: "What's the minimum viable version?"\n`;
                response += `- Set a "completion point" and stop there\n\n`;
                response += `**2. Redefine Failure**\n`;
                response += `- Failure is data, not identity\n`;
                response += `- Every expert was once a beginner\n`;
                response += `- Mistakes are required for growth\n\n`;
                response += `**3. Check Your Standards**\n`;
                response += `- Would you hold a friend to this standard?\n`;
                response += `- Who says it needs to be this way?\n`;
                response += `- What would happen if it were 80% instead of 100%?\n\n`;
                response += `**4. Befriend Your Inner Critic**\n`;
                response += `- It's trying to protect you (but it's misguided)\n`;
                response += `- Thank it and choose a different response\n\n`;
                response += `What would you do if you weren't afraid of doing it imperfectly?`;
                return response;
            },
        });
    },
};
// ============================================================================
// BURNOUT & ENERGY TOOLS
// ============================================================================
const burnoutCoachingDef = {
    id: 'burnoutCoaching',
    name: 'Burnout Coaching',
    description: 'Support burnout recovery and prevention',
    domain: 'self-compassion',
    tags: ['burnout', 'recovery', 'energy'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide burnout support and coaching',
            parameters: z.object({
                severity: z.enum(['early-signs', 'moderate', 'severe', 'recovering']).optional(),
                mainSymptom: z.string().optional().describe('Primary symptom'),
            }),
            execute: async ({ severity, mainSymptom }) => {
                log.info({ agentId: ctx.agentId, severity }, 'Providing burnout coaching');
                let response = `**Burnout Recovery Support**\n\n`;
                if (severity) {
                    response += `Stage: ${severity}\n\n`;
                }
                response += `Burnout is your body's way of saying "this is not sustainable." It's a message, not a moral failing.\n\n`;
                response += `**Understanding Burnout:**\n\n`;
                response += `Burnout has three components:\n`;
                response += `1. **Exhaustion** - Physical and emotional depletion\n`;
                response += `2. **Cynicism** - Detachment and negativity\n`;
                response += `3. **Inefficacy** - Feeling ineffective or that nothing matters\n\n`;
                if (severity === 'early-signs') {
                    response += `**Early Intervention (You caught it early!):**\n`;
                    response += `- Set boundaries NOW before it gets worse\n`;
                    response += `- Protect your sleep aggressively\n`;
                    response += `- Schedule recovery activities\n`;
                    response += `- Identify what's draining you most\n\n`;
                }
                else if (severity === 'moderate' || severity === 'severe') {
                    response += `**Recovery Steps:**\n\n`;
                    response += `**1. Stop the Bleeding**\n`;
                    response += `- What can you remove or delegate immediately?\n`;
                    response += `- Take time off if at all possible\n`;
                    response += `- Lower expectations temporarily\n\n`;
                    response += `**2. Restore Basics**\n`;
                    response += `- Sleep: This is non-negotiable\n`;
                    response += `- Movement: Even a short walk helps\n`;
                    response += `- Connection: Be with people who restore you\n`;
                    response += `- Nutrition: Fuel your recovery\n\n`;
                    response += `**3. Address Root Causes**\n`;
                    response += `- What's unsustainable about your situation?\n`;
                    response += `- What needs to change long-term?\n`;
                    response += `- What conversations need to happen?\n\n`;
                    if (severity === 'severe') {
                        response += `⚠️ **Severe burnout is a serious health concern.** Please consider talking to a healthcare provider or therapist.\n\n`;
                    }
                }
                else if (severity === 'recovering') {
                    response += `**Maintaining Recovery:**\n`;
                    response += `- Recovery isn't linear - expect ups and downs\n`;
                    response += `- Build in buffers to prevent relapse\n`;
                    response += `- Stay connected to what matters\n`;
                    response += `- Create systems that protect you\n\n`;
                }
                if (mainSymptom) {
                    response += `---\n\nYour main symptom: ${mainSymptom}\n`;
                }
                response += `What feels most urgent to address right now?`;
                return response;
            },
        });
    },
};
const restoreEnergyDef = {
    id: 'restoreEnergy',
    name: 'Restore Energy',
    description: 'Strategies for energy restoration',
    domain: 'self-compassion',
    tags: ['energy', 'restoration', 'self-care'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help restore energy levels',
            parameters: z.object({
                energyLevel: z.enum(['depleted', 'low', 'moderate', 'need-boost']).optional(),
                timeAvailable: z.string().optional().describe('Time available for restoration'),
            }),
            execute: async ({ energyLevel, timeAvailable }) => {
                log.info({ agentId: ctx.agentId, energyLevel }, 'Restoring energy');
                let response = `**Energy Restoration**\n\n`;
                if (energyLevel) {
                    response += `Current level: ${energyLevel}\n\n`;
                }
                response += `**Quick Wins (5-15 minutes):**\n`;
                response += `- Step outside - fresh air and nature reset\n`;
                response += `- Cold water on face - activates alertness\n`;
                response += `- Brief movement - walk, stretch, shake it out\n`;
                response += `- Breathwork - 4-7-8 breathing calms the nervous system\n`;
                response += `- Power nap - 10-20 minutes max\n\n`;
                response += `**Medium Investments (30-60 minutes):**\n`;
                response += `- Exercise - especially outdoors\n`;
                response += `- Social connection with someone who energizes you\n`;
                response += `- Something creative or playful\n`;
                response += `- A proper meal (not at your desk)\n\n`;
                response += `**Deeper Restoration:**\n`;
                response += `- Quality sleep is the foundation\n`;
                response += `- Unstructured time (no agenda)\n`;
                response += `- Activities that create "flow"\n`;
                response += `- Time in nature\n`;
                response += `- Saying no to drain activities\n\n`;
                response += `**Know Your Energy Patterns:**\n`;
                response += `- When is your natural peak energy?\n`;
                response += `- What activities restore vs. drain you?\n`;
                response += `- Who energizes vs. exhausts you?\n\n`;
                if (timeAvailable) {
                    response += `---\n\nWith ${timeAvailable}, here's what I'd suggest...\n`;
                }
                response += `What type of energy restoration feels most needed right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// PARENTING & FAMILY SUPPORT
// ============================================================================
const parentingSupportDef = {
    id: 'parentingSupport',
    name: 'Parenting Support',
    description: 'Support for parenting challenges',
    domain: 'self-compassion',
    tags: ['parenting', 'family', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide parenting support and guidance',
            parameters: z.object({
                childAge: z.string().optional().describe('Age of child'),
                challenge: z.string().optional().describe('Parenting challenge'),
            }),
            execute: async ({ childAge, challenge }) => {
                log.info({ agentId: ctx.agentId, childAge }, 'Providing parenting support');
                let response = `**Parenting Support**\n\n`;
                response += `Parenting is one of the hardest jobs there is, and there's no manual. You're doing better than you think.\n\n`;
                if (challenge) {
                    response += `Challenge: ${challenge}\n\n`;
                }
                response += `**Core Principles:**\n\n`;
                response += `**1. Connection Before Correction**\n`;
                response += `- Kids need to feel understood before they can hear guidance\n`;
                response += `- Get on their level, make eye contact\n`;
                response += `- Name what they're feeling\n\n`;
                response += `**2. You Can't Pour From Empty**\n`;
                response += `- Your wellbeing matters for their wellbeing\n`;
                response += `- Model self-care, not self-sacrifice\n`;
                response += `- Get support when you need it\n\n`;
                response += `**3. Rupture and Repair**\n`;
                response += `- You will lose your temper sometimes - that's normal\n`;
                response += `- What matters is repairing: "I'm sorry I yelled"\n`;
                response += `- This models healthy conflict resolution\n\n`;
                response += `**4. Good Enough > Perfect**\n`;
                response += `- "Good enough" parenting is actually optimal\n`;
                response += `- Kids need real humans, not perfect ones\n`;
                response += `- Consistency matters more than perfection\n\n`;
                if (childAge) {
                    response += `---\n\nFor a ${childAge}-year-old, what's most important to remember is that their brain is still developing. Their behavior makes sense for their developmental stage, even when it's challenging.\n\n`;
                }
                response += `What specific parenting situation would you like support with?`;
                return response;
            },
        });
    },
};
const elderCareSupportDef = {
    id: 'elderCareSupport',
    name: 'Elder Care Support',
    description: 'Support for caring for aging parents',
    domain: 'self-compassion',
    tags: ['eldercare', 'caregiving', 'family'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide elder care support',
            parameters: z.object({
                situation: z.string().optional().describe('Caregiving situation'),
                challenge: z.string().optional().describe('Main challenge'),
            }),
            execute: async ({ situation, challenge }) => {
                log.info({ agentId: ctx.agentId }, 'Providing elder care support');
                let response = `**Elder Care Support**\n\n`;
                response += `Caring for aging parents is one of the most complex challenges of adulthood. It's okay to find this hard.\n\n`;
                if (challenge) {
                    response += `Your challenge: ${challenge}\n\n`;
                }
                response += `**Key Considerations:**\n\n`;
                response += `**1. Take Care of Yourself**\n`;
                response += `- Caregiver burnout is real and common\n`;
                response += `- You can't help them if you're depleted\n`;
                response += `- Accept help when it's offered\n\n`;
                response += `**2. Have the Hard Conversations**\n`;
                response += `- Discuss wishes early, before crisis\n`;
                response += `- Talk about finances, healthcare wishes, end-of-life\n`;
                response += `- Include siblings/family if relevant\n\n`;
                response += `**3. Get Organized**\n`;
                response += `- Gather important documents\n`;
                response += `- Understand their medical situation\n`;
                response += `- Know their financial picture\n`;
                response += `- Research available resources and support\n\n`;
                response += `**4. Set Boundaries**\n`;
                response += `- You can love them AND have limits\n`;
                response += `- Divide responsibilities among family if possible\n`;
                response += `- Know when to bring in professional help\n\n`;
                response += `**5. Process Your Emotions**\n`;
                response += `- Grief often starts before death\n`;
                response += `- Role reversal is disorienting\n`;
                response += `- Support groups can help - you're not alone\n\n`;
                response += `What aspect of elder care would you like to explore?`;
                return response;
            },
        });
    },
};
// ============================================================================
// SPECIALIZED COACHING TOOLS
// ============================================================================
const habitCoachingDef = {
    id: 'habitCoaching',
    name: 'Habit Coaching',
    description: 'Comprehensive habit formation coaching',
    domain: 'self-compassion',
    tags: ['habits', 'coaching', 'behavior-change'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide habit coaching',
            parameters: z.object({
                habitType: z.enum(['build', 'break', 'modify']).optional(),
                habit: z.string().optional().describe('The habit in question'),
            }),
            execute: async ({ habitType, habit }) => {
                log.info({ agentId: ctx.agentId, habitType, habit }, 'Providing habit coaching');
                let response = `**Habit Coaching**\n\n`;
                if (habit) {
                    response += `Habit: ${habit}\n`;
                    response += `Goal: ${habitType || 'build'}\n\n`;
                }
                response += `**The Science of Habits:**\n\n`;
                response += `Every habit has a loop: **Cue → Routine → Reward**\n\n`;
                if (habitType === 'build') {
                    response += `**Building New Habits:**\n\n`;
                    response += `**1. Start Tiny**\n`;
                    response += `- So small you can't say no\n`;
                    response += `- 2 minutes max to start\n`;
                    response += `- Success builds on success\n\n`;
                    response += `**2. Stack It**\n`;
                    response += `- "After I [existing habit], I will [new habit]"\n`;
                    response += `- Attach to something you already do\n\n`;
                    response += `**3. Make It Obvious**\n`;
                    response += `- Visual cues and reminders\n`;
                    response += `- Prepare your environment\n\n`;
                    response += `**4. Celebrate Immediately**\n`;
                    response += `- Create a small reward right after\n`;
                    response += `- Even just saying "I did it!"\n\n`;
                }
                else if (habitType === 'break') {
                    response += `**Breaking Bad Habits:**\n\n`;
                    response += `**1. Identify the Cue**\n`;
                    response += `- What triggers the habit?\n`;
                    response += `- When/where does it happen?\n\n`;
                    response += `**2. Add Friction**\n`;
                    response += `- Make the bad habit harder to do\n`;
                    response += `- Remove cues from your environment\n\n`;
                    response += `**3. Find the Real Need**\n`;
                    response += `- What need is this habit meeting?\n`;
                    response += `- Can something else meet that need?\n\n`;
                    response += `**4. Replace, Don't Just Remove**\n`;
                    response += `- Swap the routine, keep the reward\n`;
                    response += `- Nature abhors a vacuum\n\n`;
                }
                else {
                    response += `**Habit Modification:**\n`;
                    response += `- Often easier than starting fresh\n`;
                    response += `- Keep the cue and reward, change the routine\n`;
                    response += `- Gradual modification vs. cold turkey\n\n`;
                }
                response += `What habit would you like to work on?`;
                return response;
            },
        });
    },
};
const sleepSupportDef = {
    id: 'sleepSupport',
    name: 'Sleep Support',
    description: 'Support for improving sleep',
    domain: 'self-compassion',
    tags: ['sleep', 'wellness', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide sleep improvement support',
            parameters: z.object({
                issue: z.string().optional().describe('Sleep issue'),
                currentPattern: z.string().optional().describe('Current sleep pattern'),
            }),
            execute: async ({ issue, currentPattern }) => {
                log.info({ agentId: ctx.agentId, issue }, 'Providing sleep support');
                let response = `**Sleep Support**\n\n`;
                response += `Sleep is foundational to everything else. Let's address this.\n\n`;
                if (issue) {
                    response += `Your issue: ${issue}\n\n`;
                }
                response += `**Sleep Hygiene Essentials:**\n\n`;
                response += `**1. Consistent Schedule**\n`;
                response += `- Same wake time every day (yes, weekends too)\n`;
                response += `- This is more important than bedtime\n\n`;
                response += `**2. Light Exposure**\n`;
                response += `- Bright light in morning (go outside)\n`;
                response += `- Dim lights 2 hours before bed\n`;
                response += `- No screens in bed (or use warm/red modes)\n\n`;
                response += `**3. Temperature**\n`;
                response += `- Cool room (65-68°F / 18-20°C)\n`;
                response += `- Hot bath before bed can help (the cooling after induces sleepiness)\n\n`;
                response += `**4. Wind-Down Routine**\n`;
                response += `- Same routine signals to your brain it's time to sleep\n`;
                response += `- 30-60 minutes of calm activities\n`;
                response += `- No work, no stressful topics\n\n`;
                response += `**5. The Bed is for Sleep**\n`;
                response += `- Train your brain: bed = sleep\n`;
                response += `- If awake 20 min, get up and do something boring\n`;
                response += `- Return when sleepy\n\n`;
                response += `**6. Watch Your Inputs**\n`;
                response += `- No caffeine after noon (or earlier)\n`;
                response += `- Alcohol disrupts sleep quality\n`;
                response += `- Avoid big meals close to bedtime\n\n`;
                response += `What's the biggest obstacle to your sleep right now?`;
                return response;
            },
        });
    },
};
const angerCoachingDef = {
    id: 'angerCoaching',
    name: 'Anger Coaching',
    description: 'Healthy anger management coaching',
    domain: 'self-compassion',
    tags: ['anger', 'emotions', 'coaching'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide anger management coaching',
            parameters: z.object({
                trigger: z.string().optional().describe('What triggered the anger'),
                frequency: z.enum(['occasional', 'frequent', 'constant']).optional(),
            }),
            execute: async ({ trigger, frequency }) => {
                log.info({ agentId: ctx.agentId, trigger }, 'Providing anger coaching');
                let response = `**Understanding Your Anger**\n\n`;
                response += `Anger is a valid emotion - it signals that something important to you is threatened or violated. The goal isn't to eliminate anger, but to express it in healthy ways.\n\n`;
                if (trigger) {
                    response += `Your trigger: ${trigger}\n\n`;
                }
                response += `**The Anger Iceberg:**\n`;
                response += `Anger is often the visible tip. Underneath might be:\n`;
                response += `- Hurt or rejection\n`;
                response += `- Fear or anxiety\n`;
                response += `- Feeling disrespected\n`;
                response += `- Exhaustion or overwhelm\n`;
                response += `- Unmet needs\n\n`;
                response += `**In the Moment:**\n\n`;
                response += `**1. Notice the Signs**\n`;
                response += `- Tension, heat, racing heart\n`;
                response += `- The sooner you catch it, the more choice you have\n\n`;
                response += `**2. Create Space**\n`;
                response += `- "I need a moment" - take a break if possible\n`;
                response += `- Deep breaths (exhale longer than inhale)\n`;
                response += `- Don't engage when at peak intensity\n\n`;
                response += `**3. Physical Release**\n`;
                response += `- Walk, exercise, punch a pillow\n`;
                response += `- The body needs to release the energy\n\n`;
                response += `**After the Moment:**\n\n`;
                response += `- What was I really feeling beneath the anger?\n`;
                response += `- What boundary was crossed or need unmet?\n`;
                response += `- What do I actually need here?\n`;
                response += `- How can I communicate this effectively?\n\n`;
                response += `What's underneath your anger right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// RELATIONSHIP-SPECIFIC TOOLS
// ============================================================================
const breakupSupportDef = {
    id: 'breakupSupport',
    name: 'Breakup Support',
    description: 'Support through relationship endings',
    domain: 'self-compassion',
    tags: ['breakup', 'relationships', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide breakup support',
            parameters: z.object({
                timeframe: z.string().optional().describe('How recent'),
                initiated: z.enum(['me', 'them', 'mutual']).optional(),
            }),
            execute: async ({ timeframe, initiated }) => {
                log.info({ agentId: ctx.agentId, timeframe }, 'Providing breakup support');
                let response = `**Breakup Support**\n\n`;
                response += `Breakups are a form of grief. What you're feeling is normal and valid.\n\n`;
                if (timeframe) {
                    response += `It's been: ${timeframe}\n\n`;
                }
                response += `**What to Expect:**\n\n`;
                response += `- Waves of emotion (grief isn't linear)\n`;
                response += `- Good days and bad days\n`;
                response += `- Missing them even if it was the right choice\n`;
                response += `- Questioning everything\n`;
                response += `- Physical symptoms (sleep, appetite, energy)\n\n`;
                response += `**What Helps:**\n\n`;
                response += `**1. Feel Your Feelings**\n`;
                response += `- Don't rush to "move on"\n`;
                response += `- Cry if you need to\n`;
                response += `- Write, talk, process\n\n`;
                response += `**2. Maintain Basic Self-Care**\n`;
                response += `- Eat something, even if you're not hungry\n`;
                response += `- Try to sleep\n`;
                response += `- Gentle movement helps\n\n`;
                response += `**3. Lean on Support**\n`;
                response += `- Friends and family who care\n`;
                response += `- You don't have to go through this alone\n\n`;
                response += `**4. Protect Your Recovery**\n`;
                response += `- Limited or no contact with your ex (for now)\n`;
                response += `- Stay off their social media\n`;
                response += `- Don't make big decisions right now\n\n`;
                response += `**5. Be Patient**\n`;
                response += `- Healing takes time - there's no shortcut\n`;
                response += `- One day you'll realize you're okay\n\n`;
                response += `What's the hardest part right now?`;
                return response;
            },
        });
    },
};
const datingAdviceDef = {
    id: 'datingAdvice',
    name: 'Dating Advice',
    description: 'Support for dating and new relationships',
    domain: 'self-compassion',
    tags: ['dating', 'relationships', 'advice'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide dating advice',
            parameters: z.object({
                situation: z.string().optional().describe('Dating situation'),
                concern: z.string().optional().describe('Specific concern'),
            }),
            execute: async ({ situation, concern }) => {
                log.info({ agentId: ctx.agentId, situation }, 'Providing dating advice');
                let response = `**Dating Guidance**\n\n`;
                if (situation) {
                    response += `Situation: ${situation}\n\n`;
                }
                response += `**Core Dating Principles:**\n\n`;
                response += `**1. Know Yourself First**\n`;
                response += `- What do you actually want?\n`;
                response += `- What are your non-negotiables?\n`;
                response += `- What are you flexible on?\n\n`;
                response += `**2. Be Authentically You**\n`;
                response += `- Don't perform a version of yourself\n`;
                response += `- The right person will like the real you\n`;
                response += `- Vulnerability builds connection\n\n`;
                response += `**3. Look for Character**\n`;
                response += `- How do they treat others?\n`;
                response += `- How do they handle stress or conflict?\n`;
                response += `- Are they consistent over time?\n\n`;
                response += `**4. Trust Your Gut**\n`;
                response += `- If something feels off, pay attention\n`;
                response += `- You don't owe anyone your time\n`;
                response += `- It's okay to walk away\n\n`;
                response += `**5. Pace Yourself**\n`;
                response += `- Chemistry isn't the same as compatibility\n`;
                response += `- Let things develop naturally\n`;
                response += `- Someone eager to rush may be a red flag\n\n`;
                if (concern) {
                    response += `---\n\nAbout your concern: "${concern}"\n`;
                }
                response += `What specific dating situation would you like to talk through?`;
                return response;
            },
        });
    },
};
const datingAppStrategyDef = {
    id: 'datingAppStrategy',
    name: 'Dating App Strategy',
    description: 'Optimize dating app experience',
    domain: 'self-compassion',
    tags: ['dating', 'apps', 'strategy'],
    create: (ctx) => {
        return llm.tool({
            description: 'Provide dating app strategy',
            parameters: z.object({
                app: z.string().optional().describe('Which app'),
                challenge: z.string().optional().describe('Main challenge'),
            }),
            execute: async ({ app, challenge }) => {
                log.info({ agentId: ctx.agentId, app }, 'Providing dating app strategy');
                let response = `**Dating App Strategy**\n\n`;
                if (challenge) {
                    response += `Challenge: ${challenge}\n\n`;
                }
                response += `**Profile Optimization:**\n\n`;
                response += `**Photos:**\n`;
                response += `- Lead with a clear face photo (smiling)\n`;
                response += `- Include full-body and activity photos\n`;
                response += `- Show, don't tell (doing hobbies, with friends)\n`;
                response += `- Good lighting and quality matter\n`;
                response += `- Get feedback from friends\n\n`;
                response += `**Bio:**\n`;
                response += `- Specific > generic ("I love hiking to waterfalls" > "I love being outdoors")\n`;
                response += `- Show personality and humor\n`;
                response += `- Include conversation starters\n`;
                response += `- Be honest about what you want\n`;
                response += `- Keep it positive\n\n`;
                response += `**Strategy:**\n\n`;
                response += `**1. Quality Over Quantity**\n`;
                response += `- Be selective with swipes\n`;
                response += `- Send thoughtful messages, not copy-paste\n\n`;
                response += `**2. Move to Real Life**\n`;
                response += `- Don't text forever - meet in person\n`;
                response += `- Video call first if you're nervous\n`;
                response += `- Coffee or drinks, not dinner (keep it low-stakes)\n\n`;
                response += `**3. Protect Your Energy**\n`;
                response += `- Limit time on apps\n`;
                response += `- Take breaks when needed\n`;
                response += `- Don't take rejection personally\n\n`;
                response += `What specific aspect of dating apps would you like help with?`;
                return response;
            },
        });
    },
};
// ============================================================================
// SUPPORT SYSTEM TOOLS
// ============================================================================
const buildSupportSystemDef = {
    id: 'buildSupportSystem',
    name: 'Build Support System',
    description: 'Develop a support network',
    domain: 'self-compassion',
    tags: ['support', 'community', 'connection'],
    create: (ctx) => {
        return llm.tool({
            description: 'Help build a support system',
            parameters: z.object({
                currentState: z.enum(['isolated', 'few-connections', 'moderate', 'rebuilding']).optional(),
                need: z.string().optional().describe('Type of support needed'),
            }),
            execute: async ({ currentState, need }) => {
                log.info({ agentId: ctx.agentId, currentState }, 'Building support system');
                let response = `**Building Your Support System**\n\n`;
                response += `Everyone needs people. A strong support system is one of the best predictors of wellbeing.\n\n`;
                if (currentState === 'isolated') {
                    response += `Starting from a place of isolation is hard, but it's possible to build connections. Start small.\n\n`;
                }
                response += `**Types of Support You Need:**\n\n`;
                response += `1. **Emotional Support** - People who listen and understand\n`;
                response += `2. **Practical Support** - People who help with tangible needs\n`;
                response += `3. **Companionship** - People to do things with\n`;
                response += `4. **Informational Support** - People with advice or expertise\n\n`;
                response += `**Building Connections:**\n\n`;
                response += `**1. Start with Existing Ties**\n`;
                response += `- Reconnect with people you've drifted from\n`;
                response += `- Deepen existing acquaintances\n\n`;
                response += `**2. Put Yourself in Position**\n`;
                response += `- Join groups around interests\n`;
                response += `- Be a "regular" somewhere\n`;
                response += `- Say yes to invitations\n\n`;
                response += `**3. Be Vulnerable First**\n`;
                response += `- Sharing creates connection\n`;
                response += `- Ask for help - it actually builds relationship\n`;
                response += `- Be willing to initiate\n\n`;
                response += `**4. Invest Time**\n`;
                response += `- Friendship takes repeated contact\n`;
                response += `- Follow up, show up, be reliable\n\n`;
                if (need) {
                    response += `---\n\nYou mentioned needing: ${need}\n`;
                }
                response += `What kind of support feels most missing in your life right now?`;
                return response;
            },
        });
    },
};
const authenticLivingDef = {
    id: 'authenticLiving',
    name: 'Authentic Living',
    description: 'Living true to yourself',
    domain: 'self-compassion',
    tags: ['authenticity', 'values', 'self'],
    create: (ctx) => {
        return llm.tool({
            description: 'Guide authentic living',
            parameters: z.object({
                challenge: z.string().optional().describe('Authenticity challenge'),
            }),
            execute: async ({ challenge }) => {
                log.info({ agentId: ctx.agentId }, 'Guiding authentic living');
                let response = `**Living Authentically**\n\n`;
                response += `Authenticity is the daily practice of letting go of who we think we should be and embracing who we are.\n\n`;
                if (challenge) {
                    response += `Your challenge: ${challenge}\n\n`;
                }
                response += `**What Gets in the Way:**\n`;
                response += `- Fear of judgment or rejection\n`;
                response += `- Not knowing who you really are (under all the "shoulds")\n`;
                response += `- Habits of people-pleasing\n`;
                response += `- Environments that don't accept the real you\n\n`;
                response += `**Practices for Authenticity:**\n\n`;
                response += `**1. Know Your Values**\n`;
                response += `- What matters most to you?\n`;
                response += `- Are you living in alignment with these?\n\n`;
                response += `**2. Notice the "Shoulds"**\n`;
                response += `- Who told you should be this way?\n`;
                response += `- Is it true? Is it yours?\n\n`;
                response += `**3. Practice Small Truths**\n`;
                response += `- Share your real opinion\n`;
                response += `- Say no when you mean no\n`;
                response += `- Express your needs\n\n`;
                response += `**4. Accept the Cost**\n`;
                response += `- Not everyone will like the real you\n`;
                response += `- That's the price of authenticity\n`;
                response += `- The right people will appreciate it\n\n`;
                response += `**5. Forgive Your Past Self**\n`;
                response += `- You did what you needed to survive\n`;
                response += `- Now you can choose differently\n\n`;
                response += `Where do you feel most inauthentic right now?`;
                return response;
            },
        });
    },
};
const wellnessCheckinDef = {
    id: 'wellnessCheckin',
    name: 'Wellness Check-in',
    description: 'Comprehensive wellness assessment',
    domain: 'self-compassion',
    tags: ['wellness', 'assessment', 'self-care'],
    create: (ctx) => {
        return llm.tool({
            description: 'Conduct a wellness check-in',
            parameters: z.object({
                focus: z.enum(['full', 'physical', 'mental', 'social', 'spiritual']).optional(),
            }),
            execute: async ({ focus }) => {
                log.info({ agentId: ctx.agentId, focus }, 'Conducting wellness check-in');
                let response = `**Wellness Check-in**\n\n`;
                response += `Let's take a moment to check in with how you're doing across different dimensions.\n\n`;
                const areas = focus === 'full' || !focus ? ['physical', 'mental', 'social', 'purpose'] : [focus];
                if (areas.includes('physical')) {
                    response += `**Physical Wellness:**\n`;
                    response += `- How's your sleep? (quality and quantity)\n`;
                    response += `- How's your energy level?\n`;
                    response += `- Are you moving your body?\n`;
                    response += `- How's your nutrition?\n`;
                    response += `- Any physical symptoms to pay attention to?\n\n`;
                }
                if (areas.includes('mental')) {
                    response += `**Mental/Emotional Wellness:**\n`;
                    response += `- How's your mood overall?\n`;
                    response += `- Stress level? (1-10)\n`;
                    response += `- Are you doing things you enjoy?\n`;
                    response += `- How's your self-talk lately?\n`;
                    response += `- Any anxiety or depression to note?\n\n`;
                }
                if (areas.includes('social')) {
                    response += `**Social Wellness:**\n`;
                    response += `- Are you connecting with people who matter?\n`;
                    response += `- Do you feel supported?\n`;
                    response += `- Any relationships needing attention?\n`;
                    response += `- How's your work-life balance?\n\n`;
                }
                if (areas.includes('purpose') || areas.includes('spiritual')) {
                    response += `**Purpose/Meaning:**\n`;
                    response += `- Do you feel like your life has direction?\n`;
                    response += `- Are you spending time on what matters?\n`;
                    response += `- What's giving you meaning right now?\n\n`;
                }
                response += `---\n\nAs you consider these areas, which feels most important to address right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const coachingSupportTools = [
    // Motivation & Discipline
    motivationCoachingDef,
    disciplineStrategyDef,
    procrastinationSupportDef,
    // Boundaries & Communication
    boundaryCoachingDef,
    communicationStrategyDef,
    conflictResolutionDef,
    // Self-Compassion
    selfCompassionCoachingDef,
    affirmWorthDef,
    addressPerfectionismDef,
    // Burnout & Energy
    burnoutCoachingDef,
    restoreEnergyDef,
    // Family Support
    parentingSupportDef,
    elderCareSupportDef,
    // Specialized Coaching
    habitCoachingDef,
    sleepSupportDef,
    angerCoachingDef,
    // Relationship Support
    breakupSupportDef,
    datingAdviceDef,
    datingAppStrategyDef,
    // Support System
    buildSupportSystemDef,
    authenticLivingDef,
    wellnessCheckinDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('self-compassion', coachingSupportTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map