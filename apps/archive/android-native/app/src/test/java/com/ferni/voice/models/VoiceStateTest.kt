package com.ferni.voice.models

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for VoiceState sealed class.
 */
class VoiceStateTest {

    // MARK: - Title Tests

    @Test
    fun `disconnected state has title Ready`() {
        assertEquals("Ready", VoiceState.Disconnected.title)
    }

    @Test
    fun `connecting state has title Connecting`() {
        assertEquals("Connecting...", VoiceState.Connecting.title)
    }

    @Test
    fun `connected state has title Connected`() {
        assertEquals("Connected", VoiceState.Connected.title)
    }

    @Test
    fun `listening state has title Listening`() {
        assertEquals("Listening", VoiceState.Listening.title)
    }

    @Test
    fun `speaking state has title Speaking`() {
        assertEquals("Speaking", VoiceState.Speaking.title)
    }

    @Test
    fun `thinking state has title Thinking`() {
        assertEquals("Thinking", VoiceState.Thinking.title)
    }

    @Test
    fun `error state has title Connection Issue`() {
        val errorState = VoiceState.Error("Test error")
        assertEquals("Connection Issue", errorState.title)
    }

    // MARK: - isActive Tests

    @Test
    fun `disconnected state is not active`() {
        assertFalse(VoiceState.Disconnected.isActive)
    }

    @Test
    fun `error state is not active`() {
        assertFalse(VoiceState.Error("test").isActive)
    }

    @Test
    fun `connecting state is active`() {
        assertTrue(VoiceState.Connecting.isActive)
    }

    @Test
    fun `connected state is active`() {
        assertTrue(VoiceState.Connected.isActive)
    }

    @Test
    fun `listening state is active`() {
        assertTrue(VoiceState.Listening.isActive)
    }

    @Test
    fun `speaking state is active`() {
        assertTrue(VoiceState.Speaking.isActive)
    }

    @Test
    fun `thinking state is active`() {
        assertTrue(VoiceState.Thinking.isActive)
    }

    // MARK: - showWaveform Tests

    @Test
    fun `disconnected state does not show waveform`() {
        assertFalse(VoiceState.Disconnected.showWaveform)
    }

    @Test
    fun `connecting state does not show waveform`() {
        assertFalse(VoiceState.Connecting.showWaveform)
    }

    @Test
    fun `thinking state does not show waveform`() {
        assertFalse(VoiceState.Thinking.showWaveform)
    }

    @Test
    fun `error state does not show waveform`() {
        assertFalse(VoiceState.Error("test").showWaveform)
    }

    @Test
    fun `connected state shows waveform`() {
        assertTrue(VoiceState.Connected.showWaveform)
    }

    @Test
    fun `listening state shows waveform`() {
        assertTrue(VoiceState.Listening.showWaveform)
    }

    @Test
    fun `speaking state shows waveform`() {
        assertTrue(VoiceState.Speaking.showWaveform)
    }

    // MARK: - breathingIntensity Tests

    @Test
    fun `connected state has full breathing intensity`() {
        assertEquals(1.0f, VoiceState.Connected.breathingIntensity, 0.001f)
    }

    @Test
    fun `listening state has full breathing intensity`() {
        assertEquals(1.0f, VoiceState.Listening.breathingIntensity, 0.001f)
    }

    @Test
    fun `speaking state has full breathing intensity`() {
        assertEquals(1.0f, VoiceState.Speaking.breathingIntensity, 0.001f)
    }

    @Test
    fun `thinking state has reduced breathing intensity`() {
        assertEquals(0.8f, VoiceState.Thinking.breathingIntensity, 0.001f)
    }

    @Test
    fun `disconnected state has minimal breathing intensity`() {
        assertEquals(0.6f, VoiceState.Disconnected.breathingIntensity, 0.001f)
    }

    @Test
    fun `error state has minimal breathing intensity`() {
        assertEquals(0.6f, VoiceState.Error("test").breathingIntensity, 0.001f)
    }

    @Test
    fun `connecting state has minimal breathing intensity`() {
        assertEquals(0.6f, VoiceState.Connecting.breathingIntensity, 0.001f)
    }

    // MARK: - Error State Tests

    @Test
    fun `error state preserves error message`() {
        val errorMessage = "Network connection failed"
        val errorState = VoiceState.Error(errorMessage)
        assertEquals(errorMessage, errorState.message)
    }

    @Test
    fun `different error states with same message are equal`() {
        val error1 = VoiceState.Error("test")
        val error2 = VoiceState.Error("test")
        assertEquals(error1, error2)
    }

    @Test
    fun `different error states with different messages are not equal`() {
        val error1 = VoiceState.Error("test1")
        val error2 = VoiceState.Error("test2")
        assertNotEquals(error1, error2)
    }

    // MARK: - Sealed Class Completeness

    @Test
    fun `all voice states have valid titles`() {
        val states = listOf(
            VoiceState.Disconnected,
            VoiceState.Connecting,
            VoiceState.Connected,
            VoiceState.Listening,
            VoiceState.Speaking,
            VoiceState.Thinking,
            VoiceState.Error("test")
        )

        states.forEach { state ->
            assertNotNull("State $state should have a title", state.title)
            assertTrue("State $state title should not be empty", state.title.isNotEmpty())
        }
    }

    @Test
    fun `breathing intensity is always positive`() {
        val states = listOf(
            VoiceState.Disconnected,
            VoiceState.Connecting,
            VoiceState.Connected,
            VoiceState.Listening,
            VoiceState.Speaking,
            VoiceState.Thinking,
            VoiceState.Error("test")
        )

        states.forEach { state ->
            assertTrue(
                "State $state should have positive breathing intensity",
                state.breathingIntensity > 0f
            )
        }
    }
}
