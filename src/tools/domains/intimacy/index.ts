/**
 * Intimacy Domain
 *
 * Tools for building and maintaining intimate connection.
 * Intimacy is vulnerability + safety + connection.
 *
 * DOMAIN: intimacy
 * PERSONA AFFINITY: Ferni (emotional), Alex (communication)
 *
 * TOOLS:
 *   Understanding: intimacyTypes, vulnerabilityInRelationship
 *   Building: emotionalIntimacy, conversationDeepener
 *   Challenges: intimacyBarriers, reconnecting, communicatingDesires
 *
 * PRINCIPLES:
 * - Intimacy is broader than physical - emotional, intellectual, experiential
 * - Vulnerability is the path to connection
 * - Safety must be present for true intimacy
 * - Communication is essential
 *
 * SAFETY: Sensitive topic. Keep conversations supportive, not therapeutic.
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
  getAttachmentContext,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// TOOL: Intimacy Types
// ============================================================================

const intimacyTypesDef: ToolDefinition = {
  id: 'intimacyTypes',
  name: 'Intimacy Types',
  description: 'Understand the different types of intimacy',
  domain: 'intimacy',
  tags: ['intimacy', 'types', 'understanding', 'connection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('intimacyTypes'),
      parameters: z.object({
        context: z
          .enum(['romantic', 'friendship', 'self', 'general'])
          .describe('What context for intimacy'),
      }),
      execute: async ({ context }) => {
        log.info({ agentId: ctx.agentId, context }, 'Exploring intimacy types');

        let response = '';

        response += '**Types of intimacy:**\n\n';

        response += "Intimacy isn't just physical. There are many paths to deep connection.\n\n";

        response += '**Emotional intimacy:**\n';
        response += 'Sharing feelings, being vulnerable, feeling understood and accepted.\n';
        response += '"You know how I really feel."\n\n';

        response += '**Intellectual intimacy:**\n';
        response += "Sharing ideas, values, beliefs. Stimulating each other's minds.\n";
        response += '"We can talk about anything."\n\n';

        response += '**Experiential intimacy:**\n';
        response += 'Shared experiences, activities, memories. Building a life together.\n';
        response += '"We\'ve been through so much together."\n\n';

        response += '**Physical intimacy:**\n';
        response += 'Touch, affection, closeness, sexuality. Physical expression of connection.\n';
        response += '"I feel safe in your presence."\n\n';

        response += '**Spiritual intimacy:**\n';
        response += 'Shared meaning, purpose, values, practices.\n';
        response += '"We believe in the same things."\n\n';

        response += '**Creative intimacy:**\n';
        response += 'Creating together, collaborating, building something.\n';
        response += '"We made this."\n\n';

        // Context-specific
        const contextNotes: Record<string, string> = {
          romantic:
            '**In romantic relationships:**\nAll types matter. Couples often have some types strong and others lacking. Which types are strongest for you? Which need attention?',
          friendship:
            '**In friendships:**\nDeep friendships often have emotional, intellectual, and experiential intimacy. Physical intimacy might be hugs or shoulder-to-shoulder presence. Not all friendships need all types.',
          self: '**With yourself:**\nSelf-intimacy means knowing yourself deeply - your emotions, thoughts, body. This is the foundation for intimacy with others.',
          general:
            '**Across all relationships:**\nDifferent relationships have different intimacy profiles. A best friend might have high emotional and low physical. A workout buddy might be experiential. All are valid.',
        };

        response += '\n' + contextNotes[context] + '\n\n';

        response += 'Which type of intimacy do you most want to develop?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Emotional Intimacy
// ============================================================================

const emotionalIntimacyDef: ToolDefinition = {
  id: 'emotionalIntimacy',
  name: 'Emotional Intimacy',
  description: 'Build deeper emotional intimacy',
  domain: 'intimacy',
  tags: ['intimacy', 'emotional', 'connection', 'vulnerability'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('emotionalIntimacy'),
      parameters: z.object({
        with: z.string().optional().describe('With whom you want to build intimacy'),
        challenge: z.string().optional().describe("What's blocking emotional intimacy"),
      }),
      execute: async ({ with: withWhom, challenge }) => {
        log.info({ agentId: ctx.agentId }, 'Building emotional intimacy');

        let response = '';

        response += '**Building emotional intimacy:**\n\n';

        if (withWhom) {
          response += `With: ${withWhom}\n\n`;
        }

        response += 'Emotional intimacy is the feeling of being truly known and accepted. ';
        response += 'It requires vulnerability and safety.\n\n';

        // If there's a challenge
        if (challenge) {
          response += `**Your challenge:** "${challenge}"\n\n`;
        }

        response += '**Building blocks:**\n\n';

        response += '**1. Create safety:**\n';
        response += '• No judgment when they share\n';
        response += '• Keep confidences\n';
        response += '• Respond with warmth, not advice\n';
        response += "• Validate emotions even when you don't agree\n\n";

        response += '**2. Be vulnerable first:**\n';
        response += '• Share your feelings, not just facts\n';
        response += "• Admit when you're struggling\n";
        response += '• Let them see the real you\n';
        response += '• Take the risk of being seen\n\n';

        response += '**3. Be genuinely curious:**\n';
        response += '• Ask about their inner world\n';
        response += '• Listen to understand, not respond\n';
        response += '• Remember what they share\n';
        response += '• Follow up on previous conversations\n\n';

        response += '**4. Repair ruptures:**\n';
        response += "• Apologize when you've hurt them\n";
        response += "• Don't let conflicts fester\n";
        response += '• Process disagreements together\n';
        response += '• Conflict handled well builds intimacy\n\n';

        response += '**Questions that build intimacy:**\n';
        response += '• "What\'s been on your heart lately?"\n';
        response += '• "How are you really doing?"\n';
        response += '• "What do you need from me right now?"\n';
        response += '• "What\'s something you\'ve never told anyone?"\n\n';

        response += "What's one way you could deepen emotional intimacy this week?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Vulnerability in Relationships
// ============================================================================

const vulnerabilityRelationshipDef: ToolDefinition = {
  id: 'vulnerabilityInRelationship',
  name: 'Vulnerability in Relationships',
  description: 'Practice healthy vulnerability for deeper connection',
  domain: 'intimacy',
  tags: ['intimacy', 'vulnerability', 'connection', 'courage'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('vulnerabilityInRelationship'),
      parameters: z.object({
        barrier: z
          .enum(['fear-rejection', 'past-hurt', 'dont-know-how', 'feels-weak', 'unsafe-partner'])
          .describe('What makes vulnerability hard'),
      }),
      execute: async ({ barrier }) => {
        log.info({ agentId: ctx.agentId, barrier }, 'Vulnerability in relationships');

        let response = '';

        response += '**Vulnerability in relationships:**\n\n';

        response += "Vulnerability isn't weakness. It's the courage to be seen. ";
        response += "It's the birthplace of connection.\n\n";

        // Barrier-specific
        const barrierResponses: Record<string, string> = {
          'fear-rejection':
            "**Fear of rejection:**\n\nIt makes sense to protect yourself. Rejection hurts. But here's the truth: The relationships worth having require you to be seen. People can only love the real you if you show them the real you. Start small. Test with low-stakes vulnerability.",
          'past-hurt':
            "**Past hurt makes vulnerability scary:**\n\nIf you've been hurt when vulnerable before, your walls make sense. They protected you. But keeping everyone out also keeps connection out. The goal isn't to tear down walls - it's to build doors. Let the right people in.",
          'dont-know-how':
            '**Not knowing how:**\n\nVulnerability is a skill. Start small:\n• Share a preference ("I actually don\'t like...")\n• Admit uncertainty ("I\'m not sure if...")\n• Express a feeling ("I felt sad when...")\n• Ask for help with something small\nEach disclosure builds the muscle.',
          'feels-weak':
            "**Vulnerability feels like weakness:**\n\nCulture taught us this lie. But think of the people you most respect - aren't they also honest, real, imperfect? Vulnerability takes MORE courage than armor. Hiding is easy. Being seen is brave.",
          'unsafe-partner':
            "**Unsafe partner:**\n\nIf your partner responds to vulnerability with criticism, dismissal, or ammunition for later fights - that's a relationship problem, not a you problem. Vulnerability requires safety. If that safety isn't there, that needs to be addressed first.",
        };

        response += barrierResponses[barrier] + '\n\n';

        response += '**Vulnerability practices:**\n';
        response += '• "I\'m scared to tell you this, but..."\n';
        response += '• "I need help with..."\n';
        response += '• "I don\'t know the answer"\n';
        response += '• "That hurt my feelings"\n';
        response += '• "I\'m struggling with..."\n\n';

        response += '**The vulnerability ladder:**\n';
        response += '1. Share a preference\n';
        response += '2. Share an opinion\n';
        response += '3. Share a feeling\n';
        response += '4. Share a need\n';
        response += '5. Share a fear\n';
        response += '6. Share a secret\n\n';

        response += "Start where you're comfortable. What's your next step on the ladder?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Intimacy Barriers
// ============================================================================

const intimacyBarriersDef: ToolDefinition = {
  id: 'intimacyBarriers',
  name: 'Intimacy Barriers',
  description: 'Identify and work through barriers to intimacy',
  domain: 'intimacy',
  tags: ['intimacy', 'barriers', 'blocks', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('intimacyBarriers'),
      parameters: z.object({
        barrier: z.string().describe("What's blocking intimacy"),
      }),
      execute: async ({ barrier }) => {
        log.info({ agentId: ctx.agentId, barrier }, 'Exploring intimacy barriers');

        let response = '';

        response += `**Your intimacy barrier:** "${barrier}"\n\n`;

        response +=
          'Barriers to intimacy are usually protection strategies that made sense at some point. ';
        response += "They're not character flaws.\n\n";

        response += '**Common barriers:**\n\n';

        response += '**Fear-based:**\n';
        response += '• Fear of rejection\n';
        response += '• Fear of losing yourself\n';
        response += '• Fear of abandonment\n';
        response += '• Fear of being truly known\n\n';

        response += '**Past-based:**\n';
        response += '• Previous betrayal\n';
        response += '• Childhood attachment wounds\n';
        response += '• Past relationship trauma\n';
        response += '• Learned relationship patterns\n\n';

        response += '**Current:**\n';
        response += '• Busy lives (no time for connection)\n';
        response += '• Unresolved conflict\n';
        response += '• Physical/mental health struggles\n';
        response += '• Life stressors\n';
        response += "• Partner's barriers\n\n";

        response += '**Working through barriers:**\n';
        response += '1. **Name it** - Acknowledge the barrier exists\n';
        response += "2. **Understand it** - When did it start? What's it protecting?\n";
        response += "3. **Communicate it** - Tell your partner what you're working with\n";
        response += "4. **Small steps** - Don't try to remove the barrier overnight\n";
        response += '5. **Get support** - Some barriers need professional help\n\n';

        response += '**Questions to explore:**\n';
        response += '• When did this barrier first show up?\n';
        response += '• What is it protecting you from?\n';
        response += '• What would it feel like without it?\n';
        response += "• What's one tiny step toward lowering it?\n\n";

        response += 'What do you think your barrier is protecting you from?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Reconnecting
// ============================================================================

const reconnectingDef: ToolDefinition = {
  id: 'reconnecting',
  name: 'Reconnecting',
  description: 'Rebuild intimacy after disconnection',
  domain: 'intimacy',
  tags: ['intimacy', 'reconnection', 'relationship', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('reconnecting'),
      parameters: z.object({
        disconnectionLength: z.string().optional().describe('How long have you felt disconnected'),
        cause: z.string().optional().describe('What caused the disconnection'),
      }),
      execute: async ({ disconnectionLength, cause }) => {
        log.info({ agentId: ctx.agentId }, 'Reconnecting after disconnection');

        let response = '';

        response += '**Reconnecting after disconnection:**\n\n';

        if (disconnectionLength) {
          response += `You've felt disconnected for: ${disconnectionLength}\n`;
        }
        if (cause) {
          response += `Cause: ${cause}\n`;
        }
        response += '\n';

        response +=
          'Disconnection happens in all relationships. The question is whether you turn toward each other to repair.\n\n';

        response += '**Why disconnection happens:**\n';
        response += '• Life gets busy\n';
        response += '• Unaddressed hurts pile up\n';
        response += '• You stop being curious about each other\n';
        response += '• Physical intimacy drops\n';
        response += "• You're roommates, not partners\n\n";

        response += "**Signs you've disconnected:**\n";
        response += "• You don't share your inner world\n";
        response += '• Conversations are logistics only\n';
        response += '• Touch has decreased\n';
        response += '• You feel lonely in the relationship\n';
        response += "• You're not a priority for each other\n\n";

        response += '**Reconnection strategies:**\n\n';

        response += '**1. Name it together:**\n';
        response +=
          '"I\'ve noticed we\'ve been disconnected. I miss us. Can we talk about it?"\n\n';

        response += '**2. Schedule connection:**\n';
        response +=
          'Date nights, phone-free time, morning coffee together. Put it in the calendar.\n\n';

        response += '**3. Small bids:**\n';
        response +=
          'Reach out in small ways. A touch, a text, a question about their day. Notice and respond to their bids.\n\n';

        response += '**4. Physical reconnection:**\n';
        response +=
          'Non-sexual touch first. Hold hands, cuddle, hug longer. Physical connection primes emotional connection.\n\n';

        response += '**5. Emotional reconnection:**\n';
        response += 'Ask deeper questions. Share your inner world. Be curious about theirs.\n\n';

        response += '**6. Address underlying issues:**\n';
        response +=
          "If there's unresolved conflict, it needs to be addressed for true reconnection.\n\n";

        response += "What's one way you could turn toward your partner today?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Conversation Deepener
// ============================================================================

const conversationDeepenerDef: ToolDefinition = {
  id: 'conversationDeepener',
  name: 'Conversation Deepener',
  description: 'Questions and prompts to deepen conversations',
  domain: 'intimacy',
  tags: ['intimacy', 'conversation', 'connection', 'questions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('conversationDeepener'),
      parameters: z.object({
        relationshipType: z
          .enum(['romantic', 'friendship', 'family', 'new-connection'])
          .describe('What type of relationship'),
      }),
      execute: async ({ relationshipType }) => {
        log.info({ agentId: ctx.agentId, relationshipType }, 'Conversation deepeners');

        let response = '';

        response += `**Conversation deepeners for ${relationshipType}:**\n\n`;

        const deepeners: Record<string, string[]> = {
          romantic: [
            "What's something you've never told me?",
            'When did you last feel really connected to me?',
            "What's a dream you've given up on?",
            'What do you need more of from me?',
            "What's something you're afraid to tell me?",
            'What was your happiest memory of us?',
            "How have you changed since we've been together?",
            'What do you wish we did more of?',
          ],
          friendship: [
            "What's something you're processing right now?",
            'When did you last cry?',
            "What's a belief you've changed your mind about?",
            "What would you do if you knew you couldn't fail?",
            "What's something people assume about you that's wrong?",
            'What are you most proud of that you never talk about?',
            'What do you wish you could tell your younger self?',
          ],
          family: [
            "What's your favorite memory from when I was young?",
            'What do you regret?',
            'What did you dream of becoming?',
            "What don't I know about your life before me?",
            'What are you most proud of?',
            'What do you wish we talked about more?',
            "What's something you want me to know?",
          ],
          'new-connection': [
            'What are you most passionate about?',
            "What's something that shaped who you are?",
            'What does a perfect day look like for you?',
            "What's something you're working on in yourself?",
            "What's the best advice you've ever received?",
            "What's something that always makes you laugh?",
            'What are you grateful for today?',
          ],
        };

        response += '**Questions to try:**\n';
        deepeners[relationshipType].forEach((q) => (response += `• ${q}\n`));

        response += '\n**Tips for deeper conversations:**\n';
        response += '• Put away phones\n';
        response += '• Listen to understand, not respond\n';
        response += '• Follow up on what they share\n';
        response += '• Share in return (vulnerability invites vulnerability)\n';
        response += "• Don't try to fix - just be present\n\n";

        response += 'Which question resonates? What feels like the right one to ask?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Communicating Desires
// ============================================================================

const communicatingDesiresDef: ToolDefinition = {
  id: 'communicatingDesires',
  name: 'Communicating Desires',
  description: 'Express needs and desires in relationships',
  domain: 'intimacy',
  tags: ['intimacy', 'communication', 'needs', 'desires'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('communicatingDesires'),
      parameters: z.object({
        desire: z.string().describe('What you want to communicate'),
        fear: z.string().optional().describe("What you're afraid will happen if you share"),
      }),
      execute: async ({ desire, fear }) => {
        log.info({ agentId: ctx.agentId }, 'Communicating desires');

        let response = '';

        response += '**Communicating your desires:**\n\n';

        response += `What you want to express: "${desire}"\n`;
        if (fear) {
          response += `Your fear: "${fear}"\n`;
        }
        response += '\n';

        response += 'Unspoken desires create distance. Expressed desires create possibility.\n\n';

        response += "**Why it's hard:**\n";
        response += '• Fear of rejection\n';
        response += '• Not wanting to burden them\n';
        response += '• Not feeling entitled to have needs\n';
        response += '• Past experience of needs being dismissed\n';
        response += '• Vulnerability of stating what you want\n\n';

        response += '**The cost of not sharing:**\n';
        response += "• They can't meet needs they don't know about\n";
        response += '• Resentment builds\n';
        response += '• You feel unseen\n';
        response += '• Connection suffers\n\n';

        response += '**How to communicate desires:**\n\n';

        response += '**1. Use "I" statements:**\n';
        response += '• "I feel... when..."\n';
        response += '• "I need..."\n';
        response += '• "I would love it if..."\n\n';

        response += '**2. Be specific:**\n';
        response += '• Not "I need more attention"\n';
        response += '• But "I would love if we had 20 minutes of phone-free time before bed"\n\n';

        response += '**3. No blame:**\n';
        response += '• Not "You never..."\n';
        response += '• But "I\'m wanting more..."\n\n';

        response += '**4. Open for discussion:**\n';
        response += '• "How does that sound to you?"\n';
        response += '• "What would work for you?"\n\n';

        response += '**Script starter:**\n';
        response += `"I want to share something with you. [${desire}]. I've been nervous to bring it up because [${fear || 'it feels vulnerable'}]. But I want us to be closer, and that means sharing what I need. What are your thoughts?"\n\n`;

        response += 'How does that feel? What might make this conversation feel safer?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const intimacyTools: ToolDefinition[] = [
  intimacyTypesDef,
  emotionalIntimacyDef,
  vulnerabilityRelationshipDef,
  intimacyBarriersDef,
  reconnectingDef,
  conversationDeepenerDef,
  communicatingDesiresDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'intimacy',
  intimacyTools
);

export default getToolDefinitions;
