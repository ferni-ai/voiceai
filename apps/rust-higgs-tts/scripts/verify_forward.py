#!/usr/bin/env python3
"""Verify Rust Higgs TTS forward pass against a Python reference.

Loads weights from safetensors, tokenizes the same text, runs a manual
forward pass through the text path, and dumps hidden states + logits
for comparison with the Rust implementation.

Usage:
    python3 apps/rust-higgs-tts/scripts/verify_forward.py
"""

import json
import math
import struct
from pathlib import Path
from tokenizers import Tokenizer
from safetensors import safe_open
import torch
import torch.nn.functional as F


MODEL_DIR = Path("apps/rust-higgs-tts/models/higgs-audio-v2")


def load_config():
    with open(MODEL_DIR / "config.json") as f:
        return json.load(f)


def load_weights():
    """Load all weights from safetensors into a flat dict."""
    import glob
    weights = {}
    for f in sorted(glob.glob(str(MODEL_DIR / "*.safetensors"))):
        with safe_open(f, framework="pt") as st:
            for k in st.keys():
                weights[k] = st.get_tensor(k)
    return weights


def prepare_text(text):
    """Same Llama 3 chat template as Rust."""
    return (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
        "Generate audio following instruction.\n\n"
        "<|scene_desc_start|>\n"
        "Audio is recorded from a quiet room.\n"
        "<|scene_desc_end|>"
        "<|eot_id|>"
        "<|start_header_id|>user<|end_header_id|>\n\n"
        f"Convert the text to speech: {text}"
        "<|eot_id|>"
        "<|start_header_id|>assistant<|end_header_id|>\n\n"
    )


def rms_norm(x, weight, eps=1e-5):
    """RMS normalization matching our Rust implementation."""
    x_f32 = x.float()
    variance = x_f32.pow(2).mean(-1, keepdim=True)
    x_normed = x_f32 / (variance + eps).sqrt()
    return (x_normed * weight.float()).to(x.dtype)


def build_rope_freqs(config):
    """Build RoPE frequencies matching our Rust implementation."""
    tc = config["text_config"]
    head_dim = tc.get("head_dim", 128)
    base = tc["rope_theta"]
    max_seq = tc["max_position_embeddings"]

    inv_freq = []
    for i in range(0, head_dim, 2):
        inv_freq.append(1.0 / (base ** (i / head_dim)))

    # Apply Llama3 NTK scaling
    scaling = tc.get("rope_scaling")
    if scaling and scaling.get("rope_type") == "llama3":
        factor = scaling["factor"]
        low_freq_factor = scaling["low_freq_factor"]
        high_freq_factor = scaling["high_freq_factor"]
        old_max = scaling["original_max_position_embeddings"]

        low_freq_wavelen = old_max / low_freq_factor
        high_freq_wavelen = old_max / high_freq_factor

        for j in range(len(inv_freq)):
            wavelen = 2 * math.pi / inv_freq[j]
            if wavelen < high_freq_wavelen:
                pass  # no scaling
            elif wavelen > low_freq_wavelen:
                inv_freq[j] /= factor
            else:
                smooth = (old_max / wavelen - low_freq_factor) / (high_freq_factor - low_freq_factor)
                inv_freq[j] = (1.0 - smooth) * (inv_freq[j] / factor) + smooth * inv_freq[j]

    inv_freq_t = torch.tensor(inv_freq, dtype=torch.float32)
    cache_len = min(max_seq, 8192)
    positions = torch.arange(cache_len, dtype=torch.float32)

    freqs = positions.unsqueeze(1) @ inv_freq_t.unsqueeze(0)
    emb = torch.cat([freqs, freqs], dim=-1)
    cos = emb.cos()
    sin = emb.sin()
    return cos, sin


def rotate_half(x):
    """Apply rotation matching our Rust rotate_half."""
    half = x.shape[-1] // 2
    x1 = x[..., :half]
    x2 = x[..., half:]
    return torch.cat([-x2, x1], dim=-1)


