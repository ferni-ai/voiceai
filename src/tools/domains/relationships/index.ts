/**
 * Relationships & Connection Domain Tools
 *
 * Tools for nurturing relationships, resolving conflicts, and deepening human connection.
 * This domain addresses the fundamental human need for belonging and love.
 *
 * DOMAIN: relationships
 * TOOLS:
 *   Health: assessRelationshipHealth, identifyNeglectedRelationships, getRelationshipInsights
 *   Nurturing: suggestConnectionAction, recordMeaningfulMoment, celebrateRelationship
 *   Conflict: navigateConflict, prepareForDifficultConversation, processRelationshipPain
 *   Communication: craftHeartfeltMessage, practiceActiveListening, expressGratitude
 *   Dynamics: mapRelationshipCircles, understandAttachmentStyle, setRelationshipBoundary
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

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
      description:
        'Help the user reflect on the health of a relationship across dimensions like trust, communication, reciprocity, and emotional safety.',
      parameters: z.object({
        personName: z.string().describe('Name of the person in the relationship'),
        relationshipType: z
          .enum(['partner', 'family', 'friend', 'colleague', 'mentor', 'other'])
          .describe('Type of relationship'),
        specificConcern: z.string().optional().describe('Any specific concern prompting this reflection'),
      }),
      execute: async ({ personName, relationshipType, specificConcern }) => {
        getLogger().info({ agentId: ctx.agentId, personName, relationshipType }, 'Assessing relationship health');

        const dimensions = [
          { name: 'Trust', question: `How much do you trust ${personName}? How much do they trust you?` },
          { name: 'Communication', question: `How openly can you communicate? Are there topics you avoid?` },
          { name: 'Reciprocity', question: `Does the giving and receiving feel balanced over time?` },
          { name: 'Emotional Safety', question: `Can you be vulnerable without fear of judgment?` },
          { name: 'Growth', question: `Does this relationship help you both grow as people?` },
          { name: 'Joy', question: `How often do you feel genuine joy in each other's company?` },
        ];

        let response = `Let's reflect on your relationship with ${personName}. `;
        if (specificConcern) {
          response += `You mentioned: "${specificConcern}" - let's explore that. `;
        }
        response += `\n\nConsider these dimensions:\n`;
        
        dimensions.forEach((d, i) => {
          response += `\n${i + 1}. **${d.name}**: ${d.question}`;
        });

        response += `\n\nWhich of these feels most important to explore right now?`;

        return response;
      },
    });
  },
};

const identifyNeglectedRelationshipsDef: ToolDefinition = {
  id: 'identifyNeglectedRelationships',
  name: 'Identify Neglected Relationships',
  description: 'Gently surface relationships that may need attention or reconnection',
  domain: 'relationships',
  tags: ['relationships', 'awareness', 'reconnection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user recognize relationships they may have unintentionally neglected and explore what reconnection might look like.',
      parameters: z.object({
        timeframe: z.enum(['weeks', 'months', 'years']).describe('How long since meaningful contact'),
        category: z
          .enum(['all', 'family', 'friends', 'mentors', 'old-friends'])
          .optional()
          .describe('Category to focus on'),
      }),
      execute: async ({ timeframe, category }) => {
        getLogger().info({ agentId: ctx.agentId, timeframe, category }, 'Exploring neglected relationships');

        const prompts: Record<string, string> = {
          weeks: "Who haven't you connected with in a few weeks that you'd normally talk to more often?",
          months: "Who comes to mind when you think about people you've lost touch with recently?",
          years: "Is there someone from your past you've been meaning to reach out to but haven't?",
        };

        let response = prompts[timeframe] + '\n\n';
        
        response += `Sometimes life gets busy and connections fade unintentionally. `;
        response += `There's no guilt here - just an invitation to notice.\n\n`;
        
        response += `**Reflection questions:**\n`;
        response += `- Who would be genuinely happy to hear from you?\n`;
        response += `- Is there someone you've been thinking about lately?\n`;
        response += `- What relationship, if nurtured, would add richness to your life?\n\n`;
        
        response += `Would you like to talk about someone specific, or explore what's been getting in the way of connection?`;

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
      description:
        'Suggest thoughtful, personalized ways to connect with or show care for someone specific.',
      parameters: z.object({
        personName: z.string().describe('Name of the person'),
        context: z.string().optional().describe('Any context about them or the situation'),
        effortLevel: z
          .enum(['small-gesture', 'meaningful-effort', 'grand-gesture'])
          .optional()
          .describe('How much effort/energy available'),
      }),
      execute: async ({ personName, context, effortLevel = 'meaningful-effort' }) => {
        getLogger().info({ agentId: ctx.agentId, personName, effortLevel }, 'Suggesting connection actions');

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

const recordMeaningfulMomentDef: ToolDefinition = {
  id: 'recordMeaningfulMoment',
  name: 'Record Meaningful Moment',
  description: 'Capture a meaningful moment shared with someone to remember and cherish',
  domain: 'relationships',
  tags: ['relationships', 'memory', 'meaningful-moments'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user capture and preserve a meaningful moment shared with someone important.',
      parameters: z.object({
        personName: z.string().describe('Person the moment was shared with'),
        moment: z.string().describe('Description of what happened'),
        whyItMatters: z.string().optional().describe('Why this moment felt significant'),
        emotion: z.string().optional().describe('The primary emotion felt'),
      }),
      execute: async ({ personName, moment, whyItMatters, emotion }) => {
        getLogger().info({ agentId: ctx.agentId, personName }, 'Recording meaningful moment');

        let response = `What a gift to pause and capture this moment with ${personName}.\n\n`;
        response += `**The moment:** ${moment}\n`;
        
        if (whyItMatters) {
          response += `**Why it matters:** ${whyItMatters}\n`;
        }
        if (emotion) {
          response += `**What you felt:** ${emotion}\n`;
        }

        response += `\nI'll remember this. These are the moments that make relationships rich.\n\n`;
        response += `Is there anything else about this moment you want to hold onto? Sometimes the small details are what we treasure most later.`;

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
      description:
        'Help the user think through a conflict or tension in a relationship with wisdom and care.',
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
      description:
        'Help the user prepare for a difficult conversation with clarity, courage, and compassion.',
      parameters: z.object({
        personName: z.string().describe('Person you need to talk to'),
        topic: z.string().describe('What the conversation needs to be about'),
        whatYouNeedToSay: z.string().describe('The core message you need to communicate'),
        fear: z.string().optional().describe('What you are afraid might happen'),
      }),
      execute: async ({ personName, topic, whatYouNeedToSay, fear }) => {
        getLogger().info({ agentId: ctx.agentId, personName, topic }, 'Preparing for difficult conversation');

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

const craftApologyDef: ToolDefinition = {
  id: 'craftApology',
  name: 'Craft Apology',
  description: 'Get help crafting a genuine, effective apology',
  domain: 'relationships',
  tags: ['relationships', 'repair', 'apology'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user craft a genuine apology that takes responsibility and opens the door to repair.',
      parameters: z.object({
        personName: z.string().describe('Person to apologize to'),
        whatYouDid: z.string().describe('What you did or said that caused harm'),
        impact: z.string().describe('How it affected them'),
        whatYouUnderstandNow: z.string().optional().describe('What you understand now that you may not have before'),
      }),
      execute: async ({ personName, whatYouDid, impact, whatYouUnderstandNow }) => {
        getLogger().info({ agentId: ctx.agentId, personName }, 'Crafting apology');

        let response = `A genuine apology is a gift to the relationship. Here's a framework:\n\n`;

        response += `**The anatomy of a real apology:**\n\n`;
        response += `1. **Name what you did** (no minimizing): "${whatYouDid}"\n`;
        response += `2. **Acknowledge the impact** (this is key): "${impact}"\n`;
        response += `3. **Take responsibility** (no "but" or excuses): "I'm sorry. That was wrong of me."\n`;
        if (whatYouUnderstandNow) {
          response += `4. **Show growth**: "I understand now that ${whatYouUnderstandNow}"\n`;
        }
        response += `5. **Commit to change**: What will you do differently?\n`;
        response += `6. **Ask, don't demand forgiveness**: "I hope you can forgive me, but I understand if you need time."\n\n`;

        response += `**What NOT to do:**\n`;
        response += `- Don't say "I'm sorry you felt that way" (that's not an apology)\n`;
        response += `- Don't explain your intentions as an excuse\n`;
        response += `- Don't rush them to forgive you\n\n`;

        response += `Would you like help putting this into words you'd actually say to ${personName}?`;

        return response;
      },
    });
  },
};

// ============================================================================
// COMMUNICATION & EXPRESSION TOOLS
// ============================================================================

const expressGratitudeDef: ToolDefinition = {
  id: 'expressGratitude',
  name: 'Express Gratitude',
  description: 'Get help expressing genuine gratitude to someone important',
  domain: 'relationships',
  tags: ['relationships', 'gratitude', 'expression'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user express genuine gratitude to someone in a way that will be meaningful to them.',
      parameters: z.object({
        personName: z.string().describe('Person to express gratitude to'),
        whatFor: z.string().describe('What you are grateful for'),
        impact: z.string().optional().describe('How what they did impacted you'),
      }),
      execute: async ({ personName, whatFor, impact }) => {
        getLogger().info({ agentId: ctx.agentId, personName }, 'Expressing gratitude');

        let response = `Expressing gratitude is one of the most powerful things we can do for a relationship.\n\n`;

        response += `**Making gratitude land:**\n\n`;
        response += `Be specific: "Thank you for ${whatFor}" is more powerful than generic thanks.\n`;
        if (impact) {
          response += `Share the impact: "${impact}" - This lets them know their action mattered.\n`;
        }
        response += `\n**A template:**\n`;
        response += `"${personName}, I want you to know how much it meant to me when you ${whatFor}. `;
        if (impact) {
          response += `${impact}. `;
        }
        response += `I don't want to let that go unacknowledged."\n\n`;

        response += `**Consider:** Would ${personName} prefer to hear this in person, in a note, or another way? What would feel most meaningful to *them*?\n\n`;

        response += `Would you like to say more about what they mean to you? Sometimes gratitude opens the door to deeper appreciation.`;

        return response;
      },
    });
  },
};

const checkInOnSomeoneDef: ToolDefinition = {
  id: 'checkInOnSomeone',
  name: 'Check In On Someone',
  description: 'Get guidance on how to check in on someone who might be struggling',
  domain: 'relationships',
  tags: ['relationships', 'support', 'check-in'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user check in on someone they are concerned about in a supportive, non-intrusive way.',
      parameters: z.object({
        personName: z.string().describe('Person to check in on'),
        concern: z.string().describe('What prompted your concern'),
        relationshipCloseness: z.enum(['very-close', 'close', 'acquaintance']).describe('How close you are'),
      }),
      execute: async ({ personName, concern, relationshipCloseness }) => {
        getLogger().info({ agentId: ctx.agentId, personName, relationshipCloseness }, 'Check in guidance');

        let response = `It's caring of you to want to reach out to ${personName}.\n\n`;
        response += `**Your concern:** ${concern}\n\n`;

        const approaches: Record<string, string[]> = {
          'very-close': [
            `Be direct: "Hey, I've noticed you seem off lately. I care about you - how are you really doing?"`,
            `Show up: Sometimes presence matters more than words. Offer to just be with them.`,
            `Name what you see: "I may be wrong, but you seem like you're carrying something heavy."`,
          ],
          'close': [
            `Open the door gently: "I've been thinking about you. How are things going?"`,
            `Share your care: "I noticed [what you noticed] and wanted you to know I'm here if you want to talk."`,
            `Offer specific help: "Can I bring you dinner this week?" is better than "Let me know if you need anything."`,
          ],
          'acquaintance': [
            `Keep it light but real: "Hey, I just wanted to check in. How are you doing?"`,
            `Reference something specific: "I saw your [post/message/etc] and wanted to see how you're holding up."`,
            `Don't push: Let them know the door is open without demanding they walk through it.`,
          ],
        };

        response += `**Ways to reach out:**\n`;
        approaches[relationshipCloseness].forEach((approach, i) => {
          response += `\n${i + 1}. ${approach}`;
        });

        response += `\n\n**Important:** Don't be offended if they don't open up. Sometimes knowing someone cares is enough. And sometimes people need multiple invitations before they feel safe to share.\n\n`;

        response += `What feels right to you?`;

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
      description:
        'Help the user map out their relationship circles - from innermost intimates to outer acquaintances.',
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

const setRelationshipBoundaryDef: ToolDefinition = {
  id: 'setRelationshipBoundary',
  name: 'Set Relationship Boundary',
  description: 'Get help thinking through and setting a healthy boundary',
  domain: 'relationships',
  tags: ['relationships', 'boundaries', 'self-care'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user think through and articulate a healthy boundary in a relationship.',
      parameters: z.object({
        personName: z.string().describe('Person the boundary is with'),
        situation: z.string().describe('The situation requiring a boundary'),
        whatYouNeed: z.string().describe('What you need to protect or preserve'),
      }),
      execute: async ({ personName, situation, whatYouNeed }) => {
        getLogger().info({ agentId: ctx.agentId, personName }, 'Setting boundary');

        let response = `Boundaries aren't walls - they're clarity about what you need to stay healthy in relationship.\n\n`;
        
        response += `**The situation:** ${situation}\n`;
        response += `**What you need to protect:** ${whatYouNeed}\n\n`;

        response += `**Framing a boundary:**\n\n`;
        response += `1. **Be clear about what you need** (not what they should do): "I need..." rather than "You need to stop..."\n`;
        response += `2. **State it without over-explaining**: You don't have to justify your needs.\n`;
        response += `3. **Be prepared to hold it**: A boundary without follow-through teaches people to ignore you.\n\n`;

        response += `**A template:**\n`;
        response += `"I care about our relationship. And I've realized I need [boundary] to [what it protects]. I hope you can understand."\n\n`;

        response += `**Remember:** Their reaction to your boundary is information about them, not evidence that your boundary is wrong.\n\n`;

        response += `Would you like help finding the specific words for ${personName}?`;

        return response;
      },
    });
  },
};

// ============================================================================
// LOVE LANGUAGES & COMMUNICATION STYLES
// ============================================================================

const understandLoveLanguagesDef: ToolDefinition = {
  id: 'understandLoveLanguages',
  name: 'Understand Love Languages',
  description: 'Explore how you and others give and receive love',
  domain: 'relationships',
  tags: ['relationships', 'love-languages', 'communication'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help the user understand love languages and how to better give and receive love.',
      parameters: z.object({
        mode: z.enum(['discover-mine', 'understand-theirs', 'bridge-gap']).describe('What to explore'),
        personName: z.string().optional().describe('Person to understand better'),
      }),
      execute: async ({ mode, personName }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Understanding love languages');

        let response = '';

        if (mode === 'discover-mine') {
          response = `**The Five Love Languages** (Gary Chapman)\n\n`;
          response += `People feel loved in different ways:\n\n`;
          response += `1. **Words of Affirmation** - Compliments, "I love you", verbal appreciation\n`;
          response += `2. **Acts of Service** - Doing things to help, taking care of tasks\n`;
          response += `3. **Receiving Gifts** - Thoughtful presents, symbols of love\n`;
          response += `4. **Quality Time** - Undivided attention, being fully present\n`;
          response += `5. **Physical Touch** - Hugs, holding hands, physical closeness\n\n`;
          response += `**To discover yours:**\n`;
          response += `- What makes you feel most loved?\n`;
          response += `- What do you complain about most in relationships? (Often the inverse of your language)\n`;
          response += `- What do you request most often?\n\n`;
          response += `Which resonates most strongly with you?`;
        } else if (mode === 'understand-theirs') {
          response = `**Understanding ${personName || "Their"} Love Language**\n\n`;
          response += `Observe what they:\n`;
          response += `- Complain about not getting enough of\n`;
          response += `- Request most often\n`;
          response += `- Do naturally for others (we often give love the way we want to receive it)\n\n`;
          response += `The relationship transforms when you love someone in THEIR language, not just yours.\n\n`;
          response += `What have you noticed about how ${personName || 'they'} show love? What do they seem to crave?`;
        } else {
          response = `**Bridging the Love Language Gap**\n\n`;
          response += `Common scenario: You're giving love in YOUR language, but they're not receiving it because it's not THEIRS.\n\n`;
          response += `Example: You show love through Acts of Service (doing things for them), but they need Words of Affirmation (hearing how you feel).\n\n`;
          response += `**The solution:**\n`;
          response += `- Learn their language and speak it intentionally\n`;
          response += `- Share your language so they can learn to speak it\n`;
          response += `- Appreciate their attempts even if imperfect\n\n`;
          response += `What's the gap between how you give love and how ${personName || 'they'} receive it?`;
        }

        return response;
      },
    });
  },
};

const reconnectAfterTimeDef: ToolDefinition = {
  id: 'reconnectAfterTime',
  name: 'Reconnect After Time',
  description: 'Navigate reconnecting with someone after a long absence',
  domain: 'relationships',
  tags: ['relationships', 'reconnection', 'absence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help navigate reconnecting with someone after significant time apart.',
      parameters: z.object({
        personName: z.string().describe('Person to reconnect with'),
        timePassed: z.string().describe('How long since connection'),
        whyDisconnected: z.string().optional().describe('What caused the disconnection'),
        whatYouWant: z.string().optional().describe('What you hope for from reconnecting'),
      }),
      execute: async ({ personName, timePassed, whyDisconnected, whatYouWant }) => {
        getLogger().info({ agentId: ctx.agentId, personName, timePassed }, 'Reconnecting after time');

        let response = `Reconnecting with ${personName} after ${timePassed}.\n\n`;

        if (whyDisconnected) {
          response += `You drifted because: ${whyDisconnected}\n\n`;
        }

        response += `**The awkwardness is normal.** Most people feel it. Most people are also glad when someone reaches out.\n\n`;

        response += `**Approaches to consider:**\n\n`;
        response += `1. **Keep it simple:** "Hey, I've been thinking about you. How are you?"\n`;
        response += `2. **Acknowledge the time:** "I know it's been a while, and I've been meaning to reach out..."\n`;
        response += `3. **Reference something specific:** A shared memory, something that reminded you of them\n`;
        response += `4. **Be honest if appropriate:** "I'm sorry I let us drift apart"\n\n`;

        response += `**What not to do:**\n`;
        response += `- Over-explain your absence\n`;
        response += `- Pretend no time has passed\n`;
        response += `- Expect them to be exactly the same\n\n`;

        if (whatYouWant) {
          response += `You hope for: ${whatYouWant}\n\n`;
        }

        response += `What feels right? Would you like help crafting what to say?`;

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
      description:
        'Help the user deepen an existing friendship beyond surface-level connection.',
      parameters: z.object({
        personName: z.string().describe('Friend to deepen connection with'),
        currentLevel: z.enum(['acquaintance', 'casual', 'friend', 'close']).describe('Current closeness'),
        barrier: z.string().optional().describe('What seems to keep it surface-level'),
      }),
      execute: async ({ personName, currentLevel, barrier }) => {
        getLogger().info({ agentId: ctx.agentId, personName, currentLevel }, 'Deepening friendship');

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

