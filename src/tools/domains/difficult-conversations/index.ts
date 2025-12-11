/**
 * Difficult Conversations Domain Tools
 *
 * Tools for preparing for, having, and recovering from hard conversations.
 * This domain leverages Ferni's zero-judgment presence to help users
 * practice conversations that feel scary or overwhelming.
 *
 * PHILOSOPHY:
 *   The conversations we avoid are often the ones that matter most.
 *   Avoidance doesn't make hard things go away - it makes them grow.
 *   With practice and presence, hard conversations become possible.
 *
 * DOMAIN: difficult-conversations
 * SUB-DOMAINS:
 *   Preparation - Planning what to say, anticipating responses
 *   Practice - Role-playing conversations in a safe space
 *   Boundaries - Having conversations about limits and needs
 *   Repair - Addressing ruptures and making amends
 *   Life Conversations - End-of-life, coming out, major announcements
 *
 * TOOLS:
 *   Prep: prepareHardConversation, anticipateResponses, clarifyIntention
 *   Practice: practiceConversation, rolePlayResponse, buildScript
 *   Boundaries: setBoundaryConversation, sayNoWithGrace, assertNeeds
 *   Repair: repairRelationshipRupture, makeAmends, addressBetrayal
 *   Life: endOfLifeConversation, comingOutConversation, majorAnnouncement
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistTrackedItem,
  persistKeyMoment,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { z } from 'zod';

// ============================================================================
// DIFFICULT CONVERSATIONS WISDOM DATABASE
// ============================================================================

/**
 * Types of difficult conversations
 */
const CONVERSATION_TYPES = {
  boundary: {
    name: 'Setting a Boundary',
    description: 'Communicating limits, saying no, protecting your needs',
    common_fears: ['Being seen as selfish', 'Damaging the relationship', 'The other person\'s reaction'],
    key_principles: [
      'Boundaries are about YOUR behavior, not controlling others',
      '"No" is a complete sentence, but explanation can help',
      'You can be kind AND firm',
      'Their reaction is not your responsibility',
    ],
  },
  repair: {
    name: 'Repairing a Rupture',
    description: 'Addressing conflict, hurt, or distance in a relationship',
    common_fears: ['Making it worse', 'Being rejected', 'Having to be vulnerable'],
    key_principles: [
      'Repair attempts matter more than perfect words',
      'Lead with your intention, not your grievance',
      'Listen to understand, not to respond',
      'Repair is a process, not a single conversation',
    ],
  },
  needs: {
    name: 'Asserting Needs',
    description: 'Asking for what you need in a relationship',
    common_fears: ['Being too needy', 'Being rejected', 'Seeming weak'],
    key_principles: [
      'Having needs is human, not weakness',
      'People can\'t meet needs they don\'t know about',
      'Ask, don\'t hint or expect mind-reading',
      'How you ask matters as much as what you ask',
    ],
  },
  truth: {
    name: 'Sharing a Difficult Truth',
    description: 'Revealing something that might change how someone sees you or the situation',
    common_fears: ['Judgment', 'Rejection', 'Changing the relationship'],
    key_principles: [
      'Honesty is a gift, even when it\'s hard',
      'The anticipation is usually worse than the reality',
      'You can\'t control their response, only your honesty',
      'Secrets often hurt more than truth',
    ],
  },
  ending: {
    name: 'Ending Something',
    description: 'Breaking up, quitting, ending a friendship, resigning',
    common_fears: ['Hurting them', 'Being the bad guy', 'Regret'],
    key_principles: [
      'Clarity is kindness - even when the message is hard',
      'You don\'t need their permission to leave',
      'A clean ending is better than a slow fade',
      'Both people deserve to move on',
    ],
  },
  life_change: {
    name: 'Announcing a Life Change',
    description: 'Coming out, changing careers, getting divorced, major decisions',
    common_fears: ['Disappointment', 'Losing the relationship', 'Being misunderstood'],
    key_principles: [
      'You don\'t need permission to live your truth',
      'Their adjustment is their work to do',
      'Give them time to catch up to your reality',
      'Some relationships won\'t survive - and that\'s information',
    ],
  },
  end_of_life: {
    name: 'End-of-Life Conversations',
    description: 'Talking about death, wishes, legacy with aging parents or loved ones',
    common_fears: ['Making it real', 'Upsetting them', 'Not knowing what to say'],
    key_principles: [
      'Avoiding the topic doesn\'t avoid death',
      'These conversations are acts of love',
      'Start with questions, not statements',
      'It\'s okay to have multiple conversations',
    ],
  },
};

/**
 * Conversation frameworks
 */
