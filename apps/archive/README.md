# Archived apps

Code kept for reference only. Nothing here is built, tested, linted or deployed,
and none of it is maintained.

| App | Archived | Replaced by | Why |
|---|---|---|---|
| `android-native/` (Kotlin/Compose, `com.ferni.voice.android`) | 2026-10-18 | `apps/android-twa`: the web app in a Trusted Web Activity, package `ai.ferni.app` | It could not start a call (`/token` now requires Firebase sign-in and the app had none), targeted API 34 when Play requires 36, had no push, settings, memory views or account deletion, and was never built in CI. The web app has all of that and ships to Android the same day. |

Bring one back only with measurements that show the replacement can't do the
job (for Android: backgrounded calls dropping on real devices, or lock-screen
call controls). See `apps/android-twa/README.md`.
