# Tool activity (`tool_start` / `tool_end` data messages)

While Ferni runs a tool (checks a calendar, looks something up), the agent tells the
app what kind of thing it is doing, so the app can show an honest line such as
"Checking your calendar…" instead of generic thinking dots. Agent → app only.

## Messages

UTF-8 JSON on the reliable data channel, from the agent participant:

```json
{ "type": "tool_start", "callId": "t3", "kind": "calendar" }
{ "type": "tool_end", "callId": "t3" }
```

- `callId`: an opaque string, unique within the call (`t1`, `t2`, …). Pair a
  `tool_end` to its `tool_start` by it. It is not the model's call id.
- `kind`: one of a closed set (below). Treat any value you don't know as `other`.
- No other fields are promised. The tool's name, its arguments and any free text are
  never sent.

## Kinds

| `kind`      | Suggested line            | What maps to it (server side)                                                             |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `calendar`  | Checking your calendar…   | calendar tools                                                                            |
| `memory`    | Remembering…              | memory and visual-memory tools                                                            |
| `search`    | Looking that up…          | lookups (`get…`, `search…`, `find…`, `check…`) in information, research and local-search  |
| `music`     | Finding some music…       | music and Sonos/Spotify tools, any tool named with "music"                                |
| `messages`  | Working on your messages… | messaging, email, scheduled sends and phone-call tools named for a message, email or call |
| `reminders` | Setting that up…          | any tool named with reminder, alarm or timer                                              |
| `weather`   | Checking the weather…     | any tool named with weather, forecast, pollen or UV                                       |
| `home`      | Talking to your home…     | home and smart-home tools that control a light, lock, thermostat, scene or vibe           |
| `other`     | One sec…                  | everything else, and anything the server is unsure of                                     |

The mapping lives in `toolActivityKind` (`src/agents/integrations/tool-activity-signal.ts`).
It reads each tool's domain from the tool registry (the intent manual), falling back to
`src/agents/shared/sanitizer/config/tool-patterns.json`. A vague `other` is preferred to
a wrong specific kind.

## Guarantees

- **Every `tool_start` gets a `tool_end`**: when the tool returns or fails, when the
  reply is interrupted, when the call closes, and at the latest 60 s after the start.
  Still, clear the line when the agent starts speaking or the call ends, in case a
  message is lost with the room.
- **No flicker**: a tool that finishes within 300 ms sends nothing, neither start nor
  end. So a `tool_start` arrives about 300 ms after the tool began.
- **Parallel calls** each get their own `callId`. Show the most recent open one, or
  combine them; clear each on its own `tool_end`.
- A `tool_end` for an unknown `callId` can be ignored.

## Flag

`TOOL_ACTIVITY_SIGNAL=on` (default off). With it off nothing is sent. It is independent
of `TOOL_HUM` and of the backchannel clip track.

## Where it lives

- Emitter: `src/agents/integrations/tool-activity-signal.ts`, wired per call in
  `startTurnSounds` (`src/agents/multi-agent/live-call-behaviors.ts`).
- Start/end detection, shared with the tool hum: `src/agents/integrations/tool-call-events.ts`.
- Tests: `src/agents/integrations/__tests__/tool-activity-signal.test.ts`.
