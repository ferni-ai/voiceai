/**
 * Relationship Intelligence - Insights Generator
 *
 * "Better Than Human" features:
 * - Birthday reminders that don't get forgotten
 * - "Your friend's team won!" notifications
 * - "You haven't talked to [person] in a while" gentle nudges
 * - Gift suggestions based on known interests
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  Relationship,
  RelationshipInsight,
  GiftSuggestion,
  RelationshipTeamUpdate,
} from './types.js';
import {
  DEFAULT_BIRTHDAY_REMINDER,
  TEAM_UPDATE_MESSAGES,
  INTEREST_GIFT_MAPPINGS,
  GENERIC_GIFT_SUGGESTIONS,
  DEFAULT_CONTACT_FREQUENCIES,
} from './types.js';
import {
  getRelationships,
  getUpcomingBirthdays,
  getRelationshipsNeedingContact,
  getRelationshipsByTeam,
} from './storage.js';

// Import sports API for real team results
import { getTeamScore } from '../sports.js';

const log = getLogger();

// ============================================================================
// BIRTHDAY INSIGHTS
// ============================================================================

function getRandomMessage(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

function formatBirthdayMessage(template: string, name: string, days: number): string {
  return template.replace('{name}', name).replace('{days}', String(days));
}

/**
 * Generate birthday-related insights for a user
 */
export async function getBirthdayInsights(userId: string): Promise<RelationshipInsight[]> {
  log.info({ userId }, '🎂 Generating birthday insights');

  const insights: RelationshipInsight[] = [];
  const upcomingBirthdays = await getUpcomingBirthdays(userId, 7); // Look 7 days ahead
  const now = new Date();

  for (const { relationship, daysUntil } of upcomingBirthdays) {
    let message: string;
    let type: RelationshipInsight['type'];
    let priority: number;

    if (daysUntil === 0) {
      // Birthday is today!
      message = formatBirthdayMessage(
        getRandomMessage(DEFAULT_BIRTHDAY_REMINDER.messageTemplates.today),
        relationship.name,
        0
      );
      type = 'birthday_today';
      priority = 100;
    } else {
      // Birthday is upcoming
      message = formatBirthdayMessage(
        getRandomMessage(DEFAULT_BIRTHDAY_REMINDER.messageTemplates.upcoming),
        relationship.name,
        daysUntil
      );
      type = 'birthday_upcoming';
      priority = daysUntil <= 1 ? 90 : daysUntil <= 3 ? 70 : 50;
    }

    insights.push({
      id: `birthday-${relationship.id}-${now.getTime()}`,
      type,
      relationshipId: relationship.id,
      personName: relationship.name,
      message,
      suggestion:
        daysUntil <= 3 && relationship.interests.length > 0
          ? `Need a gift idea? Based on their interests, consider something related to ${relationship.interests.slice(0, 2).join(' or ')}.`
          : undefined,
      priority,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
      context: {
        daysUntilBirthday: daysUntil,
        interests: relationship.interests,
        relationshipType: relationship.relationshipType,
      },
    });
  }

  log.info({ userId, birthdayInsights: insights.length }, '🎂 Generated birthday insights');
  return insights;
}

// ============================================================================
// SPORTS TEAM INSIGHTS
// ============================================================================

/**
 * Generate insights when a friend's team has played
 */
export async function getTeamInsights(
  userId: string,
  teamUpdates: RelationshipTeamUpdate[]
): Promise<RelationshipInsight[]> {
  log.info({ userId, updateCount: teamUpdates.length }, '🏆 Generating team insights');

  const insights: RelationshipInsight[] = [];
  const now = new Date();

  for (const update of teamUpdates) {
    const relationship = await getRelationshipsByTeam(userId, update.teamName);
    if (relationship.length === 0) continue;

    for (const rel of relationship) {
      const templates = TEAM_UPDATE_MESSAGES[update.updateType];
      if (!templates) continue;

      const message = getRandomMessage(templates)
        .replace('{name}', rel.name)
        .replace('{team}', update.teamName);

      let suggestion: string | undefined;
      if (update.updateType === 'won') {
        suggestion = 'A quick "congrats!" text could make their day!';
      } else if (update.updateType === 'lost') {
        suggestion = 'Maybe wait for them to bring it up first.';
      }

      insights.push({
        id: `team-${rel.id}-${update.teamName}-${now.getTime()}`,
        type:
          update.updateType === 'won'
            ? 'team_won'
            : update.updateType === 'lost'
              ? 'team_lost'
              : 'team_playing',
        relationshipId: rel.id,
        personName: rel.name,
        message,
        suggestion,
        priority: update.updateType === 'won' ? 60 : 40,
        generatedAt: now,
        expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours
        context: {
          teamName: update.teamName,
          updateType: update.updateType,
          gameDetails: update.gameDetails,
          score: update.score,
          opponent: update.opponent,
        },
      });
    }
  }

  log.info({ userId, teamInsights: insights.length }, '🏆 Generated team insights');
  return insights;
}

