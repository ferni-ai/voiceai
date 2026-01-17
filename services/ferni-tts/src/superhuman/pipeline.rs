//! Transform Pipeline
//!
//! Orchestrates all superhuman transforms in the correct order.

use super::*;
use crate::ssml::SsmlDocument;
use crate::error::Result;

/// A single transform that can be applied to an SSML document
pub trait Transform: Send + Sync {
    /// Transform name for logging
    fn name(&self) -> &'static str;

    /// Apply the transform to the document
    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()>;

    /// Whether this transform is enabled for the given context
    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        true
    }
}

// Implement Transform for each transform type

impl Transform for CircadianTransform {
    fn name(&self) -> &'static str { "circadian" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        CircadianTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        ctx.user_local_hour.is_some()
    }
}

impl Transform for MemoryProsodyTransform {
    fn name(&self) -> &'static str { "memory_prosody" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        MemoryProsodyTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        !ctx.remembered_entities.is_empty()
    }
}

impl Transform for EmotionalAnticipationTransform {
    fn name(&self) -> &'static str { "emotional_anticipation" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        EmotionalAnticipationTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        ctx.user_emotion.is_some() || ctx.emotional_trajectory.is_some() || ctx.topic_sensitivity.map_or(false, |s| s > 0.5)
    }
}

impl Transform for MeaningfulSilenceTransform {
    fn name(&self) -> &'static str { "meaningful_silence" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        MeaningfulSilenceTransform::apply(self, doc, ctx)
    }
}

impl Transform for RelationshipProsodyTransform {
    fn name(&self) -> &'static str { "relationship_prosody" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        RelationshipProsodyTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        ctx.relationship_stage.is_some()
    }
}

impl Transform for EnergyMatchingTransform {
    fn name(&self) -> &'static str { "energy_matching" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        EnergyMatchingTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        ctx.user_energy.is_some() || ctx.user_speaking_rate.is_some()
    }
}

impl Transform for BackchannelTransform {
    fn name(&self) -> &'static str { "backchannels" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        BackchannelTransform::apply(self, doc, ctx)
    }

    fn is_enabled(&self, ctx: &SuperhumanContext) -> bool {
        self.enabled && ctx.turn_number.unwrap_or(0) >= 2
    }
}

impl Transform for BreathPatternTransform {
    fn name(&self) -> &'static str { "breath_patterns" }

    fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        BreathPatternTransform::apply(self, doc, ctx)
    }
}

/// Transform pipeline that applies multiple transforms in order
pub struct TransformPipeline {
    transforms: Vec<Box<dyn Transform>>,
}

impl Default for TransformPipeline {
    fn default() -> Self {
        Self::new()
    }
}

impl TransformPipeline {
    /// Create a new pipeline with all default transforms
    pub fn new() -> Self {
        Self {
            transforms: vec![
                // Order matters! Apply in this sequence:
                // 1. Content modifications (memory prosody)
                Box::new(MemoryProsodyTransform::default()),
                // 2. Structural modifications (silence, breaths)
                Box::new(MeaningfulSilenceTransform::default()),
                Box::new(BreathPatternTransform::default()),
                // 3. Prosody wrappers (energy, relationship, circadian)
                Box::new(EnergyMatchingTransform::default()),
                Box::new(RelationshipProsodyTransform::default()),
                Box::new(CircadianTransform::default()),
                // 4. Emotional wrapper (outermost)
                Box::new(EmotionalAnticipationTransform::default()),
                // 5. Prefix additions (backchannels)
                Box::new(BackchannelTransform::default()),
            ],
        }
    }

    /// Create a minimal pipeline (just circadian and energy)
    pub fn minimal() -> Self {
        Self {
            transforms: vec![
                Box::new(CircadianTransform::default()),
                Box::new(EnergyMatchingTransform::default()),
            ],
        }
    }

