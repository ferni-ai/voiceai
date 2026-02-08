//! # Superhuman Transform Layer
//!
//! "Better than Human" prosody transformations that make AI voice
//! more empathetic, contextual, and natural than any human could be.
//!
//! ## Eight Core Capabilities
//!
//! 1. **Circadian Tempo** - Adapt speaking speed to user's time of day
//! 2. **Memory Prosody** - Emphasize entities the user has shared before
//! 3. **Emotional Anticipation** - Express emotion before content lands
//! 4. **Meaningful Silence** - Strategic pauses for emotional impact
//! 5. **Relationship Prosody** - Warmer tone with closer relationships
//! 6. **Energy Matching** - Mirror user's detected energy level
//! 7. **Backchannels** - Natural "hmm", "uh-huh" timing
//! 8. **Breath Patterns** - Natural breathing rhythm in speech
//!
//! ## Usage
//!
//! ```rust
//! use ferni_tts::superhuman::{SuperhumanContext, TransformPipeline};
//! use ferni_tts::ssml::SsmlDocument;
//!
//! let mut doc = SsmlDocument::parse("<speak>Hello world</speak>")?;
//! let context = SuperhumanContext::new()
//!     .with_user_local_hour(23) // Late night
//!     .with_relationship_stage(0.8); // Close relationship
//!
//! let pipeline = TransformPipeline::default();
//! pipeline.apply(&mut doc, &context)?;
//! ```

mod circadian;
mod memory_prosody;
mod emotional;
mod silence;
mod relationship;
mod energy;
mod backchannels;
mod breath;
mod pipeline;

pub use circadian::CircadianTransform;
pub use memory_prosody::MemoryProsodyTransform;
pub use emotional::EmotionalAnticipationTransform;
pub use silence::MeaningfulSilenceTransform;
pub use relationship::RelationshipProsodyTransform;
pub use energy::EnergyMatchingTransform;
pub use backchannels::BackchannelTransform;
pub use breath::BreathPatternTransform;
pub use pipeline::{Transform, TransformPipeline};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Context for superhuman transformations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SuperhumanContext {
    // =========================================================================
    // Circadian Context
    // =========================================================================
    /// User's local hour (0-23)
    pub user_local_hour: Option<u8>,

    /// User's timezone (e.g., "America/New_York")
    pub user_timezone: Option<String>,

    /// Is user likely tired? (from conversation analysis)
    pub user_tired: Option<bool>,

    // =========================================================================
    // Memory Context
    // =========================================================================
    /// Entities the user has mentioned (name -> familiarity 0.0-1.0)
    pub remembered_entities: HashMap<String, MemoryEntity>,

    /// Recently mentioned topics for continuity
    pub recent_topics: Vec<String>,

    // =========================================================================
    // Emotional Context
    // =========================================================================
    /// Detected user emotion
    pub user_emotion: Option<String>,

    /// User emotion intensity (0.0-1.0)
    pub user_emotion_intensity: Option<f32>,

    /// Content emotional trajectory (e.g., "building_to_joy")
    pub emotional_trajectory: Option<String>,

    // =========================================================================
    // Relationship Context
    // =========================================================================
    /// Relationship stage (0.0 = stranger, 1.0 = intimate friend)
    pub relationship_stage: Option<f32>,

    /// Number of previous conversations
    pub conversation_count: Option<u32>,

    /// Days since first conversation
    pub relationship_days: Option<u32>,

    // =========================================================================
    // Energy Context
    // =========================================================================
    /// Detected user energy level (0.0-1.0)
    pub user_energy: Option<f32>,

    /// User speaking rate (words per minute)
    pub user_speaking_rate: Option<f32>,

    /// User pitch variance (indicator of engagement)
    pub user_pitch_variance: Option<f32>,

    // =========================================================================
    // Conversation Context
    // =========================================================================
    /// Current turn number in conversation
    pub turn_number: Option<u32>,

    /// Time since user finished speaking (ms)
    pub response_delay_ms: Option<u32>,

    /// Is this a response to a question?
    pub is_response_to_question: Option<bool>,

    /// Detected conversation topic
    pub topic: Option<String>,

    /// Detected topic sensitivity (0.0-1.0)
    pub topic_sensitivity: Option<f32>,
}

impl SuperhumanContext {
    pub fn new() -> Self {
        Self::default()
    }

    /// Builder: Set user's local hour (0-23). Accepts u8 or u32 (clamps to 0-23).
    pub fn with_user_local_hour(mut self, hour: u8) -> Self {
        self.user_local_hour = Some(hour.min(23));
        self
    }

    /// Builder: Set user's timezone
    pub fn with_timezone(mut self, tz: impl Into<String>) -> Self {
        self.user_timezone = Some(tz.into());
        self
    }

