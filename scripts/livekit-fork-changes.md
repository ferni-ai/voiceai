# LiveKit Fork Changes - Copy/Paste Guide

Use this to apply changes to the forked repo.

---

## 1. packages/agents/src/telemetry/traces.ts

Find this section (around line 499):

```typescript
  // Add header (protobuf MetricsRecordingHeader)
  const audioStartTime = report.audioRecordingStartedAt ?? 0;
  const headerMsg = new MetricsRecordingHeader({
    roomId: report.roomId,
    duration: BigInt(0), // TODO: Calculate actual duration from report
```

Replace with:

```typescript
  // Add header (protobuf MetricsRecordingHeader)
  const audioStartTime = report.audioRecordingStartedAt ?? 0;
  // FERNI: Calculate actual duration from report instead of hardcoded 0
  const durationMs = report.duration ?? (report.timestamp - audioStartTime) ?? 0;
  const headerMsg = new MetricsRecordingHeader({
    roomId: report.roomId,
    duration: BigInt(durationMs),
```

---

## 2. packages/agents/src/voice/background_audio.ts

### 2a. Add import (near top of file, after other imports):

```typescript
import { Mutex } from '@livekit/mutex';
```

### 2b. Add property (in BackgroundAudioPlayer class, around line 144):

Find:
```typescript
  // TODO (Brian): add lock
```

Replace with:
```typescript
  // FERNI: Added mutex lock for thread-safe playTasks array access
  private playTasksLock = new Mutex();
```

### 2c. Update addDoneCallback (around line 255):

Find:
```typescript
    task.addDoneCallback(() => {
      playHandle._markPlayoutDone();
      this.playTasks.splice(this.playTasks.indexOf(task), 1);
    });
```

Replace with:
```typescript
    // FERNI: Use lock when modifying playTasks array to prevent race conditions
    task.addDoneCallback(() => {
      playHandle._markPlayoutDone();
      this.playTasksLock.lock().then((unlock) => {
        const idx = this.playTasks.indexOf(task);
        if (idx !== -1) {
          this.playTasks.splice(idx, 1);
        }
        unlock();
      });
    });
```

### 2d. Update close() method (around line 311):

Find:
```typescript
  async close(): Promise<void> {
    await cancelAndWait(this.playTasks, TASK_TIMEOUT_MS);
```

Replace with:
```typescript
  async close(): Promise<void> {
    // FERNI: Use lock when accessing playTasks to prevent race conditions
    const unlock = await this.playTasksLock.lock();
    const tasksToCancel = [...this.playTasks];
    unlock();

    await cancelAndWait(tasksToCancel, TASK_TIMEOUT_MS);
```

---

## 3. plugins/google/src/beta/realtime/realtime_api.ts

### 3a. Increase generateReply timeout (around line 357):

Find:
```typescript
    }, 5e3);
```

Replace with:
```typescript
    }, 15e3);  // FERNI: Increased from 5s to 15s for cold start
```

### 3b. (Optional) Add connection logging (around line 430):

Find:
```typescript
        const session = await this.#client.live.connect({
          model: this.options.model,
          callbacks: {
            onopen: () => sessionOpened.set(),
```

Replace with:
```typescript
        // FERNI: Log connection attempt for debugging
        console.error(`[GEMINI-LIVE] 🔌 Connecting (model: ${this.options.model})...`);
        const session = await this.#client.live.connect({
          model: this.options.model,
          callbacks: {
            onopen: () => {
              console.error(`[GEMINI-LIVE] ✅ Connected`);
              sessionOpened.set();
            },
```

### 3c. (Optional) Add error logging:

Find:
```typescript
            onerror: (error) => {
              this.#logger.error("Gemini Live session error:", error);
```

Replace with:
```typescript
            onerror: (error) => {
              // FERNI: Log to console for visibility
              console.error(`[GEMINI-LIVE] ❌ Error:`, error);
              this.#logger.error("Gemini Live session error:", error);
```

---

## After applying changes:

```bash
cd livekit-agents-js

# Install deps
pnpm install

# Build
pnpm build

# Commit
git add -A
git commit -m "feat: Ferni customizations for voice agent stability

- Fix duration calculation in telemetry (was hardcoded to 0)
- Add mutex lock for thread-safe playTasks access (race condition fix)
- Increase generateReply timeout to 15s for cold start scenarios
- Add optional Gemini connection logging"

# Tag
git tag agents-v1.0.31-ferni.1

# Push
git push origin ferni-v1.0.31 --tags
```

---

## Update voiceai package.json:

```json
{
  "dependencies": {
    "@livekit/agents": "github:ferni-ai/livekit-agents-js#agents-v1.0.31-ferni.1",
    "@livekit/agents-plugin-google": "github:ferni-ai/livekit-agents-js#agents-v1.0.31-ferni.1"
  }
}
```

Remove the `pnpm.patchedDependencies` section entirely.
