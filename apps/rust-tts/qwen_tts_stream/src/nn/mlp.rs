//! MLP (Multi-Layer Perceptron) implementations.

use candle_core::{Result, Tensor};
use candle_nn::{Activation, Linear, Module, VarBuilder, linear, linear_no_bias};

#[cfg(feature = "timing")]
use crate::nn::timing::{MLP_CALLS, MLP_TIME_US};

/// Gated MLP used in the talker model.
///
/// Uses a gated linear unit architecture with fused gate+up projection:
/// output = down_proj(silu(gate) * up)
///
/// The gate_proj and up_proj weights are fused into a single matrix for
/// better memory access patterns and reduced kernel launch overhead.
#[derive(Debug, Clone)]
pub struct TalkerMLP {
    gate_up_proj: Linear,
    down_proj: Linear,
}

impl TalkerMLP {
    pub fn new(
        hidden_size: usize,
        intermediate_size: usize,
        _hidden_act: &str,
        vb: VarBuilder,
    ) -> Result<Self> {
        // Load separate gate and up weights, then fuse them
        let gate_weight = vb
            .pp("gate_proj")
            .get((intermediate_size, hidden_size), "weight")?;
        let up_weight = vb
            .pp("up_proj")
            .get((intermediate_size, hidden_size), "weight")?;

        // Concatenate along dim 0: (intermediate, hidden) + (intermediate, hidden) -> (2*intermediate, hidden)
        let fused_weight = Tensor::cat(&[&gate_weight, &up_weight], 0)?;
        let gate_up_proj = Linear::new(fused_weight, None);

        let down_proj = linear_no_bias(intermediate_size, hidden_size, vb.pp("down_proj"))?;

        Ok(Self {
            gate_up_proj,
            down_proj,
        })
    }

    pub fn load(
        hidden_size: usize,
        intermediate_size: usize,
        hidden_act: &str,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(hidden_size, intermediate_size, hidden_act, vb)
    }
}

impl Module for TalkerMLP {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        #[cfg(feature = "timing")]
        let start = std::time::Instant::now();
        #[cfg(feature = "timing")]
        MLP_CALLS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // Single fused matmul for gate and up projections
        let gate_up = self.gate_up_proj.forward(xs)?;

        // swiglu: silu(gate) * up - chunks along last dim and applies silu to first chunk
        let hidden = candle_nn::ops::swiglu(&gate_up)?;

        let result = self.down_proj.forward(&hidden)?;

        #[cfg(feature = "timing")]
        MLP_TIME_US.fetch_add(
            start.elapsed().as_micros() as u64,
            std::sync::atomic::Ordering::Relaxed,
        );

        Ok(result)
    }
}

/// Resize MLP for projecting between different hidden dimensions.
///
/// Used for projecting embeddings or hidden states between models with
/// different hidden sizes.
#[derive(Debug, Clone)]
pub struct TalkerResizeMLP {
    linear_fc1: Linear,
    linear_fc2: Linear,
    act_fn: Activation,
}

impl TalkerResizeMLP {
    pub fn new(
        input_size: usize,
        intermediate_size: usize,
        output_size: usize,
        hidden_act: &str,
        use_bias: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let linear_fc1 = if use_bias {
            linear(input_size, intermediate_size, vb.pp("linear_fc1"))?
        } else {
            linear_no_bias(input_size, intermediate_size, vb.pp("linear_fc1"))?
        };
        let linear_fc2 = if use_bias {
            linear(intermediate_size, output_size, vb.pp("linear_fc2"))?
        } else {
            linear_no_bias(intermediate_size, output_size, vb.pp("linear_fc2"))?
        };

        let act_fn = match hidden_act {
            "silu" | "swish" => Activation::Silu,
            "gelu" => Activation::Gelu,
            "relu" => Activation::Relu,
            "gelu_new" | "gelu_fast" => Activation::NewGelu,
            _ => Activation::Silu,
        };

        Ok(Self {
            linear_fc1,
            linear_fc2,
            act_fn,
        })
    }

    pub fn load(
        input_size: usize,
        intermediate_size: usize,
        output_size: usize,
        hidden_act: &str,
        use_bias: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(
            input_size,
            intermediate_size,
            output_size,
            hidden_act,
            use_bias,
            vb,
        )
    }
}

impl Module for TalkerResizeMLP {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        // First linear
        let hidden = self.linear_fc1.forward(xs)?;

        // Apply activation - stay in native dtype (BF16)
        let hidden = self.act_fn.forward(&hidden)?;

        // Second linear
        self.linear_fc2.forward(&hidden)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};
    use candle_nn::VarMap;

    #[test]
    fn test_talker_mlp_shape() -> Result<()> {
        let device = Device::Cpu;
        let varmap = VarMap::new();
        let vb = VarBuilder::from_varmap(&varmap, DType::F32, &device);

        // Initialize weights (gate and up will be fused during construction)
        let hidden_size = 64;
        let intermediate_size = 128;

        let _ = vb
            .pp("gate_proj")
            .get((intermediate_size, hidden_size), "weight")?;
        let _ = vb
            .pp("up_proj")
            .get((intermediate_size, hidden_size), "weight")?;
        let _ = vb
            .pp("down_proj")
            .get((hidden_size, intermediate_size), "weight")?;

        let mlp = TalkerMLP::load(hidden_size, intermediate_size, "silu", vb)?;

        let input = Tensor::randn(0.0f32, 1.0, (2, 10, hidden_size), &device)?;
        let output = mlp.forward(&input)?;

        assert_eq!(output.dims(), &[2, 10, hidden_size]);
        Ok(())
    }

    #[test]
    fn test_resize_mlp_shape() -> Result<()> {
        let device = Device::Cpu;
        let varmap = VarMap::new();
        let vb = VarBuilder::from_varmap(&varmap, DType::F32, &device);

        let input_size = 64;
        let intermediate_size = 128;
        let output_size = 32;

        let _ = vb
            .pp("linear_fc1")
            .get((intermediate_size, input_size), "weight")?;
        let _ = vb
            .pp("linear_fc2")
            .get((output_size, intermediate_size), "weight")?;

        let mlp = TalkerResizeMLP::load(
            input_size,
            intermediate_size,
            output_size,
            "silu",
            false, // no bias
            vb,
        )?;

        let input = Tensor::randn(0.0f32, 1.0, (2, 10, input_size), &device)?;
        let output = mlp.forward(&input)?;

        assert_eq!(output.dims(), &[2, 10, output_size]);
        Ok(())
    }

    #[test]
    fn test_resize_mlp_with_bias() -> Result<()> {
        let device = Device::Cpu;
        let varmap = VarMap::new();
        let vb = VarBuilder::from_varmap(&varmap, DType::F32, &device);

        let input_size = 64;
        let intermediate_size = 128;
        let output_size = 32;

        // With bias
        let _ = vb
            .pp("linear_fc1")
            .get((intermediate_size, input_size), "weight")?;
        let _ = vb.pp("linear_fc1").get(intermediate_size, "bias")?;
        let _ = vb
            .pp("linear_fc2")
            .get((output_size, intermediate_size), "weight")?;
        let _ = vb.pp("linear_fc2").get(output_size, "bias")?;

        let mlp = TalkerResizeMLP::load(
            input_size,
            intermediate_size,
            output_size,
            "silu",
            true, // with bias
            vb,
        )?;

        let input = Tensor::randn(0.0f32, 1.0, (2, 10, input_size), &device)?;
        let output = mlp.forward(&input)?;

        assert_eq!(output.dims(), &[2, 10, output_size]);
        Ok(())
    }
}
