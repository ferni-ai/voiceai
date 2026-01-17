# Better Than Human - Verification Checklist

## What We've Implemented

The "Better Than Human" awareness system injects context into the LLM at session start, making Ferni aware of:

| Capability | Where Injected | When | Log Signature |
|------------|---------------|------|---------------|
| Date/Time | `modelBaseInstructions` | Connection | N/A (always) |
| User Name/Relationship | `modelBaseInstructions` | Connection | `👤 BETTER THAN HUMAN - User awareness injected` |
| Last Conversation Summary | `modelBaseInstructions` | Connection | (included in user awareness) |
| Recent Emotional State | `modelBaseInstructions` | Connection | (included in user awareness) |
| Life Events | `modelBaseInstructions` | Connection | (included in user awareness) |
| Goals & Concerns | `modelBaseInstructions` | Connection | (included in user awareness) |
| Calendar Awareness | `turn-handler` turn 0-1 | First turns | `📅 BETTER THAN HUMAN - Calendar awareness injected` |
| Pre-session Briefing | `turn-handler` turn 0 | First turn | `📋 Pre-session briefing injected` |

## E2E Verification Steps

### 1. Deploy

```bash
ferni deploy gce
```

### 2. Watch Logs

```bash
pnpm ops:logs
```

### 3. Start a Call

Connect to Ferni and look for these log lines:

```
[voice-agent-entry] 👤 BETTER THAN HUMAN - User awareness injected (X facts):
[voice-agent-entry]   1. You're speaking with: [Name]
[voice-agent-entry]   2. This is conversation #[N] together
[voice-agent-entry]   ...
[voice-agent-entry] 📅 BETTER THAN HUMAN - Calendar awareness loaded (N insights):
[voice-agent-entry]   1. ⏰ They have "Meeting" in X minutes
[turn-handler] 📋 Pre-session briefing injected into turn 0 context
[turn-handler] 📅 BETTER THAN HUMAN - Calendar awareness injected into turn context
```

### 4. Test Scenarios

| Test | How to Verify | Expected |
|------|---------------|----------|
| **Date Awareness** | Ask "What day is it?" | Ferni knows immediately |
| **Time Awareness** | Ask "What time is it?" | Ferni knows immediately |
| **Name Recognition** | Say "Hey Ferni" | Ferni uses your name naturally |
| **Returning User** | Return after a day | Ferni acknowledges time apart |
| **Calendar Awareness** | Have meeting in 30 min | Ferni may mention it (if connected) |
| **Emotional State** | Had sad conversation before | Ferni checks in on you |

### 5. New User vs Returning User

**New User** should see:
```
👤 No user awareness facts available (new user or empty profile)
```

**Returning User** should see:
```
👤 BETTER THAN HUMAN - User awareness injected (4-8 facts)
```

## Files Modified

- `src/agents/voice-agent-entry.ts` - Model-level instructions with date/time + user awareness
- `src/agents/multi-agent/agent-setup.ts` - Same for multi-agent mode
- `src/agents/voice-agent/turn-handler.ts` - Calendar + briefing injection on turn 0-1

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| No user awareness | New user or profile not loaded | Normal for first conversation |
| No calendar awareness | Calendar not connected | User needs to connect Google Calendar |
| Logs missing | Log level too high | Check `LOG_LEVEL` env var |
| Stale awareness | Session data not refreshing | Check `SessionDataManager` cache |

