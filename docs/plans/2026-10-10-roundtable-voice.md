# Team roundtables on the voice agent (one session per call)

## Why

The web can show a roundtable (#578: `group_*` messages draw the participant grid), but
on a call a roundtable never starts. `voice-integration.ts` answers `group_roundtable_start`
with "Roundtable not configured": `multi-agent-mode.ts` creates the integration without a
`createRoundtableAgent` factory. And if one existed, nothing would hear the person:
`TeamRoundtable.handleUserInput` has no caller.

The factory's original design gave each persona its own `AgentSession` in the room. That is
what deadlocks today: the room-level `lk.agent.session` byte-stream handler allows one
session, so a second persona's session can't start (the handoff failure fixed by the
single-session series, #599 / #604 / #621 + flip).

## Shape: one session, one roundtable agent, a voice per line

A call has one `AgentSession` and one audio output (`multi-agent/call-session.ts`).
Distinct voices don't need concurrency: the voice is chosen per utterance from userData
(`FerniAgent.ttsNode` → `shared/tts-wrapper.ts` → `getVoiceIdForPersona`), and a roundtable
is turn-taking anyway.

- **Entering a roundtable** swaps a `RoundtableModeAgent` into the call's session
  (`persona-swap.ts`: `beginSwap` / `within`), keeping the conversation so far. **Leaving**
  swaps the persona the person was talking to back in. `userData.personaId` stays "who is
  on the call" and is owned by swaps.
- **Hearing the person:** the roundtable agent's `onUserTurnCompleted` passes the text to
  `TeamRoundtable.handleUserInput` and stops its own reply (`StopResponse`), so only the
  personas the roundtable picks answer.
- **Speaking as a persona:** a line is generated with that persona's identity and the
  roundtable context, then spoken with `userData.speakingAs = personaId`; the TTS reads
  `speakingAs ?? personaId`. `speakingAs` is "whose voice this line is", owned by the
  roundtable and cleared after each line, so a swap rollback can never restore the wrong
  persona (agreed with the handoff series' owner).
- **Turn timing:** `say()` returns the speech handle's playout; the roundtable awaits it
  instead of estimating speech length from the text.

`TeamRoundtable` (selection, addressing by name, moderator opening, turn-taking, transcript)
is reused as is; it only gets a `RoundtableAgent` per persona that is a thin view over the
one session, not a session of its own.

## Flag

`ROUNDTABLE_VOICE=on` (default off) and it requires `MULTI_AGENT_SINGLE_SESSION=on`. Off:
`group_roundtable_start` keeps answering "Roundtable not configured" (the web shows its
translated error, #578).

## PRs (each ≤ 400 reviewable lines)

1. **Voice per line.** `userData.speakingAs` read by `FerniAgent.ttsNode` before
   `personaId`; unset changes nothing. Test: the TTS node gets the speaking-as voice.
2. **Roundtable agents over one session.** `group-conversation/single-session-roundtable.ts`:
   `createSessionRoundtableAgents({ session, userData, generate })` returns the factory
   `TeamRoundtable` needs. `generateResponse` builds the persona's prompt (identity, topic,
   others present, recent transcript, "1–3 sentences, as yourself") and calls the LLM;
   `say` sets `speakingAs`, calls `session.say`, awaits playout, clears it. `RoundtableAgent.say`
   may return the playout promise; `TeamRoundtable` awaits it when present. Tests with a fake
   session: voice per line, cleared after, playout awaited, a failed line doesn't leave
   `speakingAs` set.
3. **Roundtable mode on the call.** `RoundtableModeAgent` (forwards turns, stops its own
   reply); `voice-integration` swaps it in on start and back on end/cleanup (and on a
   failed start); `multi-agent-mode.ts` passes the factory when the flag is on. Tests: start
   → swapped in, the person's turn reaches `handleUserInput`, end → previous persona back.
4. **Dev proof.** A voice-eval scenario (`scripts/voice-eval`): start a roundtable with
   Ferni + Peter + Maya, ask a money question and a habits question, address Maya by name,
   end it. Pass: each answer is spoken in its persona's voice (agent logs show the voice id
   per line), the web gets `group_speaker_changed` per speaker, no `lk.agent.session`
   errors, and after ending, Ferni answers as Ferni.

## Not in scope

Conference calls with external phone participants (`conference-call-manager.ts`) are
already wired through the same integration and the Twilio trunk; this plan only adds the
agent-side roundtable.
