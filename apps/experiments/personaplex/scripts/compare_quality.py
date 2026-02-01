#!/usr/bin/env python3
"""
Compare PersonaPlex voice quality against Cartesia.

Metrics:
- Speaker similarity (WavLM TDNN embeddings)
- MOS estimation (PESQ-based)
- Latency comparison

Usage:
    python compare_quality.py \
        --personaplex voices/embeddings/ferni.pt \
        --cartesia-voice-id fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc \
        --test-texts test-inputs/test-sentences.txt \
        --output-dir comparison-results/
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import torch
import torchaudio
from tqdm import tqdm

# Quality metrics
try:
    from pesq import pesq
    from pystoi import stoi
    QUALITY_METRICS_AVAILABLE = True
except ImportError:
    QUALITY_METRICS_AVAILABLE = False
    print("⚠️ PESQ/STOI not available. Install with: pip install pesq pystoi")


# Speaker similarity via WavLM
try:
    from transformers import Wav2Vec2FeatureExtractor, WavLMForXVector
    WAVLM_AVAILABLE = True
except ImportError:
    WAVLM_AVAILABLE = False
    print("⚠️ WavLM not available. Install with: pip install transformers")


class CartesiaClient:
    """Simple Cartesia TTS client for comparison."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("CARTESIA_API_KEY")
        if not self.api_key:
            raise ValueError("CARTESIA_API_KEY not set")
        
        self.base_url = "https://api.cartesia.ai"
        self.model = "sonic-3-latest"
    
    async def synthesize(self, text: str, voice_id: str) -> tuple[bytes, float]:
        """Synthesize text and return (audio_bytes, latency_ms)."""
        start_time = time.time()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/tts/bytes",
                headers={
                    "X-API-Key": self.api_key,
                    "Cartesia-Version": "2024-06-10",
                    "Content-Type": "application/json",
                },
                json={
                    "model_id": self.model,
                    "transcript": text,
                    "voice": {"mode": "id", "id": voice_id},
                    "output_format": {
                        "container": "raw",
                        "encoding": "pcm_s16le",
                        "sample_rate": 24000,
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            
        latency_ms = (time.time() - start_time) * 1000
        return response.content, latency_ms


class PersonaPlexClient:
    """PersonaPlex synthesis client for comparison."""
    
    def __init__(self, voice_prompt_path: Path):
        self.voice_prompt_path = voice_prompt_path
        # Load voice prompt
        self.voice_prompt = torch.load(voice_prompt_path)
    
    async def synthesize(self, text: str, text_prompt: str = "") -> tuple[bytes, float]:
        """Synthesize text using PersonaPlex offline mode."""
        import subprocess
        import tempfile
        
        start_time = time.time()
        
        # Create temp files for I/O
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as input_file:
            # Create silent input (for text-to-speech mode)
            # In real use, this would be user audio
            silence = torch.zeros(1, 24000)  # 1 second silence
            torchaudio.save(input_file.name, silence, 24000)
            input_path = input_file.name
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
            output_path = output_file.name
        
        try:
            # Run PersonaPlex offline
            result = subprocess.run(
                [
                    "python", "-m", "moshi.offline",
                    "--voice-prompt", str(self.voice_prompt_path),
                    "--text-prompt", text_prompt or text,
                    "--input-wav", input_path,
                    "--output-wav", output_path,
                    "--seed", "42",
                ],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=Path(__file__).parent.parent / "personaplex",
            )
            
            if result.returncode != 0:
                print(f"PersonaPlex error: {result.stderr}")
                return b"", 0
            
            # Read output audio
            with open(output_path, "rb") as f:
                audio_bytes = f.read()
            
        finally:
            # Cleanup temp files
            Path(input_path).unlink(missing_ok=True)
            Path(output_path).unlink(missing_ok=True)
        
        latency_ms = (time.time() - start_time) * 1000
        return audio_bytes, latency_ms


class QualityEvaluator:
    """Evaluate voice quality metrics."""
    
    def __init__(self):
        self.wavlm_model = None
        self.wavlm_processor = None
        
        if WAVLM_AVAILABLE:
            print("📦 Loading WavLM for speaker similarity...")
            self.wavlm_processor = Wav2Vec2FeatureExtractor.from_pretrained(
                "microsoft/wavlm-base-plus-sv"
            )
            self.wavlm_model = WavLMForXVector.from_pretrained(
                "microsoft/wavlm-base-plus-sv"
            )
    
    def calculate_speaker_similarity(
        self,
        reference_audio: torch.Tensor,
        synthesized_audio: torch.Tensor,
        sample_rate: int = 24000,
    ) -> float:
        """
        Calculate speaker similarity using WavLM embeddings.
        Returns cosine similarity (0-1, higher is better).
        """
        if not WAVLM_AVAILABLE or self.wavlm_model is None:
            return -1.0
        
        # Resample to 16kHz if needed (WavLM expects 16kHz)
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            reference_audio = resampler(reference_audio)
            synthesized_audio = resampler(synthesized_audio)
        
        with torch.no_grad():
            # Get embeddings for reference
            ref_inputs = self.wavlm_processor(
                reference_audio.squeeze().numpy(),
                sampling_rate=16000,
                return_tensors="pt",
            )
            ref_embedding = self.wavlm_model(**ref_inputs).embeddings
            
            # Get embeddings for synthesized
            syn_inputs = self.wavlm_processor(
                synthesized_audio.squeeze().numpy(),
                sampling_rate=16000,
                return_tensors="pt",
            )
            syn_embedding = self.wavlm_model(**syn_inputs).embeddings
            
            # Cosine similarity
            similarity = torch.nn.functional.cosine_similarity(
                ref_embedding, syn_embedding
            ).item()
        
        return similarity
    
    def estimate_mos(
        self,
        reference_audio: torch.Tensor,
        synthesized_audio: torch.Tensor,
        sample_rate: int = 24000,
    ) -> dict:
        """
        Estimate MOS using PESQ and STOI.
        Returns dict with pesq, stoi scores.
        """
        if not QUALITY_METRICS_AVAILABLE:
            return {"pesq": -1, "stoi": -1}
        
        # Resample to 16kHz for PESQ
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            reference_audio = resampler(reference_audio)
            synthesized_audio = resampler(synthesized_audio)
        
        ref_np = reference_audio.squeeze().numpy()
        syn_np = synthesized_audio.squeeze().numpy()
        
        # Ensure same length
        min_len = min(len(ref_np), len(syn_np))
        ref_np = ref_np[:min_len]
        syn_np = syn_np[:min_len]
        
        try:
            pesq_score = pesq(16000, ref_np, syn_np, "wb")  # Wideband
        except Exception as e:
            print(f"PESQ error: {e}")
            pesq_score = -1
        
        try:
            stoi_score = stoi(ref_np, syn_np, 16000, extended=False)
        except Exception as e:
            print(f"STOI error: {e}")
            stoi_score = -1
        
        return {"pesq": pesq_score, "stoi": stoi_score}


async def run_comparison(
    personaplex_prompt: Path,
    cartesia_voice_id: str,
    test_texts: list[str],
    reference_audio_path: Optional[Path],
    output_dir: Path,
):
    """Run full quality comparison."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize clients
    print("\n📦 Initializing clients...")
    cartesia = CartesiaClient()
    personaplex = PersonaPlexClient(personaplex_prompt)
    evaluator = QualityEvaluator()
    
    # Load reference audio if provided
    reference_audio = None
    if reference_audio_path and reference_audio_path.exists():
        reference_audio, _ = torchaudio.load(str(reference_audio_path))
        print(f"✅ Loaded reference audio: {reference_audio_path}")
    
    results = []
    
    print(f"\n🔄 Running comparison on {len(test_texts)} test sentences...")
    
    for i, text in enumerate(tqdm(test_texts, desc="Comparing")):
        result = {"text": text, "cartesia": {}, "personaplex": {}}
        
        # Synthesize with Cartesia
        try:
            cart_audio, cart_latency = await cartesia.synthesize(text, cartesia_voice_id)
            result["cartesia"]["latency_ms"] = cart_latency
            result["cartesia"]["audio_bytes"] = len(cart_audio)
            
            # Save audio
            cart_path = output_dir / f"cartesia_{i:03d}.wav"
            cart_waveform = torch.frombuffer(cart_audio, dtype=torch.int16).float() / 32768.0
            cart_waveform = cart_waveform.unsqueeze(0)
            torchaudio.save(str(cart_path), cart_waveform, 24000)
            
            # Quality metrics
            if reference_audio is not None:
                result["cartesia"]["speaker_similarity"] = evaluator.calculate_speaker_similarity(
                    reference_audio, cart_waveform
                )
        except Exception as e:
            print(f"Cartesia error: {e}")
            result["cartesia"]["error"] = str(e)
        
        # Synthesize with PersonaPlex
        try:
            pp_audio, pp_latency = await personaplex.synthesize(text)
            result["personaplex"]["latency_ms"] = pp_latency
            result["personaplex"]["audio_bytes"] = len(pp_audio)
            
            # Save audio
            pp_path = output_dir / f"personaplex_{i:03d}.wav"
            if pp_audio:
                pp_waveform = torch.frombuffer(pp_audio, dtype=torch.int16).float() / 32768.0
                pp_waveform = pp_waveform.unsqueeze(0)
                torchaudio.save(str(pp_path), pp_waveform, 24000)
                
                # Quality metrics
                if reference_audio is not None:
                    result["personaplex"]["speaker_similarity"] = evaluator.calculate_speaker_similarity(
                        reference_audio, pp_waveform
                    )
        except Exception as e:
            print(f"PersonaPlex error: {e}")
            result["personaplex"]["error"] = str(e)
        
        results.append(result)
    
    # Calculate summary statistics
    cart_latencies = [r["cartesia"].get("latency_ms", 0) for r in results if "latency_ms" in r["cartesia"]]
    pp_latencies = [r["personaplex"].get("latency_ms", 0) for r in results if "latency_ms" in r["personaplex"]]
    cart_similarities = [r["cartesia"].get("speaker_similarity", 0) for r in results if "speaker_similarity" in r["cartesia"]]
    pp_similarities = [r["personaplex"].get("speaker_similarity", 0) for r in results if "speaker_similarity" in r["personaplex"]]
    
    summary = {
        "total_samples": len(test_texts),
        "cartesia": {
            "avg_latency_ms": np.mean(cart_latencies) if cart_latencies else 0,
            "p95_latency_ms": np.percentile(cart_latencies, 95) if cart_latencies else 0,
            "avg_speaker_similarity": np.mean(cart_similarities) if cart_similarities else 0,
        },
        "personaplex": {
            "avg_latency_ms": np.mean(pp_latencies) if pp_latencies else 0,
            "p95_latency_ms": np.percentile(pp_latencies, 95) if pp_latencies else 0,
            "avg_speaker_similarity": np.mean(pp_similarities) if pp_similarities else 0,
        },
    }
    
    # Save results
    results_path = output_dir / "comparison_results.json"
    with open(results_path, "w") as f:
        json.dump({"summary": summary, "details": results}, f, indent=2)
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 COMPARISON SUMMARY")
    print("=" * 60)
    print(f"\n{'Metric':<30} {'Cartesia':<15} {'PersonaPlex':<15}")
    print("-" * 60)
    print(f"{'Avg Latency (ms)':<30} {summary['cartesia']['avg_latency_ms']:<15.1f} {summary['personaplex']['avg_latency_ms']:<15.1f}")
    print(f"{'P95 Latency (ms)':<30} {summary['cartesia']['p95_latency_ms']:<15.1f} {summary['personaplex']['p95_latency_ms']:<15.1f}")
    print(f"{'Avg Speaker Similarity':<30} {summary['cartesia']['avg_speaker_similarity']:<15.3f} {summary['personaplex']['avg_speaker_similarity']:<15.3f}")
    print("\n" + "=" * 60)
    
    # Go/No-Go recommendation
    print("\n🎯 GO/NO-GO ASSESSMENT:")
    
    go = True
    
    # Check speaker similarity (target: > 0.65)
    if summary['personaplex']['avg_speaker_similarity'] < 0.65:
        print("  ❌ Speaker similarity below target (0.65)")
        go = False
    else:
        print("  ✅ Speaker similarity meets target")
    
    # Check latency (target: < 500ms)
    if summary['personaplex']['p95_latency_ms'] > 500:
        print("  ❌ P95 latency above target (500ms)")
        go = False
    else:
        print("  ✅ Latency meets target")
    
    # Compare to Cartesia
    if summary['personaplex']['avg_speaker_similarity'] < summary['cartesia']['avg_speaker_similarity'] - 0.1:
        print("  ⚠️ Speaker similarity significantly worse than Cartesia")
        go = False
    else:
        print("  ✅ Speaker similarity comparable to Cartesia")
    
    print(f"\n{'🟢 GO' if go else '🔴 NO-GO'} - {'Proceed with integration' if go else 'Further investigation needed'}")
    
    print(f"\n📄 Full results saved to: {results_path}")
    
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Compare PersonaPlex vs Cartesia voice quality"
    )
    parser.add_argument(
        "--personaplex", "-p",
        type=Path,
        required=True,
        help="Path to PersonaPlex voice embedding (.pt)"
    )
    parser.add_argument(
        "--cartesia-voice-id", "-c",
        type=str,
        required=True,
        help="Cartesia voice ID for comparison"
    )
    parser.add_argument(
        "--test-texts", "-t",
        type=Path,
        required=True,
        help="File with test sentences (one per line)"
    )
    parser.add_argument(
        "--reference-audio", "-r",
        type=Path,
        help="Reference audio for speaker similarity (optional)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=Path("comparison-results"),
        help="Output directory for results"
    )
    
    args = parser.parse_args()
    
    # Load test texts
    with open(args.test_texts) as f:
        test_texts = [line.strip() for line in f if line.strip()]
    
    print(f"📝 Loaded {len(test_texts)} test sentences")
    
    # Run comparison
    asyncio.run(run_comparison(
        personaplex_prompt=args.personaplex,
        cartesia_voice_id=args.cartesia_voice_id,
        test_texts=test_texts,
        reference_audio_path=args.reference_audio,
        output_dir=args.output_dir,
    ))


if __name__ == "__main__":
    main()
