/**
 * Digital Wellness Domain
 *
 * Tools for developing a healthy relationship with technology.
 * Our devices should serve us, not the other way around.
 *
 * DOMAIN: digital-wellness
 * PERSONA AFFINITY: Maya (habits), Alex (communication)
 *
 * TOOLS:
 *   Assessment: digitalAudit, screenTimeInsights
 *   Boundaries: digitalBoundaries, notificationDetox
 *   Recovery: phoneFreeTime, mindfulTechUse
 *   Social: socialMediaRelationship, comparisonTrap
 *
 * PRINCIPLES:
 * - Technology is a tool, not a master
 * - Attention is your most valuable resource
 * - Social media shows highlight reels, not real life
 * - Presence > connection count
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
// TOOL: Digital Audit
// ============================================================================

const digitalAuditDef: ToolDefinition = {
  id: 'digitalAudit',
  name: 'Digital Audit',
  description: 'Evaluate your relationship with technology',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'audit', 'technology', 'phone'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('digitalAudit'),
      parameters: z.object({
        concern: z.string().optional().describe('What concerns you about your tech use'),
        averageScreenTime: z.string().optional().describe('Average daily screen time'),
      }),
      execute: async ({ concern, averageScreenTime }) => {
        log.info({ agentId: ctx.agentId }, 'Conducting digital audit');

        let response = '';

        response += '**Digital Wellness Audit:**\n\n';

        // Concern
        if (concern) {
          response += `**Your concern:** "${concern}"\n\n`;
        }

        // Screen time context
        if (averageScreenTime) {
          response += `**Your screen time:** ${averageScreenTime}\n`;
          response += 'Average adult: 6-7 hours daily. But quantity matters less than quality.\n';
          response += 'Is your screen time serving you or controlling you?\n\n';
        }

        response += '**Self-assessment questions:**\n\n';

        response += '**Physical signs:**\n';
        response += '• Do you experience eye strain, headaches, poor sleep?\n';
        response += '• Is your posture affected (tech neck)?\n';
        response += '• Do you feel physically restless without your phone?\n\n';

        response += '**Behavioral patterns:**\n';
        response += '• Do you check your phone first thing and last thing?\n';
        response += '• Do you reach for it during any moment of boredom?\n';
        response += '• Do you lose track of time scrolling?\n';
        response += '• Do you interrupt real conversations to check notifications?\n\n';

        response += '**Emotional impact:**\n';
        response += '• Does social media make you feel worse after using it?\n';
        response += "• Do you feel anxious when you can't check your phone?\n";
        response += '• Do you compare yourself to others online?\n';
        response += '• Do you feel FOMO (fear of missing out)?\n\n';

        response += '**Relationship effects:**\n';
        response += "• Do people complain you're always on your phone?\n";
        response += '• Do you prefer texting to talking?\n';
        response += "• Do you miss moments because you're documenting them?\n\n";

        response += '**Most important question:**\n';
        response += 'If your phone disappeared tomorrow, would you feel free or terrified?\n\n';

        response += 'Which of these areas feels most concerning to you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Digital Boundaries
// ============================================================================

const digitalBoundariesDef: ToolDefinition = {
  id: 'digitalBoundaries',
  name: 'Digital Boundaries',
  description: 'Set healthy boundaries with technology',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'boundaries', 'technology', 'habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('digitalBoundaries'),
      parameters: z.object({
        boundaryArea: z
          .enum(['phone', 'work', 'social-media', 'notifications', 'bedtime', 'general'])
          .describe('Area for boundaries'),
      }),
      execute: async ({ boundaryArea }) => {
        log.info({ agentId: ctx.agentId, boundaryArea }, 'Setting digital boundaries');

        let response = '';

        response += `**Digital boundaries - ${boundaryArea}:**\n\n`;

        const boundaryGuides: Record<
          string,
          { why: string; boundaries: string[]; tips: string[] }
        > = {
          phone: {
            why: 'Your phone is designed to capture attention. You need rules to protect yours.',
            boundaries: [
              'Phone-free zones (bedroom, dining table, bathroom)',
              'Phone-free times (first hour awake, last hour before bed)',
              'Grayscale mode to reduce appeal',
              'Remove apps from home screen - make checking deliberate',
              'Use physical alternatives (alarm clock, watch, notepad)',
            ],
            tips: [
              'Start with ONE boundary and expand',
              'Create a phone "parking spot" at home',
              'Delete apps, keep web versions for friction',
            ],
          },
          work: {
            why: 'Without boundaries, work expands to fill all available time and device.',
            boundaries: [
              'No work email/Slack before X time',
              'No work apps on personal phone',
              'Clear end-of-work ritual (close laptop, change clothes)',
              'Separate devices for work and personal',
              'Auto-responder for after-hours messages',
            ],
            tips: [
              'What you respond to after hours becomes expected',
              'Urgent things rarely are',
              'Your rest makes you more effective',
            ],
          },
          'social-media': {
            why: 'Social media is engineered for addiction. You need defensive boundaries.',
            boundaries: [
              'Set daily time limits (15-30 minutes)',
              'No social media in bed',
              'Scheduled check-in times only',
              'Unfollow/mute accounts that drain you',
              'Log out after each use (adds friction)',
              'Delete apps - use browser only',
            ],
            tips: [
              'Notice your state BEFORE and AFTER using',
              'Ask: Am I consuming or connecting?',
              'Curate ruthlessly - your feed is your choice',
            ],
          },
          notifications: {
            why: "Every notification is a demand for your attention. Most aren't worth it.",
            boundaries: [
              'Turn off ALL non-essential notifications',
              'Keep only: calls, texts from select people, calendar',
              'No badges/numbers on app icons',
              'Schedule notification summaries instead of real-time',
              'Do Not Disturb as default, not exception',
            ],
            tips: [
              'Go through every app and disable notifications',
              'If you never check app from a notification, turn it off',
              "You won't miss anything important",
            ],
          },
          bedtime: {
            why: 'Screens before bed disrupt sleep. Sleep affects everything.',
            boundaries: [
              'No screens 1 hour before bed minimum',
              'Charge phone outside bedroom',
              'Physical alarm clock instead of phone',
              'Night mode enabled (but not a substitute)',
              'Bedtime routine with no devices',
            ],
            tips: [
              'Replace scrolling with: reading, stretching, journaling',
              'If you MUST use a device: audiobooks/podcasts over video',
              "Blue light glasses help but aren't the solution",
            ],
          },
          general: {
            why: 'Intentional tech use means tech serves you, not the other way around.',
            boundaries: [
              'Ask before picking up phone: What am I looking for?',
              'Set purpose before opening any app',
              'Create friction for time-wasting apps',
              'Reduce friction for valuable apps',
              'Weekly digital review',
            ],
            tips: [
              'Tech is a tool. Define what tool you need before reaching',
              "Boredom isn't an emergency",
              'Presence is more valuable than connection',
            ],
          },
        };

        const guide = boundaryGuides[boundaryArea];

        response += `**Why this matters:**\n${guide.why}\n\n`;

        response += '**Boundaries to consider:**\n';
        guide.boundaries.forEach((b) => (response += `• ${b}\n`));

        response += '\n**Tips:**\n';
        guide.tips.forEach((t) => (response += `• ${t}\n`));

        response += '\n**Which of these feels most needed for you?**';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Social Media Relationship
// ============================================================================

const socialMediaRelationshipDef: ToolDefinition = {
  id: 'socialMediaRelationship',
  name: 'Social Media Relationship',
  description: 'Develop a healthier relationship with social media',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'social-media', 'comparison', 'mental-health'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('socialMediaRelationship'),
      parameters: z.object({
        platform: z.string().describe('Which platform(s) affect you most'),
        impact: z
          .enum(['comparison', 'time-sink', 'FOMO', 'anxiety', 'addiction', 'mixed'])
          .describe('How does it impact you'),
      }),
      execute: async ({ platform, impact }) => {
        log.info(
          { agentId: ctx.agentId, platform, impact },
          'Addressing social media relationship'
        );

        let response = '';

        response += `**Your relationship with ${platform} (${impact}):**\n\n`;

        response += '**The reality of social media:**\n';
        response += "• You're seeing highlight reels, not real life\n";
        response += '• Algorithms show you what keeps you scrolling\n';
        response += "• It's designed by attention engineers\n";
        response += "• Likes trigger dopamine - it's literally addictive\n";
        response += "• You're the product, not the customer\n\n";

        // Impact-specific guidance
        const impactGuides: Record<string, string> = {
          comparison:
            "You're comparing your behind-the-scenes to everyone's highlight reel. Nobody posts their boring Tuesday or mental breakdown. What you see is curated, filtered, and often fake.",
          'time-sink':
            "The average person loses 2.5 hours daily to social media. That's over 900 hours a year. What could you do with that time?",
          FOMO: "FOMO is manufactured. You weren't missing out before social media showed you what others were doing. What you're seeing isn't even reality - it's a performance.",
          anxiety:
            "Social media overloads your nervous system - constant stimulation, bad news, comparison. Your brain wasn't designed for this.",
          addiction:
            "Social media addiction is real and by design. Variable rewards (maybe something interesting will pop up) are the most addictive type. Recognize you're fighting an engineered system.",
          mixed:
            'Mixed feelings are common - it has benefits AND costs. The question is: Is your relationship with it intentional?',
        };

        response += `**About ${impact}:**\n${impactGuides[impact]}\n\n`;

        // Actions
        response += '**Creating a healthier relationship:**\n\n';
        response += '1. **Curate ruthlessly** - Unfollow anything that makes you feel worse\n';
        response += '2. **Set time limits** - Use built-in tools or apps like OneSec\n';
        response +=
          "3. **Notice triggers** - When do you reach for it? What need isn't being met?\n";
        response += "4. **Replace don't just remove** - What else could meet that need?\n";
        response += '5. **Take breaks** - Try a 24-hour detox, then a weekend, then a week\n\n';

        // Questions
        response += '**Questions to consider:**\n';
        response += `• If ${platform} disappeared, would you miss the content or the habit?\n`;
        response += '• What are you actually looking for when you open it?\n';
        response += '• How do you feel 10 minutes after a scrolling session?\n\n';

        response += 'What would a healthier relationship with this platform look like for you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Mindful Tech Use
// ============================================================================

const mindfulTechUseDef: ToolDefinition = {
  id: 'mindfulTechUse',
  name: 'Mindful Tech Use',
  description: 'Use technology intentionally rather than reactively',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'mindfulness', 'intentional', 'presence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('mindfulTechUse'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Teaching mindful tech use');

        let response = '';

        response += '**Mindful Technology Use:**\n\n';

        response += "The goal isn't to eliminate technology - it's to use it INTENTIONALLY.\n\n";

        // Before picking up
        response += '**Before picking up your device:**\n';
        response += '• STOP - What am I about to do?\n';
        response += '• IDENTIFY - What am I looking for/needing?\n';
        response += '• CHOOSE - Is this the best way to meet that need?\n';
        response += '• ACT - If yes, proceed with intention\n\n';

        // The STOP technique
        response += '**The STOP technique:**\n';
        response += 'When you notice yourself reaching for phone automatically:\n';
        response += "• **S**top - Hand hovers, don't pick up\n";
        response += '• **T**ake a breath\n';
        response += '• **O**bserve - What am I feeling? What do I need?\n';
        response += '• **P**roceed - Intentionally choose what to do\n\n';

        // Intentional sessions
        response += '**Intentional tech sessions:**\n';
        response += '• Set a PURPOSE before opening ("I\'m checking for X")\n';
        response += '• Set a TIME LIMIT before opening\n';
        response += "• When time's up or purpose fulfilled, CLOSE\n";
        response += '• Notice if purpose creeps ("I\'ll just also check...")\n\n';

        // Daily practices
        response += '**Daily practices:**\n';
        response += '• Morning intention: How do I want to use tech today?\n';
        response += '• Evening reflection: Did my tech use serve me?\n';
        response += '• Device-free moments: meals, walks, conversations\n';
        response += '• Single-tasking: One app, one purpose at a time\n\n';

        // The attention check
        response += '**The attention check:**\n';
        response += 'Every hour, ask: "Where is my attention? Is that where I want it?"\n\n';

        response += "What's one mindful tech practice you could start today?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Phone Free Time
// ============================================================================

const phoneFreeTimeDef: ToolDefinition = {
  id: 'phoneFreeTime',
  name: 'Phone Free Time',
  description: 'Create sacred time without your phone',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'phone-free', 'presence', 'detox'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('phoneFreeTime'),
      parameters: z.object({
        resistanceReason: z
          .enum(['miss-something', 'bored', 'emergency', 'habit', 'uncomfortable'])
          .describe('What makes going phone-free hard'),
      }),
      execute: async ({ resistanceReason }) => {
        log.info({ resistanceReason }, 'Creating phone-free time');

        let response = '';

        response += '**Creating phone-free time:**\n\n';

        // Address resistance
        const resistanceResponses: Record<string, string> = {
          'miss-something':
            'What would you actually miss? Probably nothing urgent. Humans survived thousands of years without knowing things instantly. The world will still be there. Your anxiety about missing something is manufactured by tech companies.',
          bored:
            'Boredom is not an emergency. Boredom is actually the birthplace of creativity and self-knowledge. When did we decide that every moment must be filled with stimulation? What if boredom is valuable?',
          emergency:
            'Real emergencies are rare. If something truly urgent happens, people will find a way to reach you. The "what if there\'s an emergency" is mostly anxiety talking. You can set up emergency bypass if needed.',
          habit:
            "Reaching for your phone is automatic - that's the problem. You've been conditioned. Breaking the habit requires creating space between impulse and action. This discomfort is temporary.",
          uncomfortable:
            "Discomfort without your phone tells you something important - you've become dependent. That's worth paying attention to. The discomfort fades with practice.",
        };

        response += `**About your concern (${resistanceReason}):**\n`;
        response += resistanceResponses[resistanceReason] + '\n\n';

        // Building up
        response += '**Start small, build up:**\n\n';
        response += '• **5 minutes**: Leave phone in another room while you do one task\n';
        response += '• **30 minutes**: Phone-free meal\n';
        response += '• **1 hour**: Morning ritual without phone\n';
        response += '• **Few hours**: Phone-free outing (walk, grocery store)\n';
        response += '• **Half day**: Weekend morning unplugged\n';
        response += '• **Full day**: Digital sabbath\n\n';

        // What to do instead
        response += '**What to do instead:**\n';
        response += "• Be present with whatever you're doing\n";
        response += '• Notice things around you\n';
        response += '• Let yourself be bored\n';
        response += '• Have a conversation\n';
        response += '• Read a physical book\n';
        response += '• Move your body\n';
        response += '• Create something\n\n';

        // The key
        response += '**The key insight:**\n';
        response += "Phone-free time isn't about deprivation. It's about PRESENCE. ";
        response += 'What you gain is more valuable than what you give up.\n\n';

        response += "What's the smallest phone-free time you could try this week?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Notification Detox
// ============================================================================

const notificationDetoxDef: ToolDefinition = {
  id: 'notificationDetox',
  name: 'Notification Detox',
  description: 'Take back control of your attention from notifications',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'notifications', 'attention', 'focus'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('notificationDetox'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Notification detox');

        let response = '';

        response += '**Notification Detox:**\n\n';

        response +=
          "Every notification is a company asking for your attention. Most aren't worth it.\n\n";

        response += '**The cost of notifications:**\n';
        response += '• Each interruption costs ~23 minutes to regain deep focus\n';
        response += '• They train your brain to expect constant stimulation\n';
        response += '• They put YOU in reactive mode\n';
        response += '• They fragment your attention all day\n\n';

        // The audit
        response += '**Notification audit:**\n\n';
        response += 'Go through EVERY app on your phone. Ask:\n';
        response += '• Have I EVER been glad this interrupted me?\n';
        response += '• Would I miss anything important if this was off?\n';
        response += '• Do I really need to know this RIGHT NOW?\n\n';

        response += '**The only notifications worth keeping:**\n';
        response += '• Calls from specific people (emergency contacts)\n';
        response += '• Texts from specific people (not all texts)\n';
        response += '• Calendar alerts for actual appointments\n';
        response += "• Maybe: one messaging app if it's primary contact method\n\n";

        response += '**Everything else OFF:**\n';
        response += '• Email - check on YOUR schedule\n';
        response += '• Social media - all of it, no exceptions\n';
        response += '• News - it can wait\n';
        response += '• Shopping apps - they just want you to buy\n';
        response += '• Games - manipulating dopamine\n';
        response += '• Any app badges/numbers - visual noise\n\n';

        response += '**Advanced moves:**\n';
        response += '• Do Not Disturb as default, allow-list for important\n';
        response += '• Scheduled summaries instead of real-time (iOS/Android feature)\n';
        response += '• Silent mode + check on schedule\n';
        response += '• No wearables constantly pinging you\n\n';

        response += '**The result:**\n';
        response += 'You decide when to check things. YOU control your attention.\n\n';

        response += 'Ready to audit your notifications? Start now!';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Comparison Trap
// ============================================================================

const comparisonTrapDef: ToolDefinition = {
  id: 'comparisonTrap',
  name: 'Comparison Trap',
  description: 'Address comparison and envy from online content',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'comparison', 'envy', 'self-worth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('comparisonTrap'),
      parameters: z.object({
        comparingTo: z.string().optional().describe('What/who you compare yourself to online'),
        feeling: z.string().optional().describe('How the comparison makes you feel'),
      }),
      execute: async ({ comparingTo, feeling }) => {
        log.info({ comparingTo, feeling }, 'Addressing comparison trap');

        let response = '';

        response += '**The comparison trap:**\n\n';

        if (comparingTo) {
          response += `**You're comparing yourself to:** "${comparingTo}"\n`;
        }
        if (feeling) {
          response += `**It makes you feel:** "${feeling}"\n\n`;
        }

        response += "**The truth about what you're seeing:**\n";
        response += "• It's curated, edited, filtered, and staged\n";
        response += "• You're seeing the result, not the struggle\n";
        response += "• You don't see the debt, anxiety, emptiness behind the image\n";
        response += '• Algorithms show you content that triggers comparison\n';
        response += '• What you envy might not even make them happy\n\n';

        response += '**What comparison steals from you:**\n';
        response += '• Gratitude for what you have\n';
        response += '• Joy in your own journey\n';
        response += '• Energy to work on your goals\n';
        response += '• Peace with where you are\n\n';

        response += '**Reframes:**\n';
        response += "• Their success doesn't diminish yours\n";
        response += "• You're seeing their chapter 20, not their chapter 1\n";
        response +=
          "• You don't actually want their life - you want what you THINK it feels like\n";
        response += '• Comparison is measuring your inside by their outside\n\n';

        response += '**Antidotes to comparison:**\n';
        response += '• Gratitude practice - appreciate what you have\n';
        response += '• Limit exposure - unfollow triggering accounts\n';
        response += '• Compare to past self, not others\n';
        response += "• Remember: you're seeing a performance\n";
        response += '• Ask: "Would I trade my WHOLE life for theirs?" (Never.)\n\n';

        response += '**Action step:**\n';
        response +=
          'Identify one account that triggers comparison. Unfollow or mute it right now.\n\n';

        response +=
          "What would it feel like to stop measuring yourself by others' highlight reels?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Screen Time Insights
// ============================================================================

const screenTimeInsightsDef: ToolDefinition = {
  id: 'screenTimeInsights',
  name: 'Screen Time Insights',
  description: 'Understand what your screen time reveals about your needs',
  domain: 'digital-wellness',
  tags: ['digital-wellness', 'screen-time', 'awareness', 'needs'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('screenTimeInsights'),
      parameters: z.object({
        mostUsedApps: z.string().describe('Your most-used apps'),
        peakTimes: z.string().optional().describe('When you use your phone most'),
      }),
      execute: async ({ mostUsedApps, peakTimes }) => {
        log.info({ mostUsedApps, peakTimes }, 'Analyzing screen time insights');

        let response = '';

        response += '**Screen time insights:**\n\n';
        response += `**Your most-used apps:** ${mostUsedApps}\n`;
        if (peakTimes) {
          response += `**Peak usage times:** ${peakTimes}\n`;
        }
        response += '\n';

        response += '**What your app usage might reveal:**\n\n';

        response += '**Social media (Instagram, TikTok, Twitter):**\n';
        response += '• Possible need: connection, validation, belonging, entertainment\n';
        response += '• Question: What am I actually looking for each time I open this?\n\n';

        response += '**Messaging (Texts, WhatsApp, Messenger):**\n';
        response += '• Possible need: connection, avoiding loneliness, anxiety about missing out\n';
        response += '• Question: Am I actually connecting or just checking?\n\n';

        response += '**News/Reddit/browsing:**\n';
        response += '• Possible need: stimulation, avoiding boredom, staying informed\n';
        response += '• Question: Is this making me more informed or more anxious?\n\n';

        response += '**Email/work apps:**\n';
        response +=
          '• Possible need: feeling productive, fear of falling behind, external validation\n';
        response += '• Question: Is this urgent or am I using work to avoid something?\n\n';

        response += '**Games:**\n';
        response += '• Possible need: escape, dopamine, achievement, stress relief\n';
        response += '• Question: What am I escaping from? What else could meet this need?\n\n';

        // Peak times
        if (peakTimes) {
          response += '**About your peak usage times:**\n';
          response += '• Morning: starting day in reactive mode?\n';
          response += '• Afternoon: energy dip, procrastination?\n';
          response += '• Evening: winding down, avoiding something?\n';
          response += '• Night: trouble sleeping, habit?\n\n';
        }

        response += '**The key questions:**\n';
        response += '• What need am I trying to meet with this usage?\n';
        response += '• Is the app actually meeting that need?\n';
        response += '• What healthier option could meet the same need?\n\n';

        response += 'What underlying need do you think your phone usage is trying to meet?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const digitalWellnessTools: ToolDefinition[] = [
  digitalAuditDef,
  digitalBoundariesDef,
  socialMediaRelationshipDef,
  mindfulTechUseDef,
  phoneFreeTimeDef,
  notificationDetoxDef,
  comparisonTrapDef,
  screenTimeInsightsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'digital-wellness',
  digitalWellnessTools
);

export default getToolDefinitions;
