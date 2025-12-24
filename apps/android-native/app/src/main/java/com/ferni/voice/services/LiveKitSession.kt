@file:OptIn(io.livekit.android.annotations.Beta::class)

package com.ferni.voice.services

import android.content.Context
import android.util.Log
import com.ferni.voice.models.EmotionHint
import com.ferni.voice.models.Persona
import com.ferni.voice.models.TranscriptMessage
import com.ferni.voice.models.VoiceState
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.track.RemoteAudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val TAG = "LiveKitSession"

/**
 * Token response from the server.
 */
@Serializable
data class TokenResponse(
    val token: String,
    val url: String,
    val room: String,
    val sessionId: String? = null
)

/**
 * Humanization signal from the backend Better Than Human system.
 * These signals enable superhuman emotional intelligence capabilities.
 */
data class HumanizationSignal(
    val signalType: String,
    val payload: Map<String, Any>
)

/**
 * LiveKit voice session manager for Android.
 * Handles room connection, microphone, data channels, and transcription.
 */
class LiveKitSession(private val context: Context) {

    // Configuration
    private val tokenServer = "https://app.ferni.ai"

    // Coroutine scope
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // LiveKit Room
    private var room: Room? = null

    // HTTP Client
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    // JSON parser
    private val json = Json { ignoreUnknownKeys = true }

    // State
    private val _voiceState = MutableStateFlow<VoiceState>(VoiceState.Disconnected)
    val voiceState: StateFlow<VoiceState> = _voiceState.asStateFlow()

    private val _currentPersonaId = MutableStateFlow("ferni")
    val currentPersonaId: StateFlow<String> = _currentPersonaId.asStateFlow()

    private val _isMuted = MutableStateFlow(false)
    val isMuted: StateFlow<Boolean> = _isMuted.asStateFlow()

    private val _transcriptMessages = MutableStateFlow<List<TranscriptMessage>>(emptyList())
    val transcriptMessages: StateFlow<List<TranscriptMessage>> = _transcriptMessages.asStateFlow()

    private val _connectionProgress = MutableStateFlow("")
    val connectionProgress: StateFlow<String> = _connectionProgress.asStateFlow()

    private val _isHandoffInProgress = MutableStateFlow(false)
    val isHandoffInProgress: StateFlow<Boolean> = _isHandoffInProgress.asStateFlow()

    private val _handoffTargetPersona = MutableStateFlow<String?>(null)
    val handoffTargetPersona: StateFlow<String?> = _handoffTargetPersona.asStateFlow()

    // Emotion events for avatar
    private val _emotionEvents = MutableSharedFlow<EmotionHint>()
    val emotionEvents = _emotionEvents.asSharedFlow()

    // Humanization signals for Better Than Human capabilities
    private val _humanizationSignals = MutableSharedFlow<HumanizationSignal>()
    val humanizationSignals = _humanizationSignals.asSharedFlow()

    // Audio level from remote agent (0-1 normalized)
    private val _remoteAudioLevel = MutableStateFlow(0f)
    val remoteAudioLevel: StateFlow<Float> = _remoteAudioLevel.asStateFlow()

    // User speech state (detected from local audio)
    private val _isUserSpeaking = MutableStateFlow(false)
    val isUserSpeaking: StateFlow<Boolean> = _isUserSpeaking.asStateFlow()

    val currentPersona: Persona
        get() = Persona.get(_currentPersonaId.value)

    /**
     * Connect to the voice session.
     */
    suspend fun connect() {
        if (_voiceState.value != VoiceState.Disconnected && _voiceState.value !is VoiceState.Error) {
            Log.d(TAG, "Connect called but state is ${_voiceState.value}")
            return
        }

        Log.i(TAG, "Starting voice session")
        _voiceState.value = VoiceState.Connecting
        _connectionProgress.value = "Checking connection..."

        // Health check
        if (!checkServerHealth()) {
            Log.e(TAG, "Health check failed")
            _voiceState.value = VoiceState.Error("Server unavailable")
            return
        }

        _connectionProgress.value = "Getting access token..."

        // Fetch token
        val tokenData = fetchToken()
        if (tokenData == null) {
            Log.e(TAG, "Failed to fetch token")
            _voiceState.value = VoiceState.Error("Failed to get token")
            return
        }

        Log.i(TAG, "Got token for room: ${tokenData.room}")
        _connectionProgress.value = "Connecting to voice server..."

        try {
            // Create room
            val newRoom = LiveKit.create(context)
            room = newRoom

            // Set up event collection
            setupEventCollection(newRoom)

            // Connect to room
            newRoom.connect(tokenData.url, tokenData.token)
            Log.i(TAG, "Connected to LiveKit room")

            delay(200)
            _connectionProgress.value = "Starting microphone..."

            // Enable microphone with retry
            var micEnabled = false
            for (attempt in 1..3) {
                try {
                    newRoom.localParticipant.setMicrophoneEnabled(true)
                    micEnabled = true
                    Log.i(TAG, "Microphone enabled")
                    break
                } catch (e: Exception) {
                    Log.w(TAG, "Microphone attempt $attempt failed: ${e.message}")
                    if (attempt < 3) {
                        delay(500)
                    }
                }
            }

            if (!micEnabled) {
                Log.e(TAG, "Failed to enable microphone")
                _voiceState.value = VoiceState.Error("Microphone unavailable")
                _connectionProgress.value = ""
                newRoom.disconnect()
                room = null
                return
            }

            _connectionProgress.value = ""
            _voiceState.value = VoiceState.Connected
            Log.i(TAG, "Voice session connected")

        } catch (e: Exception) {
            Log.e(TAG, "Connection failed: ${e.message}")
            _voiceState.value = VoiceState.Error("Connection failed")
            _connectionProgress.value = ""
            room?.disconnect()
            room = null
        }
    }

