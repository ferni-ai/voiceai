#!/usr/bin/env python3
"""Prepare training data for Higgs Audio V2 LoRA fine-tuning.

Takes a directory of WAV audio clips + a manifest TSV file and formats
them into the HuggingFace dataset format expected by train_lora.py.

Manifest format (TSV):
    filename    transcript    [emotion]
    hello_01.wav    Hello, how are you today?    gentle
    excited_01.wav  That's incredible!    excited

Requirements:
    - Audio: WAV, 16-bit, mono, >=24kHz
    - Duration: 3-15 seconds per clip
    - Total: 10-20 minutes (120+ clips recommended)

Usage:
    python scripts/higgs/prepare_training_data.py \
        --audio-dir data/ferni-voice/ \
        --manifest data/ferni-voice/manifest.tsv \
        --output data/ferni-training/

Output:
    data/ferni-training/
        dataset.jsonl        # HuggingFace-compatible dataset
        audio/               # Resampled audio files (24kHz mono)
        stats.json           # Dataset statistics
"""

import argparse
import json
import os
import struct
import sys
import wave
from pathlib import Path


def read_wav_info(path: Path) -> dict:
    """Read WAV file metadata without loading audio."""
    with wave.open(str(path), "rb") as wf:
        return {
            "channels": wf.getnchannels(),
            "sample_rate": wf.getframerate(),
            "sample_width": wf.getsampwidth(),
            "n_frames": wf.getnframes(),
            "duration_s": wf.getnframes() / wf.getframerate(),
        }


def resample_wav(src: Path, dst: Path, target_sr: int = 24000) -> bool:
    """Resample WAV to target sample rate and mono using basic linear interpolation.

    For production quality, use librosa or ffmpeg. This is a simple fallback.
    """
    try:
        import numpy as np

        with wave.open(str(src), "rb") as wf:
            channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            sample_width = wf.getsampwidth()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)

        # Convert to numpy array
        if sample_width == 2:
            dtype = np.int16
        elif sample_width == 4:
            dtype = np.int32
        else:
            print(f"  Unsupported sample width: {sample_width}")
            return False

        audio = np.frombuffer(raw, dtype=dtype).astype(np.float32)

        # Convert to mono if stereo
        if channels == 2:
            audio = audio.reshape(-1, 2).mean(axis=1)

        # Normalize to [-1, 1]
        max_val = 32768.0 if sample_width == 2 else 2147483648.0
        audio /= max_val

        # Resample if needed
        if sample_rate != target_sr:
            duration = len(audio) / sample_rate
            new_len = int(duration * target_sr)
            indices = np.linspace(0, len(audio) - 1, new_len)
            audio = np.interp(indices, np.arange(len(audio)), audio)

        # Convert back to int16
        audio = np.clip(audio * 32767, -32768, 32767).astype(np.int16)

        # Write output
        dst.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(dst), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(target_sr)
            wf.writeframes(audio.tobytes())

        return True

    except ImportError:
        # Fallback: try ffmpeg
        import subprocess

        dst.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(src),
                "-ar",
                str(target_sr),
                "-ac",
                "1",
                "-sample_fmt",
                "s16",
                str(dst),
            ],
            capture_output=True,
        )
        return result.returncode == 0


def parse_manifest(manifest_path: Path) -> list[dict]:
    """Parse TSV manifest file."""
    entries = []
    with open(manifest_path) as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) < 2:
                print(f"  Warning: Skipping line {line_num} (need at least filename + transcript)")
                continue

            entry = {
                "filename": parts[0].strip(),
                "transcript": parts[1].strip(),
            }
            if len(parts) >= 3:
                entry["emotion"] = parts[2].strip()

            entries.append(entry)

    return entries