/**
 * Check if any friends have teams that just played
 * Uses real ESPN API data via getTeamScore
 */
export async function checkFriendsTeamResults(userId: string): Promise<RelationshipInsight[]> {
  log.info({ userId }, '🏆 Checking friends team results');

  // Get all relationships with favorite teams
  const relationships = await getRelationships(userId);
  const relationshipsWithTeams = relationships.filter((r) => r.favoriteTeams.length > 0);

  if (relationshipsWithTeams.length === 0) {
    return [];
  }

  const insights: RelationshipInsight[] = [];
  const now = new Date();
  const checkedTeams = new Set<string>(); // Avoid duplicate API calls

  for (const relationship of relationshipsWithTeams) {
    for (const teamName of relationship.favoriteTeams) {
      // Skip if we already checked this team
      if (checkedTeams.has(teamName.toLowerCase())) continue;
      checkedTeams.add(teamName.toLowerCase());

      try {
        const scoreResult = await getTeamScore(teamName);

        // Skip if no game found or error
        if (scoreResult.includes("couldn't find") || scoreResult.includes('might not be playing')) {
          continue;
        }

        // Parse the result to determine if it's a win or loss
        const lowerResult = scoreResult.toLowerCase();
        const isWin =
          lowerResult.includes('won') ||
          lowerResult.includes('beat') ||
          lowerResult.includes('victory') ||
          lowerResult.includes('defeated');
        const isLoss =
          lowerResult.includes('lost') ||
          lowerResult.includes('fell to') ||
          lowerResult.includes('loss');
        const isPlaying =
          lowerResult.includes('playing') ||
          lowerResult.includes('live') ||
          lowerResult.includes('in progress');

        if (!isWin && !isLoss && !isPlaying) {
          continue; // Can't determine outcome
        }

        // Get all relationships who like this team
        const fansOfTeam = await getRelationshipsByTeam(userId, teamName);

        for (const fan of fansOfTeam) {
          const updateType: 'won' | 'lost' | 'playing_now' = isWin
            ? 'won'
            : isLoss
              ? 'lost'
              : 'playing_now';

          const templates = TEAM_UPDATE_MESSAGES[updateType];
          if (!templates) continue;

          const message = getRandomMessage(templates)
            .replace('{name}', fan.name)
            .replace('{team}', teamName);

          let suggestion: string | undefined;
          if (updateType === 'won') {
            suggestion = 'A quick "congrats!" text could make their day!';
          } else if (updateType === 'lost') {
            suggestion = 'Maybe wait for them to bring it up first.';
          }

          insights.push({
            id: `team-${fan.id}-${teamName}-${now.getTime()}`,
            type:
              updateType === 'won'
                ? 'team_won'
                : updateType === 'lost'
                  ? 'team_lost'
                  : 'team_playing',
            relationshipId: fan.id,
            personName: fan.name,
            message,
            suggestion,
            priority: updateType === 'won' ? 60 : updateType === 'playing_now' ? 50 : 40,
            generatedAt: now,
            expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours
            context: {
              teamName,
              updateType,
              gameDetails: scoreResult,
            },
          });
        }
      } catch (error) {
        log.debug({ teamName, error: String(error) }, '🏆 Failed to get team score');
      }
    }
  }

  log.info({ userId, teamInsights: insights.length }, '🏆 Generated friends team insights');
  return insights;
}

// ============================================================================
// CONTACT FREQUENCY INSIGHTS
// ============================================================================

/**
 * Generate "you haven't talked to..." insights
 */
