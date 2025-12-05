/**
 * Persona Memory Context Builder
 *
 * THE MISSING LINK: Injects persona-specific memories into LLM prompts.
 *
 * Each persona remembers things their own way:
 * - Ferni: preferences, wins, topics, inside jokes
 * - Bogle: funds, investing philosophy, allocations
 * - Peter: watchlist, companies they know, ten-baggers
 * - Maya: merchants, bills, savings goals, spending triggers
 * - Jordan: important dates, venues, dream destinations
 * - Alex: communication preferences, contact notes
 *
 * This makes conversations feel like talking to a friend who ACTUALLY remembers you.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getFerniMemories,
  getBogleMemories,
  getPeterMemories,
  getMayaMemories,
  getJordanMemories,
  getAlexMemories,
  getImportantDates,
  getWatchlist,
  type FerniMemory,
  type BogleMemory,
  type PeterMemory,
  type MayaMemory,
  type JordanMemory,
  type AlexMemory,
  type Memory,
} from '../../services/persona-memories.js';
import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// PERSONA ID NORMALIZATION
// ============================================================================

type NormalizedPersonaId = 'ferni' | 'bogle' | 'peter' | 'maya' | 'jordan' | 'alex';

function normalizePersonaId(id: string | undefined): NormalizedPersonaId | null {
  if (!id) return null;
  const lower = id.toLowerCase();

  // Ferni aliases
  if (['ferni', 'jack-b', 'jackie', 'life-coach'].includes(lower)) return 'ferni';

  // Bogle aliases
  if (['nayan-patel', 'bogle', 'index-investor'].includes(lower)) return 'bogle';

  // Peter aliases
  if (['peter-john', 'peter', 'stock-picker'].includes(lower)) return 'peter';

  // Maya aliases
  if (['maya', 'spend-save', 'maya-santos', 'budgeting'].includes(lower)) return 'maya';

  // Jordan aliases
  if (['jordan', 'event-planner', 'jordan-taylor', 'lifes-firsts'].includes(lower)) return 'jordan';

  // Alex aliases
  if (['alex', 'comm-specialist', 'alex-chen', 'communications'].includes(lower)) return 'alex';

  return null;
}

// ============================================================================
// MEMORY FORMATTERS (Natural language for each persona)
// ============================================================================

function formatFerniMemories(memories: FerniMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  // Group by type
  const preferences = memories.filter((m) => m.type === 'preference');
  const wins = memories.filter((m) => m.type === 'win');
  const topics = memories.filter((m) => m.type === 'topic');
  const insideJokes = memories.filter((m) => m.type === 'inside_joke');

  if (preferences.length > 0) {
    sections.push(`**Things ${name} likes:** ${preferences.map((p) => p.name).join(', ')}`);
  }

  if (wins.length > 0) {
    const recentWins = wins.slice(0, 3);
    sections.push(`**Recent wins to celebrate:** ${recentWins.map((w) => w.name).join('; ')}`);
  }

  if (topics.length > 0) {
    sections.push(`**Topics they enjoy:** ${topics.map((t) => t.name).join(', ')}`);
  }

  if (insideJokes.length > 0) {
    sections.push(`**Inside jokes between you:** ${insideJokes.map((j) => j.name).join('; ')}`);
  }

  return sections.join('\n');
}

function formatBogleMemories(memories: BogleMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  const funds = memories.filter((m) => m.type === 'fund');
  const philosophies = memories.filter((m) => m.type === 'philosophy');

  if (funds.length > 0) {
    const fundList = funds
      .map((f) => {
        let desc = f.ticker ? `${f.ticker} (${f.name})` : f.name;
        if (f.expenseRatio !== undefined) desc += ` - ${f.expenseRatio}% ER`;
        if (f.sentiment === 'positive') desc += ' ✓';
        return desc;
      })
      .join(', ');
    sections.push(`**Funds ${name} owns/likes:** ${fundList}`);
  }

  if (philosophies.length > 0) {
    sections.push(
      `**${name}'s investing principles:** "${philosophies.map((p) => p.name).join('"; "')}"`
    );
  }

  return sections.join('\n');
}

function formatPeterMemories(memories: PeterMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  const watchlist = memories.filter((m) => m.type === 'watchlist');
  const companies = memories.filter((m) => m.type === 'company');
  const tenBaggers = memories.filter((m) => m.type === 'ten_bagger');

  if (watchlist.length > 0) {
    const stocks = watchlist
      .slice(0, 5)
      .map((s) => {
        let desc = s.ticker ? `${s.ticker}` : s.name;
        if (s.reason) desc += ` (${s.reason})`;
        return desc;
      })
      .join(', ');
    sections.push(`**${name}'s watchlist:** ${stocks}`);
  }

  if (companies.length > 0) {
    const known = companies
      .slice(0, 3)
      .map((c) => `${c.name}${c.reason ? ` - "${c.reason}"` : ''}`)
      .join('; ');
    sections.push(`**Companies ${name} knows well:** ${known}`);
  }

  if (tenBaggers.length > 0) {
    sections.push(
      `**🚀 Ten-bagger candidates:** ${tenBaggers.map((t) => t.ticker || t.name).join(', ')}`
    );
  }

  return sections.join('\n');
}

function formatMayaMemories(memories: MayaMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  const merchants = memories.filter((m) => m.type === 'merchant');
  const triggers = memories.filter((m) => m.type === 'trigger');
  const goals = memories.filter((m) => m.type === 'savings_goal');
  const bills = memories.filter((m) => m.type === 'bill');

  if (goals.length > 0) {
    const goalList = goals
      .map((g) => {
        let desc = g.name;
        if (g.targetAmount && g.currentAmount !== undefined) {
          const pct = Math.round((g.currentAmount / g.targetAmount) * 100);
          desc += ` (${pct}% of $${g.targetAmount.toLocaleString()})`;
        }
        return desc;
      })
      .join(', ');
    sections.push(`**🎯 Savings goals:** ${goalList}`);
  }

  if (triggers.length > 0) {
    sections.push(
      `**⚠️ Spending triggers to be gentle about:** ${triggers.map((t) => t.name).join(', ')}`
    );
  }

  if (merchants.length > 0) {
    const problemSpots = merchants.filter((m) => m.sentiment === 'negative');
    if (problemSpots.length > 0) {
      sections.push(
        `**Stores ${name} struggles with:** ${problemSpots.map((m) => m.name).join(', ')}`
      );
    }
  }

  if (bills.length > 0) {
    const upcoming = bills.filter((b) => b.dueDate && b.dueDate <= new Date().getDate() + 7);
    if (upcoming.length > 0) {
      sections.push(
        `**Bills coming up:** ${upcoming.map((b) => `${b.name}${b.amount ? ` ($${b.amount})` : ''}`).join(', ')}`
      );
    }
  }

  return sections.join('\n');
}

function formatJordanMemories(memories: JordanMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  const dates = memories.filter((m) => m.type === 'date');
  const venues = memories.filter((m) => m.type === 'venue');
  const destinations = memories.filter((m) => m.type === 'destination');

  // Check for upcoming dates (within 30 days)
  if (dates.length > 0) {
    const now = new Date();
    const upcomingDates = dates.filter((d) => {
      if (!d.date) return false;
      // Parse date string like "June 15" or "March 3rd"
      try {
        const dateStr = d.date.replace(/(\d+)(st|nd|rd|th)/, '$1');
        const parsed = new Date(`${dateStr} ${now.getFullYear()}`);
        const daysUntil = Math.floor((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= 30;
      } catch {
        return false;
      }
    });

    if (upcomingDates.length > 0) {
      sections.push(
        `**📅 UPCOMING (mention this!):** ${upcomingDates.map((d) => `${d.name} on ${d.date}${d.person ? ` (${d.person})` : ''}`).join('; ')}`
      );
    }

    // All important dates
    sections.push(
      `**Important dates ${name} wants to remember:** ${dates.map((d) => `${d.name} - ${d.date}`).join(', ')}`
    );
  }

  if (venues.length > 0) {
    const favorites = venues.filter((v) => v.sentiment === 'positive');
    if (favorites.length > 0) {
      sections.push(
        `**Favorite venues:** ${favorites.map((v) => `${v.name}${v.rating ? ` (${v.rating}/5)` : ''}`).join(', ')}`
      );
    }
  }

  if (destinations.length > 0) {
    sections.push(`**✈️ Dream destinations:** ${destinations.map((d) => d.name).join(', ')}`);
  }

  return sections.join('\n');
}

function formatAlexMemories(memories: AlexMemory[], userName?: string): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];
  const name = userName || 'they';

  const commPrefs = memories.filter((m) => m.type === 'communication_preference');
  const schedNotes = memories.filter((m) => m.type === 'scheduling_note');
  const contactNotes = memories.filter((m) => m.type === 'contact_note');
  const reminderStyles = memories.filter((m) => m.type === 'reminder_style');

  if (commPrefs.length > 0) {
    sections.push(
      `**📱 Communication preferences:** ${commPrefs.map((p) => `${p.name}${p.preferredChannel ? ` (prefers ${p.preferredChannel})` : ''}`).join('; ')}`
    );
  }

  if (schedNotes.length > 0) {
    sections.push(
      `**📅 Scheduling notes:** ${schedNotes.map((s) => `${s.name}${s.recurring ? ' (recurring)' : ''}`).join('; ')}`
    );
  }

  if (contactNotes.length > 0) {
    sections.push(
      `**👥 People notes:** ${contactNotes.map((c) => `${c.contactName || c.name}${c.relationship ? ` (${c.relationship})` : ''} - ${c.details || c.name}`).join('; ')}`
    );
  }

  if (reminderStyles.length > 0) {
    sections.push(`**⏰ Reminder preferences:** ${reminderStyles.map((r) => r.name).join('; ')}`);
  }

  return sections.join('\n');
}

// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================

interface PersonaMemoryResult {
  personaId: NormalizedPersonaId;
  memories: Memory[];
  formatted: string;
  count: number;
}

/**
 * Filter memories based on relationship stage
 * Deeper stages get access to more intimate/detailed memories
 */
