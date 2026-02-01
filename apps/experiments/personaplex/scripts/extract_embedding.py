#!/usr/bin/env python3
"""
Extract voice embedding from audio sample using Mimi encoder.

The embedding captures voice characteristics (timbre, prosody, style)
that PersonaPlex uses for voice conditioning.

Usage:
    python extract_embedding.py --audio voices/samples/ferni.wav --output voices/embeddings/ferni.pt
"""

import argparse
import sys
from pathlib import Path

import torch
import torchaudio


def validate_audio(audio_path: Path) -> tuple:
    """Validate and load audio file."""
    if not audio_path.exists():
        print(f"Error: Audio file not found: {audio_path}")
        sys.exit(1)
    
    waveform, sample_rate = torchaudio.load(str(audio_path))
    
    print(f"📊 Audio info:")
    print(f"   Sample rate: {sample_rate} Hz")
    print(f"   Channels: {waveform.shape[0]}")
    print(f"   Duration: {waveform.shape[1] / sample_rate:.2f} seconds")
    
    # Check sample rate (Mimi expects 24kHz)
    if sample_rate != 24000:
        print(f"\n⚠️  Resampling from {sample_rate}Hz to 24000Hz (Mimi requirement)")
        resampler = torchaudio.transforms.Resample(sample_rate, 24000)
        waveform = resampler(waveform)
        sample_rate = 24000
    
    # Convert to mono if stereo
    if waveform.shape[0] > 1:
        print("⚠️  Converting to mono")
        waveform = waveform.mean(dim=0, keepdim=True)
    
    return waveform, sample_rate


def load_mimi_encoder():
    """Load Mimi encoder from PersonaPlex."""
    try:
        # Try to import from local PersonaPlex installation
        sys.path.insert(0, str(Path(__file__).parent.parent / "personaplex"))
        from moshi.models import MimiEncoder
        
        print("✅ Loaded Mimi encoder from local PersonaPlex")
        return MimiEncoder.from_pretrained()
    except ImportError:
        print("❌ Could not import Mimi encoder.")
        print("   Make sure PersonaPlex is installed:")
        print("   cd apps/experiments/personaplex && pip install personaplex/moshi/.")
        sys.exit(1)


def extract_embedding(
    audio_path: Path,
    output_path: Path,
    normalize: bool = True,
    trim_silence: bool = True,
) -> Path:
    """
    Extract voice embedding from audio.
    
    Args:
        audio_path: Path to input audio (WAV, 24kHz preferred)
        output_path: Path to save .pt embedding
        normalize: Normalize audio amplitude
        trim_silence: Trim leading/trailing silence
        
    Returns:
        Path to saved embedding
    """
    print(f"\n🎙️ Extracting voice embedding")
    print(f"   Input: {audio_path}")
    print(f"   Output: {output_path}")
    
    # Load and validate audio
    waveform, sample_rate = validate_audio(audio_path)
    
    # Normalize if requested
    if normalize:
        max_val = waveform.abs().max()
        if max_val > 0:
            waveform = waveform / max_val * 0.95
            print("✅ Normalized audio")
    
    # Trim silence if requested
    if trim_silence:
        # Simple energy-based trimming
        energy = waveform.squeeze().abs()
        threshold = energy.max() * 0.01
        
        # Find first and last non-silent samples
        non_silent = (energy > threshold).nonzero()
        if len(non_silent) > 0:
            start = max(0, non_silent[0].item() - int(0.1 * sample_rate))  # 100ms padding
            end = min(waveform.shape[1], non_silent[-1].item() + int(0.1 * sample_rate))
            waveform = waveform[:, start:end]
            print(f"✅ Trimmed silence (new duration: {waveform.shape[1] / sample_rate:.2f}s)")
    
    # Load Mimi encoder
    print("\n📦 Loading Mimi encoder...")
    encoder = load_mimi_encoder()
    
    # Extract embedding
    print("🔄 Extracting embedding...")
    with torch.no_grad():
        # Mimi expects [batch, time] or [batch, channels, time]
        if waveform.dim() == 2:
            waveform = waveform.unsqueeze(0)  # Add batch dimension
        
        # Get embedding tokens
        tokens = encoder.encode(waveform)
        
        # Aggregate across time to get fixed-size voice prompt
        # PersonaPlex uses the token sequence as the voice prompt
        embedding = {
            'tokens': tokens,
            'waveform_info': {
                'sample_rate': sample_rate,
                'duration': waveform.shape[-1] / sample_rate,
            }
        }
    
    # Save embedding
    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(embedding, output_path)
    
    print(f"\n✅ Embedding saved to: {output_path}")
    print(f"   Token shape: {tokens.shape}")
    
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Extract voice embedding from audio sample"
    )
    parser.add_argument(
        "--audio", "-a",
        type=Path,
        required=True,
        help="Path to input audio file (WAV, 24kHz preferred)"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        required=True,
        help="Path to save .pt embedding file"
    )
    parser.add_argument(
        "--no-normalize",
        action="store_true",
        help="Skip audio normalization"
    )
    parser.add_argument(
        "--no-trim",
        action="store_true",
        help="Skip silence trimming"
    )
    
    args = parser.parse_args()
    
    extract_embedding(
        audio_path=args.audio,
        output_path=args.output,
        normalize=not args.no_normalize,
        trim_silence=not args.no_trim,
    )


if __name__ == "__main__":
    main()