def apply_rope(q, k, cos, sin, offset):
    """Apply rotary embedding."""
    seq_len = q.shape[2]
    cos_slice = cos[offset:offset+seq_len].unsqueeze(0).unsqueeze(0).to(q.dtype)
    sin_slice = sin[offset:offset+seq_len].unsqueeze(0).unsqueeze(0).to(q.dtype)

    half = q.shape[-1] // 2
    q1, q2 = q[..., :half], q[..., half:]
    k1, k2 = k[..., :half], k[..., half:]

    q_rot = torch.cat([-q2, q1], dim=-1)
    k_rot = torch.cat([-k2, k1], dim=-1)

    q_out = q * cos_slice + q_rot * sin_slice
    k_out = k * cos_slice + k_rot * sin_slice
    return q_out, k_out


def gqa_attention(q, k, v, num_heads, num_kv_heads, causal=True):
    """Grouped query attention."""
    batch, _, seq_len, head_dim = q.shape
    kv_seq_len = k.shape[2]

    # Expand KV heads
    repeats = num_heads // num_kv_heads
    if repeats > 1:
        k = k.unsqueeze(2).expand(-1, -1, repeats, -1, -1).reshape(batch, num_heads, kv_seq_len, head_dim)
        v = v.unsqueeze(2).expand(-1, -1, repeats, -1, -1).reshape(batch, num_heads, kv_seq_len, head_dim)

    scale = math.sqrt(head_dim)
    attn_weights = (q @ k.transpose(-2, -1)) / scale

    if causal and seq_len > 1:
        mask = torch.triu(torch.full((seq_len, kv_seq_len), float('-inf')), diagonal=1)
        attn_weights = attn_weights + mask.to(attn_weights.dtype)

    attn_weights = F.softmax(attn_weights.float(), dim=-1).to(q.dtype)
    out = attn_weights @ v
    return out


def forward_one_layer(hidden, layer_idx, weights, config, cos, sin, offset, kv_cache=None):
    """Forward pass through one transformer layer (text path only)."""
    tc = config["text_config"]
    h = tc["hidden_size"]
    nh = tc["num_attention_heads"]
    nkv = tc["num_key_value_heads"]
    hd = tc.get("head_dim", 128)
    eps = tc["rms_norm_eps"]

    prefix = f"layers.{layer_idx}"

    residual = hidden

    # Pre-attention norm (text path)
    ln_w = weights[f"{prefix}.input_layernorm.weight"]
    normed = rms_norm(hidden, ln_w, eps)

    batch, seq_len, _ = normed.shape

    # Q, K, V projections
    q = normed @ weights[f"{prefix}.self_attn.q_proj.weight"].T
    k = normed @ weights[f"{prefix}.self_attn.k_proj.weight"].T
    v = normed @ weights[f"{prefix}.self_attn.v_proj.weight"].T

    # Reshape to (batch, heads, seq, head_dim)
    q = q.reshape(batch, seq_len, nh, hd).transpose(1, 2)
    k = k.reshape(batch, seq_len, nkv, hd).transpose(1, 2)
    v = v.reshape(batch, seq_len, nkv, hd).transpose(1, 2)

    # Apply RoPE
    q, k = apply_rope(q, k, cos, sin, offset)

    # KV cache
    if kv_cache is not None and kv_cache[layer_idx] is not None:
        prev_k, prev_v = kv_cache[layer_idx]
        k = torch.cat([prev_k, k], dim=2)
        v = torch.cat([prev_v, v], dim=2)
    if kv_cache is not None:
        kv_cache[layer_idx] = (k.clone(), v.clone())

    # Attention
    causal = (seq_len > 1)
    attn_out = gqa_attention(q, k, v, nh, nkv, causal=causal)

    # Reshape back
    attn_out = attn_out.transpose(1, 2).reshape(batch, seq_len, nh * hd)

    # Output projection
    attn_out = attn_out @ weights[f"{prefix}.self_attn.o_proj.weight"].T

    hidden = residual + attn_out

    # Post-attention norm + MLP (text path)
    residual = hidden
    ln_w = weights[f"{prefix}.post_attention_layernorm.weight"]
    normed = rms_norm(hidden, ln_w, eps)

    gate = normed @ weights[f"{prefix}.mlp.gate_proj.weight"].T
    gate = F.silu(gate)
    up = normed @ weights[f"{prefix}.mlp.up_proj.weight"].T
    mlp_out = (gate * up) @ weights[f"{prefix}.mlp.down_proj.weight"].T

    hidden = residual + mlp_out
    return hidden


