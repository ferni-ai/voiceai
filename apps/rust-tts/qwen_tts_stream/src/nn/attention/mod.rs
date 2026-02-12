//! Attention mechanism implementations.
//!
//! Qwen3-TTS uses two attention variants:
//! 1. Standard attention with per-head RMSNorm (for code predictor)
//! 2. Multimodal attention with 3D RoPE (for talker)
//!
//! Both are built on `UnifiedAttention` which uses `RopeStrategy` to handle
//! the RoPE application differences.

use candle_core::{DType, Result, Tensor};

#[cfg(feature = "timing")]
use crate::nn::timing::{
    ATTENTION_CALLS, ATTENTION_MATMUL_TIME_US, ATTENTION_OTHER_TIME_US, ATTENTION_SOFTMAX_TIME_US,
    ATTENTION_TIME_US,
};

pub mod config;
pub mod rope_strategy;
pub mod standard;
pub mod talker;
pub mod unified;

use crate::nn::attention::standard::Attention;
use crate::nn::attention::talker::TalkerAttention;
use crate::nn::kv_cache::KVCache;

/// Trait for attention layers used in decoder layers.
///
/// This trait abstracts over `Attention` and `TalkerAttention` to enable
/// generic decoder layer implementations.
pub trait AttentionLayer {
    /// Get the layer index.
    fn layer_idx(&self) -> usize;

    /// Forward pass with position embeddings.
    fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor>;

    /// Forward pass with KV-cache.
    fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor>;
}

impl AttentionLayer for Attention {
    fn layer_idx(&self) -> usize {
        self.layer_idx()
    }

    fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        Attention::forward(self, hidden_states, position_embeddings, attention_mask)
    }

    fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        Attention::forward_with_cache(
            self,
            hidden_states,
            position_embeddings,
            attention_mask,
            cache,
        )
    }
}

impl AttentionLayer for TalkerAttention {
    fn layer_idx(&self) -> usize {
        self.layer_idx()
    }

    fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        TalkerAttention::forward(self, hidden_states, position_embeddings, attention_mask)
    }

    fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        TalkerAttention::forward_with_cache(
            self,
            hidden_states,
            position_embeddings,
            attention_mask,
            cache,
        )
    }
}

// Flash attention wrapper functions
#[cfg(feature = "flash-attn")]
fn flash_attn(
    q: &Tensor,
    k: &Tensor,
    v: &Tensor,
    softmax_scale: f32,
    causal: bool,
) -> Result<Tensor> {
    candle_flash_attn::flash_attn(q, k, v, softmax_scale, causal)
}

#[cfg(not(feature = "flash-attn"))]
fn flash_attn(_: &Tensor, _: &Tensor, _: &Tensor, _: f32, _: bool) -> Result<Tensor> {
    candle_core::bail!("compile with '--features flash-attn'")
}

#[cfg(feature = "flash-attn")]
fn flash_attn_windowed(
    q: &Tensor,
    k: &Tensor,
    v: &Tensor,
    softmax_scale: f32,
    window_size_left: Option<usize>,
    window_size_right: Option<usize>,
) -> Result<Tensor> {
    candle_flash_attn::flash_attn_windowed(
        q,
        k,
        v,
        softmax_scale,
        window_size_left,
        window_size_right,
    )
}

#[cfg(not(feature = "flash-attn"))]
fn flash_attn_windowed(
    _: &Tensor,
    _: &Tensor,
    _: &Tensor,
    _: f32,
    _: Option<usize>,
    _: Option<usize>,
) -> Result<Tensor> {
    candle_core::bail!("compile with '--features flash-attn'")
}

/// Repeat key-value heads for grouped-query attention.
///
/// Expands (batch, num_kv_heads, seq_len, head_dim) to
/// (batch, num_attention_heads, seq_len, head_dim)
pub fn repeat_kv(hidden_states: &Tensor, n_rep: usize) -> Result<Tensor> {
    if n_rep == 1 {
        return hidden_states.contiguous();
    }

    let (batch, num_kv_heads, seq_len, head_dim) = hidden_states.dims4()?;

    // (batch, num_kv_heads, seq_len, head_dim) ->
    // (batch, num_kv_heads, 1, seq_len, head_dim) ->
    // (batch, num_kv_heads, n_rep, seq_len, head_dim) ->
    // (batch, num_kv_heads * n_rep, seq_len, head_dim)
    hidden_states
        .unsqueeze(2)?
        .expand((batch, num_kv_heads, n_rep, seq_len, head_dim))?
        .reshape((batch, num_kv_heads * n_rep, seq_len, head_dim))?
        .contiguous()
}