function filterMemoriesByRelationshipStage(
  memories: Memory[],
  relationshipStage?: string
): Memory[] {
  // At trusted_advisor level, show all memories
  if (relationshipStage === 'trusted_advisor' || relationshipStage === 'old_friend') {
    return memories;
  }

  // At friend level, show most memories but limit sensitive ones
  if (relationshipStage === 'friend') {
    return memories.slice(0, 15); // More generous limit
  }

  // At acquaintance level, show basic memories
  if (relationshipStage === 'acquaintance' || relationshipStage === 'getting_to_know') {
    // Filter out potentially sensitive memories
    return memories
      .filter((m) => m.sentiment !== 'negative') // Don't reference triggers early
      .slice(0, 8);
  }

  // At stranger/new level, show minimal memories
  return memories.slice(0, 3);
}

async function getPersonaMemories(
  userId: string,
  personaId: NormalizedPersonaId,
  userName?: string,
  relationshipStage?: string
): Promise<PersonaMemoryResult | null> {
  try {
    switch (personaId) {
      case 'ferni': {
        const allMemories = await getFerniMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatFerniMemories(memories as FerniMemory[], userName),
          count: memories.length,
        };
      }
      case 'bogle': {
        const allMemories = await getBogleMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatBogleMemories(memories as BogleMemory[], userName),
          count: memories.length,
        };
      }
      case 'peter': {
        const allMemories = await getPeterMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatPeterMemories(memories as PeterMemory[], userName),
          count: memories.length,
        };
      }
      case 'maya': {
        const allMemories = await getMayaMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatMayaMemories(memories as MayaMemory[], userName),
          count: memories.length,
        };
      }
      case 'jordan': {
        const allMemories = await getJordanMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatJordanMemories(memories as JordanMemory[], userName),
          count: memories.length,
        };
      }
      case 'alex': {
        const allMemories = await getAlexMemories(userId);
        const memories = filterMemoriesByRelationshipStage(allMemories, relationshipStage);
        return {
          personaId,
          memories,
          formatted: formatAlexMemories(memories as AlexMemory[], userName),
          count: memories.length,
        };
      }
      default:
        return null;
    }
  } catch (error) {
    getLogger().warn({ error, personaId, userId }, 'Failed to retrieve persona memories');
    return null;
  }
}

