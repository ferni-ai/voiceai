//! Model loading: LM, Mimi codec, SentencePiece tokenizer.
//!
//! Supports loading from:
//! 1. Local file paths (--lm-model-file, --mimi-model-file, --tokenizer-file)
//! 2. HuggingFace repos (auto-download via hf-hub)

use crate::config::{BridgeConfig, STT_MIMI_CODEBOOKS, TTS_MIMI_CODEBOOKS};
use crate::error::{BridgeError, Result};
use candle_core::{DType, Device};
use moshi::lm::LmModel;
use moshi::mimi::Mimi;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::info;

/// Resolved file paths for model loading.
pub struct ModelPaths {
    pub lm_model_file: PathBuf,
    pub mimi_model_file: PathBuf,
    pub tokenizer_file: PathBuf,
}

/// Separate model paths for STT and TTS (they may use different repos/models).
pub struct SplitModelPaths {
    pub stt: ModelPaths,
    pub tts: ModelPaths,
}

/// Select the best available compute device.
pub fn select_device(force_cpu: bool) -> Result<Device> {
    if force_cpu {
        info!("Using CPU (forced)");
        return Ok(Device::Cpu);
    }
    if candle_core::utils::cuda_is_available() {
        info!("Using CUDA GPU");
        return Device::new_cuda(0).map_err(|e| BridgeError::ModelLoad(format!("CUDA init: {e}")));
    }
    if candle_core::utils::metal_is_available() {
        info!("Using Metal GPU (Apple Silicon)");
        return Device::new_metal(0)
            .map_err(|e| BridgeError::ModelLoad(format!("Metal init: {e}")));
    }
    info!("No GPU available, using CPU");
    Ok(Device::Cpu)
}

/// Select dtype based on device. CUDA and Metal both support BF16 for halved memory.
pub fn select_dtype(device: &Device) -> DType {
    if device.is_cuda() || device.is_metal() {
        DType::BF16
    } else {
        DType::F32
    }
}

/// Resolve model paths from a specific HuggingFace repo.
async fn resolve_repo_model_paths(
    hf_repo_id: &str,
    use_gguf: bool,
    local_lm: Option<&str>,
    local_mimi: Option<&str>,
    local_tok: Option<&str>,
    label: &str,
) -> Result<ModelPaths> {
    // If all local paths are provided, use them directly
    if let (Some(lm), Some(mimi), Some(tok)) = (local_lm, local_mimi, local_tok) {
        info!(label, "Using local model files");
        return Ok(ModelPaths {
            lm_model_file: PathBuf::from(lm),
            mimi_model_file: PathBuf::from(mimi),
            tokenizer_file: PathBuf::from(tok),
        });
    }

    info!(repo = %hf_repo_id, label, "Downloading model files from HuggingFace");
    let api = hf_hub::api::tokio::ApiBuilder::from_env()
        .build()
        .map_err(|e| BridgeError::Download(format!("HF API init: {e}")))?;
    let repo = api.model(hf_repo_id.to_string());

    // Resolve mimi and tokenizer filenames from config.json
    let (mimi_name, tok_name): (String, String) = match repo.get("config.json").await {
        Ok(config_path) => {
            let config_json: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&config_path)?)
                    .map_err(|e| BridgeError::Config(format!("Parse config.json: {e}")))?;
            let mimi = config_json["mimi_name"]
                .as_str()
                .unwrap_or("tokenizer-e351c8d8-checkpoint125.safetensors")
                .to_string();
            let tok = config_json["tokenizer_name"]
                .as_str()
                .unwrap_or("tokenizer_spm_32k_3.model")
                .to_string();
            (mimi, tok)
        }
        Err(_) => (
            "tokenizer-e351c8d8-checkpoint125.safetensors".to_string(),
            "tokenizer_spm_32k_3.model".to_string(),
        ),
    };

    let lm_model_file = if let Some(lm) = local_lm {
        PathBuf::from(lm)
    } else if use_gguf {
        let lm = repo.get("model.q8.gguf").await;
        match lm {
            Ok(p) => p,
            Err(_) => repo
                .get("model.gguf")
                .await
                .map_err(|e| BridgeError::Download(format!("{label} LM GGUF download: {e}")))?,
        }
    } else {
        repo.get("model.safetensors")
            .await
            .map_err(|e| BridgeError::Download(format!("{label} LM download: {e}")))?
    };

    let mimi_model_file = if let Some(mimi) = local_mimi {
        PathBuf::from(mimi)
    } else {
        repo.get(&mimi_name)
            .await
            .map_err(|e| BridgeError::Download(format!("{label} Mimi download: {e}")))?
    };

    let tokenizer_file = if let Some(tok) = local_tok {
        PathBuf::from(tok)
    } else {
        repo.get(&tok_name)
            .await
            .map_err(|e| BridgeError::Download(format!("{label} Tokenizer download: {e}")))?
    };

    info!(
        lm = %lm_model_file.display(),
        mimi = %mimi_model_file.display(),
        tokenizer = %tokenizer_file.display(),
        label,
        "Model files resolved"
    );

    Ok(ModelPaths {
        lm_model_file,
        mimi_model_file,
        tokenizer_file,
    })
}