const CONVERSATION_FRAMEWORKS = {
  nonviolent_communication: {
    name: 'Nonviolent Communication (NVC)',
    steps: [
      { step: 'Observation', description: 'State facts without judgment', example: '"When I see the dishes in the sink..."' },
      { step: 'Feeling', description: 'Share how you feel', example: '"...I feel frustrated..."' },
      { step: 'Need', description: 'Express the underlying need', example: '"...because I need order to feel calm..."' },
      { step: 'Request', description: 'Make a specific request', example: '"Would you be willing to do them before bed?"' },
    ],
    when_to_use: 'Asserting needs, giving feedback, addressing hurt',
  },
  dear_man: {
    name: 'DEAR MAN (DBT)',
    steps: [
      { step: 'Describe', description: 'Describe the situation factually', example: '"We agreed to meet at 7..."' },
      { step: 'Express', description: 'Express your feelings', example: '"I felt worried when you were late..."' },
      { step: 'Assert', description: 'Assert what you want', example: '"I\'d like you to text if you\'re running late..."' },
      { step: 'Reinforce', description: 'Reinforce benefits', example: '"It would help me not worry..."' },
      { step: 'Mindful', description: 'Stay focused on the goal', example: 'Don\'t get derailed' },
      { step: 'Appear confident', description: 'Use confident body language', example: 'Eye contact, calm voice' },
      { step: 'Negotiate', description: 'Be willing to give and take', example: 'Find middle ground' },
    ],
    when_to_use: 'Assertive communication, asking for what you want',
  },
  softened_startup: {
    name: 'Softened Startup (Gottman)',
    steps: [
      { step: 'Start with "I"', description: 'Use "I" statements, not "You"', example: '"I feel..." not "You always..."' },
      { step: 'Describe without blame', description: 'State what happened neutrally', example: 'Facts, not interpretation' },
      { step: 'Be polite', description: 'Add appreciation or softening', example: '"I know you\'re busy, AND..."' },
      { step: 'Be clear', description: 'State what you need positively', example: 'What you want, not what you don\'t want' },
    ],
    when_to_use: 'Starting difficult conversations in relationships',
  },
};

/**
 * Wisdom about difficult conversations
 */
const CONVERSATION_WISDOM = [
  {
    quote: 'The conversation you\'re avoiding is the one you most need to have.',
    attribution: 'Unknown',
    context: 'avoidance',
  },
  {
    quote: 'Clear is kind. Unclear is unkind.',
    attribution: 'Brené Brown',
    context: 'clarity',
  },
  {
    quote: 'Between stimulus and response there is a space. In that space is our power to choose our response.',
    attribution: 'Viktor Frankl',
    context: 'response',
  },
  {
    quote: 'The quality of your life is the quality of your communication.',
    attribution: 'Tony Robbins',
    context: 'importance',
  },
  {
    quote: 'Speak when you are angry and you will make the best speech you will ever regret.',
    attribution: 'Ambrose Bierce',
    context: 'timing',
  },
  {
    quote: 'Courage is what it takes to stand up and speak. Courage is also what it takes to sit down and listen.',
    attribution: 'Winston Churchill',
    context: 'listening',
  },
];

/**
 * Common conversation mistakes
 */
const CONVERSATION_MISTAKES = [
  { mistake: 'Starting with blame', better: 'Start with your experience ("I feel..." not "You always...")' },
  { mistake: 'Kitchen-sinking', better: 'Focus on ONE issue, not every grievance' },
  { mistake: 'Mind-reading', better: 'Ask about their experience instead of assuming' },
  { mistake: 'Defending before understanding', better: 'Listen fully before responding' },
  { mistake: 'Using "always" and "never"', better: 'Be specific about this instance' },
  { mistake: 'Having it when angry', better: 'Wait until you can think clearly' },
  { mistake: 'Expecting resolution in one talk', better: 'See it as the start of a process' },
];

// ============================================================================
// PREPARATION TOOLS
// ============================================================================

const prepareHardConversationDef: ToolDefinition = {
  id: 'prepareHardConversation',
  name: 'Prepare Hard Conversation',
  description: 'Plan and prepare for a difficult conversation',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'preparation', 'planning', 'communication'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare for a difficult conversation by clarifying their intention, planning what to say, and anticipating challenges.',
      parameters: z.object({
        conversationType: z.enum(['boundary', 'repair', 'needs', 'truth', 'ending', 'life_change', 'end_of_life', 'other'])
          .describe('Type of difficult conversation'),
        withWhom: z.string().describe('Who they need to talk to'),
        whatAbout: z.string().describe('What the conversation is about'),
        whatTheyFear: z.string().optional().describe('What they\'re afraid might happen'),
        whatTheyHope: z.string().optional().describe('What outcome they hope for'),
      }),
      execute: async ({ conversationType, withWhom, whatAbout, whatTheyFear, whatTheyHope }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, conversationType },
          'Preparing hard conversation'
        );

        // Persist as a tracked item
        persistTrackedItem(toolCtx as ToolCtxWithUserData, {
          domain: 'difficult-conversations',
          itemType: 'conversation_prep',
          item: { conversationType, withWhom, whatAbout: whatAbout.substring(0, 100) },
          importance: 'medium',
        });

        const typeInfo = CONVERSATION_TYPES[conversationType as keyof typeof CONVERSATION_TYPES]
          || CONVERSATION_TYPES.boundary;

        let response = `**Preparing for a Difficult Conversation**\n\n`;

        response += `**Type:** ${typeInfo.name}\n`;
        response += `**With:** ${withWhom}\n`;
        response += `**About:** ${whatAbout}\n\n`;

        if (whatTheyFear) {
          response += `**You're afraid of:** ${whatTheyFear}\n`;
        }
        if (whatTheyHope) {
          response += `**You hope for:** ${whatTheyHope}\n`;
        }
        response += `\n---\n\n`;

        // Validate the conversation
        response += `**First, let's acknowledge:**\n\n`;
        response += `This conversation matters to you, or you wouldn't be preparing for it. `;
        response += `The fact that it's hard doesn't mean you should avoid it - `;
        response += `often the hardest conversations are the most important.\n\n`;

        // Show common fears for this type
        response += `**Common fears with ${typeInfo.name.toLowerCase()}:**\n`;
        typeInfo.common_fears.forEach(fear => {
          response += `- ${fear}\n`;
        });
        response += `\nThese fears are normal. Let's work with them, not against them.\n\n`;

        response += `---\n\n`;

        // Key principles
        response += `**Key principles:**\n`;
        typeInfo.key_principles.forEach(principle => {
          response += `- ${principle}\n`;
        });

        response += `\n---\n\n`;

        // Preparation questions
        response += `**Preparation questions:**\n\n`;
        response += `1. **What's your intention?** (Not what you want to SAY, but what outcome you want)\n`;
        response += `2. **What's the core message?** (If they only hear one thing, what should it be?)\n`;
        response += `3. **What do you want them to understand?** (About your experience, not their behavior)\n`;
        response += `4. **What's the best time/place?** (Private, when neither of you is stressed)\n`;
        response += `5. **How might they respond?** (Best case, worst case, likely case)\n\n`;

        response += `Would you like to work through a framework for this conversation, or practice what you might say?`;

        return response;
      },
    });
  },
};

