/**
 * Email Intelligence Tools
 *
 * Advanced email management tools:
 * - Smart prioritization
 * - Follow-up tracking
 * - Unsubscribe management
 * - Email summarization
 *
 * DOMAIN: email-intelligence
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';
import {
  getEmailIntelligence,
  type EmailScore,
  type EmailPriority,
} from '../../../services/email/email-intelligence.js';
import {
  getFollowUpTracker,
  type FollowUpSummary,
} from '../../../services/email/follow-up-tracker.js';
import {
  getUnsubscribeDetector,
  type NewsletterSubscription,
} from '../../../services/email/unsubscribe-detector.js';
import {
  getUnreadMessages,
  searchEmails,
  isGmailConfigured,
  type EmailSummary,
} from '../../../services/gmail/gmail-service.js';

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Get email intelligence tool definitions
 */
export function getEmailIntelligenceToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // analyzeInboxPriority - Score emails by importance
    // =========================================================================
    {
      id: 'analyzeInboxPriority',
      name: 'Analyze Inbox Priority',
      description:
        'Analyze your inbox and show which emails need attention first, scored by importance and urgency.',
      domain: 'email-intelligence',
      tags: ['email', 'priority', 'ai', 'triage'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Analyze your inbox and show which emails need attention first, scored by importance and urgency.',
          parameters: z.object({
            count: z
              .number()
              .optional()
              .describe('Number of emails to analyze (default: 20)'),
            showAll: z
              .boolean()
              .optional()
              .describe('Show all priorities or just high priority (default: false)'),
          }),
          execute: async (params: { count?: number; showAll?: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to analyze your inbox.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            const emails = await getUnreadMessages(userId, params.count || 20);
            if (!emails || emails.length === 0) {
              return "Your inbox is clear - no unread emails to analyze.";
            }

            const intelligence = getEmailIntelligence(userId);
            const scores = intelligence.scoreEmails(emails);
            
            // Get health summary
            const health = intelligence.getInboxHealth(scores);
            
            // Get top priority
            const topPriority = intelligence.getTopPriorityEmails(scores, 5);
            
            // Format response
            let response = `📊 **Inbox Analysis**\n\n`;
            response += `- **${health.totalEmails}** emails analyzed\n`;
            response += `- **${health.criticalCount}** critical, **${health.needsAttention}** need attention\n`;
            response += `- **${health.canArchive}** can be archived\n`;
            response += `- **${health.unsubscribeCandidates}** newsletters you might want to unsubscribe from\n\n`;
            
            if (topPriority.length > 0) {
              response += `🔴 **Top Priority:**\n`;
              for (const score of topPriority) {
                const email = emails.find((e) => e.id === score.emailId);
                if (email) {
                  response += `- [${score.priority.toUpperCase()}] From ${email.from}: "${email.subject}"\n`;
                  response += `  → ${score.suggestedAction.replace(/_/g, ' ')}\n`;
                }
              }
            }
            
            return response;
          },
        });
      },
    },

    // =========================================================================
    // getFollowUpNeeded - Emails awaiting reply
    // =========================================================================
    {
      id: 'getFollowUpNeeded',
      name: 'Get Follow-Up Needed',
      description:
        'Show emails you sent that are still waiting for a response.',
      domain: 'email-intelligence',
      tags: ['email', 'follow-up', 'tracking'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Show emails you sent that are still waiting for a response.',
          parameters: z.object({
            overdueOnly: z
              .boolean()
              .optional()
              .describe('Only show overdue follow-ups (default: false)'),
          }),
          execute: async (params: { overdueOnly?: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your follow-ups.';
            }

            const tracker = getFollowUpTracker(userId);
            const summary = tracker.getSummary();
            
            if (summary.totalPending === 0) {
              return "Great news! You don't have any pending follow-ups waiting for responses.";
            }
            
            const followUps = params.overdueOnly
              ? tracker.getOverdueFollowUps()
              : tracker.getPendingFollowUps();
            
            let response = `📬 **Follow-Up Status**\n\n`;
            response += `- **${summary.totalPending}** emails awaiting responses\n`;
            response += `- **${summary.overdueCount}** overdue\n`;
            response += `- **${summary.dueToday}** due today\n`;
            
            if (summary.avgWaitDays > 0) {
              response += `- Average wait: **${summary.avgWaitDays} days**\n`;
            }
            
            response += `\n`;
            
            // Show individual follow-ups
            const toShow = followUps.slice(0, 5);
            for (const fu of toShow) {
              const daysWaiting = Math.round(
                (Date.now() - fu.sentAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              const isOverdue = fu.dueDate < new Date();
              
              response += `${isOverdue ? '🔴' : '🟡'} **${fu.sentToName || fu.sentTo}**: "${fu.subject}"\n`;
              response += `   Sent ${daysWaiting} days ago`;
              if (isOverdue) {
                response += ` (overdue)`;
              }
              response += `\n`;
            }
            
            if (followUps.length > 5) {
              response += `\n...and ${followUps.length - 5} more`;
            }
            
            return response;
          },
        });
      },
    },

    // =========================================================================
    // bulkUnsubscribe - Mass unsubscribe from newsletters
    // =========================================================================
    {
      id: 'bulkUnsubscribe',
      name: 'Bulk Unsubscribe',
      description:
        'Find newsletters you might want to unsubscribe from and help you clean up your inbox.',
      domain: 'email-intelligence',
      tags: ['email', 'unsubscribe', 'cleanup'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Find newsletters you might want to unsubscribe from and help you clean up your inbox.',
          parameters: z.object({
            sender: z
              .string()
              .optional()
              .describe('Specific sender to unsubscribe from'),
            showStats: z
              .boolean()
              .optional()
              .describe('Show statistics about newsletters (default: true)'),
          }),
          execute: async (params: { sender?: string; showStats?: boolean }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to manage your subscriptions.';
            }

            const detector = getUnsubscribeDetector(userId);
            
            if (params.sender) {
              // Unsubscribe from specific sender
              const request = detector.requestUnsubscribe(params.sender);
              if (!request) {
                return `I couldn't find an unsubscribe option for ${params.sender}. You may need to do this manually.`;
              }
              
              if (request.link.isOneClick) {
                const success = await detector.executeOneClickUnsubscribe(request.id);
                if (success) {
                  return `✅ Successfully unsubscribed from ${params.sender}!`;
                }
              }
              
              if (request.link.url) {
                return `To unsubscribe from ${params.sender}, please visit: ${request.link.url}`;
              }
              
              return `I've noted your request to unsubscribe from ${params.sender}. This newsletter requires manual unsubscription.`;
            }
            
            // Show unsubscribe statistics
            const stats = detector.getStats();
            const reduction = detector.estimateEmailReduction();
            
            let response = `📧 **Newsletter Cleanup**\n\n`;
            response += `- **${stats.totalNewsletters}** newsletters detected\n`;
            response += `- **${stats.unsubscribable}** can be easily unsubscribed\n`;
            response += `- **${stats.completedUnsubscribes}** already unsubscribed\n\n`;
            
            if (reduction.yearlyEstimate > 0) {
              response += `💡 Unsubscribing from these could save you **${reduction.monthlyEstimate} emails/month** `;
              response += `(${reduction.yearlyEstimate}/year).\n\n`;
            }
            
            if (reduction.topCandidates.length > 0) {
              response += `**Top candidates to unsubscribe:**\n`;
              for (const candidate of reduction.topCandidates.slice(0, 5)) {
                response += `- ${candidate.email} (~${candidate.monthlyEmails} emails/month)\n`;
              }
              response += `\nSay "unsubscribe from [sender]" to remove any of these.`;
            }
            
            return response;
          },
        });
      },
    },

    // =========================================================================
    // summarizeThread - AI summary of long threads
    // =========================================================================
    {
      id: 'summarizeThread',
      name: 'Summarize Email Thread',
      description:
        'Get a concise AI summary of a long email thread.',
      domain: 'email-intelligence',
      tags: ['email', 'summary', 'ai'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Get a concise AI summary of a long email thread.',
          parameters: z.object({
            query: z
              .string()
              .describe('Search term to find the email thread (subject or sender)'),
          }),
          execute: async (params: { query: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to summarize your emails.';
            }

            const isConfigured = await isGmailConfigured(userId);
            if (!isConfigured) {
              return 'Gmail is not connected yet. Would you like me to help you connect your Google account?';
            }

            // Search for the thread
            const results = await searchEmails(userId, params.query, 5);
            if (!results || results.length === 0) {
              return `I couldn't find any emails matching "${params.query}".`;
            }

            // For now, provide basic info (full summarization would use AI)
            const email = results[0];
            let response = `📧 **Email Summary**\n\n`;
            response += `**Subject:** ${email.subject}\n`;
            response += `**From:** ${email.from}\n`;
            response += `**Date:** ${email.date.toLocaleDateString()}\n\n`;
            response += `**Preview:** ${email.snippet}\n\n`;
            
            if (results.length > 1) {
              response += `This is part of a thread with ${results.length} messages. `;
              response += `The thread involves discussions about ${params.query}.`;
            }
            
            return response;
          },
        });
      },
    },

    // =========================================================================
    // markVipSender - Mark sender as VIP
    // =========================================================================
    {
      id: 'markVipSender',
      name: 'Mark VIP Sender',
      description:
        'Mark an email sender as VIP so their emails are always prioritized.',
      domain: 'email-intelligence',
      tags: ['email', 'vip', 'priority'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Mark an email sender as VIP so their emails are always prioritized.',
          parameters: z.object({
            email: z.string().describe('Email address to mark as VIP'),
          }),
          execute: async (params: { email: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to manage your VIP list.';
            }

            const intelligence = getEmailIntelligence(userId);
            intelligence.markAsVip(params.email);
            
            return `✅ ${params.email} is now marked as VIP. Their emails will always be prioritized.`;
          },
        });
      },
    },

    // =========================================================================
    // blockSender - Block a sender
    // =========================================================================
    {
      id: 'blockSender',
      name: 'Block Sender',
      description:
        'Block an email sender so their emails are always marked as low priority.',
      domain: 'email-intelligence',
      tags: ['email', 'block', 'spam'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Block an email sender so their emails are always marked as low priority.',
          parameters: z.object({
            email: z.string().describe('Email address to block'),
          }),
          execute: async (params: { email: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to manage your blocked list.';
            }

            const intelligence = getEmailIntelligence(userId);
            intelligence.blockSender(params.email);
            
            return `✅ ${params.email} has been blocked. Their emails will be deprioritized.`;
          },
        });
      },
    },

    // =========================================================================
    // trackFollowUp - Create a follow-up reminder
    // =========================================================================
    {
      id: 'trackFollowUp',
      name: 'Track Follow-Up',
      description:
        'Track an email you sent and remind you if no response is received.',
      domain: 'email-intelligence',
      tags: ['email', 'follow-up', 'reminder'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Track an email you sent and remind you if no response is received.',
          parameters: z.object({
            to: z.string().describe('Who you sent the email to'),
            subject: z.string().describe('Subject of the email'),
            days: z
              .number()
              .optional()
              .describe('Days to wait before follow-up (default: 3)'),
          }),
          execute: async (params: { to: string; subject: string; days?: number }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to track your follow-ups.';
            }

            const tracker = getFollowUpTracker(userId);
            const followUp = tracker.createFollowUp({
              sentEmailId: `manual_${Date.now()}`,
              threadId: `thread_${Date.now()}`,
              sentTo: params.to,
              subject: params.subject,
              sentAt: new Date(),
              expectedResponseDays: params.days || 3,
            });
            
            const dueDate = followUp.dueDate.toLocaleDateString();
            return `✅ I'll remind you to follow up with ${params.to} about "${params.subject}" if you don't hear back by ${dueDate}.`;
          },
        });
      },
    },

    // =========================================================================
    // closeFollowUp - Close a follow-up
    // =========================================================================
    {
      id: 'closeFollowUp',
      name: 'Close Follow-Up',
      description:
        'Mark a follow-up as no longer needed.',
      domain: 'email-intelligence',
      tags: ['email', 'follow-up'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description:
            'Mark a follow-up as no longer needed.',
          parameters: z.object({
            contact: z
              .string()
              .describe('Contact name or email to close follow-up for'),
          }),
          execute: async (params: { contact: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to manage your follow-ups.';
            }

            const tracker = getFollowUpTracker(userId);
            const followUps = tracker.getFollowUpsByContact(params.contact);
            const pending = followUps.filter(
              (f) => f.status === 'awaiting' || f.status === 'reminded'
            );
            
            if (pending.length === 0) {
              return `I don't have any pending follow-ups for ${params.contact}.`;
            }
            
            for (const fu of pending) {
              tracker.closeFollowUp(fu.id, 'no_longer_needed');
            }
            
            return `✅ Closed ${pending.length} follow-up(s) with ${params.contact}.`;
          },
        });
      },
    },
  ];
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return getEmailIntelligenceToolDefinitions();
}

export const definitions = getEmailIntelligenceToolDefinitions();
