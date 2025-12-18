/**
 * Presence & Embodiment Domain Tools
 *
 * Tools for cultivating presence, grounding, mindfulness, and embodied awareness.
 * This domain addresses the human capacity to be fully here, now.
 *
 * DOMAIN: presence
 * TOOLS:
 *   Grounding: groundInBody, groundingExercise, returnToPresent
 *   Awareness: noticeThisMoment, bodyAwareness, breatheWithMe
 *   Savoring: savorExperience, slowDown, fullAttention
 *   Flow: recognizeFlow, enterFlow, protectPresence
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log as _log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// GROUNDING TOOLS
// ============================================================================

const groundInBodyDef: ToolDefinition = {
  id: 'groundInBody',
  name: 'Ground In Body',
  description: 'Come back to physical presence and bodily awareness',
  domain: 'presence',
  tags: ['presence', 'grounding', 'body'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('groundInBody'),
      parameters: z.object({
        state: z
          .enum(['anxious', 'scattered', 'disconnected', 'overwhelmed', 'neutral'])
          .describe('Current state'),
      }),
      execute: async ({ state }) => {
        getLogger().info({ agentId: ctx.agentId, state }, 'Grounding in body');

        let response = `Let's come back to your body.\n\n`;

        if (state === 'anxious' || state === 'overwhelmed') {
          response += `When we're anxious or overwhelmed, we often leave our bodies - getting lost in thoughts, worries, futures that haven't happened.\n\n`;
        } else if (state === 'disconnected') {
          response += `We can go through whole days disconnected from our physical selves, living in our heads.\n\n`;
        }

        response += `**5-4-3-2-1 Grounding:**\n\n`;
        response += `• **5 things you can SEE** - Look around. Name them.\n`;
        response += `• **4 things you can TOUCH** - Feel the chair, your clothes, the air.\n`;
        response += `• **3 things you can HEAR** - Listen. What's there?\n`;
        response += `• **2 things you can SMELL** - Notice what scents are present.\n`;
        response += `• **1 thing you can TASTE** - Even the taste of your own mouth.\n\n`;
        response += `Take your time. There's no rush.\n\n`;
        response += `How do you feel after moving through these senses?`;

        return response;
      },
    });
  },
};

const groundingExerciseDef: ToolDefinition = {
  id: 'groundingExercise',
  name: 'Grounding Exercise',
  description: 'Guided grounding exercise for returning to the present',
  domain: 'presence',
  tags: ['presence', 'grounding', 'exercise'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('groundingExercise'),
      parameters: z.object({
        type: z
          .enum(['feet-on-ground', 'body-scan', 'breath', 'anchor'])
          .describe('Type of grounding'),
        duration: z.enum(['quick', 'medium', 'extended']).optional().describe('How long'),
      }),
      execute: async ({ type, duration = 'quick' }) => {
        getLogger().info({ agentId: ctx.agentId, type, duration }, 'Grounding exercise');

        let response = '';

        if (type === 'feet-on-ground') {
          response = `**Feet on the Ground**\n\n`;
          response += `Feel your feet.\n\n`;
          response += `Whether you're sitting or standing, notice where your feet meet the ground.\n`;
          response += `Press down slightly. Feel the floor holding you up.\n`;
          response += `You are here. The earth is solid beneath you.\n`;
          response += `Your feet have been carrying you your whole life.\n\n`;
          response += `Breathe. You're grounded.`;
        } else if (type === 'body-scan') {
          response = `**Quick Body Scan**\n\n`;
          response += `Start at the top of your head.\n`;
          response += `Notice any sensation - warmth, tension, nothing at all.\n\n`;
          response += `Move down: forehead... eyes... jaw (often tight - soften it)...\n`;
          response += `Neck and shoulders (let them drop)...\n`;
          response += `Chest... belly (let it be soft)...\n`;
          response += `Hips... legs... feet...\n\n`;
          response += `Now notice your body as a whole. You're in a body. You're alive. You're here.`;
        } else if (type === 'breath') {
          response = `**Breath Grounding**\n\n`;
          response += `Just breathe.\n\n`;
          response += `In through the nose... out through the mouth.\n`;
          response += `Feel the air coming in - cool.\n`;
          response += `Feel the air going out - warm.\n\n`;
          response += `You don't have to breathe perfectly. Just notice the breath that's already happening.\n\n`;
          response += `Your breath is your anchor to now. It's always here, always available.\n\n`;
          response += `One more breath. Let it be slow. Let it be full.`;
        } else {
          response = `**Find Your Anchor**\n\n`;
          response += `An anchor is something physical that brings you back to now.\n\n`;
          response += `Some options:\n`;
          response += `- Press your thumb and finger together firmly\n`;
          response += `- Place your hand on your heart\n`;
          response += `- Feel your feet on the floor\n`;
          response += `- Touch something with texture\n`;
          response += `- Hold something meaningful\n\n`;
          response += `Pick one. Use it whenever you need to come back to the present.\n\n`;
          response += `What anchor feels right for you?`;
        }

        return response;
      },
    });
  },
};

const returnToPresentDef: ToolDefinition = {
  id: 'returnToPresent',
  name: 'Return To Present',
  description: 'Gently come back when lost in past or future',
  domain: 'presence',
  tags: ['presence', 'return', 'now'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('returnToPresent'),
      parameters: z.object({
        whereLost: z
          .enum(['past', 'future', 'both', 'unsure'])
          .describe('Where attention has gone'),
        whatAbout: z.string().optional().describe('What the mind is caught on'),
      }),
      execute: async ({ whereLost, whatAbout }) => {
        getLogger().info({ agentId: ctx.agentId, whereLost }, 'Returning to present');

        let response = '';

        if (whereLost === 'past') {
          response = `Your mind is in the past${whatAbout ? ` - ${whatAbout}` : ''}.\n\n`;
          response += `The past is done. It can't be changed. And right now, you're not there - you're here.\n\n`;
          response += `**Coming back:**\n`;
          response += `- The past is a memory happening now\n`;
          response += `- In this present moment, you're okay\n`;
          response += `- What happened there doesn't have to own what happens here\n\n`;
          response += `What's actually happening right now, in this moment?`;
        } else if (whereLost === 'future') {
          response = `Your mind is in the future${whatAbout ? ` - ${whatAbout}` : ''}.\n\n`;
          response += `The future hasn't happened yet. And worry is not preparation - it's just suffering in advance.\n\n`;
          response += `**Coming back:**\n`;
          response += `- The future is imagination happening now\n`;
          response += `- You're not there yet - you're here\n`;
          response += `- Right now, in this moment, you have what you need\n\n`;
          response += `What's true in this moment, not in some imagined future?`;
        } else {
          response = `Your mind is time-traveling - bouncing between what was and what might be.\n\n`;
          response += `Meanwhile, you're missing what is.\n\n`;
          response += `**The only real moment is this one.**\n\n`;
          response += `Right now:\n`;
          response += `- What do you see?\n`;
          response += `- What do you hear?\n`;
          response += `- What do you feel in your body?\n\n`;
          response += `This moment is the only one you can actually live.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// AWARENESS TOOLS
// ============================================================================

const noticeThisMomentDef: ToolDefinition = {
  id: 'noticeThisMoment',
  name: 'Notice This Moment',
  description: 'Practice simple present-moment awareness',
  domain: 'presence',
  tags: ['presence', 'awareness', 'now'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('noticeThisMoment'),
      parameters: z.object({
        focus: z
          .enum(['open', 'sensory', 'breath', 'body', 'sounds'])
          .describe('Focus of attention'),
      }),
      execute: async ({ focus }) => {
        getLogger().info({ agentId: ctx.agentId, focus }, 'Noticing this moment');

        let response = `**Notice This Moment**\n\n`;

        if (focus === 'open') {
          response += `Just notice.\n\n`;
          response += `Don't try to make anything happen. Don't try to stop anything from happening.\n\n`;
          response += `Just be aware.\n\n`;
          response += `What's here? What's arising? What's passing?\n\n`;
          response += `You're the sky - thoughts and feelings are weather. The sky doesn't try to stop clouds.`;
        } else if (focus === 'sensory') {
          response += `Come to your senses - literally.\n\n`;
          response += `- What colors do you see?\n`;
          response += `- What shapes?\n`;
          response += `- What sounds, close and far?\n`;
          response += `- What textures touch your skin?\n`;
          response += `- What temperature is the air?\n\n`;
          response += `Your senses only work in the present. They're doorways to now.`;
        } else if (focus === 'breath') {
          response += `Follow your breath.\n\n`;
          response += `Don't control it. Just observe.\n\n`;
          response += `Where do you feel it most? Nostrils? Chest? Belly?\n`;
          response += `Notice the pause between in and out.\n`;
          response += `Notice how each breath is slightly different.\n\n`;
          response += `Just this breath. Then just this one. That's all there ever is.`;
        } else if (focus === 'body') {
          response += `Feel your body from the inside.\n\n`;
          response += `Not thinking about it - feeling it.\n\n`;
          response += `- Where is there energy?\n`;
          response += `- Where is there stillness?\n`;
          response += `- Where is there comfort? Discomfort?\n`;
          response += `- What's the overall sense of being in your body right now?\n\n`;
          response += `Your body is always in the present. Your mind is the time traveler.`;
        } else {
          response += `Listen.\n\n`;
          response += `Close your eyes if you can. Open your ears.\n\n`;
          response += `What do you hear?\n`;
          response += `- Nearby sounds\n`;
          response += `- Far away sounds\n`;
          response += `- Continuous sounds (like air or traffic)\n`;
          response += `- Intermittent sounds\n`;
          response += `- Silence between sounds\n\n`;
          response += `The soundtrack of this moment. Unique. Never to repeat.`;
        }

        return response;
      },
    });
  },
};

const breatheWithMeDef: ToolDefinition = {
  id: 'breatheWithMe',
  name: 'Breathe With Me',
  description: 'Guided breathing for presence and calm',
  domain: 'presence',
  tags: ['presence', 'breathing', 'calm'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('breatheWithMe'),
      parameters: z.object({
        technique: z.enum(['simple', 'box', '4-7-8', 'coherent']).describe('Breathing technique'),
        purpose: z
          .enum(['calm', 'energize', 'presence', 'sleep'])
          .optional()
          .describe('Purpose of breathing'),
      }),
      execute: async ({ technique, purpose = 'presence' }) => {
        getLogger().info({ agentId: ctx.agentId, technique, purpose }, 'Breathing together');

        let response = `**Breathe With Me**\n\n`;

        if (technique === 'simple') {
          response += `Let's just breathe together. Simple.\n\n`;
          response += `Breathe in... 2... 3... 4...\n`;
          response += `Breathe out... 2... 3... 4... 5... 6...\n\n`;
          response += `Again.\n`;
          response += `In... 2... 3... 4...\n`;
          response += `Out... 2... 3... 4... 5... 6...\n\n`;
          response += `A longer exhale calms the nervous system.\n\n`;
          response += `One more time, at your own pace.`;
        } else if (technique === 'box') {
          response += `**Box Breathing** (Navy SEALs use this for stress)\n\n`;
          response += `Four sides of a box, four counts each:\n\n`;
          response += `• In... 2... 3... 4\n`;
          response += `• Hold... 2... 3... 4\n`;
          response += `• Out... 2... 3... 4\n`;
          response += `• Hold... 2... 3... 4\n\n`;
          response += `Repeat for 4 cycles. Feel your heart rate slow.`;
        } else if (technique === '4-7-8') {
          response += `**4-7-8 Breathing** (Dr. Andrew Weil's relaxation technique)\n\n`;
          response += `• Inhale through nose: 4 counts\n`;
          response += `• Hold: 7 counts\n`;
          response += `• Exhale through mouth: 8 counts\n\n`;
          response += `The long exhale activates your rest-and-digest system.\n\n`;
          response += `Do this 4 times. Notice how you feel after.`;
        } else {
          response += `**Coherent Breathing** (for heart-brain coherence)\n\n`;
          response += `Breathe at about 5 breaths per minute:\n`;
          response += `• In for 6 seconds\n`;
          response += `• Out for 6 seconds\n\n`;
          response += `Smooth, continuous, no pause.\n`;
          response += `This rhythm synchronizes heart, brain, and nervous system.\n\n`;
          response += `Try for 2-3 minutes and notice the shift.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SAVORING TOOLS
// ============================================================================

const savorExperienceDef: ToolDefinition = {
  id: 'savorExperience',
  name: 'Savor Experience',
  description: 'Practice deeply savoring a positive experience',
  domain: 'presence',
  tags: ['presence', 'savoring', 'pleasure'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('savorExperience'),
      parameters: z.object({
        experience: z.string().describe('The experience to savor'),
        when: z.enum(['now', 'recent', 'memory']).describe('When this experience is happening'),
      }),
      execute: async ({ experience, when }) => {
        getLogger().info({ agentId: ctx.agentId, when }, 'Savoring experience');

        let response = `**Savoring: ${experience}**\n\n`;

        if (when === 'now') {
          response += `This is happening now. Don't rush past it.\n\n`;
          response += `**Deepen it:**\n`;
          response += `- Use all your senses - what do you see, hear, feel, smell, taste?\n`;
          response += `- Where do you feel this in your body?\n`;
          response += `- Let yourself really receive it\n`;
          response += `- Tell yourself: "This is good. I'm allowed to enjoy this."\n\n`;
          response += `Savoring is how we extract maximum joy from experience.`;
        } else if (when === 'recent') {
          response += `This just happened. Let's not let it slip away.\n\n`;
          response += `**Replay and expand:**\n`;
          response += `- Close your eyes and replay it in your mind\n`;
          response += `- What details stand out?\n`;
          response += `- How did it feel in your body?\n`;
          response += `- What made it good?\n`;
          response += `- Let the feeling wash over you again\n\n`;
          response += `Savoring recent experiences actually increases happiness.`;
        } else {
          response += `Let's visit this memory fully.\n\n`;
          response += `**Memory savoring:**\n`;
          response += `- Close your eyes and transport yourself there\n`;
          response += `- What did you see, hear, feel?\n`;
          response += `- Who was there?\n`;
          response += `- What made this moment special?\n`;
          response += `- Let yourself feel the echo of that joy\n\n`;
          response += `Memories are not just in the past - they can bring joy in the present too.`;
        }

        return response;
      },
    });
  },
};

const slowDownDef: ToolDefinition = {
  id: 'slowDown',
  name: 'Slow Down',
  description: 'Invitation and support for slowing down',
  domain: 'presence',
  tags: ['presence', 'slow', 'pace'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('slowDown'),
      parameters: z.object({
        rushingBecause: z.string().optional().describe('Why they are rushing'),
      }),
      execute: async ({ rushingBecause }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Slowing down');

        let response = `**Slow Down**\n\n`;
        if (rushingBecause) {
          response += `You're rushing because: ${rushingBecause}\n\n`;
        }
        response += `Speed doesn't always equal effectiveness. And rushing almost always reduces presence.\n\n`;
        response += `When we rush, we:\n`;
        response += `- Miss things\n`;
        response += `- Make more mistakes\n`;
        response += `- Don't enjoy the journey\n`;
        response += `- Arrive frazzled\n\n`;
        response += `**An experiment:**\n`;
        response += `For the next 5 minutes, do everything at 75% speed.\n`;
        response += `Walk slower. Talk slower. Think before acting.\n`;
        response += `Notice what happens.\n\n`;
        response += `Often we discover the rushing was internal, not actually required.`;

        return response;
      },
    });
  },
};

// ============================================================================
// FLOW TOOLS
// ============================================================================

const recognizeFlowDef: ToolDefinition = {
  id: 'recognizeFlow',
  name: 'Recognize Flow',
  description: 'Notice and appreciate flow states when they occur',
  domain: 'presence',
  tags: ['presence', 'flow', 'awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recognizeFlow'),
      parameters: z.object({
        inFlowNow: z.boolean().describe('Whether they are in flow or reflecting on it'),
        activity: z.string().optional().describe('The activity involved'),
      }),
      execute: async ({ inFlowNow, activity }) => {
        getLogger().info({ agentId: ctx.agentId, inFlowNow }, 'Recognizing flow');

        let response = '';

        if (inFlowNow) {
          response = `You might be in flow right now${activity ? ` with ${activity}` : ''}.\n\n`;
          response += `Flow is precious. Don't break it by analyzing it too much.\n\n`;
          response += `Just note: this is what it feels like. Remember this feeling. Then return to it.\n\n`;
          response += `I'll be here when you come out. Go.`;
        } else {
          response = `**Understanding Flow**\n\n`;
          response += `Flow is that state where you lose yourself in an activity. Time disappears. You're fully here.\n\n`;
          response += `Signs you've been in flow:\n`;
          response += `- Time flew by\n`;
          response += `- You forgot about yourself\n`;
          response += `- Challenge matched skill\n`;
          response += `- You felt energized, not drained\n`;
          response += `- You didn't want to stop\n\n`;
          if (activity) {
            response += `${activity} put you in flow. That's valuable information about what engages you fully.\n\n`;
          }
          response += `What activities reliably bring you into flow?`;
        }

        return response;
      },
    });
  },
};

const protectPresenceDef: ToolDefinition = {
  id: 'protectPresence',
  name: 'Protect Presence',
  description: 'Identify and address what fragments attention',
  domain: 'presence',
  tags: ['presence', 'protection', 'attention'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('protectPresence'),
      parameters: z.object({
        threat: z
          .enum(['devices', 'overthinking', 'multitasking', 'worry', 'busyness', 'general'])
          .describe('What threatens presence'),
      }),
      execute: async ({ threat }) => {
        getLogger().info({ agentId: ctx.agentId, threat }, 'Protecting presence');

        const threats: Record<string, string> = {
          devices: `**Devices and Presence**\n\nOur phones are presence-destroyers. They fragment attention into a thousand pieces.\n\n**Protection strategies:**\n- Designated phone-free times\n- Remove notifications\n- Put it in another room\n- Ask: "Am I reaching for this intentionally or automatically?"\n\nPresence requires boundaries with technology.`,
          overthinking: `**Overthinking and Presence**\n\nThe mind loves to spin. Analyzing, replaying, projecting. Meanwhile, life is happening unnoticed.\n\n**Coming back:**\n- Notice when you're thinking ABOUT life instead of living it\n- Use the body as an anchor (feet on floor, breath)\n- Ask: "What's actually happening right now?"\n\nThinking has its place. It shouldn't take all the space.`,
          multitasking: `**Multitasking is a Myth**\n\nWe don't actually multitask - we rapid-switch. And we lose something each time.\n\n**Single-tasking practice:**\n- One thing at a time\n- Close other tabs (literal and mental)\n- Let the other things wait\n- Be fully where you are\n\nFull attention on one thing beats partial attention on many.`,
          worry: `**Worry Steals Presence**\n\nWorry pulls us into futures that haven't happened. Meanwhile, now goes unattended.\n\n**Reclaiming now:**\n- Worry is not preparation\n- If you can act, act. If you can't, let go.\n- Set a "worry time" if needed - contain it\n- Ask: "What can I actually do right now?"\n\nThe present is the only place where life actually happens.`,
          busyness: `**Busyness vs. Presence**\n\nBusy isn't the same as important. Productive isn't the same as present.\n\n**Slowing down:**\n- Not all that's urgent matters\n- Presence actually improves effectiveness\n- Build in transitions between activities\n- Ask: "Am I busy or am I present?"\n\nYou can be effective without being frantic.`,
          general: `**Protecting Your Presence**\n\nPresence is a precious resource. Many things compete for it:\n- Technology\n- Worry about future\n- Regret about past\n- Multitasking\n- Chronic busyness\n\nWhat specifically is fragmenting your attention right now?`,
        };

        return threats[threat];
      },
    });
  },
};

// ============================================================================
// NATURE & MOVEMENT PRESENCE
// ============================================================================

const walkingMeditationDef: ToolDefinition = {
  id: 'walkingMeditation',
  name: 'Walking Meditation',
  description: 'Guide a walking meditation practice',
  domain: 'presence',
  tags: ['presence', 'walking', 'meditation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('walkingMeditation'),
      parameters: z.object({
        setting: z.enum(['indoors', 'outdoors', 'anywhere']).describe('Where they will walk'),
        duration: z.enum(['brief', 'moderate', 'extended']).optional().describe('How long'),
      }),
      execute: async ({ setting, duration = 'brief' }) => {
        getLogger().info({ agentId: ctx.agentId, setting, duration }, 'Walking meditation');

        let response = `**Walking Meditation**\n\n`;
        response += `Walking can be as profound as sitting meditation - and sometimes more accessible.\n\n`;

        response += `**The practice:**\n\n`;
        response += `1. **Begin standing still.** Feel your feet on the ground. Feel gravity holding you.\n\n`;
        response += `2. **Walk slowly.** Much slower than normal. No destination.\n\n`;
        response += `3. **Feel each part of each step:**\n`;
        response += `   - Lifting the foot\n`;
        response += `   - Moving it forward\n`;
        response += `   - Placing it down (heel, ball, toes)\n`;
        response += `   - Shifting weight\n\n`;
        response += `4. **When the mind wanders** (it will), gently return to the sensation of walking.\n\n`;

        if (setting === 'outdoors') {
          response += `**Outdoors bonus:** Notice what you see, hear, smell. Let nature be part of your meditation.\n\n`;
        }

        response += `**The insight:** We walk every day but rarely *experience* walking. This practice reveals the extraordinary in the ordinary.\n\n`;
        response += `Even 5 minutes of mindful walking can shift your entire state.`;

        return response;
      },
    });
  },
};

const mindfulEatingDef: ToolDefinition = {
  id: 'mindfulEating',
  name: 'Mindful Eating',
  description: 'Guide present-moment awareness while eating',
  domain: 'presence',
  tags: ['presence', 'eating', 'mindfulness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('mindfulEating'),
      parameters: z.object({
        food: z.string().optional().describe('What they are eating'),
        mode: z.enum(['full-practice', 'quick-reset', 'ongoing']).describe('Type of practice'),
      }),
      execute: async ({ food, mode }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Mindful eating');

        let response = '';

        if (mode === 'full-practice') {
          response = `**Mindful Eating Practice**${food ? ` with ${food}` : ''}\n\n`;
          response += `We eat multiple times daily but rarely actually taste our food.\n\n`;
          response += `**The practice:**\n\n`;
          response += `1. **Before eating:** Pause. Look at your food. Notice colors, shapes, textures.\n\n`;
          response += `2. **Gratitude moment:** Consider everything that brought this food to you - sun, rain, farmers, transport, preparation.\n\n`;
          response += `3. **First bite:** Put a small amount in your mouth. Don't chew yet. Notice the texture, temperature, initial taste.\n\n`;
          response += `4. **Chew slowly:** Really taste. Notice how flavors change. Notice when the urge to swallow arises.\n\n`;
          response += `5. **Between bites:** Put down your utensil. Take a breath. Notice how your body feels.\n\n`;
          response += `Even doing this for the first few bites transforms the experience.`;
        } else if (mode === 'quick-reset') {
          response = `**Quick Mindful Eating Reset**\n\n`;
          response += `You don't need a whole ritual. Just:\n\n`;
          response += `• Take one conscious breath before eating\n`;
          response += `• Actually taste the first bite\n`;
          response += `• Put your fork down between bites occasionally\n`;
          response += `• Check in: Am I still hungry? Do I still taste this?\n\n`;
          response += `Small moments of presence add up.`;
        } else {
          response = `**Ongoing Mindful Eating**\n\n`;
          response += `Making all eating more mindful:\n\n`;
          response += `• No screens while eating (sometimes)\n`;
          response += `• Sit down to eat, even snacks\n`;
          response += `• Notice when you're eating for hunger vs. emotion\n`;
          response += `• Stop before you're stuffed - check in with fullness\n`;
          response += `• Appreciate your food - someone grew it, prepared it\n\n`;
          response += `What would help you eat more mindfully?`;
        }

        return response;
      },
    });
  },
};

const naturePrescriptionDef: ToolDefinition = {
  id: 'naturePrescription',
  name: 'Nature Prescription',
  description: 'Use nature for presence and wellbeing',
  domain: 'presence',
  tags: ['presence', 'nature', 'wellbeing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('naturePrescription'),
      parameters: z.object({
        access: z
          .enum(['full-nature', 'park', 'yard', 'window', 'none'])
          .describe('Nature access level'),
        need: z
          .enum(['grounding', 'calm', 'perspective', 'energy', 'general'])
          .describe('What they need'),
      }),
      execute: async ({ access, need }) => {
        getLogger().info({ agentId: ctx.agentId, access, need }, 'Nature prescription');

        let response = `**Nature for ${need}**\n\n`;
        response += `Research shows even brief nature exposure reduces stress, improves mood, and enhances presence.\n\n`;

        const prescriptions: Record<string, Record<string, string>> = {
          'full-nature': {
            grounding: `Stand barefoot on earth if possible. Let your bare feet feel the ground. Notice the temperature, the texture. You're connected to the planet.\n\nFind a tree and place your hand on it. Feel the bark. This tree has been breathing while you've been worrying.`,
            calm: `Find a spot to sit. Close your eyes and just listen - birds, wind, water, insects. Let the sounds wash over you without naming them.\n\nNature doesn't rush. It doesn't scroll. It just is. Be like nature for a few minutes.`,
            perspective: `Look up at the sky. Look at the oldest tree you can find. This world existed before your problems and will exist after.\n\nYour concerns are real AND you are a small part of something vast and ancient.`,
            energy: `Move through nature. Walk, hike, run if you can. Let your body experience being an animal in the world.\n\nNotice how your body wants to move when it's not in boxes and chairs.`,
            general: `Immerse yourself. Use all senses. What do you see, hear, smell, feel? Let nature fill your attention.\n\nThis is what your nervous system evolved for. It knows what to do here.`,
          },
          park: {
            grounding: `Find grass and stand or sit on it. Feel the earth beneath you. Watch the ground-level world for a moment - ants, grass blades, tiny flowers.`,
            calm: `Find a bench. Sit. Watch. Don't check your phone. Just observe the park happening around you - people, animals, trees, clouds.`,
            perspective: `Look at the biggest tree in the park. How many seasons has it seen? How many people have sat beneath it?`,
            energy: `Walk the perimeter. Notice what's blooming, what's green, what's changing. Move your body through the space.`,
            general: `Even a small green space is medicine. Spend 20 minutes here and notice how you feel compared to when you arrived.`,
          },
          yard: {
            grounding: `Go outside, even briefly. Feel the air on your skin. Notice the temperature. Stand still and just be outside.`,
            calm: `Sit outside if you can. Close your eyes and listen to whatever sounds are there - birds, wind, distant traffic.`,
            perspective: `Look at the sky. Watch clouds move. Notice that there's a whole world happening above your usual eye level.`,
            energy: `Do something physical outside - garden, clean up, stretch. Let your body be outdoors and moving.`,
            general: `Your yard is nature. Pay attention to what's growing, what creatures visit, what the weather is doing. Engage with it.`,
          },
          window: {
            grounding: `Look out the window. Find something natural - a tree, the sky, birds. Focus on it for a full minute.`,
            calm: `Watch weather happening. Rain, clouds moving, light changing. Nature is always doing something if you look.`,
            perspective: `Notice how the world outside doesn't care about your to-do list. It just continues. There's freedom in that.`,
            energy: `Open the window if you can. Let fresh air in. Even the air from outside is different from indoor air.`,
            general: `A window is a portal to the natural world. Use it. Look through it consciously instead of past it.`,
          },
          none: {
            grounding: `Plants count. Touch a houseplant's leaves. Notice texture. This is a living thing sharing your space.`,
            calm: `Listen for any natural sounds - birds outside, rain on the roof. They're there if you listen for them.`,
            perspective: `Close your eyes and imagine your favorite natural place. Your brain responds similarly to imagined nature.`,
            energy: `Plan a nature visit. Even anticipating time in nature has benefits. What natural place could you get to soon?`,
            general: `Nature is everywhere if you look - the sky, weather, houseplants, even the materials things are made from. Seek it out.`,
          },
        };

        response += prescriptions[access][need];
        response += `\n\n**The prescription:** 20 minutes in nature, or looking at nature, reduces cortisol measurably.\n\nHow could you get more nature today?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION (Consolidated: 12 → 5 essential tools)
// ============================================================================

const presenceTools: ToolDefinition[] = [
  // Grounding - combines ground, exercise, return
  groundingExerciseDef,
  // Awareness - combines notice, breathe, savor, slow
  noticeThisMomentDef,
  breatheWithMeDef,
  // Flow & Protection - combines recognize, protect
  protectPresenceDef,
  // Nature & Embodiment - combines walking, eating, nature
  naturePrescriptionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'presence',
  presenceTools
);

export default getToolDefinitions;