def forward_audio_layer(hidden, layer_idx, weights, config, cos, sin, offset, kv_cache):
    """Forward pass through one layer in AUDIO mode (DualFFN audio path)."""
    tc = config["text_config"]
    h = tc["hidden_size"]
    nh = tc["num_attention_heads"]
    nkv = tc["num_key_value_heads"]
    hd = tc.get("head_dim", 128)
    eps = tc["rms_norm_eps"]

    prefix = f"layers.{layer_idx}"
    residual = hidden

    # Pre-attention norm: AUDIO path uses audio_input_layernorm
    ln_w = weights[f"{prefix}.audio_input_layernorm.weight"]
    normed = rms_norm(hidden, ln_w, eps)

    batch, seq_len, _ = normed.shape

    # Q, K, V (shared attention - same projections)
    q = normed @ weights[f"{prefix}.self_attn.q_proj.weight"].T
    k = normed @ weights[f"{prefix}.self_attn.k_proj.weight"].T
    v = normed @ weights[f"{prefix}.self_attn.v_proj.weight"].T

    q = q.reshape(batch, seq_len, nh, hd).transpose(1, 2)
    k = k.reshape(batch, seq_len, nkv, hd).transpose(1, 2)
    v = v.reshape(batch, seq_len, nkv, hd).transpose(1, 2)

    q, k = apply_rope(q, k, cos, sin, offset)

    if kv_cache[layer_idx] is not None:
        prev_k, prev_v = kv_cache[layer_idx]
        k = torch.cat([prev_k, k], dim=2)
        v = torch.cat([prev_v, v], dim=2)
    kv_cache[layer_idx] = (k.clone(), v.clone())

    attn_out = gqa_attention(q, k, v, nh, nkv, causal=False)
    attn_out = attn_out.transpose(1, 2).reshape(batch, seq_len, nh * hd)
    attn_out = attn_out @ weights[f"{prefix}.self_attn.o_proj.weight"].T

    hidden = residual + attn_out

    # Post-attention: AUDIO path uses audio_post_attention_layernorm + audio_mlp
    residual = hidden
    ln_w = weights[f"{prefix}.audio_post_attention_layernorm.weight"]
    normed = rms_norm(hidden, ln_w, eps)

    gate = normed @ weights[f"{prefix}.audio_mlp.gate_proj.weight"].T
    gate = F.silu(gate)
    up = normed @ weights[f"{prefix}.audio_mlp.up_proj.weight"].T
    mlp_out = (gate * up) @ weights[f"{prefix}.audio_mlp.down_proj.weight"].T

    hidden = residual + mlp_out
    return hidden


