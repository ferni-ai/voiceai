/**
 * The prompts the deep extraction worker sends the model.
 *
 * @module memory/dynamic/deep-extraction-prompts
 */

export const ENTITY_EXTRACTION_PROMPT = `You are an expert at identifying entities (people, places, events, concepts) in conversation.

Given this transcript from a personal conversation, extract all meaningful entities.

For each entity, determine:
1. name: The entity's name or description
2. type: person, place, organization, event, concept, or thing
3. attributes: Any properties mentioned (e.g., role, location, date)
4. confidence: 0-1 how confident you are

Focus on entities that matter for personal memory - people in the user's life, places they go, events happening.

Return JSON array of entities.`;

const FACT_EXTRACTION_PROMPT = `You are extracting factual information that should be remembered about entities.

Given entities and transcript, extract NEW FACTS learned about each entity.

Fact types:
- attribute: A property (birthday, job, location)
- event: Something that happened or will happen
- relationship: How entities relate
- state: Current situation
- preference: Likes, dislikes, preferences

Only extract facts explicitly stated or strongly implied. Be conservative.

Return JSON array with: entityName, factType, key, value, confidence, temporalContext.`;

/**
 * Where they live and where they are right now, as two keys on the caller (right-moment
 * memory §5.3): FACT_SUPERSESSION replaces by key, so a newer home replaces home and
 * "at the airport" no longer displaces it. CALLER_CARD, as the caller's call had it.
 */
const HOME_KEYS = `
- Where the speaker lives: entityName "User", key "home", value a city or neighbourhood, never a street address.
- Where the speaker is right now: entityName "User", key "current location".`;

/** The fact prompt; with `cardOn` false, exactly as before. */
export function factExtractionPrompt(cardOn: boolean): string {
  return cardOn ? FACT_EXTRACTION_PROMPT + HOME_KEYS : FACT_EXTRACTION_PROMPT;
}

export const RELATIONSHIP_EXTRACTION_PROMPT = `You are mapping relationships between entities mentioned in conversation.

Types of relationships:
- family (parent, sibling, spouse, child)
- social (friend, neighbor, acquaintance)  
- professional (colleague, boss, client)
- romantic (partner, ex, dating)
- other

For each relationship, determine:
- source: First entity name
- target: Second entity name
- type: Relationship category
- strength: 0-1 (how close/important)
- bidirectional: Is it mutual?

Return JSON array of relationships.`;

export const SELF_QUESTIONING_PROMPT = `You are refining memory extraction through self-questioning.

Given the current extraction results, answer these questions:

1. MISSING ENTITIES: What entities might have been missed? Look for:
   - Pronouns that refer to specific people ("he", "she", "they")
   - Implicit references ("the doctor", "my neighbor")
   - Places or events mentioned in passing

2. IMPLICIT FACTS: What facts are implied but not extracted?
   - Emotional states from context
   - Time relationships
   - Cause-effect relationships

3. RELATIONSHIP GAPS: What relationships are implied?
   - If A knows B and B knows C, might A know C?
   - Professional relationships from context
   - Social connections

4. CONTRADICTIONS: Does anything contradict what we already know?

5. IMPORTANCE: What here is most worth remembering long-term?

Return refined extraction with any additions.`;
