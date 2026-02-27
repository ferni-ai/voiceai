//! Safe Rust wrapper around pocket-voice TTS C FFI.

use std::ffi::{c_void, CString};

use crate::ffi;

/// Safe wrapper around the pocket-voice TTS engine.
/// Manages the opaque engine pointer and provides safe Rust methods.
pub struct TtsEngine {
    engine: *mut c_void,
}

unsafe impl Send for TtsEngine {}

impl TtsEngine {
    /// Create a new TTS engine. Downloads model from HuggingFace on first call.
    pub fn create(
        hf_repo: &str,
        voice_path: Option<&str>,
        n_q: Option<i32>,
    ) -> Result<Self, String> {
        let repo =
            CString::new(hf_repo).map_err(|e| format!("Invalid hf_repo string: {}", e))?;

        let voice_c = voice_path
            .map(|p| CString::new(p).map_err(|e| format!("Invalid voice_path string: {}", e)))
            .transpose()?;

        let voice_ptr = voice_c
            .as_ref()
            .map(|c| c.as_ptr())
            .unwrap_or(std::ptr::null());

        let nq = n_q.unwrap_or(24);

        let engine = unsafe { ffi::pocket_tts_rs_create(repo.as_ptr(), voice_ptr, nq) };

        if engine.is_null() {
            return Err("Failed to create TTS engine (Metal GPU required)".into());
        }

        Ok(TtsEngine { engine })
    }

    /// Feed text for synthesis. Can be called multiple times as LLM tokens arrive.
    pub fn set_text(&mut self, text: &str) -> Result<(), String> {
        let text_c = CString::new(text).map_err(|e| format!("Invalid text string: {}", e))?;
        let result = unsafe { ffi::pocket_tts_rs_set_text(self.engine, text_c.as_ptr()) };
        if result < 0 {
            return Err("TTS set_text failed".into());
        }
        Ok(())
    }

    /// Signal that all text has been provided.
    pub fn set_text_done(&mut self) -> Result<(), String> {
        let result = unsafe { ffi::pocket_tts_rs_set_text_done(self.engine) };
        if result < 0 {
            return Err("TTS set_text_done failed".into());
        }
        Ok(())
    }

    /// Run one generation step (~80ms of audio per step at 12.5 Hz).
    /// Returns true if generation is complete.
    pub fn step(&mut self) -> Result<bool, String> {
        let result = unsafe { ffi::pocket_tts_rs_step(self.engine) };
        match result {
            1 => Ok(true),
            0 => Ok(false),
            _ => Err("TTS step failed".into()),
        }
    }

    /// Read decoded PCM audio from the output buffer.
    /// Writes into the provided buffer. Returns number of samples actually read.
    pub fn get_audio(&mut self, buf: &mut [f32]) -> Result<usize, String> {
        let result =
            unsafe { ffi::pocket_tts_rs_get_audio(self.engine, buf.as_mut_ptr(), buf.len() as i32) };
        if result < 0 {
            return Err("TTS get_audio failed".into());
        }
        Ok(result as usize)
    }

    /// Returns true if generation is complete.
    pub fn is_done(&self) -> bool {
        unsafe { ffi::pocket_tts_rs_is_done(self.engine) == 1 }
    }

    /// Reset the engine for a new utterance.
    pub fn reset(&mut self) -> Result<(), String> {
        let result = unsafe { ffi::pocket_tts_rs_reset(self.engine) };
        if result < 0 {
            return Err("TTS reset failed".into());
        }
        Ok(())
    }

    /// Frame size in samples (1920 = 80ms at 24kHz).
    pub fn frame_size() -> i32 {
        unsafe { ffi::pocket_tts_rs_frame_size() }
    }

    /// Sample rate in Hz (24000).
    pub fn sample_rate() -> i32 {
        unsafe { ffi::pocket_tts_rs_sample_rate() }
    }
}

impl Drop for TtsEngine {
    fn drop(&mut self) {
        if !self.engine.is_null() {
            unsafe { ffi::pocket_tts_rs_destroy(self.engine) };
            self.engine = std::ptr::null_mut();
        }
    }
}
