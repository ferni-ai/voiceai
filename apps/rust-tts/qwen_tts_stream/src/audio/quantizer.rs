//! Vector quantization components for the tokenizer.
//!
//! The tokenizer uses a Split Residual Vector Quantizer (SRVQ):
//! - **Encode**: Convert continuous features to discrete codes
//! - **Decode**: Convert discrete codes back to continuous representations
//!
//! The split structure separates semantic (first quantizer) from acoustic
//! (remaining quantizers) representations.

use candle_core::{D, IndexOp, Result, Tensor};
use candle_nn::{Linear, Module, VarBuilder, linear_no_bias};

/// Load a Conv1d weight (kernel_size=1) as a Linear layer.
///
/// PyTorch Conv1d weights have shape [out_channels, in_channels, kernel_size].
/// When kernel_size=1, this is equivalent to a Linear layer with shape [out, in].
/// This function handles both shapes for compatibility.
fn conv1d_as_linear(in_features: usize, out_features: usize, vb: VarBuilder) -> Result<Linear> {
    let weight = vb.get((out_features, in_features), "weight").or_else(|_| {
        // Try loading as Conv1d format [out, in, 1] and squeeze
        let w = vb.get((out_features, in_features, 1), "weight")?;
        w.squeeze(2)
    })?;
    Ok(Linear::new(weight, None))
}

/// Euclidean codebook for vector quantization.
///
/// Uses EMA (Exponential Moving Average) updated embeddings.
#[derive(Debug, Clone)]
pub struct EuclideanCodebook {
    cluster_usage: Tensor,
    embedding_sum: Tensor,
    dim: usize,
    eps: f64,
}

impl EuclideanCodebook {
    pub fn new(dim: usize, codebook_size: usize, vb: VarBuilder) -> Result<Self> {
        let cluster_usage = vb.get(codebook_size, "cluster_usage")?;
        let embedding_sum = vb.get((codebook_size, dim), "embedding_sum")?;

        Ok(Self {
            cluster_usage,
            embedding_sum,
            dim,
            eps: 1e-5,
        })
    }

    pub fn load(dim: usize, codebook_size: usize, vb: VarBuilder) -> Result<Self> {
        Self::new(dim, codebook_size, vb)
    }

    /// Get the codebook embeddings (normalized by usage).
    fn embeddings(&self) -> Result<Tensor> {
        let usage = self.cluster_usage.clamp(self.eps, f64::INFINITY)?;
        self.embedding_sum.broadcast_div(&usage.unsqueeze(1)?)
    }

    /// Encode continuous features to code indices using nearest neighbor lookup.
    ///
    /// Input: (batch, seq_len, dim) or (seq_len, dim) continuous features
    /// Output: same shape without last dimension, containing code indices
    ///
    /// This performs K-nearest-neighbor lookup: for each input vector,
    /// find the closest codebook entry (minimum Euclidean distance).
    pub fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        let mut target_shape = xs.dims().to_vec();
        target_shape.pop(); // Remove dim dimension

        // Flatten to (total_vectors, dim)
        let xs = xs.flatten_to(D::Minus2)?;

        // Get embeddings and compute c2 = ||embedding||^2 / 2 for each entry
        let embeddings = self.embeddings()?;
        let c2 = embeddings.sqr()?.sum(D::Minus1)?.affine(0.5, 0.)?;

        // Efficient distance computation:
        // d(x, e) = ||x - e||^2 = ||x||^2 - 2*x·e + ||e||^2
        // We only need argmin, so we can ignore ||x||^2 (constant for each x)
        // argmin_e (d) = argmin_e (||e||^2/2 - x·e) = argmin_e (c2 - dot_prod)
        let dot_prod = xs.matmul(&embeddings.t()?)?;
        let distances = c2.broadcast_sub(&dot_prod)?;
        let codes = distances.argmin(D::Minus1)?;

        codes.reshape(target_shape)
    }

    /// Decode code indices to embeddings.
    pub fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        let embeddings = self.embeddings()?;

        // Candle's embedding requires 1D indices, but PyTorch F.embedding handles N-D.
        // Workaround: flatten, embed, reshape to get equivalent result.
        let original_shape = codes.dims().to_vec();
        let codes_flat = codes.flatten_all()?;

        let quantized = embeddings.embedding(&codes_flat)?;

        // Reshape to original shape + embedding dim: [B, T] -> [B, T, dim]
        let mut new_shape = original_shape;
        new_shape.push(self.dim);
        quantized.reshape(new_shape)
    }
}

