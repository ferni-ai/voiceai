# 🎵 Ferni Sound Effects

Sound effects for the Ferni voice AI experience. These sounds create the "radio show" feel.

## Existing Sounds

| File | Duration | Use Case |
|------|----------|----------|
| `connect.mp3` | ~500ms | Session start, notifications |
| `disconnect.mp3` | ~500ms | Session end |
| `dramatic-entrance.mp3` | ~1s | First meeting with specialist |
| `handoff-to-*.mp3` | ~800ms | Persona-specific handoff sounds |

## Needed Sounds (Game & DJ Experience)

Create these short audio files to complete the DJ experience:

### Game Sounds
| File | Duration | Description | Suggested Sound |
|------|----------|-------------|-----------------|
| `correct.mp3` | 300-500ms | Correct answer celebration | Uplifting ding, sparkle |
| `wrong.mp3` | 300-500ms | Wrong answer (gentle) | Soft descending tone |
| `hint.mp3` | 200-400ms | Hint given | Soft chime, bell |
| `game-start.mp3` | 500-800ms | Game beginning | Upbeat intro jingle |
| `game-end.mp3` | 500-800ms | Game complete | Achievement fanfare |
| `high-score.mp3` | 800ms-1s | New high score! | Celebratory fanfare |

### Session Sounds (DJ Feel)
| File | Duration | Description | Suggested Sound |
|------|----------|-------------|-----------------|
| `session-intro.mp3` | 800ms-1s | "Opening the show" | Warm welcome chime |
| `session-outro.mp3` | 800ms-1s | "Wrapping up" | Satisfying closing tone |
| `thinking.mp3` | 2-3s loop | Processing music | Soft ambient pad |

## Sound Design Guidelines

Following Ferni's brand aesthetic:
- **Warm, not clinical** - Use natural, organic sounds
- **Earthy tones** - Match the sage/brown color palette
- **Human-like** - Avoid robotic beeps
- **Short & sweet** - Most sounds under 1 second
- **Non-intrusive** - Support, don't distract

## Generation Script

Use `design-system/generate-sounds.js` to create sounds:
```bash
cd design-system
npm run generate-sounds
```

## Fallback System

The `session-sounds.ts` service automatically falls back to:
1. Similar existing sounds (e.g., `game-start` → `connect`)
2. TTS verbal sounds (e.g., "Ding ding ding!")

This means the experience works even without all sound files.

