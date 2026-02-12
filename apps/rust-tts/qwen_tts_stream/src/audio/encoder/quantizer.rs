use candle_core::{D, Result, Tensor};
use candle_nn::{Linear, Module, VarBuilder};

/// Encoder codebook - stores embeddings normalized by cluster usage.
#[derive(Debug, Clone)]
struct EncoderCodebook {
    embed_sum: Tensor,
    cluster_usage: Tensor,
    dim: usize,
}

impl EncoderCodebook {
    fn new(dim: usize, codebook_size: usize, vb: VarBuilder) -> Result<Self> {
        let embed_sum = vb.get((codebook_size, dim), "embed_sum")?;
        let cluster_usage = vb.get(codebook_size, "cluster_usage")?;
        Ok(Self {
            embed_sum,
            cluster_usage,
            dim,
        })
    }

    fn embeddings(&self) -> Result<Tensor> {
        let usage = self.cluster_usage.clamp(1e-5, f64::INFINITY)?;
        self.embed_sum.broadcast_div(&usage.unsqueeze(1)?)
    }

    fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        // xs: [B, T, dim]
        let orig_shape = xs.dims().to_vec();
        let xs = xs.flatten_to(D::Minus2)?; // [B*T, dim]

        let embeddings = self.embeddings()?;

        // Compute distances: ||x - e||^2 = ||x||^2 - 2*x·e + ||e||^2
        // For argmin, we can ignore ||x||^2
        let c2 = embeddings.sqr()?.sum(D::Minus1)?.affine(0.5, 0.)?;
        let dot = xs.matmul(&embeddings.t()?)?;
        let dist = c2.broadcast_sub(&dot)?;
        let codes = dist.argmin(D::Minus1)?;

        let mut new_shape = orig_shape;
        new_shape.pop();
        codes.reshape(new_shape)
    }
}

/// Single-layer vector quantization for encoder.
#[derive(Debug, Clone)]
struct EncoderVQ {
    codebook: EncoderCodebook,
}

impl EncoderVQ {
    fn new(dim: usize, codebook_size: usize, vb: VarBuilder) -> Result<Self> {
        let codebook = EncoderCodebook::new(dim, codebook_size, vb.pp("codebook"))?;
        Ok(Self { codebook })
    }

    fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        self.codebook.encode(xs)
    }

    fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        let embeddings = self.codebook.embeddings()?;
        let codes_flat = codes.flatten_all()?;
        let quantized = embeddings.embedding(&codes_flat)?;

        let mut new_shape = codes.dims().to_vec();
        new_shape.push(self.codebook.dim);
        quantized.reshape(new_shape)
    }
}

/// Residual vector quantizer for encoder.
#[allow(dead_code)]
#[derive(Debug, Clone)]
struct EncoderRVQ {
    layers: Vec<EncoderVQ>,
    input_proj: Linear,
    output_proj: Linear,
    dim: usize,
}

impl EncoderRVQ {
    fn new(
        dim: usize,
        input_dim: usize,
        output_dim: usize,
        n_q: usize,
        bins: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        // Conv1d weights [out, in, 1] loaded as linear [out, in]
        let input_weight = vb
            .get((dim, input_dim, 1), "input_proj.weight")?
            .squeeze(2)?;
        let input_proj = Linear::new(input_weight, None);

        let output_weight = vb
            .get((output_dim, dim, 1), "output_proj.weight")?
            .squeeze(2)?;
        let output_proj = Linear::new(output_weight, None);

        let layers = (0..n_q)
            .map(|i| EncoderVQ::new(dim, bins, vb.pp(format!("layers.{}", i))))
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            layers,
            input_proj,
            output_proj,
            dim,
        })
    }

    fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        // xs: [B, dim, T] -> [B, T, dim] for linear
        let xs = xs.transpose(1, 2)?;
        let xs = self.input_proj.forward(&xs)?;

        let mut codes = Vec::with_capacity(self.layers.len());
        let mut residual = xs;

        for layer in &self.layers {
            let idx = layer.encode(&residual)?;
            let quantized = layer.decode(&idx)?;
            residual = (&residual - &quantized)?;
            codes.push(idx);
        }

        // Stack: [n_q, B, T] -> [B, n_q, T]
        let stacked = Tensor::stack(&codes, 0)?;
        stacked.transpose(0, 1)
    }
}

/// Split residual vector quantizer for encoder.
/// Separates semantic (1 codebook) from acoustic (remaining codebooks).
#[derive(Debug, Clone)]
pub struct EncoderSplitRVQ {
    semantic: EncoderRVQ,
    acoustic: EncoderRVQ,
}

impl EncoderSplitRVQ {
    pub fn new(
        dim: usize,
        input_dim: usize,
        output_dim: usize,
        n_q_semantic: usize,
        n_q_acoustic: usize,
        bins: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        let semantic = EncoderRVQ::new(
            dim,
            input_dim,
            output_dim,
            n_q_semantic,
            bins,
            vb.pp("semantic_residual_vector_quantizer"),
        )?;
        let acoustic = EncoderRVQ::new(
            dim,
            input_dim,
            output_dim,
            n_q_acoustic,
            bins,
            vb.pp("acoustic_residual_vector_quantizer"),
        )?;
        Ok(Self { semantic, acoustic })
    }

    pub fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        let semantic_codes = self.semantic.encode(xs)?;
        let acoustic_codes = self.acoustic.encode(xs)?;
        Tensor::cat(&[semantic_codes, acoustic_codes], 1)
    }
}
