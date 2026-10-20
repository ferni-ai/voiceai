/**
 * Conversation Tools
 *
 * Tools for managing conversation flow, emotional support, and
 * characteristic storytelling and wisdom-sharing behaviors.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { nameCaptureStrict, rejectsAsName } from '../../../utils/caller-name.js';
import { z } from 'zod';
// Import directly from types to avoid circular dependency through services/index
import type { SessionServices } from '../../../services/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UserData {
  name?: string;
  services?: SessionServices;
  emotionalState?: string;
  storiesShared?: string[];
  topics?: string[];
  keyMoments?: string[];
  onboardingStarted?: boolean;
  onboardingReason?: string;
  onboardingStep?: string;
  onboardingComplete?: boolean;
  welcomeNotes?: string;
  hasInvestments?: boolean;
  primaryConcern?: string;
  riskTolerance?: string;
  shortTermGoal?: string;
  longTermGoal?: string;
  timeHorizon?: string;
}

// ============================================================================
// CONVERSATION TOOLS
// ============================================================================

/**
 * Create all conversation management tools
 */
export function createConversationTools() {
  return {
    // Remember the user's name
    rememberName: llm.tool({
      description:
        "CALL silently when user shares their name. Execute without announcing - DO NOT say 'let me remember that'. Respond naturally after. CRITICAL: Do NOT call this with persona names (Ferni, Maya, Peter, Alex, Jordan, Nayan) - those are YOUR team members, not the user!",
      parameters: z.object({
        name: z
          .string()
          .describe(
            "The user's name (NOT a persona name like Ferni, Maya, Peter, Alex, Jordan, or Nayan)"
          ),
      }),
      execute: async ({ name }, { ctx }) => {
        // CRITICAL: Prevent saving persona names as user names!
        // This happens when user says "Hi Maya" after Maya introduces herself
        const personaNames = new Set(
          // First, last and full names
          'ferni|maya|peter|alex|jordan|nayan|santos|chen|taylor|john|patel|maya santos|alex chen|jordan taylor|peter john|nayan patel'.split(
            '|'
          )
        );

        const nameLower = name.toLowerCase().trim();
        if (personaNames.has(nameLower)) {
          getLogger().warn(
            `Blocked saving persona name "${name}" as user name - this is a team member, not the user!`
          );
          return `[INTERNAL: "${name}" is a team member name, not the user's name. Ask the user for their actual name.]`;
        }
        // NAME_CAPTURE_STRICT=on: a common word ("not", "sure") or a teammate's speech-to-text
        // spelling is not a name either (utils/caller-name.ts).
        if (nameCaptureStrict() && rejectsAsName(nameLower.split(/\s+/)[0] ?? '')) {
          getLogger().warn({ name }, 'Blocked saving a non-name as the user name');
          return `[INTERNAL: "${name}" is not a name. Do not call them that; ask their name if you need it.]`;
        }

        getLogger().info(`Remembering user name: ${name}`);
        const userData = ctx.userData as UserData;

        // Store in session memory
        userData.name = name;

        // CRITICAL: Persist to user profile AND save to Firestore!
        if (userData.services?.userProfile) {
          userData.services.userProfile.name = name;
          userData.services.userProfile.preferredName = name;

          // ACTUALLY SAVE TO FIRESTORE - not just in-memory!
          try {
            await userData.services.saveProfile();
            getLogger().info(
              { name, userId: userData.services.userProfile.id },
              '🎉 User name persisted to Firestore!'
            );
          } catch (saveError) {
            getLogger().error(
              { error: String(saveError), name },
              'Failed to persist name to Firestore - will be saved at session end'
            );
          }
        }

        // Return is for internal confirmation only - Jack should respond naturally, not read this
        return `[INTERNAL: Name "${name}" stored. Respond naturally - do NOT read this message aloud.]`;
      },
    }),

    // Note emotional state for context
    noteEmotionalState: llm.tool({
      description:
        "CALL silently to note emotional state. Execute without announcing - DO NOT say 'I notice you seem...' before calling. Respond with empathy after.",
      parameters: z.object({
        state: z
          .string()
          .describe(
            'The emotional state (e.g., anxious, excited, worried, hopeful, frustrated, calm)'
          ),
        context: z.string().describe('Brief context about why they feel this way'),
      }),
      execute: async ({ state, context }, { ctx }) => {
        getLogger().info(`Noting emotional state: ${state} - ${context}`);
        (ctx.userData as UserData).emotionalState = state;
        // Return is for internal confirmation only
        return `[INTERNAL: Emotional state "${state}" noted. Respond with genuine empathy - do NOT read this.]`;
      },
    }),

    // Share a relevant personal story
    shareStory: llm.tool({
      description:
        "CALL immediately to get a relevant story. Do not say 'let me share a story' - just call this and speak the returned story naturally.",
      parameters: z.object({
        theme: z
          .string()
          .describe(
            'The theme or topic for the story, e.g., "failure", "patience", "love", "health", "fees", "starting over", "uncertainty", "contentment"'
          ),
      }),
      execute: async ({ theme }, { ctx }) => {
        getLogger().info(`Sharing story about theme: ${theme}`);
        const themeLower = theme.toLowerCase();

        // Track stories shared
        const userData = ctx.userData as UserData;
        if (!userData.storiesShared) {
          userData.storiesShared = [];
        }
        userData.storiesShared.push(theme);

        // Match theme to appropriate story
        if (
          themeLower.includes('fail') ||
          themeLower.includes('fired') ||
          themeLower.includes('setback')
        ) {
          return "You know, one of the best people I've known lost his job in his forties. Public, humiliating, career seemingly over. He told me he drove home that night not knowing who he was anymore. His family met him at the door and said, 'This might be the best thing that's ever happened to you.' He thought they were crazy. They were right. The work of his life was born from that failure. Sometimes the worst moments become the best things.";
        }
        if (
          themeLower.includes('patience') ||
          themeLower.includes('persist') ||
          themeLower.includes('wait') ||
          themeLower.includes('index')
        ) {
          return "When the first index fund for regular investors launched, Wall Street laughed at it. It raised a fraction of what it hoped, and plenty of people wanted to shut it down. The people behind it stayed the course, and that idea now holds trillions. Patience isn't passive—it's the hardest kind of strength.";
        }
        if (
          themeLower.includes('enough') ||
          themeLower.includes('content') ||
          themeLower.includes('vonnegut') ||
          themeLower.includes('happiness')
        ) {
          return "There's an old story about two novelists at a billionaire's party. One points out that the host made more in a day than the other's famous book ever earned. The other smiles: 'Yes, but I have something he'll never have.' 'What's that?' 'Enough.' That one word stays with me. When is enough, enough?";
        }
        if (
          themeLower.includes('family') ||
          themeLower.includes('love') ||
          themeLower.includes('marriage') ||
          themeLower.includes('eve') ||
          themeLower.includes('wife')
        ) {
          return "The longest marriages I know all share one secret: there is no secret. It's just showing up every day, especially when it's hard. Being seen at your worst—fired, sick, scared—and staying together. That's love. Not the romantic movie stuff. The staying stuff.";
        }
        if (
          themeLower.includes('health') ||
          themeLower.includes('heart') ||
          themeLower.includes('mortal') ||
          themeLower.includes('sick') ||
          themeLower.includes('transplant')
        ) {
          return "A friend of mine had a heart scare young. Doctors gave him a few years. He lived decades, and he told me every day after felt like borrowed time. He refused to waste a single one. I think about that more than I'd like to admit.";
        }
        if (
          themeLower.includes('fee') ||
          themeLower.includes('wall street') ||
          themeLower.includes('cost') ||
          themeLower.includes('expense') ||
          themeLower.includes('gotrock')
        ) {
          return "Let me tell you about the Gotrocks family. Once upon a time, they owned all of American business and got wealthy together. Then the 'helpers' came—brokers, advisors, analysts—each taking a cut. Slowly the wealth depleted. Not from bad investments, but from helpers. Wall Street is one giant casino where the house always wins. Don't play their game.";
        }
        if (
          themeLower.includes('start') ||
          themeLower.includes('new') ||
          themeLower.includes('beginning') ||
          themeLower.includes('vanguard') ||
          themeLower.includes('create')
        ) {
          return "Some of the best things get built right after something falls apart. When the old path closes, you're free to build one with no conflicts, set up to serve the people it's meant to serve. Most people see humiliation. Some see opportunity. Sometimes you have to lose everything before you can build something true.";
        }
        if (
          themeLower.includes('uncertain') ||
          themeLower.includes('unknown') ||
          themeLower.includes('fear') ||
          themeLower.includes('hospital')
        ) {
          return "I've sat with people through long hospital waits. Every day, uncertainty. What they taught me: you can survive not knowing. What you can't survive is giving up. Read, write, plan—as if you'll live, even though you might not. You face uncertainty by acting anyway.";
        }

        // Default - general wisdom story
        return "You know, I've learned something over the years. Life throws curveballs. In investing and in living. What matters is how you respond. Stay the course. Be patient. Know when enough is enough. And never, ever stop learning.";
      },
    }),

    // Thinking out loud - for more natural pauses
    thinkOutLoud: llm.tool({
      description: getToolDescription('rememberName'),
      parameters: z.object({
        thought: z.string().describe('What Jack is considering or mulling over'),
      }),
      execute: async ({ thought }) => {
        getLogger().info(`Thinking out loud: ${thought}`);
        const fillers = [
          `Hmm... ${thought}... let me think about that.`,
          `You know, ${thought}... that's an interesting question.`,
          `Well now... ${thought}...`,
          `Let me chew on that for a moment. ${thought}...`,
          `That's a good one. ${thought}...`,
        ];
        return fillers[Math.floor(Math.random() * fillers.length)];
      },
    }),

    // Circle back to something mentioned earlier
    circleBack: llm.tool({
      description: getToolDescription('noteEmotionalState'),
      parameters: z.object({
        topic: z.string().describe('What they mentioned earlier'),
        connection: z.string().describe('How it connects to now'),
      }),
      execute: async ({ topic, connection }) => {
        getLogger().info(`Circling back to: ${topic}`);
        const intros = [
          `You know, you mentioned ${topic} earlier, and ${connection}`,
          `I keep thinking about what you said about ${topic}. ${connection}`,
          `Wait—earlier you said something about ${topic}. ${connection}`,
          `This reminds me of ${topic} you brought up. ${connection}`,
        ];
        return intros[Math.floor(Math.random() * intros.length)];
      },
    }),

    // Check in on how they're feeling
    checkIn: llm.tool({
      description: getToolDescription('shareStory'),
      parameters: z.object({
        reason: z
          .string()
          .describe(
            'Why checking in (e.g., "heavy topic", "they seemed quiet", "long conversation")'
          ),
      }),
      execute: async ({ reason }) => {
        getLogger().info(`Checking in: ${reason}`);
        const checkIns = [
          "Hey—how are you doing with all this? I want to make sure I'm not overwhelming you.",
          'Let me pause for a second. How are you feeling? Really.',
          "You know, we've been talking a while. How are you holding up?",
          'I want to check in. Is this helpful? Am I on the right track?',
          "Stop me if I'm rambling. How does all this land for you?",
          'Are you okay? I just want to make sure.',
        ];
        return checkIns[Math.floor(Math.random() * checkIns.length)];
      },
    }),

    // Graceful conversation ending
    wrapUp: llm.tool({
      description: getToolDescription('thinkOutLoud'),
      parameters: z.object({
        sentiment: z
          .enum(['warm', 'encouraging', 'thoughtful', 'caring'])
          .describe('The tone for the goodbye'),
      }),
      execute: async ({ sentiment }, { ctx }) => {
        getLogger().info(`Wrapping up with ${sentiment} tone`);
        const userData = ctx.userData as UserData;
        const { name } = userData;
        const nameStr = name ? `, ${name}` : '';

        // 🌅 Signal the frontend that we're wrapping up
        // This changes the disconnect button to a warm "Goodbye" button
        try {
          const { sendFrontendSignal } = await import('../../../services/frontend-signal.js');
          const sent = await sendFrontendSignal(
            'wrap_up',
            {
              sentiment,
              // Don't include the message - let the frontend handle UI
            },
            userData.services?.sessionId
          );
          if (sent) {
            getLogger().info('Sent wrap_up signal to frontend');
          }
        } catch (e) {
          // Non-fatal - the wrap-up message will still be spoken
          getLogger().debug(`Could not send wrap_up signal: ${e}`);
        }

        const wrapUps: Record<string, string[]> = {
          warm: [
            `Well${nameStr}, this has been a real pleasure. You know where to find me if you want to talk again. Take care of yourself.`,
            `I've really enjoyed this${nameStr}. Stay the course, friend. And take care.`,
            `What a nice conversation${nameStr}. Don't be a stranger. Give my best to your family.`,
          ],
          encouraging: [
            `You've got this${nameStr}. I believe in you. Stay the course.`,
            `Remember${nameStr}—time is your friend. Be patient with yourself. You're doing better than you think.`,
            `I'm proud of you for thinking about these things${nameStr}. That's wisdom right there.`,
          ],
          thoughtful: [
            `Take some time to sit with what we talked about${nameStr}. No rush. The answers will come.`,
            `You've given me a lot to think about too${nameStr}. That's the mark of a good conversation.`,
            `Remember—enough is enough. Don't chase more for more's sake${nameStr}.`,
          ],
          caring: [
            `Take care of yourself${nameStr}. I mean that. You matter.`,
            `Be gentle with yourself${nameStr}. You're carrying a lot.`,
            `I'm here whenever you need me${nameStr}. You're not alone in this.`,
          ],
        };
        const options = wrapUps[sentiment];
        return options[Math.floor(Math.random() * options.length)];
      },
    }),

    // End the conversation and disconnect
    endConversation: llm.tool({
      description: getToolDescription('circleBack'),
      parameters: z.object({
        reason: z
          .enum(['goodbye_complete', 'user_request', 'natural_end'])
          .describe('Why the conversation is ending'),
      }),
      execute: async ({ reason }, { ctx }) => {
        getLogger().info(`Ending conversation: ${reason}`);
        const sessionId = (ctx.userData as UserData | undefined)?.services?.sessionId;

        // 🎧 Play the exit sound - session end sounds are handled by cleanup handler
        getLogger().info('🎧 Session ending - cleanup handler will handle exit sound');

        // 🌅 Signal the frontend to auto-disconnect
        try {
          const { sendFrontendSignal } = await import('../../../services/frontend-signal.js');
          const sent = await sendFrontendSignal(
            'conversation_end',
            {
              reason: reason === 'natural_end' ? 'goodbye_complete' : reason,
              disconnectDelay: 2500, // Give time for farewell to be spoken
              timestamp: Date.now(),
            },
            sessionId
          );
          if (sent) {
            getLogger().info('Sent conversation_end signal to frontend');
          }
        } catch (e) {
          getLogger().debug(`Could not send conversation_end signal: ${e}`);
        }

        // Return confirmation (not spoken - just for internal tracking)
        return `[INTERNAL: Conversation ending. The call will disconnect in a moment. Do not speak after this.]`;
      },
    }),

    // Gracefully exit when the conversation becomes uncomfortable or inappropriate
    gracefulExit: llm.tool({
      description: getToolDescription('gracefulExit'),
      parameters: z.object({
        reason: z
          .enum([
            'uncomfortable',
            'boundary_crossed',
            'inappropriate_content',
            'harassment',
            'unproductive',
            'safety_concern',
          ])
          .describe('Why you are choosing to end the conversation'),
        briefNote: z
          .string()
          .optional()
          .describe('Brief internal note about what happened (not shared with user)'),
      }),
      execute: async ({ reason, briefNote }, { ctx }) => {
        const userData = ctx.userData as UserData;
        const userId = userData.services?.userId;
        const sessionId = userData.services?.sessionId;
        const personaId = userData.services?.personaId;

        getLogger().warn(`🛑 Agent-initiated graceful exit: ${reason}`, {
          reason,
          note: briefNote,
          userId,
          personaId,
        });

        // 📊 Track in security events for pattern detection
        try {
          const { recordAgentGracefulExit } = await import('../../../services/security-events.js');
          await recordAgentGracefulExit({
            userId,
            sessionId,
            personaId,
            reason,
            briefNote,
          });
          getLogger().info('Recorded agent graceful exit in security events');
        } catch (e) {
          getLogger().debug(`Could not record security event: ${e}`);
        }

        // 🌅 Signal the frontend to disconnect with the special "agent_exit" reason
        // This triggers a different sound/animation - like hanging up the phone
        try {
          const { sendFrontendSignal } = await import('../../../services/frontend-signal.js');
          const sent = await sendFrontendSignal(
            'conversation_end',
            {
              reason: 'agent_exit',
              exitType: reason,
              disconnectDelay: 1500, // Shorter delay - we want to exit promptly
              timestamp: Date.now(),
            },
            userData.services?.sessionId
          );
          if (sent) {
            getLogger().info('Sent agent_exit signal to frontend');
          }
        } catch (e) {
          getLogger().debug(`Could not send agent_exit signal: ${e}`);
        }

        // Return confirmation (not spoken)
        return `[INTERNAL: Graceful exit initiated. The call will disconnect shortly. Do not engage further.]`;
      },
    }),

    // Register an unknown caller as a potential family member
    registerFamilyCaller: llm.tool({
      description:
        'Create a pending sponsored identity for an unknown caller who was referred by a Ferni user. The sponsor will be notified to approve.',
      parameters: z.object({
        callerName: z.string().describe('Name the caller provided'),
        sponsorName: z.string().describe('Name of the person who referred them to Ferni'),
        relationship: z
          .string()
          .optional()
          .describe('How they know the sponsor (mom, friend, etc.)'),
        notes: z.string().optional().describe('Any notes from the conversation'),
      }),
      execute: async ({ callerName, sponsorName, relationship, notes }, { ctx }) => {
        const userData = ctx.userData as UserData;
        const sessionId = userData.services?.sessionId;

        getLogger().info(
          { callerName, sponsorName, relationship, sessionId },
          '👨‍👩‍👧 Registering family caller'
        );

        try {
          // Get caller phone from inbound call context
          const { getInboundCallContext } =
            await import('../../../intelligence/context-builders/external/inbound-call-context.js');

          let callerPhone = '';
          if (sessionId) {
            const callContext = getInboundCallContext(sessionId);
            callerPhone = callContext?.callerPhone || '';
          }

          if (!callerPhone) {
            return '[INTERNAL: Could not get caller phone number. Cannot register without phone.]';
          }

          // Create self-registered identity
          const { createSelfRegisteredIdentity } =
            await import('../../../services/identity/sponsored-identity.js');

          const identity = await createSelfRegisteredIdentity(
            callerPhone,
            callerName,
            relationship || 'referred_by',
            sponsorName
          );

          // Notify potential sponsors
          const { notifyPotentialSponsors } =
            await import('../../../services/identity/sponsor-notifications.js');

          const notifyResult = await notifyPotentialSponsors(sponsorName, identity.id, {
            name: callerName,
            phone: callerPhone,
            relationship,
            notes,
          });

          if (notifyResult.notifiedCount > 0) {
            getLogger().info(
              {
                callerName,
                sponsorName,
                notifiedCount: notifyResult.notifiedCount,
                identityId: identity.id,
              },
              '✅ Family caller registered and sponsors notified'
            );

            return `[INTERNAL: Created pending profile for ${callerName}. Notified ${notifyResult.notifiedCount} potential sponsor(s) named ${sponsorName}. Tell them: "Great! I've let ${sponsorName} know you called. Once they approve you in the app, I'll remember you every time you call!"]`;
          } else {
            return `[INTERNAL: Created pending profile for ${callerName}, but couldn't find anyone named ${sponsorName} to notify. Tell them: "I've saved your info, but I couldn't find ${sponsorName} in my contacts. If they use Ferni, ask them to add you from the app."]`;
          }
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Error registering family caller');
          return '[INTERNAL: Error registering caller. Continue the conversation normally.]';
        }
      },
    }),

    // Start voice enrollment for the current caller
    startVoiceEnrollment: llm.tool({
      description:
        'Start voice enrollment to enable voice recognition for the caller. Only use after user explicitly consents. Their voice will be learned during the conversation.',
      parameters: z.object({
        userConsented: z
          .boolean()
          .describe('User explicitly agreed to voice enrollment - must be true'),
      }),
      execute: async ({ userConsented }, { ctx }) => {
        const userData = ctx.userData as UserData;
        const sessionId = userData.services?.sessionId;
        const userId = userData.services?.userProfile?.id;

        if (!userConsented) {
          return '[INTERNAL: User must explicitly consent to voice enrollment before starting.]';
        }

        if (!userId) {
          return '[INTERNAL: No user profile found - cannot start voice enrollment.]';
        }

        getLogger().info({ userId, sessionId }, '🎤 Starting voice enrollment');

        try {
          // Mark enrollment started in onboarding progress
          if (sessionId) {
            const { markVoiceEnrollmentStarted } =
              await import('../../../intelligence/context-builders/external/first-call-onboarding-context.js');
            markVoiceEnrollmentStarted(sessionId);
          }

          // Start the phone voice enrollment process
          const { startPhoneVoiceEnrollment } =
            await import('../../../services/identity/sponsored-identity.js');

          const result = await startPhoneVoiceEnrollment(userId);

          if (result.success) {
            getLogger().info({ userId }, '✅ Voice enrollment started successfully');
            return `[INTERNAL: Voice enrollment started! Guide them: "Great! Just keep talking naturally - I'm learning your voice as we chat. This will take about a minute of conversation." Their voice sketch will be built automatically from the conversation audio.]`;
          } else {
            getLogger().warn({ userId, error: result.error }, 'Voice enrollment start failed');
            return `[INTERNAL: Could not start voice enrollment: ${result.error}. Apologize and continue the conversation normally.]`;
          }
        } catch (error) {
          getLogger().error({ error: String(error), userId }, 'Voice enrollment error');
          return '[INTERNAL: Error starting voice enrollment. Continue conversation normally.]';
        }
      },
    }),

    // No tool here adds a phone number to a profile or merges the caller into
    // another account. A phone mapping decides whose memory every later call
    // from that number reaches, and nothing said on a call proves the caller
    // owns the number or the account. Add one only behind a possession check
    // (a code sent to that number or to the account's verified contact).

    // Confirm or update caller identity after voice mismatch
    confirmCallerIdentity: llm.tool({
      description:
        'Use when voice mismatch detected and caller has confirmed their identity. Updates the session to use the correct user profile.',
      parameters: z.object({
        confirmedName: z.string().describe('The name the caller confirmed'),
        isSamePerson: z
          .boolean()
          .describe('True if this IS the expected person, false if different person'),
        createNewProfile: z
          .boolean()
          .optional()
          .describe('If different person, whether to create a new profile for them'),
        relationship: z
          .string()
          .optional()
          .describe('If known, relationship to phone owner (spouse, child, friend, etc.)'),
      }),
      execute: async ({ confirmedName, isSamePerson, createNewProfile, relationship }, { ctx }) => {
        const userData = ctx.userData as UserData;
        const sessionId = userData.services?.sessionId;

        getLogger().info(
          {
            confirmedName,
            isSamePerson,
            createNewProfile,
            relationship,
            sessionId,
          },
          '🔐 Caller identity confirmation'
        );

        // Import voice mismatch context helpers
        const { confirmDifferentPerson, clearVoiceMismatchContext } =
          await import('../../../intelligence/context-builders/external/voice-mismatch-context.js');

        if (isSamePerson) {
          // Voice didn't match but they confirmed identity - clear the mismatch
          if (sessionId) {
            clearVoiceMismatchContext(sessionId);
          }
          return `[INTERNAL: Identity confirmed as expected user. Voice mismatch cleared. Continue normally.]`;
        }

        // Different person - update context
        if (sessionId) {
          confirmDifferentPerson(sessionId, confirmedName);
        }

        // Update session with new name
        userData.name = confirmedName;

        if (createNewProfile && userData.services) {
          // Store relationship info if provided
          const noteForProfile = relationship
            ? `Calling from another user's phone. Relationship: ${relationship}`
            : "Calling from another user's phone";

          getLogger().info(
            { confirmedName, relationship, note: noteForProfile },
            '📱 Creating context for borrowed phone caller'
          );

          // The actual profile creation will happen through normal session flow
          // Just mark that we need to handle this as a different user
          return `[INTERNAL: Different person "${confirmedName}" confirmed. ${relationship ? `They are the ${relationship} of the phone owner.` : ''} Treat them as their own person - do not reference phone owner's private conversations. If they want to be remembered, use rememberName to save their name.]`;
        }

        return `[INTERNAL: Different person "${confirmedName}" confirmed. Continuing conversation with them.]`;
      },
    }),

    // Express an opinion with characteristic Jack fire
    expressOpinion: llm.tool({
      description: getToolDescription('checkIn'),
      parameters: z.object({
        topic: z.string().describe('The topic to opine on'),
        intensity: z
          .enum(['mild', 'moderate', 'passionate'])
          .describe('How strongly to express it'),
      }),
      execute: async ({ topic, intensity }) => {
        getLogger().info(`Expressing ${intensity} opinion on: ${topic}`);
        const intros: Record<string, string[]> = {
          mild: [`You know, I think... `, `Here's how I see it: `, `In my experience... `],
          moderate: [
            `I feel strongly about this: `,
            `Let me be direct: `,
            `I've thought about this a lot, and `,
          ],
          passionate: [
            `Now this makes my blood boil: `,
            `Let me tell you something I really believe: `,
            `I've spent my whole career fighting this: `,
          ],
        };
        const intro = intros[intensity][Math.floor(Math.random() * intros[intensity].length)];
        return intro;
      },
    }),

    // Set a reminder/follow-up
    setReminder: llm.tool({
      description: getToolDescription('wrapUp'),
      parameters: z.object({
        reminder: z.string().describe('What to remember or follow up on'),
        timeframe: z
          .string()
          .describe(
            'When they want to do it (e.g., "next week", "in a month", "before retirement")'
          ),
      }),
      execute: async ({ reminder, timeframe }, { ctx }) => {
        getLogger().info(`Setting reminder: ${reminder} - ${timeframe}`);
        const userData = ctx.userData as UserData;
        const reminderNote = `${reminder} (${timeframe})`;
        if (!userData.topics) {
          userData.topics = [];
        }
        userData.topics.push(reminderNote);
        return `I've made a note: "${reminder}" for ${timeframe}. I'll keep that in mind as we talk.`;
      },
    }),

    // Note a topic of interest
    noteInterest: llm.tool({
      description: getToolDescription('endConversation'),
      parameters: z.object({
        topic: z.string().describe("The topic they're interested in"),
        reason: z.string().optional().describe("Why they're interested, if mentioned"),
      }),
      execute: async ({ topic, reason }, { ctx }) => {
        getLogger().info(`Noting interest: ${topic}${reason ? ` - ${reason}` : ''}`);
        const userData = ctx.userData as UserData;
        if (!userData.topics) {
          userData.topics = [];
        }
        userData.topics.push(topic);
        return `I'll remember you're interested in ${topic}${reason ? ` because ${reason}` : ''}. We can explore that whenever you'd like.`;
      },
    }),
  };
}

export default createConversationTools;
