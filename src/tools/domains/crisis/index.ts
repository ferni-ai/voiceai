/**
 * Crisis & Safety Support Domain Tools
 *
 * CRITICAL: These tools support users in crisis situations.
 * They must ALWAYS:
 * - Surface appropriate professional resources
 * - Never replace professional help
 * - Use warm, supportive language
 * - Err on the side of caution
 * - Respect user autonomy
 *
 * DOMAIN: crisis
 * TOOLS:
 *   Resources: provideCrisisResources, findLocalResources
 *   Grounding: guideGroundingExercise, deEscalateAnxiety
 *   Safety: createSafetyPlan, findSafeResources
 *   Recovery: supportRecoveryJourney, trackSobrietyMilestone
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { trackToolUsage, isLifeCoachAnalyticsEnabled } from '../shared/index.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// CRISIS RESOURCES DATABASE
// ============================================================================

interface CrisisResource {
  primary: {
    name: string;
    contact: string;
    available: string;
    description: string;
  };
  secondary?: {
    name: string;
    contact: string;
    available?: string;
    description?: string;
  };
  additional?: Array<{ name: string; url?: string; contact?: string; description?: string }>;
}

const CRISIS_RESOURCES: Record<string, CrisisResource> = {
  'suicide-self-harm': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description:
        'Free, confidential support for people in distress, prevention and crisis resources',
    },
    secondary: {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
      description: 'Free, confidential crisis counseling via text',
    },
    additional: [
      {
        name: 'International Association for Suicide Prevention',
        url: 'https://www.iasp.info/resources/Crisis_Centres/',
      },
    ],
  },
  'mental-health': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description: 'Mental health crisis support and resources',
    },
    secondary: {
      name: 'NAMI Helpline',
      contact: '1-800-950-NAMI (6264)',
      available: 'Mon-Fri, 10am-10pm ET',
      description: 'National Alliance on Mental Illness - information, referrals, and support',
    },
  },
  'domestic-violence': {
    primary: {
      name: 'National Domestic Violence Hotline',
      contact: '1-800-799-7233 (SAFE)',
      available: '24/7',
      description:
        'Confidential support, safety planning, and resources for domestic violence survivors',
    },
    secondary: {
      name: 'Text Support',
      contact: 'Text START to 88788',
      available: '24/7',
    },
  },
  'sexual-assault': {
    primary: {
      name: 'RAINN National Sexual Assault Hotline',
      contact: '1-800-656-4673 (HOPE)',
      available: '24/7',
      description: 'Confidential support from trained staff members',
    },
    secondary: {
      name: 'Online Chat',
      contact: 'https://www.rainn.org/get-help',
      available: '24/7',
    },
  },
  'substance-abuse': {
    primary: {
      name: 'SAMHSA National Helpline',
      contact: '1-800-662-4357',
      available: '24/7, 365 days',
      description: 'Free, confidential treatment referrals and information service',
    },
    secondary: {
      name: 'Alcoholics Anonymous',
      contact: 'https://www.aa.org/find-aa',
      description: 'Find local AA meetings',
    },
    additional: [
      { name: 'Narcotics Anonymous', url: 'https://www.na.org/meetingsearch/' },
      { name: 'SMART Recovery', url: 'https://www.smartrecovery.org/community/calendar.php' },
    ],
  },
  'child-abuse': {
    primary: {
      name: 'Childhelp National Child Abuse Hotline',
      contact: '1-800-422-4453 (4-A-CHILD)',
      available: '24/7',
      description: 'Professional crisis counselors for child abuse intervention and prevention',
    },
  },
  'financial-crisis': {
    primary: {
      name: '211',
      contact: 'Call 211 or text your zip code to 898211',
      available: '24/7',
      description: 'Connect to local services for housing, food, utilities, and more',
    },
    secondary: {
      name: 'National Foundation for Credit Counseling',
      contact: '1-800-388-2227',
      description: 'Nonprofit credit counseling and debt management',
    },
  },
  'general-distress': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description:
        "Support for any emotional distress - you don't need to be suicidal to reach out",
    },
    secondary: {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
    },
  },
  'veteran-crisis': {
    primary: {
      name: 'Veterans Crisis Line',
      contact: 'Call 988, then press 1',
      available: '24/7',
      description: 'Specialized support for veterans and their families',
    },
    secondary: {
      name: 'Veterans Crisis Line Chat',
      contact: 'https://www.veteranscrisisline.net/get-help-now/chat/',
      available: '24/7',
    },
  },
  'lgbtq-crisis': {
    primary: {
      name: 'Trevor Project',
      contact: '1-866-488-7386',
      available: '24/7',
      description: 'Crisis intervention for LGBTQ+ young people',
    },
    secondary: {
      name: 'Trevor Project Text/Chat',
      contact: 'Text START to 678-678',
      available: '24/7',
    },
    additional: [
      {
        name: 'Trans Lifeline',
        contact: '1-877-565-8860',
        description: 'Peer support for trans people',
      },
    ],
  },
};

// ============================================================================
// GROUNDING EXERCISES
// ============================================================================

const GROUNDING_EXERCISES = {
  '5-4-3-2-1': {
    name: '5-4-3-2-1 Sensory Grounding',
    description: 'Reconnect with the present through your senses',
    steps: [
      'Notice 5 things you can SEE. Look around slowly. Name them.',
      'Notice 4 things you can TOUCH. Feel the texture of your clothes, the surface beneath you.',
      'Notice 3 things you can HEAR. Even subtle sounds - the hum of a light, distant traffic.',
      "Notice 2 things you can SMELL. It's okay if you need to search for scents.",
      'Notice 1 thing you can TASTE. Even the taste in your mouth right now.',
    ],
    closing: 'You are here. You are safe in this moment. How do you feel?',
  },
  'breathing-4-7-8': {
    name: '4-7-8 Breathing',
    description: 'Activate your parasympathetic nervous system',
    steps: [
      'Breathe in quietly through your nose for 4 counts.',
      'Hold your breath for 7 counts.',
      'Exhale completely through your mouth for 8 counts.',
      "This is one breath cycle. Let's do 3-4 cycles together.",
    ],
    closing: "This technique activates your body's relaxation response. How are you feeling?",
  },
  'box-breathing': {
    name: 'Box Breathing',
    description: 'A simple technique used by Navy SEALs to stay calm under pressure',
    steps: [
      'Breathe in for 4 counts',
      'Hold for 4 counts',
      'Breathe out for 4 counts',
      'Hold for 4 counts',
      'Repeat 4 times',
    ],
    closing: 'This creates a sense of calm and control. Notice how your body feels.',
  },
  'body-scan': {
    name: 'Quick Body Scan',
    description: 'Release tension by noticing it',
    steps: [
      'Start at the top of your head. Notice any tension.',
      'Move down to your face - forehead, jaw, eyes. Let them soften.',
      'Notice your shoulders - let them drop away from your ears.',
      "Feel your hands. Unclench them if they're tight.",
      'Notice your stomach. Let it release.',
      'Feel your feet on the ground. You are supported.',
    ],
    closing: 'Your body is with you. You can return to this practice anytime.',
  },
  'safe-place': {
    name: 'Safe Place Visualization',
    description: 'Create a mental sanctuary',
    steps: [
      'Close your eyes if comfortable. Think of a place where you feel completely safe and at peace.',
      'It can be real or imagined - a beach, a forest, a cozy room.',
      'Notice the details. What do you see? Hear? Feel?',
      'Let yourself be fully present in this safe place.',
      'Know that you can return here anytime you need to.',
    ],
    closing: 'This place is always available to you. You carry it within you.',
  },
};

// ============================================================================
// CRISIS RESOURCE TOOLS
// ============================================================================

const provideCrisisResourcesDef: ToolDefinition = {
  id: 'provideCrisisResources',
  name: 'Provide Crisis Resources',
  description: 'Surface appropriate crisis support resources based on situation',
  domain: 'crisis',
  tags: ['crisis', 'safety', 'resources', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('provideCrisisResources'),
      parameters: z.object({
        crisisType: z
          .enum([
            'suicide-self-harm',
            'mental-health',
            'domestic-violence',
            'sexual-assault',
            'substance-abuse',
            'child-abuse',
            'financial-crisis',
            'general-distress',
            'veteran-crisis',
            'lgbtq-crisis',
          ])
          .describe('Type of crisis to provide resources for'),
        urgency: z.enum(['immediate', 'soon', 'ongoing']).describe('Urgency level'),
      }),
      execute: async ({ crisisType, urgency }) => {
        // SAFETY-CRITICAL: Always return resources even on error
        const FALLBACK_RESPONSE =
          `If you're in crisis or need support right now:\n\n` +
          `📞 **988 Suicide & Crisis Lifeline** - Call or text 988 (24/7)\n` +
          `📱 **Crisis Text Line** - Text HOME to 741741 (24/7)\n\n` +
          `You don't have to face this alone. These trained professionals are ready to help.`;

        // Track crisis tool usage for safety monitoring
        const tracker = isLifeCoachAnalyticsEnabled()
          ? trackToolUsage('provideCrisisResources', 'crisis', { agentId: ctx.agentId })
          : null;

        try {
          getLogger().info(
            { agentId: ctx.agentId, crisisType, urgency },
            'Providing crisis resources'
          );

          const resources = CRISIS_RESOURCES[crisisType] || CRISIS_RESOURCES['general-distress'];

          let response = '';

          if (urgency === 'immediate') {
            response += `I hear you, and I want to make sure you have support right now.\n\n`;
            response += `**Please reach out now:**\n`;
            response += `📞 **${resources.primary.name}**\n`;
            response += `   ${resources.primary.contact}\n`;
            response += `   Available: ${resources.primary.available}\n\n`;
            response += `I'm here with you, and these trained professionals can help in ways I cannot.\n`;
          } else {
            response += `I care about you, and I want you to know there's support available.\n\n`;
            response += `**Support Resources:**\n\n`;
            response += `📞 **${resources.primary.name}**\n`;
            response += `   ${resources.primary.contact}\n`;
            response += `   ${resources.primary.available}\n`;
            response += `   ${resources.primary.description}\n\n`;

            if (resources.secondary) {
              response += `📱 **${resources.secondary.name}**\n`;
              response += `   ${resources.secondary.contact}\n`;
              if (resources.secondary.available)
                response += `   ${resources.secondary.available}\n`;
              if (resources.secondary.description)
                response += `   ${resources.secondary.description}\n`;
              response += `\n`;
            }
          }

          response += `You don't have to face this alone. It's okay to reach out for help.\n\n`;
          response += `I'm also here if you want to talk or just need someone to be with you.`;

          tracker?.success({ crisisType, urgency });
          return response;
        } catch (error) {
          // CRITICAL: Never fail silently on crisis tools
          getLogger().error(
            { error, crisisType, urgency },
            'Crisis tool error - returning fallback resources'
          );
          tracker?.error(error instanceof Error ? error : String(error));
          return FALLBACK_RESPONSE;
        }
      },
    });
  },
};

// ============================================================================
// GROUNDING & DE-ESCALATION TOOLS
// ============================================================================

const guideGroundingExerciseDef: ToolDefinition = {
  id: 'guideGroundingExercise',
  name: 'Guide Grounding Exercise',
  description: 'Guide through a grounding exercise to reconnect with the present',
  domain: 'crisis',
  tags: ['crisis', 'grounding', 'anxiety', 'present-moment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('guideGroundingExercise'),
      parameters: z.object({
        technique: z
          .enum(['5-4-3-2-1', 'breathing-4-7-8', 'box-breathing', 'body-scan', 'safe-place'])
          .default('5-4-3-2-1')
          .describe('Grounding technique to use'),
        intensity: z
          .enum(['mild', 'moderate', 'severe'])
          .default('moderate')
          .describe('Intensity of distress'),
      }),
      execute: async ({ technique, intensity }) => {
        // SAFETY-CRITICAL: Grounding exercises must always work
        const FALLBACK_GROUNDING =
          `Let's slow down together.\n\n` +
          `**Quick grounding: 5-4-3-2-1**\n\n` +
          `1. Name 5 things you can see\n` +
          `2. Name 4 things you can touch\n` +
          `3. Name 3 things you can hear\n` +
          `4. Name 2 things you can smell\n` +
          `5. Name 1 thing you can taste\n\n` +
          `Take your time. I'm here with you.`;

        try {
          getLogger().info(
            { agentId: ctx.agentId, technique, intensity },
            'Guiding grounding exercise'
          );

          const exercise = GROUNDING_EXERCISES[technique];

          let response = '';

          if (intensity === 'severe') {
            response += `I'm here with you. Let's slow everything down together.\n\n`;
            response += `First - are you somewhere safe right now? You don't have to answer out loud, just notice.\n\n`;
          }

          response += `**${exercise.name}**\n`;
          response += `${exercise.description}\n\n`;

          response += `Let's do this together:\n\n`;

          exercise.steps.forEach((step: string, i: number) => {
            response += `${i + 1}. ${step}\n`;
            if (technique.includes('breathing')) {
              response += `   _(Take your time with this)_\n`;
            }
            response += `\n`;
          });

          response += `---\n\n`;
          response += `${exercise.closing}`;

          return response;
        } catch (error) {
          getLogger().error(
            { error, technique, intensity },
            'Grounding exercise error - returning fallback'
          );
          return FALLBACK_GROUNDING;
        }
      },
    });
  },
};

const deEscalateAnxietyDef: ToolDefinition = {
  id: 'deEscalateAnxiety',
  name: 'De-escalate Anxiety',
  description: 'Help calm acute anxiety or panic episode',
  domain: 'crisis',
  tags: ['crisis', 'anxiety', 'panic', 'calming'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('deEscalateAnxiety'),
      parameters: z.object({
        symptoms: z
          .array(
            z.enum([
              'racing-heart',
              'difficulty-breathing',
              'feeling-unreal',
              'fear-of-dying',
              'cant-think',
              'shaking',
              'chest-tightness',
              'feeling-trapped',
            ])
          )
          .optional()
          .describe('Symptoms they are experiencing'),
        duration: z.enum(['just-started', 'ongoing', 'recurring']).optional(),
      }),
      execute: async ({ symptoms, duration }) => {
        getLogger().info({ agentId: ctx.agentId, symptoms }, 'De-escalating anxiety');

        let response = `I hear you. What you're feeling is real, and it will pass. Let me help.\n\n`;

        // Address specific symptoms
        if (symptoms?.includes('racing-heart') || symptoms?.includes('difficulty-breathing')) {
          response += `**Your body is in survival mode.** The racing heart and breathing difficulty are your nervous system doing its job - it thinks there's danger. We're going to show it that you're safe.\n\n`;
        }

        if (symptoms?.includes('fear-of-dying')) {
          response += `**This feeling is terrifying, but you are safe.** Panic attacks feel life-threatening but they are not dangerous. No one has ever died from a panic attack. This will pass.\n\n`;
        }

        if (symptoms?.includes('feeling-unreal')) {
          response += `**You're still here.** That floating, unreal feeling is your mind's way of protecting you. Let's gently bring you back.\n\n`;
        }

        response += `**Let's focus on one thing:**\n\n`;
        response += `🫁 **Breathing - Slow and Extended Exhale**\n\n`;
        response += `1. Breathe in through your nose for 4 counts\n`;
        response += `2. Breathe out through your mouth for 8 counts (longer exhale calms the nervous system)\n`;
        response += `3. Repeat 5 times\n\n`;

        response += `**Ground yourself:**\n`;
        response += `- Feel your feet on the floor\n`;
        response += `- Name 5 things you can see right now\n`;
        response += `- Hold something cold if you can (ice, cold water)\n\n`;

        response += `**Remember:**\n`;
        response += `- This feeling is temporary\n`;
        response += `- Your body knows how to calm down\n`;
        response += `- You've survived this before\n`;
        response += `- I'm here with you\n\n`;

        if (duration === 'recurring') {
          response += `Since this happens often, it might be worth talking to a professional who can help you develop more tools. Would you like resources for that?`;
        } else {
          response += `How are you feeling now? We can keep going, or just sit together quietly.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SAFETY PLANNING TOOLS
// ============================================================================

const createSafetyPlanDef: ToolDefinition = {
  id: 'createSafetyPlan',
  name: 'Create Safety Plan',
  description: 'Help create a personal safety plan for crisis moments',
  domain: 'crisis',
  tags: ['crisis', 'safety', 'planning', 'prevention'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('createSafetyPlan'),
      parameters: z.object({
        context: z
          .enum(['mental-health', 'domestic-safety', 'self-harm-prevention', 'general'])
          .describe('Context for the safety plan'),
        step: z
          .enum([
            'overview',
            'warning-signs',
            'coping-strategies',
            'support-people',
            'professional-contacts',
            'safe-environment',
          ])
          .default('overview')
          .describe('Which part of safety planning to focus on'),
      }),
      execute: async ({ context, step }) => {
        getLogger().info({ agentId: ctx.agentId, context, step }, 'Creating safety plan');

        let response = '';

        if (step === 'overview') {
          response = `**Personal Safety Plan**\n\n`;
          response += `A safety plan is a personalized list of strategies and contacts that can help during a crisis. It's best created when you're feeling calm, so it's ready when you need it.\n\n`;
          response += `A complete safety plan includes:\n\n`;
          response += `1. **Warning Signs** - How do you know when you're starting to feel unsafe?\n`;
          response += `2. **Coping Strategies** - Things you can do on your own to calm down\n`;
          response += `3. **Support People** - People you can reach out to for distraction or support\n`;
          response += `4. **Professional Contacts** - Therapist, doctor, crisis line numbers\n`;
          response += `5. **Safe Environment** - How to make your space safer\n\n`;
          response += `Would you like to work through any of these sections together?`;
        } else if (step === 'warning-signs') {
          response = `**Warning Signs - Knowing When You Need Your Plan**\n\n`;
          response += `These are the thoughts, feelings, or situations that signal you're entering a difficult state.\n\n`;
          response += `Some examples:\n`;
          response += `- Thoughts: "I can't handle this," "Everyone would be better off without me"\n`;
          response += `- Feelings: Numbness, hopelessness, rage, terror\n`;
          response += `- Physical: Can't sleep, can't eat, chest tightness\n`;
          response += `- Situations: Being alone too long, certain people or places\n\n`;
          response += `**Your warning signs:**\n`;
          response += `What thoughts, feelings, or situations have preceded past crises for you?`;
        } else if (step === 'coping-strategies') {
          response = `**Coping Strategies - Things You Can Do On Your Own**\n\n`;
          response += `These are healthy ways to get through difficult moments:\n\n`;
          response += `**Distraction:**\n`;
          response += `- Watch something engaging\n`;
          response += `- Play a game that requires focus\n`;
          response += `- Do something with your hands\n\n`;
          response += `**Physical Release:**\n`;
          response += `- Walk, run, exercise\n`;
          response += `- Take a cold shower or hold ice\n`;
          response += `- Deep breathing exercises\n\n`;
          response += `**Soothing:**\n`;
          response += `- Listen to calming music\n`;
          response += `- Wrap in a weighted blanket\n`;
          response += `- Pet an animal\n\n`;
          response += `**Grounding:**\n`;
          response += `- 5-4-3-2-1 sensory exercise\n`;
          response += `- Name everything in the room\n`;
          response += `- Hold something with interesting texture\n\n`;
          response += `What strategies have helped you in the past?`;
        } else if (step === 'support-people') {
          response = `**Support People - Who to Reach Out To**\n\n`;
          response += `Identify people you can contact when coping strategies alone aren't enough.\n\n`;
          response += `**For distraction (can help take your mind off things):**\n`;
          response += `- Who can you call to just chat about normal things?\n`;
          response += `- Who is good at making you laugh?\n\n`;
          response += `**For support (can hold space for your feelings):**\n`;
          response += `- Who can you be honest with about how you're really doing?\n`;
          response += `- Who has helped you through hard times before?\n\n`;
          response += `**For safety (can physically be with you):**\n`;
          response += `- Who can come be with you if needed?\n`;
          response += `- Where could you go to be around people?\n\n`;
          response += `Who are 2-3 people you could add to your safety plan?`;
        } else if (step === 'professional-contacts') {
          response = `**Professional Contacts - Always Keep These Handy**\n\n`;
          response += `📞 **988 Suicide & Crisis Lifeline** - Call or text 988 (24/7)\n`;
          response += `📱 **Crisis Text Line** - Text HOME to 741741 (24/7)\n\n`;
          response += `**Your personal contacts:**\n`;
          response += `- Therapist/counselor name & number:\n`;
          response += `- Psychiatrist (if applicable):\n`;
          response += `- Doctor:\n`;
          response += `- Local crisis center:\n\n`;
          response += `Consider saving these in your phone with easy-to-find names like "Crisis Support" or as favorites.`;
        } else if (step === 'safe-environment') {
          response = `**Safe Environment - Reducing Risk**\n\n`;
          response += `When you're feeling okay, you can take steps to make crisis moments safer.\n\n`;
          response += `This might mean:\n`;
          response += `- Reducing access to means during difficult periods\n`;
          response += `- Having a trusted person hold certain items\n`;
          response += `- Making sure you're not isolated\n`;
          response += `- Identifying safe places you can go\n\n`;
          response += `This is an important conversation to have with a mental health professional who can help you think through specifics.\n\n`;
          response += `Is there anything you've already done to make your environment safer?`;
        }

        return response;
      },
    });
  },
};

const findSafeResourcesDef: ToolDefinition = {
  id: 'findSafeResources',
  name: 'Find Safe Resources',
  description: 'Help find local safety resources like shelters and support services',
  domain: 'crisis',
  tags: ['crisis', 'safety', 'resources', 'local'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findSafeResources'),
      parameters: z.object({
        needType: z
          .enum([
            'shelter',
            'food',
            'domestic-violence-shelter',
            'mental-health-services',
            'addiction-treatment',
            'general',
          ])
          .describe('Type of resource needed'),
        urgency: z.enum(['immediate', 'soon', 'planning']).describe('How urgent the need is'),
      }),
      execute: async ({ needType, urgency }) => {
        getLogger().info({ agentId: ctx.agentId, needType, urgency }, 'Finding safe resources');

        let response = '';

        if (urgency === 'immediate') {
          response += `**Immediate Help:**\n\n`;
          response += `📞 **Call 211** - This connects you to local services immediately\n`;
          response += `   Or text your ZIP code to 898211\n\n`;
        }

        switch (needType) {
          case 'shelter':
            response += `**Emergency Shelter Resources:**\n\n`;
            response += `📞 **211** - Call for local shelter information\n`;
            response += `📱 Text your ZIP to 898211\n\n`;
            response += `Many shelters fill up quickly. 211 can tell you which have space right now.\n`;
            break;

          case 'domestic-violence-shelter':
            response += `**Domestic Violence Safe Shelter:**\n\n`;
            response += `📞 **National Domestic Violence Hotline**: 1-800-799-7233\n`;
            response += `📱 Text START to 88788\n\n`;
            response += `They can connect you with safe shelter in your area and help with safety planning. Calls are confidential.\n\n`;
            response += `If you're in immediate danger, please call 911.\n`;
            break;

          case 'food':
            response += `**Food Assistance:**\n\n`;
            response += `📞 **211** - Find local food banks and meal programs\n`;
            response += `🌐 **FindFood.gov** - https://www.fns.usda.gov/meals4kids\n\n`;
            response += `Local options often include:\n`;
            response += `- Food banks and pantries\n`;
            response += `- Community meal programs\n`;
            response += `- SNAP benefits assistance\n`;
            break;

          case 'mental-health-services':
            response += `**Mental Health Services:**\n\n`;
            response += `📞 **SAMHSA Helpline**: 1-800-662-4357 (24/7)\n`;
            response += `   Free referrals to local treatment services\n\n`;
            response += `📞 **NAMI Helpline**: 1-800-950-6264\n`;
            response += `   Information, support, and referrals\n\n`;
            response += `🌐 **findtreatment.gov** - Search for providers accepting Medicaid or sliding scale\n`;
            break;

          case 'addiction-treatment':
            response += `**Addiction Treatment Resources:**\n\n`;
            response += `📞 **SAMHSA Helpline**: 1-800-662-4357\n`;
            response += `   24/7 treatment referrals in English & Spanish\n\n`;
            response += `🌐 **findtreatment.gov** - Search by location, insurance, services needed\n\n`;
            response += `Many programs offer:\n`;
            response += `- Sliding scale fees\n`;
            response += `- Medicaid acceptance\n`;
            response += `- Free support groups (AA, NA, SMART)\n`;
            break;

          default:
            response += `**General Resource Connection:**\n\n`;
            response += `📞 **211** is your best starting point\n`;
            response += `They can connect you to:\n`;
            response += `- Housing assistance\n`;
            response += `- Food programs\n`;
            response += `- Utility assistance\n`;
            response += `- Healthcare access\n`;
            response += `- Mental health services\n`;
            response += `- Employment help\n`;
        }

        response += `\n\nI can help you prepare for these calls if you'd like.`;

        return response;
      },
    });
  },
};

// ============================================================================
// RECOVERY SUPPORT TOOLS
// ============================================================================

const supportRecoveryJourneyDef: ToolDefinition = {
  id: 'supportRecoveryJourney',
  name: 'Support Recovery Journey',
  description: 'Support someone on an addiction recovery journey',
  domain: 'crisis',
  tags: ['crisis', 'recovery', 'addiction', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('supportRecoveryJourney'),
      parameters: z.object({
        recoveryType: z
          .enum(['alcohol', 'substances', 'behavioral', 'general'])
          .describe('Type of recovery'),
        currentState: z
          .enum(['doing-well', 'struggling', 'craving', 'slip-concern', 'celebrating'])
          .describe('Current state'),
        daysSober: z.number().optional().describe('Days in recovery if known'),
      }),
      execute: async ({ recoveryType, currentState, daysSober }) => {
        getLogger().info(
          { agentId: ctx.agentId, recoveryType, currentState },
          'Supporting recovery'
        );

        let response = '';

        if (currentState === 'craving') {
          response += `**Cravings are part of recovery.** They feel overwhelming but they do pass.\n\n`;
          response += `**Right now:**\n`;
          response += `- Can you call your sponsor or a recovery friend?\n`;
          response += `- Can you get to a meeting? (In-person or online)\n`;
          response += `- Can you change your environment - go somewhere else?\n\n`;
          response += `**HALT check:** Are you Hungry, Angry, Lonely, or Tired? Address the need underneath.\n\n`;
          response += `**Ride the wave:** Cravings peak and pass, usually within 15-30 minutes. You can get through this.\n\n`;
          response += `📞 **SAMHSA Helpline**: 1-800-662-4357 (24/7)\n\n`;
          response += `I'm here with you. What support do you need right now?`;
        } else if (currentState === 'struggling') {
          response += `Recovery is hard work, and struggling doesn't mean failing.\n\n`;
          response += `**Remember:**\n`;
          response += `- Every day you stay in recovery matters\n`;
          response += `- Setbacks in mood aren't the same as relapse\n`;
          response += `- Reaching out (like right now) is strength, not weakness\n\n`;
          response += `**What might help:**\n`;
          response += `- Connect with your support network\n`;
          response += `- Get to a meeting\n`;
          response += `- Call your sponsor\n`;
          response += `- Review what tools have worked before\n\n`;
          response += `What's making today particularly hard?`;
        } else if (currentState === 'slip-concern') {
          response += `I'm glad you're reaching out. That takes courage.\n\n`;
          response += `**If you've slipped:** A slip doesn't erase your progress. It's information, not identity. Many people have slips on the road to lasting recovery.\n\n`;
          response += `**Right now:**\n`;
          response += `- Stop where you are. You don't have to continue.\n`;
          response += `- Call your sponsor immediately\n`;
          response += `- Get to a meeting today if possible\n`;
          response += `- Be honest with your support system\n\n`;
          response += `**Remember:** Coming back from a slip quickly is very different from full relapse. You're still here. That matters.\n\n`;
          response += `📞 **SAMHSA Helpline**: 1-800-662-4357\n\n`;
          response += `Would you like to talk about what happened?`;
        } else if (currentState === 'celebrating') {
          if (daysSober) {
            response += `**${daysSober} days.** That's ${daysSober} days of choosing yourself.\n\n`;
          }
          response += `Every single day matters. This isn't easy, and you're doing it anyway.\n\n`;
          response += `Take a moment to really acknowledge what you've accomplished. Not just surviving, but showing up for yourself over and over again.\n\n`;
          response += `What's helped you get here? What do you want to remember about today?`;
        } else {
          response += `Thank you for checking in. How are you really doing today?\n\n`;
          response += `Recovery is one day at a time, and today is the only day that matters right now.\n\n`;
          if (daysSober) {
            response += `**${daysSober} days** is something to be proud of.\n\n`;
          }
          response += `What's on your mind?`;
        }

        return response;
      },
    });
  },
};

const trackSobrietyMilestoneDef: ToolDefinition = {
  id: 'trackSobrietyMilestone',
  name: 'Track Sobriety Milestone',
  description: 'Celebrate recovery milestones',
  domain: 'crisis',
  tags: ['crisis', 'recovery', 'milestones', 'celebration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackSobrietyMilestone'),
      parameters: z.object({
        milestone: z
          .enum([
            '1-day',
            '1-week',
            '30-days',
            '60-days',
            '90-days',
            '6-months',
            '1-year',
            'anniversary',
            'custom',
          ])
          .describe('Type of milestone'),
        customDays: z.number().optional().describe('Custom number of days'),
      }),
      execute: async ({ milestone, customDays }) => {
        getLogger().info({ agentId: ctx.agentId, milestone }, 'Tracking sobriety milestone');

        const celebrations: Record<string, string> = {
          '1-day': `**One Day.**\n\nDo you know how significant this is? One day is everything. One day means you made a choice, and you kept it. Every journey of recovery started with one day.\n\nYou didn't have to do this, and you did it anyway. That's strength.`,

          '1-week': `**One Week.**\n\n7 days of choosing yourself. 7 days of facing what's hard without your old escape. 7 days of building a new path.\n\nThe first week is often the hardest. You made it through. That's huge.`,

          '30-days': `**30 Days.**\n\nA whole month. You've proven to yourself that you can do this. Your brain is starting to rewire. Your body is healing.\n\nThis is a major milestone. Many people never make it this far. You did.`,

          '60-days': `**60 Days.**\n\nTwo months of daily choices. Two months of showing up for yourself. You're building a new normal.\n\nYou're not just surviving anymore. You're recovering.`,

          '90-days': `**90 Days.**\n\nThree months. This is monumental. Research shows this is when real neurological healing starts to solidify.\n\nYou're not the same person you were 90 days ago. You've done the hardest work.`,

          '6-months': `**Six Months.**\n\nHalf a year of choosing life. Half a year of building new patterns, new relationships with yourself and others.\n\nYou've faced holidays, hard days, triggers, and cravings - and you're still here. That's extraordinary.`,

          '1-year': `**One Year.**\n\n365 days. You did it. You made it through every season, every challenge, every moment when it would have been easier to give in.\n\nThis is a profound accomplishment. Many people dream of where you are standing. Take time to really feel this.\n\nYou didn't just survive this year. You transformed.`,
        };

        let response = '';

        if (milestone === 'custom' && customDays) {
          response = `**${customDays} days.**\n\nEvery single day counts. ${customDays} days of showing up for yourself. ${customDays} days of making the harder choice because you know it's the right one.\n\nThis matters. You matter.`;
        } else if (milestone === 'anniversary') {
          response = `**Another year.**\n\nAnother year of life you've given yourself. Another year of proof that recovery is possible, sustainable, and worth it.\n\nYou're not just maintaining sobriety. You're living. And that's beautiful.`;
        } else {
          response =
            celebrations[milestone] ||
            `Your milestone matters. Every day in recovery is a victory.`;
        }

        response += `\n\n---\n\nHow would you like to honor this milestone?`;

        return response;
      },
    });
  },
};

// ============================================================================
// FINANCIAL EMERGENCY TOOL
// ============================================================================

const findFinancialAssistanceDef: ToolDefinition = {
  id: 'findFinancialAssistance',
  name: 'Find Financial Assistance',
  description: 'Find emergency financial assistance resources',
  domain: 'crisis',
  tags: ['crisis', 'financial', 'emergency', 'assistance'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findFinancialAssistance'),
      parameters: z.object({
        needType: z
          .enum(['rent', 'utilities', 'food', 'medical', 'transportation', 'general'])
          .describe('Type of financial need'),
        urgency: z.enum(['immediate', 'this-week', 'this-month']).describe('How urgent'),
      }),
      execute: async ({ needType, urgency }) => {
        getLogger().info(
          { agentId: ctx.agentId, needType, urgency },
          'Finding financial assistance'
        );

        let response = `**Emergency Financial Assistance**\n\n`;

        response += `📞 **Call 211** - Your first call for local assistance\n`;
        response += `   Text your ZIP code to 898211\n\n`;
        response += `211 connects you to local programs for:\n`;
        response += `- Rent assistance\n`;
        response += `- Utility bill help\n`;
        response += `- Food assistance\n`;
        response += `- Medical cost help\n\n`;

        switch (needType) {
          case 'rent':
            response += `**Rent-Specific Resources:**\n`;
            response += `- Local Community Action Agencies\n`;
            response += `- Churches and religious organizations often have emergency funds\n`;
            response += `- Salvation Army: 1-800-725-2769\n`;
            response += `- St. Vincent de Paul (if in your area)\n\n`;
            response += `**Tip:** Contact your landlord early if you'll be late. Many will work with you.`;
            break;

          case 'utilities':
            response += `**Utility Assistance:**\n`;
            response += `- LIHEAP (Low Income Home Energy Assistance Program)\n`;
            response += `- Many utilities have hardship programs - call them directly\n`;
            response += `- Churches often help with one-time utility bills\n\n`;
            response += `**Tip:** Call your utility company and ask about:\n`;
            response += `- Payment plans\n`;
            response += `- Hardship programs\n`;
            response += `- Winter shutoff protection (if applicable)`;
            break;

          case 'food':
            response += `**Immediate Food Help:**\n`;
            response += `- Local food banks (search: feedingamerica.org/find-your-local-foodbank)\n`;
            response += `- SNAP benefits (food stamps) - apply even if you think you won't qualify\n`;
            response += `- Community meal programs\n`;
            response += `- School meal programs (for kids)\n`;
            break;

          case 'medical':
            response += `**Medical Cost Help:**\n`;
            response += `- Hospital charity care programs (ask billing department)\n`;
            response += `- Community health centers (sliding scale fees)\n`;
            response += `- Patient assistance programs for medications\n`;
            response += `- NeedyMeds.org for medication assistance\n`;
            break;

          default:
            response += `211 will help you find the specific resources available in your community.`;
        }

        if (urgency === 'immediate') {
          response += `\n\n**For immediate crisis:**\n`;
          response += `- Call 211 right now\n`;
          response += `- Be direct about your timeline\n`;
          response += `- Ask what's available same-day or next-day`;
        }

        response += `\n\nWould you like help preparing for any of these calls?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const crisisTools: ToolDefinition[] = [
  // Resources
  provideCrisisResourcesDef,
  findSafeResourcesDef,
  findFinancialAssistanceDef,
  // Grounding & De-escalation
  guideGroundingExerciseDef,
  deEscalateAnxietyDef,
  // Safety Planning
  createSafetyPlanDef,
  // Recovery Support
  supportRecoveryJourneyDef,
  trackSobrietyMilestoneDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'crisis',
  crisisTools
);

export default getToolDefinitions;
