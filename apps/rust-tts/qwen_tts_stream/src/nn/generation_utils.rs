use candle_core::{Device, Result, Tensor};

// ============================================================================
// Variable-length batch processing utilities
// ============================================================================

/// Left-pad sequences to the maximum length in the batch.
///
/// For autoregressive generation with batched variable-length inputs,
/// left-padding is preferred over right-padding as it ensures the
/// most recent tokens are aligned across samples.
///
/// # Arguments
/// * `sequences` - List of tensors, each of shape (seq_len, hidden_size)
/// * `pad_value` - Value to use for padding
///
/// # Returns
/// * Batched tensor of shape (batch, max_len, hidden_size)
/// * Lengths tensor of shape (batch,) containing original lengths
pub fn left_pad_sequences(sequences: &[Tensor], pad_value: f64) -> Result<(Tensor, Vec<usize>)> {
    if sequences.is_empty() {
        return Err(candle_core::Error::Msg("Empty sequence list".to_string()));
    }

    // Get dimensions and find max length
    let hidden_size = sequences[0].dim(1)?;
    let device = sequences[0].device();
    let dtype = sequences[0].dtype();
    let lengths: Vec<usize> = sequences.iter().map(|s| s.dim(0).unwrap_or(0)).collect();
    let max_len = *lengths.iter().max().unwrap_or(&0);

    // Create padded sequences
    let mut padded = Vec::with_capacity(sequences.len());
    for (seq, &len) in sequences.iter().zip(&lengths) {
        let pad_len = max_len - len;
        if pad_len > 0 {
            let padding =
                Tensor::full(pad_value, (pad_len, hidden_size), device)?.to_dtype(dtype)?;
            let padded_seq = Tensor::cat(&[&padding, seq], 0)?;
            padded.push(padded_seq);
        } else {
            padded.push(seq.clone());
        }
    }

    let batched = Tensor::stack(&padded.iter().collect::<Vec<_>>(), 0)?;
    Ok((batched, lengths))
}

/// Create an attention mask from sequence lengths.
///
/// Creates a causal mask that also masks out left-padding tokens.
/// The mask uses 0 for positions to attend to and -inf for positions to ignore.
///
/// # Arguments
/// * `lengths` - Original sequence lengths for each batch item
/// * `max_len` - Maximum sequence length (padded length)
/// * `dtype` - Data type for the mask
/// * `device` - Device to create the mask on
///
/// # Returns
/// * Attention mask of shape (batch, 1, max_len, max_len)
pub fn create_attention_mask_from_lengths(
    lengths: &[usize],
    max_len: usize,
    dtype: candle_core::DType,
    device: &Device,
) -> Result<Tensor> {
    let batch_size = lengths.len();

    // Create position indices
    let positions = Tensor::arange(0i64, max_len as i64, device)?;

    // Create masks for each batch item
    let mut batch_masks = Vec::with_capacity(batch_size);

    for &len in lengths {
        let pad_len = max_len - len;

        // Create causal mask (lower triangular): row >= col
        // positions is (max_len,), we need (max_len, max_len)
        let row_positions = positions.unsqueeze(1)?; // (max_len, 1)
        let col_positions = positions.unsqueeze(0)?; // (1, max_len)
        let causal_diff = row_positions.broadcast_sub(&col_positions)?; // (max_len, max_len)
        // causal_mask[i,j] = true if i >= j (can attend to previous positions)
        let zero_tensor = Tensor::zeros((max_len, max_len), candle_core::DType::I64, device)?;
        let causal_mask = causal_diff.ge(&zero_tensor)?;

        // Create padding mask: only attend to positions >= pad_len
        // padding_mask[i] = true if position i is not padding
        let position_valid: Vec<u8> = (0..max_len)
            .map(|i| if i >= pad_len { 1 } else { 0 })
            .collect();
        let padding_mask = Tensor::from_vec(position_valid, max_len, device)?;

        // Expand to 2D: both query and key must be in valid positions
        let padding_mask_f = padding_mask.to_dtype(candle_core::DType::F32)?;
        let padding_mask_row = padding_mask_f.unsqueeze(1)?; // (max_len, 1)
        let padding_mask_col = padding_mask_f.unsqueeze(0)?; // (1, max_len)
        let padding_mask_2d = padding_mask_row.broadcast_mul(&padding_mask_col)?; // (max_len, max_len)

        // Combined mask: causal AND not-padding (multiply for AND)
        let causal_mask_f = causal_mask.to_dtype(candle_core::DType::F32)?;
        let combined = causal_mask_f.mul(&padding_mask_2d)?;

        // Convert to float: 0 for attend, -inf for ignore
        let half =
            Tensor::full(0.5f64, (max_len, max_len), device)?.to_dtype(candle_core::DType::F32)?;
        let combined_bool = combined.gt(&half)?;
        let neg_inf =
            Tensor::full(f64::NEG_INFINITY, (max_len, max_len), device)?.to_dtype(candle_core::DType::F32)?;
        let zero = Tensor::zeros((max_len, max_len), candle_core::DType::F32, device)?;
        let final_mask = combined_bool.where_cond(&zero, &neg_inf)?.to_dtype(dtype)?;

        batch_masks.push(final_mask.unsqueeze(0)?);
    }

    // Stack to (batch, 1, max_len, max_len)
    let batched = Tensor::cat(&batch_masks.iter().collect::<Vec<_>>(), 0)?;
    batched.unsqueeze(1)
}

/// Create position IDs accounting for left-padding.
///
/// # Arguments
/// * `lengths` - Original sequence lengths for each batch item
/// * `max_len` - Maximum sequence length (padded length)
/// * `device` - Device to create positions on
///
/// # Returns
/// * Position IDs of shape (batch, max_len)
pub fn create_position_ids_with_padding(
    lengths: &[usize],
    max_len: usize,
    device: &Device,
) -> Result<Tensor> {
    let batch_size = lengths.len();
    let mut positions_batch = Vec::with_capacity(batch_size);

    for &len in lengths {
        let pad_len = max_len - len;
        // Padding positions start at 0, then continue from there
        let positions = Tensor::arange(0i64, max_len as i64, device)?;
        // Shift positions so padding is at negative indices (clamped to 0)
        // and actual content starts at 0
        let shifted = positions.affine(1.0, -(pad_len as f64))?;
        let zero = Tensor::zeros((max_len,), candle_core::DType::I64, device)?;
        let clamped = shifted.maximum(&zero)?;
        positions_batch.push(clamped);
    }

    Tensor::stack(&positions_batch.iter().collect::<Vec<_>>(), 0)
}

/// Broadcast a scalar parameter to a list.
///
/// Utility for expanding single values to match batch size.
///
/// # Example
/// ```ignore
/// let temps = broadcast_to_batch(Some(0.9), 4);
/// assert_eq!(temps, vec![0.9, 0.9, 0.9, 0.9]);
/// ```
#[cfg(test)]
pub fn broadcast_to_batch<T: Clone>(value: Option<T>, batch_size: usize, default: T) -> Vec<T> {
    match value {
        Some(v) => vec![v; batch_size],
        None => vec![default; batch_size],
    }
}
