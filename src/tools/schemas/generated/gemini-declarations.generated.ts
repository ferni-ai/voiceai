/**
 * Gemini Function Declarations
 *
 * This file is auto-generated from tool schemas. Do not edit directly.
 * Edit schema files in `src/tools/schemas/` and run `pnpm tools:generate`.
 *
 * Generated: 2026-01-19T13:03:09.429Z
 * Schemas: 14 files, 45 tools
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, GeminiParameter>;
    required?: string[];
  };
}

export interface GeminiParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

// ============================================================================
// DECLARATIONS
// ============================================================================

/**
 * All function declarations for Gemini native function calling.
 * Use with: tools: [{ functionDeclarations }]
 */
export const functionDeclarations: GeminiFunctionDeclaration[] = 
[
  {
    "name": "rememberAboutUser",
    "description": "Store an important fact about the user with semantic embedding for future recall. Facts persist across all sessions and are searchable by meaning.",
    "parameters": {
      "type": "object",
      "properties": {
        "fact": {
          "type": "string",
          "description": "The fact to remember with full context. Examples: 'has two kids named Maya and Jake, ages 8 and 12', 'retiring next year from teaching biology', 'worried about healthcare costs'"
        },
        "category": {
          "type": "string",
          "description": "Category for the memory",
          "enum": [
            "personal",
            "financial",
            "emotional",
            "goal",
            "preference"
          ]
        },
        "importance": {
          "type": "string",
          "description": "How important this fact is",
          "enum": [
            "low",
            "medium",
            "high"
          ]
        }
      },
      "required": [
        "fact",
        "category"
      ]
    }
  },
  {
    "name": "recallFromMemory",
    "description": "Semantic search across stored memories. Finds memories by meaning, not just keywords.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "What to recall - conceptual, not exact match. Examples: 'retirement plans', 'family situation', 'their concerns'"
        }
      },
      "required": [
        "topic"
      ]
    }
  },
  {
    "name": "playMusic",
    "description": "Play music by search query. Use when user says: 'play music', 'play some music', 'play a song', 'put on music'. Searches music catalog and starts playback immediately.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Music search query. Can be: song title ('Bohemian Rhapsody'), artist name ('The Beatles'), genre ('jazz'), mood ('relaxing', 'chill', 'upbeat'), or combination ('calm late night music')."
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "musicControl",
    "description": "Control music playback: pause, resume, skip, volume. Use for playback control commands.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "Playback action to perform",
          "enum": [
            "pause",
            "resume",
            "skip",
            "volume",
            "stop"
          ]
        },
        "level": {
          "type": "integer",
          "description": "Volume level 0-100 (only for volume action)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "musicInfo",
    "description": "Get information about currently playing music or recent history.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "What info to get",
          "enum": [
            "playing",
            "history",
            "queue"
          ]
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "getNews",
    "description": "Get current news headlines. Your training data is outdated - never make up headlines, always call this tool for news requests.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "News topic or category to filter by",
          "enum": [
            "general",
            "technology",
            "business",
            "sports",
            "entertainment",
            "science",
            "health"
          ]
        },
        "query": {
          "type": "string",
          "description": "Specific search query for news"
        }
      },
      "required": []
    }
  },
  {
    "name": "reachOut",
    "description": "Contact a person via call, text, or email. Auto-selects the best channel. Use when user wants to communicate with a human contact.",
    "parameters": {
      "type": "object",
      "properties": {
        "contact": {
          "type": "string",
          "description": "Name of the person to contact. Must be a real human contact like 'Mom', 'John Smith', 'my boss'."
        },
        "purpose": {
          "type": "string",
          "description": "Why contacting this person: 'wish happy birthday', 'check in', 'ask a question'."
        },
        "preferredChannel": {
          "type": "string",
          "description": "Preferred communication channel",
          "enum": [
            "text",
            "call",
            "email",
            "auto"
          ]
        }
      },
      "required": [
        "contact",
        "purpose"
      ]
    }
  },
  {
    "name": "callOnBehalf",
    "description": "Make a phone call on behalf of the user. An AI agent handles the conversation autonomously.",
    "parameters": {
      "type": "object",
      "properties": {
        "contactQuery": {
          "type": "string",
          "description": "Who to call - name or description like 'my boss', 'the restaurant', 'doctor's office'"
        },
        "phoneNumber": {
          "type": "string",
          "description": "Phone number if provided directly by user"
        },
        "purpose": {
          "type": "string",
          "description": "Purpose of the call"
        }
      },
      "required": [
        "contactQuery",
        "purpose"
      ]
    }
  },
  {
    "name": "addTask",
    "description": "Add a new task to the user's task list.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "The task title or description"
        },
        "priority": {
          "type": "string",
          "description": "Task priority level",
          "enum": [
            "high",
            "medium",
            "low"
          ]
        },
        "dueDate": {
          "type": "string",
          "description": "When the task is due. Can be natural language like 'tomorrow', 'next week', or a date."
        }
      },
      "required": [
        "title"
      ]
    }
  },
  {
    "name": "getTasks",
    "description": "Get the user's task list.",
    "parameters": {
      "type": "object",
      "properties": {
        "filter": {
          "type": "string",
          "description": "Filter tasks by status",
          "enum": [
            "all",
            "pending",
            "completed",
            "overdue"
          ]
        }
      },
      "required": []
    }
  },
  {
    "name": "completeTask",
    "description": "Mark a task as completed.",
    "parameters": {
      "type": "object",
      "properties": {
        "taskName": {
          "type": "string",
          "description": "Name or partial name of the task to complete"
        }
      },
      "required": [
        "taskName"
      ]
    }
  },
  {
    "name": "getCurrentTime",
    "description": "Get the current time in user's local timezone or a specific timezone.",
    "parameters": {
      "type": "object",
      "properties": {
        "timezone": {
          "type": "string",
          "description": "Timezone to get time for. Examples: 'America/New_York', 'Europe/London', 'Asia/Tokyo'. Defaults to user's local timezone."
        }
      },
      "required": []
    }
  },
  {
    "name": "getCalendar",
    "description": "Get calendar events for today or a specific date range.",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "description": "Date to check. Can be 'today', 'tomorrow', 'this week', or a specific date."
        }
      },
      "required": []
    }
  },
  {
    "name": "scheduleReminder",
    "description": "Set a reminder for a specific time.",
    "parameters": {
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "description": "What to be reminded about"
        },
        "when": {
          "type": "string",
          "description": "When to be reminded. Can be natural language like '5pm', 'in 30 minutes', 'tomorrow at 9am'."
        }
      },
      "required": [
        "message",
        "when"
      ]
    }
  },
  {
    "name": "getWeather",
    "description": "Get current weather conditions or forecast. Location is auto-detected via IP - only include location if user specifies a different city.",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "Location for weather. Can be city name, zip code. Only include if user specifies a location different from their current location."
        },
        "type": {
          "type": "string",
          "description": "Type of weather info to get",
          "enum": [
            "current",
            "forecast",
            "hourly"
          ]
        }
      },
      "required": []
    }
  },
  {
    "name": "handoffToMaya",
    "description": "Transfer conversation to Maya Santos, who specializes in habits, routines, productivity, and behavior change.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for the handoff. Examples: 'wants to build a morning routine', 'struggling with exercise', 'breaking phone addiction'"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "handoffToAlex",
    "description": "Transfer conversation to Alex Chen, who specializes in communication, email writing, calendar management, and professional correspondence.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for the handoff. Examples: 'drafting an important email', 'salary negotiation prep', 'improving communication'"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "handoffToPeter",
    "description": "Transfer conversation to Peter John, who specializes in research, data analysis, stock market insights, and financial trends.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for the handoff. Examples: 'researching a stock', 'understanding market trends', 'investment analysis'"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "handoffToJordan",
    "description": "Transfer conversation to Jordan Taylor, who specializes in life planning, event organization, celebrations, and milestones.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for the handoff. Examples: 'planning a birthday', 'organizing a reunion', 'wedding planning'"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "handoffToNayan",
    "description": "Transfer conversation to Nayan Patel, who specializes in wisdom, philosophical perspective, meaning-making, and spiritual guidance.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for the handoff. Examples: 'seeking life perspective', 'discussing purpose', 'existential questioning'"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "handoffToFerni",
    "description": "Transfer conversation back to Ferni, the main life coach and coordinator.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Brief context for returning to Ferni"
        }
      },
      "required": [
        "reason"
      ]
    }
  },
  {
    "name": "draftEmail",
    "description": "Draft an email with Alex's communication expertise. Helps craft professional, clear, and effective emails.",
    "parameters": {
      "type": "object",
      "properties": {
        "to": {
          "type": "string",
          "description": "Recipient name or relationship (e.g., 'my boss', 'the team', 'client')"
        },
        "subject": {
          "type": "string",
          "description": "Email subject or topic"
        },
        "tone": {
          "type": "string",
          "description": "Tone of the email",
          "enum": [
            "professional",
            "friendly",
            "formal",
            "casual",
            "apologetic",
            "assertive"
          ]
        },
        "purpose": {
          "type": "string",
          "description": "What the email needs to accomplish"
        }
      },
      "required": [
        "purpose"
      ]
    }
  },
  {
    "name": "prepareConversation",
    "description": "Help prepare for a difficult or important conversation. Alex provides talking points, tone guidance, and anticipates responses.",
    "parameters": {
      "type": "object",
      "properties": {
        "with": {
          "type": "string",
          "description": "Who the conversation is with"
        },
        "topic": {
          "type": "string",
          "description": "What the conversation is about"
        },
        "goal": {
          "type": "string",
          "description": "What you want to achieve from this conversation"
        }
      },
      "required": [
        "topic"
      ]
    }
  },
  {
    "name": "scheduleEvent",
    "description": "Schedule a meeting or event on the calendar.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Event title"
        },
        "when": {
          "type": "string",
          "description": "When to schedule. Can be natural language like 'tomorrow at 2pm', 'next Monday morning'"
        },
        "duration": {
          "type": "string",
          "description": "How long the event is. Examples: '30 minutes', '1 hour'"
        },
        "with": {
          "type": "string",
          "description": "Attendees or participants"
        }
      },
      "required": [
        "title",
        "when"
      ]
    }
  },
  {
    "name": "analyzeCommunication",
    "description": "Analyze a communication (email, message, conversation) and provide feedback on tone, clarity, and effectiveness.",
    "parameters": {
      "type": "object",
      "properties": {
        "content": {
          "type": "string",
          "description": "The text to analyze"
        },
        "context": {
          "type": "string",
          "description": "Context about the communication situation"
        }
      },
      "required": [
        "content"
      ]
    }
  },
  {
    "name": "teamIntro",
    "description": "Introduce the Ferni team and their specialties. Use when user asks about the team, who they can talk to, or what help is available.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "checkIn",
    "description": "Run a check-in with the user to see how they're doing. Activates reflective conversation mode.",
    "parameters": {
      "type": "object",
      "properties": {
        "depth": {
          "type": "string",
          "description": "Depth of check-in",
          "enum": [
            "quick",
            "regular",
            "deep"
          ]
        }
      },
      "required": []
    }
  },
  {
    "name": "getUserSnapshot",
    "description": "Get an overview of user's current state across all domains: habits, goals, calendar, recent conversations.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "planEvent",
    "description": "Start planning an event or celebration. Jordan helps with all aspects of event planning from intimate gatherings to major milestones.",
    "parameters": {
      "type": "object",
      "properties": {
        "eventType": {
          "type": "string",
          "description": "Type of event: birthday, wedding, reunion, party, dinner, celebration"
        },
        "date": {
          "type": "string",
          "description": "When the event should be"
        },
        "size": {
          "type": "string",
          "description": "Approximate number of guests",
          "enum": [
            "intimate (2-10)",
            "small (10-25)",
            "medium (25-50)",
            "large (50+)"
          ]
        },
        "vibe": {
          "type": "string",
          "description": "The desired atmosphere"
        }
      },
      "required": [
        "eventType"
      ]
    }
  },
  {
    "name": "trackMilestone",
    "description": "Track an important milestone or anniversary. Jordan remembers and helps celebrate special moments.",
    "parameters": {
      "type": "object",
      "properties": {
        "milestone": {
          "type": "string",
          "description": "What milestone to track"
        },
        "date": {
          "type": "string",
          "description": "Date of the milestone"
        },
        "person": {
          "type": "string",
          "description": "Who the milestone is for"
        },
        "recurring": {
          "type": "boolean",
          "description": "Whether this repeats annually"
        }
      },
      "required": [
        "milestone",
        "date"
      ]
    }
  },
  {
    "name": "suggestVenue",
    "description": "Suggest venues or locations for an event based on requirements.",
    "parameters": {
      "type": "object",
      "properties": {
        "eventType": {
          "type": "string",
          "description": "What kind of event"
        },
        "location": {
          "type": "string",
          "description": "City or area to search"
        },
        "budget": {
          "type": "string",
          "description": "Budget range"
        },
        "requirements": {
          "type": "array",
          "description": "Specific requirements",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "eventType"
      ]
    }
  },
  {
    "name": "createGuestList",
    "description": "Manage the guest list for an event.",
    "parameters": {
      "type": "object",
      "properties": {
        "event": {
          "type": "string",
          "description": "Which event this is for"
        },
        "action": {
          "type": "string",
          "description": "What to do",
          "enum": [
            "add",
            "remove",
            "list",
            "rsvp"
          ]
        },
        "guests": {
          "type": "array",
          "description": "Guest names to add/remove",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "event",
        "action"
      ]
    }
  },
  {
    "name": "createHabit",
    "description": "Create a new habit to track. Maya helps users build sustainable habits using behavior science principles.",
    "parameters": {
      "type": "object",
      "properties": {
        "habit": {
          "type": "string",
          "description": "The habit to create. Be specific: 'meditate for 5 minutes', 'drink a glass of water after waking'"
        },
        "frequency": {
          "type": "string",
          "description": "How often to do the habit",
          "enum": [
            "daily",
            "weekdays",
            "weekends",
            "weekly",
            "custom"
          ]
        },
        "cue": {
          "type": "string",
          "description": "The trigger that reminds to do the habit. Examples: 'after morning coffee', 'before bed'"
        }
      },
      "required": [
        "habit"
      ]
    }
  },
  {
    "name": "checkHabit",
    "description": "Mark a habit as done or check habit status.",
    "parameters": {
      "type": "object",
      "properties": {
        "habitName": {
          "type": "string",
          "description": "Name or partial name of the habit to check off"
        },
        "action": {
          "type": "string",
          "description": "What to do with the habit",
          "enum": [
            "done",
            "skip",
            "status"
          ]
        }
      },
      "required": [
        "habitName"
      ]
    }
  },
  {
    "name": "getHabitStreaks",
    "description": "Get habit streak information and progress analytics.",
    "parameters": {
      "type": "object",
      "properties": {
        "habitName": {
          "type": "string",
          "description": "Specific habit to check, or leave empty for all habits"
        }
      },
      "required": []
    }
  },
  {
    "name": "suggestHabitStack",
    "description": "Suggest a habit stack - a sequence of habits linked together for better adherence.",
    "parameters": {
      "type": "object",
      "properties": {
        "baseHabit": {
          "type": "string",
          "description": "An existing habit to stack on top of"
        },
        "newHabit": {
          "type": "string",
          "description": "The new habit to add to the stack"
        }
      },
      "required": [
        "newHabit"
      ]
    }
  },
  {
    "name": "reflectOn",
    "description": "Guide reflection on a topic from a wisdom perspective. Nayan offers philosophical depth and helps find meaning.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "What to reflect on"
        },
        "tradition": {
          "type": "string",
          "description": "Optional philosophical tradition to draw from",
          "enum": [
            "stoic",
            "buddhist",
            "eastern",
            "western",
            "universal"
          ]
        }
      },
      "required": [
        "topic"
      ]
    }
  },
  {
    "name": "findMeaning",
    "description": "Help find meaning in a situation or experience. Nayan reframes challenges as growth opportunities.",
    "parameters": {
      "type": "object",
      "properties": {
        "situation": {
          "type": "string",
          "description": "The situation to find meaning in"
        }
      },
      "required": [
        "situation"
      ]
    }
  },
  {
    "name": "guidedMeditation",
    "description": "Lead a brief guided meditation or mindfulness exercise.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "description": "Type of meditation",
          "enum": [
            "breathing",
            "body-scan",
            "loving-kindness",
            "visualization",
            "gratitude"
          ]
        },
        "duration": {
          "type": "string",
          "description": "How long the meditation should be",
          "enum": [
            "1min",
            "3min",
            "5min",
            "10min"
          ]
        },
        "intention": {
          "type": "string",
          "description": "Optional intention or focus"
        }
      },
      "required": []
    }
  },
  {
    "name": "exploreValues",
    "description": "Help explore and clarify personal values.",
    "parameters": {
      "type": "object",
      "properties": {
        "context": {
          "type": "string",
          "description": "Context for values exploration (e.g., career, relationships, life direction)"
        }
      },
      "required": []
    }
  },
  {
    "name": "shareWisdom",
    "description": "Share relevant wisdom, quotes, or philosophical insights on a topic.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "Topic to share wisdom about"
        },
        "source": {
          "type": "string",
          "description": "Preferred wisdom tradition or source"
        }
      },
      "required": [
        "topic"
      ]
    }
  },
  {
    "name": "researchTopic",
    "description": "Research a topic in depth. Peter digs into data, finds reliable sources, and provides balanced analysis.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "The topic to research"
        },
        "depth": {
          "type": "string",
          "description": "How deep to go with the research",
          "enum": [
            "quick",
            "moderate",
            "comprehensive"
          ]
        },
        "focus": {
          "type": "string",
          "description": "Specific angle or focus for the research"
        }
      },
      "required": [
        "topic"
      ]
    }
  },
  {
    "name": "analyzeStock",
    "description": "Analyze a stock or investment. Peter provides data-driven insights without financial advice.",
    "parameters": {
      "type": "object",
      "properties": {
        "symbol": {
          "type": "string",
          "description": "Stock ticker symbol (e.g., AAPL, GOOGL)"
        },
        "aspects": {
          "type": "array",
          "description": "What aspects to analyze",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "symbol"
      ]
    }
  },
  {
    "name": "compareOptions",
    "description": "Compare multiple options with data-driven analysis. Peter creates comparison frameworks for better decision making.",
    "parameters": {
      "type": "object",
      "properties": {
        "options": {
          "type": "array",
          "description": "The options to compare",
          "items": {
            "type": "string"
          }
        },
        "criteria": {
          "type": "array",
          "description": "Criteria to compare against",
          "items": {
            "type": "string"
          }
        },
        "context": {
          "type": "string",
          "description": "Context for the comparison"
        }
      },
      "required": [
        "options"
      ]
    }
  },
  {
    "name": "factCheck",
    "description": "Verify a claim or statement with reliable sources.",
    "parameters": {
      "type": "object",
      "properties": {
        "claim": {
          "type": "string",
          "description": "The claim or statement to fact-check"
        }
      },
      "required": [
        "claim"
      ]
    }
  }
];

