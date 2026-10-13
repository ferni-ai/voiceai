# Presence sound clips: sources and license

Recorded human sounds Seth picked by ear (2026-10-13) for Ferni's presence
sounds: nine whistles (`whistles/`) and two cuts of one snore (`snores/`). They
come from Pixabay sound effects; every file is listed with its source page,
author and cut in `SOURCES.tsv`.

**License:** [Pixabay Content License](https://pixabay.com/service/license-summary/).
Free to use, no attribution required, modification allowed. Prohibited: selling or
distributing the content standalone (substantially unmodified), misleading use, and
use in trademarks.

**How they are used:** each clip is cut from the original, faded in and out and
resampled to 24 kHz mono 16-bit PCM. Whistles are phrases of 3 s or less,
loudness-matched to -21 LUFS (true peak -3 dB). Snores are two breaths (about 7 s),
matched to -31 LUFS, the level of the synthesized snore they replace. They are
played inside a call by the presence-sound path (PRESENCE_SOUND_ASSETS) and are
never served as downloadable files: they live in the agent image, not in the
public web folder.