// ============================================================================
// PROACTIVE MEMORY CALLBACKS - Deep, Persona-Specific Insights
// ============================================================================

/**
 * Get proactive memory callback with persona-specific logic
 * This creates the "pixel-level character devotion" - each persona remembers differently
 */
function getProactiveMemoryCallback(
  result: PersonaMemoryResult,
  turnCount: number,
  userName?: string
): string | null {
  // Only suggest callbacks after turn 2 and occasionally
  if (turnCount < 2 || Math.random() > 0.4) return null;

  const name = userName || 'friend';

  switch (result.personaId) {
    case 'ferni': {
      // Ferni remembers wins, preferences, inside jokes - celebrates progress
      const wins = result.memories.filter((m) => (m as FerniMemory).type === 'win');
      const insideJokes = result.memories.filter((m) => (m as FerniMemory).type === 'inside_joke');
      const preferences = result.memories.filter((m) => (m as FerniMemory).type === 'preference');

      // 30% chance to celebrate a win
      if (wins.length > 0 && Math.random() < 0.3) {
        const win = wins[Math.floor(Math.random() * wins.length)];
        const callbacks = [
          `Consider celebrating: "Hey ${name}, I was thinking about that win you had - ${win.name}. How's that going?"`,
          `Consider: "${name}, remember when you ${win.name}? That was a big deal. How are you feeling about it now?"`,
          `Maybe say: "I still smile when I think about '${win.name}'. You should be proud of that."`,
        ];
        return callbacks[Math.floor(Math.random() * callbacks.length)];
      }

      // 20% chance to reference an inside joke (high relationship depth)
      if (insideJokes.length > 0 && Math.random() < 0.2) {
        const joke = insideJokes[Math.floor(Math.random() * insideJokes.length)];
        return `Inside joke opportunity: Reference "${joke.name}" if it fits naturally - ${name} will appreciate you remembering.`;
      }

      // 15% chance to reference a preference
      if (preferences.length > 0 && Math.random() < 0.15) {
        const pref = preferences[Math.floor(Math.random() * preferences.length)];
        return `Remember ${name} ${pref.name}. Reference this naturally if relevant.`;
      }
      break;
    }

    case 'bogle': {
      // Jack Bogle remembers funds, philosophy, expense ratios
      const funds = result.memories.filter((m) => (m as BogleMemory).type === 'fund');
      const philosophies = result.memories.filter((m) => (m as BogleMemory).type === 'philosophy');

      // Check on fund positions
      if (funds.length > 0 && turnCount > 4 && Math.random() < 0.35) {
        const fund = funds[Math.floor(Math.random() * funds.length)] as BogleMemory;
        const ticker = fund.ticker || fund.name;
        const callbacks = [
          `Consider asking: "How's that ${ticker} position? Staying the course?"`,
          `Maybe check in: "${name}, are you still holding ${ticker}? Good discipline pays off."`,
          `Consider: "Remember ${ticker}? Markets go up and down, but your strategy shouldn't."`,
        ];
        return callbacks[Math.floor(Math.random() * callbacks.length)];
      }

      // Reference their philosophy
      if (philosophies.length > 0 && Math.random() < 0.25) {
        const phil = philosophies[0];
        return `Reference their principle: "${phil.name}" - they said this before, remind them of their own wisdom.`;
      }
      break;
    }

    case 'peter': {
      // Peter John remembers watchlist, companies they know, ten-baggers
      const watchlist = result.memories.filter((m) => (m as PeterMemory).type === 'watchlist');
      const companies = result.memories.filter((m) => (m as PeterMemory).type === 'company');
      const tenBaggers = result.memories.filter((m) => (m as PeterMemory).type === 'ten_bagger');

      // Ask about watchlist stocks
      if (watchlist.length > 0 && turnCount > 4 && Math.random() < 0.35) {
        const stock = watchlist[Math.floor(Math.random() * watchlist.length)] as PeterMemory;
        const ticker = stock.ticker || stock.name;
        const callbacks = [
          `Consider asking: "How's ${ticker} doing? Done your homework lately?"`,
          `Maybe: "${name}, any news on ${ticker}? Remember - know what you own and why you own it!"`,
          `Consider: "Still watching ${ticker}? What's your gut telling you?"`,
        ];
        if (stock.reason) {
          callbacks.push(
            `Remember they added ${ticker} because: "${stock.reason}". Ask if that thesis still holds.`
          );
        }
        return callbacks[Math.floor(Math.random() * callbacks.length)];
      }

      // Celebrate ten-bagger candidates
      if (tenBaggers.length > 0 && Math.random() < 0.2) {
        const winner = tenBaggers[0] as PeterMemory;
        return `🚀 TEN-BAGGER ALERT: ${name} marked ${winner.ticker || winner.name} as a potential winner. Celebrate their conviction!`;
      }

      // Reference companies they know
      if (companies.length > 0 && Math.random() < 0.2) {
        const company = companies[Math.floor(Math.random() * companies.length)] as PeterMemory;
        return `${name} knows ${company.name} personally (${company.reason || 'through experience'}). This is their edge - encourage them!`;
      }
      break;
    }

    case 'maya': {
      // Maya remembers savings goals, spending triggers, merchants
      const goals = result.memories.filter((m) => (m as MayaMemory).type === 'savings_goal');
      const triggers = result.memories.filter((m) => (m as MayaMemory).type === 'trigger');
      const merchants = result.memories.filter((m) => (m as MayaMemory).type === 'merchant');

      // Check on savings goals with progress
      if (goals.length > 0 && Math.random() < 0.4) {
        const goal = goals[0] as MayaMemory;
        if (goal.targetAmount && goal.currentAmount !== undefined) {
          const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100);
          const remaining = goal.targetAmount - goal.currentAmount;
          return `Consider: "How's the ${goal.name} goal? Last time you were at ${pct}% - that's $${remaining.toLocaleString()} to go! You've got this! 💪"`;
        }
        return `Consider checking in: "How's that ${goal.name} goal coming along? I'm cheering for you!"`;
      }

      // Be careful with triggers - acknowledge but don't press
      if (triggers.length > 0 && Math.random() < 0.1) {
        return `[GENTLE] ${name} has spending triggers. If stress comes up, be supportive without judgment.`;
      }

      // Reference positive merchant experiences
      const positiveSpots = merchants.filter((m) => (m as MayaMemory).sentiment === 'positive');
      if (positiveSpots.length > 0 && Math.random() < 0.15) {
        const spot = positiveSpots[0] as MayaMemory;
        return `${name} does well at ${spot.name}. If shopping comes up, you can reference this as a win.`;
      }
      break;
    }

    case 'jordan': {
      // Jordan remembers dates, venues, destinations - checks on upcoming events
      const dates = result.memories.filter((m) => (m as JordanMemory).type === 'date');
      const destinations = result.memories.filter(
        (m) => (m as JordanMemory).type === 'destination'
      );
      const venues = result.memories.filter((m) => (m as JordanMemory).type === 'venue');

      // PRIORITY: Check for upcoming dates (within 30 days)
      if (dates.length > 0) {
        const now = new Date();
        for (const d of dates) {
          const jd = d as JordanMemory;
          if (!jd.date) continue;
          try {
            const dateStr = jd.date.replace(/(\d+)(st|nd|rd|th)/, '$1');
            const thisYear = new Date(`${dateStr} ${now.getFullYear()}`);
            const nextYear = new Date(`${dateStr} ${now.getFullYear() + 1}`);

            // Check both this year and next year
            for (const parsed of [thisYear, nextYear]) {
              const daysUntil = Math.floor(
                (parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysUntil >= 0 && daysUntil <= 30) {
                if (daysUntil === 0) {
                  return `🎉 TODAY IS THE DAY! ${jd.name}${jd.person ? ` (${jd.person})` : ''} is TODAY! Wish ${name} well!`;
                } else if (daysUntil <= 7) {
                  return `📅 UPCOMING: ${jd.name}${jd.person ? ` (${jd.person})` : ''} is in ${daysUntil} days! Ask ${name} if they're ready!`;
                } else {
                  return `Consider mentioning: "${jd.name} is coming up on ${jd.date}. Want to start planning?"`;
                }
              }
            }
          } catch {
            continue;
          }
        }
      }

      // Dream destinations
      if (destinations.length > 0 && Math.random() < 0.2) {
        const dest = destinations[Math.floor(Math.random() * destinations.length)] as JordanMemory;
        return `${name} dreams of visiting ${dest.name}. If travel comes up, fan the flames! ✈️`;
      }

      // Favorite venues
      if (venues.length > 0 && Math.random() < 0.15) {
        const faves = venues.filter((v) => (v as JordanMemory).sentiment === 'positive');
        if (faves.length > 0) {
          const venue = faves[0] as JordanMemory;
          return `If planning comes up, remember ${name} loved ${venue.name}${venue.rating ? ` (${venue.rating}/5)` : ''}.`;
        }
      }
      break;
    }

    case 'alex': {
      // Alex remembers communication preferences, scheduling notes
      const commPrefs = result.memories.filter(
        (m) => (m as AlexMemory).type === 'communication_preference'
      );
      const schedNotes = result.memories.filter(
        (m) => (m as AlexMemory).type === 'scheduling_note'
      );

      // Communication preference callbacks
      if (commPrefs.length > 0 && Math.random() < 0.25) {
        const pref = commPrefs[Math.floor(Math.random() * commPrefs.length)] as AlexMemory;
        return `Remember: ${name} prefers ${pref.name}${pref.preferredChannel ? ` (via ${pref.preferredChannel})` : ''}. Use this when reaching out.`;
      }

      // Scheduling note callbacks
      if (schedNotes.length > 0 && Math.random() < 0.2) {
        const note = schedNotes[Math.floor(Math.random() * schedNotes.length)] as AlexMemory;
        return `Scheduling note: ${name} mentioned "${note.name}"${note.recurring ? ' (recurring)' : ''}. Keep this in mind.`;
      }
      break;
    }
  }

  return null;
}

