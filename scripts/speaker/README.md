# Speaker model

The voice agent's neural speaker embeddings (speaker change, enrollment, voice
identity) come from `export-ecapa-onnx.py`: SpeechBrain ECAPA-TDNN as ONNX,
raw 16 kHz audio in, a unit 192-d embedding out.

**Kill switch:** unset `SPEAKER_MODEL_PATH` and every embedding is DSP voice
features. DSP never verifies or identifies anyone (voice verification fails
closed, `src/services/voice/voice-match-trust.ts`).

|               |                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object        | `gs://ferni-public-models/speaker/ecapa-tdnn-waveform-93ccd596.onnx` (public read)                                                                                                             |
| Size / sha256 | 84,131,064 bytes / `93ccd596285b31d5debad84ab3f138d5dc1145f19c3f287b81ece65afa034fc9`                                                                                                          |
| Pinned in     | `docker/Dockerfile.agent` (build fails on mismatch) and `PINNED_SPEAKER_MODEL_SHA256` in `src/services/voice/speaker-embedding-worker.ts` (the worker refuses a mismatch at load and uses DSP) |
| License       | Apache-2.0 (SpeechBrain). Ship `NOTICE` (this directory) and the Apache-2.0 text next to the object.                                                                                           |

The agent image downloads the object at build time, before any app source, so
the layer stays cached and needs no credentials. The UI server image has no
model.

**Publishing a new export:** run the script with the pinned versions in its
header, upload it under a new name (`ecapa-tdnn-waveform-<first 8 hex of
sha256>.onnx`, never overwrite an object), then change the URL and sha256 in
`docker/Dockerfile.agent` and `PINNED_SPEAKER_MODEL_SHA256` together. A test
(`speaker-embedding-worker.test.ts`) fails if those two disagree.

`make-test-models.py` writes the tiny ONNX fixtures the worker tests use.