const clarifyIntentionDef: ToolDefinition = {
  id: 'clarifyIntention',
  name: 'Clarify Intention',
  description: 'Get clear on the real purpose of the conversation',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'intention', 'clarity', 'purpose'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user clarify what they really want from a difficult conversation - often different from what they think they want.',
      parameters: z.object({
        whatTheyWantToSay: z.string().describe('What they want to say'),
        whyItMatters: z.string().optional().describe('Why this conversation matters'),
      }),
      execute: async ({ whatTheyWantToSay, whyItMatters }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Clarifying intention'
        );

        let response = `**Clarifying Your Intention**\n\n`;

        response += `You want to say: "${whatTheyWantToSay}"\n`;
        if (whyItMatters) {
          response += `Why it matters: ${whyItMatters}\n`;
        }
        response += `\n---\n\n`;

        response += `**The Intention Check**\n\n`;
        response += `Before any hard conversation, get clear on what you actually want.\n\n`;

        response += `**Ask yourself:**\n\n`;

        response += `**1. What's the outcome you want?**\n`;
        response += `Not what you want to say - what you want to RESULT from saying it.\n`;
        response += `- Do you want them to change behavior?\n`;
        response += `- Do you want to feel heard?\n`;
        response += `- Do you want to set a boundary?\n`;
        response += `- Do you want closure?\n`;
        response += `- Do you want them to understand something?\n\n`;

        response += `**2. Is your intention "toward" or "against"?**\n`;
        response += `- Toward: Building understanding, connection, resolution\n`;
        response += `- Against: Winning, punishing, proving a point\n`;
        response += `"Against" intentions usually backfire.\n\n`;

        response += `**3. Do you want to be right, or do you want to be effective?**\n`;
        response += `Sometimes we have to choose. Being "right" doesn't always get results.\n\n`;

        response += `**4. What's your part in this?**\n`;
        response += `Even if they're 90% "wrong," what's your 10%? Owning your part disarms defensiveness.\n\n`;

        response += `**5. What's the minimum viable outcome?**\n`;
        response += `If they can't give you everything, what's the least you need?\n\n`;

        response += `---\n\n`;

        const wisdom = CONVERSATION_WISDOM.find(w => w.context === 'clarity');
        if (wisdom) {
          response += `> "${wisdom.quote}"\n`;
          response += `> — ${wisdom.attribution}\n\n`;
        }

        response += `Based on these questions, what's your real intention?`;

        return response;
      },
    });
  },
};

