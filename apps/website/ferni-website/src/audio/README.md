# Voice Sample Audio Files

Pre-recorded audio samples for the landing page "Six voices. One conversation." demo.

## Quick Start

Generate all voice samples using the Ferni CLI:

```bash
ferni voices generate-samples
```

This uses:

- **Persona voice registry** - Same voice IDs as the production app
- **Cartesia sonic-3** - Same TTS model as PersonaAwareTTS
- **Persona-specific voices** - Ferni, Maya, Peter, Alex, Jordan, Nayan

## Samples Generated

| File                | Persona                       | Topic               |
| ------------------- | ----------------------------- | ------------------- |
| `stress.mp3`        | Ferni (Life Coach)            | Overwhelm           |
| `habits.mp3`        | Maya (Habit Architect)        | Building habits     |
| `relationship.mp3`  | Alex (Communications Coach)   | Hard conversations  |
| `decision.mp3`      | Peter (Research Guide)        | Decision making     |
| `meaning.mp3`       | Nayan (Wisdom Guide)          | Finding meaning     |
| `celebration.mp3`   | Jordan (Celebration Catalyst) | Celebrating wins    |
| `career-advice.mp3` | Ferni                         | Career change fears |
| `sleep.mp3`         | Ferni                         | 3am thoughts        |

## Requirements

- `CARTESIA_API_KEY` in your `.env` file
- Voice IDs configured in `src/config/voice-ids.ts`

## Audio Format

- **Format:** MP3
- **Sample rate:** 44.1kHz
- **Model:** Cartesia sonic-3 (same as production)

## Deployment

After generating samples:

```bash
npm run deploy:landing
```

The samples are served from `/audio/samples/` on the landing page.

## How It Works

The `voice-samples.js` module on the landing page:

1. Tries to load pre-recorded MP3 files first
2. Falls back to browser TTS if files aren't found
3. Shows persona name, role, and color for each sample

## Updating Samples

To update the voice samples:

1. Edit responses in `scripts/ferni.ts` → `handleVoices` → `generate-samples`
2. Regenerate: `ferni voices generate-samples`
3. Deploy: `npm run deploy:landing`

The sample text should match `promo/ferni-website/src/js/voice-samples.js`.
