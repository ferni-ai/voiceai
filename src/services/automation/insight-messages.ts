/**
 * The words of an insight-driven check-in (insight-action-bridge.ts), from
 * the rule's template and what the insight found. FORGET_EVERY_READER: a
 * message about a topic the caller asked Ferni to forget (a dream, a
 * commitment, a person they mentioned) becomes the plain check-in instead,
 * and so does every message while their forget list can't be read.
 *
 * @module services/automation/insight-messages
 */
import { forgottenCheck } from '../../memory/index.js';
import type { SuperhumanInsight } from './insight-action-bridge.js';

export const PLAIN_CHECK_IN = `Hey, just thinking about you. How are things?`;

function fromTemplate(template: string, insight: SuperhumanInsight): string {
  const messages: Record<string, string> = {
    burnout_prevention: `Hey, I've been thinking about you. It seems like you've been carrying a lot lately. How are you really doing?`,
    relationship_reconnect: `I noticed it's been a while since you mentioned ${insight.data?.relationshipName || 'that important person'}. Just wanted to check in - want to reconnect with them?`,
    dream_revival: `Remember when you talked about ${insight.data?.dreamDescription || 'that dream of yours'}? I've been thinking about it. Still calling to you?`,
    commitment_reminder: `Just checking in on those things you said you'd do. How's it going? ${insight.overdueCommitments?.[0] ? `(Like: ${insight.overdueCommitments[0]})` : ''}`,
    habit_streak_rescue: `Hey! Your ${insight.habitName || 'habit'} streak is at ${insight.habitStreak || 'a great number'} days! Let's keep it going today.`,
    mood_support: `I've noticed things might feel heavier lately. I'm here whenever you want to talk.`,
    crisis_support: `I'm here. Whatever you're going through, you don't have to face it alone. Want to talk?`,
    pattern_celebration: `Something cool I noticed: ${insight.patternDetected || 'a positive pattern forming'}. You're doing great!`,
    milestone_reminder: `${insight.milestoneName || 'An important date'} is coming up in ${insight.daysUntilMilestone || 'a few'} days. Want to plan something special?`,
    seasonal_reflection: `As the season shifts, I've been thinking about how things are going for you. A good time to reflect?`,
    stress_support: `I could hear you might be carrying some stress. Take a breath. I'm here if you need me.`,
    values_reflection: `I've noticed something that might be worth reflecting on - your recent actions vs what matters most to you. Want to explore that?`,
    narrative_celebration: `You've reached a real milestone in your journey. That's worth celebrating!`,
    predictive_support: `I have a feeling the next few days might be challenging. Just wanted you to know I'm here if you need support.`,
    family_reminder: `It's been a bit since you connected with family. Might be a good time to reach out?`,
  };

  return messages[template] || PLAIN_CHECK_IN;
}

export async function insightMessage(
  template: string,
  insight: SuperhumanInsight
): Promise<string> {
  const text = fromTemplate(template, insight);
  const forgotten = await forgottenCheck(insight.userId, 'insight-action');
  return forgotten?.(text) ? PLAIN_CHECK_IN : text;
}
