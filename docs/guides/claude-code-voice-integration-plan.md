# Claude Code Voice Integration Plan

## Executive Summary

This plan outlines how to make Claude Code "talk" by integrating text-to-speech capabilities through hooks and/or a status line. Given your existing LiveKit + Cartesia voice infrastructure, you have multiple integration paths ranging from simple (macOS `say` command) to sophisticated (full LiveKit bridge).

---

## Part 1: Baseline Your Code First

Before implementing voice integration, commit your current state:

```bash
git add .
git commit -m "baseline: voiceai project before Claude Code voice integration"
```

---

## Part 2: Claude Code Extension Points

### 2.1 Hooks System

Hooks are shell commands that execute at specific lifecycle events. Configure in `~/.claude/settings.json`:

**Available Hook Events:**

| Event | Trigger | Use Case for Voice |
|-------|---------|-------------------|
| `PreToolUse` | Before Claude uses any tool | "Using bash command..." |
| `PostToolUse` | After tool completion | "Command finished" |
| `UserPromptSubmit` | When user submits prompt | "Processing your request..." |
| `Notification` | Claude sends notification | Read notifications aloud |
| `Stop` | Claude finishes responding | Speak the response summary |

**Hook Configuration Structure:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/voice-hooks/pre-tool.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "~/.claude/voice-hooks/post-tool.sh"
      }
    ],
    "Notification": [
      {
        "type": "command",
        "command": "~/.claude/voice-hooks/notification.sh"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "~/.claude/voice-hooks/response-complete.sh"
      }
    ]
  }
}
```

**Hook Input:** Hooks receive JSON via stdin with context about the event.

### 2.2 Status Line System

The status line receives session JSON via stdin and outputs display text. It can also trigger side effects.

**Configuration:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline-voice.py",
    "padding": 0
  }
}
```

**Input JSON Structure:**

```json
{
  "model": {
    "display_name": "Claude 3.5 Sonnet",
    "id": "claude-3-5-sonnet"
  },
  "workspace": {
    "current_dir": "/Users/sethford/Documents/voiceai"
  }
}
```

---

## Part 3: Voice Integration Architectures

### Architecture A: Simple macOS TTS (Fastest to Implement)

**Pros:** Zero dependencies, instant, built into macOS  
**Cons:** Robotic voice, limited customization  
**Implementation Time:** 30 minutes

```bash
#!/bin/bash
# ~/.claude/voice-hooks/notification.sh

# Read JSON from stdin
INPUT=$(cat)

# Extract message (using jq)
MESSAGE=$(echo "$INPUT" | jq -r '.message // .content // "Notification"')

# Speak with macOS TTS (background to not block)
say -v Alex "$MESSAGE" &
```

### Architecture B: Cartesia TTS (High Quality, Your Stack)

**Pros:** Beautiful voices, you already have the API key, consistent with Bogle agent  
**Cons:** Network latency, API costs  
**Implementation Time:** 2-3 hours

```python
#!/usr/bin/env python3
# ~/.claude/voice-hooks/speak-cartesia.py

import sys
import json
import os
import subprocess
import tempfile
import requests

CARTESIA_API_KEY = os.environ.get("CARTESIA_API_KEY")
VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"  # Barbershop Man

def speak(text: str):
    response = requests.post(
        "https://api.cartesia.ai/tts/bytes",
        headers={
            "X-API-Key": CARTESIA_API_KEY,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json"
        },
        json={
            "model_id": "sonic-english",
            "transcript": text,
            "voice": {"mode": "id", "id": VOICE_ID},
            "output_format": {"container": "mp3", "sample_rate": 44100}
        }
    )
    
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(response.content)
        temp_path = f.name
    
    subprocess.run(["afplay", temp_path])
    os.unlink(temp_path)

if __name__ == "__main__":
    data = json.load(sys.stdin)
    message = data.get("message") or data.get("content") or "Ready"
    speak(message)
```

### Architecture C: LiveKit Bridge (Full Voice AI Experience)

**Pros:** Full duplex voice, reuses your entire stack, could add STT for voice commands  
**Cons:** Complex, requires running infrastructure  
**Implementation Time:** 1-2 days

```
┌─────────────────┐     hooks/stdin      ┌──────────────────┐
│   Claude Code   │ ──────────────────▶  │  Bridge Server   │
│   (terminal)    │                      │  (Node.js)       │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                                  │ WebSocket
                                                  ▼
                                         ┌──────────────────┐
                                         │  LiveKit Room    │
                                         │  + Cartesia TTS  │
                                         └────────┬─────────┘
                                                  │
                                                  │ Audio
                                                  ▼
                                         ┌──────────────────┐
                                         │  Your Speakers   │
                                         └──────────────────┘
```

**Bridge Server Design:**

