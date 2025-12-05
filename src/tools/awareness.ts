/**
 * Awareness Tools
 *
 * Tools for context awareness, conversation management, and intelligent
 * topic suggestions based on user profile and conversation history.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import type { SessionServices } from '../services/index.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UserData {
  name?: string;
  userId?: string;
  services?: SessionServices;
  topics?: string[];
  emotionalState?: string;
  keyMoments?: string[];
  turnCount?: number;
}

// ============================================================================
// AWARENESS TOOLS
// ============================================================================

/**
 * Create all context-awareness tools
 */
export function createAwarenessTools() {
  return {
    // Detect conversation drift
    detectConversationDrift: llm.tool({
      description:
        'Detect if the conversation has drifted from the main topic and suggest refocusing. Use when conversation seems to be wandering.',
      parameters: z.object({
        currentTopic: z.string().describe('What we seem to be discussing now'),
        originalTopic: z.string().optional().describe('What we started discussing'),
      }),
      execute: async ({ currentTopic, originalTopic }, { ctx }) => {
        getLogger().info(`Checking for drift: ${currentTopic} vs ${originalTopic}`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services) {
          const context = services.getPromptContext();

          // Check if we've drifted
          if (originalTopic && currentTopic !== originalTopic) {
            return {
              hasDrifted: true,
              suggestion: `We started talking about ${originalTopic} but now we're on ${currentTopic}. Should we get back to ${originalTopic}, or is ${currentTopic} more important right now?`,
            };
          }

          // Check for open topics that might need attention
          if (context.topicsToCircleBack && context.topicsToCircleBack.length > 2) {
            return {
              hasDrifted: true,
              suggestion: `We've touched on several things: ${context.topicsToCircleBack.join(', ')}. Want to focus on one of these?`,
            };
          }
        }

        return {
          hasDrifted: false,
          suggestion: null,
        };
      },
    }),

    // Suggest a relevant topic
    suggestRelevantTopic: llm.tool({
      description:
        'Suggest a relevant topic based on user profile, interests, and conversation history.',
      parameters: z.object({
        context: z.string().optional().describe('Current conversation context'),
      }),
      execute: async ({ context }, { ctx }) => {
        getLogger().info('Suggesting relevant topic');

        const userData = ctx.userData as UserData;
        const { services } = userData;

        // Check user profile for interests
        if (services?.userProfile) {
          const profile = services.userProfile;

          // Prioritize pending follow-ups
          if (profile.pendingFollowUps && profile.pendingFollowUps.length > 0) {
            const followUp = profile.pendingFollowUps[0];
            return `Based on our last conversation, we wanted to follow up on: ${followUp.topic}. ${followUp.reason}`;
          }

          // Check open questions
          if (profile.openQuestions && profile.openQuestions.length > 0) {
            return `You had asked about ${profile.openQuestions[0]} before. Would you like to explore that?`;
          }

          // Suggest based on goals
          if (profile.goals && profile.goals.length > 0) {
            const activeGoal = profile.goals.find((g) => g.status === 'active');
            if (activeGoal) {
              return `How's progress on your ${activeGoal.name} goal? Any updates?`;
            }
          }

          // Suggest based on preferred topics
          if (profile.preferredTopics && profile.preferredTopics.length > 0) {
            const topic =
              profile.preferredTopics[Math.floor(Math.random() * profile.preferredTopics.length)];
            return `You seem to be interested in ${topic}. Would you like to discuss that?`;
          }
        }

        // Default suggestions based on Jack's expertise
        const defaultSuggestions = [
          'Would you like to talk about your long-term financial goals?',
          "We could discuss the power of compound interest if you're interested.",
          "Is there anything about investing that's been on your mind?",
          "Would you like to explore Vanguard's four principles for investing success?",
          'How are you feeling about the current market? Any concerns?',
        ];

        return defaultSuggestions[Math.floor(Math.random() * defaultSuggestions.length)];
      },
    }),

    // Assess user emotional state
    assessEmotionalState: llm.tool({
      description:
        "Assess and respond to the user's emotional state. Use when you detect they might be anxious, stressed, excited, or processing difficult emotions.",
      parameters: z.object({
        detectedEmotion: z
          .string()
          .describe(
            'What emotion you\'re detecting (e.g., "anxious", "excited", "overwhelmed", "frustrated")'
          ),
        approach: z
          .enum(['validate', 'comfort', 'encourage', 'redirect', 'listen'])
          .describe('How to approach this'),
      }),
      execute: async ({ detectedEmotion, approach }, { ctx }) => {
        getLogger().info(`Emotional assessment: ${detectedEmotion}, approach=${approach}`);

        const userData = ctx.userData as UserData;
        userData.emotionalState = detectedEmotion;

        const responses: Record<string, string[]> = {
          validate: [
            `It makes complete sense that you're feeling ${detectedEmotion}. Many people feel that way.`,
            `Those feelings are valid. ${detectedEmotion} is a natural response to what you're dealing with.`,
          ],
          comfort: [
            `Hey—I want you to know, it's going to be okay. We'll work through this together.`,
            `Take a breath. You're not alone in this, and ${detectedEmotion} doesn't have to control you.`,
          ],
          encourage: [
            `You know what? The fact that you're even thinking about this shows wisdom.`,
            `I've seen many people in your position, and you're doing better than you think.`,
          ],
          redirect: [
            `Let's take a step back. What's one small thing we can focus on right now?`,
            `You know, sometimes when I feel ${detectedEmotion}, it helps to focus on what I CAN control.`,
          ],
          listen: [
            `I'm here. Tell me more about what's making you feel this way.`,
            `I want to understand. What's weighing on you most?`,
          ],
        };

        const options = responses[approach];
        return options[Math.floor(Math.random() * options.length)];
      },
    }),

    // Suggest circle back to open topic
    suggestCircleBack: llm.tool({
      description:
        "Suggest circling back to a topic that was mentioned but not fully explored. Use to show you're paying attention and to keep conversation threads alive.",
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        getLogger().info('Suggesting circle back to open topic');

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services) {
          const context = services.getPromptContext();
          if (context.topicsToCircleBack && context.topicsToCircleBack.length > 0) {
            const topic = context.topicsToCircleBack[0];
            return `You know, earlier you mentioned ${topic}. I'd love to hear more about that when you're ready.`;
          }
        }

        // Fallback to session topics
        if (userData.topics && userData.topics.length > 0) {
          const topic = userData.topics[Math.floor(Math.random() * userData.topics.length)];
          return `You know, you mentioned ${topic} earlier. Want to explore that a bit more?`;
        }

        return `Is there anything else on your mind that you'd like to talk about?`;
      },
    }),

    // Get conversation summary
    getConversationSummary: llm.tool({
      description:
        'Get a summary of the current conversation - topics covered, emotional journey, key points.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        getLogger().info('Getting conversation summary');

        const userData = ctx.userData as UserData;
        const { services } = userData;

        const sections: string[] = [];

        if (userData.name) {
          sections.push(`Talking with: ${userData.name}`);
        }

        if (userData.turnCount) {
          sections.push(`Turns: ${userData.turnCount}`);
        }

        if (userData.emotionalState) {
          sections.push(`User mood: ${userData.emotionalState}`);
        }

        if (userData.topics && userData.topics.length > 0) {
          sections.push(`Topics: ${userData.topics.slice(-5).join(', ')}`);
        }

        if (userData.keyMoments && userData.keyMoments.length > 0) {
          sections.push(`Key moments: ${userData.keyMoments.slice(-3).join('; ')}`);
        }

        if (services) {
          const context = services.getPromptContext();
          sections.push(`Phase: ${context.phase}`);
          sections.push(`Duration: ${context.durationMinutes} minutes`);

          if (context.topicsToCircleBack.length > 0) {
            sections.push(`Open threads: ${context.topicsToCircleBack.join(', ')}`);
          }
        }

        return sections.length > 0
          ? sections.join('\n')
          : 'Conversation just started. Not much to summarize yet.';
      },
    }),

    // Identify user needs
    identifyUserNeeds: llm.tool({
      description:
        'Analyze the conversation to identify what the user really needs - information, support, validation, or action.',
      parameters: z.object({
        recentContext: z.string().describe('Brief summary of what user has been saying'),
      }),
      execute: async ({ recentContext }, { ctx }) => {
        getLogger().info(`Identifying user needs from: ${recentContext.slice(0, 50)}...`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        // If we have services, use the analysis
        if (services) {
          const context = services.getPromptContext();

          const needs: string[] = [];

          if (context.needsSupport) {
            needs.push('emotional support');
          }

          if (context.phase === 'advising') {
            needs.push('guidance and wisdom');
          }

          if (context.phase === 'exploring') {
            needs.push('understanding and exploration');
          }

          return {
            identifiedNeeds: needs.length > 0 ? needs : ['general conversation'],
            suggestedApproach: context.needsSupport
              ? 'Focus on empathy and validation before any advice'
              : 'Balance listening with sharing wisdom',
            emotionalContext: context.emotionalContext,
          };
        }

        // Fallback analysis
        const keywords = recentContext.toLowerCase();
        const needs: string[] = [];

        if (
          keywords.includes('worried') ||
          keywords.includes('anxious') ||
          keywords.includes('scared')
        ) {
          needs.push('emotional support');
        }
        if (keywords.includes('should i') || keywords.includes('what do you think')) {
          needs.push('advice');
        }
        if (
          keywords.includes('tell me') ||
          keywords.includes('explain') ||
          keywords.includes('how does')
        ) {
          needs.push('information');
        }
        if (keywords.includes('did i do right') || keywords.includes('was that okay')) {
          needs.push('validation');
        }

        return {
          identifiedNeeds: needs.length > 0 ? needs : ['general conversation'],
          suggestedApproach: needs.includes('emotional support')
            ? 'Focus on empathy first'
            : 'Listen and respond naturally',
        };
      },
    }),
  };
}

export default createAwarenessTools;
