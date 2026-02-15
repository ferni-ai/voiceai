//! Shared MoE building blocks for Qwen3-Omni Thinker and Talker.
//!
//! Provides RMSNorm, QK norm, KV cache, SwitchLinear, SwitchGLU, and helper
//! functions (softmax, sigmoid, SiLU, RoPE apply, repeat_kv) used by both
//! decoder stacks. All types are parameterized by dimensions only.

use candle_core::{DType, Result as CandleResult, Tensor, D};
use candle_nn::VarBuilder;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Softmax along last dimension (Metal-compatible).
pub fn softmax_manual(x: &Tensor) -> CandleResult<Tensor> {
    let max_x = x.max_keepdim(D::Minus1)?;
    let exp_x = (x.broadcast_sub(&max_x))?.exp()?;
    let sum_exp = exp_x.sum_keepdim(D::Minus1)?;
    exp_x.broadcast_div(&sum_exp)
}

/// Sigmoid (Metal-compatible).
pub fn sigmoid_manual(x: &Tensor) -> CandleResult<Tensor> {
    let neg_x = x.neg()?;
    let exp_neg_x = neg_x.exp()?;
    let one = Tensor::ones_like(&exp_neg_x)?;
    let denom = (one.clone() + exp_neg_x)?;
    one.broadcast_div(&denom)
}

/// SiLU (Swish) activation: x * sigmoid(x).
pub fn silu_manual(x: &Tensor) -> CandleResult<Tensor> {
    let sigmoid_x = sigmoid_manual(x)?;
    x.mul(&sigmoid_x)
}

/// Repeat KV heads for GQA: (b, h_kv, l, d) -> (b, h_kv * n_rep, l, d).
pub fn repeat_kv(x: Tensor, n_rep: usize) -> CandleResult<Tensor> {
    if n_rep == 1 {
        return Ok(x);
    }
    let (b, h, l, d) = x.dims4()?;
    let x = x.unsqueeze(2)?;
    let x = x.expand((b, h, n_rep, l, d))?;
    x.reshape((b, h * n_rep, l, d))
}

/// Apply rotary positional embeddings to Q or K.
pub fn apply_rotary_emb(x: &Tensor, cos: &Tensor, sin: &Tensor) -> CandleResult<Tensor> {
    let (b, h, l, d) = x.dims4()?;
    let cos = cos.unsqueeze(0)?.unsqueeze(0)?;
    let sin = sin.unsqueeze(0)?.unsqueeze(0)?;
    let x1 = x.narrow(D::Minus1, 0, d / 2)?;
    let x2 = x.narrow(D::Minus1, d / 2, d / 2)?;
    let cos = cos.broadcast_as((b, h, l, d / 2))?;
    let sin = sin.broadcast_as((b, h, l, d / 2))?;
    let rotated = Tensor::cat(
        &[
            (&x1.broadcast_mul(&cos)? - &x2.broadcast_mul(&sin)?)?,
            (&x1.broadcast_mul(&sin)? + &x2.broadcast_mul(&cos)?)?,
        ],
        D::Minus1,
    )?;
    Ok(rotated)
}

// ============================================================================
// RMSNorm
// ============================================================================

/// RMS normalization: scale by learned weight after normalizing by RMS.
pub struct RmsNorm {
    weight: Tensor,
    eps: f64,
}

impl RmsNorm {
    /// Load weight of shape (size,) and eps.
    pub fn load(vb: VarBuilder, size: usize, eps: f64) -> CandleResult<Self> {
        let weight = vb.get(size, "weight")?;
        Ok(Self { weight, eps })
    }

    /// Forward: normalize along last dim, scale by weight.
    pub fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let dtype = x.dtype();
        let x = x.to_dtype(DType::F32)?;
        let variance = x.sqr()?.mean_keepdim(D::Minus1)?;
        let x_normed = x.broadcast_div(&(variance + self.eps)?.sqrt()?)?;
        x_normed.to_dtype(dtype)?.broadcast_mul(&self.weight)
    }
}

// ============================================================================
// QK Norm (Q and K head normalization for attention)
// ============================================================================

/// QK normalization: separate RMSNorm for query and key heads.
pub struct QKNorm {
    pub q_norm: RmsNorm,
    pub k_norm: RmsNorm,
}

impl QKNorm {
    /// Load q_norm and k_norm (each head_dim, eps).
    pub fn load(vb: VarBuilder, head_dim: usize, eps: f64) -> CandleResult<Self> {
        let q_norm = RmsNorm::load(vb.pp("q_norm"), head_dim, eps)?;
        let k_norm = RmsNorm::load(vb.pp("k_norm"), head_dim, eps)?;
        Ok(Self { q_norm, k_norm })
    }
}

// ============================================================================
// KV Cache
// ============================================================================

/// KV cache for one layer: keys and values tensors, and current length offset.
pub struct KvCache {
    pub k: Option<Tensor>,
    pub v: Option<Tensor>,
    pub offset: usize,
}

impl KvCache {
    pub fn new() -> Self {
        Self {
            k: None,
            v: None,
            offset: 0,
        }
    }

    pub fn update(&mut self, k: Tensor, v: Tensor) -> CandleResult<(Tensor, Tensor)> {
        let (k_out, v_out) = match (self.k.take(), self.v.take()) {
            (None, None) => (k, v),
            (Some(prev_k), Some(prev_v)) => {
                let k_out = Tensor::cat(&[prev_k, k], 2)?;
                let v_out = Tensor::cat(&[prev_v, v], 2)?;
                (k_out, v_out)
            }
            _ => unreachable!(),
        };
        self.offset = k_out.dim(2)?;
        self.k = Some(k_out.clone());
        self.v = Some(v_out.clone());
        Ok((k_out, v_out))
    }
}