/// Resolve separate model paths for STT and TTS from their respective repos.
pub async fn resolve_split_model_paths(config: &BridgeConfig) -> Result<SplitModelPaths> {
    let stt_repo = &config.stt_repo;
    let tts_repo = &config.moshi_repo;

    // If STT and TTS repos differ, download separately
    if stt_repo != tts_repo {
        info!(stt = %stt_repo, tts = %tts_repo, "Using separate STT and TTS model repos");
        let (stt_paths, tts_paths) = tokio::try_join!(
            resolve_repo_model_paths(stt_repo, config.use_gguf, None, None, None, "STT"),
            resolve_repo_model_paths(tts_repo, config.use_gguf, config.lm_model_file.as_deref(), config.mimi_model_file.as_deref(), config.tokenizer_file.as_deref(), "TTS"),
        )?;
        Ok(SplitModelPaths { stt: stt_paths, tts: tts_paths })
    } else {
        // Same repo for both — use shared paths
        let paths = resolve_repo_model_paths(
            tts_repo, config.use_gguf,
            config.lm_model_file.as_deref(), config.mimi_model_file.as_deref(), config.tokenizer_file.as_deref(),
            "STT+TTS",
        ).await?;
        // Clone paths for both
        let stt = ModelPaths {
            lm_model_file: paths.lm_model_file.clone(),
            mimi_model_file: paths.mimi_model_file.clone(),
            tokenizer_file: paths.tokenizer_file.clone(),
        };
        Ok(SplitModelPaths { stt, tts: paths })
    }
}

/// Resolve STT-only model paths (skip TTS repo download to save time and bandwidth).
pub async fn resolve_stt_only_paths(config: &BridgeConfig) -> Result<SplitModelPaths> {
    let stt_repo = &config.stt_repo;
    info!(stt = %stt_repo, "STT-only mode: resolving STT model paths only");
    let stt_paths = resolve_repo_model_paths(stt_repo, config.use_gguf, None, None, None, "STT").await?;
    // Dummy TTS paths — won't be used since stt_only skips TTS loading
    let tts = ModelPaths {
        lm_model_file: PathBuf::from("/dev/null"),
        mimi_model_file: PathBuf::from("/dev/null"),
        tokenizer_file: PathBuf::from("/dev/null"),
    };
    Ok(SplitModelPaths { stt: stt_paths, tts })
}

