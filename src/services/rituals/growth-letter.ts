/**
 * Growth Letter System
 *
 * Monthly email that feels like a letter from a friend.
 * Sent on the first Sunday of every month.
 *
 * Contains:
 * - Personal stats recap
 * - Memory callback (something they mentioned)
 * - Community story feature
 * - Monthly theme/focus
 * - What's new
 *
 * @module services/rituals/growth-letter
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GrowthLetter' });

// ============================================================================
// TYPES
// ============================================================================

export interface GrowthLetterData {
  userId: string;
  userName?: string;
  month: string;
  year: number;
  stats: UserMonthStats;
  memoryCallback?: MemoryCallback;
  communityStory?: CommunityStory;
  monthlyTheme: MonthlyTheme;
  whatsNew?: string[];
}

export interface UserMonthStats {
  conversationCount: number;
  totalMinutesTalked: number;
  dominantThemes: string[];
  moodTrend: 'improving' | 'stable' | 'challenging';
  personalInsight?: string;
}

export interface MemoryCallback {
  date: Date;
  quote: string;
  context: string;
}

export interface CommunityStory {
  quote: string;
  attribution: string; // "A Ferni user" or their name if they gave permission
}

export interface MonthlyTheme {
  name: string;
  prompt: string;
  description: string;
}

// ============================================================================
// MONTHLY THEMES (One per month)
// ============================================================================

const MONTHLY_THEMES: Record<number, MonthlyTheme> = {
  1: {
    name: 'Fresh Starts',
    prompt: 'What would you do differently if you could start fresh?',
    description:
      'January is for new beginnings—not resolutions that fade, but gentle intentions that grow.',
  },
  2: {
    name: 'Connection',
    prompt: 'Who deserves more of your presence this month?',
    description:
      'February is for love in all its forms—romantic, familial, self-directed, and unexpected.',
  },
  3: {
    name: 'Growth',
    prompt: 'What are you ready to let bloom?',
    description: 'March is for planting seeds—literally and metaphorically. Spring is coming.',
  },
  4: {
    name: 'Courage',
    prompt: "What would you do if you weren't afraid?",
    description: 'April asks us to be brave. Rain makes things grow.',
  },
  5: {
    name: 'Gratitude',
    prompt: 'What are you grateful for that you rarely acknowledge?',
    description: 'May is for appreciation—the flowers are blooming, and so are you.',
  },
  6: {
    name: 'Freedom',
    prompt: 'What would feel like freedom to you right now?',
    description: "June marks the halfway point. Time to release what's holding you back.",
  },
  7: {
    name: 'Rest',
    prompt: 'What kind of rest do you actually need?',
    description: 'July is for slowing down. Summer invites us to just... be.',
  },
  8: {
    name: 'Preparation',
    prompt: 'What are you getting ready for?',
    description: 'August is for gathering strength before the fall rush.',
  },
  9: {
    name: 'Reflection',
    prompt: 'What have you learned this year so far?',
    description: 'September invites us to look back before we look forward.',
  },
  10: {
    name: 'Courage',
    prompt: 'What fear is ready to be faced?',
    description: 'October is for facing the dark—with curiosity, not dread.',
  },
  11: {
    name: 'Abundance',
    prompt: 'What do you have more than enough of?',
    description: "November is for recognizing what's already here.",
  },
  12: {
    name: 'Completion',
    prompt: 'What are you ready to complete—or release?',
    description: 'December is for closing chapters with grace.',
  },
};

// ============================================================================
// EMAIL GENERATION
// ============================================================================

/**
 * Check if today is the first Sunday of the month
 */
export function isFirstSundayOfMonth(date: Date = new Date()): boolean {
  return date.getDay() === 0 && date.getDate() <= 7;
}

/**
 * Get current month's theme
 */
export function getCurrentTheme(): MonthlyTheme {
  const month = new Date().getMonth() + 1;
  return MONTHLY_THEMES[month];
}

/**
 * Generate Growth Letter subject
 */
export function generateSubject(month: string): string {
  return `${month}'s Growth Letter 🌱`;
}

/**
 * Generate Growth Letter email body
 */
export function generateEmailBody(data: GrowthLetterData): string {
  const greeting = data.userName ? `Hey ${data.userName},` : 'Hey,';

  let email = `${greeting}

A new month.

I wanted to share a few things:

`;

  // Personal stats section
  email += `📊 **YOUR MONTH**
You had ${data.stats.conversationCount} conversations with us in ${data.month}.`;

  if (data.stats.dominantThemes.length > 0) {
    email += `
You mentioned ${data.stats.dominantThemes.join(', ')} more than usual.`;
  }

  if (data.stats.personalInsight) {
    email += `
${data.stats.personalInsight}`;
  }

  email += '\n\n';

  // Memory callback (if available)
  if (data.memoryCallback) {
    email += `💭 **A MOMENT I REMEMBER**
Back in ${formatDate(data.memoryCallback.date)}, you said:
"${data.memoryCallback.quote}"

${data.memoryCallback.context}

`;
  }

  // Community story (if available)
  if (data.communityStory) {
    email += `💚 **FROM THE COMMUNITY**
${data.communityStory.quote}
— ${data.communityStory.attribution}

`;
  }

  // Monthly theme
  email += `🌿 **THIS MONTH'S FOCUS**
${data.monthlyTheme.description}

One question to sit with:
"${data.monthlyTheme.prompt}"

`;

  // What's new (if available)
  if (data.whatsNew && data.whatsNew.length > 0) {
    email += `📦 **WHAT'S NEW**
`;
    for (const item of data.whatsNew) {
      email += `• ${item}
`;
    }
    email += '\n';
  }

  // Closing
  email += `Thanks for being here.

With warmth,
Ferni

P.S. ${getSeasonalPS()}`;

  return email;
}