    /// Create a pipeline without backchannels/breaths (for short responses)
    pub fn clean() -> Self {
        Self {
            transforms: vec![
                Box::new(MemoryProsodyTransform::default()),
                Box::new(EnergyMatchingTransform::default()),
                Box::new(RelationshipProsodyTransform::default()),
                Box::new(CircadianTransform::default()),
                Box::new(EmotionalAnticipationTransform::default()),
            ],
        }
    }

    /// Add a custom transform to the pipeline
    pub fn with_transform(mut self, transform: Box<dyn Transform>) -> Self {
        self.transforms.push(transform);
        self
    }

    /// Apply all transforms in order
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<TransformStats> {
        let mut stats = TransformStats::default();

        for transform in &self.transforms {
            if transform.is_enabled(ctx) {
                let start = std::time::Instant::now();
                transform.apply(doc, ctx)?;
                stats.add(transform.name(), start.elapsed());
            } else {
                stats.skipped.push(transform.name().to_string());
            }
        }

        Ok(stats)
    }

    /// Get list of transform names
    pub fn transform_names(&self) -> Vec<&'static str> {
        self.transforms.iter().map(|t| t.name()).collect()
    }
}

/// Statistics about transform execution
#[derive(Debug, Default)]
pub struct TransformStats {
    /// Transforms that were applied with their execution time
    pub applied: Vec<(String, std::time::Duration)>,

    /// Transforms that were skipped (not enabled for context)
    pub skipped: Vec<String>,

    /// Total execution time
    pub total_time: std::time::Duration,
}

impl TransformStats {
    fn add(&mut self, name: &str, duration: std::time::Duration) {
        self.applied.push((name.to_string(), duration));
        self.total_time += duration;
    }

    /// Get total number of transforms applied
    pub fn applied_count(&self) -> usize {
        self.applied.len()
    }

    /// Get total execution time in microseconds
    pub fn total_micros(&self) -> u64 {
        self.total_time.as_micros() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_pipeline_applies_all() {
        let pipeline = TransformPipeline::new();
        let ctx = SuperhumanContext::new()
            .with_user_local_hour(2)
            .with_relationship_stage(0.8)
            .with_user_energy(0.4)
            .with_user_emotion("joy", 0.7);

        let mut doc = parse("<speak>Hello, how are you doing today?</speak>").unwrap();
        let stats = pipeline.apply(&mut doc, &ctx).unwrap();

        println!("Applied transforms: {:?}", stats.applied);
        println!("Skipped transforms: {:?}", stats.skipped);
        println!("Total time: {:?}", stats.total_time);

        assert!(stats.applied_count() > 0, "Should apply some transforms");
    }

    #[test]
    fn test_minimal_pipeline() {
        let pipeline = TransformPipeline::minimal();
        let ctx = SuperhumanContext::new()
            .with_user_local_hour(12)
            .with_user_energy(0.5);

        let mut doc = parse("<speak>Quick response.</speak>").unwrap();
        let stats = pipeline.apply(&mut doc, &ctx).unwrap();

        assert!(stats.applied_count() <= 2, "Minimal pipeline should have few transforms");
    }

    #[test]
    fn test_pipeline_skips_disabled() {
        let pipeline = TransformPipeline::new();
        // Empty context - most transforms should be skipped
        let ctx = SuperhumanContext::new();

        let mut doc = parse("<speak>Test.</speak>").unwrap();
        let stats = pipeline.apply(&mut doc, &ctx).unwrap();

        assert!(!stats.skipped.is_empty(), "Should skip some transforms with empty context");
    }

    #[test]
    fn test_pipeline_preserves_content() {
        let pipeline = TransformPipeline::new();
        let ctx = SuperhumanContext::new()
            .with_user_local_hour(14)
            .with_relationship_stage(0.5);

        let mut doc = parse("<speak>The quick brown fox.</speak>").unwrap();
        pipeline.apply(&mut doc, &ctx).unwrap();

        let text = doc.plain_text();
        assert!(text.contains("quick brown fox"), "Content should be preserved: {}", text);
    }
}
