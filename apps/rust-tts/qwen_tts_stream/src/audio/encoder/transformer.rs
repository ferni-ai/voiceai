use candle_core::{Result, Tensor};
use candle_nn::{LayerNorm, Linear, Module, VarBuilder, layer_norm, linear_no_bias};

use crate::nn::rope::{apply_rotary_pos_emb_manual, simple::SimpleRotaryEmbedding};

/// Layer scale - learned per-channel scaling.
#[derive(Debug, Clone)]
struct LayerScale {
    scale: Tensor,
}

impl LayerScale {
    fn new(dim: usize, vb: VarBuilder) -> Result<Self> {
        let scale = vb.get(dim, "scale")?;
        Ok(Self { scale })
    }

    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        xs.broadcast_mul(&self.scale)
    }
}

/// Self-attention layer.
#[derive(Debug, Clone)]
struct SelfAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    num_heads: usize,
    head_dim: usize,
}

impl SelfAttention {
    fn new(dim: usize, num_heads: usize, vb: VarBuilder) -> Result<Self> {
        let head_dim = dim / num_heads;

        let q_proj = linear_no_bias(dim, dim, vb.pp("q_proj"))?;
        let k_proj = linear_no_bias(dim, dim, vb.pp("k_proj"))?;
        let v_proj = linear_no_bias(dim, dim, vb.pp("v_proj"))?;
        let o_proj = linear_no_bias(dim, dim, vb.pp("o_proj"))?;

        Ok(Self {
            q_proj,
            k_proj,
            v_proj,
            o_proj,
            num_heads,
            head_dim,
        })
    }

    fn forward(&self, xs: &Tensor, rope: &SimpleRotaryEmbedding) -> Result<Tensor> {
        let (b, t, _) = xs.dims3()?;

        let q = self.q_proj.forward(xs)?;
        let k = self.k_proj.forward(xs)?;
        let v = self.v_proj.forward(xs)?;

        // Reshape: [B, T, D] -> [B, num_heads, T, head_dim]
        let q = q
            .reshape((b, t, self.num_heads, self.head_dim))?
            .transpose(1, 2)?
            .contiguous()?;
        let k = k
            .reshape((b, t, self.num_heads, self.head_dim))?
            .transpose(1, 2)?
            .contiguous()?;
        let v = v
            .reshape((b, t, self.num_heads, self.head_dim))?
            .transpose(1, 2)?
            .contiguous()?;

        // Get cos/sin and apply rotary embeddings
        let (cos, sin) = rope.get(t, 0)?;
        // Shape: (seq_len, head_dim) -> (batch, seq_len, head_dim)
        let cos = cos.unsqueeze(0)?.broadcast_as((b, t, self.head_dim))?;
        let sin = sin.unsqueeze(0)?.broadcast_as((b, t, self.head_dim))?;
        let (q, k) = apply_rotary_pos_emb_manual(&q, &k, &cos, &sin)?;

        // Scaled dot-product attention
        // Make tensors contiguous for CUDA matmul
        let scale = (self.head_dim as f64).sqrt();
        let q = q.contiguous()?;
        let k_t = k.transpose(2, 3)?.contiguous()?;
        let attn = (q.matmul(&k_t)? / scale)?;

        // Causal mask
        let mask_data: Vec<f32> = (0..t)
            .flat_map(|i| (0..t).map(move |j| if j <= i { 0f32 } else { f32::NEG_INFINITY }))
            .collect();
        let mask = Tensor::new(mask_data.as_slice(), xs.device())?
            .reshape((1, 1, t, t))?
            .to_dtype(attn.dtype())?;

        let attn = attn.broadcast_add(&mask)?;
        let attn = candle_nn::ops::softmax_last_dim(&attn)?;

        // Make contiguous for matmul
        let attn = attn.contiguous()?;
        let v = v.contiguous()?;
        let out = attn.matmul(&v)?;

        // Reshape back: [B, num_heads, T, head_dim] -> [B, T, D]
        let out = out.transpose(1, 2)?.contiguous()?.reshape((b, t, ()))?;

        self.o_proj.forward(&out)
    }
}

/// MLP layer.
#[derive(Debug, Clone)]
struct Mlp {
    fc1: Linear,
    fc2: Linear,
}

impl Mlp {
    fn new(dim: usize, hidden_dim: usize, vb: VarBuilder) -> Result<Self> {
        let fc1 = linear_no_bias(dim, hidden_dim, vb.pp("fc1"))?;
        let fc2 = linear_no_bias(hidden_dim, dim, vb.pp("fc2"))?;
        Ok(Self { fc1, fc2 })
    }

    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let h = self.fc1.forward(xs)?;
        let h = h.gelu_erf()?;
        self.fc2.forward(&h)
    }
}

/// Transformer layer with pre-norm, attention, MLP, and layer scales.
#[derive(Debug, Clone)]
pub struct TransformerLayer {
    input_layernorm: LayerNorm,
    self_attn: SelfAttention,
    self_attn_layer_scale: LayerScale,
    post_attention_layernorm: LayerNorm,
    mlp: Mlp,
    mlp_layer_scale: LayerScale,
}

impl TransformerLayer {
    pub fn new(dim: usize, num_heads: usize, mlp_dim: usize, vb: VarBuilder) -> Result<Self> {
        let input_layernorm = layer_norm(
            dim,
            candle_nn::LayerNormConfig::default(),
            vb.pp("input_layernorm"),
        )?;
        let self_attn = SelfAttention::new(dim, num_heads, vb.pp("self_attn"))?;
        let self_attn_layer_scale = LayerScale::new(dim, vb.pp("self_attn_layer_scale"))?;
        let post_attention_layernorm = layer_norm(
            dim,
            candle_nn::LayerNormConfig::default(),
            vb.pp("post_attention_layernorm"),
        )?;
        let mlp = Mlp::new(dim, mlp_dim, vb.pp("mlp"))?;
        let mlp_layer_scale = LayerScale::new(dim, vb.pp("mlp_layer_scale"))?;

        Ok(Self {
            input_layernorm,
            self_attn,
            self_attn_layer_scale,
            post_attention_layernorm,
            mlp,
            mlp_layer_scale,
        })
    }

    pub fn forward(&self, xs: &Tensor, rope: &SimpleRotaryEmbedding) -> Result<Tensor> {
        // Pre-norm attention with layer scale
        let residual = xs;
        let h = self.input_layernorm.forward(xs)?;
        let h = self.self_attn.forward(&h, rope)?;
        let h = self.self_attn_layer_scale.forward(&h)?;
        let xs = (residual + h)?;

        // Pre-norm MLP with layer scale
        let residual = &xs;
        let h = self.post_attention_layernorm.forward(&xs)?;
        let h = self.mlp.forward(&h)?;
        let h = self.mlp_layer_scale.forward(&h)?;
        residual + h
    }
}
