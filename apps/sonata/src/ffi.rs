//! C FFI declarations for pocket-voice STT and TTS engines.
//!
//! These functions are provided by:
//!   - libpocket_stt.dylib  (pocket-voice/src/stt/)
//!   - libpocket_tts_rs.dylib (pocket-voice/src/tts/)
//!
//! Both engines use candle + Metal for GPU inference on Apple Silicon.
//! Audio format: f32 PCM, 24kHz, mono, 1920 samples per frame (80ms).

use std::ffi::{c_char, c_double, c_float, c_int, c_void};

// ─── STT FFI ────────────────────────────────────────────────────────────────────

extern "C" {
    /// Create a new STT engine. Downloads model from HuggingFace on first call.
    /// Returns an opaque pointer, or NULL on failure.
    pub fn pocket_stt_create(
        hf_repo: *const c_char,
        model_path: *const c_char,
        enable_vad: c_int,
    ) -> *mut c_void;

    /// Destroy a STT engine, freeing all resources.
    pub fn pocket_stt_destroy(engine: *mut c_void);

    /// Process one frame of PCM audio (f32, 24kHz, mono).
    /// Returns the number of recognized words, or -1 on error.
    pub fn pocket_stt_process_frame(
        engine: *mut c_void,
        pcm: *const c_float,
        num_samples: c_int,
    ) -> c_int;

    /// Feed silence to flush remaining text after speech ends.
    /// Returns number of words, or -1 on error.
    pub fn pocket_stt_flush(engine: *mut c_void) -> c_int;

    /// Get the i-th word from the last process_frame/flush call.
    /// Returns byte length of the word, or -1 if index out of range.
    pub fn pocket_stt_get_word(
        engine: *mut c_void,
        index: c_int,
        buf: *mut c_char,
        buf_size: c_int,
        start_time: *mut c_double,
        end_time: *mut c_double,
    ) -> c_int;

    /// Get all recognized text as a single string.
    /// Returns byte length, or -1 on error.
    pub fn pocket_stt_get_all_text(
        engine: *mut c_void,
        buf: *mut c_char,
        buf_size: c_int,
    ) -> c_int;

    /// Get semantic VAD probability for the given time horizon.
    /// Returns probability of NO voice activity, or -1.0 on error.
    pub fn pocket_stt_get_vad_prob(engine: *mut c_void, horizon: c_int) -> c_float;

    /// Returns 1 if VAD is enabled, 0 otherwise.
    pub fn pocket_stt_has_vad(engine: *mut c_void) -> c_int;

    /// Reset streaming state for a new utterance.
    pub fn pocket_stt_reset(engine: *mut c_void);

    /// Returns the expected frame size in samples (1920).
    pub fn pocket_stt_frame_size() -> c_int;

    /// Returns the expected sample rate in Hz (24000).
    pub fn pocket_stt_sample_rate() -> c_int;

    /// Returns the model's audio delay in seconds.
    pub fn pocket_stt_audio_delay(engine: *mut c_void) -> c_double;
}

// ─── TTS FFI ────────────────────────────────────────────────────────────────────

extern "C" {
    /// Create a TTS engine. Downloads model from HuggingFace on first call.
    /// Returns an opaque pointer, or NULL on failure.
    pub fn pocket_tts_rs_create(
        hf_repo: *const c_char,
        voice_path: *const c_char,
        n_q: c_int,
    ) -> *mut c_void;

    /// Destroy a TTS engine, freeing all resources.
    pub fn pocket_tts_rs_destroy(engine: *mut c_void);

    /// Feed text for synthesis. Can be called multiple times.
    /// Returns 0 on success, -1 on error.
    pub fn pocket_tts_rs_set_text(engine: *mut c_void, text: *const c_char) -> c_int;

    /// Signal that all text has been provided.
    /// Returns 0 on success, -1 on error.
    pub fn pocket_tts_rs_set_text_done(engine: *mut c_void) -> c_int;

    /// Run one generation step (~80ms of audio per step).
    /// Returns: 1 if done, 0 if more steps needed, -1 on error.
    pub fn pocket_tts_rs_step(engine: *mut c_void) -> c_int;

    /// Read decoded PCM audio from the output buffer.
    /// Returns number of samples copied, or -1 on error.
    pub fn pocket_tts_rs_get_audio(
        engine: *mut c_void,
        pcm_buf: *mut c_float,
        max_samples: c_int,
    ) -> c_int;

    /// Returns 1 if generation is complete, 0 otherwise.
    pub fn pocket_tts_rs_is_done(engine: *mut c_void) -> c_int;

    /// Reset the engine for a new utterance.
    /// Returns 0 on success, -1 on error.
    pub fn pocket_tts_rs_reset(engine: *mut c_void) -> c_int;

    /// Returns the output sample rate in Hz (24000).
    pub fn pocket_tts_rs_sample_rate() -> c_int;

    /// Returns the frame size in samples (1920).
    pub fn pocket_tts_rs_frame_size() -> c_int;
}