/// Download model files from HuggingFace if not provided locally.
/// (Legacy: uses single repo for both STT and TTS)
pub async fn resolve_model_paths(config: &BridgeConfig) -> Result<ModelPaths> {
    // If all local paths are provided, use them directly
    if let (Some(lm), Some(mimi), Some(tok)) = (
        &config.lm_model_file,
        &config.mimi_model_file,
        &config.tokenizer_file,
    ) {
        info!("Using local model files");
        return Ok(ModelPaths {
            lm_model_file: PathBuf::from(lm),
            mimi_model_file: PathBuf::from(mimi),
            tokenizer_file: PathBuf::from(tok),
        });
    }

    // Download from HuggingFace. Use moshi_repo (default: moshiko-candle-bf16) which has
    // model.safetensors; moshiko-candle-q8 only has model.q8.gguf.
    let hf_repo = config.moshi_repo.clone();
    info!(repo = %hf_repo, "Downloading model files from HuggingFace");
    let api = hf_hub::api::tokio::ApiBuilder::from_env()
        .build()
        .map_err(|e| BridgeError::Download(format!("HF API init: {e}")))?;
    let repo = api.model(hf_repo);

    // Resolve mimi and tokenizer filenames: use config.json if present, else fallbacks.
    let (mimi_name, tok_name): (String, String) = match repo.get("config.json").await {
        Ok(config_path) => {
            let config_json: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&config_path)?)
                    .map_err(|e| BridgeError::Config(format!("Parse config.json: {e}")))?;
            let mimi = config_json["mimi_name"]
                .as_str()
                .unwrap_or("tokenizer-e351c8d8-checkpoint125.safetensors")
                .to_string();
            let tok = config_json["tokenizer_name"]
                .as_str()
                .unwrap_or("tokenizer_spm_32k_3.model")
                .to_string();
            (mimi, tok)
        }
        Err(_) => (
            "tokenizer-e351c8d8-checkpoint125.safetensors".to_string(),
            "tokenizer_spm_32k_3.model".to_string(),
        ),
    };

    let lm_model_file = if let Some(lm) = &config.lm_model_file {
        PathBuf::from(lm)
    } else if config.use_gguf {
        // moshiko-candle-q8 and similar repos have model.q8.gguf (~4GB); safetensors not present.
        let lm = repo.get("model.q8.gguf").await;
        let lm_model_file = match lm {
            Ok(p) => p,
            Err(_) => repo
                .get("model.gguf")
                .await
                .map_err(|e| BridgeError::Download(format!("LM GGUF download: {e}")))?,
        };
        lm_model_file
    } else {
        repo.get("model.safetensors")
            .await
            .map_err(|e| BridgeError::Download(format!("LM download: {e}")))?
    };

    let mimi_model_file = if let Some(mimi) = &config.mimi_model_file {
        PathBuf::from(mimi)
    } else {
        repo.get(&mimi_name)
            .await
            .map_err(|e| BridgeError::Download(format!("Mimi download: {e}")))?
    };

    let tokenizer_file = if let Some(tok) = &config.tokenizer_file {
        PathBuf::from(tok)
    } else {
        repo.get(&tok_name)
            .await
            .map_err(|e| BridgeError::Download(format!("Tokenizer download: {e}")))?
    };

    info!(
        lm = %lm_model_file.display(),
        mimi = %mimi_model_file.display(),
        tokenizer = %tokenizer_file.display(),
        "Model files resolved"
    );

    Ok(ModelPaths {
        lm_model_file,
        mimi_model_file,
        tokenizer_file,
    })
}

/// Loaded STT models, ready for inference.
/// Tokenizer is behind Arc because SentencePieceProcessor doesn't impl Clone.
pub struct SttModels {
    pub lm: LmModel,
    pub mimi: Mimi,
    pub tokenizer: Arc<sentencepiece::SentencePieceProcessor>,
    pub device: Device,
}

/// Loaded TTS models, ready for inference.
/// Tokenizer is behind Arc because SentencePieceProcessor doesn't impl Clone.
pub struct TtsModels {
    pub lm: LmModel,
    pub mimi: Mimi,
    pub tokenizer: Arc<sentencepiece::SentencePieceProcessor>,
    pub device: Device,
}

/// Loaded full-duplex STS model (load_streaming_both_ways). Bidirectional audio; target ~160ms.
#[allow(dead_code)] // mimi/tokenizer used when bidirectional inference loop is implemented
pub struct FullDuplexModels {
    pub lm: LmModel,
    pub mimi: Mimi,
    pub tokenizer: Arc<sentencepiece::SentencePieceProcessor>,
    pub device: Device,
}

/// GGUF loading is not yet supported by the moshi crate (safetensors only). Path resolution is in place for when upstream adds VarBuilder/GGUF support.
fn ensure_not_gguf(lm_path: &str) -> Result<()> {
    if lm_path.ends_with(".gguf") {
        return Err(BridgeError::ModelLoad(
            "GGUF loading not yet supported: moshi crate only loads safetensors. \
             Use moshiko-candle-bf16 (KYUTAI_MOSHI_REPO=kyutai/moshiko-candle-bf16) or \
             set KYUTAI_USE_GGUF=false. GGUF path resolution is ready for when moshi adds VarBuilder/GGUF support."
                .into(),
        ));
    }
    Ok(())
}

/// Build a custom ASR config for the stt-1b-en_fr model (text_card=8000, dim=2048, 16 layers).
/// Same architecture as asr_v0_1_1b but with smaller tokenizer vocab (8001 vs 48001).
fn stt_1b_8k_config() -> moshi::lm::Config {
    let mut cfg = moshi::lm::Config::asr_v0_1_1b();
    cfg.text_in_vocab_size = 8001;
    cfg.text_out_vocab_size = 8000;
    cfg
}