    /**
     * Disconnect from the voice session.
     */
    fun disconnect() {
        Log.i(TAG, "Disconnecting session...")

        val currentRoom = room ?: run {
            _voiceState.value = VoiceState.Disconnected
            return
        }

        room = null

        scope.launch {
            try {
                currentRoom.localParticipant.setMicrophoneEnabled(false)
            } catch (e: Exception) {
                Log.w(TAG, "Error disabling mic: ${e.message}")
            }
            currentRoom.disconnect()
        }

        _voiceState.value = VoiceState.Disconnected
        _connectionProgress.value = ""
        _isMuted.value = false
    }

    /**
     * Toggle microphone mute state.
     */
    fun toggleMute() {
        val currentRoom = room ?: return

        _isMuted.value = !_isMuted.value

        scope.launch {
            try {
                currentRoom.localParticipant.setMicrophoneEnabled(!_isMuted.value)
                Log.i(TAG, "Microphone ${if (_isMuted.value) "muted" else "unmuted"}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to toggle mute: ${e.message}")
            }
        }
    }

    /**
     * Request a persona switch (handoff).
     */
    suspend fun switchPersona(personaId: String) {
        val currentRoom = room ?: return
        if (!_voiceState.value.isActive) return

        val message = JSONObject().apply {
            put("type", "handoff_request")
            put("target", personaId)
            put("timestamp", System.currentTimeMillis())
        }

        try {
            val data = message.toString().toByteArray(Charsets.UTF_8)
            currentRoom.localParticipant.publishData(data)
            Log.i(TAG, "Sent handoff request for: $personaId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send handoff request: ${e.message}")
        }
    }

    /**
     * Clear transcript history.
     */
    fun clearTranscript() {
        _transcriptMessages.value = emptyList()
    }

    // MARK: - Private Methods

    private fun setupEventCollection(room: Room) {
        scope.launch {
            room.events.collect { event ->
                when (event) {
                    is RoomEvent.DataReceived -> {
                        handleDataMessage(event.data)
                    }
                    is RoomEvent.Disconnected -> {
                        if (_voiceState.value.isActive) {
                            _voiceState.value = VoiceState.Disconnected
                        }
                    }
                    is RoomEvent.Reconnecting -> {
                        _connectionProgress.value = "Reconnecting..."
                    }
                    is RoomEvent.Reconnected -> {
                        _connectionProgress.value = ""
                    }
                    is RoomEvent.TranscriptionReceived -> {
                        val isAgent = event.participant?.identity?.value?.contains("agent") == true
                        // Process transcription segments
                        event.transcriptionSegments.forEach { segment ->
                            if (segment.final && segment.text.isNotBlank()) {
                                handleTranscription(segment.text, isAgent)
                            }
                        }
                    }
                    is RoomEvent.TrackSubscribed -> {
                        // Start monitoring audio level from remote agent track
                        val track = event.track
                        if (track is RemoteAudioTrack) {
                            startAudioLevelMonitoring(track)
                        }
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        // Stop monitoring when track is removed
                        val track = event.track
                        if (track is RemoteAudioTrack) {
                            _remoteAudioLevel.value = 0f
                        }
                    }
                    is RoomEvent.ActiveSpeakersChanged -> {
                        // Update speaking states based on active speakers
                        val localIsSpeaking = event.speakers.any { speaker ->
                            speaker.identity?.value == room.localParticipant.identity?.value
                        }
                        val agentIsSpeaking = event.speakers.any { speaker ->
                            speaker.identity?.value?.contains("agent") == true
                        }

                        // Update audio level based on agent speaking
                        if (agentIsSpeaking) {
                            // Get audio level from speaker info if available
                            val agentSpeaker = event.speakers.find { it.identity?.value?.contains("agent") == true }
                            agentSpeaker?.audioLevel?.let { level ->
                                _remoteAudioLevel.value = level
                            }
                        } else {
                            _remoteAudioLevel.value = 0f
                        }

                        // Track user speaking state for active listening
                        _isUserSpeaking.value = localIsSpeaking && !agentIsSpeaking
                    }
                    else -> { /* Ignore other events */ }
                }
            }
        }
    }

