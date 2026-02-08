//! FTIS V3 ONNX Router
//!
//! Fast tool routing using ONNX Runtime for inference.
//! On macOS: tries Core ML (Apple GPU/Neural Engine) first, falls back to CPU if the
//! model uses external data format (.onnx_data) which Core ML cannot load.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use ort::{
    ep,
    session::{
        builder::{GraphOptimizationLevel, SessionBuilder},
        Session,
    },
    value::Tensor,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokenizers::Tokenizer;

// ============================================================================
// TYPES
// ============================================================================

#[napi(object)]
#[derive(Clone)]
pub struct ToolPrediction {
    pub tool_id: String,
    pub confidence: f64,
}

#[napi(object)]
pub struct RouterPredictResult {
    pub predictions: Vec<ToolPrediction>,
    pub latency_ms: f64,
}

#[napi(object)]
pub struct RouterConfig {
    pub model_path: String,
    pub tokenizer_path: String,
    pub label_map_path: String,
    pub max_length: u32,
    pub threshold: f64,
    pub top_k: u32,
    /// Number of threads for inference (0 = auto-detect based on CPU cores)
    pub num_threads: Option<u32>,
}

// ============================================================================
// SESSION LOADING (Core ML try / CPU fallback on macOS)
// ============================================================================

/// Build a configured SessionBuilder (optimization level, thread count).
fn make_builder(num_threads: u32) -> std::result::Result<SessionBuilder, ort::Error> {
    let mut b = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?;
    let n = if num_threads > 0 {
        num_threads as usize
    } else {
        std::thread::available_parallelism().map(|p| p.get()).unwrap_or(4)
    };
    b = b.with_intra_threads(n)?;
    Ok(b)
}

/// Load session: on macOS try Core ML first, fall back to CPU if model uses external data.
fn load_session_with_mac_gpu_fallback(model_path: &str, num_threads: u32) -> Result<Session> {
    let builder = make_builder(num_threads)
        .map_err(|e| Error::from_reason(format!("Session builder: {}", e)))?;

    #[cfg(target_os = "macos")]
    {
        let coreml = ep::CoreML::default().build();
        let cpu = ep::CPU::default().build();
        if let Ok(b) = builder.with_execution_providers([coreml, cpu]) {
            if let Ok(s) = b.commit_from_file(model_path) {
                eprintln!("🧠 FTIS ONNX Router using Core ML (Apple GPU/Neural Engine)");
                return Ok(s);
            }
        }
        eprintln!("🧠 Core ML unavailable or model incompatible (e.g. external data), using CPU");
    }

    make_builder(num_threads)
        .map_err(|e| Error::from_reason(format!("Session builder: {}", e)))?
        .commit_from_file(model_path)
        .map_err(|e| Error::from_reason(format!("Failed to load model: {}", e)))
}

// ============================================================================
// ONNX ROUTER
// ============================================================================

/// ONNX Router for FTIS V3 inference
#[napi]
pub struct OnnxRouter {
    session: Arc<Mutex<Session>>,
    tokenizer: Arc<Tokenizer>,
    label_map: HashMap<i64, String>,
    max_length: usize,
    threshold: f64,
    top_k: usize,
}

#[napi]
impl OnnxRouter {
    /// Create a new ONNX router instance
    #[napi(constructor)]
    pub fn new(config: RouterConfig) -> Result<Self> {
        let start = std::time::Instant::now();

        // Determine thread count: use provided value, or auto-detect (used for CPU fallback)
        let num_threads = config.num_threads.unwrap_or(0);
        if num_threads > 0 {
            eprintln!("⚙️  Using {} threads for inference", num_threads);
        } else {
            let cores = std::thread::available_parallelism()
                .map(|p| p.get())
                .unwrap_or(4);
            eprintln!("⚙️  Auto-detected {} cores for inference", cores);
        }

        // On macOS: try Core ML (Apple GPU/ANE) first; fall back to CPU if model uses external data
        let session = load_session_with_mac_gpu_fallback(&config.model_path, num_threads)?;

        // Load tokenizer
        let tokenizer = Tokenizer::from_file(&config.tokenizer_path)
            .map_err(|e| Error::from_reason(format!("Failed to load tokenizer: {}", e)))?;

        // Load label map
        let label_map_content = std::fs::read_to_string(&config.label_map_path)
            .map_err(|e| Error::from_reason(format!("Failed to read label map: {}", e)))?;
        let label_map_raw: HashMap<String, i64> = serde_json::from_str(&label_map_content)
            .map_err(|e| Error::from_reason(format!("Failed to parse label map: {}", e)))?;

        // Invert the map (id -> label)
        let label_map: HashMap<i64, String> = label_map_raw
            .into_iter()
            .map(|(k, v)| (v, k))
            .collect();

        let load_time = start.elapsed().as_millis();
        eprintln!(
            "FTIS V3 ONNX Router loaded in {}ms ({} labels)",
            load_time,
            label_map.len()
        );

        Ok(Self {
            session: Arc::new(Mutex::new(session)),
            tokenizer: Arc::new(tokenizer),
            label_map,
            max_length: config.max_length as usize,
            threshold: config.threshold,
            top_k: config.top_k as usize,
        })
    }

