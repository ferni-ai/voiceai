# Call telemetry: `POST /api/call-telemetry`

How a call sounded on the phone, sent by the iPhone app: a per-call
**summary** at hang-up, and a **"That felt off"** report when the person taps
it (the last 30 s of 1 Hz samples plus the summary so far). Numbers and closed
enums only. Code: `src/api/call-telemetry/`. Design: lane 2 of the raise-the-bar
program (TELEMETRY-SPEC.md).

The zod schemas in `call-telemetry-input.ts` are the contract; the iOS
client's encoder output is checked against them in
`src/api/call-telemetry/__tests__/fixtures/` (`summary.json`, `felt-off.json`).
Change the fixtures and the schema together.

## Request

```
POST /api/call-telemetry
Authorization: Bearer <Firebase ID token>    (anonymous accounts too)
Content-Type: application/json               (at most 16 KB)
```

```
{ "kind": "summary", "schema": 1, "rooms": [...], "build": {...}, "call": {...}, "net": {...},
  "audio": {...}, "route": {...}, "turns": {...}, "avatar": {...}, "device": {...} }
{ "kind": "feltOff", "schema": 1, "rooms": [...], "tapAt": <epoch ms>, "sinceLiveMs": ..,
  "tapAgainMs": .., "summarySoFar": { "build": {...}, "call": {...}, ... },
  "ring": { "samples": [<=30], "events": [<=200 {tMs, kind}] }, "note": "<=140" }
```

| Rule         |                                                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown keys | `400`, at every level. Never send a field the schema doesn't name.                                                                                                                                                                                               |
| Missing keys | "Not measured". Omit them; `null` is `400`. Only `kind`, `schema`, `rooms`, `build.appVersion`, `build.appBuild`, `build.os` (and for felt-off `tapAt`, `summarySoFar`, `ring`, each sample's `t`) are required.                                                 |
| Numbers      | Clamped into a generous range (`CALL_TELEMETRY_LIMITS`), never refused for size: ratios 0–1, percentages 0–100, delays up to 10 min, call durations up to a day, counts up to 1,000,000. A string, NaN or Infinity is `400`. `build.appBuild` is a whole number. |
| `rooms`      | 1–3 LiveKit room names, `ios-<uuid>`, in order. Each sample's `roomIndex` points into it.                                                                                                                                                                        |
| `build`      | `appVersion`, `os`, `livekit`: dotted numbers. `deviceModel`: a machine id like `iPhone17,1`, omitted on a simulator. Never the phone's name.                                                                                                                    |
| `note`       | Felt-off only, at most 140 UTF-16 units. The person's own words; the one free-text field.                                                                                                                                                                        |

Closed enums (anything else is `400`):

- `call.outcome`: `endedByYou`, `endedByFerni`, `failed:microphoneDenied`, `failed:notSignedIn`, `failed:offline`, `failed:server`, `failed:ferniDidNotJoin`, `failed:connectionLost`
- routes (`routeStart`, `routeEnd`, sample `route`): `speaker`, `receiver`, `bluetoothHFP`, `bluetoothLE`, `wired`, `airplay`, `car`, `usb`, `other`. `routeChangesByReason` keys: `newDevice`, `oldDeviceUnavailable`, `override`, `other`
- thermal: `nominal`, `fair`, `serious`, `critical`
- sample `phase`: `idle`, `connecting`, `waitingForFerni`, `live`, `reconnecting`, `ended`, `failed`; sample `agentState`: `initializing`, `idle`, `listening`, `thinking`, `speaking`
- event `kind`: `reconnectStartQuick`, `reconnectStartFull`, `reconnectDone`, `rejoin`, `engineStart`, `engineStop`, `engineConfigChange`, `sessionReapply`, `mediaReset`, `routeChange`, `interruptionBegan`, `interruptionEnded`, `speechStart`, `speechEnd`, `agentSpeaking`, `agentListening`, `agentThinking`, `tapInterrupt`, `handoff`

## Answers

| Status           | When                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `201 { ok, id }` | Felt-off report stored.                                                                                           |
| `202 { ok }`     | Summary accepted.                                                                                                 |
| `400`            | Bad JSON or off schema (the message lists field paths only).                                                      |
| `401`            | No valid token.                                                                                                   |
| `403`            | A room was claimed at `/token` by another account. An expired claim is accepted, stored as `roomVerified: false`. |
| `404`            | `CALL_TELEMETRY` is off, or it is `reports` and this is a summary.                                                |
| `413`            | Body over 16 KB.                                                                                                  |
| `429`            | Felt-off: over 5 a minute or 20 a day. Summary: over 20 an hour.                                                  |

The client treats any non-2xx as "drop it".

## The flag and storage

`CALL_TELEMETRY` (`off` by default): `off` stores nothing, `reports` takes
felt-off only, `on` takes both.

- Felt-off reports go to Firestore `call_felt_off` (admin read only, no client
  access): the body's numbers and enums, raw `rooms` (triage finds the call in
  Cloud Logging by room name), `roomVerified`, `uid`, `appBuild`,
  `serverVersion`, `note` when not blank, `status: 'open'`, `createdAt`, and
  `expiresAt` 30 days on. The daily count is `call_felt_off_quota/{uid}`. Both
  are erased by "delete my account" (`services/platform/user-stores.ts`).
- Summaries are validated and limited but **not stored yet**: the BigQuery
  table `client_call_metrics` is the next PR. Keep the flag below `on` until it
  lands.
