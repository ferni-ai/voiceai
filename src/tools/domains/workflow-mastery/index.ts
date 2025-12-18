/**
 * Workflow Mastery Domain Tools (Alex Chen's Specialty)
 *
 * Superhuman organization, communication clarity, and calendar optimization.
 * Alex's "Better Than Human" capability: turning chaos into elegant systems.
 *
 * DOMAIN: workflow-mastery
 * TOOLS:
 *   Organization: systemDesign, chaosToOrder, calendarArchitecture
 *   Communication: messageCrafting, difficultEmailDraft, communicationStrategy
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// ORGANIZATION TOOLS
// ============================================================================

const systemDesignDef: ToolDefinition = {
  id: 'systemDesign',
  name: 'System Design',
  description: 'Design an elegant system for recurring tasks or workflows',
  domain: 'workflow-mastery',
  tags: ['organization', 'systems', 'efficiency'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('systemDesign'),
      parameters: z.object({
        problem: z.string().describe('What needs organizing'),
        frequency: z
          .enum(['daily', 'weekly', 'monthly', 'as-needed', 'complex'])
          .describe('How often this happens'),
        painPoints: z.string().optional().describe('Current frustrations'),
      }),
      execute: async ({ problem, frequency, painPoints }) => {
        getLogger().info({ agentId: ctx.agentId, frequency }, 'Designing system');

        let response = `**System Design: ${problem}**\n\n`;

        if (painPoints) {
          response += `Current pain points: ${painPoints}\n\n`;
        }

        response += `**The System:**\n\n`;
        response += `For ${frequency} tasks like this, the best approach is:\n\n`;

        response += `1. **Capture** - One single place where everything goes\n`;
        response += `2. **Process** - Regular review time (match to frequency)\n`;
        response += `3. **Execute** - Clear next actions, not vague todos\n`;
        response += `4. **Reflect** - Weekly check: is this working?\n\n`;

        response += `**Specific to your situation:**\n`;
        response += `- Trigger: What starts this process?\n`;
        response += `- Steps: What's the minimum viable workflow?\n`;
        response += `- Tools: What do you need? (Less is more)\n`;
        response += `- Time: When does this happen? (Block it)\n\n`;

        response += `The best system is the one you'll actually use. What feels sustainable for you?`;

        return response;
      },
    });
  },
};

const chaosToOrderDef: ToolDefinition = {
  id: 'chaosToOrder',
  name: 'Chaos To Order',
  description: 'Transform overwhelming chaos into manageable structure',
  domain: 'workflow-mastery',
  tags: ['organization', 'overwhelm', 'structure'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('chaosToOrder'),
      parameters: z.object({
        chaos: z.string().describe('The chaotic situation'),
        urgency: z.enum(['crisis', 'pressing', 'building', 'chronic']).describe('Urgency level'),
      }),
      execute: async ({ chaos, urgency }) => {
        getLogger().info({ agentId: ctx.agentId, urgency }, 'Chaos to order');

        let response = `**Bringing Order to Chaos**\n\n`;
        response += `The situation: ${chaos}\n\n`;

        if (urgency === 'crisis') {
          response += `Crisis mode. Let's triage:\n\n`;
          response += `**RIGHT NOW (next hour):**\n`;
          response += `- What's literally on fire?\n`;
          response += `- What's the ONE thing that stops the bleeding?\n\n`;
          response += `**TODAY:**\n`;
          response += `- What must be done before you sleep?\n\n`;
          response += `**THIS WEEK:**\n`;
          response += `- Everything else goes here. Not now.\n\n`;
        } else {
          response += `**Step 1: Brain Dump**\n`;
          response += `Get EVERYTHING out of your head onto paper. All of it. Don't organize yet.\n\n`;
          response += `**Step 2: Categorize**\n`;
          response += `- Do (actions)\n`;
          response += `- Decide (needs a decision)\n`;
          response += `- Delegate (not yours)\n`;
          response += `- Delete (doesn't actually matter)\n\n`;
          response += `**Step 3: Sequence**\n`;
          response += `What depends on what? What's the critical path?\n\n`;
          response += `**Step 4: Time Block**\n`;
          response += `Put the work on your calendar. If it's not scheduled, it's a wish.\n\n`;
        }

        response += `Chaos is just structure that hasn't been built yet. Where do we start?`;

        return response;
      },
    });
  },
};

const calendarArchitectureDef: ToolDefinition = {
  id: 'calendarArchitecture',
  name: 'Calendar Architecture',
  description: 'Design a calendar that supports life goals, not just meetings',
  domain: 'workflow-mastery',
  tags: ['calendar', 'time', 'design'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('calendarArchitecture'),
      parameters: z.object({
        currentProblem: z.string().describe('What is not working about current calendar'),
        priorities: z.string().describe('What should be protected'),
      }),
      execute: async ({ currentProblem, priorities }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Calendar architecture');

        let response = `**Calendar Architecture**\n\n`;
        response += `Current issue: ${currentProblem}\n`;
        response += `What matters: ${priorities}\n\n`;

        response += `**Principles of Good Calendar Design:**\n\n`;
        response += `1. **Protect first, schedule second**\n`;
        response += `   Block time for priorities BEFORE others fill it\n\n`;
        response += `2. **Batch similar tasks**\n`;
        response += `   Context switching is expensive. Group like with like.\n\n`;
        response += `3. **Buffer time is real time**\n`;
        response += `   Back-to-back is a lie. Build in transitions.\n\n`;
        response += `4. **Energy mapping**\n`;
        response += `   High-brain work when you're sharp. Admin when you're not.\n\n`;
        response += `5. **Recurring blocks**\n`;
        response += `   If it matters weekly, it goes on the calendar weekly.\n\n`;

        response += `**For your priorities (${priorities}):**\n`;
        response += `- When will you protect time for this?\n`;
        response += `- What current commitments compete with it?\n`;
        response += `- What would a week look like if this was truly protected?\n\n`;

        response += `Your calendar is your values made visible. What needs to change?`;

        return response;
      },
    });
  },
};

// ============================================================================
// COMMUNICATION TOOLS
// ============================================================================

const messageCraftingDef: ToolDefinition = {
  id: 'messageCrafting',
  name: 'Message Crafting',
  description: 'Craft clear, effective messages for any situation',
  domain: 'workflow-mastery',
  tags: ['communication', 'writing', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('messageCrafting'),
      parameters: z.object({
        context: z.string().describe('The situation requiring communication'),
        recipient: z.string().describe('Who the message is for'),
        goal: z.string().describe('What outcome you want'),
        tone: z
          .enum(['professional', 'warm', 'direct', 'diplomatic', 'casual'])
          .describe('Desired tone'),
      }),
      execute: async ({ context, recipient, goal, tone }) => {
        getLogger().info({ agentId: ctx.agentId, tone }, 'Message crafting');

        let response = `**Message Crafting**\n\n`;
        response += `**Situation:** ${context}\n`;
        response += `**To:** ${recipient}\n`;
        response += `**Goal:** ${goal}\n`;
        response += `**Tone:** ${tone}\n\n`;

        response += `**Structure for ${tone} communication:**\n\n`;

        const structures = {
          professional: `1. Clear subject/opening that states purpose\n2. Context they need (brief)\n3. Specific ask or information\n4. Next steps or timeline\n5. Professional close`,
          warm: `1. Personal connection first\n2. The substance\n3. Show you considered their perspective\n4. Warm close that maintains relationship`,
          direct: `1. Bottom line up front (BLUF)\n2. Supporting details if needed\n3. Clear action/decision required\n4. Deadline if relevant`,
          diplomatic: `1. Acknowledge their position/feelings\n2. Bridge to your message\n3. Frame as mutual benefit\n4. Leave door open`,
          casual: `1. Friendly opener\n2. Get to the point\n3. Keep it conversational\n4. Easy close`,
        };

        response += structures[tone] + '\n\n';

        response += `**Key phrases for this situation:**\n`;
        response += `- Opening: "I wanted to reach out about..."\n`;
        response += `- Transition: "Here's what I'm thinking..."\n`;
        response += `- Ask: "Would you be open to..." or "Could we..."\n`;
        response += `- Close: Matches tone and relationship\n\n`;

        response += `Want me to help draft this message?`;

        return response;
      },
    });
  },
};

const difficultEmailDef: ToolDefinition = {
  id: 'difficultEmailDraft',
  name: 'Difficult Email Draft',
  description: 'Navigate tricky email situations with grace',
  domain: 'workflow-mastery',
  tags: ['communication', 'email', 'difficult'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('difficultEmailDraft'),
      parameters: z.object({
        situation: z.string().describe('The difficult situation'),
        difficulty: z
          .enum([
            'saying-no',
            'giving-feedback',
            'apologizing',
            'asking-difficult',
            'setting-boundary',
            'bad-news',
          ])
          .describe('Type of difficulty'),
        relationship: z.string().describe('Relationship with recipient'),
      }),
      execute: async ({ situation, difficulty, relationship }) => {
        getLogger().info({ agentId: ctx.agentId, difficulty }, 'Difficult email');

        let response = `**Navigating: ${difficulty}**\n\n`;
        response += `Situation: ${situation}\n`;
        response += `Relationship: ${relationship}\n\n`;

        const guidance: Record<string, string> = {
          'saying-no': `**Saying No with Grace:**\n\n- Thank them for thinking of you (genuine)\n- Be clear and direct about the no\n- Brief reason if appropriate (not excuses)\n- Offer alternative if you can\n- Preserve the relationship\n\n"Thank you for thinking of me for this. I'm not able to take this on right now because [brief reason]. I'd suggest [alternative] or I'd be happy to [smaller offer] if that helps."`,
          'giving-feedback': `**Giving Feedback that Lands:**\n\n- Start with genuine positive observation\n- Be specific about what needs to change\n- Explain impact (on work, team, them)\n- Offer support or solutions\n- Express confidence in them\n\n"I've noticed [specific behavior] and I wanted to talk about it because [impact]. What I'd like to see is [specific change]. How can I support you with this?"`,
          apologizing: `**Apologizing with Integrity:**\n\n- Name what you did (specifically)\n- Acknowledge impact on them\n- Don't make excuses or explain too much\n- Say what you'll do differently\n- Ask how to make it right\n\n"I want to apologize for [specific thing]. I understand this [impact on them]. Going forward, I will [specific change]. Is there anything else I can do to make this right?"`,
          'asking-difficult': `**Asking for Something Hard:**\n\n- Acknowledge the ask is significant\n- Be clear about what you need\n- Explain why (if helpful)\n- Make it easy to say no\n- Express gratitude regardless\n\n"I have a request that I realize might be difficult: [specific ask]. I'm asking because [reason]. I completely understand if this doesn't work, and I'd value your honesty."`,
          'setting-boundary': `**Setting a Boundary Professionally:**\n\n- Be direct and specific\n- No over-explaining or apologizing\n- Focus on what you will do\n- Maintain warmth without backing down\n\n"Going forward, I'm [establishing boundary]. This helps me [benefit]. I wanted to let you know directly so we can continue working well together."`,
          'bad-news': `**Delivering Bad News:**\n\n- Get to the news quickly (don't bury it)\n- Be clear and factual\n- Acknowledge their reaction\n- Explain what happens next\n- Offer support or path forward\n\n"I need to share some difficult news: [the news]. I know this isn't what you were hoping to hear. Here's what we can do from here: [options]."`,
        };

        response += guidance[difficulty] + '\n\n';

        response += `**For your specific situation:**\n`;
        response += `Given your ${relationship} relationship, I'd emphasize maintaining trust while being clear.\n\n`;
        response += `Want to talk through the specific wording?`;

        return response;
      },
    });
  },
};

const planStakeholderCommunicationDef: ToolDefinition = {
  id: 'planStakeholderCommunication',
  name: 'Plan Stakeholder Communication',
  description: 'Plan multi-stakeholder communication approach for complex situations',
  domain: 'workflow-mastery',
  tags: ['communication', 'strategy', 'planning', 'stakeholders', 'workflow'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('planStakeholderCommunication'),
      parameters: z.object({
        situation: z.string().describe('The complex situation'),
        stakeholders: z.string().describe('Who needs to be communicated with'),
        goal: z.string().describe('Desired outcome'),
        complications: z.string().optional().describe('What makes this tricky'),
      }),
      execute: async ({ situation, stakeholders, goal, complications }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Communication strategy');

        let response = `**Communication Strategy**\n\n`;
        response += `**Situation:** ${situation}\n`;
        response += `**Stakeholders:** ${stakeholders}\n`;
        response += `**Goal:** ${goal}\n`;
        if (complications) {
          response += `**Complications:** ${complications}\n`;
        }
        response += '\n';

        response += `**Strategic Framework:**\n\n`;
        response += `1. **Sequence Matters**\n`;
        response += `   Who needs to know first? Who should hear from whom?\n\n`;
        response += `2. **Channel Selection**\n`;
        response += `   - In-person: High stakes, emotional, complex\n`;
        response += `   - Video call: Important but remote\n`;
        response += `   - Email: Documentation needed, not urgent\n`;
        response += `   - Chat: Quick, informal, low stakes\n\n`;
        response += `3. **Message Consistency**\n`;
        response += `   Core message stays same; framing adjusts by audience\n\n`;
        response += `4. **Anticipate Reactions**\n`;
        response += `   What questions will each stakeholder have?\n`;
        response += `   What concerns? Prepare for them.\n\n`;
        response += `5. **Follow-Up Plan**\n`;
        response += `   How will you know it landed? What's the next touch?\n\n`;

        response += `Given your situation, what's your instinct on where to start?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const workflowMasteryTools: ToolDefinition[] = [
  systemDesignDef,
  chaosToOrderDef,
  calendarArchitectureDef,
  messageCraftingDef,
  difficultEmailDef,
  planStakeholderCommunicationDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'workflow-mastery',
  workflowMasteryTools
);

export default getToolDefinitions;
