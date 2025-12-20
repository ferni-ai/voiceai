/**
 * Ferni Content Tokens
 * Auto-generated from tokens/content.json - DO NOT EDIT DIRECTLY
 * 
 * Usage:
 *   import { CONTENT, getContent, validateCopy } from '@design-system/content';
 *   
 *   // Get content by path
 *   const headline = getContent('empty.firstTime.conversations.headline');
 *   
 *   // Validate copy for banned words
 *   const issues = validateCopy('Welcome to our AI chatbot!');
 */

// ============================================================================
// CONTENT TOKENS
// ============================================================================

export const CONTENT = {
  "$schema": "./schema.json",
  "meta": {
    "name": "Ferni Content Tokens",
    "description": "Brand-compliant microcopy, messages, and content patterns",
    "version": "1.0.0"
  },
  "voice": {
    "_description": "Voice principles that guide all copy",
    "principles": [
      "Warm, not saccharine",
      "Confident, not arrogant",
      "Present, not performative",
      "Direct, not blunt",
      "Human, not human-ish"
    ],
    "bannedWords": [
      "chatbot",
      "bot",
      "AI assistant",
      "virtual assistant",
      "therapist",
      "advisor",
      "therapy",
      "typical",
      "unlike other AI",
      "user",
      "utilize",
      "leverage",
      "solution",
      "platform",
      "features",
      "functionality",
      "natural language",
      "algorithm"
    ],
    "bannedPhrases": [
      "As an AI...",
      "I'm designed to...",
      "My programming...",
      "24/7 availability",
      "Unlimited conversations",
      "Digital companion"
    ]
  },
  "loading": {
    "app": {
      "default": "One moment...",
      "startup": "Waking up...",
      "connecting": "Finding you...",
      "almostReady": "Almost there..."
    },
    "persona": {
      "thinking": "Thinking...",
      "processing": "Let me think about that...",
      "searching": "Looking into that..."
    },
    "content": {
      "fetching": "Getting your data...",
      "saving": "Saving...",
      "syncing": "Syncing..."
    },
    "action": {
      "default": "Working on it...",
      "uploading": "Uploading...",
      "downloading": "Downloading..."
    }
  },
  "empty": {
    "firstTime": {
      "conversations": {
        "eyebrow": "YOUR JOURNEY",
        "headline": "Every great friendship starts somewhere.",
        "body": "We're here whenever you're ready to talk. No pressure, no judgment—just a voice that listens.",
        "cta": "Start a Conversation"
      },
      "team": {
        "eyebrow": "YOUR TEAM",
        "headline": "Meet Ferni first.",
        "body": "As we get to know each other, more specialists will join your team. It's not about gatekeeping—it's about building a relationship that matters.",
        "cta": "Talk to Ferni",
        "secondary": "Learn about the team"
      },
      "progress": {
        "eyebrow": "YOUR PROGRESS",
        "headline": "The path is waiting.",
        "body": "After a few conversations, we'll start to see patterns—the growth, the wins, the moments that matter. For now, just talk.",
        "cta": "Start Your Journey"
      }
    },
    "collection": {
      "wins": {
        "headline": "We're watching for wins.",
        "body": "Every time you follow through, show courage, or take care of yourself, we'll celebrate. The first win is just a conversation away."
      },
      "boundaries": {
        "headline": "Your space, your rules.",
        "body": "As we learn what matters to you—and what doesn't—we'll remember. We're here to respect your boundaries, not test them."
      },
      "insideJokes": {
        "headline": "Shared history takes time.",
        "body": "The inside jokes, the callbacks, the \"remember when\"s—they come from conversations. Let's make some memories."
      },
      "notifications": {
        "headline": "All caught up.",
        "body": "When something matters, we'll let you know."
      }
    },
    "search": {
      "noResults": {
        "headline": "Nothing quite matched that.",
        "body": "Try different words, or browse instead.",
        "cta": "Clear Search",
        "secondary": "Browse All"
      },
      "noFilters": {
        "headline": "Nothing here with those filters.",
        "body": "Try removing some filters to see more.",
        "cta": "Clear Filters"
      }
    }
  },
  "error": {
    "connection": {
      "temporary": {
        "headline": "Taking a breath.",
        "body": "We lost connection for a moment. Trying to reconnect now..."
      },
      "failed": {
        "headline": "We couldn't reconnect.",
        "body": "Something's getting in the way. Check your internet connection and try again.",
        "cta": "Try Again",
        "secondary": "Check Status"
      },
      "serverDown": {
        "headline": "We're taking a moment.",
        "body": "Our servers are catching their breath. This usually resolves quickly.",
        "cta": "Refresh"
      }
    },
    "api": {
      "generic": {
        "headline": "Something unexpected happened.",
        "body": "We hit a bump, but we're looking into it. Your data is safe.",
        "cta": "Try Again",
        "secondary": "Contact Support"
      },
      "rateLimit": {
        "headline": "Let's slow down a moment.",
        "body": "We limit how fast things can happen to keep everything running smoothly. Ready to continue in {countdown}."
      },
      "notFound": {
        "headline": "That page doesn't exist.",
        "body": "It might have moved, or the link might be wrong.",
        "cta": "Go Home",
        "secondary": "Search for something"
      },
      "unauthorized": {
        "headline": "You need to sign in first.",
        "body": "This content is for signed-in users. It only takes a moment.",
        "cta": "Sign In",
        "secondary": "Learn About Ferni"
      }
    },
    "user": {
      "actionFailed": {
        "headline": "That didn't work.",
        "body": "{reason} Want to try again?",
        "cta": "Try Again"
      }
    },
    "validation": {
      "email": "That doesn't look like an email. Mind checking?",
      "password": "A bit longer—8 characters minimum.",
      "required": "We need this one.",
      "tooLong": "That's a bit too long.",
      "tooShort": "A little more, please.",
      "invalid": "That doesn't look quite right.",
      "mismatch": "These don't match."
    }
  },
  "offline": {
    "banner": "You're offline. We'll save your progress and sync when you're back.",
    "featureBlocked": {
      "headline": "This needs a connection.",
      "body": "You're offline right now. We'll be here when you're back."
    },
    "backOnline": "We're back!"
  },
  "permissions": {
    "microphone": {
      "request": {
        "headline": "Ready to talk?",
        "body": "Ferni needs microphone access to hear you. We only listen when you're speaking—never in the background.",
        "cta": "Enable Microphone",
        "secondary": "Maybe later"
      },
      "denied": {
        "headline": "We can't hear you.",
        "body": "Microphone access was denied. You can change this in your browser settings.",
        "cta": "Open Settings",
        "secondary": "Type instead"
      }
    },
    "notifications": {
      "request": {
        "headline": "Stay in the loop?",
        "body": "We'll only notify you for things that matter—like when we're thinking of you.",
        "cta": "Enable Notifications",
        "secondary": "Not now"
      },
      "denied": {
        "headline": "Notifications are off.",
        "body": "That's okay—you can always turn them on later in settings."
      }
    }
  },
  "success": {
    "saved": "Saved!",
    "updated": "Updated",
    "deleted": "Removed",
    "sent": "Sent",
    "copied": "Copied",
    "connected": "Connected",
    "synced": "Synced"
  },
  "toast": {
    "info": {
      "newTeamMember": "New team member available!",
      "featureUnlocked": "New feature unlocked",
      "streakMilestone": "{days} day streak! 🎉",
      "sessionSaved": "Session saved"
    },
    "success": {
      "progressSaved": "Progress saved",
      "settingsUpdated": "Settings updated",
      "goalSet": "Goal set!",
      "habitCreated": "Habit created"
    },
    "warning": {
      "sessionExpiring": "Session expiring soon",
      "lowMessages": "Messages running low",
      "unsavedChanges": "You have unsaved changes"
    },
    "error": {
      "saveFailed": "Couldn't save that",
      "connectionLost": "Connection lost",
      "tryAgain": "Something went wrong. Try again?"
    }
  },
  "celebration": {
    "smallWin": {
      "messages": [
        "Nice!",
        "Well done.",
        "You did it.",
        "Progress!",
        "That counts."
      ]
    },
    "bigWin": {
      "messages": [
        "This is huge!",
        "I'm so proud of you.",
        "You earned this.",
        "Look at you go!",
        "This matters."
      ]
    },
    "streak": {
      "3": "3 days strong!",
      "7": "A full week. Impressive.",
      "14": "Two weeks of showing up.",
      "30": "A month! You're building something.",
      "60": "60 days. This is who you are now.",
      "100": "100 days. Extraordinary.",
      "365": "A whole year. You've changed."
    },
    "teamUnlock": {
      "headline": "Meet {name}",
      "eyebrow": "TEAM MEMBER UNLOCKED",
      "body": "{name} has joined your team.",
      "cta": "Say Hello"
    }
  },
  "persona": {
    "ferni": {
      "title": "Life Coach",
      "tagline": "Your companion who pays attention",
      "greeting": "Hey. What's on your mind?"
    },
    "peter": {
      "title": "Research Specialist",
      "tagline": "Curious by nature, thorough by design",
      "greeting": "I've been thinking about something. Want to explore it together?"
    },
    "alex": {
      "title": "Communications Coach",
      "tagline": "Clarity in every conversation",
      "greeting": "Let's get clear on what you want to say."
    },
    "maya": {
      "title": "Habit Architect",
      "tagline": "Building routines that stick",
      "greeting": "Ready to work on something consistent?"
    },
    "jordan": {
      "title": "Event Planner",
      "tagline": "Celebration is a skill",
      "greeting": "What are we planning?"
    },
    "nayan": {
      "title": "Wisdom Guide",
      "tagline": "The bigger picture, always",
      "greeting": "What's weighing on you?"
    }
  },
  "cta": {
    "primary": {
      "startConversation": "Start a Conversation",
      "beginJourney": "Begin a real conversation",
      "meetFerni": "Meet Ferni",
      "continue": "Continue",
      "confirm": "Confirm",
      "save": "Save",
      "done": "Done"
    },
    "secondary": {
      "learnMore": "See how it works",
      "maybe later": "Maybe later",
      "notNow": "Not now",
      "cancel": "Cancel",
      "back": "Go Back",
      "skip": "Skip for now"
    }
  },
  "labels": {
    "eyebrows": {
      "journey": "YOUR JOURNEY",
      "team": "YOUR TEAM",
      "progress": "YOUR PROGRESS",
      "settings": "SETTINGS",
      "privacy": "YOUR DATA",
      "subscription": "YOUR PLAN"
    }
  },
  "placeholders": {
    "search": "Search...",
    "message": "Type a message...",
    "email": "your@email.com",
    "name": "Your name"
  },
  "accessibility": {
    "close": "Close",
    "menu": "Menu",
    "settings": "Settings",
    "back": "Go back",
    "loading": "Loading",
    "expand": "Expand",
    "collapse": "Collapse",
    "play": "Play",
    "pause": "Pause",
    "mute": "Mute",
    "unmute": "Unmute"
  },
  "timeAgo": {
    "now": "Just now",
    "minute": "{n} minute ago",
    "minutes": "{n} minutes ago",
    "hour": "{n} hour ago",
    "hours": "{n} hours ago",
    "day": "Yesterday",
    "days": "{n} days ago",
    "week": "Last week",
    "weeks": "{n} weeks ago",
    "month": "Last month",
    "months": "{n} months ago"
  }
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ContentPath = 
  | 'loading.app.default'
  | 'loading.app.startup'
  | 'loading.app.connecting'
  | 'loading.app.almostReady'
  | 'loading.persona.thinking'
  | 'loading.persona.processing'
  | 'loading.content.fetching'
  | 'loading.content.saving'
  | 'loading.action.default'
  | 'empty.firstTime.conversations.headline'
  | 'empty.firstTime.conversations.body'
  | 'empty.firstTime.conversations.cta'
  | 'empty.firstTime.team.headline'
  | 'empty.firstTime.team.body'
  | 'empty.firstTime.progress.headline'
  | 'empty.collection.wins.headline'
  | 'empty.collection.boundaries.headline'
  | 'empty.search.noResults.headline'
  | 'empty.search.noResults.body'
  | 'error.connection.temporary.headline'
  | 'error.connection.temporary.body'
  | 'error.connection.failed.headline'
  | 'error.connection.failed.body'
  | 'error.api.generic.headline'
  | 'error.api.generic.body'
  | 'error.validation.email'
  | 'error.validation.password'
  | 'error.validation.required'
  | 'offline.banner'
  | 'offline.backOnline'
  | 'success.saved'
  | 'success.updated'
  | 'success.connected'
  | 'toast.info.newTeamMember'
  | 'toast.success.progressSaved'
  | 'toast.warning.sessionExpiring'
  | 'toast.error.connectionLost'
  | 'celebration.smallWin.messages'
  | 'celebration.bigWin.messages'
  | 'persona.ferni.title'
  | 'persona.ferni.tagline'
  | 'persona.ferni.greeting'
  | 'cta.primary.startConversation'
  | 'cta.primary.continue'
  | 'cta.secondary.learnMore'
  | 'cta.secondary.cancel'
  | 'labels.eyebrows.journey'
  | 'labels.eyebrows.team'
  | 'placeholders.search'
  | 'placeholders.message'
  | 'accessibility.close'
  | 'accessibility.menu'
  | (string & {}); // Allow any string for flexibility

export type PersonaId = 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get content by dot-notation path
 * @param path - Dot-notation path like 'empty.firstTime.conversations.headline'
 * @param interpolations - Object of values to interpolate into the string
 */
export function getContent(
  path: ContentPath,
  interpolations?: Record<string, string | number>
): string {
  const parts = path.split('.');
  let current: any = CONTENT;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      console.warn(`[Content] Path not found: ${path}`);
      return path; // Return the path as fallback
    }
  }
  
  if (typeof current !== 'string') {
    console.warn(`[Content] Path does not resolve to string: ${path}`);
    return path;
  }
  
  // Handle interpolations like {name} or {countdown}
  if (interpolations) {
    return current.replace(/\{(\w+)\}/g, (match, key) => {
      return key in interpolations ? String(interpolations[key]) : match;
    });
  }
  
  return current;
}

