# FTIS V3 Tool ID Mapping

> Complete mapping from FTIS classifier semantic tool IDs to executor implementations.

## Overview

FTIS V3 uses a two-stage hierarchical classifier that outputs:

1. **Super Category** (e.g., "media", "calendar", "productivity")
2. **Fine Category** (e.g., "music_play", "calendar_create", "habit_log")

The fine category maps to **semantic tool IDs** via `models/category_to_tools.json`, which are then routed to **executor implementations** in `src/agents/shared/tool-executors/`.

## Architecture Flow

```
User Speech → FTIS Classifier → Fine Category → Tool IDs → Executor → Result
                 │                    │              │           │
                 │                    │              │           └── calendar-executor.ts
                 │                    │              │               music-executor.ts
                 │                    │              │               habits-executor.ts
                 │                    │              │               etc.
                 │                    │              │
                 │                    │              └── category_to_tools.json
                 │                    │                  e.g., "calendar_create" → ["calendar_create_event"]
                 │                    │
                 │                    └── ftis-classifier-v2.ts outputs fine category
                 │
                 └── FTIS Hybrid Router (fast/verify/LLM paths)
```

## Tool ID Mapping by Domain

### 🎵 Music Domain (`music-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                    | Maps To              |
| ------------------ | ---------------------------------------------------- | -------------------- |
| `music_play`       | `spotify_play`, `music_play`, `sonos_play`           | `playMusicUnified()` |
| `music_search`     | `spotify_search`, `spotify_current`, `music_search`  | `playMusicUnified()` |
| `music_control`    | `spotify_pause`, `spotify_skip`, `spotify_volume`    | `musicControl()`     |
| `music_playlist`   | `spotify_playlist`, `spotify_queue`, `spotify_like`  | `playMusicUnified()` |
| `music_mood`       | `music_mood`, `music_recommendations`, `ambient_set` | `playMusicUnified()` |

### 📅 Calendar Domain (`calendar-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                                       | Maps To               |
| ------------------ | ----------------------------------------------------------------------- | --------------------- |
| `calendar_create`  | `calendar_create_event`, `scheduling_find_time`                         | `createcalendarevent` |
| `calendar_view`    | `calendar_list_events`, `calendar_check_availability`                   | `getcalendartoday`    |
| `calendar_modify`  | `calendar_update_event`, `calendar_delete_event`, `calendar_reschedule` | `createcalendarevent` |

### ✅ Habits Domain (`habits-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                | Maps To                         |
| ------------------ | ------------------------------------------------ | ------------------------------- |
| `habit_log`        | `habit_log`, `habit_complete`, `habit_track`     | `loghabit`                      |
| `habit_create`     | `habit_create`, `habit_dna`, `habit_bundles`     | `createhabit`                   |
| `habit_view`       | `habit_list`, `habit_streak`, `habit_progress`   | `gethabits`, `gethabitprogress` |
| `habit_coaching`   | `habit_coaching`, `habit_pace`, `habit_guidance` | `suggesthabitstack`             |
| `routine_run`      | `routine_run`, `routine_start`, `winddown_start` | `loghabit`                      |
| `routine_manage`   | `routine_create`, `routine_list`, `routine_edit` | `createhabit`, `gethabits`      |

### 📝 Productivity Domain (`productivity-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                   | Maps To                      |
| ------------------ | --------------------------------------------------- | ---------------------------- |
| `todo_add`         | `todo_add`, `lists_add_item`                        | `addtask`                    |
| `todo_view`        | `todo_list`, `lists_view`                           | `gettasks`                   |
| `todo_complete`    | `todo_complete`, `todo_delete`, `lists_delete_item` | `completetask`, `deletetask` |
| `list_manage`      | `lists_create`, `grocery_add`, `grocery_view`       | `addnote`, `getnotes`        |
| `alarm_set`        | `alarm_set`, `alarm_create`                         | `setalarm`                   |
| `alarm_manage`     | `alarm_delete`, `alarm_list`, `alarm_snooze`        | `getalarms`                  |
| `timer_set`        | `timer_set`, `timer_create`                         | `settimer`                   |
| `timer_manage`     | `timer_cancel`, `timer_check`, `timer_pause`        | `canceltimer`, `gettimer`    |
| `coaching_goals`   | `coaching_goals`, `goals_set`, `goals_progress`     | `addgoal`, `getgoals`        |
| `journal`          | `ceo_journal`, `journal_add`                        | `addjournal`                 |
| `gratitude`        | `ceo_gratitude`, `gratitude_add`                    | `addjournal`                 |

### 🌤️ Information Domain (`information-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                      | Maps To              |
| ------------------ | ------------------------------------------------------ | -------------------- |
| `weather_current`  | `weather_current`, `weather_now`                       | `getweather`         |
| `weather_forecast` | `weather_forecast`, `weather_hourly`, `weather_weekly` | `getweatherforecast` |
| `time`             | `info_time`, `essentials_time`                         | `getcurrenttime`     |
| `date`             | `info_date`, `essentials_date`                         | `getcurrentdate`     |
| `capabilities`     | `essentials_help`, `essentials_capabilities`           | help response        |

