# Voice CLI Connection Issue - Race Condition Analysis

**Status**: Fix Applied, Awaiting Testing
**Date**: 2025-12-14
**Priority**: High (blocks voice CLI usage)

## Problem Summary

When using the voice CLI (`ferni voice` or `npx tsx scripts/cli/voice-live.ts`), the Ferni agent connects but doesn't speak to the user.

**Symptoms:**
- Intro sound plays correctly
- Connect sound plays correctly
- Agent logs show successful connection
- But user hears nothing from Ferni

## Root Cause Analysis

**Race Condition**: The agent connects to LiveKit ~132ms BEFORE the CLI connects and publishes its audio track.

### Timeline of Events

```
T+0ms:    Agent receives job from LiveKit
T+132ms:  Agent connects to room
T+132ms:  Agent calls ctx.waitForParticipant()
T+???ms:  CLI connects to room (AFTER agent)
T+???ms:  CLI publishes audio track

PROBLEM:  Agent's waitForParticipant() was called BEFORE
          CLI connected, so it waits forever
```

### Evidence from Logs

Agent logs showed:
```
[voice-agent-entry] 👤 Waiting for participant to join...
participant: { identity: 'cli-user-xxx', trackPublications: [] }
```

The `trackPublications: []` indicates the CLI's audio track wasn't published yet when the agent checked.

Later:
```
Error: Room disconnected while waiting for participant
```

## Fix Applied

**File**: `src/agents/voice-agent-entry.ts` (lines 342-368)

Added a 2-second timeout to `waitForParticipant()` to prevent hanging:

```typescript
// Race between waitForParticipant and timeout
const PARTICIPANT_TIMEOUT_MS = 2000;
const timeoutPromise = new Promise<null>((resolve) =>
  setTimeout(() => resolve(null), PARTICIPANT_TIMEOUT_MS)
);
const participant = await Promise.race([
  ctx.waitForParticipant(),
  timeoutPromise
]);

if (participant) {
  // Normal flow - participant detected
} else {
  // Timeout - proceed anyway (CLI may have connected)
}
```

## Testing Required

When resuming work on this issue:

1. **Start the agent** (if not running):
   ```bash
   pnpm agent:dev
   ```

2. **Run the voice CLI**:
   ```bash
   ferni voice
   # or
   npx tsx scripts/cli/voice-live.ts
   ```

3. **Expected behavior**:
   - Intro sound plays
   - Connect sound plays ~2 seconds later
   - Ferni speaks a greeting within 3-5 seconds

4. **If still not working**, check agent logs for:
   - "Participant timeout after 2000ms - proceeding anyway"
   - Any errors after the timeout

## Potential Next Steps (If Fix Doesn't Work)

### Option 1: Pre-publish Audio Track in CLI
Modify `scripts/cli/voice-live.ts` to publish the audio track BEFORE connecting:
```typescript
// Create and publish track before full connection
const audioTrack = await createLocalAudioTrack();
await room.localParticipant.publishTrack(audioTrack);
```

### Option 2: Retry Pattern in Agent
Add retry logic instead of single timeout:
```typescript
for (let i = 0; i < 5; i++) {
  const participant = await ctx.waitForParticipant({ timeout: 500 });
  if (participant?.trackPublications.length > 0) break;
  await sleep(200);
}
```

### Option 3: Event-Based Detection
Listen for track published events instead of polling:
```typescript
room.on('trackPublished', (publication, participant) => {
  if (publication.kind === 'audio') {
    // Proceed with greeting
  }
});
```

## Related Files

| File | Purpose |
|------|---------|
| `src/agents/voice-agent-entry.ts` | Agent entry point - contains the fix |
| `scripts/cli/voice-live.ts` | Voice CLI - connects to LiveKit |
| `apps/macos-menubar/` | macOS menubar app (uses same CLI) |

## Sound Flow (Working)

```
User runs CLI
    │
    ▼
playSound('intro')  ← Plays dramatic-entrance.mp3
    │
    ▼
CLI connects to LiveKit room
    │
    ▼
Agent detects connection (with 2s timeout)
    │
    ▼
playSound('connect') ← Plays connect.mp3
    │
    ▼
Agent speaks greeting ← THIS IS THE STEP THAT WAS BROKEN
```

## Notes

- The 2-second timeout is a workaround, not a complete fix
- The underlying issue is that LiveKit's participant detection may not see tracks published after the participant joined
- Consider investigating LiveKit's `trackSubscribed` events for more reliable detection
