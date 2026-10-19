#!/usr/bin/env bash
# Create the Play upload key for the Android app (apps/android-twa) and store it
# as GitHub Actions secrets, without the key or its password ever touching disk
# outside one private temp file that is deleted on exit.
#
# For the owner to run, once, on a trusted machine:
#   scripts/android/make-upload-key.sh [--repo owner/name] [--env android-signing] [--replace]
#
# The secrets are ENVIRONMENT secrets of the android-signing environment, which
# only the main-branch signing job in .github/workflows/android-twa.yml uses;
# pull-request builds never see them. If the environment does not exist, the
# script creates it limited to the main branch with you as required reviewer,
# and it refuses to use an existing one that any branch can deploy from.
#
# Sets these secrets:
#   ANDROID_UPLOAD_KEYSTORE_B64       the PKCS12 keystore, base64
#   ANDROID_UPLOAD_KEYSTORE_PASSWORD  random, generated here
#   ANDROID_UPLOAD_KEY_ALIAS          "upload"
#   ANDROID_UPLOAD_KEY_PASSWORD       same as the store password (PKCS12 has one)
#
# Prints only the key's SHA-256 fingerprint and the next steps. Values go to
# `gh secret set` on stdin, never on a command line or to the terminal.
#
# GitHub becomes the only copy of this key. That is fine for an UPLOAD key with
# Play App Signing: if it is lost, Play Console can reset the upload key. Do not
# use this for an app signing key.

set -euo pipefail
umask 077

REPO="ferni-ai/voiceai"
ENV_NAME="android-signing"
REPLACE=0
ALIAS="upload"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:?--repo needs owner/name}"; shift 2 ;;
    --env) ENV_NAME="${2:?--env needs a name}"; shift 2 ;;
    --replace) REPLACE=1; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for tool in keytool gh openssl base64; do
  if ! command -v "$tool" > /dev/null 2>&1; then
    echo "Missing $tool. keytool comes with a JDK (e.g. 'brew install openjdk@17')." >&2
    exit 1
  fi
done
gh auth status > /dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

# The signing environment: create it locked to main, or check the existing one is.
if ! gh api "repos/$REPO/environments/$ENV_NAME" > /dev/null 2>&1; then
  me="$(gh api user --jq .id)"
  printf '{"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$me" |
    gh api -X PUT "repos/$REPO/environments/$ENV_NAME" --input - > /dev/null
  gh api -X POST "repos/$REPO/environments/$ENV_NAME/deployment-branch-policies" \
    -f name=main -f type=branch > /dev/null
  echo "Created environment $ENV_NAME (main branch only, you as required reviewer)."
fi
policy="$(gh api "repos/$REPO/environments/$ENV_NAME" --jq '.deployment_branch_policy // "none"')"
if [ "$policy" = "none" ]; then
  echo "Environment $ENV_NAME lets any branch deploy. Limit it to main first (Settings, Environments)." >&2
  exit 1
fi

existing="$(gh secret list --repo "$REPO" --env "$ENV_NAME" --json name --jq '.[].name' | grep -c '^ANDROID_UPLOAD_' || true)"
if [ "$existing" -gt 0 ] && [ "$REPLACE" -ne 1 ]; then
  echo "$ENV_NAME already has ANDROID_UPLOAD_* secrets. Re-run with --replace to make a new upload key" >&2
  echo "(then reset the upload key in Play Console, or Play will reject new bundles)." >&2
  exit 1
fi

workdir="$(mktemp -d)"
cleanup() {
  if [ -f "$workdir/upload.p12" ]; then
    # Overwrite before deleting; on SSDs this is best effort.
    dd if=/dev/zero of="$workdir/upload.p12" bs=1k count=16 conv=notrunc > /dev/null 2>&1 || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT INT TERM
chmod 700 "$workdir"
keystore="$workdir/upload.p12"

# 32 random characters; exported only to this process's children via :env below.
random="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9')"
FERNI_UPLOAD_PASSWORD="${random:0:32}"
unset random
export FERNI_UPLOAD_PASSWORD
if [ "${#FERNI_UPLOAD_PASSWORD}" -lt 32 ]; then
  echo "Could not generate a password." >&2
  exit 1
fi

keytool -genkeypair -noprompt \
  -keystore "$keystore" -storetype PKCS12 \
  -storepass:env FERNI_UPLOAD_PASSWORD -keypass:env FERNI_UPLOAD_PASSWORD \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Ferni upload key, O=Ferni" > /dev/null 2>&1
chmod 600 "$keystore"

fingerprint="$(keytool -list -v -keystore "$keystore" -storetype PKCS12 \
  -storepass:env FERNI_UPLOAD_PASSWORD -alias "$ALIAS" 2> /dev/null |
  awk '/SHA256:/ && !seen { print $2; seen = 1 }')"
if [ -z "$fingerprint" ]; then
  echo "keytool did not produce a readable key." >&2
  exit 1
fi

base64 < "$keystore" | tr -d '\n' | gh secret set ANDROID_UPLOAD_KEYSTORE_B64 --repo "$REPO" --env "$ENV_NAME" > /dev/null
printf '%s' "$FERNI_UPLOAD_PASSWORD" | gh secret set ANDROID_UPLOAD_KEYSTORE_PASSWORD --repo "$REPO" --env "$ENV_NAME" > /dev/null
printf '%s' "$FERNI_UPLOAD_PASSWORD" | gh secret set ANDROID_UPLOAD_KEY_PASSWORD --repo "$REPO" --env "$ENV_NAME" > /dev/null
printf '%s' "$ALIAS" | gh secret set ANDROID_UPLOAD_KEY_ALIAS --repo "$REPO" --env "$ENV_NAME" > /dev/null
unset FERNI_UPLOAD_PASSWORD

cat <<EOF
Upload key SHA-256: $fingerprint

Next steps
Secrets stored in the $ENV_NAME environment of $REPO.

1. Run the "Android app (TWA)" workflow from main (Actions, Run workflow), approve the
   $ENV_NAME deployment, and download the signed bundle.
2. Play Console: create the app with package ai.ferni.app, enrol in Play App Signing,
   and upload that first bundle by hand to the internal testing track.
3. Play Console, Setup, App signing: copy the APP SIGNING key's SHA-256 (not this one).
4. Set the repository variable ANDROID_CERT_SHA256 to "<app signing SHA-256>,$fingerprint"
   (gh variable set ANDROID_CERT_SHA256 --repo $REPO) and redeploy app.ferni.ai so
   https://app.ferni.ai/.well-known/assetlinks.json lists them. Without it the app
   shows a browser bar instead of running full screen.
5. Optional: create a Play service account, store its JSON as PLAY_SERVICE_ACCOUNT_JSON
   in the play-release environment (also main-only with a reviewer), and later uploads
   can go through the workflow.
EOF