def format_chat_template(transcript: str, emotion: str | None = None) -> str:
    """Format text in Higgs Audio V2 chat template for TTS."""
    text = transcript
    if emotion:
        text = f"[{emotion}] {text}"

    return (
        f"<|im_start|>user\n"
        f"Convert the text to speech: {text}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


def main():
    parser = argparse.ArgumentParser(description="Prepare Higgs Audio V2 LoRA training data")
    parser.add_argument(
        "--audio-dir",
        type=Path,
        required=True,
        help="Directory containing WAV audio clips",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="TSV manifest: filename<tab>transcript[<tab>emotion]",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/ferni-training"),
        help="Output directory for processed dataset",
    )
    parser.add_argument(
        "--target-sr",
        type=int,
        default=24000,
        help="Target sample rate (default: 24000)",
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=1.0,
        help="Minimum clip duration in seconds (default: 1.0)",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=20.0,
        help="Maximum clip duration in seconds (default: 20.0)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  Higgs Audio V2 — Training Data Preparation")
    print("=" * 60)
    print(f"  Audio dir:  {args.audio_dir}")
    print(f"  Manifest:   {args.manifest}")
    print(f"  Output:     {args.output}")
    print(f"  Target SR:  {args.target_sr}")
    print()

    if not args.audio_dir.exists():
        print(f"Error: Audio directory not found: {args.audio_dir}")
        sys.exit(1)

    if not args.manifest.exists():
        print(f"Error: Manifest file not found: {args.manifest}")
        sys.exit(1)

    # Parse manifest
    entries = parse_manifest(args.manifest)
    print(f"Found {len(entries)} entries in manifest")

    # Process each entry
    output_audio = args.output / "audio"
    output_audio.mkdir(parents=True, exist_ok=True)

    dataset = []
    stats = {
        "total_entries": len(entries),
        "processed": 0,
        "skipped_missing": 0,
        "skipped_duration": 0,
        "skipped_resample": 0,
        "total_duration_s": 0.0,
        "emotions": {},
    }

    for i, entry in enumerate(entries):
        src_path = args.audio_dir / entry["filename"]

        if not src_path.exists():
            print(f"  [{i+1}/{len(entries)}] SKIP (missing): {entry['filename']}")
            stats["skipped_missing"] += 1
            continue

        # Check duration
        info = read_wav_info(src_path)
        duration = info["duration_s"]

        if duration < args.min_duration or duration > args.max_duration:
            print(
                f"  [{i+1}/{len(entries)}] SKIP (duration={duration:.1f}s): {entry['filename']}"
            )
            stats["skipped_duration"] += 1
            continue

        # Resample to target format
        dst_name = f"{i:04d}_{Path(entry['filename']).stem}.wav"
        dst_path = output_audio / dst_name

        needs_resample = (
            info["sample_rate"] != args.target_sr
            or info["channels"] != 1
        )

        if needs_resample:
            if not resample_wav(src_path, dst_path, args.target_sr):
                print(f"  [{i+1}/{len(entries)}] SKIP (resample failed): {entry['filename']}")
                stats["skipped_resample"] += 1
                continue
        else:
            # Just copy
            import shutil
            shutil.copy2(src_path, dst_path)

        # Build dataset entry
        emotion = entry.get("emotion")
        prompt = format_chat_template(entry["transcript"], emotion)

        dataset_entry = {
            "audio_path": str(dst_path.relative_to(args.output)),
            "text": entry["transcript"],
            "prompt": prompt,
            "duration_s": duration,
        }
        if emotion:
            dataset_entry["emotion"] = emotion
            stats["emotions"][emotion] = stats["emotions"].get(emotion, 0) + 1

        dataset.append(dataset_entry)
        stats["processed"] += 1
        stats["total_duration_s"] += duration

        status = f"OK ({duration:.1f}s)"
        if needs_resample:
            status += " [resampled]"
        print(f"  [{i+1}/{len(entries)}] {status}: {entry['filename']}")

    # Write dataset JSONL
    dataset_path = args.output / "dataset.jsonl"
    with open(dataset_path, "w") as f:
        for entry in dataset:
            f.write(json.dumps(entry) + "\n")

    # Write stats
    stats_path = args.output / "stats.json"
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)

    # Summary
    print()
    print("=" * 60)
    print(f"  Processed:     {stats['processed']} clips")
    print(f"  Total duration: {stats['total_duration_s']:.1f}s ({stats['total_duration_s']/60:.1f} min)")
    print(f"  Skipped:       {stats['skipped_missing']} missing, {stats['skipped_duration']} duration, {stats['skipped_resample']} resample")
    if stats["emotions"]:
        print(f"  Emotions:      {stats['emotions']}")
    print(f"  Output:        {dataset_path}")
    print("=" * 60)

    if stats["total_duration_s"] < 300:
        print(f"\n  Warning: Only {stats['total_duration_s']/60:.1f} min of audio.")
        print("  Recommended: 10-20 minutes for good voice quality.")

    if stats["processed"] < 50:
        print(f"\n  Warning: Only {stats['processed']} clips.")
        print("  Recommended: 120+ clips for good diversity.")


if __name__ == "__main__":
    main()