### 📱 Scheduling Domain (`scheduling-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                             | Maps To                            |
| ------------------ | ------------------------------------------------------------- | ---------------------------------- |
| `reminder_set`     | `reminder_set`, `reminder_create`, `productivity_commitments` | `schedulemessage`                  |
| `reminder_manage`  | `reminder_list`, `reminder_delete`, `reminder_complete`       | `listscheduled`, `cancelscheduled` |
| `message_send`     | `sms_send`, `message_send`                                    | `sendtextnow`                      |
| `email_send`       | `email_send`, `email_draft`, `message_craft`                  | `scheduleemail`                    |
| `contact_manage`   | `contact_add`, `contact_find`, `contact_list`                 | `savecontact`                      |

### 📞 Telephony Domain (`telephony-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                | Maps To          |
| ------------------ | -------------------------------- | ---------------- |
| `call_make`        | `call_make`, `telephony_call`    | `callonbehalf`   |
| `call_manage`      | `call_voicemail`, `call_history` | `checkvoicemail` |

### 🏠 Smart Home Domain (`home-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                           | Maps To         |
| ------------------ | ----------------------------------------------------------- | --------------- |
| `lights`           | `smarthome_lights`, `lights_on`, `lights_off`, `lights_dim` | `setlights`     |
| `thermostat`       | `smarthome_thermostat`, `thermostat_set`                    | `setthermostat` |
| `locks`            | `smarthome_locks`, `locks_control`                          | `lockdoors`     |
| `garage`           | `smarthome_garage`, `garage_control`                        | `controldevice` |

### 💾 Memory Domain (`memory-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs                                       | Maps To             |
| ------------------ | ------------------------------------------------------- | ------------------- |
| `memory_save`      | `memory_save`, `memory_note`                            | `rememberaboutuser` |
| `memory_recall`    | `memory_recall`, `memory_search`                        | `recallfrommemory`  |
| `voice_memo`       | `voice_memo_save`, `voice_memo_play`, `voice_memo_list` | memory functions    |

### 🤝 Handoff Domain (`handoff-executor.ts`)

| FTIS Fine Category | Semantic Tool IDs           | Maps To                    |
| ------------------ | --------------------------- | -------------------------- |
| `handoff_maya`     | `handoff_maya`, `handoff`   | `executeHandoff('maya')`   |
| `handoff_peter`    | `handoff_peter`, `handoff`  | `executeHandoff('peter')`  |
| `handoff_alex`     | `handoff_alex`, `handoff`   | `executeHandoff('alex')`   |
| `handoff_jordan`   | `handoff_jordan`, `handoff` | `executeHandoff('jordan')` |
| `handoff_nayan`    | `handoff_nayan`, `handoff`  | `executeHandoff('nayan')`  |
| `handoff_ferni`    | `handoff_ferni`, `handoff`  | `executeHandoff('ferni')`  |

### 🏃 Health Domain (`health-executor.ts`) - NEW January 2026

| FTIS Fine Category | Semantic Tool IDs                                   | Domain Tool                                  |
| ------------------ | --------------------------------------------------- | -------------------------------------------- |
| `exercise_log`     | `health_exercise`, `fitness_workout`, `fitness_log` | `logExercise`                                |
| `nutrition`        | `health_nutrition`, `meal_track`, `calories_count`  | `coachOnNutrition`                           |
| `water`            | `health_water`, `water_track`                       | `trackHydration`                             |
| `sleep`            | `sleep_track`, `sleep_analyze`, `sleep_quality`     | `analyzeSleepPattern`, `suggestSleepHygiene` |

### 💰 Finance Domain (`finance-executor.ts`) - NEW January 2026

| FTIS Fine Category | Semantic Tool IDs                    | Domain Tool                 |
| ------------------ | ------------------------------------ | --------------------------- |
| `budget`           | `finance_budget`, `finance_spending` | `budgetPlanner`, `bankData` |
| `bills`            | `finance_bills`, `finance_payments`  | `debtPayoff`                |

### 🎮 Entertainment Domain (`entertainment-executor.ts`) - NEW January 2026

| FTIS Fine Category | Semantic Tool IDs                            | Domain Tool                               |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| `game`             | `game_trivia`, `game_story`, `game_wordplay` | `startGame`, `startTextGame`              |
| `joke`             | `humor_joke`, `humor_funfact`                | `tellJoke`, `getFunFact`, `tellMiniStory` |

### 👔 CEO Coaching Domain (`ceo-executor.ts`) - NEW January 2026

| FTIS Fine Category | Semantic Tool IDs                  | Domain Tool                          |
| ------------------ | ---------------------------------- | ------------------------------------ |
| `briefing`         | `ceo_briefing`, `briefing_morning` | `getMorningBriefing`, `weeklyReview` |
| `priorities`       | `ceo_priorities`, `priorities_set` | `managePriorities`, `trackBlocker`   |
| `journal`          | `ceo_journal`, `journal_add`       | `quickJournal`, `dailyReflection`    |
| `gratitude`        | `ceo_gratitude`, `gratitude_add`   | `logGratitude`, `trackWin`           |

