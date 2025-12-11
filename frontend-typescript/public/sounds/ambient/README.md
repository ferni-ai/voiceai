# 🌧️ Ambient Sound Packs

Background ambient audio loops for the Personalize feature. These play softly during sessions to create atmosphere.

## Required Files

| File                 | Duration | Description     | Guidelines                   |
| -------------------- | -------- | --------------- | ---------------------------- |
| `rain-loop.mp3`      | 30-60s   | Gentle rainfall | Soft, consistent, no thunder |
| `fireplace-loop.mp3` | 30-60s   | Crackling fire  | Warm, cozy, occasional pops  |
| `forest-loop.mp3`    | 30-60s   | Forest morning  | Birds, light wind, peaceful  |

## Audio Specifications

- **Format**: MP3 (for browser compatibility)
- **Bitrate**: 128-192 kbps (quality vs size balance)
- **Sample Rate**: 44.1kHz
- **Channels**: Stereo
- **Looping**: Files must loop seamlessly (no clicks/pops at boundaries)
- **Volume**: Normalized to -18dB LUFS (will be played at 12-18% volume)

## Sound Design Guidelines

Following Ferni's brand:

- **Subtle, not dominant** - These are background ambience
- **Natural sounds** - No synthetic/processed effects
- **Calming** - Support focus and conversation
- **Loop-friendly** - Seamless transitions when looping

## Creating Seamless Loops

1. Find a consistent section in the middle of your recording
2. Crossfade the start and end (3-5 seconds)
3. Test loop multiple times for clicks or obvious repeats
4. Use tools like Audacity's "Find Zero Crossings" for clean cuts

## Playback Behavior

The ambient sounds service handles:

- Smooth 2-second crossfade when switching packs
- Automatic "ducking" (volume reduction) when Ferni speaks
- Respects user mute settings
- Graceful fallback if files don't exist

## Free Resources

Royalty-free ambient sounds:

- [Freesound.org](https://freesound.org) - Search "rain loop", "fire crackling", "forest ambience"
- [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/)
- [Pixabay](https://pixabay.com/sound-effects/)

Remember to check licenses allow commercial use.