/// Create a causal mask that prevents attending to future positions.
///
/// For a query at position i, it can only attend to keys at positions [0, i].
/// Positions i+1, i+2, ... get -inf.
///
/// Args:
///   q_len: Query sequence length
///   kv_len: Key/value sequence length
///   dtype: Output dtype
///   device: Device for tensor creation
///
/// Returns:
///   Mask tensor of shape (1, 1, q_len, kv_len) with 0 for valid positions and -inf for masked
pub fn create_causal_mask(
    q_len: usize,
    kv_len: usize,
    dtype: DType,
    device: &candle_core::Device,
) -> Result<Tensor> {
    let neg_inf = f32::NEG_INFINITY;
    let mut mask_data = vec![0.0f32; q_len * kv_len];

    for q_pos in 0..q_len {
        // For cached generation, q_pos in the query corresponds to
        // position (kv_len - q_len + q_pos) in the full sequence
        let full_q_pos = kv_len - q_len + q_pos;

        for kv_pos in 0..kv_len {
            // Can only attend to current and past positions (causal)
            if kv_pos > full_q_pos {
                mask_data[q_pos * kv_len + kv_pos] = neg_inf;
            }
        }
    }

    Tensor::from_vec(mask_data, (1, 1, q_len, kv_len), device)?.to_dtype(dtype)
}

/// Create a sliding window mask that limits attention to a local window.
///
/// For a query at position i, it can only attend to keys at positions
/// [max(0, i - window_size + 1), i]. Positions outside this window get -inf.
///
/// Args:
///   q_len: Query sequence length
///   kv_len: Key/value sequence length
///   sliding_window: Size of the sliding window
///   dtype: Output dtype
///   device: Device for tensor creation
///
/// Returns:
///   Mask tensor of shape (1, 1, q_len, kv_len) with 0 for valid positions and -inf for masked
pub fn create_sliding_window_mask(
    q_len: usize,
    kv_len: usize,
    sliding_window: usize,
    dtype: DType,
    device: &candle_core::Device,
) -> Result<Tensor> {
    let neg_inf = f32::NEG_INFINITY;
    let mut mask_data = vec![0.0f32; q_len * kv_len];

    for q_pos in 0..q_len {
        // For cached generation, q_pos in the query corresponds to
        // position (kv_len - q_len + q_pos) in the full sequence
        let full_q_pos = kv_len - q_len + q_pos;

        for kv_pos in 0..kv_len {
            // Can only attend to positions within sliding_window distance
            // and not to future positions (causal)
            let distance = full_q_pos as i64 - kv_pos as i64;
            let in_window = distance >= 0 && distance < sliding_window as i64;

            if !in_window {
                mask_data[q_pos * kv_len + kv_pos] = neg_inf;
            }
        }
    }

    Tensor::from_vec(mask_data, (1, 1, q_len, kv_len), device)?.to_dtype(dtype)
}

/// Flash attention forward pass.
///
/// Uses flash-attn kernel when available. Flash attention:
/// - Expects (batch, seq_len, heads, head_dim) format
/// - Only supports F16/BF16
/// - Handles GQA natively
/// - Supports sliding window via window_size_left parameter
///
/// For causal attention without sliding window:
/// - window_size_left = None, window_size_right = Some(0)
///
/// For sliding window causal attention with window W:
/// - window_size_left = Some(W - 1), window_size_right = Some(0)
pub fn flash_attention_forward(
    query: &Tensor,
    key: &Tensor,
    value: &Tensor,
    scaling: f64,
    sliding_window: Option<usize>,
) -> Result<Tensor> {
    #[cfg(feature = "timing")]
    let total_start = std::time::Instant::now();
    #[cfg(feature = "timing")]
    {
        use std::sync::atomic::Ordering;
        static LOGGED_FLASH: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);
        if !LOGGED_FLASH.swap(true, Ordering::Relaxed) {
            eprintln!(">>> Using FLASH ATTENTION <<<");
        }
    }
    #[cfg(feature = "timing")]
    ATTENTION_CALLS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Flash attention expects (batch, seq_len, heads, head_dim)
    // Our input is (batch, heads, seq_len, head_dim), so transpose
    let q = query.transpose(1, 2)?.contiguous()?;
    let k = key.transpose(1, 2)?.contiguous()?;
    let v = value.transpose(1, 2)?.contiguous()?;

    let softmax_scale = scaling as f32;

    let attn_output = if let Some(window_size) = sliding_window {
        // Sliding window: can attend to (window_size - 1) tokens to the left
        // and 0 tokens to the right (causal)
        flash_attn_windowed(&q, &k, &v, softmax_scale, Some(window_size - 1), Some(0))?
    } else {
        // Standard causal attention
        flash_attn(&q, &k, &v, softmax_scale, true)?
    };

    // Transpose back to (batch, heads, seq_len, head_dim) then to (batch, seq_len, heads, head_dim)
    // Actually flash_attn returns (batch, seq_len, heads, head_dim) which is what we need
    // for the reshape, so just return it
    let result = attn_output;

    #[cfg(feature = "timing")]
    ATTENTION_TIME_US.fetch_add(
        total_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    Ok(result)
}

