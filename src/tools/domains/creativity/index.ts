/**
 * Creativity & Hobbies Domain Tools
 *
 * Tools for supporting creative pursuits, hobby exploration, and joyful activities.
 * This domain nurtures the playful, creative side of life.
 *
 * DOMAIN: creativity
 * TOOLS:
 *   Projects: trackCreativeProject, setCreativeGoal, celebrateCreation
 *   Exploration: exploreNewHobby, suggestHobbyBasedOnInterests
 *   Blocks: navigateCreativeBlock, findInspiration
 *   Habits: buildCreativeHabit
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// HOBBY CATEGORIES
// ============================================================================

const HOBBY_CATEGORIES = {
  creative: {
    name: 'Creative Arts',
    examples: ['painting', 'drawing', 'photography', 'writing', 'music', 'pottery', 'crafts'],
    traits: ['likes expressing themselves', 'enjoys making things', 'appreciates beauty'],
  },
  physical: {
    name: 'Physical Activities',
    examples: ['hiking', 'yoga', 'dancing', 'martial arts', 'rock climbing', 'swimming'],
    traits: ['enjoys movement', 'likes being active', 'wants to be healthier'],
  },
  intellectual: {
    name: 'Mind & Learning',
    examples: ['chess', 'puzzles', 'languages', 'reading', 'history', 'philosophy'],
    traits: ['loves learning', 'enjoys mental challenges', 'curious about the world'],
  },
  social: {
    name: 'Social & Community',
    examples: ['book clubs', 'volunteering', 'sports teams', 'board games', 'cooking clubs'],
    traits: ['enjoys people', 'wants community', 'likes shared experiences'],
  },
  nature: {
    name: 'Nature & Outdoors',
    examples: ['gardening', 'birdwatching', 'camping', 'fishing', 'foraging'],
    traits: ['loves outdoors', 'finds peace in nature', 'interested in natural world'],
  },
  making: {
    name: 'Making & Building',
    examples: ['woodworking', 'electronics', 'sewing', 'knitting', 'model building', 'coding'],
    traits: ['likes working with hands', 'enjoys building things', 'problem solver'],
  },
  collecting: {
    name: 'Collecting & Curating',
    examples: ['vinyl records', 'vintage items', 'art', 'stamps', 'coins', 'books'],
    traits: ['appreciates history', 'enjoys hunting for treasures', 'likes organizing'],
  },
  performance: {
    name: 'Performance',
    examples: ['theater', 'improv', 'stand-up', 'magic', 'DJing'],
    traits: ['enjoys being on stage', 'likes entertaining', 'feeds off energy of others'],
  },
};

// ============================================================================
// CREATIVE PROJECT TOOLS
// ============================================================================

const trackCreativeProjectDef: ToolDefinition = {
  id: 'trackCreativeProject',
  name: 'Track Creative Project',
  description: 'Track progress on creative projects',
  domain: 'creativity',
  tags: ['creativity', 'projects', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help track creative projects and their progress.',
      parameters: z.object({
        action: z.enum(['start', 'update', 'complete', 'review']).describe('What to do'),
        projectName: z.string().describe('Name of the project'),
        medium: z.string().optional().describe('Type of project (writing, art, music, etc.)'),
        update: z.string().optional().describe('Progress update'),
        challenge: z.string().optional().describe('Current challenge'),
      }),
      execute: async ({ action, projectName, medium, update, challenge }) => {
        getLogger().info({ agentId: ctx.agentId, action, projectName }, 'Tracking creative project');

        let response = '';

        if (action === 'start') {
          response = `**New Creative Project Started! 🎨**\n\n`;
          response += `**Project:** ${projectName}\n`;
          if (medium) response += `**Medium:** ${medium}\n`;
          response += `\n---\n\n`;
          response += `Exciting! Starting is often the hardest part.\n\n`;
          response += `**Questions to clarify your vision:**\n`;
          response += `• What's the essence of what you want to create?\n`;
          response += `• What would "done" look like?\n`;
          response += `• What excites you most about this?\n`;
          response += `• What's the smallest first step?\n\n`;
          response += `The first step doesn't have to be good. It just has to exist.`;
        } else if (action === 'update') {
          response = `**Project Update: ${projectName}**\n\n`;
          if (update) response += `${update}\n\n`;
          if (challenge) {
            response += `**Current challenge:** ${challenge}\n\n`;
            response += `Challenges are part of the process. They often signal you're pushing into new territory.\n`;
          }
          response += `Keep going. Progress > perfection.`;
        } else if (action === 'complete') {
          response = `**🎉 Project Complete: ${projectName}**\n\n`;
          response += `You did it! You made something.\n\n`;
          response += `**Take a moment to acknowledge:**\n`;
          response += `• You saw something through to completion\n`;
          response += `• You created something that didn't exist before\n`;
          response += `• Every creative work makes you better\n\n`;
          response += `**Reflection:**\n`;
          response += `• What did you learn?\n`;
          response += `• What would you do differently?\n`;
          response += `• What wants to be created next?`;
        } else {
          response = `**Project Review: ${projectName}**\n\n`;
          response += `Let's check in on this project.\n\n`;
          response += `• How do you feel about it right now?\n`;
          response += `• What's working well?\n`;
          response += `• What's challenging?\n`;
          response += `• Is this still calling to you?\n`;
          response += `• What's the next step?`;
        }

        return response;
      },
    });
  },
};

const setCreativeGoalDef: ToolDefinition = {
  id: 'setCreativeGoal',
  name: 'Set Creative Goal',
  description: 'Set goals for creative pursuits',
  domain: 'creativity',
  tags: ['creativity', 'goals', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help set meaningful creative goals.',
      parameters: z.object({
        goal: z.string().describe('The creative goal'),
        timeframe: z.string().optional().describe('By when'),
        motivation: z.string().optional().describe('Why this matters'),
      }),
      execute: async ({ goal, timeframe, motivation }) => {
        getLogger().info({ agentId: ctx.agentId, goal }, 'Setting creative goal');

        let response = `**Creative Goal: ${goal}**\n\n`;
        if (timeframe) response += `**By:** ${timeframe}\n`;
        if (motivation) response += `**Why:** ${motivation}\n`;
        response += `\n---\n\n`;

        response += `**Making Creative Goals Work:**\n\n`;

        response += `Creative goals are different from productivity goals. They need space for:\n`;
        response += `• Experimentation and "failure"\n`;
        response += `• Iteration and revision\n`;
        response += `• Inspiration (which can't be forced)\n`;
        response += `• Joy (or it's not creative, it's just work)\n\n`;

        response += `**Instead of outcome goals, consider process goals:**\n\n`;
        response += `Rather than: "Write a novel"\n`;
        response += `Try: "Write for 30 minutes daily"\n\n`;
        response += `Rather than: "Become a good painter"\n`;
        response += `Try: "Complete one painting per month"\n\n`;
        response += `**The process IS the goal.** Outcomes follow from showing up.\n\n`;

        response += `---\n\n`;

        response += `**Your goal reframed:**\n`;
        response += `What's a regular practice that would move you toward "${goal}"?`;

        return response;
      },
    });
  },
};

const celebrateCreationDef: ToolDefinition = {
  id: 'celebrateCreation',
  name: 'Celebrate Creation',
  description: 'Acknowledge creative work',
  domain: 'creativity',
  tags: ['creativity', 'celebration', 'acknowledgment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Celebrate creative work and creation.',
      parameters: z.object({
        creation: z.string().describe('What was created'),
        howItFeels: z.string().optional().describe('How they feel about it'),
      }),
      execute: async ({ creation, howItFeels }) => {
        getLogger().info({ agentId: ctx.agentId, creation }, 'Celebrating creation');

        let response = `**You Made Something ✨**\n\n`;
        response += `**Creation:** ${creation}\n`;
        if (howItFeels) response += `**How it feels:** ${howItFeels}\n`;
        response += `\n---\n\n`;

        response += `This deserves acknowledgment.\n\n`;

        response += `**What you did:**\n`;
        response += `• You took something from imagination to reality\n`;
        response += `• You showed up for the creative process\n`;
        response += `• You made something that didn't exist before you made it\n`;
        response += `• You contributed to the world\n\n`;

        response += `**Remember:**\n`;
        response += `• It doesn't have to be "perfect" to be meaningful\n`;
        response += `• Creating is an act of courage\n`;
        response += `• Every creator has work they're not satisfied with\n`;
        response += `• The more you create, the better you get\n\n`;

        response += `What do you want to create next?`;

        return response;
      },
    });
  },
};

// ============================================================================
// HOBBY EXPLORATION TOOLS
// ============================================================================

const exploreNewHobbyDef: ToolDefinition = {
  id: 'exploreNewHobby',
  name: 'Explore New Hobby',
  description: 'Discover new hobbies and interests',
  domain: 'creativity',
  tags: ['creativity', 'hobbies', 'exploration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user explore and discover new hobbies.',
      parameters: z.object({
        currentInterests: z.array(z.string()).optional().describe('Current interests'),
        constraints: z.array(z.string()).optional().describe('Constraints (budget, space, time)'),
        seeking: z.enum(['relaxation', 'challenge', 'social', 'physical', 'creative', 'any']).optional(),
      }),
      execute: async ({ currentInterests, constraints, seeking }) => {
        getLogger().info({ agentId: ctx.agentId, seeking }, 'Exploring new hobby');

        let response = `**Exploring New Hobbies**\n\n`;
        if (currentInterests?.length) response += `**Current interests:** ${currentInterests.join(', ')}\n`;
        if (seeking) response += `**Seeking:** ${seeking}\n`;
        if (constraints?.length) response += `**Constraints:** ${constraints.join(', ')}\n`;
        response += `\n---\n\n`;

        response += `**Hobby Categories to Explore:**\n\n`;

        Object.entries(HOBBY_CATEGORIES).forEach(([key, category]) => {
          response += `**${category.name}**\n`;
          response += `Examples: ${category.examples.slice(0, 4).join(', ')}\n`;
          response += `Good if you: ${category.traits[0]}\n\n`;
        });

        response += `---\n\n`;

        response += `**How to Start a New Hobby:**\n\n`;
        response += `1. **Try before you commit** - Borrow equipment, take intro class\n`;
        response += `2. **Start minimal** - Don't buy everything until you know you love it\n`;
        response += `3. **Find community** - Hobbies are more fun with others\n`;
        response += `4. **Give it time** - New things feel awkward at first\n`;
        response += `5. **It's okay to quit** - Not every hobby is for everyone\n\n`;

        response += `What category appeals to you?`;

        return response;
      },
    });
  },
};

const suggestHobbyBasedOnInterestsDef: ToolDefinition = {
  id: 'suggestHobbyBasedOnInterests',
  name: 'Suggest Hobby Based On Interests',
  description: 'Match hobbies to personality and interests',
  domain: 'creativity',
  tags: ['creativity', 'hobbies', 'suggestions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Suggest hobbies based on personality and preferences.',
      parameters: z.object({
        preferences: z.object({
          alone_or_social: z.enum(['alone', 'social', 'both']),
          indoor_or_outdoor: z.enum(['indoor', 'outdoor', 'both']),
          physical_or_mental: z.enum(['physical', 'mental', 'both']),
          structured_or_freeform: z.enum(['structured', 'freeform', 'both']),
        }).describe('Preferences'),
        budget: z.enum(['free', 'low', 'medium', 'any']).optional(),
        timePerWeek: z.string().optional(),
      }),
      execute: async ({ preferences, budget, timePerWeek }) => {
        getLogger().info({ agentId: ctx.agentId, preferences }, 'Suggesting hobby');

        let response = `**Personalized Hobby Suggestions**\n\n`;
        response += `Based on your preferences:\n`;
        response += `• ${preferences.alone_or_social} activities\n`;
        response += `• ${preferences.indoor_or_outdoor}\n`;
        response += `• ${preferences.physical_or_mental}\n`;
        response += `• ${preferences.structured_or_freeform}\n`;
        if (budget) response += `• Budget: ${budget}\n`;
        if (timePerWeek) response += `• Time: ${timePerWeek}/week\n`;
        response += `\n---\n\n`;

        response += `**Top Suggestions:**\n\n`;

        // Match based on preferences
        const suggestions: string[] = [];

        if (preferences.alone_or_social === 'alone' && preferences.indoor_or_outdoor === 'indoor') {
          if (preferences.physical_or_mental === 'mental') {
            suggestions.push('Writing/journaling', 'Learning an instrument', 'Coding projects', 'Puzzles/strategy games');
          } else {
            suggestions.push('Yoga', 'Home workouts', 'Indoor climbing');
          }
        } else if (preferences.alone_or_social === 'social') {
          if (preferences.indoor_or_outdoor === 'outdoor') {
            suggestions.push('Hiking groups', 'Team sports', 'Running clubs', 'Outdoor photography clubs');
          } else {
            suggestions.push('Board game groups', 'Book clubs', 'Improv classes', 'Cooking classes');
          }
        }

        if (preferences.structured_or_freeform === 'structured') {
          suggestions.push('Language learning', 'Martial arts', 'Dance classes');
        } else {
          suggestions.push('Creative writing', 'Sketching', 'Music jamming', 'Freestyle dance');
        }

        // Add some variety
        if (budget === 'free' || budget === 'low') {
          suggestions.push('Walking/hiking', 'Meditation', 'Drawing', 'Free online courses');
        }

        // Remove duplicates and show
        [...new Set(suggestions)].slice(0, 8).forEach((suggestion, i) => {
          response += `${i + 1}. **${suggestion}**\n`;
        });

        response += `\n---\n\n`;
        response += `Any of these spark interest? I can tell you more about how to get started.`;

        return response;
      },
    });
  },
};

// ============================================================================
// CREATIVE BLOCK TOOLS
// ============================================================================

const navigateCreativeBlockDef: ToolDefinition = {
  id: 'navigateCreativeBlock',
  name: 'Navigate Creative Block',
  description: 'Help overcome creative blocks',
  domain: 'creativity',
  tags: ['creativity', 'blocks', 'obstacles'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help overcome creative blocks and resistance.',
      parameters: z.object({
        blockType: z.enum([
          'blank-page',
          'perfectionism',
          'comparison',
          'fear-of-judgment',
          'lost-motivation',
          'stuck-on-project',
          'general',
        ]).describe('Type of creative block'),
        project: z.string().optional().describe('Related project'),
      }),
      execute: async ({ blockType, project }) => {
        getLogger().info({ agentId: ctx.agentId, blockType }, 'Navigating creative block');

        let response = `**Navigating Creative Block: ${blockType}**\n`;
        if (project) response += `_Project: ${project}_\n`;
        response += `\n---\n\n`;

        const advice: Record<string, string> = {
          'blank-page':
            `**The Blank Page Terror**\n\n` +
            `The blank page is intimidating because anything is possible - and that freedom is paralyzing.\n\n` +
            `**Strategies:**\n` +
            `• **Lower the stakes:** This doesn't have to be good. Just start.\n` +
            `• **Add constraints:** Constraints paradoxically increase creativity\n` +
            `• **Start in the middle:** Skip the beginning, write scene 3\n` +
            `• **Bad first draft:** Write the worst version on purpose\n` +
            `• **Brain dump:** Just get ideas out, no editing\n` +
            `• **Time limit:** "I'll just do 10 minutes"\n\n` +
            `The blank page can't be fixed. A bad page can.`,

          perfectionism:
            `**Perfectionism: The Creativity Killer**\n\n` +
            `Perfectionism masquerades as high standards but is really fear in disguise.\n\n` +
            `**Reframes:**\n` +
            `• Done is better than perfect\n` +
            `• Perfection doesn't exist\n` +
            `• You can always revise later\n` +
            `• Quantity leads to quality (make more things)\n` +
            `• Your favorite creators have "failures"\n\n` +
            `**Permission slips:**\n` +
            `• "This draft can be garbage"\n` +
            `• "I'm just playing around"\n` +
            `• "No one has to see this"\n` +
            `• "This is practice, not performance"`,

          comparison:
            `**The Comparison Trap**\n\n` +
            `You're comparing your messy process to someone else's polished output.\n\n` +
            `**Reality checks:**\n` +
            `• You don't see their struggles, drafts, failures\n` +
            `• They have years more practice (probably)\n` +
            `• Their style isn't your style (and shouldn't be)\n` +
            `• Even they don't like some of their work\n\n` +
            `**The only useful comparison:**\n` +
            `Are you better than you were 6 months ago?\n\n` +
            `Comparison is information, not judgment. Learn from others without measuring yourself against them.`,

          'fear-of-judgment':
            `**Fear of What Others Will Think**\n\n` +
            `This fear keeps so much creative work locked inside people.\n\n` +
            `**Truth bombs:**\n` +
            `• Most people are too busy with their own stuff to judge you\n` +
            `• Some people will dislike your work. That's universal.\n` +
            `• The people who matter will support your creative efforts\n` +
            `• Criticism of your work isn't criticism of you\n` +
            `• You don't have to share everything\n\n` +
            `**Options:**\n` +
            `• Create privately first\n` +
            `• Share with one trusted person\n` +
            `• Post anonymously\n` +
            `• Remember: creating takes courage others don't have`,

          'lost-motivation':
            `**Lost Motivation**\n\n` +
            `Motivation comes and goes. The pros show up anyway.\n\n` +
            `**Strategies:**\n` +
            `• **Don't wait for inspiration:** Work creates inspiration, not vice versa\n` +
            `• **Remember why you started:** What drew you to this?\n` +
            `• **Make it tiny:** Just 5 minutes. Just one sentence.\n` +
            `• **Change the context:** New location, new time, new approach\n` +
            `• **Take a break:** Sometimes rest is what's needed\n` +
            `• **Connect with community:** Other creators understand\n\n` +
            `Is this a temporary dip or a sign this project isn't for you?`,

          'stuck-on-project':
            `**Stuck on a Specific Project**\n\n` +
            `Sometimes we need to push through. Sometimes we need to step back.\n\n` +
            `**Try these:**\n` +
            `• **Skip ahead:** Work on a different part\n` +
            `• **Change medium:** Sketch instead of write, etc.\n` +
            `• **Talk it out:** Explain the problem aloud\n` +
            `• **Get feedback:** Fresh eyes see new things\n` +
            `• **Sleep on it:** Literally. Your brain works while you sleep.\n` +
            `• **Take a break:** Work on something else entirely\n` +
            `• **Kill your darlings:** Is something you love actually the problem?\n\n` +
            `What specifically is stuck?`,

          general:
            `**General Creative Block**\n\n` +
            `Creative blocks are normal. Every creator experiences them.\n\n` +
            `**Quick exercises:**\n` +
            `• Set a timer for 15 minutes and create anything\n` +
            `• Copy something you admire (for practice, not sharing)\n` +
            `• Change your environment completely\n` +
            `• Consume inspiring work in your medium\n` +
            `• Create something intentionally bad/silly\n\n` +
            `What's blocking you specifically?`,
        };

        response += advice[blockType];

        return response;
      },
    });
  },
};

const findInspirationDef: ToolDefinition = {
  id: 'findInspiration',
  name: 'Find Inspiration',
  description: 'Sources of creative inspiration',
  domain: 'creativity',
  tags: ['creativity', 'inspiration', 'ideas'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help find sources of creative inspiration.',
      parameters: z.object({
        medium: z.string().optional().describe('Creative medium'),
        mood: z.enum(['energized', 'contemplative', 'playful', 'any']).optional(),
      }),
      execute: async ({ medium, mood }) => {
        getLogger().info({ agentId: ctx.agentId, medium, mood }, 'Finding inspiration');

        let response = `**Finding Inspiration**\n`;
        if (medium) response += `_For: ${medium}_\n`;
        response += `\n---\n\n`;

        response += `**Sources of Inspiration:**\n\n`;

        response += `**🚶 Change your environment**\n`;
        response += `• Walk without destination\n`;
        response += `• Visit somewhere new\n`;
        response += `• Observe people in public spaces\n`;
        response += `• Explore nature\n\n`;

        response += `**📚 Cross-pollinate**\n`;
        response += `• Explore art/media outside your usual genre\n`;
        response += `• Read about a topic you know nothing about\n`;
        response += `• Attend events outside your field\n`;
        response += `• Combine unrelated ideas\n\n`;

        response += `**🎨 Consume great work**\n`;
        response += `• Museums and galleries\n`;
        response += `• Concerts and performances\n`;
        response += `• Read the masters in your medium\n`;
        response += `• Study what you admire (closely, actively)\n\n`;

        response += `**💭 Inner exploration**\n`;
        response += `• Morning pages (stream of consciousness writing)\n`;
        response += `• Meditation\n`;
        response += `• Dream journaling\n`;
        response += `• Ask "What if...?"\n\n`;

        response += `**👥 Connect with others**\n`;
        response += `• Creative communities\n`;
        response += `• Collaboration\n`;
        response += `• Conversations with interesting people\n`;
        response += `• Share work and get feedback\n\n`;

        response += `**✨ Play**\n`;
        response += `• Create without agenda\n`;
        response += `• Try something you'll be bad at\n`;
        response += `• Set ridiculous constraints\n`;
        response += `• Make something intentionally weird\n\n`;

        response += `---\n\n`;
        response += `Inspiration is everywhere - but you have to be open to seeing it.`;

        return response;
      },
    });
  },
};

// ============================================================================
// CREATIVE HABIT TOOL
// ============================================================================

const buildCreativeHabitDef: ToolDefinition = {
  id: 'buildCreativeHabit',
  name: 'Build Creative Habit',
  description: 'Build consistent creative practice',
  domain: 'creativity',
  tags: ['creativity', 'habits', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help build a consistent creative practice.',
      parameters: z.object({
        medium: z.string().describe('Creative medium'),
        currentPractice: z.string().optional().describe('Current practice level'),
        desiredPractice: z.string().optional().describe('Desired practice level'),
      }),
      execute: async ({ medium, currentPractice, desiredPractice }) => {
        getLogger().info({ agentId: ctx.agentId, medium }, 'Building creative habit');

        let response = `**Building a Creative Practice: ${medium}**\n\n`;
        if (currentPractice) response += `**Currently:** ${currentPractice}\n`;
        if (desiredPractice) response += `**Goal:** ${desiredPractice}\n`;
        response += `\n---\n\n`;

        response += `**The Power of Daily Creative Practice:**\n\n`;
        response += `• Stephen King writes every day, no exceptions\n`;
        response += `• Most successful artists have daily practices\n`;
        response += `• Quantity leads to quality (produce more to get better)\n`;
        response += `• Showing up matters more than "being inspired"\n\n`;

        response += `**How to Build the Habit:**\n\n`;

        response += `**1. Start tiny**\n`;
        response += `• 10 minutes is a real practice\n`;
        response += `• The habit of showing up matters more than duration\n`;
        response += `• Build up gradually\n\n`;

        response += `**2. Same time, same place**\n`;
        response += `• Morning is often best (before life gets in the way)\n`;
        response += `• Link to existing habit (after coffee, before email)\n`;
        response += `• Create a dedicated space if possible\n\n`;

        response += `**3. Remove friction**\n`;
        response += `• Materials ready and accessible\n`;
        response += `• No setup required to start\n`;
        response += `• Protect this time fiercely\n\n`;

        response += `**4. Track but don't judge**\n`;
        response += `• Mark your calendar when you show up\n`;
        response += `• Don't evaluate the work, just the showing up\n`;
        response += `• Streaks motivate but don't be derailed by breaks\n\n`;

        response += `**5. Embrace "bad" work**\n`;
        response += `• Not every session produces gold\n`;
        response += `• Bad work is part of the path to good work\n`;
        response += `• The practice itself is the point\n\n`;

        response += `---\n\n`;
        response += `What's the smallest creative commitment you could make daily?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const creativityTools: ToolDefinition[] = [
  // Projects
  trackCreativeProjectDef,
  setCreativeGoalDef,
  celebrateCreationDef,
  // Exploration
  exploreNewHobbyDef,
  suggestHobbyBasedOnInterestsDef,
  // Blocks
  navigateCreativeBlockDef,
  findInspirationDef,
  // Habits
  buildCreativeHabitDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'creativity',
  creativityTools
);

export default getToolDefinitions;

