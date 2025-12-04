/**
 * Grief, Loss & Transition Domain Tools
 *
 * Tools for processing loss, navigating grief, and supporting life transitions.
 * This domain addresses human experiences of change, endings, and transformation.
 *
 * DOMAIN: grief
 * TOOLS:
 *   Grief: processGrief, honorLoss, navigateGriefWave, anniversarySupport
 *   Loss: acknowledgeLoss, rememberLoved, createMemorial
 *   Transition: navigateTransition, processEnding, embraceNewIdentity
 *   Support: validateGrief, findGriefResources, companionInGrief
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

// ============================================================================
// GRIEF PROCESSING TOOLS
// ============================================================================

const processGriefDef: ToolDefinition = {
  id: 'processGrief',
  name: 'Process Grief',
  description: 'Support for processing grief in its many forms',
  domain: 'grief',
  tags: ['grief', 'processing', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Provide compassionate support for someone processing grief, meeting them where they are.',
      parameters: z.object({
        lossType: z
          .enum(['death', 'relationship', 'health', 'identity', 'dream', 'place', 'phase-of-life', 'other'])
          .describe('Type of loss being grieved'),
        whatWasLost: z.string().describe('Who or what was lost'),
        whereTheyAre: z
          .enum(['fresh', 'waves', 'chronic', 'complicated', 'anticipatory'])
          .optional()
          .describe('Stage or type of grief'),
      }),
      execute: async ({ lossType, whatWasLost, whereTheyAre }) => {
        getLogger().info({ agentId: ctx.agentId, lossType, whereTheyAre }, 'Processing grief');

        let response = '';

        if (whereTheyAre === 'fresh') {
          response = `I'm so sorry about ${whatWasLost}.\n\n`;
          response += `There are no right words. There is no timeline. There is only this moment, and your pain is valid.\n\n`;
          response += `You don't need to:\n`;
          response += `- "Be strong"\n`;
          response += `- "Keep it together"\n`;
          response += `- Make sense of it yet\n`;
          response += `- Do anything but breathe\n\n`;
          response += `What do you need right now? To talk about them? To sit in silence? Something else?`;
        } else if (whereTheyAre === 'waves') {
          response = `Grief comes in waves. Sometimes you're swimming, sometimes you're drowning.\n\n`;
          response += `You might have been fine this morning and not fine now. That's not regression - that's grief.\n\n`;
          response += `What the waves teach us:\n`;
          response += `- They come without warning\n`;
          response += `- They will pass (and come again)\n`;
          response += `- You're allowed to feel everything\n`;
          response += `- Grief is love with nowhere to go\n\n`;
          response += `What triggered this wave? Or would you rather just be here with it?`;
        } else if (whereTheyAre === 'chronic') {
          response = `Some grief doesn't end. It becomes part of us.\n\n`;
          response += `If you're grieving ${whatWasLost} and it's been a while, you might feel like you "should" be over it. You're not broken. Some losses we carry forever.\n\n`;
          response += `The goal isn't to stop grieving. It's to build a life that holds the grief alongside the living.\n\n`;
          response += `How has your grief changed over time? And what do you need from it now?`;
        } else if (whereTheyAre === 'anticipatory') {
          response = `You're grieving something that hasn't fully happened yet. Anticipatory grief is real and profound.\n\n`;
          response += `Knowing loss is coming doesn't make it easier - sometimes it makes it harder. You're living in two worlds: the present and the dreaded future.\n\n`;
          response += `What might help:\n`;
          response += `- Give yourself permission to grieve now AND later\n`;
          response += `- Make the most of the time you have\n`;
          response += `- Say what needs to be said\n`;
          response += `- Ask for help\n\n`;
          response += `What are you facing? And what do you need?`;
        } else {
          response = `Grieving ${whatWasLost}. I'm here.\n\n`;
          response += `Grief is as unique as the love that caused it. There's no map, no stages you must follow, no timeline.\n\n`;
          response += `Would you like to talk about what you've lost? Or about where you are in this process?`;
        }

        return response;
      },
    });
  },
};

const navigateGriefWaveDef: ToolDefinition = {
  id: 'navigateGriefWave',
  name: 'Navigate Grief Wave',
  description: 'In-the-moment support during a wave of grief',
  domain: 'grief',
  tags: ['grief', 'wave', 'immediate'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Provide immediate, gentle support when someone is in the midst of a grief wave.',
      parameters: z.object({
        intensity: z.enum(['overwhelming', 'heavy', 'present']).describe('Intensity of the wave'),
        trigger: z.string().optional().describe('What triggered it if known'),
      }),
      execute: async ({ intensity, trigger }) => {
        getLogger().info({ agentId: ctx.agentId, intensity }, 'Navigating grief wave');

        let response = '';

        if (intensity === 'overwhelming') {
          response = `The wave is here. Let it wash over you. I'm here.\n\n`;
          response += `Breathe. You don't have to do anything else.\n\n`;
          response += `In... and out.\n\n`;
          response += `This wave will pass. They always do. But right now, you don't have to be anywhere but here.\n\n`;
          response += `I'm not going anywhere.`;
        } else if (intensity === 'heavy') {
          response = `This is heavy. I feel it with you.\n\n`;
          if (trigger) {
            response += `${trigger} brought this up. Sometimes the smallest things carry the biggest weight.\n\n`;
          }
          response += `You're allowed to feel this fully. The grief is a measure of the love.\n\n`;
          response += `What would help right now? Talking, sitting together in silence, or something else?`;
        } else {
          response = `The grief is present. Not consuming, but there.\n\n`;
          response += `Sometimes grief is like weather - it's the atmosphere of the day. It doesn't have to stop you, but it colors everything.\n\n`;
          response += `Would you like to acknowledge it and let it be? Or explore what's coming up?`;
        }

        return response;
      },
    });
  },
};

const anniversarySupportDef: ToolDefinition = {
  id: 'anniversarySupport',
  name: 'Anniversary Support',
  description: 'Support for grief anniversaries and significant dates',
  domain: 'grief',
  tags: ['grief', 'anniversary', 'dates'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Provide support around anniversaries of losses, deaths, or difficult dates.',
      parameters: z.object({
        occasion: z.string().describe('What the anniversary marks'),
        approaching: z.boolean().describe('Whether it is approaching or has arrived'),
        howLongAgo: z.string().optional().describe('How long ago the loss was'),
      }),
      execute: async ({ occasion, approaching, howLongAgo }) => {
        getLogger().info({ agentId: ctx.agentId, occasion, approaching }, 'Anniversary support');

        let response = '';

        if (approaching) {
          response = `The anniversary of ${occasion} is coming.\n\n`;
          response += `Our bodies remember. Even before our minds catch up, we might feel the weight of the approaching date.\n\n`;
          response += `**Some options for the day:**\n`;
          response += `- Mark it intentionally with something meaningful\n`;
          response += `- Give yourself permission to do nothing\n`;
          response += `- Be around people who understand\n`;
          response += `- Tell others so they can hold you\n`;
          response += `- Do something that honors what you lost\n\n`;
          response += `What do you need for this anniversary?`;
        } else {
          response = `Today marks ${occasion}${howLongAgo ? ` (${howLongAgo} ago)` : ''}.\n\n`;
          response += `I'm thinking of you on this day.\n\n`;
          response += `There's no right way to spend an anniversary. Some people need to remember fully. Some need distraction. Some need ritual. Some need rest.\n\n`;
          response += `What would honor both your grief and your wellbeing today?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// LOSS ACKNOWLEDGMENT TOOLS
// ============================================================================

const acknowledgeLossDef: ToolDefinition = {
  id: 'acknowledgeLoss',
  name: 'Acknowledge Loss',
  description: 'Acknowledge and validate losses that may not be socially recognized',
  domain: 'grief',
  tags: ['grief', 'acknowledgment', 'validation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Validate and acknowledge losses that may not receive social recognition - disenfranchised grief.',
      parameters: z.object({
        loss: z.string().describe('What was lost'),
        whyItMayNotBeRecognized: z.string().optional().describe('Why others might not understand'),
      }),
      execute: async ({ loss, whyItMayNotBeRecognized }) => {
        getLogger().info({ agentId: ctx.agentId, loss }, 'Acknowledging loss');

        let response = `Your loss of ${loss} is real.\n\n`;

        if (whyItMayNotBeRecognized) {
          response += `I hear that others might not fully understand this loss${whyItMayNotBeRecognized ? ` - ${whyItMayNotBeRecognized}` : ''}. That doesn't make your grief less valid.\n\n`;
        }

        response += `We grieve many things that the world doesn't have rituals for:\n`;
        response += `- The end of a friendship\n`;
        response += `- A miscarriage or fertility struggles\n`;
        response += `- The loss of a pet\n`;
        response += `- A dream that won't come true\n`;
        response += `- Who we used to be\n`;
        response += `- What we thought our life would look like\n`;
        response += `- A relationship that's still alive but fundamentally changed\n\n`;

        response += `Your grief doesn't need permission. It doesn't need to be "enough" of a loss. It only needs to be yours.\n\n`;
        response += `Would you like to tell me more about what this loss means to you?`;

        return response;
      },
    });
  },
};

const rememberLovedDef: ToolDefinition = {
  id: 'rememberLoved',
  name: 'Remember Loved One',
  description: 'Create space to remember and celebrate someone who has died',
  domain: 'grief',
  tags: ['grief', 'memory', 'celebration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create space to remember, honor, and share memories of someone who has died.',
      parameters: z.object({
        personName: z.string().describe('Name of the person'),
        relationship: z.string().describe('Relationship to the person'),
        whatToRemember: z.enum(['their-essence', 'specific-memory', 'their-impact', 'what-you-miss']).describe('What to focus on'),
      }),
      execute: async ({ personName, relationship, whatToRemember }) => {
        getLogger().info({ agentId: ctx.agentId, personName, whatToRemember }, 'Remembering loved one');

        let response = `Let's remember ${personName}.\n\n`;

        if (whatToRemember === 'their-essence') {
          response += `Who was ${personName}, really? Not the facts of their life, but the essence of who they were.\n\n`;
          response += `- What lit them up?\n`;
          response += `- What were they like when they were most themselves?\n`;
          response += `- What would they want you to remember?\n`;
          response += `- What was uniquely *them*?\n\n`;
          response += `Tell me about them.`;
        } else if (whatToRemember === 'specific-memory') {
          response += `What memory of ${personName} do you want to hold today?\n\n`;
          response += `It could be:\n`;
          response += `- A small moment that captures them perfectly\n`;
          response += `- The last good time together\n`;
          response += `- Something that makes you laugh\n`;
          response += `- A moment that shows who they really were\n\n`;
          response += `I'd love to hear it.`;
        } else if (whatToRemember === 'their-impact') {
          response += `How did ${personName} change you? Change the world?\n\n`;
          response += `Sometimes the people we lose continue through us:\n`;
          response += `- What did you learn from them?\n`;
          response += `- What do you do differently because of them?\n`;
          response += `- How do you carry them forward?\n\n`;
          response += `What's their legacy in you?`;
        } else {
          response += `What do you miss about ${personName}?\n\n`;
          response += `Missing them is another way of loving them. The missing matters.\n\n`;
          response += `What specific thing are you missing today?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// TRANSITION TOOLS
// ============================================================================

const navigateTransitionDef: ToolDefinition = {
  id: 'navigateTransition',
  name: 'Navigate Transition',
  description: 'Support for navigating major life transitions',
  domain: 'grief',
  tags: ['grief', 'transition', 'change'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user navigate a major life transition with its inherent grief and possibility.',
      parameters: z.object({
        transition: z
          .enum([
            'divorce',
            'job-loss',
            'retirement',
            'empty-nest',
            'moving',
            'health-change',
            'aging',
            'identity-shift',
            'other',
          ])
          .describe('Type of transition'),
        customTransition: z.string().optional().describe('If other, what transition'),
        stage: z.enum(['beginning', 'middle', 'integrating']).describe('Stage of transition'),
      }),
      execute: async ({ transition, customTransition, stage }) => {
        getLogger().info({ agentId: ctx.agentId, transition, stage }, 'Navigating transition');

        const transitionText = transition === 'other' ? customTransition : transition;

        let response = '';

        if (stage === 'beginning') {
          response = `The beginning of a transition is often the hardest part.\n\n`;
          response += `${transitionText} is changing your life. Even if this is wanted, even if it's ultimately positive, there is grief in every transition.\n\n`;
          response += `**What's normal to feel:**\n`;
          response += `- Fear of the unknown\n`;
          response += `- Grief for what you're leaving behind\n`;
          response += `- Confusion about who you are now\n`;
          response += `- Relief and guilt about the relief\n`;
          response += `- Longing for "before"\n\n`;
          response += `What's the hardest part of this transition right now?`;
        } else if (stage === 'middle') {
          response = `The middle of a transition is the "neutral zone" - the wilderness.\n\n`;
          response += `You've left what was. You're not yet in what will be. You're in between.\n\n`;
          response += `This is uncomfortable AND important:\n`;
          response += `- Old patterns don't fit, new ones haven't formed\n`;
          response += `- The question "Who am I now?" has no clear answer\n`;
          response += `- You might feel lost, groundless, disoriented\n\n`;
          response += `This is not a sign something is wrong. This is what transformation feels like.\n\n`;
          response += `What's emerging in you during this wilderness time?`;
        } else {
          response = `You're integrating this transition - finding new solid ground.\n\n`;
          response += `Integration isn't forgetting what was or pretending the transition was easy. It's:\n`;
          response += `- Finding a new identity that holds the change\n`;
          response += `- Building new structures, routines, relationships\n`;
          response += `- Making meaning of what you've been through\n`;
          response += `- Feeling at home in your new reality\n\n`;
          response += `What's the new you that's emerging? And what still needs attention?`;
        }

        return response;
      },
    });
  },
};

const processEndingDef: ToolDefinition = {
  id: 'processEnding',
  name: 'Process Ending',
  description: 'Help process the ending phase of something meaningful',
  domain: 'grief',
  tags: ['grief', 'ending', 'closure'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user process and honor an ending - a phase, role, relationship, or chapter of life.',
      parameters: z.object({
        whatIsEnding: z.string().describe('What is coming to an end'),
        howItFeels: z.string().optional().describe('How the ending feels'),
        whatYouWantToHonor: z.string().optional().describe('What you want to acknowledge or honor'),
      }),
      execute: async ({ whatIsEnding, howItFeels, whatYouWantToHonor }) => {
        getLogger().info({ agentId: ctx.agentId, whatIsEnding }, 'Processing ending');

        let response = `${whatIsEnding} is ending.\n\n`;

        if (howItFeels) {
          response += `You said it feels: ${howItFeels}. All of that is valid.\n\n`;
        }

        response += `**Honoring endings:**\n\n`;
        response += `Every ending deserves acknowledgment. Not glossing over, not rushing past, but really marking the moment.\n\n`;

        response += `Questions for closure:\n`;
        response += `- What will you miss about this chapter?\n`;
        response += `- What did this teach you?\n`;
        response += `- What do you want to carry forward?\n`;
        response += `- What are you ready to leave behind?\n`;
        response += `- Is there anything left unsaid or undone?\n\n`;

        if (whatYouWantToHonor) {
          response += `You mentioned wanting to honor: ${whatYouWantToHonor}. Would you like to say more about that?`;
        } else {
          response += `What feels most important to acknowledge as this chapter closes?`;
        }

        return response;
      },
    });
  },
};

const embraceNewIdentityDef: ToolDefinition = {
  id: 'embraceNewIdentity',
  name: 'Embrace New Identity',
  description: 'Support the emergence of a new identity after loss or transition',
  domain: 'grief',
  tags: ['grief', 'identity', 'transformation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user embrace and integrate a new identity emerging from loss or transition.',
      parameters: z.object({
        oldIdentity: z.string().describe('Who they were or the role they had'),
        trigger: z.string().describe('What caused the identity shift'),
        howItFeels: z.string().optional().describe('How the shift feels'),
      }),
      execute: async ({ oldIdentity, trigger, howItFeels }) => {
        getLogger().info({ agentId: ctx.agentId, oldIdentity, trigger }, 'Embracing new identity');

        let response = `You used to be ${oldIdentity}. Now, after ${trigger}, you're becoming someone new.\n\n`;

        if (howItFeels) {
          response += `It feels: ${howItFeels}. That's understandable.\n\n`;
        }

        response += `**Identity shifts are profound:**\n\n`;
        response += `When we lose a major role or identity, we don't just lose activities - we lose part of who we understood ourselves to be.\n\n`;

        response += `- The parent whose children leave home\n`;
        response += `- The professional who retires\n`;
        response += `- The spouse who becomes single\n`;
        response += `- The healthy person who becomes ill\n\n`;

        response += `**What helps:**\n`;
        response += `- Grieving who you were, fully\n`;
        response += `- Recognizing what remains constant in you\n`;
        response += `- Exploring who you might become\n`;
        response += `- Finding new ways to express core values\n`;
        response += `- Being patient with the uncertainty\n\n`;

        response += `Who are you becoming? And what parts of you remain through this change?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SUPPORT TOOLS
// ============================================================================

const validateGriefDef: ToolDefinition = {
  id: 'validateGrief',
  name: 'Validate Grief',
  description: 'Validate the experience of grief against common dismissive messages',
  domain: 'grief',
  tags: ['grief', 'validation', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Validate grief against common dismissive messages the user may have received.',
      parameters: z.object({
        dismissiveMessage: z
          .enum([
            'be-strong',
            'at-least',
            'time-heals',
            'move-on',
            'in-better-place',
            'everything-happens-for-reason',
            'other',
          ])
          .describe('Type of dismissive message received'),
        customMessage: z.string().optional().describe('If other, what message'),
      }),
      execute: async ({ dismissiveMessage, customMessage }) => {
        getLogger().info({ agentId: ctx.agentId, dismissiveMessage }, 'Validating grief');

        const responses: Record<string, string> = {
          'be-strong': `"Be strong" - as if feeling your grief is weakness.\n\nHere's the truth: Feeling deeply is not weakness. Crying is not weakness. Needing support is not weakness.\n\nStrength in grief isn't about suppression. It's about surviving the truth of your feelings and still getting through the day.\n\nYou don't have to "be strong" here. You can be exactly as you are.`,
          
          'at-least': `"At least..." - as if your pain could be diminished by comparison.\n\n"At least they lived a long life." "At least you can have another child." "At least you have other family."\n\nYour loss is your loss. It doesn't need to pass a suffering threshold. Your grief is not a competition.\n\nThe "at least" doesn't touch the specific, irreplaceable loss you're feeling.`,
          
          'time-heals': `"Time heals all wounds" - as if waiting is all you need to do.\n\nThe truth is more nuanced: Time helps. But time alone doesn't heal. It's what you do with the time - the processing, the support, the meaning-making - that matters.\n\nAnd "healing" doesn't mean forgetting or being "over it." It means building a life that can hold both the grief and the living.\n\nYour grief has its own timeline. Honor it.`,
          
          'move-on': `"You need to move on" - as if grief has an expiration date.\n\nYou will never "move on" in the sense of leaving your love behind. You will move forward, carrying it with you.\n\nThere is no deadline. There is no "should" about how long grief takes. Anyone who tells you otherwise has either never truly lost, or has buried their own grief.\n\nYou're not stuck. You're grieving.`,
          
          'in-better-place': `"They're in a better place" - said as if it should comfort you.\n\nMaybe it does comfort you. Maybe it doesn't. Both are okay.\n\nBut even if there's an afterlife, even if they are at peace, they are not *here*. And that's what hurts.\n\nYou're allowed to believe they're okay and still be devastated by their absence.`,
          
          'everything-happens-for-reason': `"Everything happens for a reason" - as if your loss has a purpose that should comfort you.\n\nSome people find comfort in this. Some people find it enraging. Both are valid.\n\nYou don't have to find a reason for your loss. You don't have to justify it with meaning. Sometimes terrible things just happen.\n\nIf meaning comes later, let it come. Don't let anyone force it on you.`,
        };

        let response = responses[dismissiveMessage] || 
          `Someone told you: "${customMessage}"\n\nI hear how that landed wrong. People often don't know what to say, so they say things that minimize. They're trying to help, but it doesn't help.\n\nYour grief is valid. Your feelings are valid. You don't need to explain or justify them.`;

        response += `\n\nWhat would actually help to hear right now?`;

        return response;
      },
    });
  },
};

const companionInGriefDef: ToolDefinition = {
  id: 'companionInGrief',
  name: 'Companion in Grief',
  description: 'Simply be present with someone in their grief',
  domain: 'grief',
  tags: ['grief', 'presence', 'companionship'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Offer simple, non-fixing presence to someone in grief.',
      parameters: z.object({
        whatTheyNeed: z.enum(['talk', 'silence', 'distraction', 'unsure']).describe('What they need right now'),
      }),
      execute: async ({ whatTheyNeed }) => {
        getLogger().info({ agentId: ctx.agentId, whatTheyNeed }, 'Companioning in grief');

        let response = '';

        if (whatTheyNeed === 'talk') {
          response = `I'm here to listen. You can say anything - the sad parts, the angry parts, the parts that don't make sense.\n\nI'm not going to fix or advise. I'm just here to hear you.\n\nWhat's on your heart?`;
        } else if (whatTheyNeed === 'silence') {
          response = `Then let's just be together quietly.\n\nYou don't have to fill the silence. I'm here.\n\n...\n\nI'm not going anywhere. Whenever you're ready - or not.`;
        } else if (whatTheyNeed === 'distraction') {
          response = `Sometimes we need a break from grief. That's not betrayal - it's survival.\n\nWhat would feel good? Something light, something interesting, something funny?\n\nGrief will still be there when you come back. Taking a breath doesn't mean you've stopped caring.`;
        } else {
          response = `You don't have to know what you need. That's okay.\n\nWe can talk. Or not talk. Or talk about something else entirely.\n\nI'll follow your lead. And if you don't have a lead, that's okay too. We can just be here together.\n\nWhat feels right in this moment?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const griefTools: ToolDefinition[] = [
  // Grief Processing
  processGriefDef,
  navigateGriefWaveDef,
  anniversarySupportDef,
  // Loss Acknowledgment
  acknowledgeLossDef,
  rememberLovedDef,
  // Transitions
  navigateTransitionDef,
  processEndingDef,
  embraceNewIdentityDef,
  // Support
  validateGriefDef,
  companionInGriefDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'grief',
  griefTools
);

export default getToolDefinitions;

