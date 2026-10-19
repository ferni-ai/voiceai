# Ferni for Android (Trusted Web Activity)

The Play Store app `ai.ferni.app` is a Trusted Web Activity: a thin Android
shell that opens https://app.ferni.ai full screen in the user's Chrome. Every
web deploy reaches Android the same day; this project only changes for the
wrapper itself (target SDK, icons, version).

Generated with Bubblewrap (`@bubblewrap/core` 1.27.0, the same templates as
`bubblewrap init`) from `twa-manifest.json`, then edited:

- `versionCode`/`versionName` come from `TWA_VERSION_CODE`/`TWA_VERSION_NAME`
  (CI passes the workflow run number).
- Local release signing reads `ANDROID_UPLOAD_KEYSTORE_PATH` and the
  `ANDROID_UPLOAD_*` passwords; without them the bundle is unsigned.
- `mavenCentral()` instead of the retired `jcenter()`.
- A white-silhouette notification icon (Android masks colour icons to a blob).

## What the wrapper does

- **Notifications:** notification delegation is on. Web push from app.ferni.ai
  shows as this app's Android notifications, and `POST_NOTIFICATIONS` is
  requested on Android 13+.
- **Microphone:** a TWA cannot delegate the microphone. Chrome asks for it with
  its own site prompt and holds the Android `RECORD_AUDIO` permission, so this
  app does not declare it. Location works the same way (location delegation is
  off).
- **Splash:** the app icon on `#F5F1E8`, status bar `#4A6741`.
- **Fallback:** a Custom Tab when no TWA-capable browser is installed.

## Build

CI: `.github/workflows/android-twa.yml`.

- **build** runs on every PR that touches this folder, on pushes to main and on
  dispatch. It validates the Gradle wrapper, builds `app-release.aab`
  **unsigned**, checks it is unsigned, and uploads it. It never sees a secret.
- **sign** runs only on main (push or dispatch) in the protected
  `android-signing` environment. It signs that bundle with `jarsigner` using the
  `ANDROID_UPLOAD_*` environment secrets.
- **play-internal** runs only on a dispatch from main with "upload_to_play"
  ticked, in the protected `play-release` environment, and sends a draft release
  to the internal track.

Locally (JDK 17 and an Android SDK with platform 36):

```bash
cd apps/android-twa
./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab, unsigned
```

`app/build.gradle` also signs a local build when `ANDROID_UPLOAD_KEYSTORE_PATH`
and the `ANDROID_UPLOAD_*` passwords are set in your shell. CI does not use this.

## Going live (owner)

1. `scripts/android/make-upload-key.sh` creates the upload key and stores it as
   `ANDROID_UPLOAD_*` secrets of the `android-signing` environment. If that
   environment is missing, the script creates it for main only, with you as
   reviewer. It prints the upload key's SHA-256.
2. Dispatch the workflow from main, approve `android-signing`, download the
   signed bundle, create the app in Play Console with Play App Signing, and upload
   that first bundle by hand.
3. Set the repository variable `ANDROID_CERT_SHA256` to the Play **app signing**
   SHA-256 (Play Console, App signing), plus the upload key's if you want
   sideloaded builds verified, comma separated. The next web deploy serves
   them at https://app.ferni.ai/.well-known/assetlinks.json
   (`apps/web/scripts/asset-links.ts`). Until then the app opens with a browser
   URL bar.
4. Optional: lock `play-release` to main with a required reviewer, store a Play
   service account there as `PLAY_SERVICE_ACCOUNT_JSON`, and dispatch with
   "Upload to Play" ticked.

To regenerate after a Bubblewrap update, run `bubblewrap update` here and
re-apply the edits above.
