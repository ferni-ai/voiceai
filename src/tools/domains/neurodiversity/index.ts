/**
 * Neurodiversity Domain
 *
 * Tools for supporting neurodivergent individuals (ADHD, autism, etc.).
 * Different brains need different strategies - not one-size-fits-all advice.
 *
 * DOMAIN: neurodiversity
 * PERSONA AFFINITY: Maya (habits), Peter (systems), Ferni (emotional support)
 *
 * TOOLS:
 *   ADHD Support: adhdBodyDoubling, adhdTaskStart, adhdTimeBlindness
 *   Autism Support: autismSensoryRegulation, autismSocialEnergy
 *   General: executiveFunctionSupport, dopamineManagement, maskingRecovery
 *
 * PRINCIPLES:
 * - Neurodivergence is difference, not deficit
 * - Strategies should work WITH the brain, not against it
 * - Self-knowledge is key to self-support
 * - External tools compensate for internal challenges
 *
 * SAFETY: Not diagnostic. Encourage professional assessment.
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// PhD-level research and persona methodology integration
import {
  getEnhancedToolContext,
  getOpeningPhrase,
  getValidationPhrase,
  buildResearchBackedResponse,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// TOOL: ADHD Body Doubling
// ============================================================================

const adhdBodyDoublingDef: ToolDefinition = {
  id: 'adhdBodyDoubling',
  name: 'ADHD Body Doubling',
  description: 'Use body doubling to help with task initiation and focus',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'adhd', 'body-doubling', 'focus'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('adhdBodyDoubling'),
      parameters: z.object({
        task: z.string().describe('What task do you need to work on'),
        duration: z.string().optional().describe('How long do you want to work'),
      }),
      execute: async ({ task, duration }) => {
        log.info({ agentId: ctx.agentId, task }, 'Body doubling session');

        let response = '';

        response += '**Virtual body doubling session:**\n\n';

        response += 'Body doubling works because having another presence ';
        response += 'helps the ADHD brain stay grounded and task-focused.\n\n';

        response += `**Your task:** "${task}"\n`;
        if (duration) {
          response += `**Time:** ${duration}\n`;
        }
        response += '\n';

        response += '**Starting the session:**\n';
        response += "• I'm here with you.\n";
        response += "• You don't have to do this perfectly.\n";
        response += '• Just start with the smallest step.\n\n';

        response += '**First step prompts:**\n';
        response += `• What's the VERY first physical action for "${task}"?\n`;
        response += '• Can you put your body in position to start?\n';
        response += "• What's one tiny thing you can do in 2 minutes?\n\n";

        response += '**While working:**\n';
        response += "• It's okay to take breaks\n";
        response += '• Notice when you drift - gently return\n';
        response += '• Done is better than perfect\n';
        response += '• Small progress counts\n\n';

        response += "**I'm here:**\n";
        response += "Check in with me anytime. Tell me when you're starting, ";
        response += "when you get stuck, when you need a break, or when you're done.\n\n";

        response += "Ready? What's your very first tiny action?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: ADHD Task Start
// ============================================================================

const adhdTaskStartDef: ToolDefinition = {
  id: 'adhdTaskStart',
  name: 'ADHD Task Start',
  description: 'Help with task initiation - the hardest part for ADHD brains',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'adhd', 'task-initiation', 'starting'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('adhdTaskStart'),
      parameters: z.object({
        task: z.string().describe("The task you're struggling to start"),
        blockType: z
          .enum(['overwhelm', 'boring', 'unclear', 'perfectionism', 'unknown'])
          .describe("What's blocking you"),
      }),
      execute: async ({ task, blockType }) => {
        log.info({ agentId: ctx.agentId, task, blockType }, 'ADHD task start support');

        let response = '';

        response += `**Getting started on:** "${task}"\n`;
        response += `**Block type:** ${blockType}\n\n`;

        // Block-specific strategies
        const blockStrategies: Record<string, string> = {
          overwhelm:
            '**Overwhelm strategy:**\n• Break it into absurdly small steps\n• Just do the FIRST 5 minutes\n• Make a "brain dump" list first\n• You don\'t need to see the whole staircase\n\nWhat\'s the tiniest possible first step?',
          boring:
            "**Boredom-busting strategies:**\n• Add novelty: new location, background music, timer race\n• Pair with something enjoyable (body double, snack, podcast)\n• Gamify it: set a score or challenge\n• Change the HOW even if you can't change the WHAT\n\nHow can you make this even slightly more interesting?",
          unclear:
            '**Clarity strategies:**\n• Write out exactly what "done" looks like\n• Ask: What\'s the FIRST physical action?\n• Set a timer for 10 minutes just to THINK about the task\n• Sometimes starting clarifies the task\n\nWhat would "done" look like for this task?',
          perfectionism:
            '**Anti-perfectionism strategies:**\n• Set a "crappy first draft" goal\n• Time-box: Stop after X minutes, whatever state it\'s in\n• Lower your standards intentionally\n• Remember: Done > Perfect\n\nWhat\'s a "good enough" version of this?',
          unknown:
            "**General start strategies:**\n• Just open the relevant document/app\n• Set a 5-minute timer and promise to stop\n• Change your environment\n• Tell someone you're starting (accountability)\n\nWhich of these resonates?",
        };

        response += blockStrategies[blockType] + '\n\n';

        // Universal tips
        response += '**ADHD-friendly start hacks:**\n';
        response += '• "Just one thing" - do ONE small part\n';
        response += '• Movement first - jumping jacks, walk, shake it out\n';
        response += '• Novelty injection - change location, tools, approach\n';
        response += '• Artificial urgency - set a timer, create a deadline\n';
        response += '• Reward proximity - put a reward visible while working\n\n';

        response += '**Right now:**\n';
        response += 'Can you do just ONE tiny thing in the next 2 minutes? What would that be?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Time Blindness Support
// ============================================================================

const timeBlindnessDef: ToolDefinition = {
  id: 'adhdTimeBlindness',
  name: 'Time Blindness Support',
  description: 'Strategies for managing ADHD time blindness',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'adhd', 'time-blindness', 'time-management'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('adhdTimeBlindness'),
      parameters: z.object({
        situation: z
          .enum(['always-late', 'time-estimation', 'hyperfocus', 'transitions', 'general'])
          .describe('Which time challenge'),
      }),
      execute: async ({ situation }) => {
        log.info({ agentId: ctx.agentId, situation }, 'Time blindness support');

        let response = '';

        response += '**Time blindness strategies:**\n\n';

        response += 'Time blindness is real. ADHD brains experience time differently. ';
        response += "This isn't a character flaw - it's neurological.\n\n";

        const situationStrategies: Record<string, string> = {
          'always-late':
            '**For chronic lateness:**\n• Set departure time, not arrival time\n• Build in buffer time BEFORE you\'re ready ("I\'m ready" → wait 15 min)\n• Lie to yourself about start times (set clocks ahead)\n• Lay out everything the night before\n• Alarms: "start getting ready", "leave now", "you should be in car"\n• Simplify your getting-ready routine',
          'time-estimation':
            '**For time estimation:**\n• Double your estimate. Then add more.\n• Time yourself on routine tasks - learn actual times\n• Use past data: "Last time this took me..."\n• Break tasks into steps and estimate each\n• Accept you\'ll probably be wrong and plan accordingly',
          hyperfocus:
            '**For losing time to hyperfocus:**\n• Set multiple alarms during task\n• Use physical timers you can see\n• Tell someone to check on you\n• Put the next commitment in your field of view\n• Build in "hard stops" (meeting, person arriving)',
          transitions:
            '**For transition difficulties:**\n• Give yourself transition time between activities\n• Use alarms 15, 10, 5 minutes before switching\n• Create transition rituals\n• Accept that transitions are HARD and plan for it\n• Use "one more" instead of "done" - less abrupt',
          general:
            '**General time awareness tools:**\n• Analog clocks with visible time progression\n• Time Timer or visual countdown apps\n• Smartwatch with vibrating reminders\n• Time anchors: lunch at noon, always\n• External accountability for time-sensitive things',
        };

        response += situationStrategies[situation] + '\n\n';

        response += '**The deeper truth:**\n';
        response += 'Time blindness means you can\'t "just pay attention to time." ';
        response += "You need EXTERNAL scaffolding. That's not cheating - that's smart.\n\n";

        response += 'What time challenge is most impacting your life right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Executive Function Support
// ============================================================================

const executiveFunctionDef: ToolDefinition = {
  id: 'executiveFunctionSupport',
  name: 'Executive Function Support',
  description: 'Support for executive function challenges',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'executive-function', 'planning', 'organization'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('executiveFunctionSupport'),
      parameters: z.object({
        challenge: z
          .enum([
            'working-memory',
            'planning',
            'flexibility',
            'emotional-regulation',
            'inhibition',
            'general',
          ])
          .describe('Which executive function'),
      }),
      execute: async ({ challenge }) => {
        log.info({ agentId: ctx.agentId, challenge }, 'Executive function support');

        let response = '';

        response += '**Executive function support:**\n\n';

        const efStrategies: Record<string, string> = {
          'working-memory':
            '**Working memory support:**\nYour brain\'s "RAM" is limited. Externalize everything.\n\n• Write it down IMMEDIATELY - don\'t trust memory\n• Use voice memos for ideas\n• Put things in your path (keys by door)\n• Keep everything in ONE place\n• Create checklists for routine tasks\n• Use alarms/reminders religiously\n• "If it\'s not written down, it doesn\'t exist"',
          planning:
            "**Planning support:**\nSequencing steps doesn't come naturally. Use structure.\n\n• Templates and checklists for repeated tasks\n• Work backwards from deadline\n• Break down until steps are obvious\n• Use visual planning (sticky notes, Trello)\n• Build in review points\n• Plan in short chunks (today, this week)",
          flexibility:
            '**Cognitive flexibility support:**\nTransitioning between tasks/thoughts is hard.\n\n• Plan transition time between activities\n• Use physical movement to shift gears\n• Create transition rituals\n• Expect the transition to be hard\n• Give yourself grace with interruptions\n• Practice "flexible thinking" in low-stakes situations',
          'emotional-regulation':
            '**Emotional regulation support:**\nBig feelings happen fast.\n\n• Name the emotion ("I\'m feeling...")\n• Create time/space before responding\n• Use physical regulation (breathing, cold water, movement)\n• Know your triggers\n• Have pre-planned responses for common triggers\n• It\'s okay to say "I need a minute"',
          inhibition:
            "**Impulse control support:**\nYour brain doesn't have a good pause button.\n\n• Build in pause points (wait 24 hours for purchases)\n• Use physical barriers (app blockers, money in hard to access places)\n• Remove temptation from environment\n• Tell someone about impulses (brings awareness)\n• Create if-then plans in advance",
          general:
            '**General executive function principles:**\n\n• Externalize EVERYTHING (lists, alarms, visual cues)\n• Create environmental structure\n• Use body-based regulation\n• Reduce decisions through routines\n• Build in checkpoints and reviews\n• Work WITH your brain, not against it',
        };

        response += efStrategies[challenge] + '\n\n';

        response += '**Remember:**\n';
        response += "Executive function challenges are REAL. External supports aren't cheating - ";
        response +=
          "they're accommodations. Successful people with EF challenges all use systems.\n\n";

        response += 'What specific area is giving you trouble today?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Dopamine Management
// ============================================================================

const dopamineManagementDef: ToolDefinition = {
  id: 'dopamineManagement',
  name: 'Dopamine Management',
  description: 'Understand and work with dopamine for motivation',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'adhd', 'dopamine', 'motivation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('dopamineManagement'),
      parameters: z.object({
        struggle: z
          .enum(['no-motivation', 'need-novelty', 'doom-scrolling', 'reward-seeking', 'general'])
          .describe('What dopamine challenge'),
      }),
      execute: async ({ struggle }) => {
        log.info({ agentId: ctx.agentId, struggle }, 'Dopamine management');

        let response = '';

        response += '**Dopamine and the ADHD/neurodivergent brain:**\n\n';

        response += "Dopamine isn't about pleasure - it's about MOTIVATION. ";
        response += 'Neurodivergent brains often have lower baseline dopamine, ';
        response += 'making it harder to do things without immediate reward.\n\n';

        const struggleStrategies: Record<string, string> = {
          'no-motivation':
            '**When motivation is gone:**\n• Add novelty - change HOW you do it\n• Pair boring tasks with something rewarding\n• Create artificial urgency/deadlines\n• Use social accountability (tell someone)\n• Move your body first (exercise raises dopamine)\n• Start with something small to build momentum\n• Remember: motivation follows action, not the other way around',
          'need-novelty':
            '**Working with novelty-seeking:**\n• Novelty isn\'t bad - use it strategically\n• Rotate between tasks to keep interest\n• Find new ways to do routine things\n• Change environments regularly\n• Use variety as a tool (different music, locations, tools)\n• Learn new things about familiar tasks\n• Embrace being a "scanner" - many interests is okay',
          'doom-scrolling':
            '**Breaking dopamine hijacking (doom-scrolling):**\n• Recognize: this is your brain seeking easy dopamine\n• Remove apps or use blockers\n• Create friction (logout, delete app)\n• Replace with healthier dopamine (music, movement, social)\n• Time-box: set a timer if you must scroll\n• Ask: "What do I actually need right now?"\n• The scroll never satisfies - notice that',
          'reward-seeking':
            '**Healthy reward management:**\n• Build rewards INTO tasks, not just after\n• Immediate rewards beat delayed ones (for now)\n• Stack rewards: boring task + podcast\n• Celebrate small wins visibly\n• Create your own dopamine (exercise, music, social)\n• Avoid empty dopamine (infinite scroll, sugar)\n• Plan rewards in advance to create anticipation',
          general:
            '**Dopamine principles:**\n\n• Low dopamine = low motivation (not laziness)\n• You need to CREATE dopamine or find it externally\n• Exercise, music, connection, novelty all help\n• Avoid dopamine "junk food" (infinite scroll, sugar)\n• Stack dopamine sources for hard tasks\n• Build reward systems that work FOR you',
        };

        response += struggleStrategies[struggle] + '\n\n';

        response += '**Key insight:**\n';
        response += "You're not lazy. Your brain needs more dopamine to engage. ";
        response += 'Work WITH this, not against it.\n\n';

        response += 'What helps YOU feel more motivated?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Sensory Regulation
// ============================================================================

const sensoryRegulationDef: ToolDefinition = {
  id: 'autismSensoryRegulation',
  name: 'Sensory Regulation',
  description: 'Support for sensory processing and regulation',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'autism', 'sensory', 'regulation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('autismSensoryRegulation'),
      parameters: z.object({
        state: z
          .enum(['overwhelmed', 'seeking', 'shutdown', 'prevention'])
          .describe('Current sensory state'),
        senses: z.string().optional().describe('Which senses are most affected'),
      }),
      execute: async ({ state, senses }) => {
        log.info({ agentId: ctx.agentId, state }, 'Sensory regulation support');

        let response = '';

        response += `**Sensory regulation (${state}):**\n\n`;

        const stateStrategies: Record<string, string> = {
          overwhelmed:
            '**When you\'re overwhelmed:**\n\n**Immediate:**\n• Remove yourself if possible\n• Reduce input: dim lights, silence, close eyes\n• Deep pressure: weighted blanket, tight hug, press against wall\n• Ground yourself: cold water, ice, strong taste\n• Stim if that helps (rocking, hand movements)\n\n**Recovery:**\n• This will pass - ride the wave\n• Don\'t try to "push through"\n• Reduce demands on yourself\n• Use your safe space\n• Rest without guilt',
          seeking:
            "**When you're seeking input:**\n\n• This is your nervous system asking for what it needs\n\n**Proprioceptive (body position):**\n• Heavy work (carry, push, pull)\n• Exercise, jumping, bouncing\n• Tight clothing or weighted items\n\n**Vestibular (movement):**\n• Swinging, spinning, rocking\n• Dancing, pacing\n\n**Tactile:**\n• Fidgets, textured objects\n• Water play, sand, slime\n\n**Listen to what your body is asking for.**",
          shutdown:
            '**When you\'re in shutdown:**\n\n• This is your nervous system protecting you\n• Don\'t force yourself to "snap out of it"\n\n**Support:**\n• Reduce ALL demands\n• Safe, quiet, dim space\n• No need to talk or explain\n• Gentle, predictable sensory input\n• Comfort items\n• Time - this will pass\n\n**After:**\n• Be gentle with yourself\n• Rest before returning to normal activity\n• Reflect on what led here',
          prevention:
            '**Sensory regulation prevention:**\n\n• Know your sensory profile (what overwhelms, what soothes)\n• Build sensory breaks into your day\n• Carry sensory tools (earplugs, sunglasses, fidgets)\n• Honor your limits - say no to overwhelming environments\n• Prepare for challenging sensory environments\n• Have an exit plan always\n• Rest after sensory-demanding activities',
        };

        response += stateStrategies[state] + '\n\n';

        // Sense-specific
        if (senses) {
          response += `**Your sensitive senses (${senses}):**\n`;
          response += 'Knowing which senses are most affected helps you target support. ';
          response += 'Build your personal sensory toolkit around these.\n\n';
        }

        response += '**Your sensory needs are VALID.**\n';
        response += "Accommodating them isn't weakness - it's self-knowledge.\n\n";

        response += 'What does your nervous system need right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Social Energy Management
// ============================================================================

const socialEnergyDef: ToolDefinition = {
  id: 'autismSocialEnergy',
  name: 'Social Energy Management',
  description: 'Manage social energy and interaction demands',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'autism', 'social-energy', 'spoons'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('autismSocialEnergy'),
      parameters: z.object({
        situation: z
          .enum(['depleted', 'upcoming-event', 'recovery', 'general'])
          .describe('Current social energy situation'),
      }),
      execute: async ({ situation }) => {
        log.info({ agentId: ctx.agentId, situation }, 'Social energy management');

        let response = '';

        response += '**Social energy management:**\n\n';

        response += 'Social interaction requires energy. For neurodivergent folks, ';
        response +=
          'it often requires MORE energy due to processing, masking, and sensory demands.\n\n';

        const situationStrategies: Record<string, string> = {
          depleted:
            "**When you're depleted:**\n\n• This is REAL exhaustion - honor it\n• Cancel non-essential social things (guilt-free)\n• Communicate: \"I need quiet time\"\n• Solitude isn't antisocial - it's recharging\n\n**Recovery activities:**\n• Special interests (deep engagement restores)\n• Quiet environment\n• Stimming (self-regulation)\n• Comfort routines\n• No performance required\n\n**Remember:** You're not broken. You just need to recharge differently.",
          'upcoming-event':
            "**Preparing for social events:**\n\n**Before:**\n• Bank energy in days prior (extra rest)\n• Know what to expect (who, how long, sensory environment)\n• Have an exit strategy\n• Bring comfort items\n• Plan recovery time AFTER\n\n**During:**\n• Take breaks (bathroom, outside, quiet corner)\n• Limit performance/masking when possible\n• Set internal time limits\n• It's okay to leave early\n\n**After:**\n• Immediate decompression\n• No more demands\n• Protected recovery time",
          recovery:
            "**Social recovery:**\n\n• Time alone (or with safe person)\n• Return to baseline activities\n• Special interests\n• Reduce sensory input\n• No forced conversation\n• Physical recovery (sleep, rest)\n• Processing time (what happened, how you feel)\n\n**Recovery takes as long as it takes.** Don't rush back.",
          general:
            "**General social energy principles:**\n\n• Know your capacity (spoon theory)\n• Build in recovery after social activities\n• Quality > quantity (few deep connections > many shallow)\n• Protect your energy ruthlessly\n• Not all social situations cost the same\n• It's okay to have different social needs\n• Communicate your needs to safe people",
        };

        response += situationStrategies[situation] + '\n\n';

        response += '**Spoon theory reminder:**\n';
        response += 'You start each day with limited energy (spoons). ';
        response += 'Social activities cost spoons. Know what you have and spend wisely.\n\n';

        response += 'How is your social energy right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Masking Recovery
// ============================================================================

const maskingRecoveryDef: ToolDefinition = {
  id: 'maskingRecovery',
  name: 'Masking Recovery',
  description: 'Support for recovering from masking/camouflaging',
  domain: 'neurodiversity',
  tags: ['neurodiversity', 'autism', 'adhd', 'masking', 'recovery'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('maskingRecovery'),
      parameters: z.object({
        maskingLevel: z
          .enum(['heavy-day', 'chronic', 'learning-to-unmask', 'general'])
          .describe('Your masking situation'),
      }),
      execute: async ({ maskingLevel }) => {
        log.info({ agentId: ctx.agentId, maskingLevel }, 'Masking recovery');

        let response = '';

        response += '**Masking recovery:**\n\n';

        response += 'Masking is hiding neurodivergent traits to appear "normal." ';
        response += "It's exhausting, unsustainable, and you shouldn't have to do it.\n\n";

        const levelStrategies: Record<string, string> = {
          'heavy-day':
            '**After a heavy masking day:**\n\n**Immediate:**\n• Remove performance demands\n• Return to safe space\n• Unmask: stim, info-dump, be yourself\n• Sensory comfort (familiar textures, sounds)\n• No more "performing" tonight\n\n**Processing:**\n• You did hard work today\n• The exhaustion is real\n• Tomorrow can be gentler if possible\n• You deserve rest without guilt',
          chronic:
            '**Chronic masking recovery:**\n\nLong-term masking leads to:\n• Burnout\n• Identity confusion\n• Mental health struggles\n• Loss of self\n\n**Starting to recover:**\n• Identify safe spaces to unmask\n• Find your neurodivergent community\n• Reconnect with what YOU actually like/want\n• Reduce masking where possible\n• Therapy with ND-affirming professional\n• Grieve what masking cost you\n• Rebuild authentic identity',
          'learning-to-unmask':
            "**Learning to unmask:**\n\nUnmasking is scary. You've been told being yourself isn't okay.\n\n**Start small:**\n• Unmask with safe people first\n• Practice alone (let yourself stim, info-dump)\n• Notice what feels natural vs. performed\n• Reconnect with childhood interests\n\n**Challenges:**\n• You might not know who you are without the mask\n• Others may react to the \"new\" you\n• It feels vulnerable\n• It's worth it\n\n**You deserve to be yourself.**",
          general:
            "**Masking basics:**\n\n• Masking is a survival strategy\n• It comes at a cost (energy, authenticity, health)\n• You shouldn't HAVE to mask\n• The world should accommodate you\n\n**Building towards less masking:**\n• Know your safe spaces\n• Communicate needs when possible\n• Find your people (community)\n• Self-acceptance work\n• Advocacy for accommodation",
        };

        response += levelStrategies[maskingLevel] + '\n\n';

        response += '**Remember:**\n';
        response += "Your neurodivergent traits aren't flaws to hide. ";
        response += "They're part of who you are.\n\n";

        response += 'Where do you feel safest being yourself?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const neurodiversityTools: ToolDefinition[] = [
  adhdBodyDoublingDef,
  adhdTaskStartDef,
  timeBlindnessDef,
  executiveFunctionDef,
  dopamineManagementDef,
  sensoryRegulationDef,
  socialEnergyDef,
  maskingRecoveryDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'neurodiversity',
  neurodiversityTools
);

export default getToolDefinitions;
