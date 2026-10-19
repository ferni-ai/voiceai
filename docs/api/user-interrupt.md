# Tap to interrupt (`user_interrupt` data message)

The app stops Ferni mid-sentence with one LiveKit data message. No HTTP route.

## Contract

- **Send:** `{ "type": "user_interrupt" }` as UTF-8 JSON on the reliable data channel,
  to the room. `timestamp` (a finite number) is optional; the web app sends it, the
  iPhone app need not. Any other `type` is not this message.
- **Only while Ferni is speaking.** Quiet agent: nothing to stop, the tap is ignored.
- **Only from the human in the room.** The sender must be a remote participant that
  is not an agent (`ParticipantKind.AGENT`). A teammate agent, a stranger, or a
  message with no sender is ignored.
- **Flag:** `TAP_INTERRUPT=on` (default off). With it off the message is ignored and
  the agent does not advertise the button.
- **Advertise:** with the flag on the agent sets its participant attribute
  `ferni.tap_interrupt` = `"on"`. The app shows the button only when it sees that, so
  it never offers a tap the agent would ignore. (The server attribute, not the app,
  is the switch: a server flag changes what Ferni does, not what the app contains.)
- **Rate limit:** at most 5 taps per 5 seconds per room (`TAP_LIMIT`, `TAP_WINDOW_MS`).
  Taps from non-callers are rejected before they are counted, so they cannot use up
  the person's budget. Past the limit the tap is dropped.
- **No reply message.** The visible effect is Ferni's speech stopping; the app's own
  agent-state events show it.

## Logging

Outcomes are logged with no message content and no participant identity:
`disabled`, `malformed`, `not_caller`, `rate_limited`, `not_speaking`, `interrupted`,
`failed`.

## Where it lives

- Handler: `src/agents/voice-agent/tap-interrupt.ts` (`handleTapInterrupt`).
- Wired in `src/agents/voice-agent/data-channel-handler.ts`, which both the single-agent
  entry (`voice-agent-entry/handler-setup.ts`) and multi-agent calls
  (`multi-agent/live-data-context.ts`) set up, so teammate calls get it too.
- Tests: `voice-agent/__tests__/tap-interrupt.test.ts` and
  `data-channel-user-interrupt.test.ts` (through the real handler).

## History

This was already on `main` (#745) for the web app. This change makes the timestamp
optional for the iPhone app, adds the rate limit, and drops the sender identity from
the logs.