const anticipateResponsesDef: ToolDefinition = {
  id: 'anticipateResponses',
  name: 'Anticipate Responses',
  description: 'Prepare for how the other person might respond',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'anticipation', 'preparation', 'responses'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user anticipate and prepare for different ways the other person might respond.',
      parameters: z.object({
        conversation: z.string().describe('What the conversation is about'),
        personDescription: z.string().optional().describe('What the person is like'),
        pastPatterns: z.string().optional().describe('How they\'ve responded in the past'),
      }),
      execute: async ({ conversation, personDescription, pastPatterns }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Anticipating responses'
        );

        let response = `**Anticipating Responses**\n\n`;

        response += `Conversation about: ${conversation}\n`;
        if (personDescription) {
          response += `This person is: ${personDescription}\n`;
        }
        if (pastPatterns) {
          response += `Past patterns: ${pastPatterns}\n`;
        }
        response += `\n---\n\n`;

        response += `**Preparing for different responses:**\n\n`;

        response += `**1. Best case response:**\n`;
        response += `They hear you, understand, and respond constructively.\n`;
        response += `_Your response:_ Appreciation, continue dialogue\n\n`;

        response += `**2. Defensive response:**\n`;
        response += `They get defensive, make excuses, turn it back on you.\n`;
        response += `_Your response:_ "I'm not trying to attack you. I want to understand each other."\n\n`;

        response += `**3. Dismissive response:**\n`;
        response += `They minimize, brush off, or refuse to engage.\n`;
        response += `_Your response:_ "This is important to me. I need us to have this conversation."\n\n`;

        response += `**4. Emotional response:**\n`;
        response += `They cry, get angry, or shut down.\n`;
        response += `_Your response:_ Pause, acknowledge feelings, offer to continue later if needed.\n\n`;

        response += `**5. Attacking response:**\n`;
        response += `They attack you, bring up past issues, escalate.\n`;
        response += `_Your response:_ "I want to hear your perspective, AND I won't continue if we're attacking each other."\n\n`;

        response += `**6. Surprising response:**\n`;
        response += `They share something you didn't know that changes things.\n`;
        response += `_Your response:_ Listen. Be willing to adjust your perspective.\n\n`;

        response += `---\n\n`;

        response += `**Key reminder:**\n`;
        response += `You can't control their response. You can only control:\n`;
        response += `- Your intention\n`;
        response += `- Your words\n`;
        response += `- Your reaction to their response\n`;
        response += `- Whether to continue or pause\n\n`;

        response += `Which response are you most worried about?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PRACTICE TOOLS
// ============================================================================

const practiceConversationDef: ToolDefinition = {
  id: 'practiceConversation',
  name: 'Practice Conversation',
  description: 'Role-play a difficult conversation in a safe space',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'practice', 'role-play', 'rehearsal'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide a safe space to practice what the user wants to say. Ferni can role-play the other person or coach the user through it.',
      parameters: z.object({
        whatToPractice: z.string().describe('What they want to practice saying'),
        mode: z.enum(['coach-me', 'role-play', 'just-listen'])
          .describe('How they want to practice'),
        context: z.string().optional().describe('Context about the situation'),
      }),
      execute: async ({ whatToPractice, mode, context }) => {
        getLogger().info(
          { agentId: ctx.agentId, mode },
          'Practicing conversation'
        );

        let response = `**Practice Space**\n\n`;

        response += `What you want to say: "${whatToPractice}"\n`;
        if (context) {
          response += `Context: ${context}\n`;
        }
        response += `Mode: ${mode}\n\n`;

        response += `---\n\n`;

        if (mode === 'just-listen') {
          response += `**I'm listening.**\n\n`;
          response += `Go ahead and say it out loud. Just speaking the words can help you find them.\n\n`;
          response += `When you're done, I can offer feedback if you want. Or we can just let it sit.\n\n`;
          response += `No judgment here. This is practice.`;

        } else if (mode === 'coach-me') {
          response += `**Let me coach you through this.**\n\n`;

          response += `First, let's check the structure:\n\n`;

          response += `**1. Opening** - How will you start?\n`;
          response += `Tip: Start with intention, not accusation.\n`;
          response += `Example: "I want to talk about something that's been on my mind..."\n\n`;

          response += `**2. Core message** - What's the ONE thing?\n`;
          response += `Tip: If you had 30 seconds, what would you say?\n\n`;

          response += `**3. Your experience** - How has this affected you?\n`;
          response += `Tip: "I feel..." not "You made me feel..."\n\n`;

          response += `**4. What you need** - What do you want to happen?\n`;
          response += `Tip: Be specific and actionable.\n\n`;

          response += `**5. Space for them** - Are you inviting dialogue?\n`;
          response += `Tip: "I want to understand your perspective too."\n\n`;

          response += `---\n\n`;
          response += `Would you like to work through each of these parts?`;

        } else {
          // role-play
          response += `**Let's role-play.**\n\n`;
          response += `I can play the other person so you can practice.\n\n`;

          response += `Before we start:\n`;
          response += `- I'll respond how they might respond (you can tell me about them)\n`;
          response += `- You can try different approaches\n`;
          response += `- We can pause and discuss anytime\n`;
          response += `- This is practice - it doesn't have to be perfect\n\n`;

          response += `When you're ready, start the conversation as if you're talking to them.\n\n`;
          response += `(You can also tell me what kind of response you want me to give - easy, difficult, realistic.)`;
        }

        return response;
      },
    });
  },
};

