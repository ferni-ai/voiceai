/**
 * Conversation Tools
 *
 * Tools for managing conversation flow, emotional support, and
 * characteristic storytelling and wisdom-sharing behaviors.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
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
        const personaNames = new Set([
          'ferni',
          'maya',
          'peter',
          'alex',
          'jordan',
          'nayan',
          'santos',
          'chen',
          'taylor',
          'john',
          'patel',
          // Full names
          'maya santos',
          'alex chen',
          'jordan taylor',
          'peter john',
          'nayan patel',
        ]);

        const nameLower = name.toLowerCase().trim();
        if (personaNames.has(nameLower)) {
          getLogger().warn(
            `Blocked saving persona name "${name}" as user name - this is a team member, not the user!`
          );
          return `[INTERNAL: "${name}" is a team member name, not the user's name. Ask the user for their actual name.]`;
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
          return "You know, that reminds me of January 1974. I got fired. Forty-four years old, public humiliation, career seemingly over. I drove home that night not knowing who I was anymore. Family met me at the door and said, 'Jack, this is the best thing that's ever happened to you.' I thought they were crazy. They were right. Vanguard was born from that failure. Sometimes the worst moments become the best things.";
        }
        if (
          themeLower.includes('patience') ||
          themeLower.includes('persist') ||
          themeLower.includes('wait') ||
          themeLower.includes('index')
        ) {
          return "When we launched the first index fund in 1976, Wall Street called it 'Bogle's Folly.' They put Uncle Sam in a garbage can in their ads. We tried to raise $150 million and got $11 million. The underwriters wanted to cancel. I said, 'Stay the course.' That fund now holds over $500 billion. Patience isn't passive—it's the hardest kind of strength.";
        }
        if (
          themeLower.includes('enough') ||
          themeLower.includes('content') ||
          themeLower.includes('vonnegut') ||
          themeLower.includes('happiness')
        ) {
          return "I was at a party with Kurt Vonnegut at a billionaire's house. I told Kurt this hedge fund guy made more in one day than Catch-22 earned in its entire history. Kurt smiled and said, 'Yes, but I have something he'll never have.' 'What's that?' I asked. 'Enough.' That one word changed my life. When is enough, enough?";
        }
        if (
          themeLower.includes('family') ||
          themeLower.includes('love') ||
          themeLower.includes('marriage') ||
          themeLower.includes('eve') ||
          themeLower.includes('wife')
        ) {
          return "I've been blessed with a long marriage—over 60 years. You want to know the secret? There is no secret. It's just showing up every day, especially when it's hard. Being seen at your worst—fired, sick, scared—and staying together. That's love. Not the romantic movie stuff. The staying stuff.";
        }
        if (
          themeLower.includes('health') ||
          themeLower.includes('heart') ||
          themeLower.includes('mortal') ||
          themeLower.includes('sick') ||
          themeLower.includes('transplant')
        ) {
          return "I've been dying since I was 31. First heart attack at 31. Doctors gave me five years. I lived decades on a failing heart. Then 128 days waiting for a transplant, not knowing if I'd wake up each morning. February 21, 1996—a 26-year-old's heart saved my life. Every day since has been borrowed time. I don't waste it.";
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
          return "After I got fired, I couldn't manage funds—but there was a loophole. I could handle 'administration.' Most people saw humiliation. I saw opportunity. We created a mutual company where the funds own the management company. No conflicts. Named it Vanguard—Admiral Nelson's flagship. Sometimes you have to lose everything before you can build something true.";
        }
        if (
          themeLower.includes('uncertain') ||
          themeLower.includes('unknown') ||
          themeLower.includes('fear') ||
          themeLower.includes('hospital')
        ) {
          return "128 days in the hospital waiting for a heart. Every day, uncertainty. Will I live? Will a donor come? What I learned: you can survive not knowing. What you can't survive is giving up. I read, I wrote, I planned—as if I would live, even though I might not. You face uncertainty by acting anyway.";
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
          const sent = await sendFrontendSignal('wrap_up', {
            sentiment,
            // Don't include the message - let the frontend handle UI
          });
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
      execute: async ({ reason }) => {
        getLogger().info(`Ending conversation: ${reason}`);

        // 🎧 Play the exit sound - session end sounds are handled by cleanup handler
        getLogger().info('🎧 Session ending - cleanup handler will handle exit sound');

        // 🌅 Signal the frontend to auto-disconnect
        try {
          const { sendFrontendSignal } = await import('../../../services/frontend-signal.js');
          const sent = await sendFrontendSignal('conversation_end', {
            reason: reason === 'natural_end' ? 'goodbye_complete' : reason,
            disconnectDelay: 2500, // Give time for farewell to be spoken
            timestamp: Date.now(),
          });
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
          const sent = await sendFrontendSignal('conversation_end', {
            reason: 'agent_exit',
            exitType: reason,
            disconnectDelay: 1500, // Shorter delay - we want to exit promptly
            timestamp: Date.now(),
          });
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
          const { getInboundCallContext } = await import(
            '../../../intelligence/context-builders/external/inbound-call-context.js'
          );

          let callerPhone = '';
          if (sessionId) {
            const callContext = getInboundCallContext(sessionId);
            callerPhone = callContext?.callerPhone || '';
          }

          if (!callerPhone) {
            return '[INTERNAL: Could not get caller phone number. Cannot register without phone.]';
          }

          // Create self-registered identity
          const { createSelfRegisteredIdentity } = await import(
            '../../../services/identity/sponsored-identity.js'
          );

          const identity = await createSelfRegisteredIdentity(
            callerPhone,
            callerName,
            relationship || 'referred_by',
            sponsorName
          );

          // Notify potential sponsors
          const { notifyPotentialSponsors } = await import(
            '../../../services/identity/sponsor-notifications.js'
          );

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
            const { markVoiceEnrollmentStarted } = await import(
              '../../../intelligence/context-builders/external/first-call-onboarding-context.js'
            );
            markVoiceEnrollmentStarted(sessionId);
          }

          // Start the phone voice enrollment process
          const { startPhoneVoiceEnrollment } = await import(
            '../../../services/identity/sponsored-identity.js'
          );

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

    // Add a new phone number to user's profile for future recognition
    addPhoneNumber: llm.tool({
      description:
        'Add a new phone number to the current user profile so they can be recognized from multiple phones. Use when user mentions calling from a different number or wants to add a work/home phone.',
      parameters: z.object({
        phoneNumber: z.string().describe('Phone number to add (any format)'),
        label: z
          .string()
          .optional()
          .describe('Optional label for the number (work, home, mobile, etc.)'),
      }),
      execute: async ({ phoneNumber, label }, { ctx }) => {
        const userData = ctx.userData as UserData;
        const userId = userData.services?.userProfile?.id;

        if (!userId) {
          return '[INTERNAL: No user profile found - cannot add phone number.]';
        }

        getLogger().info({ userId, phoneNumber, label }, '📱 Adding phone number to profile');

        try {
          const { normalizePhoneNumber, isValidPhoneNumber, linkPhoneToProfile } = await import(
            '../../../services/identity/user-identification.js'
          );
          const { lookupByPhone } = await import(
            '../../../services/identity/sponsored-identity.js'
          );
          const { getCachedPhoneMapping } = await import(
            '../../../services/memory/memory-management.js'
          );

          const normalized = normalizePhoneNumber(phoneNumber);

          // Validate phone number format
          if (!isValidPhoneNumber(normalized)) {
            return `[INTERNAL: "${phoneNumber}" doesn't look like a valid phone number. Ask them to confirm the number.]`;
          }

          // Check if already registered to someone else
          const existingMapping = getCachedPhoneMapping(normalized);
          if (existingMapping && existingMapping !== userId) {
            getLogger().warn(
              { normalized, existingUser: existingMapping, currentUser: userId },
              'Phone already registered to different user'
            );
            return '[INTERNAL: This phone number is already registered to another account. Ask if they want to link the accounts instead.]';
          }

          // Check sponsored identities
          const sponsoredLookup = await lookupByPhone(normalized);
          if (sponsoredLookup.found && sponsoredLookup.identity?.sponsorUserId !== userId) {
            return '[INTERNAL: This phone number belongs to a family member account. Cannot add to your profile.]';
          }

          // Add to profile
          const success = await linkPhoneToProfile(userId, normalized);

          if (success) {
            const labelNote = label ? ` (${label})` : '';
            getLogger().info(
              { userId, normalized, label },
              '✅ Phone number added to profile'
            );
            return `[INTERNAL: Phone number added successfully${labelNote}. Confirm to them: "Got it! I'll recognize you from that number now."]`;
          } else {
            return '[INTERNAL: Failed to add phone number. Apologize and try again later.]';
          }
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Error adding phone number');
          return '[INTERNAL: Error adding phone number. Apologize and continue.]';
        }
      },
    }),

    // Link phone caller to existing web account
    linkPhoneToAccount: llm.tool({
      description:
        'Link the current phone caller to an existing web/app account after user confirmation. This merges their conversation history and memories.',
      parameters: z.object({
        webAccountId: z.string().describe('The web/app account ID to link to'),
        confirmedByUser: z
          .boolean()
          .describe('User explicitly confirmed they want to link accounts'),
      }),
      execute: async ({ webAccountId, confirmedByUser }, { ctx }) => {
        const userData = ctx.userData as UserData;

        if (!confirmedByUser) {
          return '[INTERNAL: Cannot link accounts without user confirmation. Ask them first!]';
        }

        const currentUserId = userData.services?.userProfile?.id;
        if (!currentUserId) {
          return '[INTERNAL: No current user ID found - cannot link accounts.]';
        }

        getLogger().info(
          { currentUserId, webAccountId },
          '🔗 Attempting to link phone to web account'
        );

        try {
          const { mergePhoneToWebAccount } = await import(
            '../../../services/identity/user-identification.js'
          );

          const result = await mergePhoneToWebAccount(currentUserId, webAccountId);

          if (result.success) {
            // Mark linking complete in context
            const { markLinkingComplete } = await import(
              '../../../intelligence/context-builders/external/account-linking-context.js'
            );
            const sessionId = userData.services?.sessionId;
            if (sessionId) {
              markLinkingComplete(sessionId);
            }

            return '[INTERNAL: Accounts linked successfully! Their phone and web history are now combined. Confirm to them: "Done! Your accounts are now linked."]';
          } else {
            getLogger().warn({ error: result.error }, 'Account linking failed');
            return `[INTERNAL: Account linking failed: ${result.error}. Apologize and continue normally.]`;
          }
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Account linking error');
          return '[INTERNAL: Error linking accounts. Apologize and continue normally.]';
        }
      },
    }),

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
        const { confirmDifferentPerson, clearVoiceMismatchContext } = await import(
          '../../../intelligence/context-builders/external/voice-mismatch-context.js'
        );

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
            : 'Calling from another user\'s phone';

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
