# E2E Testing with Firebase Emulators

This directory contains scripts and guides for end-to-end testing the Ferni web app with Firebase emulators (Auth + Firestore), allowing full local testing without production dependencies.

## Overview

The emulator setup provides:
- **Complete isolation**: Uses `demo-ferni` project (Firebase treats demo-* projects as emulator-only)
- **Full auth testing**: Test sign-in, sign-out, account linking
- **Real data patterns**: Seeds realistic user profile, memories, conversations, rituals
- **No production writes**: Impossible to accidentally write to production
- **Fast iteration**: Local development loop, no cloud latency

## Quick Start

### 1. Start the emulator stack

```bash
./scripts/e2e/start-signed-in-stack.sh
```

This will:
- Start Firebase Auth emulator (port 9099)
- Start Firestore emulator (port 8080)
- Seed test data into the emulators
- Start the Vite dev server on port 3004 with emulator mode enabled

The script displays test credentials:
- **Email**: test@ferni.local
- **Password**: Test123!@#

### 2. Open the app

Open http://localhost:3004 in your browser.

The app should be fully functional with:
- Sign-in via email/password using the test credentials
- User profile with seeded data
- Memories (What I've Learned)
- Conversation history
- Rituals
- All other signed-in features

### 3. Run Playwright e2e tests

In another terminal:

```bash
cd apps/web
npm run test:e2e
```

This runs all Playwright tests against the local emulator stack.

## Architecture

### Firebase Configuration

**File**: `apps/web/src/config/firebase.ts`

When `import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'`:
1. Uses `demo-ferni` as project ID (emulator-only project)
2. Initializes with dummy credentials (safe for emulator)
3. Calls `connectAuthEmulator(auth, 'http://127.0.0.1:9099')`

When building for production or without the flag:
- Uses production VITE_FIREBASE_* environment variables
- No emulator code is included (tree-shaken by Vite)
- Production builds are completely unaffected

### Seed Data

**File**: `scripts/e2e/seed-emulators.ts`

Creates a complete test profile including:
- User authentication (email/password)
- User profile with preferences and subscription
- 3 sample memories from What I've Learned
- Conversation history with 4 messages
- 1 sample ritual (Morning Power-Up)

Run manually:
```bash
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
npx tsx scripts/e2e/seed-emulators.ts
```

### Start Script

**File**: `scripts/e2e/start-signed-in-stack.sh`

Orchestrates:
1. Setting up environment variables for emulators
2. Killing any existing emulator processes
3. Starting Firebase emulators
4. Waiting for emulators to be ready
5. Seeding test data
6. Creating `.env.development.local` with emulator config
7. Starting Vite dev server with emulator mode

## Environment Variables

### For Emulator Mode (Development)

```bash
# apps/web/.env.development.local
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_API_KEY=AIzaSyDummyKeyForEmulatorOnly
VITE_FIREBASE_AUTH_DOMAIN=demo-ferni.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-ferni
VITE_FIREBASE_STORAGE_BUCKET=demo-ferni.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### For Production (Built-in via env vars)

```bash
# Uses actual Firebase project credentials
VITE_FIREBASE_API_KEY=your-prod-key
VITE_FIREBASE_AUTH_DOMAIN=prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-prod-project
# ... etc
```

## Troubleshooting

### "Emulators failed to start"

Ensure Java is installed:
```bash
brew install openjdk@21
export JAVA_HOME="$(brew --prefix openjdk@21)"
export PATH="$JAVA_HOME/bin:$PATH"
```

### "Address already in use" (port 9099 or 8080)

Kill any existing emulator processes:
```bash
pkill -f "firebase.*emulator"
sleep 1
```

### Test data not appearing

Verify the seed script ran successfully:
```bash
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
curl http://127.0.0.1:8080  # Should return 200
```

### Can't sign in with test credentials

Ensure:
1. Firestore emulator is running: `curl http://127.0.0.1:8080`
2. Auth emulator is running: The web app should log "Connected to Firebase Auth emulator"
3. Browser console shows no errors (check for CORS, network issues)

## Testing Checklist

When running e2e tests, verify:

- [ ] Sign-in works with test credentials
- [ ] User profile loads with correct name and avatar
- [ ] What I've Learned (memories) shows 3 items
- [ ] Conversation history displays past messages
- [ ] Rituals page shows the Morning Power-Up ritual
- [ ] Settings page loads all sections
- [ ] Sign-out works and returns to login
- [ ] Data persists across page reloads (in Firestore)
- [ ] No console errors or warnings
- [ ] All API calls use demo-ferni project

## Security Notes

### Why `demo-ferni` project?

Firebase automatically blocks any write or read attempts to projects with IDs starting with `demo-`. This is a built-in safety mechanism that ensures:
- **Impossible to write to production**: Even if code misconfigures production credentials, Firebase rejects the request
- **Emulator-only**: The demo project only works with local emulators
- **Complete isolation**: No risk of seeding production with test data

### Environment-based gating

The emulator connection is gated by two conditions:
1. `import.meta.env.DEV` - only in development (Vite's build-time variable)
2. `import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'` - opt-in flag

Both conditions must be true. This means:
- Production builds never include emulator code
- Accidental deployment of emulator config won't reach production (still rejected by demo-ferni)
- Team members must explicitly opt-in for local development

### Verifying isolation

Production builds contain zero references to emulators:
```bash
cd apps/web
npm run build
grep -r "127.0.0.1:9099" dist/  # Should return nothing
grep -r "demo-ferni" dist/       # Should return nothing
```

## Advanced Usage

### Inspect Emulator Data

Use the Firestore emulator REST API:
```bash
# Get user profile
curl http://127.0.0.1:8080/v1/projects/demo-ferni/databases/(default)/documents/users/test-user-e2e-001

# List all collections
curl http://127.0.0.1:8080/v1/projects/demo-ferni/databases/(default)/documents
```

### Re-seed Data

Without stopping the stack:
```bash
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
npx tsx scripts/e2e/seed-emulators.ts
```

### Custom Test User

Modify `scripts/e2e/seed-emulators.ts` to change the test user email, password, or seed data.

### Run Single Playwright Test

```bash
cd apps/web
npx playwright test tests/e2e/auth.spec.ts --headed
```

## CI/CD Integration

To run e2e tests in CI:

```yaml
# Example GitHub Actions workflow
- name: Start emulator stack
  run: ./scripts/e2e/start-signed-in-stack.sh &
  
- name: Wait for stack
  run: sleep 10  # Adjust based on startup time
  
- name: Run e2e tests
  run: cd apps/web && npm run test:e2e
  
- name: Stop services
  run: pkill -f "firebase.*emulator" || true
```

## Further Reading

- [Firebase Emulator Suite docs](https://firebase.google.com/docs/emulator-suite)
- [Firebase Authentication Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)
- [Firestore Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Vite environment variables](https://vitejs.dev/guide/env-and-mode)
