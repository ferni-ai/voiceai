# Voice Sample Audio Files

Pre-recorded audio samples for the landing page voice demo feature.

## Required Files

Generate these using Cartesia (our TTS provider) with the Ferni voice:

| File | Persona | Script | Duration |
|------|---------|--------|----------|
| `ferni-stress.mp3` | Ferni | "That sounds like a lot to carry. What's weighing on you the most right now?" | ~6s |
| `maya-habits.mp3` | Maya | "Let's make that habit embarrassingly small. What's one tiny step you could take tomorrow?" | ~7s |
| `peter-decision.mp3` | Peter | "Big decisions deserve a thorough think-through. Let me help you see all the angles here." | ~7s |
| `ferni-greeting.mp3` | Ferni | "Hey! I'm Ferni. I'm here whenever you need to talk through something. No agenda, no rush." | ~8s |
| `alex-communication.mp3` | Alex | "Communication is about being heard, not just saying words. Tell me what you really want them to understand." | ~9s |
| `jordan-celebration.mp3` | Jordan | "That's worth celebrating! Tell me everything - I want to hear how it felt in the moment." | ~7s |

## Generation Script

```bash
# Use the Cartesia API with our Ferni voice ID
# See scripts/generate-voice-samples.ts for automated generation

npm run generate:voice-samples
```

## Audio Format

- Format: MP3
- Sample rate: 44.1kHz  
- Channels: Mono
- Bitrate: 128kbps
- Normalize to -16 LUFS

## Usage

The `voice-samples.js` module loads these files when the Voice Samples feature flag is enabled.

Files are served from `/audio/` on the landing page.