/// Load STT models (LM in ASR mode + Mimi + tokenizer).
pub fn load_stt_models(paths: &ModelPaths, device: &Device) -> Result<SttModels> {
    let dtype = select_dtype(device);
    let lm_path = paths.lm_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 LM model path".into()))?;
    let mimi_path = paths.mimi_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 Mimi model path".into()))?;
    let tok_path = paths.tokenizer_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 tokenizer path".into()))?;

    ensure_not_gguf(lm_path)?;
    info!(dtype = ?dtype, device = ?device, "Loading STT LM model");
    // load_asr uses asr_v0_1_1b (48001×2048). moshiko-candle-bf16 is full 7B (32001×4096).
    // stt-1b-en_fr has 8001×2048 (smaller tokenizer vocab).
    // We try in order: asr_v0_1_1b → stt_1b_8k → v0_1_asr (7B fallback).
    let lm = match moshi::lm::load_asr(lm_path, dtype, device) {
        Ok(m) => m,
        Err(e) => {
            let err_str = e.to_string();
            // Detect stt-1b-en_fr model (8001×2048 vocab, same 2048 dim architecture)
            if err_str.contains("8001") && err_str.contains("2048") {
                info!("STT: stt-1b-en_fr model detected (8001×2048), using custom 8k config");
                moshi::lm::load_lm_model(
                    stt_1b_8k_config(),
                    lm_path,
                    dtype,
                    device,
                )
                .map_err(|e2| BridgeError::ModelLoad(format!("STT LM (1B-8k): {e2}")))?
            }
            // Detect 7B moshiko model (32001 vocab, 4096 dim)
            else if (err_str.contains("32001") && err_str.contains("4096"))
                || (err_str.contains("size mismatch") && (err_str.contains("32001") || err_str.contains("4096")))
            {
                info!("STT: 7B model detected (32001×4096), using v0_1_asr config");
                moshi::lm::load_lm_model(
                    moshi::lm::Config::v0_1_asr(),
                    lm_path,
                    dtype,
                    device,
                )
                .map_err(|e2| BridgeError::ModelLoad(format!("STT LM (7B): {e2}")))?
            } else {
                return Err(BridgeError::ModelLoad(format!("STT LM: {e}")));
            }
        }
    };

    info!("Loading STT Mimi codec");
    let mimi = moshi::mimi::load(mimi_path, Some(STT_MIMI_CODEBOOKS), device)
        .map_err(|e| BridgeError::ModelLoad(format!("STT Mimi: {e}")))?;

    info!("Loading text tokenizer");
    let tokenizer = sentencepiece::SentencePieceProcessor::open(tok_path)
        .map_err(|e| BridgeError::ModelLoad(format!("Tokenizer: {e}")))?;

    Ok(SttModels {
        lm,
        mimi,
        tokenizer: Arc::new(tokenizer),
        device: device.clone(),
    })
}

/// Load TTS models (LM in streaming mode + Mimi + tokenizer).
pub fn load_tts_models(paths: &ModelPaths, device: &Device) -> Result<TtsModels> {
    let dtype = select_dtype(device);
    let lm_path = paths.lm_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 LM model path".into()))?;
    let mimi_path = paths.mimi_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 Mimi model path".into()))?;
    let tok_path = paths.tokenizer_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 tokenizer path".into()))?;

    ensure_not_gguf(lm_path)?;
    info!(dtype = ?dtype, device = ?device, "Loading TTS LM model");
    // load_streaming uses v0_1_streaming(8) (32001 vocab, 4096 dim). 7B weights match that.
    // If we get shape mismatch (e.g. 2B model 2048 dim), fall back to tts_v0_1().
    let lm = match moshi::lm::load_streaming(lm_path, dtype, device) {
        Ok(m) => m,
        Err(e) => {
            let err_str = e.to_string();
            // Match specific vocab/shape mismatch: 2B model has 2048 dim vs 7B 4096 dim
            let is_vocab_mismatch = err_str.contains("32001") || err_str.contains("2048") || err_str.contains("4096");
            let is_shape_err = err_str.contains("size mismatch") || err_str.contains("doesn't match")
                || (err_str.contains("expected") && err_str.contains("got"));
            if is_vocab_mismatch || is_shape_err {
                info!("TTS: shape mismatch with load_streaming, trying tts_v0_1 config (2B / 32001 vocab)");
                moshi::lm::load_lm_model(
                    moshi::lm::Config::tts_v0_1(),
                    lm_path,
                    dtype,
                    device,
                )
                .map_err(|e2| BridgeError::ModelLoad(format!("TTS LM (fallback): {e2}")))?
            } else {
                return Err(BridgeError::ModelLoad(format!("TTS LM: {e}")));
            }
        }
    };

    info!("Loading TTS Mimi codec");
    let mimi = moshi::mimi::load(mimi_path, Some(TTS_MIMI_CODEBOOKS), device)
        .map_err(|e| BridgeError::ModelLoad(format!("TTS Mimi: {e}")))?;

    info!("Loading text tokenizer");
    let tokenizer = sentencepiece::SentencePieceProcessor::open(tok_path)
        .map_err(|e| BridgeError::ModelLoad(format!("Tokenizer: {e}")))?;

    Ok(TtsModels {
        lm,
        mimi,
        tokenizer: Arc::new(tokenizer),
        device: device.clone(),
    })
}

