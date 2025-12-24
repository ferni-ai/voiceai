package com.ferni.voice.models

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for VoiceEvent sealed class.
 */
class VoiceEventTest {

    // MARK: - StateChanged Event Tests

    @Test
    fun `state changed event preserves state`() {
        val state = VoiceState.Connected
        val event = VoiceEvent.StateChanged(state)
        assertEquals(state, event.state)
    }

    @Test
    fun `state changed events with same state are equal`() {
        val event1 = VoiceEvent.StateChanged(VoiceState.Connected)
        val event2 = VoiceEvent.StateChanged(VoiceState.Connected)
        assertEquals(event1, event2)
    }

    @Test
    fun `state changed events with different states are not equal`() {
        val event1 = VoiceEvent.StateChanged(VoiceState.Connected)
        val event2 = VoiceEvent.StateChanged(VoiceState.Listening)
        assertNotEquals(event1, event2)
    }

    // MARK: - Transcription Event Tests

    @Test
    fun `transcription event preserves text`() {
        val event = VoiceEvent.Transcription(
            text = "Hello, how are you?",
            isAgent = true,
            isFinal = true
        )
        assertEquals("Hello, how are you?", event.text)
    }

    @Test
    fun `transcription event tracks agent status`() {
        val agentEvent = VoiceEvent.Transcription(
            text = "I'm doing well",
            isAgent = true,
            isFinal = true
        )
        assertTrue(agentEvent.isAgent)

        val userEvent = VoiceEvent.Transcription(
            text = "Hello",
            isAgent = false,
            isFinal = true
        )
        assertFalse(userEvent.isAgent)
    }

    @Test
    fun `transcription event tracks finality`() {
        val finalEvent = VoiceEvent.Transcription(
            text = "Complete",
            isAgent = false,
            isFinal = true
        )
        assertTrue(finalEvent.isFinal)

        val interimEvent = VoiceEvent.Transcription(
            text = "In progress...",
            isAgent = false,
            isFinal = false
        )
        assertFalse(interimEvent.isFinal)
    }

    @Test
    fun `transcription events with same values are equal`() {
        val event1 = VoiceEvent.Transcription("Hello", isAgent = true, isFinal = true)
        val event2 = VoiceEvent.Transcription("Hello", isAgent = true, isFinal = true)
        assertEquals(event1, event2)
    }

    // MARK: - Handoff Event Tests

    @Test
    fun `handoff event preserves from and to personas`() {
        val event = VoiceEvent.Handoff(from = "ferni", to = "maya")
        assertEquals("ferni", event.from)
        assertEquals("maya", event.to)
    }

    @Test
    fun `handoff events with same values are equal`() {
        val event1 = VoiceEvent.Handoff(from = "ferni", to = "alex")
        val event2 = VoiceEvent.Handoff(from = "ferni", to = "alex")
        assertEquals(event1, event2)
    }

    @Test
    fun `handoff events with different values are not equal`() {
        val event1 = VoiceEvent.Handoff(from = "ferni", to = "maya")
        val event2 = VoiceEvent.Handoff(from = "ferni", to = "alex")
        assertNotEquals(event1, event2)
    }

    // MARK: - AudioLevel Event Tests

    @Test
    fun `audio level event preserves level`() {
        val event = VoiceEvent.AudioLevel(level = 0.75f)
        assertEquals(0.75f, event.level, 0.001f)
    }

    @Test
    fun `audio level can be zero`() {
        val event = VoiceEvent.AudioLevel(level = 0.0f)
        assertEquals(0.0f, event.level, 0.001f)
    }

    @Test
    fun `audio level can be one`() {
        val event = VoiceEvent.AudioLevel(level = 1.0f)
        assertEquals(1.0f, event.level, 0.001f)
    }

    // MARK: - ErrorEvent Tests

    @Test
    fun `error event preserves throwable`() {
        val exception = IllegalStateException("Test error")
        val event = VoiceEvent.ErrorEvent(exception)
        assertEquals(exception, event.error)
    }

    @Test
    fun `error event message is accessible`() {
        val exception = RuntimeException("Connection failed")
        val event = VoiceEvent.ErrorEvent(exception)
        assertEquals("Connection failed", event.error.message)
    }
}

/**
 * Unit tests for EmotionHint enum.
 */
class EmotionHintTest {

    @Test
    fun `all emotion hints exist`() {
        val hints = EmotionHint.entries
        assertEquals(6, hints.size)
    }

    @Test
    fun `emotion hints include happy`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.HAPPY))
    }

    @Test
    fun `emotion hints include excited`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.EXCITED))
    }

    @Test
    fun `emotion hints include curious`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.CURIOUS))
    }

    @Test
    fun `emotion hints include empathetic`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.EMPATHETIC))
    }

    @Test
    fun `emotion hints include encouraging`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.ENCOURAGING))
    }

    @Test
    fun `emotion hints include neutral`() {
        assertTrue(EmotionHint.entries.contains(EmotionHint.NEUTRAL))
    }

    @Test
    fun `emotion hint ordinals are sequential`() {
        val hints = EmotionHint.entries
        hints.forEachIndexed { index, hint ->
            assertEquals(index, hint.ordinal)
        }
    }

    @Test
    fun `emotion hints can be converted to and from name`() {
        EmotionHint.entries.forEach { hint ->
            val name = hint.name
            val restored = EmotionHint.valueOf(name)
            assertEquals(hint, restored)
        }
    }
}
