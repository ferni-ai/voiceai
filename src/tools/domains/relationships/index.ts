/**
 * Relationships & Connection Domain Tools
 *
 * Tools for nurturing relationships, resolving conflicts, and deepening human connection.
 * This domain addresses the fundamental human need for belonging and love.
 *
 * DOMAIN: relationships
 * TOOLS (6):
 *   Health: assessRelationshipHealth, mapRelationshipCircles
 *   Nurturing: suggestConnectionAction, deepenFriendship
 *   Conflict: navigateConflict, prepareForDifficultConversation
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { generateToolQuestions } from '../../utils/dynamic-tool-questions.js';
// ============================================================================
// RELATIONSHIP HEALTH TOOLS
// ============================================================================

const assessRelationshipHealthDef: ToolDefinition = {
  id: 'assessRelationshipHealth',
  name: 'Assess Relationship Health',
  description: 'Reflect on the health of a specific relationship across key dimensions',
  domain: 'relationships',
  tags: ['relationships', 'assessment', 'health'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('assessRelationshipHealth'),
      parameters: z.object({
        personName: z.string().describe('Name of the person in the relationship'),
        relationshipType: z
          .enum(['partner', 'family', 'friend', 'colleague', 'mentor', 'other'])
          .describe('Type of relationship'),
        specificConcern: z
          .string()
          .optional()
          .describe('Any specific concern prompting this reflection'),
      }),
      execute: async ({ personName, relationshipType, specificConcern }) => {
        getLogger().info(
          { agentId: ctx.agentId, personName, relationshipType },
          'Assessing relationship health'
        );

        // Generate persona-grounded questions for relationship health
        const generated = generateToolQuestions({
          personaId: ctx.agentId,
          domain: 'relationships',
          focus: specificConcern?.toLowerCase().includes('trust')
            ? 'trust'
            : specificConcern?.toLowerCase().includes('communicat')
              ? 'communication'
              : specificConcern?.toLowerCase().includes('conflict')
                ? 'conflict'
                : 'connection',
          specificContext: personName,
          emotionalTone: 'gentle',
        });

        let response = `Let's reflect on your relationship with ${personName}. `;
        if (specificConcern) {
          response += `You mentioned: "${specificConcern}" - let's explore that. `;
        }
        response += '\n\n';

        // Use key dimensions with dynamic questions
        const dimensions = [
          { name: 'Trust', question: 'How much do you trust each other?' },
          { name: 'Communication', question: 'How openly can you communicate?' },
          { name: 'Reciprocity', question: 'Does the giving and receiving feel balanced?' },
          { name: 'Emotional Safety', question: 'Can you be vulnerable without fear?' },
          { name: 'Growth', question: 'Does this relationship help you both grow?' },
          { name: 'Joy', question: 'How often do you feel genuine joy together?' },
        ];

        response += 'Consider these dimensions:\n';
        dimensions.forEach((d, i) => {
          response += `\n${i + 1}. **${d.name}**: ${d.question}`;
        });

        response += `\n\n${generated.closingPrompt}`;

        return response;
      },
    });
  },
};

// ============================================================================
// RELATIONSHIP NURTURING TOOLS
// ============================================================================

const suggestConnectionActionDef: ToolDefinition = {
  id: 'suggestConnectionAction',
  name: 'Suggest Connection Action',
  description: 'Get personalized ideas for meaningful ways to connect with someone',
  domain: 'relationships',
  tags: ['relationships', 'nurturing', 'action'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestConnectionAction'),
      parameters: z.object({
        personName: z.string().describe('Name of the person'),
        context: z.string().optional().describe('Any context about them or the situation'),
        effortLevel: z
          .enum(['small-gesture', 'meaningful-effort', 'grand-gesture'])
          .optional()
          .describe('How much effort/energy available'),
      }),
      execute: async ({ personName, context, effortLevel = 'meaningful-effort' }) => {
        getLogger().info(
          { agentId: ctx.agentId, personName, effortLevel },
          'Suggesting connection actions'
        );

        const suggestions: Record<string, string[]> = {
          'small-gesture': [
            `Send ${personName} a text just to say you were thinking of them - no agenda needed.`,
            `Share a photo, article, or meme that reminded you of them.`,
            `Leave a genuine comment on something they posted.`,
            `Send a voice note instead of a text - it's more personal.`,
          ],
          'meaningful-effort': [
            `Schedule a call or video chat with ${personName} - put it on the calendar.`,
            `Write them a handwritten note about what they mean to you.`,
            `Plan a shared experience - a meal, walk, or activity you'd both enjoy.`,
            `Ask them a real question about their life and truly listen to the answer.`,
            `Remember something important to them and follow up on it.`,
          ],
          'grand-gesture': [
            `Plan a surprise that shows you really know ${personName}.`,
            `Create something for them - a playlist, photo album, or written reflection.`,
            `Show up for them in a way they wouldn't expect but deeply need.`,
            `Organize something that brings together people who matter to them.`,
          ],
        };

        const options = suggestions[effortLevel];
        let response = `Here are some ways to connect with ${personName}:\n\n`;

        options.forEach((suggestion, i) => {
          response += `${i + 1}. ${suggestion}\n`;
        });

        if (context) {
          response += `\nGiven what you shared about them, I'd especially recommend thinking about what would feel most meaningful to *them*, not just convenient for you.`;
        }

        response += `\n\nWhat resonates? Or would you like ideas tailored to something specific about them?`;

        return response;
      },
    });
  },
};

// ============================================================================
// CONFLICT & REPAIR TOOLS
// ============================================================================

const navigateConflictDef: ToolDefinition = {
  id: 'navigateConflict',
  name: 'Navigate Conflict',
  description: 'Get guidance for navigating a conflict or tension in a relationship',
  domain: 'relationships',
  tags: ['relationships', 'conflict', 'guidance'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('navigateConflict'),
      parameters: z.object({
        personName: z.string().describe('Person the conflict is with'),
        situation: z.string().describe('What happened or what the tension is about'),
        yourFeeling: z.string().describe('How you feel about it'),
        whatYouWant: z.string().optional().describe('What outcome you hope for'),
      }),
      execute: async ({ personName, situation, yourFeeling, whatYouWant }) => {
        getLogger().info({ agentId: ctx.agentId, personName }, 'Navigating conflict');

        let response = `Conflict is hard, especially with someone who matters to you. Let me help you think this through.\n\n`;

        response += `**What happened:** ${situation}\n`;
        response += `**How you feel:** ${yourFeeling}\n`;
        if (whatYouWant) {
          response += `**What you hope for:** ${whatYouWant}\n`;
        }

        response += `\n**Some questions to sit with:**\n\n`;
        response += `1. What might ${personName}'s experience of this be? What might they be feeling or needing?\n`;
        response += `2. Is there a part of this where you can see their point, even if you disagree?\n`;
        response += `3. What's the deeper need underneath your position? (Often it's about feeling respected, heard, valued, safe...)\n`;
        response += `4. What would repair look like? What would you need to hear or experience to move forward?\n\n`;

        response += `Do you want to explore any of these questions, or would it help to think about how to approach a conversation with ${personName}?`;

        return response;
      },
    });
  },
};

const prepareForDifficultConversationDef: ToolDefinition = {
  id: 'prepareForDifficultConversation',
  name: 'Prepare for Difficult Conversation',
  description: 'Get coached on having a difficult but necessary conversation',
  domain: 'relationships',
  tags: ['relationships', 'communication', 'difficult-conversations'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('prepareForDifficultConversation'),
      parameters: z.object({
        personName: z.string().describe('Person you need to talk to'),
        topic: z.string().describe('What the conversation needs to be about'),
        whatYouNeedToSay: z.string().describe('The core message you need to communicate'),
        fear: z.string().optional().describe('What you are afraid might happen'),
      }),
      execute: async ({ personName, topic, whatYouNeedToSay, fear }) => {
        getLogger().info(
          { agentId: ctx.agentId, personName, topic },
          'Preparing for difficult conversation'
        );

        let response = `Difficult conversations take courage. The fact that you're preparing shows you care about doing this well.\n\n`;

        response += `**The conversation:** ${topic}\n`;
        response += `**Your core message:** ${whatYouNeedToSay}\n`;
        if (fear) {
          response += `**Your fear:** ${fear}\n`;
        }

        response += `\n**Framework for the conversation:**\n\n`;
        response += `1. **Open with care:** Start by acknowledging the relationship matters. "I care about our relationship, which is why I need to talk about something difficult."\n\n`;
        response += `2. **State your experience (not accusations):** Use "I" statements. "I felt..." rather than "You always..."\n\n`;
        response += `3. **Name your need:** What do you actually need from this? Be specific and honest.\n\n`;
        response += `4. **Leave space:** Ask for their perspective. "How do you see this?" and genuinely listen.\n\n`;
        response += `5. **Focus on forward:** What do you both want going forward?\n\n`;

        if (fear) {
          response += `**About your fear:** ${fear} - This fear is valid. And also: the conversation you're avoiding usually costs more than the one you have. What's the cost of *not* having this conversation?\n\n`;
        }

        response += `Would you like to practice what you might say? I can help you find the words.`;

        return response;
      },
    });
  },
};

// ============================================================================
// RELATIONSHIP DYNAMICS TOOLS
// ============================================================================

const mapRelationshipCirclesDef: ToolDefinition = {
  id: 'mapRelationshipCircles',
  name: 'Map Relationship Circles',
  description: 'Visualize and reflect on your different circles of relationships',
  domain: 'relationships',
  tags: ['relationships', 'reflection', 'mapping'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('mapRelationshipCircles'),
      parameters: z.object({
        focusArea: z
          .enum(['overview', 'inner-circle', 'support-network', 'community', 'gaps'])
          .describe('What aspect to explore'),
      }),
      execute: async ({ focusArea }) => {
        getLogger().info({ agentId: ctx.agentId, focusArea }, 'Mapping relationship circles');

        let response = '';

        if (focusArea === 'overview') {
          response = `**Your Relationship Circles**\n\n`;
          response += `Think of your relationships as concentric circles:\n\n`;
          response += `🎯 **Inner Circle (1-3 people):** Those who know your deepest self. Who can you be completely yourself with?\n\n`;
          response += `💚 **Close Circle (5-15 people):** People you'd turn to in a crisis. Who do you trust with hard things?\n\n`;
          response += `🤝 **Friends & Extended (15-50):** People you genuinely enjoy and care about. Who enriches your life?\n\n`;
          response += `👋 **Acquaintances (50-150):** People you know and like but don't go deep with.\n\n`;
          response += `Which circle would you like to explore? Or is there a gap you're noticing?`;
        } else if (focusArea === 'inner-circle') {
          response = `**Your Inner Circle**\n\n`;
          response += `These are your people - the ones who see you fully.\n\n`;
          response += `Questions to reflect on:\n`;
          response += `- Who knows your fears, dreams, and struggles?\n`;
          response += `- Who can you call at 2am?\n`;
          response += `- Who would you trust with your most vulnerable truth?\n`;
          response += `- Who makes you feel safe to be imperfect?\n\n`;
          response += `Most people have 1-3 people here. Some have none right now - that's okay, it's something to build toward. How does your inner circle look?`;
        } else if (focusArea === 'gaps') {
          response = `**Noticing Relationship Gaps**\n\n`;
          response += `Sometimes we notice our relationship landscape is missing something:\n\n`;
          response += `- **No one to be vulnerable with** - Intimacy deficit\n`;
          response += `- **No one who challenges you** - Growth deficit\n`;
          response += `- **No one who shares your interests** - Connection deficit\n`;
          response += `- **No one from your past** - Continuity deficit\n`;
          response += `- **No mentors or elders** - Wisdom deficit\n`;
          response += `- **No one younger to guide** - Purpose deficit\n\n`;
          response += `Do any of these resonate? What kind of relationship might be missing from your life?`;
        } else {
          response = `Let's explore your ${focusArea} together. Tell me who comes to mind when you think about this circle of your life.`;
        }

        return response;
      },
    });
  },
};

const deepenFriendshipDef: ToolDefinition = {
  id: 'deepenFriendship',
  name: 'Deepen Friendship',
  description: 'Move a friendship from surface-level to deeper connection',
  domain: 'relationships',
  tags: ['relationships', 'friendship', 'deepening'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('deepenFriendship'),
      parameters: z.object({
        personName: z.string().describe('Friend to deepen connection with'),
        currentLevel: z
          .enum(['acquaintance', 'casual', 'friend', 'close'])
          .describe('Current closeness'),
        barrier: z.string().optional().describe('What seems to keep it surface-level'),
      }),
      execute: async ({ personName, currentLevel, barrier }) => {
        getLogger().info(
          { agentId: ctx.agentId, personName, currentLevel },
          'Deepening friendship'
        );

        let response = `Deepening your friendship with ${personName}.\n\n`;
        response += `Current level: ${currentLevel}\n`;
        if (barrier) response += `Barrier: ${barrier}\n`;
        response += `\n`;

        response += `**Friendships deepen through:**\n\n`;
        response += `1. **Vulnerability** - Sharing something real about yourself first\n`;
        response += `2. **Consistency** - Regular contact builds trust over time\n`;
        response += `3. **Depth** - Asking real questions, not just "how are you?"\n`;
        response += `4. **Shared experience** - Doing things together, especially new things\n`;
        response += `5. **Being there** - Showing up in hard times, not just good times\n\n`;

        response += `**Questions that deepen connection:**\n`;
        response += `- "What's something you're excited about right now?"\n`;
        response += `- "What's been hard lately?"\n`;
        response += `- "What's something most people don't know about you?"\n`;
        response += `- "What do you wish you had more time for?"\n\n`;

        response += `**The truth:** Many people want deeper friendships but are waiting for the other person to make it deeper first.\n\n`;
        response += `What step could you take to go deeper with ${personName}?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION (Consolidated: 14 → 6 tools)
// ============================================================================

// We keep only the most essential tools and consolidate related functionality

const relationshipsTools: ToolDefinition[] = [
  // Health & Awareness - combines assess + neglected + mapping
  assessRelationshipHealthDef,
  mapRelationshipCirclesDef,
  // Nurturing & Connection - combines suggest + record + deepen + reconnect
  suggestConnectionActionDef,
  deepenFriendshipDef,
  // Conflict & Communication - combines navigate + prepare + apology + gratitude + checkin
  navigateConflictDef,
  prepareForDifficultConversationDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'relationships',
  relationshipsTools
);

export default getToolDefinitions;