/// Load full-duplex STS model (load_streaming_both_ways). Single LM for bidirectional audio; target ~160ms.
pub fn load_full_duplex_models(paths: &ModelPaths, device: &Device) -> Result<FullDuplexModels> {
    let dtype = select_dtype(device);
    let lm_path = paths.lm_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 LM model path".into()))?;
    let mimi_path = paths.mimi_model_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 Mimi model path".into()))?;
    let tok_path = paths.tokenizer_file.to_str()
        .ok_or_else(|| BridgeError::Config("Non-UTF-8 tokenizer path".into()))?;

    ensure_not_gguf(lm_path)?;
    info!(dtype = ?dtype, device = ?device, "Loading full-duplex STS LM (load_streaming_both_ways)");
    let lm = moshi::lm::load_streaming_both_ways(lm_path, dtype, device)
        .map_err(|e| BridgeError::ModelLoad(format!("Full-duplex LM: {e}")))?;

    // Full-duplex needs Mimi with STT codebooks (32) for encoding user audio;
    // TTS codebooks (8) are a subset used during decode.
    info!("Loading full-duplex Mimi codec (STT codebooks for bidirectional)");
    let mimi = moshi::mimi::load(mimi_path, Some(STT_MIMI_CODEBOOKS), device)
        .map_err(|e| BridgeError::ModelLoad(format!("Full-duplex Mimi: {e}")))?;

    info!("Loading text tokenizer");
    let tokenizer = sentencepiece::SentencePieceProcessor::open(tok_path)
        .map_err(|e| BridgeError::ModelLoad(format!("Tokenizer: {e}")))?;

    Ok(FullDuplexModels {
        lm,
        mimi,
        tokenizer: Arc::new(tokenizer),
        device: device.clone(),
    })
}

/// Warm up models with a dummy forward pass (avoids cold-start latency on first request).
pub fn warmup_models(stt: &SttModels, tts: &TtsModels) -> Result<()> {
    use crate::config::{ASR_DELAY_IN_TOKENS, ASR_TEMPERATURE};

    // Warm up the full ASR step_pcm path — this is what actually runs during STT.
    // Without this, the first real inference triggers Metal kernel JIT (~6s penalty).
    info!("Warming up STT ASR pipeline (step_pcm path)");
    {
        let lm = stt.lm.clone();
        let mimi = stt.mimi.clone();
        let mut asr_state = moshi::asr::State::new(1, ASR_DELAY_IN_TOKENS, ASR_TEMPERATURE, mimi, lm)
            .map_err(|e| BridgeError::Inference(format!("ASR state init: {e}")))?;

        // Run 3 step_pcm calls with silence to compile all Metal kernels
        let mimi_config = stt.mimi.config();
        let frame_length = (mimi_config.sample_rate / mimi_config.frame_rate).ceil() as usize;
        for i in 0..3 {
            let fake_pcm = candle_core::Tensor::zeros(
                (1, 1, frame_length),
                candle_core::DType::F32,
                &stt.device,
            )?;
            let _ = asr_state.step_pcm(fake_pcm, None, &().into(), |_, _, _| {})
                .map_err(|e| BridgeError::Inference(format!("ASR warmup step {i}: {e}")))?;
        }
    }

    info!("Warming up Mimi codec (encode+decode)");
    {
        let mut mimi = stt.mimi.clone();
        let config = mimi.config();
        let frame_length = (config.sample_rate / config.frame_rate).ceil() as usize;
        let fake_pcm = candle_core::Tensor::zeros(
            (1, 1, frame_length),
            candle_core::DType::F32,
            &stt.device,
        )?;
        let codes = mimi
            .encode_step(&fake_pcm.into(), &().into())
            .map_err(|e| BridgeError::Inference(format!("Mimi encode warmup: {e}")))?;
        let _ys = mimi
            .decode_step(&codes, &().into())
            .map_err(|e| BridgeError::Inference(format!("Mimi decode warmup: {e}")))?;
    }

    info!("Warming up TTS model");
    {
        let mut lm = tts.lm.clone();
        let codebooks = lm.in_audio_codebooks();
        let (_v, ys) = lm
            .forward(None, vec![None; codebooks], &().into())
            .map_err(|e| BridgeError::Inference(format!("TTS warmup LM forward: {e}")))?;
        let mut lp = candle_transformers::generation::LogitsProcessor::new(42, None, None);
        let _ = lm
            .depformer_sample(&ys, None, &[], &mut lp)
            .map_err(|e| BridgeError::Inference(format!("TTS warmup depformer: {e}")))?;
    }

    stt.device.synchronize()?;
    tts.device.synchronize()?;
    info!("Model warmup complete");
    Ok(())
}

