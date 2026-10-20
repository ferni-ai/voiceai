package com.ferni.voice.models

import java.util.UUID

/**
 * Represents a message in the conversation transcript.
 */
data class TranscriptMessage(
    val id: String = UUID.randomUUID().toString(),
    val text: String,
    val isAgent: Boolean,
    val personaId: String,
    val timestamp: Long = System.currentTimeMillis()
)