/// Single-codebook vector quantization.
#[derive(Debug, Clone)]
pub struct VectorQuantization {
    codebook: EuclideanCodebook,
    project_in: Option<Linear>,
    project_out: Option<Linear>,
}

impl VectorQuantization {
    pub fn new(
        dim: usize,
        codebook_size: usize,
        codebook_dim: Option<usize>,
        vb: VarBuilder,
    ) -> Result<Self> {
        let codebook_dim = codebook_dim.unwrap_or(dim);

        let codebook = EuclideanCodebook::new(codebook_dim, codebook_size, vb.pp("_codebook"))?;

        let (project_in, project_out) = if codebook_dim != dim {
            let p_in = linear_no_bias(dim, codebook_dim, vb.pp("project_in"))?;
            let p_out = linear_no_bias(codebook_dim, dim, vb.pp("project_out"))?;
            (Some(p_in), Some(p_out))
        } else {
            (None, None)
        };

        Ok(Self {
            codebook,
            project_in,
            project_out,
        })
    }

    pub fn load(
        dim: usize,
        codebook_size: usize,
        codebook_dim: Option<usize>,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(dim, codebook_size, codebook_dim, vb)
    }

    /// Encode continuous features to code indices.
    ///
    /// Input: (batch, dim, seq_len) continuous features
    /// Output: (batch, seq_len) code indices
    pub fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        // Transpose to (batch, seq_len, dim) for projection and encoding
        let xs = xs.t()?;
        let xs = match &self.project_in {
            Some(proj) => proj.forward(&xs)?,
            None => xs,
        };
        self.codebook.encode(&xs)
    }

    /// Decode codes to continuous representations.
    ///
    /// Input: (batch, seq_len) code indices
    /// Output: (batch, dim, seq_len) continuous features
    pub fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        let quantized = self.codebook.decode(codes)?;

        let quantized = match &self.project_out {
            Some(proj) => proj.forward(&quantized)?,
            None => quantized,
        };

        // Transpose to (batch, dim, seq_len)
        quantized.transpose(1, 2)
    }
}

/// Residual Vector Quantization with multiple codebooks.
#[derive(Debug, Clone)]
pub struct ResidualVectorQuantizer {
    layers: Vec<VectorQuantization>,
    input_proj: Option<Linear>,
    output_proj: Option<Linear>,
}

impl ResidualVectorQuantizer {
    pub fn new(
        dimension: usize,
        input_dimension: Option<usize>,
        output_dimension: Option<usize>,
        n_q: usize,
        bins: usize,
        force_projection: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let input_dim = input_dimension.unwrap_or(dimension);
        let output_dim = output_dimension.unwrap_or(dimension);

        let input_proj = if input_dim != dimension || force_projection {
            Some(conv1d_as_linear(input_dim, dimension, vb.pp("input_proj"))?)
        } else {
            None
        };

        let output_proj = if output_dim != dimension || force_projection {
            Some(conv1d_as_linear(
                dimension,
                output_dim,
                vb.pp("output_proj"),
            )?)
        } else {
            None
        };

        let layers = (0..n_q)
            .map(|i| {
                VectorQuantization::new(dimension, bins, None, vb.pp(format!("vq.layers.{}", i)))
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            layers,
            input_proj,
            output_proj,
        })
    }

    pub fn load(
        dimension: usize,
        input_dimension: Option<usize>,
        output_dimension: Option<usize>,
        n_q: usize,
        bins: usize,
        force_projection: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(
            dimension,
            input_dimension,
            output_dimension,
            n_q,
            bins,
            force_projection,
            vb,
        )
    }

    /// Encode continuous features to codes using residual quantization.
    ///
    /// Input: (batch, input_dim, seq_len) continuous features
    /// Output: (batch, n_q, seq_len) code indices
    ///
    /// Each layer encodes the residual from the previous layer's reconstruction.
    pub fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        // Apply input projection if present
        let xs = match &self.input_proj {
            Some(proj) => {
                // Transpose for linear: (batch, dim, seq) -> (batch, seq, dim)
                let xs = xs.transpose(1, 2)?;
                let xs = proj.forward(&xs)?;
                xs.transpose(1, 2)?
            }
            None => xs.clone(),
        };

        let mut codes = Vec::with_capacity(self.layers.len());
        let mut residual = xs;

        for layer in &self.layers {
            let indices = layer.encode(&residual)?;
            let quantized = layer.decode(&indices)?;
            residual = (&residual - &quantized)?;
            codes.push(indices);
        }