/// Warm up STT-only (no TTS models needed). Same ASR pipeline warmup as warmup_models.
pub fn warmup_stt_only(stt: &SttModels) -> Result<()> {
    use crate::config::{ASR_DELAY_IN_TOKENS, ASR_TEMPERATURE};

    info!("Warming up STT ASR pipeline (stt-only mode)");
    {
        let lm = stt.lm.clone();
        let mimi = stt.mimi.clone();
        let mut asr_state = moshi::asr::State::new(1, ASR_DELAY_IN_TOKENS, ASR_TEMPERATURE, mimi, lm)
            .map_err(|e| BridgeError::Inference(format!("ASR state init: {e}")))?;

        let mimi_config = stt.mimi.config();
        let frame_length = (mimi_config.sample_rate / mimi_config.frame_rate).ceil() as usize;
        for i in 0..3 {
            let fake_pcm = candle_core::Tensor::zeros(
                (1, 1, frame_length),
                candle_core::DType::F32,
                &stt.device,
            )?;
            let _ = asr_state.step_pcm(fake_pcm, None, &().into(), |_, _, _| {})
                .map_err(|e| BridgeError::Inference(format!("ASR warmup step {i}: {e}")))?;
        }
    }

    info!("Warming up Mimi codec (encode+decode)");
    {
        let mut mimi = stt.mimi.clone();
        let config = mimi.config();
        let frame_length = (config.sample_rate / config.frame_rate).ceil() as usize;
        let fake_pcm = candle_core::Tensor::zeros(
            (1, 1, frame_length),
            candle_core::DType::F32,
            &stt.device,
        )?;
        let codes = mimi
            .encode_step(&fake_pcm.into(), &().into())
            .map_err(|e| BridgeError::Inference(format!("Mimi encode warmup: {e}")))?;
        let _ys = mimi
            .decode_step(&codes, &().into())
            .map_err(|e| BridgeError::Inference(format!("Mimi decode warmup: {e}")))?;
    }

    stt.device.synchronize()?;
    info!("STT-only warmup complete");
    Ok(())
}

/// Warm up full-duplex model with a dummy forward pass.
pub fn warmup_full_duplex_models(fd: &FullDuplexModels) -> Result<()> {
    info!("Warming up full-duplex STS model");
    let mut lm = fd.lm.clone();
    let codebooks = lm.in_audio_codebooks();
    let (_v, ys) = lm
        .forward(None, vec![None; codebooks], &().into())
        .map_err(|e| BridgeError::Inference(format!("Full-duplex warmup LM forward: {e}")))?;
    let mut lp = candle_transformers::generation::LogitsProcessor::new(42, None, None);
    let _ = lm
        .depformer_sample(&ys, None, &[], &mut lp)
        .map_err(|e| BridgeError::Inference(format!("Full-duplex warmup depformer: {e}")))?;
    fd.device.synchronize()?;
    info!("Full-duplex model warmup complete");
    Ok(())
}