def main():
    print("=" * 60)
    print("  Higgs Audio V2 — Python Reference Forward Pass")
    print("=" * 60)

    config = load_config()
    tc = config["text_config"]
    num_layers = tc["num_hidden_layers"]
    num_codebooks = config["audio_num_codebooks"]
    vocab_per_cb = config["audio_codebook_size"] + 2  # 1026
    audio_out_bos = config["audio_out_bos_token_id"]
    audio_out_token_idx = config["audio_out_token_idx"]
    stream_bos = config["audio_stream_bos_id"]

    print(f"  Layers: {num_layers}")
    print(f"  Hidden: {tc['hidden_size']}")
    print(f"  Codebooks: {num_codebooks}")
    print(f"  Vocab/CB: {vocab_per_cb}")
    print(f"  audio_out_bos: {audio_out_bos}")
    print(f"  audio_out_token_idx: {audio_out_token_idx}")

    # Load weights
    print("\nLoading weights...")
    weights = load_weights()
    print(f"  Loaded {len(weights)} tensors")

    # Convert to BF16 (match Rust)
    for k in weights:
        weights[k] = weights[k].to(torch.bfloat16)

    # Build RoPE
    cos, sin = build_rope_freqs(config)

    # Tokenize
    tokenizer = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
    text = "Hello"
    prepared = prepare_text(text)
    encoding = tokenizer.encode(prepared, add_special_tokens=False)
    token_ids = encoding.ids
    print(f"\n  Input text: '{text}'")
    print(f"  Token count: {len(token_ids)}")
    print(f"  First 10 tokens: {token_ids[:10]}")
    print(f"  Last 10 tokens: {token_ids[-10:]}")

    # ── Phase 1: Text prefill ──
    print("\n--- Phase 1: Text Prefill ---")
    input_ids = torch.tensor([token_ids], dtype=torch.long)
    embed_w = weights["embed_tokens.weight"]
    hidden = F.embedding(input_ids, embed_w)  # (1, seq_len, hidden)
    print(f"  Embedding shape: {hidden.shape}")
    print(f"  Embedding[0,:5] (first 5 dims of first token): {hidden[0, 0, :5].float().tolist()}")

    kv_cache = [None] * num_layers

    for i in range(num_layers):
        hidden = forward_one_layer(hidden, i, weights, config, cos, sin, offset=0, kv_cache=kv_cache)
        if i == 0:
            print(f"  After layer 0: hidden[0,0,:5] = {hidden[0, 0, :5].float().tolist()}")
        if i == num_layers - 1:
            print(f"  After layer {i}: hidden[0,-1,:5] = {hidden[0, -1, :5].float().tolist()}")

    # Final norm
    norm_w = weights["norm.weight"]
    hidden = rms_norm(hidden, norm_w, tc["rms_norm_eps"])
    print(f"  After final norm: hidden[0,-1,:5] = {hidden[0, -1, :5].float().tolist()}")

    # Text logits from last position
    last_hidden = hidden[:, -1:, :]
    text_lm_head_w = weights["audio_decoder_proj.text_lm_head.weight"]
    text_logits = last_hidden @ text_lm_head_w.T
    top_text = text_logits[0, 0].float().topk(5)
    print(f"  Text logits top-5: {list(zip(top_text.indices.tolist(), [f'{v:.3f}' for v in top_text.values.tolist()]))}")
    predicted_token = text_logits[0, 0].argmax().item()
    print(f"  Predicted next token: {predicted_token} (expected audio_out_bos={audio_out_bos})")

    # ── Phase 2: Feed audio_out_bos ──
    print("\n--- Phase 2: Feed audio_out_bos ---")
    offset_now = len(token_ids)
    bos_embed = F.embedding(torch.tensor([[audio_out_bos]], dtype=torch.long), embed_w)
    hidden = bos_embed
    for i in range(num_layers):
        hidden = forward_one_layer(hidden, i, weights, config, cos, sin, offset=offset_now, kv_cache=kv_cache)
    hidden = rms_norm(hidden, norm_w, tc["rms_norm_eps"])
    print(f"  After audio_out_bos: hidden[0,0,:5] = {hidden[0, 0, :5].float().tolist()}")
    offset_now += 1

    # ── Phase 3: First audio step ──
    print("\n--- Phase 3: First Audio Step ---")
    # Embed: sum(cb_embeddings[stream_bos for each cb]) + embed_tokens(audio_out_token_idx)
    cb_embed_w = weights["audio_codebook_embeddings.weight"]

    codes = [stream_bos] * num_codebooks
    sum_embed = None
    for cb_idx, code in enumerate(codes):
        shifted_id = code + cb_idx * vocab_per_cb
        emb = cb_embed_w[shifted_id:shifted_id+1].unsqueeze(0)  # (1, 1, hidden)
        sum_embed = emb if sum_embed is None else sum_embed + emb

    # Official HuggingFace merge_input_ids_with_audio_features() REPLACES the
    # audio_out_token_idx text embedding with the audio code embedding.
    # The text embedding is NOT added — it's discarded.
    audio_embed = sum_embed
    print(f"  Audio embed[0,0,:5] = {audio_embed[0, 0, :5].float().tolist()}")

    # Forward through layers with AUDIO path
    hidden = audio_embed
    for i in range(num_layers):
        hidden = forward_audio_layer(hidden, i, weights, config, cos, sin, offset=offset_now, kv_cache=kv_cache)
        if i == 0:
            print(f"  After audio layer 0: hidden[0,0,:5] = {hidden[0, 0, :5].float().tolist()}")

    # Final norm
    hidden = rms_norm(hidden, norm_w, tc["rms_norm_eps"])
    print(f"  After final norm: hidden[0,0,:5] = {hidden[0, 0, :5].float().tolist()}")

    # Audio logits
    audio_lm_head_w = weights["audio_decoder_proj.audio_lm_head.weight"]
    audio_logits = hidden @ audio_lm_head_w.T  # (1, 1, 8208)
    audio_logits = audio_logits.reshape(1, 1, num_codebooks, vocab_per_cb)
    print(f"  Audio logits shape: {audio_logits.shape}")

    # Show top codes per codebook (greedy)
    print("\n  Greedy codes (step 0):")
    for cb in range(num_codebooks):
        cb_logits = audio_logits[0, 0, cb].float()
        top5 = cb_logits.topk(5)
        code = cb_logits.argmax().item()
        eos_rank = (cb_logits >= cb_logits[stream_bos + 1]).sum().item()
        print(f"    CB{cb}: code={code}  top5={list(zip(top5.indices.tolist(), [f'{v:.2f}' for v in top5.values.tolist()]))}  eos_rank={eos_rank}")

    # ── Phase 4: Run a few more audio steps to see pattern ──
    print("\n--- Phase 4: Audio Steps 1-4 ---")
    prev_codes = [audio_logits[0, 0, cb].float().argmax().item() for cb in range(num_codebooks)]
    all_codes = [prev_codes]
    offset_now += 1

    for step in range(1, 5):
        # Embed previous codes
        sum_embed = None
        for cb_idx, code in enumerate(prev_codes):
            shifted_id = code + cb_idx * vocab_per_cb
            emb = cb_embed_w[shifted_id:shifted_id+1].unsqueeze(0)
            sum_embed = emb if sum_embed is None else sum_embed + emb
        # Audio code embedding only — no text embedding added (matches official HF code)
        audio_embed = sum_embed

        hidden = audio_embed
        for i in range(num_layers):
            hidden = forward_audio_layer(hidden, i, weights, config, cos, sin, offset=offset_now, kv_cache=kv_cache)
        hidden = rms_norm(hidden, norm_w, tc["rms_norm_eps"])

        audio_logits = hidden @ audio_lm_head_w.T
        audio_logits = audio_logits.reshape(1, 1, num_codebooks, vocab_per_cb)

        prev_codes = [audio_logits[0, 0, cb].float().argmax().item() for cb in range(num_codebooks)]
        all_codes.append(prev_codes)
        offset_now += 1

        print(f"  Step {step} greedy codes: {prev_codes}")

    # Save reference values for Rust comparison
    ref_data = {
        "text_tokens": token_ids,
        "audio_step_codes": all_codes,
    }
    ref_path = MODEL_DIR / "python_reference.json"
    with open(ref_path, "w") as f:
        json.dump(ref_data, f, indent=2)
    print(f"\n  Reference values saved to {ref_path}")
    print("\n  DONE — Compare these values with Rust server logs.")


if __name__ == "__main__":
    main()