// ============================================================================
// MEMORY ACKNOWLEDGMENT PHRASES
// ============================================================================

/**
 * Get persona-specific phrases for acknowledging when you remember something
 * These make memory references feel natural, not database-like
 */
function getMemoryAcknowledgmentPhrases(personaId: NormalizedPersonaId): string[] {
  switch (personaId) {
    case 'ferni':
      return [
        'I remember you mentioning...',
        'You told me once that...',
        'I keep thinking about what you said about...',
        'Remember when you shared...',
        "I haven't forgotten that you...",
      ];
    case 'bogle':
      return [
        'As you said before...',
        'I recall you mentioning...',
        'You told me your philosophy is...',
        'I remember your principle about...',
        'As we discussed previously...',
      ];
    case 'peter':
      return [
        'You mentioned you know...',
        'Remember when you added... to your watchlist?',
        'I recall you saying...',
        "That reminds me - you're watching...",
        'You told me about your experience with...',
      ];
    case 'maya':
      return [
        'I remember you setting a goal to...',
        'You mentioned that... is tricky for you...',
        'I recall you working towards...',
        'You shared with me that...',
        'Last time you mentioned...',
      ];
    case 'jordan':
      return [
        'I have it noted that...',
        'You told me to remember...',
        'I recall you love...',
        'You mentioned your dream of...',
        "I haven't forgotten about...",
      ];
    case 'alex':
      return [
        'I remember you prefer...',
        'You mentioned your schedule...',
        "I've got it noted that...",
        'You told me to reach out via...',
        'I recall you saying...',
      ];
    default:
      return ['I remember...', 'You mentioned...', 'I recall...'];
  }
}

