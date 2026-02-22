//! GPU Co-Location Scheduler
//!
//! Manages GPU resource sharing between STT (Parakeet ONNX) and TTS (Higgs Candle).
//! When GPU_COLOCATE=true, both models share the same GPU and memory pool.

use anyhow::Result;
use candle_core::Device;
use tracing::{info, warn};

/// GPU scheduling configuration.
#[derive(Debug, Clone)]
pub struct GpuConfig {
    /// Whether STT and TTS should share the same GPU.
    pub colocate: bool,
    /// Preferred GPU device index.
    pub device_index: usize,
    /// Maximum GPU memory fraction for TTS (0.0-1.0).
    pub tts_memory_fraction: f32,
    /// Maximum GPU memory fraction for STT (0.0-1.0).
    pub stt_memory_fraction: f32,
}

impl Default for GpuConfig {
    fn default() -> Self {
        Self {
            colocate: std::env::var("GPU_COLOCATE")
                .map(|v| v == "true")
                .unwrap_or(false),
            device_index: std::env::var("GPU_DEVICE_INDEX")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
            tts_memory_fraction: 0.6,
            stt_memory_fraction: 0.3,
        }
    }
}

/// Manages GPU device allocation for pipeline components.
pub struct GpuScheduler {
    config: GpuConfig,
    tts_device: Device,
    stt_device: Device,
}

impl GpuScheduler {
    /// Create a new GPU scheduler with the given configuration.
    pub fn new(config: GpuConfig) -> Result<Self> {
        let (tts_device, stt_device) = if config.colocate {
            info!(
                device = config.device_index,
                "GPU co-location enabled: STT + TTS on same device"
            );
            let device = Self::get_device(config.device_index)?;
            (device.clone(), device)
        } else {
            info!("GPU co-location disabled: using CPU fallback for separate scheduling");
            let tts_device = Self::get_device(config.device_index)?;
            let stt_device = Device::Cpu;
            (tts_device, stt_device)
        };

        Ok(Self {
            config,
            tts_device,
            stt_device,
        })
    }

    /// Get the device for TTS model inference.
    pub fn tts_device(&self) -> &Device {
        &self.tts_device
    }

    /// Get the device for STT model inference.
    pub fn stt_device(&self) -> &Device {
        &self.stt_device
    }

    /// Whether GPU co-location is active.
    pub fn is_colocated(&self) -> bool {
        self.config.colocate
    }

    /// Get the best available GPU device, falling back to CPU.
    fn get_device(index: usize) -> Result<Device> {
        #[cfg(target_os = "macos")]
        {
            match Device::new_metal(index) {
                Ok(device) => {
                    info!("Using Metal device for GPU acceleration");
                    Ok(device)
                }
                Err(e) => {
                    warn!(error = %e, "Failed to get Metal device, using CPU");
                    Ok(Device::Cpu)
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            match Device::cuda_if_available(index) {
                Ok(device) => {
                    info!(index, device = ?device, "Device selected for pipeline");
                    Ok(device)
                }
                Err(e) => {
                    warn!(error = %e, "Failed to get CUDA device, using CPU");
                    Ok(Device::Cpu)
                }
            }
        }
    }

    /// Get ONNX execution provider string for STT.
    pub fn stt_onnx_provider(&self) -> &'static str {
        if self.config.colocate {
            "CUDAExecutionProvider"
        } else {
            "CPUExecutionProvider"
        }
    }
}
