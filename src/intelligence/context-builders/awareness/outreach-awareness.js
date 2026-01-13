/**
 * Outreach Awareness Context Builder
 *
 * Injects proactive outreach opportunities into Ferni's context.
 * This enables Ferni to naturally suggest reaching out to people:
 *
 * "Hey, I noticed your mom's birthday is in 3 days. Want me to send her something?"
 * "You usually talk to Sarah more often. Should we check in on her?"
 *
 * Works for all personas but is especially relevant for Ferni and Alex.
 *
 * @module intelligence/context-builders/outreach-awareness
 */
import { registerContextBuilder, createStandardInjection } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { buildNudgeContext, getOverdueFrequentContacts, } from '../../../services/contacts/outreach-nudges.js';
const log = createLogger({ module: 'context:outreach-awareness' });
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Outreach Awareness Context Builder
 *
 * Surfaces upcoming birthdays, anniversaries, and outreach opportunities
 * so Ferni can proactively suggest communication.
 */
export const outreachAwarenessBuilder = {
    name: 'outreach-awareness',
    description: 'Proactive outreach nudges for upcoming dates and contact check-ins',
    priority: 65, // High priority but below memory and emotional context
    category: BuilderCategory.ENGAGEMENT,
    async build(input) {
        const userId = input.services?.userId || 'anonymous';
        if (userId === 'anonymous') {
            return [];
        }
        try {
            const nudgeContext = await buildNudgeContext(userId);
            // Only inject if there's something worth mentioning
            if (nudgeContext.upcomingDates.length === 0 &&
                nudgeContext.needsAttention.length === 0 &&
                nudgeContext.upcomingHolidays.length === 0) {
                return [];
            }
            // Build the outreach awareness section
            let content = '';
            // Upcoming important dates (birthdays, anniversaries) - most urgent
            if (nudgeContext.upcomingDates.length > 0) {
                const urgent = nudgeContext.upcomingDates.filter((d) => d.daysAway <= 3);
                if (urgent.length > 0) {
                    content += 'IMPORTANT DATES COMING UP:\n';
                    for (const date of urgent) {
                        const dayText = date.daysAway === 0
                            ? 'TODAY'
                            : date.daysAway === 1
                                ? 'tomorrow'
                                : `in ${date.daysAway} days`;
                        content += `- ${date.contactName}'s ${date.dateType} is ${dayText}\n`;
                    }
                    content += '\n';
                }
                const upcoming = nudgeContext.upcomingDates.filter((d) => d.daysAway > 3 && d.daysAway <= 14);
                if (upcoming.length > 0) {
                    content += 'Coming up soon:\n';
                    for (const date of upcoming.slice(0, 3)) {
                        content += `- ${date.contactName}'s ${date.dateType} in ${date.daysAway} days\n`;
                    }
                    content += '\n';
                }
            }
            // People who need attention
            if (nudgeContext.needsAttention.length > 0) {
                content += 'Contacts who could use a check-in:\n';
                for (const contact of nudgeContext.needsAttention.slice(0, 3)) {
                    content += `- ${contact.contactName}: ${contact.daysSinceContact} days since last contact\n`;
                }
                content += '\n';
            }
            // Frequent contacts who are overdue
            const overdueFrequent = await getOverdueFrequentContacts(userId);
            if (overdueFrequent.length > 0) {
                content += 'Usually talk more often:\n';
                for (const contact of overdueFrequent.slice(0, 2)) {
                    content += `- ${contact.contactName}: usually every ~${contact.avgDaysBetweenContact} days, but it's been ${contact.daysSinceLastContact} days\n`;
                }
                content += '\n';
            }
            // Upcoming holidays (only if within a week)
            const soonHolidays = nudgeContext.upcomingHolidays.filter((h) => h.daysAway <= 7);
            if (soonHolidays.length > 0) {
                content += 'Holiday coming up:\n';
                for (const holiday of soonHolidays.slice(0, 1)) {
                    content += `- ${holiday.name} in ${holiday.daysAway} days\n`;
                }
                content += '\n';
            }
            // Guidelines for natural suggestion
            content += `When appropriate, you can naturally suggest outreach:\n`;
            content += `- "Your [person]'s [event] is coming up. Want me to send them something?"\n`;
            content += `- "You haven't talked to [person] in a while. Should we check in?"\n`;
            content += `- Ask which channel they prefer: email, text, or voice message.\n`;
            content += `Only mention if relevant or urgent. Be subtle and natural.`;
            if (content.length > 0) {
                log.debug({
                    userId,
                    upcomingDates: nudgeContext.upcomingDates.length,
                    needsAttention: nudgeContext.needsAttention.length,
                }, 'Injecting outreach awareness context');
                return [
                    createStandardInjection('outreach_awareness', content, {
                        category: 'superhuman',
                    }),
                ];
            }
        }
        catch (error) {
            log.warn({ error: String(error), userId }, 'Failed to build outreach awareness context');
        }
        return [];
    },
};
// Register the builder
registerContextBuilder(outreachAwarenessBuilder);
// ============================================================================
// HELPERS FOR OTHER MODULES
// ============================================================================
/**
 * Get a nudge to potentially insert at the start of a conversation
 * Use this when the user hasn't spoken yet or at natural transition points
 */
export async function getConversationStarterNudge(userId) {
    try {
        const context = await buildNudgeContext(userId);
        // Only suggest at conversation start if truly urgent (today or tomorrow)
        const urgent = context.upcomingDates.filter((d) => d.daysAway <= 1);
        if (urgent.length > 0) {
            const date = urgent[0];
            const dayText = date.daysAway === 0 ? 'today' : 'tomorrow';
            return `Hey, I noticed ${date.contactName}'s ${date.dateType} is ${dayText}. Want me to help you send them something?`;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Get outreach context for use in communication tools
 */
export async function getOutreachContextForTools(userId) {
    const context = await buildNudgeContext(userId);
    return {
        summary: context.summary,
        upcomingDates: context.upcomingDates.map((d) => ({
            name: d.contactName,
            type: d.dateType,
            daysAway: d.daysAway,
        })),
        needsAttention: context.needsAttention.map((c) => c.contactName),
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default outreachAwarenessBuilder;
//# sourceMappingURL=outreach-awareness.js.map