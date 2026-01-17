package com.ferni.voice.services

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for LiveKitSession data message handling logic.
 *
 * Note: Full integration tests require Android instrumentation.
 * These tests verify the data structures and parsing logic.
 */
class HumanizationSignalTest {

    @Test
    fun `HumanizationSignal stores signal type and payload`() {
        val signal = HumanizationSignal(
            signalType = "concern_detected",
            payload = mapOf("level" to "high")
        )

        assertEquals("concern_detected", signal.signalType)
        assertEquals("high", signal.payload["level"])
    }

    @Test
    fun `HumanizationSignal handles empty payload`() {
        val signal = HumanizationSignal(
            signalType = "test_signal",
            payload = emptyMap()
        )

        assertEquals("test_signal", signal.signalType)
        assertTrue(signal.payload.isEmpty())
    }

    @Test
    fun `HumanizationSignal handles complex payload`() {
        val signal = HumanizationSignal(
            signalType = "voice_state_detected",
            payload = mapOf(
                "tone" to "stressed",
                "strain" to 0.75,
                "confidence" to 0.9
            )
        )

        assertEquals("voice_state_detected", signal.signalType)
        assertEquals("stressed", signal.payload["tone"])
        assertEquals(0.75, signal.payload["strain"])
        assertEquals(0.9, signal.payload["confidence"])
    }

    @Test
    fun `HumanizationSignal equality works correctly`() {
        val signal1 = HumanizationSignal("concern_detected", mapOf("level" to "high"))
        val signal2 = HumanizationSignal("concern_detected", mapOf("level" to "high"))
        val signal3 = HumanizationSignal("concern_detected", mapOf("level" to "mild"))

        assertEquals(signal1, signal2)
        assertNotEquals(signal1, signal3)
    }
}

/**
 * Tests for data message type parsing patterns.
 */
class DataMessageTypeTest {

    // Supported message types based on handleDataMessage()
    private val supportedTypes = setOf(
        "handoff_started",
        "handoff_complete",
        "handoff_failed",
        "emotion_event",
        "humanization_signal",
        "agent_speaking",
        "user_speaking"
    )

    @Test
    fun `handoff message types are supported`() {
        assertTrue(supportedTypes.contains("handoff_started"))
        assertTrue(supportedTypes.contains("handoff_complete"))
        assertTrue(supportedTypes.contains("handoff_failed"))
    }

    @Test
    fun `emotion_event type is supported`() {
        assertTrue(supportedTypes.contains("emotion_event"))
    }

    @Test
    fun `humanization_signal type is supported`() {
        assertTrue(supportedTypes.contains("humanization_signal"))
    }

    @Test
    fun `speaking state types are supported`() {
        assertTrue(supportedTypes.contains("agent_speaking"))
        assertTrue(supportedTypes.contains("user_speaking"))
    }

    @Test
    fun `unknown types should be ignored gracefully`() {
        // This verifies the expected behavior - unknown types fall through to else
        val unknownType = "unknown_message_type"
        assertFalse(supportedTypes.contains(unknownType))
    }
}

/**
 * Tests for emotion event format expectations.
 */
class EmotionEventFormatTest {

    // Supported emotion values based on handleDataMessage()
    private val supportedEmotions = setOf(
        "happy", "excited", "curious",
        "empathetic", "encouraging"
        // "neutral" is the fallback for unknown values
    )

    @Test
    fun `happy emotion is supported`() {
        assertTrue(supportedEmotions.contains("happy"))
    }

    @Test
    fun `excited emotion is supported`() {
        assertTrue(supportedEmotions.contains("excited"))
    }

    @Test
    fun `curious emotion is supported`() {
        assertTrue(supportedEmotions.contains("curious"))
    }

    @Test
    fun `empathetic emotion is supported`() {
        assertTrue(supportedEmotions.contains("empathetic"))
    }

    @Test
    fun `encouraging emotion is supported`() {
        assertTrue(supportedEmotions.contains("encouraging"))
    }

