#!/usr/bin/env python3
"""
Convert emotional speech datasets to Qwen3-TTS fine-tuning JSONL.

Expects data under scripts/qwen3-omni/data/:
  - ravdess/     (RAVDESS WAVs; transcripts inferred from standard sentences)
  - NonverbalTTS/ (HuggingFace layout; uses 'text' from metadata if present)
  - EmoV-DB/     (per-speaker dirs; looks for .txt or uses placeholder)

Output: train_raw.jsonl with lines:
  {"audio": "/path/to/file.wav", "text": "transcript", "ref_audio": "/path/to/ref.wav"}

Usage:
  python scripts/qwen3-omni/format-tts-data.py [--data-dir DIR] [--out path] [--ref path]
"""

import argparse
import json
import os
from pathlib import Path

# RAVDESS speech uses two sentences (modality 1 = speech, 2 = song)
RAVDESS_SENTENCES = [
    "Kids are talking by the door.",
    "Dogs are sitting by the door.",
]


def find_wavs(root: Path) -> list[tuple[Path, str]]:
    """Yield (wav_path, transcript) for each WAV under root."""
    out: list[tuple[Path, str]] = []
    root = root.resolve()
    for p in root.rglob("*.wav"):
        try:
            rel = p.relative_to(root)
            parts = rel.parts
            name = p.stem
            # RAVDESS: 03-01-01-01-01-01-01.wav -> modality, vocal, channel, emotion, intensity, statement, repetition, actor
            if "Audio_Speech" in str(root) or "ravdess" in root.name.lower():
                parts = name.split("-")
                statement = parts[5] if len(parts) >= 6 else "01"
                try:
                    idx = int(statement) - 1  # "01" -> 0, "02" -> 1
                    if idx < 0 or idx >= len(RAVDESS_SENTENCES):
                        idx = 0  # Fallback to first sentence
                except (ValueError, IndexError):
                    idx = 0
                text = RAVDESS_SENTENCES[idx]
                out.append((p, text))
            # EmoV-DB: sometimes has .txt alongside
            elif (p.parent / f"{p.stem}.txt").exists():
                txt_path = p.parent / f"{p.stem}.txt"
                text = txt_path.read_text(encoding="utf-8", errors="ignore").strip()
                out.append((p, text or "Speech."))
            # NonverbalTTS / other: placeholder
            else:
                out.append((p, "Speech."))
        except Exception:
            continue
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Format TTS data for Qwen3-TTS fine-tuning")
    ap.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent / "data")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--ref", type=Path, default=None)
    args = ap.parse_args()

    data_dir = args.data_dir.resolve()
    out_path = (args.out or data_dir / "train_raw.jsonl").resolve()
    ref_dir = data_dir / "ref"
    ref_audio = args.ref
    if ref_audio is None:
        for name in ["ferni_ref.wav", "ref.wav"]:
            candidate = ref_dir / name
            if candidate.exists():
                ref_audio = candidate
                break
        if ref_audio is None and ref_dir.exists():
            first_wav = next(ref_dir.glob("*.wav"), None)
            ref_audio = first_wav
    if ref_audio is None:
        ref_audio = ref_dir / "ferni_ref.wav"
    ref_str = str(ref_audio.resolve())

    collected: list[tuple[Path, str]] = []
    for sub in ["ravdess", "NonverbalTTS", "EmoV-DB"]:
        sub_path = data_dir / sub
        if sub_path.exists():
            collected.extend(find_wavs(sub_path))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        for wav_path, text in collected:
            line = json.dumps({
                "audio": str(wav_path.resolve()),
                "text": text,
                "ref_audio": ref_str,
            }, ensure_ascii=False) + "\n"
            f.write(line)

    print(f"Wrote {len(collected)} entries to {out_path}")
    print(f"ref_audio used: {ref_str}")


if __name__ == "__main__":
    main()