    /// Builder: Set relationship stage
    pub fn with_relationship_stage(mut self, stage: f32) -> Self {
        self.relationship_stage = Some(stage.clamp(0.0, 1.0));
        self
    }

    /// Builder: Set user energy
    pub fn with_user_energy(mut self, energy: f32) -> Self {
        self.user_energy = Some(energy.clamp(0.0, 1.0));
        self
    }

    /// Builder: Add remembered entity
    pub fn with_entity(mut self, name: impl Into<String>, entity: MemoryEntity) -> Self {
        self.remembered_entities.insert(name.into(), entity);
        self
    }

    /// Builder: Set topic sensitivity only
    pub fn with_topic_sensitivity(mut self, sensitivity: f32) -> Self {
        self.topic_sensitivity = Some(sensitivity.clamp(0.0, 1.0));
        self
    }

    /// Builder: Set turn number
    pub fn with_turn_number(mut self, turn: u32) -> Self {
        self.turn_number = Some(turn);
        self
    }

    /// Builder: Set user speaking rate (words per minute)
    pub fn with_user_speaking_rate(mut self, rate: f32) -> Self {
        self.user_speaking_rate = Some(rate);
        self
    }

    /// Builder: Add remembered entity from (name, entity_type, familiarity, emotional_valence)
    pub fn with_remembered_entity(
        mut self,
        name: impl Into<String>,
        entity_type: impl Into<String>,
        familiarity: f32,
        emotional_valence: Option<f32>,
    ) -> Self {
        let entity = MemoryEntity {
            entity_type: entity_type.into(),
            familiarity: familiarity.clamp(0.0, 1.0),
            emotional_valence,
            last_mentioned: None,
            relationship: None,
        };
        self.remembered_entities.insert(name.into(), entity);
        self
    }

    /// Builder: Set user emotion
    pub fn with_user_emotion(mut self, emotion: impl Into<String>, intensity: f32) -> Self {
        self.user_emotion = Some(emotion.into());
        self.user_emotion_intensity = Some(intensity.clamp(0.0, 1.0));
        self
    }

    /// Builder: Set emotional trajectory
    pub fn with_emotional_trajectory(mut self, trajectory: impl Into<String>) -> Self {
        self.emotional_trajectory = Some(trajectory.into());
        self
    }

    /// Builder: Set topic and sensitivity
    pub fn with_topic(mut self, topic: impl Into<String>, sensitivity: f32) -> Self {
        self.topic = Some(topic.into());
        self.topic_sensitivity = Some(sensitivity.clamp(0.0, 1.0));
        self
    }

    /// Calculate circadian tempo multiplier (0.85-1.1)
    pub fn circadian_tempo(&self) -> f32 {
        circadian::calculate_tempo_multiplier(self)
    }

    /// Check if late night mode (slower, gentler)
    pub fn is_late_night(&self) -> bool {
        self.user_local_hour.map_or(false, |h| h >= 22 || h <= 5)
    }

    /// Check if this is an early relationship
    pub fn is_early_relationship(&self) -> bool {
        self.relationship_stage.map_or(true, |s| s < 0.3)
    }
}

/// A remembered entity with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntity {
    /// Entity type (person, place, event, etc.)
    pub entity_type: String,

    /// How often this has been mentioned (0.0-1.0)
    pub familiarity: f32,

    /// Emotional valence associated (-1.0 to 1.0)
    pub emotional_valence: Option<f32>,

    /// Last mention timestamp
    pub last_mentioned: Option<u64>,

    /// Relationship to user (for people)
    pub relationship: Option<String>,
}

impl MemoryEntity {
    pub fn person(familiarity: f32) -> Self {
        Self {
            entity_type: "person".to_string(),
            familiarity: familiarity.clamp(0.0, 1.0),
            emotional_valence: None,
            last_mentioned: None,
            relationship: None,
        }
    }

    pub fn with_relationship(mut self, rel: impl Into<String>) -> Self {
        self.relationship = Some(rel.into());
        self
    }

    pub fn with_valence(mut self, valence: f32) -> Self {
        self.emotional_valence = Some(valence.clamp(-1.0, 1.0));
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_builder() {
        let ctx = SuperhumanContext::new()
            .with_user_local_hour(23)
            .with_relationship_stage(0.8)
            .with_user_energy(0.4);

        assert_eq!(ctx.user_local_hour, Some(23));
        assert_eq!(ctx.relationship_stage, Some(0.8));
        assert_eq!(ctx.user_energy, Some(0.4));
        assert!(ctx.is_late_night());
    }

    #[test]
    fn test_memory_entity() {
        let entity = MemoryEntity::person(0.8)
            .with_relationship("sister")
            .with_valence(0.7);

        assert_eq!(entity.entity_type, "person");
        assert_eq!(entity.familiarity, 0.8);
        assert_eq!(entity.relationship, Some("sister".to_string()));
        assert_eq!(entity.emotional_valence, Some(0.7));
    }
}
