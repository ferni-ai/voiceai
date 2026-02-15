# Kyutai voice clone: Ferni persona

**Goal:** Extract a Ferni voice reference (~10 s), generate a speaker embedding via the Kyutai speaker encoder, and pass it as the TTS condition so output sounds like Ferni.

---

## 1. Extract Ferni voice reference

- **Input:** ~10 s of clean Ferni speech (single speaker, 16–24 kHz WAV).
- **Output:** Speaker embedding (e.g. `models/ferni-voices/ferni/ferni-voice.safetensors` or equivalent).

**Script:** `scripts/kyutai/extract-voice.sh`

```bash
./scripts/kyutai/extract-voice.sh /path/to/ferni-10s.wav ferni
```

- If the Kyutai DSM repo is present and has an extraction script, the script runs it.
- Otherwise it prints instructions: clone [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling), use their voice extraction pipeline, or place a pre-made embedding under `models/ferni-voices/ferni/`.

---

## 2. Generate embedding (Kyutai speaker encoder)

The moshi crate’s TTS path supports speaker conditioning via:

- **SpeakerEncoder** (`moshi::tts_streaming::SpeakerEncoder`): encodes speaker PCM → conditioning tensor.
- **Condition:** `Condition::AddToInput(tensor)` passed into `State::step(..., conditions)`.

Encoder steps (conceptually):

1. Load Mimi + condition_provider weights (incl. `condition_provider.conditioners.speaker_wavs.*`).
2. Run reference PCM through Mimi `encode_pre_quantize` and the speaker projection.
3. Optionally add sin embeddings and save the result (e.g. safetensors) for reuse.

**Current limitation:** The 7B TTS config we use (`v0_1_streaming` / `tts_v0_1`) has `conditioners: Default::default()`, so the model may not expose or load `condition_provider`. Full voice conditioning in the bridge therefore depends on either:

- Using a model variant that includes speaker conditioning weights, or  
- Adding optional loading of a **precomputed** embedding (e.g. from a Python extraction script) and passing it as `Condition::AddToInput(...)` into `State::step(..., Some(&condition))`.

---

## 3. Pass as TTS condition (bridge)

- **Protocol:** TTS request already accepts `voice_id` (e.g. `"ferni"`).
- **Bridge (current):** `voice_id` is accepted but not yet used; `State::step(..., None)` is called (no conditions).
- **Intended:** When a precomputed embedding exists for `voice_id` (e.g. from step 1–2), the bridge should:
  1. Load the embedding tensor (e.g. from `models/ferni-voices/<voice_id>/<voice_id>-voice.safetensors` or a configured path).
  2. Wrap it as `moshi::conditioner::Condition::AddToInput(tensor)`.
  3. Pass `Some(&condition)` to each `tts_state.step(..., condition)`.

Once this is implemented, verify with: “Hello world” with `voice_id: "ferni"` and confirm the output matches the Ferni reference.

---

## 4. Status

| Step                         | Status | Notes |
|-----------------------------|--------|--------|
| Extract ~10 s Ferni ref     | Script in place | `scripts/kyutai/extract-voice.sh` |
| Generate embedding          | Doc + external | Kyutai repo / Python or future bridge encoder |
| Pass as TTS condition       | Placeholder | `voice_id` accepted; conditioning not wired (model may lack condition_provider) |

---

*See also: [KYUTAI-DSM-SETUP.md](../guides/KYUTAI-DSM-SETUP.md) (Phase 2a voice cloning), [KYUTAI-DSM-GAPS.md](KYUTAI-DSM-GAPS.md).*
