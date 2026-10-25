# Who is speaking (`ferni.persona` participant attributes)

The agent tells the app which persona's voice is on the call with two participant
attributes on its own (local) participant. The app's name chip reads them. No data
message and no HTTP route.

## Contract

- **`ferni.persona`**: the canonical persona id, one of `ferni`, `maya-santos`,
  `peter-john`, `jordan-taylor`, `alex-chen`, `nayan-patel` (and any other persona in
  `src/personas/persona-ids.ts`). Aliases such as `maya` are never sent.
- **`ferni.persona_name`**: that persona's display name (`Ferni`, `Maya`, `Peter`,
  `Jordan`, `Alex`, `Nayan`), for showing as is.
- Both are always written together, in one `setAttributes` call.

## Timing guarantee

- **Call start:** set to the first persona as soon as the call's voice session is built,
  before its first line plays.
- **Handoff:** the value changes when the new persona's **first audio** plays (the SDK
  moves `lk.agent.state` to `speaking` on a speech's first audio frame), not when the
  handoff is decided and not after the greeting. The outgoing persona's goodbye still
  carries the old value.
- **Only on change.** Nothing is written when the same persona speaks again, so a
  normal turn writes nothing.
- The persona is the one whose voice is speaking (`userData.personaId`, which picks the
  TTS voice). A handoff that fails and swaps back never shows the teammate unless the
  teammate's voice actually played.
- Compared with the data messages: `handoff_started.target` arrives before the goodbye,
  `handoff_complete.target` after the greeting. Use this attribute for "who is talking
  now" and keep those messages for the handoff indicator.

## Flag

`PERSONA_SPEAKING_ATTRIBUTE=on` (default **off**). With it off the agent never writes
either attribute, so a client must treat their absence as "unknown" and fall back to the
handoff messages.

## Where it lives

- `src/agents/multi-agent/persona-speaking-attribute.ts` (`installPersonaSpeakingAttribute`).
- Installed on every multi-agent call's voice session in
  `src/agents/multi-agent/call-session.ts` (`createCallSession`), so it covers both
  single-session handoffs and one session per persona (`MULTI_AGENT_SINGLE_SESSION=off`).
- Tests: `multi-agent/__tests__/persona-speaking-attribute.test.ts` and
  `persona-speaking-attribute.sdk.test.ts` (a real AgentSession through the real
  orchestrator and tap handoff).