```typescript
// claude-voice-bridge/server.ts
import { Room, RoomEvent } from 'livekit-client';
import * as cartesia from '@livekit/agents-plugin-cartesia';

const room = new Room();
const tts = new cartesia.TTS({ voice: "...", apiKey: "..." });

// HTTP endpoint for hooks to POST to
app.post('/speak', async (req, res) => {
  const { text } = req.body;
  const audioStream = await tts.synthesize(text);
  // Play through LiveKit or direct audio
  room.localParticipant.publishTrack(audioStream);
  res.json({ ok: true });
});
```

### Architecture D: MCP Server (Clean Integration)

**Pros:** Native Claude Code integration via MCP, bidirectional  
**Cons:** New pattern, less documented  
**Implementation Time:** 1 day

Create an MCP server that exposes TTS as a tool Claude can call.

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "voice": {
      "command": "node",
      "args": ["~/.claude/mcp-voice-server/index.js"]
    }
  }
}
```

---

## Part 4: Recommended Implementation Path

### Phase 1: Quick Win (Today)
**Goal:** Prove the concept works with minimal effort

1. Create `~/.claude/voice-hooks/` directory
2. Implement macOS `say` hook for notifications
3. Test with Claude Code

```bash
mkdir -p ~/.claude/voice-hooks
```

### Phase 2: Quality Voice (This Week)  
**Goal:** Use Cartesia for high-quality voice

1. Create Python script using Cartesia API
2. Add hook for `Stop` event to summarize responses
3. Add smart filtering (don't speak code, just summaries)

### Phase 3: Intelligent Filtering (Next Week)
**Goal:** Only speak meaningful content

1. Create classifier to determine what's worth speaking
2. Summarize long responses before speaking
3. Add voice style matching (excited for success, calm for errors)

### Phase 4: Full Bridge (Optional Future)
**Goal:** Bidirectional voice + LiveKit integration

1. Build LiveKit bridge server
2. Add STT for voice commands to Claude Code
3. Create always-on voice companion mode

---

## Part 5: Implementation Files

### File Structure

```
~/.claude/
├── settings.json              # Main Claude Code config
├── voice-hooks/
│   ├── pre-tool.sh           # Before tool execution
│   ├── post-tool.sh          # After tool execution  
│   ├── notification.sh       # On notifications
│   ├── response-complete.sh  # When Claude finishes
│   └── lib/
│       ├── cartesia-speak.py # Cartesia TTS helper
│       └── summarizer.py     # Content summarizer
└── statusline-voice.py       # Status line with voice triggers
```

### Core Settings.json

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline-voice.py",
    "padding": 0
  },
  "hooks": {
    "Notification": [
      {
        "type": "command", 
        "command": "~/.claude/voice-hooks/notification.sh"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "~/.claude/voice-hooks/response-complete.sh"
      }
    ]
  }
}
```

---

## Part 6: Key Decisions to Make

| Decision | Options | Recommendation |
|----------|---------|----------------|
| TTS Engine | macOS `say`, Cartesia, Eleven Labs | Start `say`, upgrade to Cartesia |
| What to speak | Everything, Summaries only, Interactive | Summaries + notifications |
| Voice character | Neutral, Match Bogle, Custom | Match Bogle for consistency |
| Blocking vs async | Wait for speech, Background | Background (non-blocking) |
| STT (voice input) | None, Whisper, Your LiveKit stack | Future enhancement |

---

## Part 7: Quick Start Commands

```bash
# 1. Create directories
mkdir -p ~/.claude/voice-hooks/lib

# 2. Create minimal notification hook
cat > ~/.claude/voice-hooks/notification.sh << 'EOF'
#!/bin/bash
INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','notification'))")
say -v Alex "$MESSAGE" &
EOF
chmod +x ~/.claude/voice-hooks/notification.sh

# 3. Create/update settings
cat > ~/.claude/settings.json << 'EOF'
{
  "hooks": {
    "Notification": [
      {
        "type": "command",
        "command": "~/.claude/voice-hooks/notification.sh"
      }
    ]
  }
}
EOF

# 4. Test it
claude  # Start Claude Code and trigger a notification
```

---

## Part 8: Integration with Your Bogle Agent

Your existing Bogle agent uses:
- **TTS:** Cartesia (`@livekit/agents-plugin-cartesia`)
- **Voice:** Configurable voices with SSML support
- **Platform:** LiveKit real-time infrastructure

**Synergy Opportunities:**
1. Use same Cartesia voice for Claude Code (consistent "team" voice)
2. Reuse SSML tagging logic for expressive speech
3. Potentially route Claude Code output through LiveKit for recording/monitoring
4. Build "voice pair programming" experience with Bogle as voice interface

---

## Appendix: Community Tools

- **ccstatusline** - Enhanced status line (`npx ccstatusline@latest`)
- **claude-code-api** - HTTP API wrapper for Claude Code
- **agentapi** - HTTP control for AI agents

---

## Next Steps

1. ✅ Research complete
2. ⬜ Baseline code (git commit)
3. ⬜ Implement Phase 1 (macOS say)
4. ⬜ Test hooks work correctly
5. ⬜ Upgrade to Cartesia TTS
6. ⬜ Add intelligent content filtering
7. ⬜ Consider LiveKit bridge for advanced features

