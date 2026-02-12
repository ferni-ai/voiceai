/// Options for custom voice generation.
#[derive(Debug, Clone, Default)]
pub struct CustomVoiceOptions {
    pub do_sample: Option<bool>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub temperature: Option<f64>,
    pub repetition_penalty: Option<f64>,
    pub subtalker_do_sample: Option<bool>,
    pub subtalker_top_k: Option<usize>,
    pub subtalker_top_p: Option<f64>,
    pub subtalker_temperature: Option<f64>,
    pub max_new_tokens: Option<usize>,
    pub non_streaming_mode: Option<bool>,
}

/// Options for voice design generation.
#[derive(Debug, Clone, Default)]
pub struct VoiceDesignOptions {
    pub do_sample: Option<bool>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub temperature: Option<f64>,
    pub repetition_penalty: Option<f64>,
    pub subtalker_do_sample: Option<bool>,
    pub subtalker_top_k: Option<usize>,
    pub subtalker_top_p: Option<f64>,
    pub subtalker_temperature: Option<f64>,
    pub max_new_tokens: Option<usize>,
    pub non_streaming_mode: Option<bool>,
}

/// Options for voice clone generation.
#[derive(Debug, Clone, Default)]
pub struct VoiceCloneOptions {
    pub do_sample: Option<bool>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub temperature: Option<f64>,
    pub repetition_penalty: Option<f64>,
    pub subtalker_do_sample: Option<bool>,
    pub subtalker_top_k: Option<usize>,
    pub subtalker_top_p: Option<f64>,
    pub subtalker_temperature: Option<f64>,
    pub max_new_tokens: Option<usize>,
    pub non_streaming_mode: Option<bool>,
}