const buildScriptDef: ToolDefinition = {
  id: 'buildScript',
  name: 'Build Script',
  description: 'Create a framework or script for the conversation',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'script', 'framework', 'structure'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user build a framework or script for their conversation using proven communication frameworks.',
      parameters: z.object({
        situation: z.string().describe('The situation they need to address'),
        framework: z.enum(['nvc', 'dear_man', 'softened_startup', 'custom'])
          .optional()
          .describe('Communication framework to use'),
      }),
      execute: async ({ situation, framework }) => {
        getLogger().info(
          { agentId: ctx.agentId, framework },
          'Building conversation script'
        );

        let response = `**Building Your Conversation Script**\n\n`;

        response += `Situation: ${situation}\n\n`;

        response += `---\n\n`;

        if (!framework || framework === 'custom') {
          // Show all frameworks
          response += `**Communication Frameworks:**\n\n`;

          Object.values(CONVERSATION_FRAMEWORKS).forEach(fw => {
            response += `**${fw.name}**\n`;
            response += `_Best for: ${fw.when_to_use}_\n\n`;
            fw.steps.forEach((step, i) => {
              response += `${i + 1}. **${step.step}:** ${step.description}\n`;
              response += `   Example: ${step.example}\n`;
            });
            response += `\n`;
          });

          response += `Which framework resonates with your situation?`;

        } else {
          const fw = CONVERSATION_FRAMEWORKS[framework as keyof typeof CONVERSATION_FRAMEWORKS];

          response += `**Using ${fw.name}:**\n\n`;
          response += `_${fw.when_to_use}_\n\n`;

          response += `**Fill in your script:**\n\n`;

          fw.steps.forEach((step, i) => {
            response += `**${i + 1}. ${step.step}**\n`;
            response += `${step.description}\n`;
            response += `Template: ${step.example}\n`;
            response += `Your version: _[fill in]_\n\n`;
          });

          response += `---\n\n`;

          response += `**Tips for delivery:**\n`;
          response += `- Breathe before you start\n`;
          response += `- Speak slowly - slower than feels natural\n`;
          response += `- Pause after key points\n`;
          response += `- Watch for their reaction and adjust\n`;
          response += `- It's okay to pause and collect yourself\n\n`;

          response += `Would you like to practice this script?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// BOUNDARY TOOLS
// ============================================================================

const setBoundaryConversationDef: ToolDefinition = {
  id: 'setBoundaryConversation',
  name: 'Set Boundary Conversation',
  description: 'Prepare to set or enforce a boundary',
  domain: 'difficult-conversations',
  additionalDomains: ['connection', 'relationships', 'second-chances'], // Boundaries are about relationships and often accompany fresh starts
  tags: ['difficult-conversations', 'boundaries', 'limits', 'assertiveness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare to set or enforce a boundary in a relationship.',
      parameters: z.object({
        boundary: z.string().describe('The boundary they need to set'),
        withWhom: z.string().describe('Who they need to set it with'),
        whatHappensNow: z.string().optional().describe('What currently happens that crosses the boundary'),
        pastAttempts: z.string().optional().describe('Past attempts to set this boundary'),
      }),
      execute: async ({ boundary, withWhom, whatHappensNow, pastAttempts }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Preparing boundary conversation'
        );

        let response = `**Setting a Boundary**\n\n`;

        response += `Boundary: ${boundary}\n`;
        response += `With: ${withWhom}\n`;
        if (whatHappensNow) {
          response += `Current pattern: ${whatHappensNow}\n`;
        }
        if (pastAttempts) {
          response += `Past attempts: ${pastAttempts}\n`;
        }
        response += `\n---\n\n`;

        response += `**Boundary Truths:**\n\n`;
        response += `- Boundaries are about YOUR behavior, not controlling others\n`;
        response += `- "No" is a complete sentence (but explanation can help)\n`;
        response += `- You can be kind AND firm\n`;
        response += `- Their reaction is not your responsibility\n`;
        response += `- Boundaries without consequences are just requests\n\n`;

        response += `---\n\n`;

        response += `**The Boundary Formula:**\n\n`;

        response += `**1. State the boundary clearly**\n`;
        response += `"I'm not available for..." / "I won't be..." / "I need..."\n`;
        response += `_Your version:_ "I _______"\n\n`;

        response += `**2. Brief explanation (optional)**\n`;
        response += `"Because..." (Keep it short - you don't have to justify)\n`;
        response += `_Your version:_ "Because _______"\n\n`;

        response += `**3. State the consequence**\n`;
        response += `"If [boundary is crossed], I will [consequence]"\n`;
        response += `Note: The consequence is about what YOU will do, not punishing them.\n`;
        response += `_Your version:_ "If _______, I will _______"\n\n`;

        response += `**4. Express care (if true)**\n`;
        response += `"This isn't about not caring about you. It's about taking care of myself."\n\n`;

        response += `---\n\n`;

        response += `**Common pushback and responses:**\n\n`;
        response += `**"You're being selfish"**\n`;
        response += `→ "Taking care of myself isn't selfish. It's necessary."\n\n`;

        response += `**"You never had this boundary before"**\n`;
        response += `→ "I'm setting it now. People are allowed to grow."\n\n`;

        response += `**"You're overreacting"**\n`;
        response += `→ "This is what I need. I'm not asking you to understand it."\n\n`;

        response += `Would you like to practice saying this boundary out loud?`;

        return response;
      },
    });
  },
};

const sayNoWithGraceDef: ToolDefinition = {
  id: 'sayNoWithGrace',
  name: 'Say No With Grace',
  description: 'Learn to say no without guilt or excessive explanation',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'no', 'decline', 'grace'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user learn to say no kindly but firmly.',
      parameters: z.object({
        whatToDecline: z.string().describe('What they need to say no to'),
        whyItsHard: z.string().optional().describe('Why saying no feels hard'),
        relationship: z.string().optional().describe('Their relationship to the person'),
      }),
      execute: async ({ whatToDecline, whyItsHard, relationship }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Helping say no with grace'
        );

        let response = `**Saying No With Grace**\n\n`;

        response += `You need to decline: ${whatToDecline}\n`;
        if (relationship) {
          response += `Relationship: ${relationship}\n`;
        }
        if (whyItsHard) {
          response += `Why it's hard: ${whyItsHard}\n`;
        }
        response += `\n---\n\n`;

        response += `**The truth about "no":**\n\n`;
        response += `- Every "yes" to something is a "no" to something else\n`;
        response += `- Saying yes when you mean no breeds resentment\n`;
        response += `- People respect clear no's more than reluctant yes's\n`;
        response += `- You don't owe anyone an explanation\n`;
        response += `- "No" protects your yes's\n\n`;

        response += `---\n\n`;

        response += `**Ways to say no:**\n\n`;

        response += `**The Direct No:**\n`;
        response += `"No, I can't do that." / "That doesn't work for me."\n\n`;

        response += `**The Gracious No:**\n`;
        response += `"Thank you for thinking of me. I'm not able to."\n\n`;

        response += `**The Raincheck No:**\n`;
        response += `"I can't right now. Let's revisit another time."\n\n`;

        response += `**The Partial No:**\n`;
        response += `"I can't do X, but I could do Y."\n\n`;

        response += `**The Honest No:**\n`;
        response += `"I don't have capacity for that right now."\n\n`;

        response += `**The Priority No:**\n`;
        response += `"I have other commitments I need to honor."\n\n`;

        response += `---\n\n`;

        response += `**What you DON'T need to do:**\n`;
        response += `- Over-explain or justify\n`;
        response += `- Apologize excessively\n`;
        response += `- Lie or make excuses\n`;
        response += `- Feel guilty (easier said than done, I know)\n`;
        response += `- Say yes and then resent it\n\n`;

        response += `Which approach fits your situation? Would you like to practice?`;

        return response;
      },
    });
  },
};

