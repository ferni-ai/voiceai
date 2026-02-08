//! HF safetensors → MLX weight key mapping + MoE expert stacking.
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/convert_weights.py`.
//!
//! Key tasks:
//! 1. Map HF weight names to our module names.
//! 2. Stack MoE expert weights: `experts.0..N.{proj}.weight` → `switch_mlp.{proj}.weight` (stacked).
//! 3. Validate all experts exist before stacking (fix from Python audit).

use std::collections::HashMap;

use mlx_rs::{ops, Array};
use tracing::{info, warn};

/// Stack MoE expert weights from HF format to switch_mlp format.
///
/// HF format: `model.layers.{L}.mlp.experts.{E}.{proj}.weight`
/// MLX format: `model.layers.{L}.mlp.switch_mlp.{proj}.weight` (stacked on axis 0)
///
/// Returns the modified weights dict.
pub fn stack_moe_experts(
    mut weights: HashMap<String, Array>,
    num_hidden_layers: usize,
    num_experts: usize,
) -> anyhow::Result<HashMap<String, Array>> {
    // Check if HF MoE layout exists
    let test_key = "model.layers.0.mlp.experts.0.up_proj.weight";
    if !weights.contains_key(test_key) {
        info!("No HF MoE expert keys found, skipping stacking");
        return Ok(weights);
    }

    info!(
        "Stacking MoE experts: {} layers × {} experts",
        num_hidden_layers, num_experts
    );

    for layer_idx in 0..num_hidden_layers {
        let prefix = format!("model.layers.{}.mlp", layer_idx);

        for proj in &["up_proj", "down_proj", "gate_proj"] {
            for suffix in &["weight", "scales", "biases"] {
                let first_key = format!("{prefix}.experts.0.{proj}.{suffix}");
                if !weights.contains_key(&first_key) {
                    continue;
                }

                // CRITICAL FIX from Python audit:
                // Validate ALL experts exist before stacking
                let mut all_present = true;
                for e in 0..num_experts {
                    let key = format!("{prefix}.experts.{e}.{proj}.{suffix}");
                    if !weights.contains_key(&key) {
                        warn!(
                            "Missing expert weight: {key} — cannot stack layer {layer_idx} {proj}.{suffix}"
                        );
                        all_present = false;
                        break;
                    }
                }

                if !all_present {
                    anyhow::bail!(
                        "Missing experts for layer {layer_idx} {proj}.{suffix}. \
                         Expected {num_experts} experts but not all found."
                    );
                }

                // Collect and stack all expert weights
                // Build new dict entries without mutating during iteration
                let expert_weights: Vec<Array> = (0..num_experts)
                    .map(|e| {
                        let key = format!("{prefix}.experts.{e}.{proj}.{suffix}");
                        weights.remove(&key).expect("validated above")
                    })
                    .collect();

                // Stack: (E, out_dims, in_dims)
                let refs: Vec<&Array> = expert_weights.iter().collect();
                let stacked = ops::stack_axis(&refs, 0)?;

                // Verify shape
                let expected_experts = stacked.shape()[0] as usize;
                if expected_experts != num_experts {
                    anyhow::bail!(
                        "Stacked shape mismatch for layer {layer_idx} {proj}.{suffix}: \
                         got {} experts, expected {}",
                        expected_experts,
                        num_experts
                    );
                }

                let new_key = format!("{prefix}.switch_mlp.{proj}.{suffix}");
                info!(
                    "  Stacked {new_key}: {:?}",
                    stacked.shape()
                );
                weights.insert(new_key, stacked);
            }
        }
    }

    info!("MoE expert stacking complete");
    Ok(weights)
}

/// Map HF weight key names to our module names.
/// Main patterns:
/// - `thinker.model.*` → `model.*` (we store thinker as model)
/// - `talker.*` → `talker.*` (keep as-is)
/// - `code2wav.*` → `code2wav.*` (keep as-is)
/// - `audio_encoder.*` → `audio_encoder.*` (keep as-is)
pub fn map_weight_keys(weights: HashMap<String, Array>) -> HashMap<String, Array> {
    let mut mapped = HashMap::new();
    for (key, value) in weights {
        let new_key = if key.starts_with("thinker.") {
            // Strip "thinker." prefix — our ThinkerModel is at root
            key.strip_prefix("thinker.").unwrap().to_string()
        } else {
            key
        };
        mapped.insert(new_key, value);
    }
    mapped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_weight_keys() {
        let mut weights = HashMap::new();
        weights.insert(
            "thinker.model.layers.0.self_attn.q_proj.weight".to_string(),
            Array::from_f32(1.0),
        );
        weights.insert(
            "talker.input_proj.weight".to_string(),
            Array::from_f32(2.0),
        );

        let mapped = map_weight_keys(weights);
        assert!(mapped.contains_key("model.layers.0.self_attn.q_proj.weight"));
        assert!(mapped.contains_key("talker.input_proj.weight"));
    }
}
