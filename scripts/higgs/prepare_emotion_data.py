#!/usr/bin/env python3
"""Prepare emotion-tagged training data for Higgs Audio V2 Phase 3.

Extends the Phase 2 voice identity dataset with emotion-tagged recordings.
Same sentence recorded with different emotions teaches the model to respond
to inline emotion tags like [gentle], [excited], [whisper], etc.

Manifest format (TSV):
    filename    transcript    emotion
    sorry_gentle.wav    I'm sorry to hear that.    gentle
    sorry_serious.wav   I'm sorry to hear that.    serious
    great_excited.wav   That's absolutely great!    excited
    great_playful.wav   That's absolutely great!    playful

Usage:
    python scripts/higgs/prepare_emotion_data.py \
        --audio-dir data/ferni-emotion/ \
        --manifest data/ferni-emotion/manifest.tsv \
        --base-dataset data/ferni-training/dataset.jsonl \
        --output data/ferni-emotion-training/

Output:
    data/ferni-emotion-training/
        dataset.jsonl        # Combined base + emotion dataset
        audio/               # All audio files
        emotion_stats.json   # Emotion tag distribution
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

# Import shared logic from prepare_training_data
sys.path.insert(0, str(Path(__file__).parent))
from prepare_training_data import (
    format_chat_template,
    parse_manifest,
    read_wav_info,
    resample_wav,
)

# Supported emotion tags — must match main.rs prepare_text() and the plan
EMOTION_TAGS = {
    "gentle": "Soft, warm, lower energy — for concern, comfort",
    "excited": "Higher energy, faster pace — for good news, celebration",
    "whisper": "Very quiet, intimate — for secrets, late night",
    "serious": "Measured, even tone — for important topics",
    "playful": "Light, slightly higher pitch — for jokes, fun",
    "empathetic": "Warm with slight vocal fry — for understanding, support",
    "neutral": "Default speaking style — no special emotion",
}

# Recommended recording pairs: same text, different emotions
RECOMMENDED_PAIRS = [
    {
        "text": "I understand how you're feeling.",
        "emotions": ["gentle", "serious", "empathetic"],
    },
    {
        "text": "That's really interesting, tell me more.",
        "emotions": ["excited", "playful", "neutral"],
    },
    {
        "text": "I think you should take a moment to breathe.",
        "emotions": ["gentle", "whisper", "serious"],
    },
    {
        "text": "You did an amazing job with that.",
        "emotions": ["excited", "gentle", "playful"],
    },
    {
        "text": "Let's think about this carefully.",
        "emotions": ["serious", "gentle", "neutral"],
    },
    {
        "text": "I'm here for you, no matter what.",
        "emotions": ["empathetic", "gentle", "whisper"],
    },
    {
        "text": "Wow, that's such a great idea!",
        "emotions": ["excited", "playful", "neutral"],
    },
    {
        "text": "We should talk about something important.",
        "emotions": ["serious", "gentle", "neutral"],
    },
]


def generate_recording_guide(output_path: Path):
    """Generate a recording guide for the voice actor."""
    guide = []
    guide.append("# Emotion Recording Guide for Higgs Audio V2")
    guide.append("")
    guide.append("Record each sentence with the specified emotion.")
    guide.append("Name files as: <text_id>_<emotion>.wav")
    guide.append("Example: understand_gentle.wav, understand_serious.wav")
    guide.append("")
    guide.append("## Supported Emotion Tags")
    guide.append("")
    for tag, desc in EMOTION_TAGS.items():
        guide.append(f"  [{tag}] — {desc}")
    guide.append("")
    guide.append("## Recommended Recording Pairs")
    guide.append("")
    guide.append("For each text below, record with each listed emotion:")
    guide.append("")

    for i, pair in enumerate(RECOMMENDED_PAIRS, 1):
        guide.append(f"### Set {i}: \"{pair['text']}\"")
        for emo in pair["emotions"]:
            slug = pair["text"][:20].lower().replace(" ", "_").replace(".", "").replace(",", "")
            guide.append(f"  - [{emo}] → file: {slug}_{emo}.wav")
        guide.append("")

    guide.append("## Recording Tips")
    guide.append("")
    guide.append("- Keep mic position consistent between recordings")
    guide.append("- Same room, same distance for all clips")
    guide.append("- Natural transitions — don't over-act")
    guide.append("- 3-15 seconds per clip")
    guide.append("- Quiet environment, no background noise")
    guide.append("")
    guide.append("## Manifest Format (save as manifest.tsv)")
    guide.append("")
    guide.append("filename\\ttranscript\\temotion")

    for pair in RECOMMENDED_PAIRS:
        for emo in pair["emotions"]:
            slug = pair["text"][:20].lower().replace(" ", "_").replace(".", "").replace(",", "")
            guide.append(f"{slug}_{emo}.wav\t{pair['text']}\t{emo}")

    with open(output_path, "w") as f:
        f.write("\n".join(guide))

    print(f"Recording guide saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Prepare emotion training data for Higgs Audio V2")
    parser.add_argument("--audio-dir", type=Path, help="Directory containing emotion-tagged WAV clips")
    parser.add_argument("--manifest", type=Path, help="TSV manifest: filename<tab>transcript<tab>emotion")
    parser.add_argument("--base-dataset", type=Path, help="Base dataset from Phase 2 to merge with")
    parser.add_argument("--output", type=Path, default=Path("data/ferni-emotion-training"))
    parser.add_argument("--target-sr", type=int, default=24000)
    parser.add_argument("--generate-guide", action="store_true",
                        help="Generate a recording guide instead of processing data")
    args = parser.parse_args()

    if args.generate_guide:
        guide_path = args.output / "RECORDING_GUIDE.md"
        args.output.mkdir(parents=True, exist_ok=True)
        generate_recording_guide(guide_path)
        return

    if not args.audio_dir or not args.manifest:
        print("Error: --audio-dir and --manifest are required (or use --generate-guide)")
        sys.exit(1)

    print("=" * 60)
    print("  Higgs Audio V2 — Emotion Training Data Preparation")
    print("=" * 60)

    # Parse emotion manifest
    entries = parse_manifest(args.manifest)

    # Validate emotions
    for entry in entries:
        emo = entry.get("emotion", "")
        if emo and emo not in EMOTION_TAGS:
            print(f"  Warning: Unknown emotion '{emo}' in {entry['filename']}")
            print(f"  Supported: {list(EMOTION_TAGS.keys())}")

    # Process audio files
    output_audio = args.output / "audio"
    output_audio.mkdir(parents=True, exist_ok=True)

    emotion_dataset = []
    emotion_stats = {tag: 0 for tag in EMOTION_TAGS}

    for i, entry in enumerate(entries):
        src = args.audio_dir / entry["filename"]
        if not src.exists():
            print(f"  SKIP (missing): {entry['filename']}")
            continue

        info = read_wav_info(src)
        if info["duration_s"] < 1.0 or info["duration_s"] > 20.0:
            print(f"  SKIP (duration={info['duration_s']:.1f}s): {entry['filename']}")
            continue

        # Resample
        dst = output_audio / f"emo_{i:04d}_{Path(entry['filename']).stem}.wav"
        needs_resample = info["sample_rate"] != args.target_sr or info["channels"] != 1

        if needs_resample:
            if not resample_wav(src, dst, args.target_sr):
                continue
        else:
            shutil.copy2(src, dst)

        emotion = entry.get("emotion", "neutral")
        prompt = format_chat_template(entry["transcript"], emotion)

        emotion_dataset.append({
            "audio_path": str(dst.relative_to(args.output)),
            "text": entry["transcript"],
            "prompt": prompt,
            "duration_s": info["duration_s"],
            "emotion": emotion,
        })

        if emotion in emotion_stats:
            emotion_stats[emotion] += 1

        print(f"  [{i+1}/{len(entries)}] [{emotion}] {entry['transcript'][:50]}...")

    # Merge with base dataset if provided
    combined = []
    if args.base_dataset and args.base_dataset.exists():
        print(f"\nMerging with base dataset: {args.base_dataset}")
        with open(args.base_dataset) as f:
            for line in f:
                entry = json.loads(line.strip())
                # Copy audio files from base dataset
                base_dir = args.base_dataset.parent
                src_audio = base_dir / entry["audio_path"]
                if src_audio.exists():
                    dst_audio = output_audio / Path(entry["audio_path"]).name
                    if not dst_audio.exists():
                        shutil.copy2(src_audio, dst_audio)
                    entry["audio_path"] = f"audio/{dst_audio.name}"
                combined.append(entry)
        print(f"  Base entries: {len(combined)}")

    combined.extend(emotion_dataset)

    # Write combined dataset
    dataset_path = args.output / "dataset.jsonl"
    with open(dataset_path, "w") as f:
        for entry in combined:
            f.write(json.dumps(entry) + "\n")

    # Write emotion stats
    stats_path = args.output / "emotion_stats.json"
    with open(stats_path, "w") as f:
        json.dump({
            "emotion_counts": emotion_stats,
            "total_emotion_clips": len(emotion_dataset),
            "total_combined": len(combined),
            "base_clips": len(combined) - len(emotion_dataset),
        }, f, indent=2)

    # Summary
    print()
    print("=" * 60)
    print(f"  Emotion clips:  {len(emotion_dataset)}")
    print(f"  Base clips:     {len(combined) - len(emotion_dataset)}")
    print(f"  Total combined: {len(combined)}")
    print(f"  Emotion distribution:")
    for tag, count in sorted(emotion_stats.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"    [{tag}]: {count} clips")
    print(f"  Output: {dataset_path}")
    print("=" * 60)
    print()
    print("  Next: Train with emotion data:")
    print(f"    python scripts/higgs/train_lora.py \\")
    print(f"      --dataset {dataset_path} \\")
    print(f"      --audio-dir {args.output} \\")
    print(f"      --output models/higgs-v2-ferni-emotion-lora")


if __name__ == "__main__":
    main()