// ============================================================================
// REPAIR TOOLS
// ============================================================================

const repairRelationshipRuptureDef: ToolDefinition = {
  id: 'repairRelationshipRupture',
  name: 'Repair Relationship Rupture',
  description: 'Address and repair a rupture in a relationship',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'repair', 'rupture', 'relationships'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user address and repair a rupture or distance in an important relationship.',
      parameters: z.object({
        whatHappened: z.string().describe('What caused the rupture'),
        relationship: z.string().describe('The relationship affected'),
        theirPart: z.string().optional().describe('What the other person did'),
        yourPart: z.string().optional().describe('What their own part might be'),
        whatTheyWant: z.string().optional().describe('What repair would look like'),
      }),
      execute: async ({ whatHappened, relationship, theirPart, yourPart, whatTheyWant }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Preparing relationship repair'
        );

        // Persist as key moment - relationship repair is significant
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'difficult-conversations',
          type: 'decision',
          summary: `Preparing to repair relationship rupture: ${relationship}`,
          emotionalWeight: 'heavy',
          topics: ['relationships', 'repair', 'difficult-conversations'],
        });

        let response = `**Repairing a Rupture**\n\n`;

        response += `What happened: ${whatHappened}\n`;
        response += `Relationship: ${relationship}\n`;
        if (theirPart) response += `Their part: ${theirPart}\n`;
        if (yourPart) response += `Your part: ${yourPart}\n`;
        if (whatTheyWant) response += `What repair looks like: ${whatTheyWant}\n`;
        response += `\n---\n\n`;

        response += `**Repair truths:**\n\n`;
        response += `- Repair attempts matter more than perfect words\n`;
        response += `- The goal is understanding, not winning\n`;
        response += `- You can only own your part - you can't make them own theirs\n`;
        response += `- Repair is a process, not a single conversation\n`;
        response += `- Some ruptures reveal incompatibilities - that's information\n\n`;

        response += `---\n\n`;

        response += `**The Repair Conversation:**\n\n`;

        response += `**1. Lead with intention**\n`;
        response += `"I want to repair this. Our relationship matters to me."\n\n`;

        response += `**2. Own your part first**\n`;
        response += `"What I contributed to this was..." (Don't wait for them to own theirs first)\n\n`;

        response += `**3. Share your experience (not blame)**\n`;
        response += `"When [X happened], I felt..." (Not "You made me feel...")\n\n`;

        response += `**4. Seek to understand**\n`;
        response += `"Help me understand your experience. What was it like for you?"\n\n`;

        response += `**5. Define what you need**\n`;
        response += `"For me to move forward, I need..." (Be specific)\n\n`;

        response += `**6. Ask what they need**\n`;
        response += `"What do you need from me?"\n\n`;

        response += `---\n\n`;

        response += `**If it goes sideways:**\n`;
        response += `- "I can see we're both upset. Can we pause and come back to this?"\n`;
        response += `- "I'm trying to repair, not attack. Can we try again?"\n`;
        response += `- "I hear that you're hurt too. I want to understand."\n\n`;

        response += `What feels like the hardest part of this for you?`;

        return response;
      },
    });
  },
};

const makeAmendsDef: ToolDefinition = {
  id: 'makeAmends',
  name: 'Make Amends',
  description: 'Prepare to make amends for something you did',
  domain: 'difficult-conversations',
  additionalDomains: ['second-chances', 'grief', 'meaning', 'connection'], // Amends are central to second chances and restoring connection
  tags: ['difficult-conversations', 'amends', 'apology', 'accountability'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare to make genuine amends - not just apologize, but take accountability and make it right.',
      parameters: z.object({
        whatYouDid: z.string().describe('What they did that needs amending'),
        whoWasHurt: z.string().describe('Who was affected'),
        impact: z.string().optional().describe('The impact on the other person'),
      }),
      execute: async ({ whatYouDid, whoWasHurt, impact }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Preparing to make amends'
        );

        let response = `**Making Amends**\n\n`;

        response += `What you did: ${whatYouDid}\n`;
        response += `Who was affected: ${whoWasHurt}\n`;
        if (impact) {
          response += `Impact: ${impact}\n`;
        }
        response += `\n---\n\n`;

        response += `**Amends vs. Apology:**\n\n`;
        response += `- **Apology:** "I'm sorry I did that."\n`;
        response += `- **Amends:** "I'm sorry, here's how I'll make it right, and here's how I'll be different."\n\n`;
        response += `Amends require action, not just words.\n\n`;

        response += `---\n\n`;

        response += `**The Amends Formula:**\n\n`;

        response += `**1. Name what you did specifically**\n`;
        response += `Not "I'm sorry if I hurt you" → "I'm sorry I [specific action]."\n`;
        response += `_Your version:_ "I'm sorry I _______"\n\n`;

        response += `**2. Acknowledge the impact**\n`;
        response += `"I understand that caused you to feel..." / "That resulted in..."\n`;
        response += `_Your version:_ "I understand that _______"\n\n`;

        response += `**3. Take responsibility without excuses**\n`;
        response += `Not "I'm sorry, BUT..." → "I take full responsibility."\n`;
        response += `_Your version:_ "There's no excuse. I _______"\n\n`;

        response += `**4. State how you'll make it right**\n`;
        response += `What action can you take to repair the damage?\n`;
        response += `_Your version:_ "I want to make it right by _______"\n\n`;

        response += `**5. Commit to different behavior**\n`;
        response += `"Going forward, I commit to..."\n`;
        response += `_Your version:_ "In the future, I will _______"\n\n`;

        response += `**6. Ask what they need**\n`;
        response += `"Is there anything else you need from me?"\n\n`;

        response += `---\n\n`;

        response += `**Important notes:**\n`;
        response += `- You're not entitled to forgiveness. That's their choice.\n`;
        response += `- The amends are for them, not to make yourself feel better.\n`;
        response += `- Actions over time matter more than words.\n`;
        response += `- Sometimes the best amends is changed behavior.\n\n`;

        response += `Does this feel like something you're ready to do?`;

        return response;
      },
    });
  },
};

