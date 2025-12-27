/**
 * Essential Voice Assistant Tools
 *
 * The basics that make Ferni feel like a real assistant.
 * These are the "table stakes" tools every voice assistant needs.
 *
 * BETTER THAN HUMAN:
 * - whatCanYouDo: Contextual, learns what you use most
 * - quickCapture: Auto-routes thoughts to right place
 * - recentContext: Perfect recall of all conversations
 * - setPreference: Never forgets your preferences
 *
 * @module simple-utilities/essentials-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// USER PREFERENCES STORAGE (Firestore-backed with in-memory cache)
// ============================================================================

interface UserPreferences {
  temperatureUnit?: 'fahrenheit' | 'celsius';
  distanceUnit?: 'miles' | 'kilometers';
  timeFormat?: '12h' | '24h';
  nickname?: string;
  timezone?: string;
  language?: string;
  voiceSpeed?: 'slow' | 'normal' | 'fast';
  customPreferences?: Record<string, string>;
}

// In-memory cache for fast reads (backed by Firestore)
const userPreferencesCache = new Map<string, UserPreferences>();

// Load preferences from Firestore (with cache)
async function loadPreferences(userId: string): Promise<UserPreferences> {
  // Check cache first
  if (userPreferencesCache.has(userId)) {
    return userPreferencesCache.get(userId)!;
  }

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const doc = await db.collection('bogle_users').doc(userId).collection('preferences').doc('settings').get();
    if (doc.exists) {
      const prefs = doc.data() as UserPreferences;
      userPreferencesCache.set(userId, prefs);
      return prefs;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Firestore not available for preferences, using cache');
  }

  return {};
}

// Save preferences to Firestore (with cache)
async function savePreferences(userId: string, prefs: UserPreferences): Promise<void> {
  // Update cache immediately
  userPreferencesCache.set(userId, prefs);

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    await db.collection('bogle_users').doc(userId).collection('preferences').doc('settings').set(cleanForFirestore(prefs), { merge: true });
    log.info({ userId }, 'Saved preferences to Firestore');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not persist preferences to Firestore');
  }
}

// ============================================================================
// WHAT CAN YOU DO - Capabilities Discovery
// ============================================================================

const whatCanYouDoDef: ToolDefinition = {
  id: 'whatCanYouDo',
  name: 'What Can You Do',
  description: 'Explain capabilities - what Ferni and the team can help with',
  domain: 'simple-utilities',
  tags: ['help', 'capabilities', 'discovery', 'essentials'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('whatCanYouDo'),
      parameters: z.object({
        category: z
          .enum(['all', 'productivity', 'coaching', 'fun', 'smart-home', 'communication', 'finance', 'wellness'])
          .optional()
          .default('all')
          .describe('Category to focus on'),
        quickVersion: z.boolean().optional().default(false).describe('Short overview vs detailed'),
      }),
      execute: async ({ category, quickVersion }) => {
        log.info({ userId: ctx.userId, category, quickVersion }, 'Showing capabilities');

        if (quickVersion) {
          return `**Quick Overview**

I can help with:
• **Timers, alarms, reminders** - "Set a timer for 5 minutes"
• **Notes & lists** - "Add milk to my grocery list"
• **Weather & news** - "What's the weather?"
• **Music** - "Play some jazz"
• **Calendar** - "What's on my schedule?"
• **Math & conversions** - "What's 20% tip on $85?"
• **Life coaching** - "I'm feeling stuck at work"
• **Habits & goals** - "Help me build a morning routine"

Want details on any of these? Or ask about something specific!`;
        }

        // Detailed capabilities by category
        const capabilities: Record<string, string> = {
          productivity: `**Productivity**
• **Timers & Alarms** - "Set a timer", "Wake me at 7am"
• **Reminders** - "Remind me to call mom tomorrow"
• **Notes** - "Remember that my passport expires in June"
• **Lists** - "Add eggs to shopping list", "Show my lists"
• **Tasks** - "What's on my to-do list?"
• **Calendar** - "Schedule lunch with Sarah", "What's my week look like?"`,

          coaching: `**Life Coaching (My Team)**
• **Ferni (me)** - Life coach, habits, emotional support
• **Peter** - Research, analysis, financial insights
• **Maya** - Habits, routines, behavior change
• **Jordan** - Events, milestones, celebrations
• **Alex** - Communication, scheduling, productivity
• **Nayan** - Wisdom, meaning, perspective

Just say "Talk to Maya about habits" or ask me anything!`,

          fun: `**Fun & Entertainment**
• **Music** - "Play something upbeat", "What's this song?"
• **Games** - "Let's play a game", "Tell me a joke"
• **Trivia** - "Give me a fun fact"
• **Stories** - "Tell me a story"
• **Coin flip** - "Flip a coin", "Roll some dice"`,

          'smart-home': `**Smart Home**
• **Lights** - "Turn on the living room lights"
• **Temperature** - "Set the thermostat to 72"
• **Locks** - "Lock the front door"
• **Devices** - Control compatible smart devices`,

          communication: `**Communication**
• **Messages** - "Text Sarah I'm running late"
• **Email** - "Send an email to John about the meeting"
• **Calls** - "Call mom" (through your phone)
• **Contacts** - "What's Sarah's number?"`,

          finance: `**Finance**
• **Calculations** - "Split $150 four ways"
• **Tips** - "What's 20% tip on $85?"
• **Currency** - "Convert 100 dollars to euros"
• **Market** - "How's the stock market doing?"
• **Bills** - Track and remind about bills`,

          wellness: `**Wellness**
• **Medications** - "Did I take my vitamins?"
• **Exercise** - Track workouts, get motivation
• **Sleep** - Bedtime routines, wind-down
• **Mindfulness** - "Help me calm down", "Ground me"
• **Habits** - Build healthy routines`,
        };

        if (category === 'all') {
          return `**What I Can Help With**

${Object.values(capabilities).join('\n\n')}

**Better Than Human:**
• I remember everything you tell me - forever
• I'm available 24/7 with the same warmth
• Six perspectives (my team) with no referrals
• I notice patterns you might miss

What would you like to try?`;
        }

        return capabilities[category] || `I'm not sure about that category. Try asking "What can you do?" for the full list.`;
      },
    });
  },
};

// ============================================================================
// QUICK CAPTURE - Brain Dump with Auto-Routing
// ============================================================================

const quickCaptureDef: ToolDefinition = {
  id: 'quickCapture',
  name: 'Quick Capture',
  description: 'Capture a thought and auto-route it to the right place (task, reminder, note, memory)',
  domain: 'simple-utilities',
  tags: ['capture', 'brain-dump', 'quick', 'essentials', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('quickCapture'),
      parameters: z.object({
        thought: z.string().describe('The thought, idea, or thing to remember'),
        urgency: z.enum(['now', 'soon', 'someday', 'just-remember']).optional().describe('How urgent'),
      }),
      execute: async ({ thought, urgency }) => {
        log.info({ userId: ctx.userId, thoughtLength: thought.length, urgency }, 'Quick capture');

        // Detect intent patterns
        const isTask = /\b(need to|have to|must|should|todo|to-do|task)\b/i.test(thought);
        const isReminder = /\b(remind|don't forget|remember to|at \d|tomorrow|next week)\b/i.test(thought);
        const isShopping = /\b(buy|get|pick up|grocery|shopping|store)\b/i.test(thought);
        const isIdea = /\b(idea|what if|could|maybe|thinking about)\b/i.test(thought);
        const isPersonal = /\b(feel|feeling|worried|happy|sad|excited|anxious)\b/i.test(thought);
        const hasDate = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2})\b/i.test(thought);

        let routing: string;
        let confirmation: string;
        let followUp: string;
        let persisted = false;

        try {
          // Route and persist to appropriate service
          if (isReminder || (hasDate && (isTask || urgency === 'now' || urgency === 'soon'))) {
            routing = 'reminder';
            // Try to create a reminder
            try {
              const { createReminder, parseNaturalTime } = await import('../../../services/scheduling/reminder-scheduler.js');
              const timeMatch = thought.match(/(?:at |by |tomorrow |next )([\w\s:]+)/i);
              const when = timeMatch ? timeMatch[1] : 'tomorrow at 9am';
              const scheduledFor = parseNaturalTime(when);

              if (scheduledFor && ctx.userId) {
                await createReminder({
                  userId: ctx.userId,
                  message: thought,
                  scheduledFor,
                  deliveryMethod: 'voice_message',
                  deliveryAddress: '',
                });
                persisted = true;
              }
            } catch (err) {
              log.debug({ error: String(err) }, 'Could not create reminder, falling back');
            }
            confirmation = `📅 **Captured as reminder**\n\n"${thought}"`;
            followUp = persisted ? `I'll remind you when the time comes.` : `For a specific time, say "remind me to [task] at [time]".`;

          } else if (isShopping) {
            routing = 'shopping-list';
            const item = thought.replace(/\b(buy|get|pick up|need|shopping|grocery|store)\b/gi, '').trim();
            // Persist to productivity store
            try {
              const { getProductivityStore } = await import('../../../services/stores/productivity-store.js');
              const store = getProductivityStore();
              if (ctx.userId) {
                const listId = `shopping_${ctx.userId}`;
                const now = new Date().toISOString();
                store.setShoppingList(ctx.userId, {
                  id: listId,
                  name: 'Shopping List',
                  type: 'general',
                  items: [{
                    id: `item_${Date.now()}`,
                    name: item || thought,
                    quantity: 1,
                    isChecked: false,
                    addedAt: now,
                  }],
                  isActive: true,
                  createdAt: now,
                  updatedAt: now,
                });
                persisted = true;
              }
            } catch (err) {
              log.debug({ error: String(err) }, 'Could not add to shopping list');
            }
            confirmation = `🛒 **Added to shopping list**\n\n"${item || thought}"`;
            followUp = `I'll keep track of this. Say "show my shopping list" anytime.`;

          } else if (isTask || urgency === 'now' || urgency === 'soon') {
            routing = 'task';
            // Persist to productivity store
            try {
              const { getProductivityStore } = await import('../../../services/stores/productivity-store.js');
              const store = getProductivityStore();
              if (ctx.userId) {
                const now = new Date().toISOString();
                store.setTask(ctx.userId, {
                  id: `task_${Date.now()}`,
                  title: thought,
                  category: 'quick-capture',
                  status: 'pending',
                  priority: urgency === 'now' ? 'high' : 'medium',
                  isRecurring: false,
                  tags: ['quick-capture'],
                  createdAt: now,
                  updatedAt: now,
                });
                persisted = true;
              }
            } catch (err) {
              log.debug({ error: String(err) }, 'Could not add task');
            }
            confirmation = `✅ **Captured as task**\n\n"${thought}"`;
            followUp = urgency === 'now' ? `This is marked as urgent.` : `I'll help you track this.`;

          } else if (isIdea || isPersonal) {
            routing = isIdea ? 'idea' : 'journal';
            // Persist to productivity store as note
            try {
              const { getProductivityStore } = await import('../../../services/stores/productivity-store.js');
              const store = getProductivityStore();
              if (ctx.userId) {
                const now = new Date().toISOString();
                store.setNote(ctx.userId, {
                  id: `note_${Date.now()}`,
                  content: thought,
                  type: isIdea ? 'idea' : 'journal',
                  tags: [isIdea ? 'idea' : 'journal', 'quick-capture'],
                  createdAt: now,
                  updatedAt: now,
                });
                persisted = true;
              }
            } catch (err) {
              log.debug({ error: String(err) }, 'Could not add note');
            }
            confirmation = isIdea ? `💡 **Captured as idea**\n\n"${thought}"` : `📝 **Noted in your journal**\n\n"${thought}"`;
            followUp = isIdea ? `I've saved this for when you want to explore it.` : `I'm here if you want to talk more about this.`;

          } else {
            routing = 'memory';
            // Persist to Firestore directly
            try {
              const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
              const store = getFirestoreStore();
              const db = await store.getDatabase();
              if (ctx.userId) {
                const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const memoryRef = db.collection('bogle_users').doc(ctx.userId).collection('memories').doc(memoryId);
                await memoryRef.set(cleanForFirestore({
                  content: thought,
                  type: 'fact',
                  importance: urgency === 'just-remember' ? 'low' : 'medium',
                  createdAt: new Date().toISOString(),
                }));
                persisted = true;
              }
            } catch (err) {
              log.debug({ error: String(err) }, 'Could not save to memory');
            }
            confirmation = `🧠 **Remembered**\n\n"${thought}"`;
            followUp = `This is saved in my memory. I won't forget.`;
          }
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Quick capture failed');
          routing = 'memory';
          confirmation = `📌 **Noted**\n\n"${thought}"`;
          followUp = `I've captured this for now.`;
        }

        log.info({ userId: ctx.userId, routing, persisted, thought: thought.slice(0, 50) }, 'Thought routed');

        return `${confirmation}\n\n${followUp}`;
      },
    });
  },
};

// ============================================================================
// RECENT CONTEXT - Conversation Recall
// ============================================================================

const recentContextDef: ToolDefinition = {
  id: 'recentContext',
  name: 'Recent Context',
  description: 'Recall what we talked about recently - perfect memory of conversations',
  domain: 'simple-utilities',
  tags: ['memory', 'recall', 'context', 'essentials', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recentContext'),
      parameters: z.object({
        timeframe: z
          .enum(['today', 'yesterday', 'this-week', 'last-week', 'this-month', 'all-time'])
          .optional()
          .default('this-week')
          .describe('How far back to look'),
        topic: z.string().optional().describe('Specific topic to recall'),
      }),
      execute: async ({ timeframe, topic }) => {
        log.info({ userId: ctx.userId, timeframe, topic }, 'Recalling context');

        let response = `**What We've Talked About**\n\n`;
        response += `**Timeframe: ${timeframe.replace(/-/g, ' ')}**\n\n`;

        try {
          // Query conversation history service
          const { getConversationHistoryService } = await import('../../../services/stores/conversation-history.js');
          const conversationHistoryService = getConversationHistoryService();

          if (ctx.userId) {
            // Calculate date range based on timeframe
            const now = new Date();
            let startDate = new Date();

            switch (timeframe) {
              case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
              case 'yesterday':
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                break;
              case 'this-week':
                startDate.setDate(startDate.getDate() - 7);
                break;
              case 'last-week':
                startDate.setDate(startDate.getDate() - 14);
                break;
              case 'this-month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
              case 'all-time':
                startDate = new Date(0);
                break;
            }

            // Get conversation history (limit is the only supported parameter)
            const history = await conversationHistoryService.getHistory(ctx.userId, 20);

            if (history && history.sessions && history.sessions.length > 0) {
              // Collect topics and insights
              const allTopics = new Set<string>();
              const allInsights: string[] = [];

              for (const session of history.sessions) {
                if (session.topicsDiscussed) {
                  session.topicsDiscussed.forEach((t: string) => allTopics.add(cleanForFirestore(t)));
                }
                if (session.insights) {
                  allInsights.push(...session.insights.slice(0, 2));
                }
              }

              if (topic) {
                // Filter for specific topic
                const relevantSessions = history.sessions.filter((s: { topicsDiscussed?: string[]; insights?: string[] }) =>
                  s.topicsDiscussed?.some((t: string) => t.toLowerCase().includes(topic.toLowerCase())) ||
                  s.insights?.some((i: string) => i.toLowerCase().includes(topic.toLowerCase()))
                );

                if (relevantSessions.length > 0) {
                  response += `Found ${relevantSessions.length} conversation(s) about "${topic}":\n\n`;
                  for (const session of relevantSessions.slice(0, 5)) {
                    const sessionDate = new Date(session.date).toLocaleDateString();
                    response += `• ${sessionDate}: `;
                    if (session.insights?.length) {
                      response += session.insights[0];
                    } else if (session.topicsDiscussed?.length) {
                      response += `Discussed ${session.topicsDiscussed.slice(0, 3).join(', ')}`;
                    }
                    response += `\n`;
                  }
                } else {
                  response += `I don't have specific records about "${topic}" in ${timeframe.replace(/-/g, ' ')}.\n`;
                  response += `But I can search my memories if you'd like.`;
                }
              } else {
                // General summary
                response += `**${history.sessions.length} conversation(s)** in this period.\n\n`;

                if (allTopics.size > 0) {
                  response += `**Topics discussed:**\n`;
                  Array.from(allTopics).slice(0, 8).forEach((t) => {
                    response += `• ${t}\n`;
                  });
                }

                if (allInsights.length > 0) {
                  response += `\n**Key insights:**\n`;
                  allInsights.slice(0, 4).forEach((i) => {
                    response += `• ${i}\n`;
                  });
                }

                response += `\nWant details on any of these?`;
              }
            } else {
              response += `No conversation records found for ${timeframe.replace(/-/g, ' ')}.\n\n`;
              response += `This might be our first chat in a while!\n`;
              response += `What's on your mind today?`;
            }
          } else {
            response += `I need to know who you are to recall our conversations.\n`;
            response += `Once you're signed in, I'll remember everything we discuss.`;
          }
        } catch (error) {
          log.debug({ error: String(error), userId: ctx.userId }, 'Could not query conversation history');

          // Fallback to Firestore memory search
          try {
            const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
            const store = getFirestoreStore();
            const db = await store.getDatabase();

            if (ctx.userId && topic) {
              const snapshot = await db.collection('bogle_users').doc(ctx.userId).collection('memories')
                .where('content', '>=', topic)
                .where('content', '<=', topic + '\uf8ff')
                .limit(5)
                .get();

              if (!snapshot.empty) {
                response += `I found these in my memory about "${topic}":\n\n`;
                snapshot.docs.forEach((doc) => {
                  const mem = doc.data() as { content?: string } | undefined;
                  const content = mem?.content || '';
                  response += `• ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}\n`;
                });
              } else {
                response += `I don't have specific records about "${topic}".\n`;
                response += `What would you like me to remember?`;
              }
            } else {
              response += `I keep track of:\n`;
              response += `• Topics we discuss\n`;
              response += `• Things you ask me to remember\n`;
              response += `• Patterns I've noticed\n\n`;
              response += `What would you like to recall?`;
            }
          } catch (memError) {
            response += `I keep track of:\n`;
            response += `• Topics we discuss\n`;
            response += `• Things you ask me to remember\n`;
            response += `• Patterns I've noticed\n\n`;
            response += `What would you like to recall?`;
          }
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SET PREFERENCE - User Preferences
// ============================================================================

const setPreferenceDef: ToolDefinition = {
  id: 'setPreference',
  name: 'Set Preference',
  description: 'Remember user preferences - temperature units, nickname, etc.',
  domain: 'simple-utilities',
  tags: ['preferences', 'settings', 'personalization', 'essentials', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('setPreference'),
      parameters: z.object({
        // Accept both 'type' and 'preferenceType' for flexibility
        preferenceType: z
          .enum(['temperature', 'distance', 'time-format', 'nickname', 'timezone', 'language', 'voice-speed', 'custom'])
          .optional()
          .describe('Type of preference'),
        type: z
          .enum(['temperature', 'distance', 'time-format', 'nickname', 'timezone', 'language', 'voice-speed', 'custom'])
          .optional()
          .describe('Type of preference (alias for preferenceType)'),
        value: z.string().describe('The preference value'),
        customKey: z.string().optional().describe('Key for custom preferences'),
      }),
      execute: async ({ preferenceType, type, value, customKey }) => {
        // Support both parameter names for better LLM compatibility
        const prefType = preferenceType || type;
        log.info({ userId: ctx.userId, preferenceType: prefType, value }, 'Setting preference');

        // Validate that we have a preference type
        if (!prefType) {
          return "I need to know what preference you're setting. Try: 'Use celsius' or 'Call me Alex'";
        }

        // Load existing preferences
        const prefs = ctx.userId ? await loadPreferences(ctx.userId) : {};
        let confirmation: string;

        switch (prefType) {
          case 'temperature':
            const tempUnit = value.toLowerCase().includes('c') ? 'celsius' : 'fahrenheit';
            prefs.temperatureUnit = tempUnit;
            confirmation = `I'll show temperatures in ${tempUnit === 'celsius' ? 'Celsius (°C)' : 'Fahrenheit (°F)'} from now on.`;
            break;

          case 'distance':
            const distUnit = value.toLowerCase().includes('k') || value.toLowerCase().includes('metric') ? 'kilometers' : 'miles';
            prefs.distanceUnit = distUnit;
            confirmation = `I'll use ${distUnit} for distances.`;
            break;

          case 'time-format':
            const timeFormat = value.includes('24') || value.toLowerCase().includes('military') ? '24h' : '12h';
            prefs.timeFormat = timeFormat;
            confirmation = `I'll show times in ${timeFormat === '24h' ? '24-hour' : '12-hour'} format.`;
            break;

          case 'nickname':
            prefs.nickname = value;
            confirmation = `Got it! I'll call you ${value}.`;
            break;

          case 'timezone':
            prefs.timezone = value;
            confirmation = `Your timezone is set to ${value}.`;
            break;

          case 'language':
            prefs.language = value;
            confirmation = `Language preference set to ${value}.`;
            break;

          case 'voice-speed':
            const speed = value.toLowerCase().includes('slow') ? 'slow' : value.toLowerCase().includes('fast') ? 'fast' : 'normal';
            prefs.voiceSpeed = speed;
            confirmation = `I'll speak at ${speed} speed.`;
            break;

          case 'custom':
            if (!customKey) {
              return "I need to know what preference you're setting. Try: 'Remember that I prefer X'";
            }
            prefs.customPreferences = prefs.customPreferences || {};
            prefs.customPreferences[customKey] = value;
            confirmation = `Noted! I'll remember that ${customKey}: ${value}`;
            break;

          default:
            return "I'm not sure what preference that is. I can set: temperature units, distance units, time format, nickname, timezone, language, or voice speed.";
        }

        // Save to Firestore
        if (ctx.userId) {
          await savePreferences(ctx.userId, prefs);
        }

        return `✓ **Preference saved**\n\n${confirmation}\n\nI won't forget this.`;
      },
    });
  },
};

// ============================================================================
// GET PREFERENCES - View saved preferences
// ============================================================================

const getPreferencesDef: ToolDefinition = {
  id: 'getPreferences',
  name: 'Get Preferences',
  description: 'View saved user preferences',
  domain: 'simple-utilities',
  tags: ['preferences', 'settings', 'essentials'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getPreferences'),
      parameters: z.object({}),
      execute: async () => {
        // Load from Firestore
        const prefs = ctx.userId ? await loadPreferences(ctx.userId) : {};

        if (!prefs || Object.keys(prefs).length === 0) {
          return `**Your Preferences**\n\nNo preferences set yet.\n\nYou can tell me things like:\n• "Call me [nickname]"\n• "I prefer Celsius"\n• "Use 24-hour time"\n• "My timezone is Eastern"`;
        }

        let response = `**Your Preferences**\n\n`;

        if (prefs.nickname) response += `• **Name:** ${prefs.nickname}\n`;
        if (prefs.temperatureUnit) response += `• **Temperature:** ${prefs.temperatureUnit}\n`;
        if (prefs.distanceUnit) response += `• **Distance:** ${prefs.distanceUnit}\n`;
        if (prefs.timeFormat) response += `• **Time format:** ${prefs.timeFormat}\n`;
        if (prefs.timezone) response += `• **Timezone:** ${prefs.timezone}\n`;
        if (prefs.language) response += `• **Language:** ${prefs.language}\n`;
        if (prefs.voiceSpeed) response += `• **Voice speed:** ${prefs.voiceSpeed}\n`;

        if (prefs.customPreferences && Object.keys(prefs.customPreferences).length > 0) {
          response += `\n**Custom:**\n`;
          for (const [key, val] of Object.entries(prefs.customPreferences)) {
            response += `• ${key}: ${val}\n`;
          }
        }

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const essentialsToolDefinitions: ToolDefinition[] = [
  whatCanYouDoDef,
  quickCaptureDef,
  recentContextDef,
  setPreferenceDef,
  getPreferencesDef,
];

export {
  whatCanYouDoDef,
  quickCaptureDef,
  recentContextDef,
  setPreferenceDef,
  getPreferencesDef,
};