/**
 * Get a random message from an array of messages (for celebrations)
 */
export function getRandomMessage(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get persona content
 */
export function getPersonaContent(personaId: PersonaId) {
  return CONTENT.persona[personaId] || CONTENT.persona.ferni;
}

/**
 * Get streak message for a given number of days
 */
export function getStreakMessage(days: number): string {
  const streaks = CONTENT.celebration.streak as Record<string, string>;
  
  // Find the closest milestone
  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const milestone = milestones.find(m => m >= days) || 365;
  
  return streaks[String(milestone)] || `${days} days!`;
}

/**
 * Format relative time
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return CONTENT.timeAgo.now;
  if (diffMins === 1) return CONTENT.timeAgo.minute.replace('{n}', '1');
  if (diffMins < 60) return CONTENT.timeAgo.minutes.replace('{n}', String(diffMins));
  if (diffHours === 1) return CONTENT.timeAgo.hour.replace('{n}', '1');
  if (diffHours < 24) return CONTENT.timeAgo.hours.replace('{n}', String(diffHours));
  if (diffDays === 1) return CONTENT.timeAgo.day;
  if (diffDays < 7) return CONTENT.timeAgo.days.replace('{n}', String(diffDays));
  if (diffDays < 14) return CONTENT.timeAgo.week;
  if (diffDays < 30) return CONTENT.timeAgo.weeks.replace('{n}', String(Math.floor(diffDays / 7)));
  if (diffDays < 60) return CONTENT.timeAgo.month;
  return CONTENT.timeAgo.months.replace('{n}', String(Math.floor(diffDays / 30)));
}

// ============================================================================
// BRAND COMPLIANCE
// ============================================================================

export const BANNED_WORDS = [
  "chatbot",
  "bot",
  "AI assistant",
  "virtual assistant",
  "therapist",
  "advisor",
  "therapy",
  "typical",
  "unlike other AI",
  "user",
  "utilize",
  "leverage",
  "solution",
  "platform",
  "features",
  "functionality",
  "natural language",
  "algorithm"
];

export const BANNED_PHRASES = [
  "As an AI...",
  "I'm designed to...",
  "My programming...",
  "24/7 availability",
  "Unlimited conversations",
  "Digital companion"
];

export interface CopyValidationIssue {
  type: 'banned-word' | 'banned-phrase';
  match: string;
  suggestion?: string;
}

const WORD_SUGGESTIONS: Record<string, string> = {
  'chatbot': 'Ferni, companion',
  'bot': 'Ferni, companion',
  'user': 'you, people',
  'users': 'people, everyone',
  'utilize': 'use',
  'leverage': 'use, with',
  'solution': 'help, support, way',
  'platform': 'Ferni (or omit)',
  'features': 'what makes us different',
  'functionality': 'what it does',
  'therapist': 'coach, mentor, friend',
  'advisor': 'coach, mentor, guide',
  'therapy': 'support, guidance, coaching',
};

/**
 * Validate copy for banned words and phrases
 * @returns Array of issues found, empty if copy is compliant
 */
export function validateCopy(text: string): CopyValidationIssue[] {
  const issues: CopyValidationIssue[] = [];
  const lowerText = text.toLowerCase();
  
  // Check banned phrases first
  for (const phrase of BANNED_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      issues.push({
        type: 'banned-phrase',
        match: phrase,
      });
    }
  }
  
  // Check banned words
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      issues.push({
        type: 'banned-word',
        match: word,
        suggestion: WORD_SUGGESTIONS[word.toLowerCase()],
      });
    }
  }
  
  return issues;
}

/**
 * Check if copy is brand-compliant
 */
export function isBrandCompliant(text: string): boolean {
  return validateCopy(text).length === 0;
}
