/**
 * Enhanced Outreach Tools
 *
 * "Better Than Human" communication features:
 * - Voice message generation with persona TTS
 * - Rich HTML email templates
 * - Gift & card suggestions based on interests
 * - Optimal timing ML (Thompson Sampling)
 * - Google Contacts import
 *
 * DOMAIN: communication
 * PERSONA: alex-chen, ferni
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';

// Services
import {
  getTemplateForOccasion,
  generatePlainTextVersion,
} from '../../../services/contacts/rich-email-templates.js';
import {
  generateGiftRecommendations,
  recordGiftGiven,
} from '../../../services/contacts/gift-suggestions.js';
import {
  getTimingRecommendation,
  recordOutcome,
  getBatchTimingRecommendations,
} from '../../../services/contacts/optimal-timing.js';
import {
  generateVoiceMessage,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
} from '../../../services/outreach/voice-synthesis.js';
import { importFromGoogle } from '../../../services/contacts.js';
import {
  searchContacts,
  getContact,
  upsertContact,
} from '../../../services/contacts/contact-relationship-service.js';
import {
  buildOutreachContext,
  generatePersonalizedMessage,
} from '../../../services/contacts/personalized-outreach.js';
import { sendEmail, sendSMS } from '../../../services/communication-service.js';

// Types
import type {
  OutreachOccasion,
  OutreachTone,
  EnhancedContact,
  BudgetRange,
} from '../../../services/contacts/types.js';

const log = getLogger();

// Initialize voice synthesis if configured
const cartesiaKey = process.env.CARTESIA_API_KEY;
const gcsProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const gcsBucket = process.env.GCS_BUCKET_NAME || 'ferni-voice-messages';

if (cartesiaKey && gcsProject) {
  initializeVoiceSynthesis({
    cartesiaApiKey: cartesiaKey,
    gcsProjectId: gcsProject,
    gcsBucketName: gcsBucket,
  });
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function getEnhancedOutreachToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // sendVoiceMessage - TTS personalized voice notes
    // =========================================================================
    {
      id: 'sendVoiceMessage',
      name: 'Send Voice Message',
      description: `Send a personalized voice message using AI-generated speech. 
The message is spoken in Ferni's or Alex's voice and delivered via MMS or email.
Perfect for more personal, warm communication.`,
      domain: 'communication',
      tags: ['voice', 'tts', 'personalized', 'message'],
      // Note: Uses internal Cartesia TTS check - no external service registration needed

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Generate and send a personalized voice message.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            message: z.string().describe('The message to speak'),
            persona: z
              .enum(['ferni', 'alex', 'maya', 'peter', 'jordan', 'nayan'])
              .optional()
              .describe('Whose voice to use (default: ferni)'),
          }),
          execute: async (params: { contactName: string; message: string; persona?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            if (!isVoiceSynthesisAvailable()) {
              return "Voice messages aren't configured yet. I'll send a text message instead.";
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts.`;
            }

            const contact = matches[0];
            if (!contact.phone) {
              return `${contact.name} doesn't have a phone number. Voice messages need a phone number.`;
            }

            // Generate voice message
            const voiceMessage = await generateVoiceMessage({
              text: params.message,
              personaId: params.persona || 'ferni',
              userId,
            });

            if (!voiceMessage) {
              return 'Had trouble generating the voice message. Try again?';
            }

            // For now, return the URL - in production this would send via MMS
            let response = `Voice message ready for ${contact.name}\n\n`;
            response += `Preview: ${voiceMessage.audioUrl}\n`;
            response += `Duration: about ${voiceMessage.duration} seconds\n`;
            response += `Voice: ${params.persona || 'Ferni'}\n\n`;
            response += `Transcript: "${params.message.slice(0, 100)}${params.message.length > 100 ? '...' : ''}"\n\n`;
            response += 'Want me to send it?';

            return response;
          },
        });
      },
    },

    // =========================================================================
    // sendRichEmail - Beautiful HTML email templates
    // =========================================================================
    {
      id: 'sendRichEmail',
      name: 'Send Rich Email',
      description: `Send a beautifully designed HTML email with Ferni branding.
Includes occasion-specific templates for holidays, birthdays, and more.
Much nicer than plain text emails.`,
      domain: 'communication',
      tags: ['email', 'html', 'template', 'branded'],
      requiredServices: ['sendgrid'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Send a beautifully designed HTML email.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            occasion: z
              .enum([
                'christmas',
                'new_year',
                'thanksgiving',
                'birthday',
                'anniversary',
                'check_in',
                'thinking_of_you',
                'sympathy',
                'congratulations',
              ])
              .describe('The occasion for this email'),
            message: z.string().describe('The message content'),
            personalNote: z.string().optional().describe('Optional personal note to add'),
            age: z.number().optional().describe('Their age (for birthday)'),
            years: z.number().optional().describe('Years together (for anniversary)'),
            achievement: z.string().optional().describe('What they achieved (for congratulations)'),
          }),
          execute: async (params: {
            contactName: string;
            occasion: OutreachOccasion;
            message: string;
            personalNote?: string;
            age?: number;
            years?: number;
            achievement?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts.`;
            }

            const contact = matches[0];
            if (!contact.email) {
              return `${contact.name} doesn't have an email address.`;
            }

            // Generate HTML email
            const htmlContent = getTemplateForOccasion(params.occasion, {
              recipientName: contact.name,
              senderName: 'You', // TODO: Get user's name
              message: params.message,
              personalNote: params.personalNote,
              age: params.age,
              years: params.years,
              achievement: params.achievement,
            });

            // Get subject based on occasion
            const subjects: Record<string, string> = {
              christmas: `Merry Christmas, ${contact.name}`,
              new_year: `Happy New Year, ${contact.name}`,
              thanksgiving: `Happy Thanksgiving, ${contact.name}`,
              birthday: `Happy Birthday, ${contact.name}`,
              anniversary: `Happy Anniversary, ${contact.name}`,
              check_in: `Thinking of you, ${contact.name}`,
              thinking_of_you: `Just wanted to say hi, ${contact.name}`,
              sympathy: `Thinking of you`,
              congratulations: `Congratulations, ${contact.name}`,
            };

            const subject = subjects[params.occasion] || `A message for you, ${contact.name}`;

            try {
              await sendEmail(contact.email, subject, htmlContent, true);

              // Record outcome for timing ML
              await recordOutcome(userId, {
                contactId: contact.id,
                sentAt: new Date(),
                channel: 'email',
                gotResponse: false, // Will be updated when they respond
              });

              return `Email sent to ${contact.name}\n\nSubject: ${subject}\n\nUsed the ${params.occasion} template with Ferni branding.`;
            } catch (error) {
              log.error({ error: String(error) }, 'Failed to send rich email');
              return `Had trouble sending the email: ${String(error)}`;
            }
          },
        });
      },
    },

    // =========================================================================
    // getGiftSuggestions - AI-powered gift recommendations
    // =========================================================================
    {
      id: 'getGiftSuggestions',
      name: 'Get Gift Suggestions',
      description: `Get personalized gift recommendations based on the contact's interests,
your relationship, and the occasion. Includes where to buy and how to personalize.
Better than generic gift guides because it knows who they are.`,
      domain: 'communication',
      tags: ['gifts', 'suggestions', 'personalized', 'shopping'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get personalized gift suggestions for a contact.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            occasion: z
              .enum([
                'christmas',
                'new_year',
                'birthday',
                'anniversary',
                'thanksgiving',
                'congratulations',
                'thinking_of_you',
                'custom',
              ])
              .describe('The occasion for the gift'),
            budget: z
              .enum(['thoughtful', 'moderate', 'generous', 'splurge'])
              .optional()
              .describe(
                'Budget range: thoughtful (<$25), moderate ($25-75), generous ($75-150), splurge ($150+)'
              ),
          }),
          execute: async (params: {
            contactName: string;
            occasion: OutreachOccasion;
            budget?: BudgetRange;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts. Add them first so I can learn their interests!`;
            }

            const contact = matches[0];

            // Build enhanced contact with available data
            const context = await buildOutreachContext(userId, contact.id, params.occasion);
            if (!context) {
              return `Couldn't load context for ${contact.name}`;
            }

            // Generate recommendations
            const recommendations = generateGiftRecommendations(
              context.contact,
              params.occasion,
              params.budget
            );

            // Format response
            let response = `Gift Ideas for ${contact.name} (${params.occasion})\n\n`;
            response += `Budget: ${params.budget || 'moderate'}\n\n`;

            if (recommendations.suggestions.length === 0) {
              response +=
                'I need more information about their interests to give good suggestions. ';
              response += "Tell me what they're into and I'll have better ideas.";
              return response;
            }

            response += 'Top Suggestions:\n\n';

            for (let i = 0; i < Math.min(5, recommendations.suggestions.length); i++) {
              const gift = recommendations.suggestions[i];
              response += `${i + 1}. ${gift.name} (${gift.estimatedPrice})\n`;
              response += `   ${gift.description}\n`;
              response += `   Why: ${gift.whyThisGift}\n`;
              if (gift.whereToBuy && gift.whereToBuy.length > 0) {
                response += `   Buy at: ${gift.whereToBuy.slice(0, 3).join(', ')}\n`;
              }
              if (gift.personalizeHow) {
                response += `   Personalize: ${gift.personalizeHow}\n`;
              }
              response += '\n';
            }

            response += `Personal Touch Ideas:\n`;
            for (const idea of recommendations.personalTouchIdeas.slice(0, 3)) {
              response += `- ${idea}\n`;
            }

            response += `\nTiming: ${recommendations.timingAdvice}`;

            return response;
          },
        });
      },
    },

    // =========================================================================
    // recordGift - Track gifts given
    // =========================================================================
    {
      id: 'recordGift',
      name: 'Record Gift Given',
      description:
        'Record a gift you gave to someone (helps avoid suggesting the same thing again).',
      domain: 'communication',
      tags: ['gifts', 'tracking', 'history'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Record a gift you gave to track history and avoid repeats.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
            giftDescription: z.string().describe('What you gave them'),
            occasion: z.string().describe('The occasion (birthday, christmas, etc.)'),
            reaction: z
              .enum(['loved_it', 'liked_it', 'neutral', 'not_their_thing'])
              .optional()
              .describe('How they reacted'),
          }),
          execute: async (params: {
            contactName: string;
            giftDescription: string;
            occasion: string;
            reaction?: 'loved_it' | 'liked_it' | 'neutral' | 'not_their_thing';
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts.`;
            }

            const contact = matches[0];

            await recordGiftGiven(userId, {
              contactId: contact.id,
              giftDescription: params.giftDescription,
              occasion: params.occasion,
              category: 'practical', // Could be smarter about categorizing
              reaction: params.reaction,
            });

            let response = `Recorded. Gave ${contact.name} "${params.giftDescription}" for ${params.occasion}.`;
            if (params.reaction) {
              response += ` They ${params.reaction.replace(/_/g, ' ')}.`;
            }
            response += "\n\nI'll remember this for future suggestions.";

            return response;
          },
        });
      },
    },

    // =========================================================================
    // getOptimalSendTime - ML-powered timing
    // =========================================================================
    {
      id: 'getOptimalSendTime',
      name: 'Get Optimal Send Time',
      description: `Find the best time to reach someone based on their response patterns.
Uses machine learning to learn when each person is most likely to respond.
The more you use it, the smarter it gets.`,
      domain: 'communication',
      tags: ['timing', 'ml', 'optimization'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get the optimal time to reach a contact based on ML analysis.',
          parameters: z.object({
            contactName: z.string().describe('Name of the contact'),
          }),
          execute: async (params: { contactName: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts.`;
            }

            const contact = matches[0];

            const recommendation = await getTimingRecommendation(userId, contact.id, contact.name);

            let response = `Best time to reach ${contact.name}:\n\n`;
            response += `${recommendation.recommendedTimeLabel}\n\n`;
            response += `Confidence: ${recommendation.confidenceLevel}\n`;
            response += `${recommendation.confidenceReason}\n\n`;

            response += `Expected response rate: about ${recommendation.expectedResponseRate}%\n`;
            response += `Based on ${recommendation.dataPoints} interactions\n\n`;

            const sendDate = recommendation.suggestedSendTime;
            const isToday = sendDate.toDateString() === new Date().toDateString();
            const timeStr = sendDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            if (isToday) {
              response += `Suggested: Send today around ${timeStr}`;
            } else {
              const dayStr = sendDate.toLocaleDateString('en-US', { weekday: 'long' });
              response += `Suggested: Send ${dayStr} around ${timeStr}`;
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // importGoogleContacts - Sync from Google
    // =========================================================================
    {
      id: 'importGoogleContacts',
      name: 'Import Google Contacts',
      description: `Import your contacts from Google. Brings in names, phones, emails, 
birthdays, and more. Requires Google account to be connected.`,
      domain: 'communication',
      tags: ['import', 'google', 'sync', 'contacts'],
      requiredServices: ['google-contacts'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Import contacts from your Google account.',
          parameters: z.object({
            confirm: z.boolean().describe('Set to true to confirm import'),
          }),
          execute: async (params: { confirm: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            if (!params.confirm) {
              return `I can import your contacts from Google. This will:
• Bring in names, phones, emails, birthdays
• Skip contacts that already exist
• Not share your data with anyone

Say "yes, import my Google contacts" to proceed.`;
            }

            // Check if we have Google OAuth token
            // Note: This requires adding contacts scope to OAuth
            // For now, return instructions
            return `**Google Contacts Import**

To import your Google contacts, we need to:
1. Connect your Google account (if not already)
2. Grant permission to read your contacts

The contacts scope isn't enabled yet. Once it's added to the OAuth flow:
- Go to Settings → Connected Accounts → Google
- Click "Reconnect" to add contacts permission
- Then come back and run this again

This keeps your data safe while giving you powerful contact management!`;
          },
        });
      },
    },

    // =========================================================================
    // sendIndividualMessage - Single personalized message to one person
    // =========================================================================
    {
      id: 'sendIndividualMessage',
      name: 'Send Individual Message',
      description: `Send a deeply personalized message to a single contact.
Uses all available context: relationship history, recent conversations, interests,
and upcoming dates to craft a message that feels genuinely personal.
You choose the channel: email, text, or voice.`,
      domain: 'communication',
      tags: ['message', 'personalized', 'individual', 'send'],
      requiredServices: ['sendgrid', 'twilio'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Send a deeply personalized message to one person.',
          parameters: z.object({
            contactName: z.string().describe('Name of the person to message'),
            purpose: z
              .string()
              .describe('Why are you reaching out? (check-in, birthday, thank you, etc.)'),
            channel: z
              .enum(['email', 'text', 'voice'])
              .optional()
              .describe(
                'How to send: email, text, or voice. Uses their preference if not specified.'
              ),
            customMessage: z
              .string()
              .optional()
              .describe("Optional: Your own message. If not provided, I'll draft one for you."),
          }),
          execute: async (params: {
            contactName: string;
            purpose: string;
            channel?: 'email' | 'text' | 'voice';
            customMessage?: string;
          }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Find contact
            const matches = await searchContacts(userId, params.contactName);
            if (matches.length === 0) {
              return `I don't have ${params.contactName} in your contacts. Would you like me to add them?`;
            }

            const contact = matches[0];
            const channel =
              params.channel || (contact.preferredChannel as 'email' | 'text') || 'email';

            // Check we have the required contact info
            if (channel === 'email' && !contact.email) {
              return `${contact.name} doesn't have an email address. Should I send a text instead?`;
            }
            if ((channel === 'text' || channel === 'voice') && !contact.phone) {
              return `${contact.name} doesn't have a phone number. Should I send an email instead?`;
            }

            // Build context for personalization
            const context = await buildOutreachContext(userId, contact.id, 'check_in');
            let message = params.customMessage || '';

            // If no custom message, generate one
            if (!message && context) {
              // Add purpose to context for better message generation
              const contextWithPurpose = {
                ...context,
                occasion: params.purpose as OutreachOccasion,
              };
              message = generatePersonalizedMessage(contextWithPurpose);
            }

            if (!message) {
              return `I couldn't generate a message. Could you tell me what you'd like to say to ${contact.name}?`;
            }

            // Send based on channel
            try {
              if (channel === 'voice') {
                if (!isVoiceSynthesisAvailable()) {
                  return "Voice messages aren't configured. Should I send a text instead?";
                }

                const voiceMsg = await generateVoiceMessage({
                  text: message,
                  personaId: 'ferni',
                  userId,
                });

                if (!voiceMsg) {
                  return 'Had trouble generating the voice message. Should I send a text instead?';
                }

                return `Voice message ready for ${contact.name}\n\nMessage: "${message}"\nPreview: ${voiceMsg.audioUrl}\n\nWant me to send it?`;
              }

              if (channel === 'text') {
                await sendSMS(contact.phone!, message);
                await recordOutcome(userId, {
                  contactId: contact.id,
                  sentAt: new Date(),
                  channel: 'sms',
                  gotResponse: false,
                });
                return `Sent text to ${contact.name}.\n\nMessage: "${message}"`;
              }

              // Email
              const subject = params.purpose.includes('birthday')
                ? `Happy Birthday, ${contact.name}`
                : params.purpose.includes('thank')
                  ? `Thank you, ${contact.name}`
                  : `Hey ${contact.name}`;

              await sendEmail(contact.email!, subject, message);
              await recordOutcome(userId, {
                contactId: contact.id,
                sentAt: new Date(),
                channel: 'email',
                gotResponse: false,
              });

              return `Sent email to ${contact.name}.\n\nSubject: ${subject}\nMessage: "${message}"`;
            } catch (error) {
              log.error({ error: String(error), channel }, 'Failed to send message');
              return `Had trouble sending that: ${String(error)}`;
            }
          },
        });
      },
    },

    // =========================================================================
    // getBatchTimingRecommendations - Optimal times for a group
    // =========================================================================
    {
      id: 'getBatchTiming',
      name: 'Get Batch Timing',
      description: 'Get optimal send times for multiple contacts at once.',
      domain: 'communication',
      tags: ['timing', 'batch', 'ml'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Get optimal timing for sending to multiple contacts.',
          parameters: z.object({
            contactNames: z.array(z.string()).describe('Names of contacts'),
          }),
          execute: async (params: { contactNames: string[] }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are.';
            }

            // Resolve contacts
            const contacts: Array<{ id: string; name: string }> = [];
            for (const name of params.contactNames) {
              const matches = await searchContacts(userId, name);
              if (matches.length > 0) {
                contacts.push({ id: matches[0].id, name: matches[0].name });
              }
            }

            if (contacts.length === 0) {
              return "Couldn't find any of those contacts.";
            }

            const recommendations = await getBatchTimingRecommendations(userId, contacts);

            let response = `Optimal send times for ${contacts.length} contacts:\n\n`;

            // Group by recommended time
            const byTime = new Map<string, typeof recommendations>();
            for (const rec of recommendations) {
              const key = rec.recommendedTimeLabel;
              if (!byTime.has(key)) {
                byTime.set(key, []);
              }
              byTime.get(key)!.push(rec);
            }

            for (const [time, recs] of byTime) {
              response += `${time}:\n`;
              for (const rec of recs) {
                response += `- ${rec.contactName} (about ${rec.expectedResponseRate}% response rate)\n`;
              }
              response += '\n';
            }

            return response;
          },
        });
      },
    },
  ];
}

export default {
  getEnhancedOutreachToolDefinitions,
};
