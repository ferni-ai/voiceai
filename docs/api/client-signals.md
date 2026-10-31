# Client signals v2 (`memory_saved`, `sound_played` data messages)

Two agent-to-app messages for the iPhone app. Both are off by default, behind one
flag: `CLIENT_SIGNALS_V2=on`. With the flag off neither is sent and nothing else
changes.

Both go out like every other agent-to-app message: UTF-8 JSON
`{ "type": ..., ...fields }` on the reliable LiveKit data channel to the call's room,
with no topic (`publishData(data, { reliable: true })`). Delivery is best effort: a
failed publish is logged and dropped, and never breaks the call.

## `memory_saved`

```json
{
  "type": "memory_saved",
  "id": "mem_1729700000000_k3j9x2a",
  "sensitive": false,
  "ts": 1729700000123
}
```

- **When:** only after a memory store has resolved successfully: the live
  `rememberAboutUser` and `rememberImportantFact` tools
  (`src/tools/domains/memory/tools-unified.ts`) and the text-path memory executor
  (`src/agents/shared/tool-executors/memory-executor.ts`). Never before the write
  finishes, never when it fails, and at most once per write. With
  MEMORY_TOOLS_HONEST on, the two tools write `dynamic_facts` only (no `memories`
  copy), and the signal follows that write: sent when the fact is newly created,
  not when it was already on file or was refused.
- **`id`:** an opaque handle for this memory, for a later "how did you know that?".
  It is the store's own id when that is a plain id (letters, digits, `_`, `-`, 6 to
  64 long), otherwise a random UUID. Treat it as opaque; never parse it.
- **`sensitive`:** `true` when the memory is about health, mental health,
  sexuality, money, legal trouble, a crisis, a minor or a relationship (also for the
  `emotional`, `financial` and `concern` categories). The app should keep its own UI
  quiet about a sensitive memory: no on-screen pill or notification someone near the
  phone could read. Classifier: `memoryIsSensitive` in
  `src/tools/domains/memory/memory-saved.ts`, built on
  `src/memory/recall/sensitive.ts`. It leans towards `true`.
- **`ts`:** epoch milliseconds when the message was built (just after the write).
- **Privacy:** no content, ever. No text, no topic words, no category name. The
  fact is read on the server only to set `sensitive`.
- **Minor care:** when MINOR_CARE holds a caller's memory (`memoryHeld` /
  `userHeld` in `src/utils/minor-care.ts`) nothing is stored and nothing is sent.

The older `ferni_moment { kind: 'remembered', summary }` (REMEMBER_MOMENT,
`remember-moment.ts`) is separate and unchanged; it does carry a short summary.

## `sound_played`

```json
{ "type": "sound_played", "kind": "laugh", "wireDelayMs": 57, "label": "Ha, laughter" }
```

- **When:** the moment a non-speech clip starts, that is when its player accepts it
  (`play()` returned true). The audio reaches the caller `wireDelayMs` later: time the
  animation or caption to `received + wireDelayMs`. Sent for every clip of these
  sounds, independent of `AVATAR_LISTEN_SIGNALS`.
- **`wireDelayMs`:** the clip's play()-to-wire delay. On the direct clip track
  (REACTION_SIDETRACK=direct) it is the last measured clip (about 60 ms); on the
  mixer track it is an estimate (220 ms with CLIP_TRACK_PACED=on, else 650 ms).
- **`kind`:**

| kind     | sounds                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| `laugh`  | the live laugh clip (`[laughter]`) and its voiced takes                                                 |
| `mm-hmm` | every other live backchannel ("Mm-hmm", "Yeah", "Oh", "Aw"...) and its takes                            |
| `opener` | the turn-opening sound ("Mm", "Hmm", "Oh", "Oof"...; TURN_OPENING_SOUND)                                |
| `hum`    | the tool hum (TOOL_HUM), the quiet-window hum, whistle or named tune (PRESENCE_SOUNDS, VOICED_PRESENCE) |
| `breath` | the mock snore (PRESENCE_SNORE) and the morning yawn (VOICED_PRESENCE)                                  |
| `sigh`   | reserved: the sigh takes have no trigger yet                                                            |

Clients must ignore a `kind` they don't know.

- **`label`** (added 2026-10-24, additive): the clip's own short text, for telling one
  take from another: the backchannel or laugh take that actually played ("Mm-hmm.",
  "Yeahh.", "Ha, laughter"), the opener ("Mm"), the quiet-window take or tune
  (`recorded-whistle:<file>` / `recorded-snore:<file>` for a recording, on either track), `whistle` / `hum` / `snore` for a
  synthesized one, `tool hum` for the tool hum. TTS tags are dropped, `[laughter]`
  reads as `laughter`, at most 64 characters (`soundLabel` in `sound-signal.ts`). It is
  a fixed catalog line, never anything the caller said. Omitted when empty; clients
  must not depend on its wording. The voice eval reads it to judge sounds and count
  repeats (`scripts/voice-eval/sounds.mjs`).

- **Not yet covered:** the slow-turn sound (#2500, unmerged when this shipped). It
  should report through the same `SoundPlayed` sender (`sound-signal.ts`) when it lands.
- **Captions:** `[laughter]` is stripped from caption text
  (`src/agents/personas/caption-filter.ts`) and that is not changed here. The app
  renders "[laughs]" itself from `sound_played { kind: 'laugh' }`.
- **`backchannel_played` is unchanged** (`{ kind: 'laugh' | 'backchannel', wireDelayMs }`,
  live backchannels only, AVATAR_LISTEN_SIGNALS=on) for existing clients, except for
  the same additive `label`. With both flags on, a live backchannel sends both messages.

## Where it lives

- Flag: `src/config/flags/CLIENT_SIGNALS_V2.ts`.
- `memory_saved`: `src/tools/domains/memory/memory-saved.ts` (`announceMemorySaved`);
  the room sender is plugged in by `src/agents/realtime/session-publishers.ts`.
- `sound_played`: `src/agents/integrations/sound-signal.ts`, wired in
  `clip-player.ts` (live reactions, opener, mixer presence sounds, tool hum) and
  `voiced-presence.ts` (quiet-window takes); the opener is reported through
  `openerClip` in `src/agents/multi-agent/live-call-behaviors.ts`.
- Tests: `src/tools/domains/memory/__tests__/memory-saved.test.ts`,
  `src/agents/integrations/__tests__/sound-signal.test.ts`.
