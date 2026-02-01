/**
 * Gemini Function Declarations
 *
 * This file is auto-generated from tool schemas. Do not edit directly.
 * Edit schema files in `src/tools/schemas/` and run `pnpm tools:generate`.
 *
 * Generated: 2026-02-01T15:11:25.284Z
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
    "description": "Store an important fact about the user with semantic embedding for future recall. Facts persist across all sessions and are searchable by meaning.\n\n**Invocation Condition:** Invoke this tool *only when* the user shares significant personal information (family, goals, preferences, concerns) that would be valuable to remember for future conversations. Do NOT invoke for casual conversation or temporary information.",
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
    "description": "Semantic search across stored memories. Finds memories by meaning, not just keywords.\n\n**Invocation Condition:** Invoke this tool *only when* you need to recall something specific the user has told you before, or when the user asks 'what do you know about...' or 'what have I told you about...'. Do NOT invoke speculatively.",
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
    "description": "Start music playback immediately.\n\n**Invocation Condition:** Invoke IMMEDIATELY and unmistakably when user mentions music, songs, artists, or wants audio. Do NOT ask clarifying questions first - pick something appropriate and play it. If user says 'play some music' without specifics, choose based on context (relaxing, upbeat, focus).\n\n**DO NOT invoke** for statements like 'I like music' — only when user wants playback to START.\n\n**Returns:** Confirmation with track info (artist, title).",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Music search query. Format: song title ('Bohemian Rhapsody'), artist ('The Beatles'), genre ('jazz'), mood ('relaxing'), or combination ('calm late night jazz'). Use the user's exact words when possible."
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "musicControl",
    "description": "Control active music playback (pause, resume, skip, volume, stop).\n\n**Invocation Condition:** Invoke IMMEDIATELY when user says pause, stop, resume, continue, skip, next, volume, turn up/down, louder, quieter. Do NOT announce the action first — invoke the tool, then speak.\n\n**Returns:** Confirmation that action was performed.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "Action: 'pause' (stop playback), 'resume' (continue), 'skip' (next track), 'volume' (change level), 'stop' (end playback)",
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
          "description": "Volume 0-100. Required when action='volume'. Use 80 for 'turn up', 30 for 'turn down'."
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "musicInfo",
    "description": "Get information about currently playing music or listening history.\n\n**Invocation Condition:** Invoke when user asks what's playing, what song/artist this is, or about their listening history.\n\n**Returns:** Track info (title, artist, album) or listening history array.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "Info type: 'playing' (current track), 'history' (recent tracks), 'queue' (upcoming)",
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
    "description": "Get current news headlines. Your training data is outdated - never make up headlines, always call this tool for news requests.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for news, headlines, or 'what's happening'. Do NOT invoke for general conversation about current events unless they specifically request news updates.",
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
    "description": "Contact a person via call, text, or email. Auto-selects the best channel. Use when user wants to communicate with a human contact.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to contact, message, text, call, or reach out to a specific person. Do NOT invoke for discussion about people in their life.",
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
    "description": "Make a phone call on behalf of the user. An AI agent handles the conversation autonomously.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for Ferni to make a call for them, or says 'call X for me' or 'have someone call'. Do NOT invoke for regular personal calls the user wants to make themselves.",
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
    "description": "Add a new task to the user's task list.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly says 'add a task', 'I need to do X', or asks you to track/remember something they need to accomplish. Do NOT invoke for general discussion about things they might do.",
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
    "description": "Get the user's task list.\n\n**Invocation Condition:** Invoke this tool *only when* the user asks 'what are my tasks', 'show my to-do list', or wants to review their pending items. Do NOT invoke unless they specifically ask about their tasks.",
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
    "description": "Mark a task as completed.\n\n**Invocation Condition:** Invoke this tool *only when* the user says they 'finished', 'completed', or 'done with' a specific task, or explicitly asks to mark something as done.",
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
    "description": "Get the current time. Returns formatted time string.\n\n**TRIGGER WORDS:** 'what time', 'time is it', 'current time', 'time in'.\n\n**CRITICAL:** When user asks the time, CALL THIS FUNCTION — do NOT guess or make up a time.\n\n**RETURNS:** Current time as formatted string (e.g., '3:45 PM').",
    "parameters": {
      "type": "object",
      "properties": {
        "timezone": {
          "type": "string",
          "description": "IANA timezone (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Omit for user's local timezone."
        }
      },
      "required": []
    }
  },
  {
    "name": "getCalendar",
    "description": "Get calendar events. Returns list of events with titles and times.\n\n**TRIGGER WORDS:** 'calendar', 'schedule', 'meetings', 'what do I have', 'my day', 'any events'.\n\n**CRITICAL:** When user asks about their schedule, CALL THIS FUNCTION — do NOT make up events.\n\n**RETURNS:** Array of events with title, time, location. Empty array if no events.",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "description": "Date: 'today' (default), 'tomorrow', 'this week', or specific date 'YYYY-MM-DD'."
        }
      },
      "required": []
    }
  },
  {
    "name": "scheduleReminder",
    "description": "Set a reminder. Returns confirmation with scheduled time.\n\n**TRIGGER WORDS:** 'remind me', 'reminder', 'don't let me forget', 'remember to'.\n\n**CRITICAL:** When user asks to be reminded, CALL THIS FUNCTION FIRST, then confirm.\n\n**RETURNS:** Confirmation with exact time the reminder is set for.",
    "parameters": {
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "description": "What to remind about. Use user's exact words."
        },
        "when": {
          "type": "string",
          "description": "When to remind. Natural language: '5pm', 'in 30 minutes', 'tomorrow at 9am', 'in 2 hours'."
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
    "description": "Get current weather conditions or forecast. Auto-detects user location.\n\n**TRIGGER WORDS:** 'weather', 'temperature', 'forecast', 'rain', 'umbrella', 'hot', 'cold', 'outside', 'jacket'.\n\n**CRITICAL:** When user asks about weather, CALL THIS FUNCTION FIRST before responding. Do NOT guess the weather — always call getWeather().\n\n**RETURNS:** Object with temperature, conditions, humidity, wind. Use this data in your response.\n\n**LOCATION:** Only include location parameter if user mentions a DIFFERENT city. User's current location is auto-detected.",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "City name or zip code. ONLY include if user asks about a different location (e.g., 'weather in Miami'). Omit for user's current location."
        },
        "type": {
          "type": "string",
          "description": "Info type: 'current' (right now), 'forecast' (next few days), 'hourly' (hour by hour)",
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
    "description": "Transfer to Maya Santos — habits, routines, productivity, boundaries, burnout, procrastination expert.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Maya by name, OR discusses habits, routines, productivity, behavior change, boundaries, burnout, procrastination, sleep, wellness, or budgeting. Do NOT announce the handoff first — invoke the tool, then Maya will greet them.\n\n**Returns:** Confirmation that Maya is joining.",
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
    "description": "Transfer to Alex Chen — communication, email, calendar, difficult conversations, conflict resolution expert.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Alex by name, OR discusses email, calendar, communication, difficult conversations, conflict, social skills, dating, apologizing, or professional correspondence. Do NOT announce the handoff first — invoke the tool.\n\n**Returns:** Confirmation that Alex is joining.",
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
    "description": "Transfer to Peter John — research, stocks, market analysis, financial trends, data analysis expert.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Peter by name, OR discusses stocks, market, investing, research, financial analysis, or data. Do NOT announce the handoff first — invoke the tool.\n\n**Returns:** Confirmation that Peter is joining.",
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
    "description": "Transfer to Jordan Taylor — life planning, events, celebrations, milestones, travel, breakups, neurodiversity expert.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Jordan by name, OR discusses events, parties, celebrations, trips, milestones, weddings, breakups, ADHD, life transitions, or starting over. Do NOT announce the handoff first — invoke the tool.\n\n**Returns:** Confirmation that Jordan is joining.",
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
    "description": "Transfer to Nayan Patel — wisdom, philosophy, meaning, purpose, trauma, grief, chronic illness expert.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Nayan by name, OR discusses wisdom, meaning, purpose, philosophy, existential questions, midlife, trauma, grief, intimacy, anger, or chronic illness. Do NOT announce the handoff first — invoke the tool.\n\n**Returns:** Confirmation that Nayan is joining.",
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
    "description": "Transfer back to Ferni — main life coach and team coordinator.\n\n**Invocation Condition:** Invoke IMMEDIATELY when user mentions Ferni by name, asks to go back, or wants the main coordinator. Do NOT announce the handoff first — invoke the tool.\n\n**Returns:** Confirmation that Ferni is joining.",
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
    "description": "Draft an email with Alex's communication expertise. Helps craft professional, clear, and effective emails.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to draft, write, or help with an email. Do NOT invoke for general email discussion.",
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
    "description": "Help prepare for a difficult or important conversation. Alex provides talking points, tone guidance, and anticipates responses.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to prepare for a conversation or says they need help with an upcoming difficult discussion.",
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
    "description": "Schedule a meeting or event on the calendar.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to schedule, book, or set up a meeting/event. Do NOT invoke for asking about calendar.",
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
    "description": "Analyze a communication (email, message, conversation) and provide feedback on tone, clarity, and effectiveness.\n\n**Invocation Condition:** Invoke this tool *only when* the user asks you to review, analyze, or give feedback on a specific piece of communication they share.",
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
    "description": "Introduce the Ferni team and their specialties. Use when user asks about the team, who they can talk to, or what help is available.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks who they can talk to, about the team, or wants to know what help is available. Do NOT invoke proactively.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "checkIn",
    "description": "Run a check-in with the user to see how they're doing. Activates reflective conversation mode.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks 'how am I doing', 'let's check in', or wants to reflect on their progress. Do NOT invoke unless they request it.",
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
    "description": "Get an overview of user's current state across all domains: habits, goals, calendar, recent conversations.\n\n**Invocation Condition:** Invoke this tool *only when* the user asks for an overview, summary, or 'where am I at'. Do NOT invoke proactively.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "planEvent",
    "description": "Start planning an event or celebration. Jordan helps with all aspects of event planning from intimate gatherings to major milestones.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to plan, organize, or help with an event, party, or celebration.",
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
    "description": "Track an important milestone or anniversary. Jordan remembers and helps celebrate special moments.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to track, remember, or save a birthday, anniversary, or important date.",
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
    "description": "Suggest venues or locations for an event based on requirements.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for venue suggestions or where to hold an event.",
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
    "description": "Manage the guest list for an event.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to add/remove guests, see the guest list, or manage RSVPs.",
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
    "description": "Create a new habit to track. Maya helps users build sustainable habits using behavior science principles.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to create, start, or build a new habit. Do NOT invoke for general discussion about habits.",
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
    "description": "Mark a habit as done or check habit status.\n\n**Invocation Condition:** Invoke this tool *only when* the user says they completed a habit ('I meditated', 'done with X') or asks about habit status.",
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
    "description": "Get habit streak information and progress analytics.\n\n**Invocation Condition:** Invoke this tool *only when* the user asks about their streaks, progress, or 'how am I doing with habits'.",
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
    "description": "Suggest a habit stack - a sequence of habits linked together for better adherence.\n\n**Invocation Condition:** Invoke this tool *only when* the user asks for help sticking to a habit or wants suggestions for linking habits together.",
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
    "description": "Guide reflection on a topic from a wisdom perspective. Nayan offers philosophical depth and helps find meaning.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for reflection, philosophical perspective, or wants to think deeply about a topic.",
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
    "description": "Help find meaning in a situation or experience. Nayan reframes challenges as growth opportunities.\n\n**Invocation Condition:** Invoke this tool *only when* the user is struggling to understand a difficult situation and asks 'why' or seeks meaning in an experience.",
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
    "description": "Lead a brief guided meditation or mindfulness exercise.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for a meditation, breathing exercise, or mindfulness practice.",
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
    "description": "Help explore and clarify personal values.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks about their values, what matters to them, or wants to explore what they prioritize in life.",
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
    "description": "Share relevant wisdom, quotes, or philosophical insights on a topic.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for wisdom, quotes, or philosophical insights on a specific topic.",
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
    "description": "Research a topic in depth. Peter digs into data, finds reliable sources, and provides balanced analysis.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks for research, deep dive, or thorough analysis on a topic. Do NOT invoke for simple factual questions.",
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
    "description": "Analyze a stock or investment. Peter provides data-driven insights without financial advice.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks about a specific stock by name or ticker. Do NOT invoke for general market discussion.",
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
    "description": "Compare multiple options with data-driven analysis. Peter creates comparison frameworks for better decision making.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to compare two or more options for a decision.",
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
    "description": "Verify a claim or statement with reliable sources.\n\n**Invocation Condition:** Invoke this tool *only when* the user explicitly asks to verify, fact-check, or confirm if something is true.",
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