// ============================================================================
// SwitchLinear (per-expert weight selection)
// ============================================================================

/// Per-expert linear: weight (num_experts, out, in). Forward: x (N, in), indices (N,) -> out (N, out).
pub struct SwitchLinear {
    weight: Tensor, // (num_experts, output_dims, input_dims)
}

impl SwitchLinear {
    /// Load weight of shape (num_experts, output_dims, input_dims).
    pub fn load(
        vb: VarBuilder,
        input_dims: usize,
        output_dims: usize,
        num_experts: usize,
    ) -> CandleResult<Self> {
        let w = vb.get((num_experts, output_dims, input_dims), "weight")?;
        Ok(Self { weight: w })
    }

    /// Build from stacked weight tensor (num_experts, output_dims, input_dims). Used when loading from HF experts.* layout.
    pub fn from_weight(weight: Tensor) -> CandleResult<Self> {
        Ok(Self { weight })
    }

    /// Forward: indices (N,) u32 or i64; x (N, in) -> out (N, out).
    pub fn forward(&self, x: &Tensor, indices: &Tensor) -> CandleResult<Tensor> {
        let ids = indices.to_dtype(DType::U32)?;
        let w = self.weight.index_select(&ids, 0)?; // (N, O, I)
        let w_t = w.transpose(1, 2)?; // (N, I, O)
        x.unsqueeze(1)?.matmul(&w_t)?.squeeze(1)
    }
}

// ============================================================================
// SwitchGLU (SiLU-gated expert MLP)
// ============================================================================

/// SiLU-gated expert MLP: gate_proj + up_proj + down_proj per expert.
pub struct SwitchGLU {
    gate_proj: SwitchLinear,
    up_proj: SwitchLinear,
    down_proj: SwitchLinear,
}

impl SwitchGLU {
    /// Load gate_proj (hidden -> intermediate), up_proj (hidden -> intermediate), down_proj (intermediate -> hidden).
    pub fn load(
        vb: VarBuilder,
        hidden: usize,
        intermediate: usize,
        num_experts: usize,
    ) -> CandleResult<Self> {
        let gate_proj = SwitchLinear::load(vb.pp("gate_proj"), hidden, intermediate, num_experts)?;
        let up_proj = SwitchLinear::load(vb.pp("up_proj"), hidden, intermediate, num_experts)?;
        let down_proj =
            SwitchLinear::load(vb.pp("down_proj"), intermediate, hidden, num_experts)?;
        Ok(Self {
            gate_proj,
            up_proj,
            down_proj,
        })
    }

    /// Load from HF layout: mlp.experts.0.gate_proj.weight, mlp.experts.1.gate_proj.weight, ... (one tensor per expert, then stack).
    pub fn load_from_experts(
        vb: VarBuilder,
        hidden: usize,
        intermediate: usize,
        num_experts: usize,
    ) -> CandleResult<Self> {
        let vb_mlp = vb;
        let mut gate_list = Vec::with_capacity(num_experts);
        let mut up_list = Vec::with_capacity(num_experts);
        let mut down_list = Vec::with_capacity(num_experts);
        for i in 0..num_experts {
            let prefix = format!("experts.{}", i);
            let expert_vb = vb_mlp.pp(prefix.as_str());
            gate_list.push(expert_vb.get((intermediate, hidden), "gate_proj.weight")?);
            up_list.push(expert_vb.get((intermediate, hidden), "up_proj.weight")?);
            down_list.push(expert_vb.get((hidden, intermediate), "down_proj.weight")?);
        }
        let gate_proj = SwitchLinear::from_weight(Tensor::cat(&gate_list, 0)?)?;
        let up_proj = SwitchLinear::from_weight(Tensor::cat(&up_list, 0)?)?;
        let down_proj = SwitchLinear::from_weight(Tensor::cat(&down_list, 0)?)?;
        Ok(Self {
            gate_proj,
            up_proj,
            down_proj,
        })
    }

    /// Forward: x (N, hidden), indices (N,) -> out (N, hidden).
    pub fn forward(&self, x: &Tensor, indices: &Tensor) -> CandleResult<Tensor> {
        let gate = self.gate_proj.forward(x, indices)?;
        let up = self.up_proj.forward(x, indices)?;
        let gate = silu_manual(&gate)?;
        let hidden = (gate * up)?;
        self.down_proj.forward(&hidden, indices)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rms_norm_shape() {
        use candle_core::Device;
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let norm = RmsNorm::load(vb, 64, 1e-6).unwrap();
        let x = Tensor::zeros(&[2, 10, 64], DType::F32, &device).unwrap();
        let out = norm.forward(&x).unwrap();
        let dims = out.dims3().unwrap();
        assert_eq!(dims, (2, 10, 64));
    }

    #[test]
    fn test_switch_linear_forward() {
        use candle_core::Device;
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        // 4 experts, out=8, in=4
        let sl = SwitchLinear::load(vb, 4, 8, 4).unwrap();
        let x = Tensor::zeros(&[6, 4], DType::F32, &device).unwrap();
        let indices = Tensor::new(&[0u32, 1u32, 2u32, 0u32, 1u32, 2u32], &device).unwrap();
        let out = sl.forward(&x, &indices).unwrap();
        let (n, o) = out.dims2().unwrap();
        assert_eq!(n, 6);
        assert_eq!(o, 8);
    }
}
