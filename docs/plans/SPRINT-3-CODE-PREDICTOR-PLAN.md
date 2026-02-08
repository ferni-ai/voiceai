# Sprint 3: Talker Code Predictor

**Prerequisite:** Sprint 2 (Talker MoE text decoder) complete.  
**Goal:** Implement the 5-layer code predictor that consumes text decoder hidden states and outputs codec token logits for Code2Wav.

---

## 1. Architecture

```
Text Decoder Hidden (batch, seq, 1024)
  → Code Predictor (5 transformer layers, hidden 1024)
  → Final linear head(s)
  → Codec logits (batch, seq, num_code_groups, vocab_size)
```

**Config** (from `TalkerCodePredictorConfig`, already in `candle_talker.rs`):

- `hidden_size`: 1024
- `num_hidden_layers`: 5
- `num_attention_heads`: 16
- `num_key_value_heads`: 8
- `intermediate_size`: 3072
- `rms_norm_eps`: 1e-6
- `num_code_groups`: 32
- `vocab_size`: 2048

**Output:** One logit tensor per code group, or one linear of shape `(1024, num_code_groups * vocab_size)` then reshape to `(batch, seq, num_code_groups, vocab_size)`. HF typically uses a single projection to `num_code_groups * vocab_size` then reshape.

---

## 2. Strategy

- **Reuse patterns:** Code predictor is a standard decoder stack (no MoE): RMSNorm, self-attention (GQA), MLP (gate + up + down), residuals. Can reuse `candle_moe::RmsNorm`, and either add a small dense decoder in `candle_talker.rs` or a shared “dense decoder layer” in `candle_moe.rs` if useful.
- **Weight layout:** Load from `vb_talker.pp("code_predictor")` or `vb_talker.pp("model").pp("code_predictor")` (confirm key prefix from HF checkpoint).
- **Talker.forward():** Replace the zeros stub with: `text_decoder.forward(...)` → `code_predictor.forward(hidden)` → reshape to `(batch, seq, num_groups, vocab)`.

---

## 3. File Changes (Planned)

| File                                  | Change                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/rust-perf/src/candle_talker.rs` | Add `CodePredictor` (5 layers: attention + MLP per layer, final RMSNorm, then linear to `num_code_groups * vocab_size`). Add field `code_predictor: CodePredictor` to `Qwen3OmniTalker`. In `load()`, load code predictor from VarBuilder. In `forward()`, run text_decoder → code_predictor → reshape. |
| `apps/rust-perf/src/candle_moe.rs`    | Optional: add a dense decoder layer (RMSNorm + attention + MLP) if we want to share with other non-MoE stacks; otherwise implement layer locally in talker.                                                                                                                                             |
| Docs                                  | Update ISSUES-GAPS-AND-DEBT.md and QWEN3-OMNI-CANDLE-AUDIT.md once code predictor is implemented.                                                                                                                                                                                                       |

---

## 4. Implementation Notes

- **Attention:** GQA with 16 heads, 8 KV heads, head_dim = 64. RoPE and KV cache optional for code predictor (can be causal decoder or non-causal; confirm from HF).
- **MLP:** Standard SiLU gate + up + down, intermediate_size 3072 (dense Linear, not MoE).
- **Output head:** Linear(1024, num_code_groups \* vocab_size), then reshape to (batch, seq, num_code_groups, vocab_size).
- **Weight keys:** Align with HF; likely `talker.model.code_predictor.layers.{0..4}.*` and `talker.model.code_predictor.lm_head.weight` or per-group heads.

---

## 5. Validation

- `cargo check --release --lib` for rust-perf and rust-omni.
- Unit test: forward with VarBuilder::zeros → output shape (1, seq, 32, 2048).
- Pipeline: `full_omni_pipeline::process_audio` still expects `talker.forward()` → (batch, seq, num_groups, vocab); no API change.

---

## 6. Estimated Scope

- New code: ~200–300 lines (code predictor layers + load + forward).
- No change to Thinker, Mel, Encoder, or Code2Wav.