/// Eager (non-flash) attention forward pass.
///
/// Optionally supports sliding window attention when `sliding_window` is Some.
pub fn eager_attention_forward(
    query: &Tensor,
    key: &Tensor,
    value: &Tensor,
    attention_mask: Option<&Tensor>,
    num_kv_groups: usize,
    scaling: f64,
) -> Result<Tensor> {
    eager_attention_forward_with_sliding_window(
        query,
        key,
        value,
        attention_mask,
        num_kv_groups,
        scaling,
        None,
    )
}

/// Eager attention with optional sliding window support.
///
/// Optimized to stay in native dtype (BF16) throughout - modern GPUs
/// handle BF16 matmul efficiently via tensor cores.
pub fn eager_attention_forward_with_sliding_window(
    query: &Tensor,
    key: &Tensor,
    value: &Tensor,
    attention_mask: Option<&Tensor>,
    num_kv_groups: usize,
    scaling: f64,
    sliding_window: Option<usize>,
) -> Result<Tensor> {
    #[cfg(feature = "timing")]
    let total_start = std::time::Instant::now();
    #[cfg(feature = "timing")]
    {
        use std::sync::atomic::Ordering;
        static LOGGED_EAGER: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);
        if !LOGGED_EAGER.swap(true, Ordering::Relaxed) {
            eprintln!(">>> Using EAGER ATTENTION <<<");
        }
    }
    #[cfg(feature = "timing")]
    ATTENTION_CALLS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let dtype = query.dtype();

    // Time repeat_kv
    #[cfg(feature = "timing")]
    let other_start = std::time::Instant::now();

    // Repeat KV heads
    let key_states = repeat_kv(key, num_kv_groups)?;
    let value_states = repeat_kv(value, num_kv_groups)?;

    #[cfg(feature = "timing")]
    ATTENTION_OTHER_TIME_US.fetch_add(
        other_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    // Time matmul - stay in native dtype (BF16)
    #[cfg(feature = "timing")]
    let matmul_start = std::time::Instant::now();

    let attn_weights = query
        .matmul(&key_states.transpose(2, 3)?)?
        .affine(scaling, 0.0)?;

    #[cfg(feature = "timing")]
    ATTENTION_MATMUL_TIME_US.fetch_add(
        matmul_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    // Apply causal mask (mask should already be in correct dtype)
    let attn_weights = if let Some(mask) = attention_mask {
        attn_weights.broadcast_add(mask)?
    } else {
        attn_weights
    };

    // Apply sliding window mask if specified
    let attn_weights = if let Some(window_size) = sliding_window {
        let (_, _, q_len, kv_len) = attn_weights.dims4()?;
        let sliding_mask =
            create_sliding_window_mask(q_len, kv_len, window_size, dtype, attn_weights.device())?;
        attn_weights.broadcast_add(&sliding_mask)?
    } else {
        attn_weights
    };

    // Time softmax - stay in native dtype
    #[cfg(feature = "timing")]
    let softmax_start = std::time::Instant::now();

    let attn_weights = candle_nn::ops::softmax_last_dim(&attn_weights)?;

    #[cfg(feature = "timing")]
    ATTENTION_SOFTMAX_TIME_US.fetch_add(
        softmax_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    // Final matmul - stay in native dtype
    #[cfg(feature = "timing")]
    let matmul_start = std::time::Instant::now();

    let attn_output = attn_weights.matmul(&value_states)?;

    #[cfg(feature = "timing")]
    ATTENTION_MATMUL_TIME_US.fetch_add(
        matmul_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    // Time transpose and contiguous
    #[cfg(feature = "timing")]
    let other_start = std::time::Instant::now();

    let result = attn_output.transpose(1, 2)?.contiguous()?;

    #[cfg(feature = "timing")]
    ATTENTION_OTHER_TIME_US.fetch_add(
        other_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    #[cfg(feature = "timing")]
    ATTENTION_TIME_US.fetch_add(
        total_start.elapsed().as_micros() as u64,
        std::sync::atomic::Ordering::Relaxed,
    );

    Ok(result)
}
