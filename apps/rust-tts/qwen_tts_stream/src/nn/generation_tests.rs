#[cfg(test)]
mod batch_tests {
    use candle_core::{Device, Result, Tensor};

    use crate::nn::generation_utils::{
        broadcast_to_batch, create_attention_mask_from_lengths, create_position_ids_with_padding,
        left_pad_sequences,
    };

    #[test]
    fn test_broadcast_to_batch() {
        let temps = broadcast_to_batch(Some(0.9f64), 4, 1.0);
        assert_eq!(temps.len(), 4);
        assert_eq!(temps[0], 0.9);

        let none_temps: Vec<f64> = broadcast_to_batch(None, 3, 1.0);
        assert_eq!(none_temps, vec![1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_left_pad_sequences() -> Result<()> {
        let device = Device::Cpu;

        // Create sequences of different lengths
        let seq1 = Tensor::ones((3, 4), candle_core::DType::F32, &device)?;
        let seq2 = Tensor::ones((5, 4), candle_core::DType::F32, &device)?;
        let seq3 = Tensor::ones((2, 4), candle_core::DType::F32, &device)?;

        let (batched, lengths) = left_pad_sequences(&[seq1, seq2, seq3], 0.0)?;

        assert_eq!(batched.dims(), &[3, 5, 4]); // batch=3, max_len=5, hidden=4
        assert_eq!(lengths, vec![3, 5, 2]);

        // Check padding values in first sequence (should have 2 rows of zeros at start)
        let first_seq = batched.get(0)?;
        let first_row = first_seq.get(0)?;
        let first_val = first_row.get(0)?.to_scalar::<f32>()?;
        assert_eq!(first_val, 0.0); // Padding

        let third_row = first_seq.get(2)?;
        let third_val = third_row.get(0)?.to_scalar::<f32>()?;
        assert_eq!(third_val, 1.0); // Actual content

        Ok(())
    }

    #[test]
    fn test_attention_mask_from_lengths() -> Result<()> {
        let device = Device::Cpu;
        let dtype = candle_core::DType::F32;

        let lengths = vec![3, 5, 2];
        let max_len = 5;

        let mask = create_attention_mask_from_lengths(&lengths, max_len, dtype, &device)?;

        assert_eq!(mask.dims(), &[3, 1, 5, 5]);

        // Check mask for first sequence (length 3, so 2 padding positions at start)
        let mask0 = mask.get(0)?.get(0)?; // (5, 5)

        // Position 0,0 should be masked (padding)
        let val_0_0 = mask0.get(0)?.get(0)?.to_scalar::<f32>()?;
        assert!(val_0_0.is_infinite() && val_0_0 < 0.0);

        // Position 2,2 (first non-padding) should not be masked
        let val_2_2 = mask0.get(2)?.get(2)?.to_scalar::<f32>()?;
        assert_eq!(val_2_2, 0.0);

        Ok(())
    }

    #[test]
    fn test_position_ids_with_padding() -> Result<()> {
        let device = Device::Cpu;

        let lengths = vec![3, 5, 2];
        let max_len = 5;

        let pos_ids = create_position_ids_with_padding(&lengths, max_len, &device)?;

        assert_eq!(pos_ids.dims(), &[3, 5]);

        // First sequence: [0, 0, 0, 1, 2] (2 padding positions clamped to 0)
        let first_pos = pos_ids.get(0)?.to_vec1::<i64>()?;
        assert_eq!(first_pos, vec![0, 0, 0, 1, 2]);

        // Second sequence: [0, 1, 2, 3, 4] (no padding)
        let second_pos = pos_ids.get(1)?.to_vec1::<i64>()?;
        assert_eq!(second_pos, vec![0, 1, 2, 3, 4]);

        // Third sequence: [0, 0, 0, 0, 1] (3 padding positions clamped to 0)
        let third_pos = pos_ids.get(2)?.to_vec1::<i64>()?;
        assert_eq!(third_pos, vec![0, 0, 0, 0, 1]);

        Ok(())
    }
}