/**
 * Generate HTML version of the Growth Letter
 */
export function generateHtmlEmail(data: GrowthLetterData): string {
  const greeting = data.userName ? `Hey ${data.userName},` : 'Hey,';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.month}'s Growth Letter</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #2C2520;
      background-color: #F5F1E8;
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo img {
      width: 48px;
      height: 48px;
    }
    h1 {
      color: #4a6741;
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    h2 {
      color: #4a6741;
      font-size: 16px;
      font-weight: 600;
      margin-top: 30px;
      margin-bottom: 10px;
    }
    .section {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .quote {
      font-style: italic;
      color: #5a5a5a;
      border-left: 3px solid #4a6741;
      padding-left: 15px;
      margin: 15px 0;
    }
    .theme-prompt {
      background: #f0f5ee;
      border-radius: 8px;
      padding: 15px;
      font-size: 18px;
      color: #3d5a45;
      text-align: center;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      margin-top: 40px;
    }
    .signature {
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="logo">
    <img src="https://ferni.ai/images/ferni-logo.png" alt="Ferni" />
  </div>
  
  <p>${greeting}</p>
  <p>A new month.</p>
  <p>I wanted to share a few things:</p>
  
  <div class="section">
    <h2>📊 YOUR MONTH</h2>
    <p>You had <strong>${data.stats.conversationCount}</strong> conversations with us in ${data.month}.</p>
    ${data.stats.dominantThemes.length > 0 ? `<p>You mentioned <strong>${data.stats.dominantThemes.join(', ')}</strong> more than usual.</p>` : ''}
    ${data.stats.personalInsight ? `<p>${data.stats.personalInsight}</p>` : ''}
  </div>
  
  ${
    data.memoryCallback
      ? `
  <div class="section">
    <h2>💭 A MOMENT I REMEMBER</h2>
    <p>Back in ${formatDate(data.memoryCallback.date)}, you said:</p>
    <div class="quote">"${data.memoryCallback.quote}"</div>
    <p>${data.memoryCallback.context}</p>
  </div>
  `
      : ''
  }
  
  ${
    data.communityStory
      ? `
  <div class="section">
    <h2>💚 FROM THE COMMUNITY</h2>
    <div class="quote">"${data.communityStory.quote}"</div>
    <p>— ${data.communityStory.attribution}</p>
  </div>
  `
      : ''
  }
  
  <div class="section">
    <h2>🌿 THIS MONTH'S FOCUS</h2>
    <p>${data.monthlyTheme.description}</p>
    <div class="theme-prompt">"${data.monthlyTheme.prompt}"</div>
  </div>
  
  ${
    data.whatsNew && data.whatsNew.length > 0
      ? `
  <div class="section">
    <h2>📦 WHAT'S NEW</h2>
    <ul>
      ${data.whatsNew.map((item) => `<li>${item}</li>`).join('')}
    </ul>
  </div>
  `
      : ''
  }
  
  <div class="signature">
    <p>Thanks for being here.</p>
    <p>With warmth,<br><strong>Ferni</strong></p>
    <p><em>P.S. ${getSeasonalPS()}</em></p>
  </div>
  
  <div class="footer">
    <p>Ferni • Making AI Human</p>
    <p><a href="https://ferni.ai/unsubscribe">Unsubscribe</a> • <a href="https://ferni.ai/preferences">Email Preferences</a></p>
  </div>
</body>
</html>
`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getSeasonalPS(): string {
  const month = new Date().getMonth() + 1;

  const psByMonth: Record<number, string> = {
    1: "New year, but no pressure. You're exactly where you need to be.",
    2: "If you need some extra warmth this month, I'm here.",
    3: 'Spring is coming. So is your next breakthrough.',
    4: "April showers bring... actually, I'm not sure what. Let's find out together.",
    5: 'The flowers are blooming. What about you?',
    6: 'Halfway through the year. How are you feeling about it?',
    7: 'Summer invites slowness. Take it.',
    8: 'The best adventures often happen in August.',
    9: 'September always feels like a fresh start. Use it.',
    10: 'The leaves are changing. Maybe you are too.',
    11: "Gratitude season is here. I'm grateful for you.",
    12: 'End of year. Be gentle with yourself.',
  };

  return psByMonth[month] || 'Take good care of yourself.';
}

// ============================================================================
// DATA AGGREGATION
// ============================================================================

/**
 * Calculate user stats for the previous month
 * This would typically pull from actual user data
 */
export function calculateMonthStats(
  conversationCount: number,
  totalMinutes: number,
  themes: string[],
  moodTrend: 'improving' | 'stable' | 'challenging'
): UserMonthStats {
  return {
    conversationCount,
    totalMinutesTalked: totalMinutes,
    dominantThemes: themes.slice(0, 3), // Top 3 themes
    moodTrend,
    personalInsight: generatePersonalInsight(moodTrend, themes),
  };
}

function generatePersonalInsight(
  moodTrend: 'improving' | 'stable' | 'challenging',
  themes: string[]
): string {
  if (moodTrend === 'improving') {
    return 'Something shifted this month—in a good way. I noticed.';
  } else if (moodTrend === 'challenging') {
    return "It's been a tough month. You showed up anyway. That matters.";
  } else if (themes.includes('work') || themes.includes('career')) {
    return 'Work has been on your mind. Balance is a practice, not a destination.';
  } else if (themes.includes('relationships')) {
    return "You've been thinking about connection. That's human.";
  }
  return "Another month of showing up. That's no small thing.";
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  isFirstSundayOfMonth,
  getCurrentTheme,
  generateSubject,
  generateEmailBody,
  generateHtmlEmail,
  calculateMonthStats,
  MONTHLY_THEMES,
};
