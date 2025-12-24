package com.ferni.voice.models

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for Persona data class and companion object.
 */
class PersonaTest {

    // MARK: - Ferni Tests

    @Test
    fun `ferni has correct id`() {
        assertEquals("ferni", Persona.ferni.id)
    }

    @Test
    fun `ferni has correct name`() {
        assertEquals("Ferni", Persona.ferni.name)
    }

    @Test
    fun `ferni has correct initials`() {
        assertEquals("FE", Persona.ferni.initials)
    }

    @Test
    fun `ferni has correct role`() {
        assertEquals("Life Coach", Persona.ferni.role)
    }

    @Test
    fun `ferni has correct primary hex`() {
        assertEquals("#4a6741", Persona.ferni.primaryHex)
    }

    @Test
    fun `ferni tagline equals role`() {
        assertEquals(Persona.ferni.role, Persona.ferni.tagline)
    }

    // MARK: - Maya Tests

    @Test
    fun `maya has correct id`() {
        assertEquals("maya", Persona.maya.id)
    }

    @Test
    fun `maya has correct name`() {
        assertEquals("Maya", Persona.maya.name)
    }

    @Test
    fun `maya has correct role`() {
        assertEquals("Habits Coach", Persona.maya.role)
    }

    @Test
    fun `maya has correct primary hex`() {
        assertEquals("#a67a6a", Persona.maya.primaryHex)
    }

    // MARK: - Alex Tests

    @Test
    fun `alex has correct id`() {
        assertEquals("alex", Persona.alex.id)
    }

    @Test
    fun `alex has correct name`() {
        assertEquals("Alex", Persona.alex.name)
    }

    @Test
    fun `alex has correct role`() {
        assertEquals("Communications", Persona.alex.role)
    }

    @Test
    fun `alex has correct primary hex`() {
        assertEquals("#5a6b8a", Persona.alex.primaryHex)
    }

    // MARK: - Jordan Tests

    @Test
    fun `jordan has correct id`() {
        assertEquals("jordan", Persona.jordan.id)
    }

    @Test
    fun `jordan has correct name`() {
        assertEquals("Jordan", Persona.jordan.name)
    }

    @Test
    fun `jordan has correct role`() {
        assertEquals("Life Planner", Persona.jordan.role)
    }

    @Test
    fun `jordan has correct primary hex`() {
        assertEquals("#c4856a", Persona.jordan.primaryHex)
    }

    // MARK: - Peter Tests

    @Test
    fun `peter has correct id`() {
        assertEquals("peter", Persona.peter.id)
    }

    @Test
    fun `peter has correct name`() {
        assertEquals("Peter", Persona.peter.name)
    }

    @Test
    fun `peter has correct role`() {
        assertEquals("Research", Persona.peter.role)
    }

    @Test
    fun `peter has correct primary hex`() {
        assertEquals("#3a6b73", Persona.peter.primaryHex)
    }

    // MARK: - Nayan Tests

    @Test
    fun `nayan has correct id`() {
        assertEquals("nayan", Persona.nayan.id)
    }

    @Test
    fun `nayan has correct name`() {
        assertEquals("Nayan", Persona.nayan.name)
    }

    @Test
    fun `nayan has correct role`() {
        assertEquals("Wisdom", Persona.nayan.role)
    }

    @Test
    fun `nayan has correct primary hex`() {
        assertEquals("#9a7b5a", Persona.nayan.primaryHex)
    }

    // MARK: - Companion Object Tests

    @Test
    fun `all personas list contains six personas`() {
        assertEquals(6, Persona.all.size)
    }

    @Test
    fun `all personas list contains ferni`() {
        assertTrue(Persona.all.contains(Persona.ferni))
    }

    @Test
    fun `all personas list contains maya`() {
        assertTrue(Persona.all.contains(Persona.maya))
    }

    @Test
    fun `all personas list contains alex`() {
        assertTrue(Persona.all.contains(Persona.alex))
    }

    @Test
    fun `all personas list contains jordan`() {
        assertTrue(Persona.all.contains(Persona.jordan))
    }

    @Test
    fun `all personas list contains peter`() {
        assertTrue(Persona.all.contains(Persona.peter))
    }

    @Test
    fun `all personas list contains nayan`() {
        assertTrue(Persona.all.contains(Persona.nayan))
    }

    @Test
    fun `get returns correct persona by id`() {
        assertEquals(Persona.ferni, Persona.get("ferni"))
        assertEquals(Persona.maya, Persona.get("maya"))
        assertEquals(Persona.alex, Persona.get("alex"))
        assertEquals(Persona.jordan, Persona.get("jordan"))
        assertEquals(Persona.peter, Persona.get("peter"))
        assertEquals(Persona.nayan, Persona.get("nayan"))
    }

    @Test
    fun `get returns ferni for unknown id`() {
        assertEquals(Persona.ferni, Persona.get("unknown"))
        assertEquals(Persona.ferni, Persona.get(""))
        assertEquals(Persona.ferni, Persona.get("nonexistent"))
    }

