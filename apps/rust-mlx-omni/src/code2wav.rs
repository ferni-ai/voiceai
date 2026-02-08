//! Qwen3-Omni Code2Wav: codec token indices → waveform (24 kHz).
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/code2wav/model.py`.
//!
//! Embed → 8-layer decoder → ConvNet upsampler (480x) → tanh.

use mlx_rs::{
    builder::Builder,
    error::Exception,
    fast,
    macros::ModuleParameters,
    module::Module,
    nn, ops,
    Array,
};

use crate::config::Code2WavConfig;
use crate::thinker::create_causal_mask;

// ─── Code2Wav Decoder Attention ───────────────────────────

/// Causal self-attention (no RoPE) for Code2Wav decoder.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Code2WavDecoderAttention {
    #[param]
    pub q_proj: nn::Linear,
    #[param]
    pub k_proj: nn::Linear,
    #[param]
    pub v_proj: nn::Linear,
    #[param]
    pub o_proj: nn::Linear,
    #[param]
    pub q_norm: nn::RmsNorm,
    #[param]
    pub k_norm: nn::RmsNorm,

    pub n_heads: usize,
    pub n_kv_heads: usize,
    pub head_dim: usize,
    pub scale: f32,
}

impl Code2WavDecoderAttention {
    pub fn new(config: &Code2WavConfig) -> Result<Self, Exception> {
        let hidden = config.hidden_size;
        let n_heads = config.num_attention_heads;
        let n_kv = config.num_key_value_heads;
        let head_dim = config.head_dim();

        Ok(Self {
            q_proj: nn::LinearBuilder::new(hidden as i32, (n_heads * head_dim) as i32)
                .bias(false)
                .build()?,
            k_proj: nn::LinearBuilder::new(hidden as i32, (n_kv * head_dim) as i32)
                .bias(false)
                .build()?,
            v_proj: nn::LinearBuilder::new(hidden as i32, (n_kv * head_dim) as i32)
                .bias(false)
                .build()?,
            o_proj: nn::LinearBuilder::new((n_heads * head_dim) as i32, hidden as i32)
                .bias(false)
                .build()?,
            q_norm: nn::RmsNormBuilder::new(head_dim as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            k_norm: nn::RmsNormBuilder::new(head_dim as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            n_heads,
            n_kv_heads: n_kv,
            head_dim,
            scale: (head_dim as f32).powf(-0.5),
        })
    }

    pub fn forward(&mut self, x: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let shape = x.shape();
        let (b, l) = (shape[0], shape[1]);
        let hd = self.head_dim as i32;

        let q = self
            .q_proj
            .forward(x)?
            .reshape(&[b, l, self.n_heads as i32, hd])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let k = self
            .k_proj
            .forward(x)?
            .reshape(&[b, l, self.n_kv_heads as i32, hd])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let v = self
            .v_proj
            .forward(x)?
            .reshape(&[b, l, self.n_kv_heads as i32, hd])?
            .transpose_axes(&[0, 2, 1, 3])?;

        let q = self.q_norm.forward(&q)?;
        let k = self.k_norm.forward(&k)?;

        let n_rep = self.n_heads / self.n_kv_heads;
        let (k, v) = if n_rep > 1 {
            (
                Array::repeat_axis::<f32>(k, n_rep as i32, 1)?,
                Array::repeat_axis::<f32>(v, n_rep as i32, 1)?,
            )
        } else {
            (k, v)
        };

        let sdpa_mask = mask.map(fast::ScaledDotProductAttentionMask::from);
        let out = fast::scaled_dot_product_attention(&q, &k, &v, self.scale, sdpa_mask)?;
        let out = out.transpose_axes(&[0, 2, 1, 3])?.reshape(&[b, l, -1])?;
        self.o_proj.forward(&out)
    }
}

// ─── Code2Wav Decoder MLP ─────────────────────────────────

/// SiLU-gated MLP for Code2Wav decoder.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Code2WavDecoderMLP {
    #[param]
    pub gate_proj: nn::Linear,
    #[param]
    pub up_proj: nn::Linear,
    #[param]
    pub down_proj: nn::Linear,
}

impl Code2WavDecoderMLP {
    pub fn new(hidden: usize, intermediate: usize) -> Result<Self, Exception> {
        Ok(Self {
            gate_proj: nn::LinearBuilder::new(hidden as i32, intermediate as i32)
                .bias(false)
                .build()?,
            up_proj: nn::LinearBuilder::new(hidden as i32, intermediate as i32)
                .bias(false)
                .build()?,
            down_proj: nn::LinearBuilder::new(intermediate as i32, hidden as i32)
                .bias(false)
                .build()?,
        })
    }
}

impl Module<&Array> for Code2WavDecoderMLP {
    type Error = Exception;
    type Output = Array;

    fn forward(&mut self, x: &Array) -> Result<Array, Exception> {
        let gate = nn::silu(&self.gate_proj.forward(x)?)?;
        let up = self.up_proj.forward(x)?;
        self.down_proj.forward(&gate.multiply(&up)?)
    }

    fn training_mode(&mut self, _mode: bool) {}
}

// ─── Code2Wav Decoder Layer ───────────────────────────────

/// Pre-norm attention + pre-norm SiLU MLP + residuals.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Code2WavDecoderLayer {
    #[param]
    pub self_attn: Code2WavDecoderAttention,
    #[param]
    pub mlp: Code2WavDecoderMLP,
    #[param]
    pub input_layernorm: nn::RmsNorm,
    #[param]
    pub post_attention_layernorm: nn::RmsNorm,
}

impl Code2WavDecoderLayer {
    pub fn new(config: &Code2WavConfig) -> Result<Self, Exception> {
        Ok(Self {
            self_attn: Code2WavDecoderAttention::new(config)?,
            mlp: Code2WavDecoderMLP::new(config.hidden_size, config.intermediate_size)?,
            input_layernorm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            post_attention_layernorm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
        })
    }

    pub fn forward(&mut self, x: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let normed = self.input_layernorm.forward(x)?;
        let r = self.self_attn.forward(&normed, mask)?;
        let h = x.add(&r)?;
        let normed2 = self.post_attention_layernorm.forward(&h)?;
        let r2 = self.mlp.forward(&normed2)?;
        h.add(&r2)
    }
}

// ─── Code2Wav Decoder ─────────────────────────────────────

/// input_proj → 8 layers → norm → final_proj to decoder_dim.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Code2WavDecoder {
    #[param]
    pub input_proj: nn::Linear,
    #[param]
    pub layers: Vec<Code2WavDecoderLayer>,
    #[param]
    pub norm: nn::RmsNorm,
    #[param]
    pub final_proj: nn::Linear,
}

impl Code2WavDecoder {
    pub fn new(config: &Code2WavConfig) -> Result<Self, Exception> {
        let embed_out = config.codebook_dim * config.num_quantizers;
        let layers = (0..config.num_hidden_layers)
            .map(|_| Code2WavDecoderLayer::new(config))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            input_proj: nn::LinearBuilder::new(embed_out as i32, config.hidden_size as i32)
                .bias(false)
                .build()?,
            layers,
            norm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            final_proj: nn::LinearBuilder::new(config.hidden_size as i32, config.decoder_dim as i32)
                .bias(false)
                .build()?,
        })
    }

    pub fn forward(&mut self, hidden: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let mut x = self.input_proj.forward(hidden)?;
        for layer in self.layers.iter_mut() {
            x = layer.forward(&x, mask)?;
        }
        x = self.norm.forward(&x)?;
        self.final_proj.forward(&x)
    }
}

// ─── Upsample Block ──────────────────────────────────────

/// ConvTranspose1d (upsample by rate) + SiLU.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct UpsampleBlock {
    #[param]
    pub conv_transpose: nn::ConvTranspose1d,
}

impl UpsampleBlock {
    pub fn new(in_channels: usize, out_channels: usize, rate: usize) -> Result<Self, Exception> {
        let kernel_size = rate * 2;
        let padding = (kernel_size - rate) / 2;

        Ok(Self {
            conv_transpose: nn::ConvTranspose1dBuilder::new(
                in_channels as i32,
                out_channels as i32,
                kernel_size as i32,
            )
            .stride(rate as i32)
            .padding(padding as i32)
            .build()?,
        })
    }

    pub fn forward(&mut self, x: &Array) -> Result<Array, Exception> {
        nn::silu(&self.conv_transpose.forward(x)?)
    }
}

// ─── ConvNet Upsampler ────────────────────────────────────

/// decoder_dim → 512 → 256 → 128 → 64 → 1, rates [8,5,4,3] = 480x.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct ConvNetUpsampler {
    #[param]
    pub input_conv: nn::Conv1d,
    #[param]
    pub upsample_blocks: Vec<UpsampleBlock>,
    #[param]
    pub output_conv: nn::Conv1d,
}

impl ConvNetUpsampler {
    pub fn new(config: &Code2WavConfig) -> Result<Self, Exception> {
        let rates = &config.upsample_rates;
        let num_stages = rates.len();
        let initial_channels = 512_usize.max(1 << num_stages);

        let input_conv = nn::Conv1dBuilder::new(
            config.decoder_dim as i32,
            initial_channels as i32,
            7,
        )
        .stride(1)
        .padding(3)
        .build()?;

        let mut channels = initial_channels;
        let mut blocks = Vec::new();
        for &rate in rates {
            let out_ch = channels / 2;
            blocks.push(UpsampleBlock::new(channels, out_ch, rate)?);
            channels = out_ch;
        }

        let output_conv = nn::Conv1dBuilder::new(channels as i32, 1, 7)
            .stride(1)
            .padding(3)
            .build()?;

        Ok(Self {
            input_conv,
            upsample_blocks: blocks,
            output_conv,
        })
    }

    pub fn forward(&mut self, x: &Array) -> Result<Array, Exception> {
        let mut out = self.input_conv.forward(x)?;
        for block in self.upsample_blocks.iter_mut() {
            out = block.forward(&out)?;
        }
        out = self.output_conv.forward(&out)?;
        out = ops::tanh(&out)?;
        out.squeeze_axes(&[-1])
    }
}

// ─── Qwen3OmniCode2Wav ───────────────────────────────────

/// Full Code2Wav: codec_token_ids (B, L, num_quantizers) → waveform (B, samples).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Qwen3OmniCode2Wav {
    #[param]
    pub embed: nn::Embedding,
    #[param]
    pub decoder: Code2WavDecoder,
    #[param]
    pub upsampler: ConvNetUpsampler,

    pub config: Code2WavConfig,
}

impl Qwen3OmniCode2Wav {
    pub fn new(config: &Code2WavConfig) -> Result<Self, Exception> {
        Ok(Self {
            embed: nn::Embedding::new(config.codebook_size as i32, config.codebook_dim as i32)?,
            decoder: Code2WavDecoder::new(config)?,
            upsampler: ConvNetUpsampler::new(config)?,
            config: config.clone(),
        })
    }

    /// Forward: codec_token_ids (B, L, num_quantizers) → waveform (B, L*480) in [-1, 1].
    pub fn forward(&mut self, codec_token_ids: &Array) -> Result<Array, Exception> {
        let shape = codec_token_ids.shape();
        let (b, l, num_q) = (shape[0], shape[1], shape[2]);

        let mut embedded_list = Vec::new();
        for q in 0..num_q {
            let q_arr = Array::from_int(q);
            let ids = codec_token_ids.take_axis(&q_arr, 2)?;
            let ids = ids.squeeze_axes(&[2])?;
            let e = self.embed.forward(&ids)?;
            embedded_list.push(e);
        }

        let refs: Vec<&Array> = embedded_list.iter().collect();
        let stacked = ops::stack_axis(&refs, 2)?;
        let hidden = stacked.reshape(&[b, l, (num_q as usize * self.config.codebook_dim) as i32])?;

        let mask = if l > 1 {
            Some(create_causal_mask(l)?)
        } else {
            None
        };

        let hidden = self.decoder.forward(&hidden, mask.as_ref())?;
        self.upsampler.forward(&hidden)
    }

    pub fn sample_rate(&self) -> usize {
        self.config.sample_rate
    }

    pub fn total_upsample_factor(&self) -> usize {
        self.config.total_upsample_factor()
    }
}