// ============================================================================
// DOMAIN GROUPINGS
// ============================================================================

/**
 * Tools grouped by domain for selective loading.
 */
export const toolsByDomain: Record<string, string[]> = 
{
  "memory": [
    "rememberAboutUser",
    "recallFromMemory"
  ],
  "music": [
    "playMusic",
    "musicControl",
    "musicInfo"
  ],
  "news": [
    "getNews"
  ],
  "outreach": [
    "reachOut",
    "callOnBehalf"
  ],
  "tasks": [
    "addTask",
    "getTasks",
    "completeTask"
  ],
  "time": [
    "getCurrentTime",
    "getCalendar",
    "scheduleReminder"
  ],
  "weather": [
    "getWeather"
  ],
  "handoff": [
    "handoffToMaya",
    "handoffToAlex",
    "handoffToPeter",
    "handoffToJordan",
    "handoffToNayan",
    "handoffToFerni"
  ],
  "communication": [
    "draftEmail",
    "prepareConversation",
    "scheduleEvent",
    "analyzeCommunication"
  ],
  "ferni-coordinator": [
    "teamIntro",
    "checkIn",
    "getUserSnapshot"
  ],
  "events": [
    "planEvent",
    "trackMilestone",
    "suggestVenue",
    "createGuestList"
  ],
  "habits": [
    "createHabit",
    "checkHabit",
    "getHabitStreaks",
    "suggestHabitStack"
  ],
  "wisdom": [
    "reflectOn",
    "findMeaning",
    "guidedMeditation",
    "exploreValues",
    "shareWisdom"
  ],
  "research": [
    "researchTopic",
    "analyzeStock",
    "compareOptions",
    "factCheck"
  ]
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get declarations for specific domains.
 */
export function getDeclarationsForDomains(domains: string[]): GeminiFunctionDeclaration[] {
  const toolNames = new Set<string>();
  for (const domain of domains) {
    const tools = toolsByDomain[domain] || [];
    for (const tool of tools) {
      toolNames.add(tool);
    }
  }
  return functionDeclarations.filter(d => toolNames.has(d.name));
}

/**
 * Get a single declaration by name.
 */
export function getDeclaration(name: string): GeminiFunctionDeclaration | undefined {
  return functionDeclarations.find(d => d.name === name);
}

/**
 * All available domains.
 */
export const availableDomains = Object.keys(toolsByDomain);

/**
 * All tool names.
 */
export const allToolNames = ["rememberAboutUser","recallFromMemory","playMusic","musicControl","musicInfo","getNews","reachOut","callOnBehalf","addTask","getTasks","completeTask","getCurrentTime","getCalendar","scheduleReminder","getWeather","handoffToMaya","handoffToAlex","handoffToPeter","handoffToJordan","handoffToNayan","handoffToFerni","draftEmail","prepareConversation","scheduleEvent","analyzeCommunication","teamIntro","checkIn","getUserSnapshot","planEvent","trackMilestone","suggestVenue","createGuestList","createHabit","checkHabit","getHabitStreaks","suggestHabitStack","reflectOn","findMeaning","guidedMeditation","exploreValues","shareWisdom","researchTopic","analyzeStock","compareOptions","factCheck"];