    // MARK: - Property Validation Tests

    @Test
    fun `all personas have non-empty id`() {
        Persona.all.forEach { persona ->
            assertTrue("${persona.name} should have non-empty id", persona.id.isNotEmpty())
        }
    }

    @Test
    fun `all personas have non-empty name`() {
        Persona.all.forEach { persona ->
            assertTrue("Persona ${persona.id} should have non-empty name", persona.name.isNotEmpty())
        }
    }

    @Test
    fun `all personas have non-empty initials`() {
        Persona.all.forEach { persona ->
            assertTrue("${persona.name} should have non-empty initials", persona.initials.isNotEmpty())
        }
    }

    @Test
    fun `all personas have two-letter initials`() {
        Persona.all.forEach { persona ->
            assertEquals(
                "${persona.name} should have two-letter initials",
                2, persona.initials.length
            )
        }
    }

    @Test
    fun `all personas have non-empty role`() {
        Persona.all.forEach { persona ->
            assertTrue("${persona.name} should have non-empty role", persona.role.isNotEmpty())
        }
    }

    @Test
    fun `all personas have non-empty specialty`() {
        Persona.all.forEach { persona ->
            assertTrue("${persona.name} should have non-empty specialty", persona.specialty.isNotEmpty())
        }
    }

    @Test
    fun `all personas have non-empty emoji`() {
        Persona.all.forEach { persona ->
            assertTrue("${persona.name} should have non-empty emoji", persona.emoji.isNotEmpty())
        }
    }

    @Test
    fun `all personas have valid hex color format`() {
        val hexPattern = Regex("^#[0-9a-fA-F]{6}$")
        Persona.all.forEach { persona ->
            assertTrue(
                "${persona.name} primaryHex should match hex format",
                hexPattern.matches(persona.primaryHex)
            )
        }
    }

    @Test
    fun `all persona ids are unique`() {
        val ids = Persona.all.map { it.id }
        assertEquals("All persona IDs should be unique", ids.size, ids.toSet().size)
    }

    @Test
    fun `all persona names are unique`() {
        val names = Persona.all.map { it.name }
        assertEquals("All persona names should be unique", names.size, names.toSet().size)
    }

    // MARK: - Data Class Tests

    @Test
    fun `persona equality works correctly`() {
        val persona1 = Persona.ferni
        val persona2 = Persona.get("ferni")
        assertEquals(persona1, persona2)
    }

    @Test
    fun `different personas are not equal`() {
        assertNotEquals(Persona.ferni, Persona.maya)
        assertNotEquals(Persona.alex, Persona.jordan)
    }
}

/**
 * Unit tests for TranscriptMessage data class.
 */
class TranscriptMessageTest {

    @Test
    fun `message preserves text`() {
        val message = TranscriptMessage(
            text = "Hello, how are you?",
            isAgent = true,
            personaId = "ferni"
        )
        assertEquals("Hello, how are you?", message.text)
    }

    @Test
    fun `message preserves isAgent flag`() {
        val agentMessage = TranscriptMessage(
            text = "I'm here to help",
            isAgent = true,
            personaId = "ferni"
        )
        assertTrue(agentMessage.isAgent)

        val userMessage = TranscriptMessage(
            text = "Hello",
            isAgent = false,
            personaId = "ferni"
        )
        assertFalse(userMessage.isAgent)
    }

    @Test
    fun `message preserves personaId`() {
        val message = TranscriptMessage(
            text = "Test",
            isAgent = true,
            personaId = "maya"
        )
        assertEquals("maya", message.personaId)
    }

    @Test
    fun `message generates unique id by default`() {
        val message1 = TranscriptMessage(
            text = "Test",
            isAgent = true,
            personaId = "ferni"
        )
        val message2 = TranscriptMessage(
            text = "Test",
            isAgent = true,
            personaId = "ferni"
        )
        assertNotEquals(message1.id, message2.id)
    }

    @Test
    fun `message has timestamp`() {
        val before = System.currentTimeMillis()
        val message = TranscriptMessage(
            text = "Test",
            isAgent = true,
            personaId = "ferni"
        )
        val after = System.currentTimeMillis()

        assertTrue("Timestamp should be after creation started", message.timestamp >= before)
        assertTrue("Timestamp should be before creation ended", message.timestamp <= after)
    }

    @Test
    fun `custom id is preserved`() {
        val customId = "custom-message-id"
        val message = TranscriptMessage(
            id = customId,
            text = "Test",
            isAgent = true,
            personaId = "ferni"
        )
        assertEquals(customId, message.id)
    }

    @Test
    fun `custom timestamp is preserved`() {
        val customTimestamp = 1000000L
        val message = TranscriptMessage(
            text = "Test",
            isAgent = true,
            personaId = "ferni",
            timestamp = customTimestamp
        )
        assertEquals(customTimestamp, message.timestamp)
    }
}