// ============================================================================
// LIFE CONVERSATION TOOLS
// ============================================================================

const endOfLifeConversationDef: ToolDefinition = {
  id: 'endOfLifeConversation',
  name: 'End of Life Conversation',
  description: 'Prepare for conversations about death, wishes, and legacy',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'end-of-life', 'death', 'family'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare for end-of-life conversations with aging parents or loved ones.',
      parameters: z.object({
        withWhom: z.string().describe('Who they need to talk to'),
        whatToDiscuss: z.enum(['wishes', 'logistics', 'relationship', 'all'])
          .describe('What aspects to discuss'),
        urgency: z.enum(['no-rush', 'should-happen-soon', 'urgent']).optional(),
        whatHoldsBack: z.string().optional().describe('What makes this hard'),
      }),
      execute: async ({ withWhom, whatToDiscuss, urgency, whatHoldsBack }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, whatToDiscuss },
          'Preparing end-of-life conversation'
        );

        // Persist as key moment
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'difficult-conversations',
          type: 'decision',
          summary: `Preparing end-of-life conversation with ${withWhom}`,
          emotionalWeight: 'heavy',
          topics: ['end-of-life', 'family', 'difficult-conversations'],
        });

        let response = `**End-of-Life Conversations**\n\n`;

        response += `With: ${withWhom}\n`;
        response += `Topic: ${whatToDiscuss}\n`;
        if (urgency) {
          response += `Urgency: ${urgency}\n`;
        }
        if (whatHoldsBack) {
          response += `What holds you back: ${whatHoldsBack}\n`;
        }
        response += `\n---\n\n`;

        response += `**First, let's acknowledge:**\n\n`;
        response += `These conversations are hard. We avoid them because:\n`;
        response += `- Talking about it feels like making it real\n`;
        response += `- We don't want to upset them (or ourselves)\n`;
        response += `- We don't know how to start\n`;
        response += `- Death is uncomfortable to face\n\n`;

        response += `But here's the thing: **avoiding the conversation doesn't avoid death.**\n`;
        response += `Having these talks is one of the most loving things you can do.\n\n`;

        response += `---\n\n`;

        if (whatToDiscuss === 'wishes' || whatToDiscuss === 'all') {
          response += `**Discussing Their Wishes:**\n\n`;
          response += `Questions to explore:\n`;
          response += `- "Have you thought about what you'd want if you couldn't speak for yourself?"\n`;
          response += `- "What matters most to you about how you're cared for?"\n`;
          response += `- "Are there treatments you'd want or not want?"\n`;
          response += `- "Who would you want making decisions if you couldn't?"\n`;
          response += `- "Where would you want to be - home, hospital, etc.?"\n\n`;
        }

        if (whatToDiscuss === 'logistics' || whatToDiscuss === 'all') {
          response += `**Discussing Practical Matters:**\n\n`;
          response += `Topics to cover:\n`;
          response += `- Do they have a will? Is it updated?\n`;
          response += `- Do they have advance directives/healthcare proxy?\n`;
          response += `- Where are important documents?\n`;
          response += `- What are their financial accounts? Passwords?\n`;
          response += `- What are their wishes for funeral/memorial?\n\n`;
        }

        if (whatToDiscuss === 'relationship' || whatToDiscuss === 'all') {
          response += `**Discussing the Relationship:**\n\n`;
          response += `Often the most important conversations:\n`;
          response += `- "Is there anything you want to tell me?"\n`;
          response += `- "Is there anything you want me to know?"\n`;
          response += `- "Is there anything you need to hear from me?"\n`;
          response += `- "I want you to know..." (say what needs to be said)\n`;
          response += `- "Thank you for..." (express gratitude)\n\n`;
        }

        response += `---\n\n`;

        response += `**Starting the conversation:**\n\n`;
        response += `- "I've been thinking about something, and I wanted to talk to you..."\n`;
        response += `- "I read something that made me realize we should talk about..."\n`;
        response += `- "I know this is uncomfortable, but I want to make sure I know your wishes..."\n`;
        response += `- "I want to make sure we never run out of time to say what matters..."\n\n`;

        response += `---\n\n`;

        response += `**Remember:**\n`;
        response += `- It doesn't have to all happen in one conversation\n`;
        response += `- Start with easier topics and build up\n`;
        response += `- They may be relieved you brought it up\n`;
        response += `- Having the conversation is an act of love\n\n`;

        response += `What part feels hardest? What would you like to practice?`;

        return response;
      },
    });
  },
};

