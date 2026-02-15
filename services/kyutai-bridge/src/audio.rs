//! Audio processing utilities: resampling, PCM conversion, normalization.

/// Resample 16 kHz float32 PCM to 24 kHz (ratio 3/2) using linear interpolation.
/// Same algorithm as the Python bridge.
pub fn resample_16k_to_24k(pcm_16k: &[f32]) -> Vec<f32> {
    let n_16 = pcm_16k.len();
    if n_16 == 0 {
        return vec![];
    }
    let n_24 = (n_16 as f64 * 24.0 / 16.0) as usize;
    let mut out = Vec::with_capacity(n_24);
    for i in 0..n_24 {
        let x = i as f64 * (n_16 - 1) as f64 / (n_24 - 1).max(1) as f64;
        let x0 = x.floor() as usize;
        let x1 = (x0 + 1).min(n_16 - 1);
        let frac = (x - x0 as f64) as f32;
        out.push(pcm_16k[x0] * (1.0 - frac) + pcm_16k[x1] * frac);
    }
    out
}

/// Convert Int16 PCM bytes (little-endian) to float32 in [-1, 1].
pub fn i16_bytes_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / 32768.0
        })
        .collect()
}

/// Convert float32 PCM in [-1, 1] to Int16 bytes (little-endian).
pub fn f32_to_i16_bytes(pcm: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(pcm.len() * 2);
    for &sample in pcm {
        let clamped = sample.clamp(-1.0, 1.0);
        let i16_val = (clamped * 32767.0) as i16;
        out.extend_from_slice(&i16_val.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resample_16k_to_24k_basic() {
        let input: Vec<f32> = (0..1600).map(|i| (i as f32 / 1600.0).sin()).collect();
        let output = resample_16k_to_24k(&input);
        assert_eq!(output.len(), 2400);
        // First and last should match (approximately)
        assert!((output[0] - input[0]).abs() < 0.001);
    }

    #[test]
    fn test_resample_empty() {
        let output = resample_16k_to_24k(&[]);
        assert!(output.is_empty());
    }

    #[test]
    fn test_i16_f32_round_trip() {
        let original = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
        let bytes = f32_to_i16_bytes(&original);
        let recovered = i16_bytes_to_f32(&bytes);
        for (orig, rec) in original.iter().zip(recovered.iter()) {
            assert!((orig - rec).abs() < 0.001, "orig={orig}, rec={rec}");
        }
    }

    #[test]
    fn test_i16_bytes_to_f32_silence() {
        let silence = vec![0u8; 640]; // 320 samples
        let pcm = i16_bytes_to_f32(&silence);
        assert_eq!(pcm.len(), 320);
        assert!(pcm.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn test_f32_to_i16_clamping() {
        let input = vec![2.0f32, -2.0, 0.0]; // Values beyond [-1, 1]
        let bytes = f32_to_i16_bytes(&input);
        let recovered = i16_bytes_to_f32(&bytes);
        // Should be clamped to ±1.0
        assert!(recovered[0] > 0.99);
        assert!(recovered[1] < -0.99);
        assert_eq!(recovered[2], 0.0);
    }

    #[test]
    fn test_resample_ratio() {
        // Verify the 3/2 ratio is maintained for various input sizes
        for size in [160, 320, 640, 1280, 3200] {
            let input = vec![0.0f32; size];
            let output = resample_16k_to_24k(&input);
            let expected = (size as f64 * 24.0 / 16.0) as usize;
            assert_eq!(
                output.len(),
                expected,
                "size={size}: expected {expected}, got {}",
                output.len()
            );
        }
    }
}
