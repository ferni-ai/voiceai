# Ferni for Android (Trusted Web Activity)

The Play Store app `ai.ferni.app` is a Trusted Web Activity: a thin Android
shell that opens https://app.ferni.ai full screen in the user's Chrome. Every
web deploy reaches Android the same day; this project only changes for the
wrapper itself (target SDK, icons, version).

Generated with Bubblewrap (`@bubblewrap/core` 1.27.0, the same templates as
`bubblewrap init`) from `twa-manifest.json`, then edited:

- `versionCode`/`versionName` come from `TWA_VERSION_CODE`/`TWA_VERSION_NAME`
  (CI passes the workflow run number).
- Release signing comes from `ANDROID_UPLOAD_KEYSTORE_PATH` and the
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

CI: `.github/workflows/android-twa.yml` builds `app-release.aab` on PRs that touch
this folder and on manual dispatch, and uploads it as an artifact.

Locally (JDK 17 and an Android SDK with platform 36):

```bash
cd apps/android-twa
./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab
```

## Going live (owner)

1. `scripts/android/make-upload-key.sh` creates the upload key and stores it as
   the `ANDROID_UPLOAD_*` repository secrets. It prints the upload key's SHA-256.
2. Run the workflow manually, download the signed bundle, create the app in Play
   Console with Play App Signing, and upload that first bundle by hand.
3. Set the repository variable `ANDROID_CERT_SHA256` to the Play **app signing**
   SHA-256 (Play Console, App signing), plus the upload key's if you want
   sideloaded CI builds verified, comma separated. The next web deploy serves
   them at https://app.ferni.ai/.well-known/assetlinks.json
   (`apps/web/scripts/asset-links.ts`). Until then the app opens with a browser
   URL bar.
4. Optional: store a Play service account as `PLAY_SERVICE_ACCOUNT_JSON` in the
   `play-release` environment (with required reviewers). Dispatch the workflow
   with "Upload to Play" ticked to send a draft release to the internal track.

To regenerate after a Bubblewrap update, run `bubblewrap update` here and
re-apply the edits above.
