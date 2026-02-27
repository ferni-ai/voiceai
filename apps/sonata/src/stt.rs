//! Safe Rust wrapper around pocket-voice STT C FFI.

use std::ffi::{c_void, CString};

use crate::ffi;

/// Safe wrapper around the pocket-voice STT engine.
/// Manages the opaque engine pointer and provides safe Rust methods.
pub struct SttEngine {
    engine: *mut c_void,
}

// The engine is single-threaded (Metal GPU context), but safe to move between threads
// as long as only one thread uses it at a time. NAPI ensures this via &mut self.
unsafe impl Send for SttEngine {}

impl SttEngine {
    /// Create a new STT engine. Downloads model from HuggingFace on first call.
    pub fn create(
        hf_repo: &str,
        model_path: Option<&str>,
        enable_vad: bool,
    ) -> Result<Self, String> {
        let repo =
            CString::new(hf_repo).map_err(|e| format!("Invalid hf_repo string: {}", e))?;

        let model_path_c = model_path
            .map(|p| CString::new(p).map_err(|e| format!("Invalid model_path string: {}", e)))
            .transpose()?;

        let model_ptr = model_path_c
            .as_ref()
            .map(|c| c.as_ptr())
            .unwrap_or(std::ptr::null());

        let engine = unsafe { ffi::pocket_stt_create(repo.as_ptr(), model_ptr, enable_vad as i32) };

        if engine.is_null() {
            return Err("Failed to create STT engine (Metal GPU required)".into());
        }

        Ok(SttEngine { engine })
    }

    /// Process one frame of PCM audio (f32, 24kHz, mono).
    /// Returns the number of recognized words, or error.
    pub fn process_frame(&mut self, pcm: &[f32]) -> Result<i32, String> {
        let result = unsafe {
            ffi::pocket_stt_process_frame(self.engine, pcm.as_ptr(), pcm.len() as i32)
        };
        if result < 0 {
            return Err("STT process_frame failed".into());
        }
        Ok(result)
    }

    /// Flush remaining text after speech ends.
    /// Returns the number of words.
    pub fn flush(&mut self) -> Result<i32, String> {
        let result = unsafe { ffi::pocket_stt_flush(self.engine) };
        if result < 0 {
            return Err("STT flush failed".into());
        }
        Ok(result)
    }

    /// Get all recognized text from the last process_frame/flush call.
    pub fn get_all_text(&self) -> Result<String, String> {
        let mut buf = vec![0u8; 8192];
        let len = unsafe {
            ffi::pocket_stt_get_all_text(
                self.engine,
                buf.as_mut_ptr() as *mut i8,
                buf.len() as i32,
            )
        };
        if len < 0 {
            return Err("STT get_all_text failed".into());
        }
        let text = String::from_utf8_lossy(&buf[..len as usize]).to_string();
        Ok(text)
    }

    /// Get semantic VAD probability for a time horizon.
    /// Returns probability of NO voice activity (higher = more likely silent).
    pub fn get_vad_prob(&self, horizon: i32) -> f32 {
        unsafe { ffi::pocket_stt_get_vad_prob(self.engine, horizon) }
    }

    /// Whether VAD is enabled.
    pub fn has_vad(&self) -> bool {
        unsafe { ffi::pocket_stt_has_vad(self.engine) != 0 }
    }

    /// Reset streaming state for a new utterance.
    pub fn reset(&mut self) {
        unsafe { ffi::pocket_stt_reset(self.engine) };
    }

    /// Returns the model's audio delay in seconds.
    pub fn audio_delay(&self) -> f64 {
        unsafe { ffi::pocket_stt_audio_delay(self.engine) }
    }

    /// Frame size in samples (1920 = 80ms at 24kHz).
    pub fn frame_size() -> i32 {
        unsafe { ffi::pocket_stt_frame_size() }
    }

    /// Sample rate in Hz (24000).
    pub fn sample_rate() -> i32 {
        unsafe { ffi::pocket_stt_sample_rate() }
    }
}

impl Drop for SttEngine {
    fn drop(&mut self) {
        if !self.engine.is_null() {
            unsafe { ffi::pocket_stt_destroy(self.engine) };
            self.engine = std::ptr::null_mut();
        }
    }
}