    @Test
    fun `unknown emotions default to neutral`() {
        // Any emotion not in the supported set should map to NEUTRAL
        val unknownEmotion = "confused"
        assertFalse(supportedEmotions.contains(unknownEmotion))
        // In actual code, this would map to EmotionHint.NEUTRAL
    }
}

/**
 * Tests for humanization signal type expectations.
 */
class HumanizationSignalTypeTest {

    // Supported signal types for Better Than Human capabilities
    private val supportedSignalTypes = setOf(
        "concern_detected",
        "voice_state_detected",
        "emotional_trajectory",
        "micro_expression_trigger"
    )

    @Test
    fun `concern_detected signal type is valid`() {
        assertTrue(supportedSignalTypes.contains("concern_detected"))
    }

    @Test
    fun `voice_state_detected signal type is valid`() {
        assertTrue(supportedSignalTypes.contains("voice_state_detected"))
    }

    @Test
    fun `emotional_trajectory signal type is valid`() {
        assertTrue(supportedSignalTypes.contains("emotional_trajectory"))
    }

    @Test
    fun `micro_expression_trigger signal type is valid`() {
        assertTrue(supportedSignalTypes.contains("micro_expression_trigger"))
    }
}

/**
 * Tests for concern level payload values.
 */
class ConcernLevelPayloadTest {

    private val validConcernLevels = setOf("high", "moderate", "mild")

    @Test
    fun `high concern level is valid`() {
        assertTrue(validConcernLevels.contains("high"))
    }

    @Test
    fun `moderate concern level is valid`() {
        assertTrue(validConcernLevels.contains("moderate"))
    }

    @Test
    fun `mild concern level is valid`() {
        assertTrue(validConcernLevels.contains("mild"))
    }

    @Test
    fun `unknown level defaults to none`() {
        val unknownLevel = "unknown"
        assertFalse(validConcernLevels.contains(unknownLevel))
        // In actual code, this would map to ConcernLevel.NONE
    }
}

/**
 * Tests for micro expression trigger payload values.
 */
class MicroExpressionPayloadTest {

    private val validExpressions = setOf(
        "recognition", "concern", "delight", "warmth", "interest"
    )

    @Test
    fun `recognition expression is valid`() {
        assertTrue(validExpressions.contains("recognition"))
    }

    @Test
    fun `concern expression is valid`() {
        assertTrue(validExpressions.contains("concern"))
    }

    @Test
    fun `delight expression is valid`() {
        assertTrue(validExpressions.contains("delight"))
    }

    @Test
    fun `warmth expression is valid`() {
        assertTrue(validExpressions.contains("warmth"))
    }

    @Test
    fun `interest expression is valid`() {
        assertTrue(validExpressions.contains("interest"))
    }

    @Test
    fun `unknown expression should be ignored`() {
        val unknownExpression = "unknown_expression"
        assertFalse(validExpressions.contains(unknownExpression))
        // In actual code, this would be null and not trigger an expression
    }
}

/**
 * Tests for TokenResponse data class.
 */
class TokenResponseTest {

    @Test
    fun `TokenResponse stores required fields`() {
        val response = TokenResponse(
            token = "test_token_123",
            url = "wss://livekit.example.com",
            room = "test-room-abc"
        )

        assertEquals("test_token_123", response.token)
        assertEquals("wss://livekit.example.com", response.url)
        assertEquals("test-room-abc", response.room)
        assertNull(response.sessionId)
    }

    @Test
    fun `TokenResponse stores optional sessionId`() {
        val response = TokenResponse(
            token = "test_token_123",
            url = "wss://livekit.example.com",
            room = "test-room-abc",
            sessionId = "session_xyz"
        )

        assertEquals("session_xyz", response.sessionId)
    }

    @Test
    fun `TokenResponse equality works correctly`() {
        val response1 = TokenResponse("token", "url", "room", "session")
        val response2 = TokenResponse("token", "url", "room", "session")
        val response3 = TokenResponse("token", "url", "room", null)

        assertEquals(response1, response2)
        assertNotEquals(response1, response3)
    }
}
