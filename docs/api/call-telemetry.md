# Call telemetry: `POST /api/call-telemetry`

How a call sounded on the phone, from the iPhone app: a per-call `summary` at
hang-up, and a `feltOff` report when the person taps "That felt off" (the last
30 s of 1 Hz samples plus the summary so far). Bearer Firebase ID token
(anonymous too), JSON, at most 16 KB. Behind `CALL_TELEMETRY` (`off` by default).

**The contract is the zod schema** in `src/api/call-telemetry/call-telemetry-input.ts`: field names,
enums and ranges. The iOS encoder's output is pinned in
`__tests__/fixtures/summary.json` and `felt-off.json`; change both together.

- A missing key means "not measured": omit it; `null` is `400`. Required: `kind`, `schema` (1), `rooms`, `build.appVersion`, `build.appBuild` (whole number), `build.os`; for felt-off also `tapAt`, `summarySoFar`, `ring`, each sample's `t`.
- Numbers and closed enums only; unknown keys are `400` at every level. Numbers clamp into generous ranges instead of failing; a string, NaN or Infinity is `400`.
- `rooms`: 1 to 3 room names `ios-<uuid>`. `build.deviceModel`: a machine id like `iPhone17,1`, omitted on a simulator.
- `note` (felt-off only): at most 140 UTF-16 units, the only free text.

| Answer                          | When                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `201 { ok, id }` / `202 { ok }` | Felt-off stored / summary accepted.                                                                       |
| `400` / `401` / `413`           | Off schema or bad JSON (paths only) / no valid token / over 16 KB.                                        |
| `403`                           | A room was claimed at `/token` by another account. An expired claim is stored with `roomVerified: false`. |
| `404`                           | `CALL_TELEMETRY=off`, or `reports` and this is a summary.                                                 |
| `429`                           | Felt-off over 5 a minute or 20 a day; summaries over 20 an hour.                                          |

Felt-off reports go to server-only Firestore `call_felt_off` (raw `rooms` for
triage, `uid`, `roomVerified`, the note, `expiresAt` 30 days); it and
`call_felt_off_quota` are erased with the account. Summaries are **not stored
yet** (BigQuery is the next PR): keep the flag below `on` until then.