/**
 * Get a random acknowledgment phrase for when referencing a memory
 */
export function getRandomAcknowledgmentPhrase(personaId: NormalizedPersonaId): string {
  const phrases = getMemoryAcknowledgmentPhrases(personaId);
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildPersonaMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services, userProfile, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Get persona ID from services
  const rawPersonaId = (services as { personaId?: string }).personaId;
  const personaId = normalizePersonaId(rawPersonaId);

  if (!personaId || !userProfile?.id) {
    return injections;
  }

  // Get relationship stage for memory filtering
  const { relationshipStage } = userProfile;

  // Retrieve persona-specific memories (filtered by relationship stage)
  const memoryResult = await getPersonaMemories(
    userProfile.id,
    personaId,
    userData.name || userProfile.name,
    relationshipStage
  );

  if (!memoryResult || memoryResult.count === 0) {
    // No memories yet - hint to build relationship
    if (turnCount > 5 && Math.random() < 0.2) {
      injections.push(
        createHintInjection(
          'no_memories_hint',
          "[RELATIONSHIP BUILDING: You don't have specific memories stored for this user yet. Consider asking what they'd like you to remember about them.]"
        )
      );
    }
    return injections;
  }

  // Inject the formatted memories as context
  if (memoryResult.formatted.length > 0) {
    injections.push(
      createStandardInjection(
        'persona_memories',
        `[WHAT YOU REMEMBER ABOUT THIS USER - Reference these naturally!]\n${memoryResult.formatted}`
      )
    );
  }

  // Add proactive callback suggestion
  const callback = getProactiveMemoryCallback(memoryResult, turnCount, userData.name);
  if (callback) {
    injections.push(
      createHintInjection('memory_callback_suggestion', `[MEMORY CALLBACK: ${callback}]`)
    );
  }

  // Log memory injection for debugging
  getLogger().debug(
    {
      userId: userProfile.id,
      personaId,
      memoryCount: memoryResult.count,
      injectionCount: injections.length,
    },
    '🧠 Persona memories injected into context'
  );

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('persona_memory', buildPersonaMemoryContext);

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildPersonaMemoryContext,
  getPersonaMemories,
  normalizePersonaId,
  formatFerniMemories,
  formatBogleMemories,
  formatPeterMemories,
  formatMayaMemories,
  formatJordanMemories,
  filterMemoriesByRelationshipStage,
  getProactiveMemoryCallback,
  // getRandomAcknowledgmentPhrase already exported via `export function`
  type PersonaMemoryResult,
  type NormalizedPersonaId,
};