### ✈️ Travel Domain (`travel-executor.ts`) - NEW January 2026

| FTIS Fine Category | Semantic Tool IDs                   | Domain Tool                      |
| ------------------ | ----------------------------------- | -------------------------------- |
| `travel_plan`      | `travel_plan`, `travel_suggestions` | `planTrip`, `getTripSuggestions` |
| `flights`          | `travel_flights`, `flights_search`  | `searchFlights`                  |
| `directions`       | `traffic_directions`, `navigation`  | `getCommuteTime`                 |

## Adding New Tool IDs

When adding support for a new FTIS fine category:

1. **Add to `category_to_tools.json`**:

   ```json
   "new_category": ["tool_id_1", "tool_id_2"]
   ```

2. **Add to executor's `HANDLED_TOOLS`**:

   ```typescript
   const HANDLED_TOOLS = [
     // Existing tools...
     'tool_id_1',
     'tool_id_2',
   ] as const;
   ```

3. **Add to executor's `TOOL_ALIASES`**:

   ```typescript
   const TOOL_ALIASES: Record<string, string> = {
     // Map FTIS IDs to canonical handler names
     tool_id_1: 'existing_handler',
     tool_id_2: 'existing_handler',
   };
   ```

4. **Add routing logic** if the tool needs special handling.

## Debugging

### Check if a tool is routed

```bash
# In logs, look for:
🔀 Resolving FTIS tool alias  # Shows aliasing happening
🎵 Playing music via playMusicUnified  # Shows executor handling
⚠️ UNKNOWN TOOL: "tool_name"  # Tool not wired up!
```

### Common issues

1. **"UNKNOWN TOOL" error**: Tool ID not in executor's `HANDLED_TOOLS`
2. **Tool executes but wrong behavior**: Wrong alias mapping in `TOOL_ALIASES`
3. **Classification works but tool doesn't fire**: Missing entry in `category_to_tools.json`

## Conversational Categories (Always LLM Path)

These categories ALWAYS route to the LLM regardless of confidence. They are conversational/emotional support topics where Ferni should respond naturally:

| Category                            | Why LLM Path                                |
| ----------------------------------- | ------------------------------------------- |
| `crisis_support`                    | Safety-critical emotional support           |
| `grounding`                         | Guided exercises need natural flow          |
| `wellness_check`                    | Conversational check-ins                    |
| `coaching_motivation`               | Encouragement needs natural voice           |
| `grief_support`                     | Sensitive emotional support                 |
| `relationship_advice`               | Advisory conversation                       |
| `breakup_support`                   | Emotional support                           |
| `self_compassion`                   | Guided self-reflection                      |
| `imposter_syndrome`                 | Coaching conversation                       |
| `conversation`                      | General conversation                        |
| `restaurant_rec`, `movie_rec`, etc. | Recommendations flow better as conversation |

## All FTIS Categories Now Have Executor Support ✅

As of January 2026, all 66 FTIS fine categories have routing paths:

- **52 tool categories** → Fast/Verify path → Domain executors
- **14 conversational categories** → LLM path (for natural conversation)

| Executor                    | Categories Supported                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `music-executor.ts`         | music_play, music_control, music_search, music_playlist, music_mood                |
| `calendar-executor.ts`      | calendar_create, calendar_view, calendar_modify                                    |
| `habits-executor.ts`        | habit_log, habit_create, habit_view, habit_coaching, routine_run, routine_manage   |
| `productivity-executor.ts`  | todo*add, todo_view, todo_complete, list_manage, alarm*_, timer\__, coaching_goals |
| `information-executor.ts`   | weather_current, weather_forecast, time, date, capabilities                        |
| `scheduling-executor.ts`    | reminder*\*, message_send, message_read, email*\*, contact_manage                  |
| `telephony-executor.ts`     | call_make, call_manage                                                             |
| `home-executor.ts`          | lights, thermostat, locks, garage                                                  |
| `memory-executor.ts`        | memory_save, memory_recall, voice_memo                                             |
| `handoff-executor.ts`       | handoff\_\* (all personas)                                                         |
| `health-executor.ts`        | exercise_log, nutrition, water, sleep                                              |
| `finance-executor.ts`       | budget, bills                                                                      |
| `entertainment-executor.ts` | game, joke                                                                         |
| `ceo-executor.ts`           | briefing, priorities, journal, gratitude                                           |
| `travel-executor.ts`        | travel_plan, flights, directions                                                   |

## Related Files

- `models/category_to_tools.json` - FTIS category → tool ID mapping
- `src/tools/intelligence/ftis-classifier-v2.ts` - Classification logic
- `src/tools/intelligence/ftis-hybrid-router.ts` - Tiered routing + conversational bypass
- `src/agents/shared/tool-executors/*.ts` - Domain executors
- `src/agents/shared/json-function-executor.ts` - Tool execution router
