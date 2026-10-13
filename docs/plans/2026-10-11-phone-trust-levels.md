# Phone trust levels: stranger, light, full

Status: design only, nothing built. Follows the inbound caller-ID hardening PR
(#877) and the signed phone attestation (#605).

## Why

Caller ID can be spoofed, and so can every SIP header while our LiveKit trunks
accept INVITEs from any source. Today the phone path has two levels:
`caller-recognition.ts` makes a caller either `known` (verified Firebase phone
owner plus a signed attestation "A") or `maybe`/`stranger`. A `known` caller
gets their full name and memory, and the only thing narrower than a web
session is the tool allowlist (`phone-safe-tools.ts`, enforced in
`turn-request.ts`).

That allowlist is the wrong place to stop. A tool gate stops actions. It does
not stop what is read into the prompt before any tool runs: memory, profile,
awareness facts and calendar. Two examples on `origin/main`:

- `voice-agent-entry/index.ts:462-496` fetches the calendar for any session
  with a `userProfile` and a `userId`. Next meeting titles and "just finished
  X" go into `userData.calendarAwareness`. No tool call is involved, so the
  allowlist never sees it.
- `identifyUser` loads the profile, and the context builders (memory, user
  awareness facts, life ledger) read it on every turn.

So a spoofed number that reaches `known` leaks through context, not tools. The
levels below are enforced where memory and profile are loaded and where
context is built. The tool allowlist stays as a second layer.

## Levels

One value per session, `phoneTrust: 'stranger' | 'light' | 'full'`. It is
stored with the caller recognition (`rememberCallerRecognition`) and read
through one accessor, `phoneTrustFor(sessionId)`. Non-phone sessions (app,
web) are `full` and are unchanged.

| Level    | Reached by                                                                      | Profile / memory                                      | Context builders                                                                     | Tools                                 | Actions (money, messages, writes)                      |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| stranger | default for every phone call                                                    | none; anonymous session                               | conversational only                                                                  | conversational allowlist              | never                                                  |
| light    | voice-ID match on a signed-A call from the verified owner's number              | first name and memory read; no stored-record readback | memory and relationship builders; **no calendar, bills, contacts, location, health** | allowlist plus read-only memory tools | never                                                  |
| full     | light + an approved step-up (SMS link or in-app approval; passphrase see below) | as in the app                                         | all                                                                                  | all                                   | yes, each one confirmed by SMS link or in-app approval |

"Signed-A" means the X-Ferni-Attest token from #605 verifies for this call and
number, and its `verstat` is `TN-Validation-Passed-A`. B, C, failed, missing or
unsigned all mean stranger.

## Where it is enforced

1. **Identity** (`user-identification-handler.ts`): the session runs as an
   account only when `phoneTrust` is `light` or `full`. A stranger is
   anonymous, as `recognizePhoneSession` already does for `maybe` and
   `stranger`.
2. **Profile and memory load** (`session-init-handler.ts`,
   `services.userProfile`): at `light`, load a reduced profile with first name,
   memory and relationship facts. Do not load the fields that feed calendar,
   bills, contacts, location or health.
3. **Context building**: every builder gets a `minTrust` declaration
   (defaulting to `full`, so a new builder is closed by default, the same rule
   as the tool allowlist). The registry skips builders above the session's
   level. The calendar awareness block in `index.ts:462-496` moves behind the
   same check (or into a builder).
4. **Tools**: `phone-safe-tools.ts` gets a light set (adding read-only memory
   tools). Every action tool also asks for approval per call (below), even at
   `full`.
5. **Upgrades happen mid-call**: when the level rises, the next turn rebuilds
   context. A level never drops within a call, except to stranger on a failed
   check (see owner alert).

## Step-up order

1. **Voice ID**: a match against the enrolled voice sketch
   (`inbound-voice-verification.ts`) on a signed-A call from the verified
   owner's number gives **light**. It unlocks memory, not money or messages.
   Voice can be cloned, so it never unlocks actions.
2. **SMS link to the verified number, with in-app approval**: Ferni sends a
   single-use link to the account's verified phone. Opening it shows an
   approval screen in the signed-in app, and the user approves there. The
   result is **full** for this call. The link expires in 5 minutes and is bound
   to the call SID. Sending it is the one SMS this flow makes, and only after
   the caller asks for something that needs full.
3. **Spoken passphrase**: an optional fallback the user sets in the app. Store
   it as argon2id (per-user salt, memory-hard parameters, compared on the
   server only). Never log it or put the transcript span in memory: redact it
   from the STT transcript before it reaches memory capture. Five failures lock
   the passphrase for the account until it is reset in the app. Whether a
   passphrase gives `full` or only `light` is an open decision; the default
   proposed here is `light` plus memory-write, never actions.

**Actions always need the SMS link or in-app approval.** That covers sending a
message, placing a call, payments, purchases, deleting or changing stored
records, and sharing anything. Neither voice nor passphrase is enough, and an
approval covers one action. This holds at `full` too: `full` opens the tools,
and each action still asks.

## Failed verification alerts the owner

When a step-up fails on a number that has an owner, send one alert to the
owner in the app (push or inbox, not SMS to the number being used). Failures
include a voice-ID mismatch, a declined or expired link, a wrong passphrase,
and a signed attestation whose `from` doesn't match `sip.phoneNumber`. The
alert says when it happened and which check failed. It does not quote the
caller's words. Rate-limit it to one per number per hour. The call drops to
stranger and continues as a call with a stranger. Ferni doesn't accuse the
caller.

## Attestation requirements (#605)

- **StirVerstat "A" only**: the webhook already puts `verstat` into the signed
  token. Recognition counts only `TN-Validation-Passed-A`.
- **Single-use nonce**: add a random `nonce` claim to the token. The agent
  records each nonce it accepts (Firestore doc keyed by nonce with a 2 min TTL,
  or an in-memory set per agent process as a stopgap) and rejects a replay.
  Today a token is good for up to 120 s and could be replayed on a second
  INVITE within that window.
- The token stays bound to `callSid`, `from`, `to`, `exp`, and the agent still
  checks `sip.phoneNumber === from`.

## Ops step for Seth: lock down the trunk

These are not code; each needs owner approval:

- **Twilio IP allowlist** on the LiveKit inbound trunks (`allowedAddresses` set
  to Twilio's published signalling ranges), so only Twilio can send an INVITE.
- **Digest auth** on the same trunks (`auth_username`/`auth_password`), with
  matching credentials on the Twilio side (an Elastic SIP Trunk credential
  list, or `<Sip username password>` in the webhook TwiML).
- Fix the webhook signature host only after the above and attestation are in
  place: `docs/runbooks/phone-attestation.md`, "Blocker" then "Steps".

With the trunk locked down, a forged INVITE can't reach the agent at all.
Attestation and trust levels then defend against spoofing inside Twilio's own
network, the case STIR/SHAKEN "A" covers.

## Rollout

Each step ships behind its own off-by-default flag, in the order below:

1. `PHONE_TRUST_LEVELS=shadow`: compute the level and log it next to today's
   outcome, but change nothing.
2. Context gating (`minTrust` on builders, plus the calendar block).
3. Light level from voice ID.
4. SMS link / in-app approval step-up and per-action approval.
5. Passphrase (if the open decision says yes).
6. Nonce in the token (can go earlier; it doesn't depend on the others).

## Open decisions

- Does a passphrase give `light` + memory-write, or `full` (actions still need
  approval)? Default: `light` + memory-write.
- At `light`, should the caller hear memory proactively, or only when they
  bring it up? Default: only when they bring it up.
- Sponsored-minute billing moves to the agent after attestation verifies. It
  was removed from the webhook in #877.
