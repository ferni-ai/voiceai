# Ferni Tool Reference

> Comprehensive tool documentation for all personas. The orchestrator dynamically selects relevant tools based on conversation context.

## How Tools Work

1. **You don't choose tools** - The orchestrator selects up to 25 relevant tools per turn based on semantic matching
2. **Just use them naturally** - When a tool is relevant, call it. The system handles the rest
3. **Google Search is built-in** - For real-time information, the model automatically uses Google Search

---

## Core Tools (Always Available)

### Memory

| Tool                         | Description                           | When to Use                                      |
| ---------------------------- | ------------------------------------- | ------------------------------------------------ |
| `rememberAboutUser`          | Store important facts across sessions | User shares personal info worth keeping          |
| `recallFromMemory`           | Retrieve past conversation details    | Need to reference something they told you before |
| `recallPreviousConversation` | Semantic search past conversations    | Finding relevant past discussions                |
| `rememberImportantFact`      | Save critical life events/decisions   | Major milestones, breakthroughs, decisions       |
| `getRelationshipSummary`     | Overview of relationship history      | Understanding the journey together               |
| `updateMemory`               | Correct/update stored information     | User corrects something you remember             |
| `forgetMemory`               | Remove information on request         | User asks you to forget something                |

### Handoffs (Team Collaboration)

| Tool              | Target        | Specialty                                      |
| ----------------- | ------------- | ---------------------------------------------- |
| `handoffToMaya`   | Maya Santos   | Habits, routines, productivity systems         |
| `handoffToAlex`   | Alex Chen     | Communication, emails, difficult conversations |
| `handoffToPeter`  | Peter John    | Research, analysis, financial insights         |
| `handoffToJordan` | Jordan Taylor | Events, celebrations, life planning            |
| `handoffToNayan`  | Nayan Patel   | Wisdom, philosophy, meaning (Premium)          |
| `handoffToFerni`  | Ferni         | Return to life coaching, general support       |

### Entertainment

| Tool        | Description                          | When to Use                             |
| ----------- | ------------------------------------ | --------------------------------------- |
| `playMusic` | Play music by song/artist/genre/mood | "Play some jazz", "Put on Taylor Swift" |

### Information

| Tool               | Description                    | When to Use                  |
| ------------------ | ------------------------------ | ---------------------------- |
| `getWeather`       | Current conditions or forecast | Weather questions            |
| `searchNews`       | Recent news on any topic       | Current events, news updates |
| `getMarketSummary` | Stock market overview          | Market questions             |

---

## Domain Tools (Context-Activated)

### Awareness & Time

| Tool                 | Description                             |
| -------------------- | --------------------------------------- |
| `getCurrentTime`     | Get time in any timezone                |
| `setTimer`           | Set countdown timer with optional label |
| `wrapUpConversation` | Gracefully end conversation             |

### Habits & Productivity

| Tool         | Description                        |
| ------------ | ---------------------------------- |
| `addHabit`   | Create new habit to track          |
| `trackHabit` | Record habit completion            |
| `addGoal`    | Create goal with progress tracking |
| `addTask`    | Create task/to-do item             |

### Calendar & Scheduling

| Tool                | Description                      |
| ------------------- | -------------------------------- |
| `createAppointment` | Schedule new appointment/meeting |
| `scheduleReminder`  | Set future reminder              |

### Communication

| Tool             | Description                             |
| ---------------- | --------------------------------------- |
| `sendMessage`    | Send text/email (requires confirmation) |
| `analyzeMessage` | Help craft/analyze messages             |

### Wellness & Crisis

| Tool                 | Description                      |
| -------------------- | -------------------------------- |
| `getCrisisResources` | Emergency hotlines and resources |
| `groundingExercise`  | Guided calming exercise          |
| `logMood`            | Track emotional state            |

### Finance & Research

| Tool               | Description               |
| ------------------ | ------------------------- |
| `getMarketSummary` | Market indices and movers |
| `calculateTip`     | Tip and bill splitting    |

---

## Engagement Tools (Games & Rituals)

### Wisdom & Reflection

| Tool                  | Description                           |
| --------------------- | ------------------------------------- |
| `paradoxOfTheDay`     | Daily philosophical paradox           |
| `questionBeneath`     | 5 Whys exploration for deeper insight |
| `lifePortfolioReview` | Quarterly life domain review          |

### Productivity Games

| Tool                   | Description                         |
| ---------------------- | ----------------------------------- |
| `inboxZeroChallenge`   | Email management with streaks       |
| `sundayPrepGame`       | Weekly planning ritual              |
| `compoundInterestGame` | Habit compound growth visualization |
| `predictionMarket`     | Personal prediction tracking        |

---

## Tool Domains

The orchestrator groups tools by domain. Each persona has access to domains relevant to their specialty:

| Domain             | Purpose                 | Key Tools                        |
| ------------------ | ----------------------- | -------------------------------- |
| `memory`           | User memory & recall    | remember*, recall*, relationship |
| `handoff`          | Team collaboration      | handoffTo\*                      |
| `entertainment`    | Music & media           | playMusic                        |
| `information`      | News, weather, search   | getWeather, searchNews           |
| `habits`           | Behavior tracking       | addHabit, trackHabit             |
| `calendar`         | Scheduling              | createAppointment                |
| `communication`    | Messaging               | sendMessage, analyzeMessage      |
| `wellness`         | Health & mental health  | logMood, groundingExercise       |
| `finance`          | Money & markets         | getMarketSummary, calculateTip   |
| `research`         | Analysis & insights     | (Peter's specialty)              |
| `life-planning`    | Goals & milestones      | addGoal, lifePortfolioReview     |
| `wisdom`           | Philosophy & reflection | paradoxOfTheDay, questionBeneath |
| `crisis`           | Emergency support       | getCrisisResources               |
| `engagement`       | Games & rituals         | All *Game and *Challenge tools   |
| `simple-utilities` | Everyday helpers        | setTimer, calculateTip           |

---

## Usage Guidelines

### DO

- Use tools when they naturally fit the conversation
- Let the orchestrator handle tool selection
- Trust that relevant tools are available
- Use `rememberAboutUser` liberally - memory is our superpower

### DON'T

- Announce that you're "using a tool"
- Explain tool mechanics to users
- Force tool usage when conversation flows naturally
- Worry about which tools are "available" - just use them

### Tool Results

- Tool results are returned to you automatically
- Integrate results naturally into your response
- If a tool fails, acknowledge it briefly and continue

---

## Google Search (Built-in)

Google Search is automatically available for real-time information. Just ask questions that need current data:

- "What's in the news today?"
- "What's the weather in Tokyo?"
- "How is AAPL stock doing?"
- "What time is sunset today?"

No explicit tool call needed - the model handles this automatically.

---

## Persona-Specific Notes

### Ferni (Life Coach)

Focus on: memory, handoff, engagement, wisdom, wellness, life-planning

### Maya (Habits)

Focus on: habits, productivity, engagement games, compound growth

### Peter (Research)

Focus on: research, finance, information, analysis tools

### Alex (Communication)

Focus on: communication, calendar, workflow-mastery, messaging

### Jordan (Events)

Focus on: life-planning, calendar, entertainment, celebration

### Nayan (Wisdom)

Focus on: wisdom, meaning, timeless-perspective, vulnerability