        // Stack codes: list of (batch, seq) -> (n_q, batch, seq)
        let stacked = Tensor::stack(&codes, 0)?;
        // Transpose to (batch, n_q, seq)
        stacked.transpose(0, 1)
    }

    /// Decode codes from all quantizers.
    ///
    /// Input: (n_q, batch, seq_len) code indices
    /// Output: (batch, output_dim, seq_len) continuous features
    pub fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        let n_q = codes.dim(0)?;

        // Sum quantized outputs from each layer
        let mut quantized: Option<Tensor> = None;

        for (idx, layer) in self.layers.iter().enumerate().take(n_q) {
            let layer_codes = codes.i(idx)?;
            let layer_quantized = layer.decode(&layer_codes)?;

            quantized = Some(match quantized {
                Some(q) => (q + layer_quantized)?,
                None => layer_quantized,
            });
        }

        let quantized = quantized.unwrap();

        // Apply output projection
        if let Some(ref proj) = self.output_proj {
            // Transpose for linear: (batch, dim, seq) -> (batch, seq, dim)
            let quantized = quantized.transpose(1, 2)?;
            let quantized = proj.forward(&quantized)?;
            // Transpose back
            quantized.transpose(1, 2)
        } else {
            Ok(quantized)
        }
    }
}

/// Split Residual Vector Quantizer.
///
/// Splits quantizers into semantic (first N) and acoustic (rest) groups,
/// each with their own projections.
#[derive(Debug, Clone)]
pub struct SplitResidualVectorQuantizer {
    rvq_first: ResidualVectorQuantizer,
    rvq_rest: ResidualVectorQuantizer,
    n_q_semantic: usize,
}

impl SplitResidualVectorQuantizer {
    pub fn new(
        n_q: usize,
        n_q_semantic: usize,
        dimension: usize,
        input_dimension: Option<usize>,
        output_dimension: Option<usize>,
        bins: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        let rvq_first = ResidualVectorQuantizer::new(
            dimension,
            input_dimension,
            output_dimension,
            n_q_semantic,
            bins,
            true, // force_projection
            vb.pp("rvq_first"),
        )?;

        let rvq_rest = ResidualVectorQuantizer::new(
            dimension,
            input_dimension,
            output_dimension,
            n_q - n_q_semantic,
            bins,
            true,
            vb.pp("rvq_rest"),
        )?;

        Ok(Self {
            rvq_first,
            rvq_rest,
            n_q_semantic,
        })
    }

    pub fn load(
        n_q: usize,
        n_q_semantic: usize,
        dimension: usize,
        input_dimension: Option<usize>,
        output_dimension: Option<usize>,
        bins: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(
            n_q,
            n_q_semantic,
            dimension,
            input_dimension,
            output_dimension,
            bins,
            vb,
        )
    }

    /// Get the number of semantic quantizers.
    pub fn n_q_semantic(&self) -> usize {
        self.n_q_semantic
    }

    /// Encode continuous features to codes.
    ///
    /// Input: (batch, input_dim, seq_len) continuous features
    /// Output: (batch, n_q, seq_len) code indices
    ///
    /// Unlike standard residual quantization, the split quantizer encodes
    /// the same input with both semantic and acoustic quantizers (they're
    /// parallel, not residual to each other).
    pub fn encode(&self, xs: &Tensor) -> Result<Tensor> {
        // Encode with semantic quantizer (first)
        let semantic_codes = self.rvq_first.encode(xs)?;

        // Encode with acoustic quantizer (rest) - same input, not residual
        let acoustic_codes = self.rvq_rest.encode(xs)?;

        // Concatenate: (batch, n_q_semantic, seq) + (batch, n_q_rest, seq)
        Tensor::cat(&[semantic_codes, acoustic_codes], 1)
    }

    /// Decode codes from all quantizers.
    ///
    /// Input: (batch, n_q, seq_len) code indices
    /// Output: (batch, output_dim, seq_len) continuous features
    pub fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        let n_q = codes.dim(1)?;

        // Split into semantic and acoustic codes
        let semantic_codes = codes.narrow(1, 0, self.n_q_semantic)?;
        let semantic_codes = semantic_codes.transpose(0, 1)?; // (n_q_semantic, batch, seq)

        let quantized = self.rvq_first.decode(&semantic_codes)?;

        if n_q > self.n_q_semantic {
            let acoustic_codes = codes.narrow(1, self.n_q_semantic, n_q - self.n_q_semantic)?;
            let acoustic_codes = acoustic_codes.transpose(0, 1)?;
            let acoustic_quantized = self.rvq_rest.decode(&acoustic_codes)?;
            quantized + acoustic_quantized
        } else {
            Ok(quantized)
        }
    }
}
