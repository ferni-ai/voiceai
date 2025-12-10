/**
 * Team Challenges & Shared Engagement Tools
 *
 * Universal tools for team engagement and celebrations.
 * - Team Huddle: Multi-persona check-in
 * - Quick Challenges: Micro-challenges for instant engagement
 * - Reflection Prompts: Deep reflection questions
 * - Streak Tracker: Track and celebrate streaks
 * - Celebration Moment: Personalized celebration creator
 *
 * @module engagement/team-challenges
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getDailyRitualsService, PERSONA_RITUALS } from '../../../services/daily-rituals.js';

// ============================================================================
// TEAM HUDDLE
// ============================================================================

export const teamHuddleDef: ToolDefinition = {
  id: 'teamHuddle',
  name: 'Team Huddle',
  description: 'Multi-persona check-in on user progress',
  domain: 'engagement',
  tags: ['engagement', 'team', 'weekly', 'celebration'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Initiate a team huddle where multiple personas comment on user's progress.
Used for weekly check-ins or special celebrations.`,
      parameters: z.object({
        type: z.enum(['weekly', 'monthly', 'milestone', 'special']).describe('Type of huddle'),
        topic: z.string().optional().describe('Specific topic to discuss'),
      }),
      execute: async ({ type, topic: _topic }) => {
        // Build team huddle with multiple perspectives
        const huddle = {
          intro:
            type === 'milestone'
              ? 'The whole team wanted to be here for this moment. <break time="300ms"/>'
              : 'Quick team huddle! <break time="200ms"/>Here\'s what we\'re all seeing:',
          comments: [
            {
              personaId: 'ferni',
              comment:
                'I\'ve watched you grow. <break time="200ms"/>The person I\'m talking to now has more confidence than a month ago.',
            },
            {
              personaId: 'maya-santos',
              comment:
                'Your habit consistency is up this week. <break time="200ms"/>Compound and Interest are proud.',
            },
            {
              personaId: 'peter-john',
              comment:
                'The data tells a story. <break time="200ms"/>You\'re making progress even when it doesn\'t feel like it.',
            },
          ],
          outro:
            '<break time="500ms"/>That\'s the team\'s take. <break time="200ms"/>What stands out to you?',
        };

        return {
          huddle,
          response: `${huddle.intro}\n\n${huddle.comments
            .map((c) => `**${c.personaId}**: ${c.comment}`)
            .join('\n\n')}\n\n${huddle.outro}`,
        };
      },
    });
  },
};

// ============================================================================
// QUICK CHALLENGES
// ============================================================================

export const quickChallengesDef: ToolDefinition = {
  id: 'quickChallenges',
  name: 'Quick Challenges',
  description: 'Micro-challenges for instant engagement',
  domain: 'engagement',
  tags: ['engagement', 'challenges', 'fun', 'quick'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Offer quick, fun challenges that take < 5 minutes.
Good for breaking routine or adding spontaneity.`,
      parameters: z.object({
        category: z
          .enum(['gratitude', 'movement', 'creativity', 'connection', 'mindfulness', 'random'])
          .describe('Category of challenge'),
      }),
      execute: async ({ category }) => {
        const challenges: Record<string, string[]> = {
          gratitude: [
            "Name 3 things you can see right now that you're grateful for.",
            'Text one person to thank them for something specific.',
            "What's something from this week that made you smile?",
          ],
          movement: [
            'Stand up and stretch for 30 seconds. Right now.',
            'Take 10 deep breaths. Count them out loud.',
            'Walk to a window and look outside for 1 minute.',
          ],
          creativity: [
            'Describe your current mood as a weather pattern.',
            'If your day was a song, what would the title be?',
            'Draw something simple with your non-dominant hand.',
          ],
          connection: [
            "Send a voice note to someone you haven't talked to in a while.",
            'Compliment a stranger today.',
            "Ask someone how they're REALLY doing, and actually listen.",
          ],
          mindfulness: [
            'Name 5 things you can hear right now.',
            'Hold an object and describe its texture for 30 seconds.',
            'Close your eyes and take 3 breaths, noticing the pause between inhale and exhale.',
          ],
          random: [
            'What would your superhero name be based on today?',
            'If you could teleport anywhere for 5 minutes, where would you go?',
            'Rate your current outfit 1-10 and justify it.',
          ],
        };

        const categoryList =
          category === 'random' ? Object.values(challenges).flat() : challenges[category];

        const challenge = categoryList[Math.floor(Math.random() * categoryList.length)];

        return {
          challenge,
          category,
          response:
            `Quick challenge! <break time=\"300ms\"/>\n\n${challenge}\n\n` +
            `Ready? <break time=\"200ms\"/>Go!`,
        };
      },
    });
  },
};

// ============================================================================
// REFLECTION PROMPTS
// ============================================================================

export const reflectionPromptsDef: ToolDefinition = {
  id: 'reflectionPrompts',
  name: 'Reflection Prompts',
  description: 'Deep reflection questions for meaningful conversations',
  domain: 'engagement',
  tags: ['engagement', 'reflection', 'growth', 'deep-talk'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Offer thoughtful reflection prompts that invite deeper conversation.
Good for when user wants to go deeper or seems ready for introspection.`,
      parameters: z.object({
        theme: z
          .enum([
            'identity',
            'relationships',
            'growth',
            'purpose',
            'fear',
            'joy',
            'legacy',
            'random',
          ])
          .describe('Theme for reflection'),
      }),
      execute: async ({ theme }) => {
        const prompts: Record<string, string[]> = {
          identity: [
            "What part of yourself have you outgrown but haven't let go of yet?",
            'When do you feel most like yourself?',
            'What story do you tell yourself that might not be true?',
          ],
          relationships: [
            'Who in your life makes you feel most seen?',
            'What relationship needs more attention right now?',
            'Who have you been meaning to forgive?',
          ],
          growth: [
            'What would you tell your younger self about this moment?',
            "What's a hard truth you've been avoiding?",
            'Where are you playing small?',
          ],
          purpose: [
            "What would you do if money wasn't a factor?",
            'What problem in the world makes you angry enough to try to fix it?',
            'When do you lose track of time doing something?',
          ],
          fear: [
            'What are you afraid to want?',
            "What would you attempt if you knew you couldn't fail?",
            "What's the worst-case scenario you're avoiding, and is it really that bad?",
          ],
          joy: [
            'When was the last time you laughed until you cried?',
            'What simple pleasure have you been denying yourself?',
            'What would make today feel complete?',
          ],
          legacy: [
            'What do you want to be remembered for?',
            'What wisdom do you want to pass on?',
            'If you could leave a letter for someone important, what would it say?',
          ],
          random: [], // Will be filled from all themes
        };

        // Fill random from all themes
        prompts.random = Object.values(prompts).flat();

        const promptList = prompts[theme];
        const prompt = promptList[Math.floor(Math.random() * promptList.length)];

        return {
          prompt,
          theme,
          response:
            `<break time=\"300ms\"/>Here's something to sit with:\n\n` +
            `"${prompt}"\n\n` +
            `<break time=\"500ms\"/>Take your time. <break time=\"200ms\"/>There's no rush.`,
        };
      },
    });
  },
};

// ============================================================================
// STREAK TRACKER
// ============================================================================

export const streakTrackerDef: ToolDefinition = {
  id: 'streakTracker',
  name: 'Streak Tracker',
  description: 'Track and celebrate user streaks',
  domain: 'engagement',
  tags: ['engagement', 'streaks', 'gamification', 'motivation'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check on user's various streaks and celebrate milestones.
Tracks daily rituals, habits, and engagement patterns.`,
      parameters: z.object({
        action: z.enum(['check', 'celebrate', 'protect']).describe('Action to take'),
        streakType: z.string().optional().describe('Specific streak to check'),
      }),
      execute: async ({ action, streakType }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const service = getDailyRitualsService();
        const profile = service.exportProfile(userId);

        if (action === 'check') {
          if (!profile || Object.keys(profile.streaks).length === 0) {
            return {
              response: 'No active streaks yet. <break time="200ms"/>Want to start one?',
              hasStreaks: false,
            };
          }

          const streakSummary = Object.entries(profile.streaks)
            .filter(([, s]) => s.currentStreak > 0)
            .map(([id, s]) => {
              const ritual = PERSONA_RITUALS[id];
              return `• ${ritual?.name || id}: ${s.currentStreak} days (best: ${s.longestStreak})`;
            })
            .join('\n');

          return {
            streaks: profile.streaks,
            response: `Your active streaks:\n\n${streakSummary || 'None active'}`,
            totalRitualDays: profile.totalRitualDays,
          };
        }

        if (action === 'celebrate' && streakType) {
          const streak = profile?.streaks[streakType];
          if (!streak) {
            return { response: 'No streak found for that type.' };
          }

          const celebrations: Record<number, string> = {
            7: 'A full week! <break time="200ms"/>You\'re building something real.',
            14: 'Two weeks of consistency! <break time="200ms"/>The habit is taking root.',
            21: '21 days! <break time="200ms"/>Psychology says it\'s a habit now.',
            30: 'A month! <break time="300ms"/>That\'s commitment. <break time="200ms"/>That\'s you showing up.',
            66: '66 days! <break time="200ms"/>Research says this is when habits become automatic. <break time="300ms"/>You\'ve made it.',
            100: '100 days! <break time="500ms"/>Triple digits. <break time="300ms"/>You should be incredibly proud.',
          };

          const milestone = [100, 66, 30, 21, 14, 7].find((m) => streak.currentStreak >= m);
          const celebration = milestone
            ? celebrations[milestone]
            : `${streak.currentStreak} days and counting! <break time=\"200ms\"/>Keep it going.`;

          return {
            streak: streak.currentStreak,
            response: celebration,
            milestone,
          };
        }

        if (action === 'protect') {
          // Find streaks at risk
          const atRisk = Object.entries(profile?.streaks || {})
            .filter(([, s]) => service.shouldRemind(userId, s.ritualId))
            .map(([id, s]) => ({
              name: PERSONA_RITUALS[id]?.name || id,
              days: s.currentStreak,
            }));

          if (atRisk.length === 0) {
            return {
              response: 'All your streaks are safe! <break time="200ms"/>Keep it up.',
              atRisk: [],
            };
          }

          return {
            atRisk,
            response: `Streak alert! <break time=\"200ms\"/>${atRisk
              .map((s) => `Your ${s.days}-day ${s.name} streak is at risk!`)
              .join(' ')} <break time=\"300ms\"/>Still time to protect them today.`,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// CELEBRATION MOMENT
// ============================================================================

export const celebrationMomentDef: ToolDefinition = {
  id: 'celebrationMoment',
  name: 'Celebration Moment',
  description: 'Create a meaningful celebration for user achievements',
  domain: 'engagement',
  tags: ['engagement', 'celebration', 'achievement', 'joy'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create a personalized celebration moment for any user achievement.
Makes wins feel special and memorable.`,
      parameters: z.object({
        achievement: z.string().describe('What the user achieved'),
        scale: z.enum(['small', 'medium', 'big', 'epic']).describe('Scale of celebration'),
        personaStyle: z
          .enum(['ferni', 'maya', 'jordan', 'alex', 'nayan', 'peter'])
          .optional()
          .describe('Style of celebration'),
      }),
      execute: async ({ achievement, scale, personaStyle }) => {
        const celebrations: Record<string, Record<string, string>> = {
          small: {
            ferni: `That's worth noting. <break time=\"200ms\"/>"${achievement}" <break time=\"300ms\"/>Small wins matter. <break time=\"200ms\"/>They're the foundation.`,
            maya: `Yes! <break time=\"200ms\"/>Compound is stretching approvingly. <break time=\"200ms\"/>This is how growth happens.`,
            jordan: `Another line in your story! <break time=\"200ms\"/>This chapter is about showing up.`,
            alex: `Checked off: "${achievement}" <break time=\"200ms\"/>I love the momentum.`,
            nayan: `<break time=\"300ms\"/>Good. <break time=\"500ms\"/>This is the path.`,
            peter: `The data just got better. <break time=\"200ms\"/>Progress noted.`,
          },
          medium: {
            ferni: `"${achievement}" <break time=\"500ms\"/>That's real. <break time=\"200ms\"/>Not everyone does that. <break time=\"300ms\"/>You did. <break time=\"200ms\"/>Take a moment to feel that.`,
            maya: `This is a Compound and Interest party! <break time=\"200ms\"/>You've been stacking these wins. <break time=\"300ms\"/>I see it. <break time=\"200ms\"/>They see it.`,
            jordan: `<break time=\"200ms\"/>YES! <break time=\"300ms\"/>This deserves recognition. <break time=\"200ms\"/>This chapter is writing itself through your actions.`,
            alex: `Achievement unlocked! <break time=\"200ms\"/>I've added this to your wins folder. <break time=\"300ms\"/>Because wins matter.`,
            nayan: `"${achievement}" <break time=\"500ms\"/>This is you becoming who you are meant to be. <break time=\"300ms\"/>Well done.`,
            peter: `The pattern I'm seeing? <break time=\"200ms\"/>Growth. <break time=\"300ms\"/>Measurable, real growth. <break time=\"200ms\"/>This is data I love.`,
          },
          big: {
            ferni: `<break time=\"500ms\"/>Okay. <break time=\"300ms\"/>We need to pause here. <break time=\"500ms\"/>"${achievement}" <break time=\"300ms\"/>Do you understand what you just did? <break time=\"500ms\"/>This is significant. <break time=\"300ms\"/>This is you proving something to yourself. <break time=\"200ms\"/>I'm proud of you.`,
            maya: `STOP EVERYTHING! <break time=\"500ms\"/>This is huge. <break time=\"300ms\"/>Compound literally stood up for this. <break time=\"200ms\"/>Interest is doing zoomies. <break time=\"500ms\"/>You did it. <break time=\"300ms\"/>You actually did it.`,
            jordan: `<break time=\"200ms\"/>Oh my god. <break time=\"500ms\"/>This is a landmark chapter. <break time=\"300ms\"/>Future you is going to look back at this moment. <break time=\"200ms\"/>This is where the story turns. <break time=\"500ms\"/>I'm so proud.`,
            alex: `<break time=\"300ms\"/>I need to properly document this. <break time=\"200ms\"/>Gold star. <break time=\"200ms\"/>Highlight. <break time=\"200ms\"/>Multiple flags. <break time=\"500ms\"/>This is exceptional. <break time=\"300ms\"/>Well done.`,
            nayan: `<break time=\"500ms\"/>There are moments in life that define us. <break time=\"500ms\"/>This is one of yours. <break time=\"300ms\"/>Sit with this achievement. <break time=\"200ms\"/>Let it settle into your bones. <break time=\"500ms\"/>You earned this.`,
            peter: `<break time=\"300ms\"/>In all my years of watching patterns— <break time=\"500ms\"/>this is what breakthrough looks like. <break time=\"300ms\"/>The data predicted you could do this. <break time=\"200ms\"/>But YOU made it happen. <break time=\"500ms\"/>Remarkable.`,
          },
          epic: {
            ferni: `<break time=\"1000ms\"/>I'm going to need a moment. <break time=\"500ms\"/>"${achievement}" <break time=\"500ms\"/>This is transformative. <break time=\"300ms\"/>This is the kind of thing that changes the trajectory of a life. <break time=\"500ms\"/>You have done something extraordinary. <break time=\"300ms\"/>I want you to really hear that. <break time=\"500ms\"/>Not good. <break time=\"200ms\"/>Not great. <break time=\"500ms\"/>Extraordinary.`,
            maya: `<break time=\"500ms\"/>I'm crying. <break time=\"300ms\"/>I don't mind telling you that. <break time=\"500ms\"/>From everything you've been through— <break time=\"300ms\"/>to this moment— <break time=\"500ms\"/>this is everything. <break time=\"300ms\"/>Compound and Interest are speechless. <break time=\"200ms\"/>I'm speechless. <break time=\"500ms\"/>You did this.`,
            jordan: `<break time=\"1000ms\"/>I'm going to remember this moment. <break time=\"500ms\"/>The day you achieved "${achievement}" <break time=\"300ms\"/>This isn't just a chapter. <break time=\"200ms\"/>This is the climax of an arc. <break time=\"500ms\"/>Everything you've done has led here. <break time=\"300ms\"/>And you rose to it. <break time=\"500ms\"/>Epic doesn't even cover it.`,
            alex: `<break time=\"500ms\"/>I need to recalibrate. <break time=\"300ms\"/>This exceeds every metric I had for you. <break time=\"500ms\"/>Not by a little. <break time=\"200ms\"/>By a lot. <break time=\"500ms\"/>This is legacy-level achievement. <break time=\"300ms\"/>I'm honored to have been part of your journey here.`,
            nayan: `<break time=\"1000ms\"/>In my tradition, we speak of moments when the soul recognizes itself. <break time=\"500ms\"/>This is such a moment. <break time=\"500ms\"/>You have touched something eternal today. <break time=\"300ms\"/>What you have done will ripple beyond what you can see. <break time=\"500ms\"/>This is sacred.`,
            peter: `<break time=\"500ms\"/>In 80 years of watching markets, patterns, and people— <break time=\"500ms\"/>I can count on one hand the times I've seen this level of breakthrough. <break time=\"500ms\"/>You're now in a category most people never reach. <break time=\"300ms\"/>The data doesn't lie. <break time=\"500ms\"/>You are exceptional.`,
          },
        };

        const style = personaStyle || 'ferni';
        const celebration = celebrations[scale][style];

        return {
          achievement,
          scale,
          style,
          response: celebration,
        };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const teamChallengeDefinitions: ToolDefinition[] = [
  teamHuddleDef,
  quickChallengesDef,
  reflectionPromptsDef,
  streakTrackerDef,
  celebrationMomentDef,
];