export async function getContactReminderInsights(userId: string): Promise<RelationshipInsight[]> {
  log.info({ userId }, '💬 Generating contact reminder insights');

  const insights: RelationshipInsight[] = [];
  const needingContact = await getRelationshipsNeedingContact(userId);
  const now = new Date();

  for (const { relationship, daysSinceContact, urgency } of needingContact) {
    let message: string;
    let suggestion: string;
    let priority: number;

    switch (urgency) {
      case 'urgent':
        message = `It's been ${daysSinceContact} days since you last connected with ${relationship.name}. They might be wondering how you're doing!`;
        suggestion =
          relationship.preferredContactMethod === 'call'
            ? 'A quick call would mean a lot.'
            : 'Even a short message to say hi would be nice.';
        priority = 80;
        break;

      case 'moderate':
        message = `You haven't caught up with ${relationship.name} in about ${Math.floor(daysSinceContact / 7)} weeks.`;
        suggestion = 'Maybe drop them a line when you have a moment?';
        priority = 50;
        break;

      case 'gentle':
      default:
        message = `It's been a little while since you talked to ${relationship.name}.`;
        suggestion = 'No rush, but they might enjoy hearing from you.';
        priority = 30;
        break;
    }

    insights.push({
      id: `contact-${relationship.id}-${now.getTime()}`,
      type: 'havent_talked',
      relationshipId: relationship.id,
      personName: relationship.name,
      message,
      suggestion,
      priority,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48 hours
      context: {
        daysSinceContact,
        urgency,
        relationshipType: relationship.relationshipType,
        preferredContact: relationship.preferredContactMethod,
      },
    });
  }

  log.info({ userId, contactInsights: insights.length }, '💬 Generated contact reminder insights');
  return insights;
}

// ============================================================================
// GIFT SUGGESTIONS
// ============================================================================

/**
 * Generate gift suggestions for a person
 */
export function generateGiftSuggestions(
  relationship: Relationship,
  occasion: string,
  budget?: 'budget' | 'moderate' | 'premium'
): GiftSuggestion[] {
  const suggestions: GiftSuggestion[] = [];

  // Generate suggestions from interests
  for (const interest of relationship.interests) {
    const interestLower = interest.toLowerCase();
    const mappings = INTEREST_GIFT_MAPPINGS[interestLower];

    if (mappings) {
      for (const suggestion of mappings) {
        if (!budget || suggestion.priceRange === budget || suggestion.priceRange === 'any') {
          suggestions.push({
            ...suggestion,
            reason: `${relationship.name} is interested in ${interest}`,
          });
        }
      }
    }
  }

  // Check gift history to avoid repeats
  const pastGifts = relationship.giftHistory?.map((g) => g.gift.toLowerCase()) || [];
  const filteredSuggestions = suggestions.filter(
    (s) => !pastGifts.some((pg) => pg.includes(s.suggestion.toLowerCase()))
  );

  // Add generic suggestions if we don't have enough
  if (filteredSuggestions.length < 3) {
    for (const generic of GENERIC_GIFT_SUGGESTIONS) {
      if (!budget || generic.priceRange === budget || generic.priceRange === 'any') {
        filteredSuggestions.push(generic);
      }
    }
  }

  return filteredSuggestions.slice(0, 5);
}

/**
 * Generate gift suggestion insight
 */
export async function getGiftSuggestionInsight(
  userId: string,
  relationshipId: string,
  occasion: string
): Promise<RelationshipInsight | null> {
  const relationships = await getRelationships(userId);
  const relationship = relationships.find((r) => r.id === relationshipId);

  if (!relationship) return null;

  const suggestions = generateGiftSuggestions(relationship, occasion);
  const now = new Date();

  if (suggestions.length === 0) {
    return null;
  }

  const topSuggestions = suggestions.slice(0, 3);
  const message = `Gift ideas for ${relationship.name}'s ${occasion}:`;
  const suggestion = topSuggestions
    .map((s, i) => `${i + 1}. ${s.suggestion} (${s.reason})`)
    .join('\n');

  return {
    id: `gift-${relationship.id}-${now.getTime()}`,
    type: 'gift_suggestion',
    relationshipId: relationship.id,
    personName: relationship.name,
    message,
    suggestion,
    priority: 40,
    generatedAt: now,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
    context: {
      occasion,
      suggestions: topSuggestions,
      interests: relationship.interests,
    },
  };
}

// ============================================================================
// AGGREGATED INSIGHTS
// ============================================================================

/**
 * Get all relationship insights for a user
 */
export async function getAllRelationshipInsights(userId: string): Promise<RelationshipInsight[]> {
  log.info({ userId }, '🤝 Generating all relationship insights');

  const [birthdayInsights, contactInsights, teamInsights] = await Promise.all([
    getBirthdayInsights(userId),
    getContactReminderInsights(userId),
    checkFriendsTeamResults(userId),
  ]);

  const allInsights = [...birthdayInsights, ...contactInsights, ...teamInsights];

  // Sort by priority
  allInsights.sort((a, b) => b.priority - a.priority);

  log.info({ userId, totalInsights: allInsights.length }, '🤝 Generated all relationship insights');

  return allInsights;
}

/**
 * Get the most important relationship insight
 */
export async function getTopRelationshipInsight(
  userId: string
): Promise<RelationshipInsight | null> {
  const insights = await getAllRelationshipInsights(userId);
  return insights[0] || null;
}