const majorAnnouncementDef: ToolDefinition = {
  id: 'majorAnnouncement',
  name: 'Major Announcement',
  description: 'Prepare to share major life news that might be received poorly',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'announcement', 'life-change', 'family'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare to announce something major - coming out, divorce, career change, moving away, etc.',
      parameters: z.object({
        announcement: z.string().describe('What they need to announce'),
        toWhom: z.string().describe('Who they need to tell'),
        anticipatedReaction: z.string().optional().describe('How they expect the person to react'),
        whyItsHard: z.string().optional().describe('Why this feels difficult'),
      }),
      execute: async ({ announcement, toWhom, anticipatedReaction, whyItsHard }) => {
        getLogger().info(
          { agentId: ctx.agentId },
          'Preparing major announcement'
        );

        let response = `**Preparing Your Announcement**\n\n`;

        response += `What you need to share: ${announcement}\n`;
        response += `With: ${toWhom}\n`;
        if (anticipatedReaction) {
          response += `Expected reaction: ${anticipatedReaction}\n`;
        }
        if (whyItsHard) {
          response += `Why it's hard: ${whyItsHard}\n`;
        }
        response += `\n---\n\n`;

        response += `**Key truths:**\n\n`;
        response += `- You don't need permission to live your truth\n`;
        response += `- Their reaction is about them, not about you\n`;
        response += `- You can give them time to adjust without taking back your truth\n`;
        response += `- Some relationships might not survive - and that's information\n`;
        response += `- Living authentically is more important than keeping everyone comfortable\n\n`;

        response += `---\n\n`;

        response += `**Framework for major announcements:**\n\n`;

        response += `**1. Set the stage**\n`;
        response += `"I need to share something important with you. I want you to hear it from me."\n\n`;

        response += `**2. Share the news directly**\n`;
        response += `Don't bury the lead. State it clearly.\n`;
        response += `"[The announcement]"\n\n`;

        response += `**3. Share what it means to you**\n`;
        response += `"This is important to me because..."\n`;
        response += `"I've thought about this a lot..."\n\n`;

        response += `**4. Acknowledge their experience**\n`;
        response += `"I know this might be surprising/hard to hear..."\n`;
        response += `"I understand if you need time to process..."\n\n`;

        response += `**5. State what you need**\n`;
        response += `"What I need from you is..."\n`;
        response += `"I'm not asking for _____, I'm just asking for _____"\n\n`;

        response += `**6. Leave space**\n`;
        response += `"Do you have questions?" / "What's coming up for you?"\n\n`;

        response += `---\n\n`;

        response += `**If they react poorly:**\n`;
        response += `- "I understand this is hard. I'm not taking it back."\n`;
        response += `- "I hear your concerns. This is still my decision."\n`;
        response += `- "I'd rather you be upset and know the truth than comfortable in a lie."\n`;
        response += `- "Take whatever time you need. I'm here when you're ready to talk more."\n\n`;

        response += `Would you like to practice what you want to say?`;

        return response;
      },
    });
  },
};

// ============================================================================
// WISDOM TOOL
// ============================================================================

const shareConversationWisdomDef: ToolDefinition = {
  id: 'shareConversationWisdom',
  name: 'Share Conversation Wisdom',
  description: 'Share wisdom about difficult conversations',
  domain: 'difficult-conversations',
  tags: ['difficult-conversations', 'wisdom', 'quotes', 'communication'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Share relevant wisdom about difficult conversations and communication.',
      parameters: z.object({
        context: z.enum(['avoidance', 'clarity', 'response', 'importance', 'timing', 'listening', 'general'])
          .describe('What context they need wisdom for'),
      }),
      execute: async ({ context }) => {
        getLogger().info(
          { agentId: ctx.agentId, context },
          'Sharing conversation wisdom'
        );

        let response = `**Wisdom for Difficult Conversations**\n\n`;

        const matchingWisdom = CONVERSATION_WISDOM.filter(w => w.context === context || context === 'general');
        const wisdomToShare = matchingWisdom.length > 0 ? matchingWisdom : CONVERSATION_WISDOM.slice(0, 3);

        wisdomToShare.forEach(w => {
          response += `> "${w.quote}"\n`;
          response += `> — ${w.attribution}\n\n`;
        });

        response += `---\n\n`;

        response += `**Common Mistakes to Avoid:**\n\n`;
        CONVERSATION_MISTAKES.slice(0, 4).forEach(m => {
          response += `❌ ${m.mistake}\n`;
          response += `✅ ${m.better}\n\n`;
        });

        response += `What resonates with you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const difficultConversationTools: ToolDefinition[] = [
  // Preparation
  prepareHardConversationDef,
  clarifyIntentionDef,
  anticipateResponsesDef,
  // Practice
  practiceConversationDef,
  buildScriptDef,
  // Boundaries
  setBoundaryConversationDef,
  sayNoWithGraceDef,
  // Repair
  repairRelationshipRuptureDef,
  makeAmendsDef,
  // Life Conversations
  endOfLifeConversationDef,
  majorAnnouncementDef,
  // Wisdom
  shareConversationWisdomDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'difficult-conversations',
  difficultConversationTools
);

export default getToolDefinitions;