    /**
     * Start monitoring audio levels from a remote audio track.
     * This provides more granular audio level updates than ActiveSpeakersChanged.
     */
    private fun startAudioLevelMonitoring(track: RemoteAudioTrack) {
        // Note: LiveKit's RemoteAudioTrack provides audio level through
        // the ActiveSpeakersChanged event. For more granular control,
        // we could use AudioTrackHandler, but ActiveSpeakers is sufficient
        // for avatar visualization.
        Log.d(TAG, "Subscribed to remote audio track: ${track.sid}")
    }

    private fun handleTranscription(text: String, isAgent: Boolean) {
        val message = TranscriptMessage(
            text = text,
            isAgent = isAgent,
            personaId = _currentPersonaId.value
        )

        val current = _transcriptMessages.value.toMutableList()
        current.add(message)

        // Keep only last 50 messages
        if (current.size > 50) {
            current.removeAt(0)
        }

        _transcriptMessages.value = current
    }

    private fun handleDataMessage(data: ByteArray) {
        try {
            val jsonString = data.toString(Charsets.UTF_8)
            val json = JSONObject(jsonString)
            val type = json.optString("type")

            Log.d(TAG, "Received data message: $type")

            when (type) {
                "handoff_started" -> {
                    val newAgent = json.optString("newAgent")
                    if (newAgent.isNotEmpty()) {
                        _isHandoffInProgress.value = true
                        _handoffTargetPersona.value = newAgent
                        _voiceState.value = VoiceState.Thinking
                    }
                }
                "handoff_complete" -> {
                    val newAgent = json.optString("newAgent")
                    if (newAgent.isNotEmpty()) {
                        _currentPersonaId.value = newAgent
                        _isHandoffInProgress.value = false
                        _handoffTargetPersona.value = null
                        _voiceState.value = VoiceState.Connected
                    }
                }
                "handoff_failed" -> {
                    _isHandoffInProgress.value = false
                    _handoffTargetPersona.value = null
                    _voiceState.value = VoiceState.Connected
                }
                "emotion_event" -> {
                    val emotion = json.optString("emotion")
                    val hint = when (emotion) {
                        "happy" -> EmotionHint.HAPPY
                        "excited" -> EmotionHint.EXCITED
                        "curious" -> EmotionHint.CURIOUS
                        "empathetic" -> EmotionHint.EMPATHETIC
                        "encouraging" -> EmotionHint.ENCOURAGING
                        "thinking" -> EmotionHint.THINKING
                        "calm" -> EmotionHint.CALM
                        else -> EmotionHint.NEUTRAL
                    }
                    scope.launch {
                        _emotionEvents.emit(hint)
                    }
                }

                "humanization_signal" -> {
                    // Better Than Human backend signals
                    // Types: concern_detected, voice_state_detected, emotional_trajectory, micro_expression_trigger
                    val signalType = json.optString("signal_type")
                    val payloadJson = json.optJSONObject("payload")

                    if (signalType.isNotEmpty()) {
                        val payload = mutableMapOf<String, Any>()

                        payloadJson?.keys()?.forEach { key ->
                            payloadJson.opt(key)?.let { value ->
                                payload[key] = value
                            }
                        }

                        Log.d(TAG, "Humanization signal: $signalType -> $payload")

                        scope.launch {
                            _humanizationSignals.emit(HumanizationSignal(signalType, payload))
                        }
                    }
                }

                "agent_speaking" -> {
                    // Agent started speaking - user is not speaking
                    _isUserSpeaking.value = false
                }

                "user_speaking" -> {
                    // User started speaking
                    _isUserSpeaking.value = true
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse data message: ${e.message}")
        }
    }

    private suspend fun checkServerHealth(): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$tokenServer/health")
                .get()
                .build()

            val response = httpClient.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            Log.e(TAG, "Health check error: ${e.message}")
            false
        }
    }

    private suspend fun fetchToken(): TokenResponse? = withContext(Dispatchers.IO) {
        try {
            val roomId = "ferni-android-${UUID.randomUUID().toString().take(8)}"
            val username = "android-${UUID.randomUUID().toString().take(8)}"
            val personaId = _currentPersonaId.value

            val url = "$tokenServer/token?room=$roomId&username=$username&persona_id=$personaId"

            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = httpClient.newCall(request).execute()

            if (!response.isSuccessful) {
                Log.e(TAG, "Token request failed with status ${response.code}")
                return@withContext null
            }

            val body = response.body?.string() ?: return@withContext null
            json.decodeFromString<TokenResponse>(body)
        } catch (e: Exception) {
            Log.e(TAG, "Token fetch error: ${e.message}")
            null
        }
    }
}
