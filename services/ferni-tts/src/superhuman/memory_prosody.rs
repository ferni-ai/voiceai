//! Memory Prosody Transform
//!
//! Emphasizes entities that the user has shared before.
//! Creates the "they remember!" feeling.
//!
//! Examples:
//! - "Your *sister* Sarah" (emphasis on relationship)
//! - "That trip to *Barcelona*" (emphasis on place)
//! - "Your goal of *running a marathon*" (emphasis on aspiration)

use super::{SuperhumanContext, MemoryEntity};
use crate::ssml::{SsmlDocument, SsmlElement, EmphasisLevel, FerniEmotionType, MemoryEntityType};
use crate::error::Result;
use std::collections::HashMap;

/// Memory prosody transform
pub struct MemoryProsodyTransform {
    /// Minimum familiarity to apply emphasis (0.0-1.0)
    pub min_familiarity: f32,

    /// Whether to add Ferni memory markers
    pub add_ferni_markers: bool,
}

impl Default for MemoryProsodyTransform {
    fn default() -> Self {
        Self {
            min_familiarity: 0.3,
            add_ferni_markers: true,
        }
    }
}

impl MemoryProsodyTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply memory prosody to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        if ctx.remembered_entities.is_empty() {
            return Ok(());
        }

        // Process each element
        doc.elements = self.process_elements(&doc.elements, &ctx.remembered_entities);

        Ok(())
    }

    fn process_elements(
        &self,
        elements: &[SsmlElement],
        entities: &HashMap<String, MemoryEntity>,
    ) -> Vec<SsmlElement> {
        let mut result = Vec::new();

        for element in elements {
            match element {
                SsmlElement::Text(text) => {
                    result.extend(self.process_text(text, entities));
                }
                // Recursively process elements with children
                SsmlElement::Prosody { rate, pitch, volume, contour, range, duration, children } => {
                    result.push(SsmlElement::Prosody {
                        rate: rate.clone(),
                        pitch: pitch.clone(),
                        volume: volume.clone(),
                        contour: contour.clone(),
                        range: range.clone(),
                        duration: duration.clone(),
                        children: self.process_elements(children, entities),
                    });
                }
                SsmlElement::Sentence { children } => {
                    result.push(SsmlElement::Sentence {
                        children: self.process_elements(children, entities),
                    });
                }
                SsmlElement::Paragraph { children } => {
                    result.push(SsmlElement::Paragraph {
                        children: self.process_elements(children, entities),
                    });
                }
                // Pass through other elements unchanged
                other => result.push(other.clone()),
            }
        }

        result
    }

    fn process_text(
        &self,
        text: &str,
        entities: &HashMap<String, MemoryEntity>,
    ) -> Vec<SsmlElement> {
        let mut result = Vec::new();
        let mut remaining = text.to_string();

        // Sort entities by length (longer first to avoid partial matches)
        let mut sorted_entities: Vec<_> = entities.iter().collect();
        sorted_entities.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

        for (name, entity) in sorted_entities {
            if entity.familiarity < self.min_familiarity {
                continue;
            }

            // Case-insensitive search
            let lower_remaining = remaining.to_lowercase();
            let lower_name = name.to_lowercase();

            if let Some(pos) = lower_remaining.find(&lower_name) {
                // Add text before the entity
                if pos > 0 {
                    result.push(SsmlElement::Text(remaining[..pos].to_string()));
                }

                // Add the emphasized entity
                let entity_text = remaining[pos..pos + name.len()].to_string();
                let emphasis_level = self.calculate_emphasis_level(entity.familiarity);

                if self.add_ferni_markers {
                    // Use Ferni memory marker for richer semantics
                    result.push(SsmlElement::FerniMemory {
                        entity_type: self.map_entity_type(&entity.entity_type),
                        familiarity: entity.familiarity,
                        children: vec![
                            SsmlElement::Emphasis {
                                level: emphasis_level,
                                children: vec![SsmlElement::Text(entity_text)],
                            }
                        ],
                    });
                } else {
                    // Just use emphasis
                    result.push(SsmlElement::Emphasis {
                        level: emphasis_level,
                        children: vec![SsmlElement::Text(entity_text)],
                    });
                }

                // Continue with remaining text
                remaining = remaining[pos + name.len()..].to_string();
            }
        }

        // Add any remaining text
        if !remaining.is_empty() {
            result.push(SsmlElement::Text(remaining));
        }

        // If nothing matched, return original text
        if result.is_empty() {
            result.push(SsmlElement::Text(text.to_string()));
        }

        result
    }

    fn calculate_emphasis_level(&self, familiarity: f32) -> EmphasisLevel {
        if familiarity > 0.8 {
            EmphasisLevel::Strong
        } else if familiarity > 0.5 {
            EmphasisLevel::Moderate
        } else {
            EmphasisLevel::None // Subtle recognition
        }
    }

    fn map_entity_type(&self, entity_type: &str) -> MemoryEntityType {
        match entity_type.to_lowercase().as_str() {
            "person" => MemoryEntityType::Person,
            "place" => MemoryEntityType::Place,
            "event" => MemoryEntityType::Event,
            "preference" => MemoryEntityType::Preference,
            "goal" => MemoryEntityType::Goal,
            "habit" => MemoryEntityType::Habit,
            "relationship" => MemoryEntityType::Relationship,
            _ => MemoryEntityType::Person,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_entity_emphasis() {
        let transform = MemoryProsodyTransform::new();

        let mut ctx = SuperhumanContext::new();
        ctx.remembered_entities.insert(
            "Sarah".to_string(),
            MemoryEntity::person(0.9).with_relationship("sister"),
        );

        let mut doc = parse("<speak>Tell Sarah I said hi</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have emphasis on "Sarah"
        let has_memory = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniMemory { .. }));
        assert!(has_memory, "Should have memory marker for Sarah");
    }

    #[test]
    fn test_low_familiarity_skipped() {
        let transform = MemoryProsodyTransform::new();

        let mut ctx = SuperhumanContext::new();
        ctx.remembered_entities.insert(
            "John".to_string(),
            MemoryEntity::person(0.1), // Low familiarity
        );

        let mut doc = parse("<speak>John called</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should NOT have memory marker (familiarity too low)
        let has_memory = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniMemory { .. }));
        assert!(!has_memory, "Low familiarity should not trigger memory marker");
    }

    #[test]
    fn test_emphasis_level_calculation() {
        let transform = MemoryProsodyTransform::new();

        assert_eq!(transform.calculate_emphasis_level(0.9), EmphasisLevel::Strong);
        assert_eq!(transform.calculate_emphasis_level(0.6), EmphasisLevel::Moderate);
        assert_eq!(transform.calculate_emphasis_level(0.3), EmphasisLevel::None);
    }
}