    /// Predict tools for a query
    #[napi]
    pub fn predict(&self, query: String) -> Result<RouterPredictResult> {
        let start = std::time::Instant::now();

        // Tokenize
        let encoding = self
            .tokenizer
            .encode(query.as_str(), true)
            .map_err(|e| Error::from_reason(format!("Tokenization failed: {}", e)))?;

        // Prepare input tensors
        let mut input_ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
        let mut attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&x| x as i64)
            .collect();

        // Pad or truncate to max_length
        input_ids.resize(self.max_length, 0);
        attention_mask.resize(self.max_length, 0);

        // Create input tensors with shape [1, max_length]
        let input_ids_array = ndarray::Array2::from_shape_vec((1, self.max_length), input_ids)
            .map_err(|e| Error::from_reason(format!("Input array creation failed: {}", e)))?;

        let attention_mask_array =
            ndarray::Array2::from_shape_vec((1, self.max_length), attention_mask)
                .map_err(|e| {
                    Error::from_reason(format!("Attention mask array creation failed: {}", e))
                })?;

        // Create tensors from ndarray
        let input_ids_tensor = Tensor::from_array(input_ids_array)
            .map_err(|e| Error::from_reason(format!("Input tensor creation failed: {}", e)))?;

        let attention_mask_tensor = Tensor::from_array(attention_mask_array)
            .map_err(|e| {
                Error::from_reason(format!("Attention mask tensor creation failed: {}", e))
            })?;

        // Run inference (lock session mutex)
        let mut session = self
            .session
            .lock()
            .map_err(|e| Error::from_reason(format!("Session lock failed: {}", e)))?;

        let outputs = session
            .run(ort::inputs![
                "input_ids" => input_ids_tensor,
                "attention_mask" => attention_mask_tensor
            ])
            .map_err(|e| Error::from_reason(format!("Inference failed: {}", e)))?;

        // Extract logits - try_extract_array returns ArrayViewD<f32>
        let logits_array = outputs["logits"]
            .try_extract_array::<f32>()
            .map_err(|e| Error::from_reason(format!("Logits extraction failed: {}", e)))?;

        let logits_slice = logits_array
            .as_slice()
            .ok_or_else(|| Error::from_reason("Failed to get logits slice"))?;

        // Apply softmax for single-label classification (most accurate for tool routing)
        // The model was trained as sequence classification with CrossEntropyLoss,
        // so softmax gives proper probability distribution (sums to 1.0)
        let max_logit = logits_slice
            .iter()
            .fold(f32::NEG_INFINITY, |a, &b| a.max(b));
        let exp_sum: f32 = logits_slice
            .iter()
            .map(|&l| (l - max_logit).exp())
            .sum();

        let mut predictions: Vec<ToolPrediction> = logits_slice
            .iter()
            .enumerate()
            .filter_map(|(idx, &logit)| {
                let prob = (logit - max_logit).exp() / exp_sum;
                if prob >= self.threshold as f32 {
                    self.label_map.get(&(idx as i64)).map(|tool_id| ToolPrediction {
                        tool_id: tool_id.clone(),
                        confidence: prob as f64,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by confidence descending and take top_k
        predictions.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        predictions.truncate(self.top_k);

        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

        Ok(RouterPredictResult {
            predictions,
            latency_ms,
        })
    }

    /// Get the number of supported tools
    #[napi]
    pub fn get_num_tools(&self) -> u32 {
        self.label_map.len() as u32
    }

    /// Get all tool labels
    #[napi]
    pub fn get_labels(&self) -> Vec<String> {
        self.label_map.values().cloned().collect()
    }

    /// Warmup the model by running a dummy inference
    /// Call this at startup to avoid cold-start latency on first real request
    #[napi]
    pub fn warmup(&self) -> Result<f64> {
        let start = std::time::Instant::now();

        // Run inference with a simple query to warm up the JIT compiler
        let _ = self.predict("hello".to_string())?;

        let warmup_ms = start.elapsed().as_secs_f64() * 1000.0;
        eprintln!("🔥 Router warmup complete in {:.1}ms", warmup_ms);

        Ok(warmup_ms)
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/// Quick prediction without creating a router instance
/// (useful for one-off predictions, but slower due to model loading)
#[napi]
pub fn quick_predict(
    model_path: String,
    tokenizer_path: String,
    label_map_path: String,
    query: String,
) -> Result<RouterPredictResult> {
    let router = OnnxRouter::new(RouterConfig {
        model_path,
        tokenizer_path,
        label_map_path,
        max_length: 128,
        threshold: 0.05,
        top_k: 10,
        num_threads: None, // Auto-detect
    })?;
    router.predict(query)
}
