import Foundation
import AVFoundation
import Combine
import os.log

private let sessionLog = Logger(subsystem: "com.ferni.voice", category: "LiveKit")

// MARK: - Native LiveKit Voice Session
//
// Native Swift implementation using LiveKit's Swift SDK for direct,
// low-latency voice streaming. All TypeScript capabilities (personas,
// handoffs, trust systems, tools) remain SERVER-SIDE - this is just a client.
//
// Architecture:
// ┌─────────────────────┐          ┌─────────────┐          ┌─────────────────────┐
// │   macOS Client      │◀────────▶│   LiveKit   │◀────────▶│   Voice Agent       │
// │   (This File)       │  WebRTC  │   Server    │          │   (TypeScript)      │
// └─────────────────────┘          └─────────────┘          └─────────────────────┘
//                                                                    │
//                                                            ALL TS Features:
//                                                            • 6 Personas
//                                                            • Handoffs
//                                                            • Trust Systems
//                                                            • Tools
//                                                            • Memory/Context
//
// To enable:
// 1. Uncomment LiveKit in Package.swift
// 2. Replace VoiceSessionManager with NativeLiveKitSession in FerniVoiceApp.swift

#if canImport(LiveKit)
import LiveKit

// MARK: - Data Channel Message Types (matches TypeScript agent)

/// Messages FROM the TypeScript agent TO this client
enum AgentMessageType: String, Codable {
    case handoffStarted = "handoff_started"
    case handoffProgress = "handoff_progress"
    case handoffComplete = "handoff_complete"
    case handoffFailed = "handoff_failed"
    case mood = "mood"
    case emotionEvent = "emotion_event"
    case partialTranscript = "partial_transcript"
    case speakerChanged = "speaker_changed"
    case sessionStateReset = "session_state_reset"
    case handoffAck = "handoff_ack"
    case celebrationEvent = "celebration_event"
}

/// Messages FROM this client TO the TypeScript agent
enum ClientMessageType: String {
    case handoffRequest = "handoff_request"
    case handoffCancel = "handoff_cancel"
    case gameStartRequest = "game_start_request"
    case voicePackChange = "voice-pack-change"
    case macosContext = "macos_context"
}

// MARK: - Agent Message Structures

struct HandoffStartedMessage: Decodable {
    let type: String
    let newAgent: String
    let previousAgent: String
    let direction: String?
    let playSound: Bool?
    let softOpenBanter: String?
    let arrivingBanter: String?
}

struct HandoffCompleteMessage: Decodable {
    let type: String
    let newAgent: String
    let previousAgent: String
    let greeting: String?
}

struct MoodMessage: Decodable {
    let type: String
    let state: String?
    let energyLevel: Double?
    let relationshipStage: String?
}

struct EmotionEventMessage: Decodable {
    let type: String
    let emotion: String?
    let intensity: Double?
    let concern: Bool?
}

struct PartialTranscriptMessage: Decodable {
    let type: String
    let text: String
    let isAgent: Bool?
}

// MARK: - Native Session

class NativeLiveKitSession: ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni"
    @Published private(set) var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published private(set) var transcriptions: [TranscriptionEntry] = []
    @Published private(set) var connectionProgress: String = ""
    @Published private(set) var retryCount: Int = 0
    
    // Handoff state (for UI animations)
    @Published private(set) var isHandoffInProgress: Bool = false
    @Published private(set) var handoffTargetPersona: String?
    @Published private(set) var handoffBanter: String?
    
    // Mood/emotion state (from TypeScript agent)
    @Published private(set) var currentMood: String = "neutral"
    @Published private(set) var energyLevel: Double = 0.5
    @Published private(set) var relationshipStage: String = "new"
    
    var currentPersona: Persona {
        PersonaRegistry.get(currentPersonaId)
    }
    
    // MARK: - Configuration
    
    var useCloudMode: Bool {
        get {
            if UserDefaults.standard.object(forKey: "useCloudMode") == nil {
                return true // Default to cloud
            }
            return UserDefaults.standard.bool(forKey: "useCloudMode")
        }
        set { UserDefaults.standard.set(newValue, forKey: "useCloudMode") }
    }
    
    private let cloudTokenServer = "https://app.ferni.ai"
    private let localTokenServer = "http://localhost:3001"
    
    var tokenServer: String {
        useCloudMode ? cloudTokenServer : localTokenServer
    }
    
    // MARK: - LiveKit

    private var room: Room?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Context Updates

    /// Timer for periodic context updates to the agent
    private var contextUpdateTimer: Timer?

    /// How often to send context updates (seconds)
    /// NOTE: 5 seconds provides good real-time responsiveness without overwhelming the data channel
    private let contextUpdateInterval: TimeInterval = 5.0
    
    // Audio processing
    private var audioLevelTimer: Timer?
    
    // Session info
    private var roomName: String?
    private var sessionId: String?
    
    /// Selected audio input device (synced with Settings via UserDefaults)
    private var selectedInputDevice: String {
        UserDefaults.standard.string(forKey: "selectedInputDevice") ?? ""
    }
    
    // MARK: - Initialization
    
    init() {
        // Set default cloud mode on first launch
        if !UserDefaults.standard.bool(forKey: "hasLaunched") {
            UserDefaults.standard.set(true, forKey: "hasLaunched")
            useCloudMode = true
        }
    }
    
    deinit {
        audioLevelTimer?.invalidate()
    }
    
    // MARK: - Connection
    
    @MainActor
    func start() async {
        guard state == .disconnected || isErrorState else {
            sessionLog.debug("Start called but state is \(String(describing: self.state))")
            return
        }

        sessionLog.info("Starting voice session (mode: \(self.useCloudMode ? "cloud" : "local"))")
        sessionLog.info("Token server: \(self.tokenServer)")

        state = .connecting
        connectionProgress = "Checking connection..."
        retryCount = 0

        // Health check first
        sessionLog.info("Checking server health...")
        guard await checkServerHealth() else {
            sessionLog.error("Health check failed - server unavailable")
            state = .error("Server unavailable")
            return
        }
        sessionLog.info("Health check passed")

        connectionProgress = "Getting access token..."

        // Fetch token
        sessionLog.info("Fetching token...")
        guard let tokenData = await fetchToken() else {
            sessionLog.error("Failed to fetch token")
            state = .error("Failed to get token")
            return
        }

        sessionLog.info("Got token for room: \(tokenData.room)")
        sessionLog.debug("LiveKit URL: \(tokenData.url)")

        roomName = tokenData.room
        sessionId = tokenData.sessionId

        connectionProgress = "Connecting to voice server..."

        // Configure for AUDIO-ONLY operation
        // Use defaults but ensure suspendLocalVideoTracksInBackground is true to minimize video handling
        let roomOptions = RoomOptions(
            suspendLocalVideoTracksInBackground: true
        )

        // Create room with delegate
        // NOTE: Room() triggers DeviceManager.prepare() which initializes AVCaptureDeviceDiscoverySession
        // on a background thread. This can race with SwiftUI rendering causing crashes on macOS.
        let room = Room(delegate: self, roomOptions: roomOptions)
        self.room = room

        // CRITICAL: Give DeviceManager time to complete background initialization
        // This prevents race conditions between WebRTC threads and SwiftUI rendering
        // See: client-sdk-swift/Sources/LiveKit/Support/DeviceManager.swift
        sessionLog.debug("Waiting for DeviceManager initialization...")
        try? await Task.sleep(nanoseconds: 200_000_000) // 200ms - enough for background init

        // Connect
        do {
            sessionLog.info("Connecting to LiveKit...")
            try await room.connect(url: tokenData.url, token: tokenData.token)
            sessionLog.info("Connected to LiveKit room")

            // Small delay to let room fully initialize before enabling mic
            try? await Task.sleep(nanoseconds: 200_000_000) // 200ms

            connectionProgress = "Starting microphone..."

            // Enable microphone with retry logic to handle race conditions
            var micEnabled = false
            for attempt in 1...3 {
                do {
                    sessionLog.info("Enabling microphone (attempt \(attempt))")
                    try await room.localParticipant.setMicrophone(enabled: true)
                    micEnabled = true
                    sessionLog.info("Microphone enabled successfully")
                    break
                } catch {
                    sessionLog.warning("Microphone attempt \(attempt) failed: \(error.localizedDescription)")
                    if attempt < 3 {
                        try? await Task.sleep(nanoseconds: 500_000_000) // 500ms between retries
                    }
                }
            }

            guard micEnabled else {
                sessionLog.error("Failed to enable microphone after 3 attempts")
                state = .error("Failed to enable microphone")
                connectionProgress = ""
                await room.disconnect()
                self.room = nil
                return
            }

            connectionProgress = "Waiting for agent..."

            // Wait briefly for agent to join
            try? await Task.sleep(nanoseconds: 500_000_000)

            state = .connected
            connectionProgress = ""
            startAudioLevelMonitoring()
            playSound("connect")

            sessionLog.info("✅ Voice session connected to room: \(tokenData.room)")

            // Send initial macOS context to agent
            await sendMacOSContext()

            // Start periodic context updates
            startContextUpdateTimer()

        } catch {
            sessionLog.error("Connection failed: \(error.localizedDescription)")
            state = .error("Connection failed")
            connectionProgress = ""
            await room.disconnect()
            self.room = nil
        }
    }
    
    @MainActor
    func stop() async {
        playSound("disconnect")
        await disconnect()
        state = .disconnected
        connectionProgress = ""
    }
    
    @MainActor
    func toggle() async {
        if state.isActive {
            await stop()
        } else {
            await start()
        }
    }
    
    @MainActor
    private func disconnect() async {
        sessionLog.info("Disconnecting session...")

        // Stop timers first
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
        stopContextUpdateTimer()

        // Clear room reference BEFORE disconnecting to prevent delegate callbacks
        // from accessing stale state
        guard let currentRoom = room else {
            roomName = nil
            sessionId = nil
            sessionLog.debug("No room to disconnect")
            return
        }

        // Clear our reference immediately to prevent race conditions
        room = nil
        roomName = nil
        sessionId = nil

        // Disable microphone with error handling (avoid crash)
        do {
            try await currentRoom.localParticipant.setMicrophone(enabled: false)
        } catch {
            sessionLog.warning("Error disabling mic during disconnect: \(error.localizedDescription)")
        }

        // Disconnect room - this may trigger delegate callbacks but we've already
        // set room = nil so delegate methods will safely exit
        await currentRoom.disconnect()

        sessionLog.info("Disconnected successfully")
    }
    
    private var isErrorState: Bool {
        if case .error = state { return true }
        return false
    }
    
    // MARK: - Health Check

    private func checkServerHealth() async -> Bool {
        let healthUrl = "\(tokenServer)/health"
        sessionLog.debug("Health check URL: \(healthUrl)")

        guard let url = URL(string: healthUrl) else {
            sessionLog.error("Invalid health check URL: \(healthUrl)")
            return false
        }

        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse {
                let statusOK = httpResponse.statusCode == 200
                sessionLog.debug("Health check status: \(httpResponse.statusCode)")
                return statusOK
            }
        } catch {
            sessionLog.error("Health check network error: \(error.localizedDescription)")
        }
        return false
    }

    // MARK: - Token Fetch

    private struct TokenResponse: Decodable {
        let token: String
        let url: String
        let room: String
        let sessionId: String?
    }

    private func fetchToken() async -> TokenResponse? {
        let room = "ferni-\(UUID().uuidString.prefix(8))"
        let username = "user-\(UUID().uuidString.prefix(8))"
        let tokenUrl = "\(tokenServer)/token?room=\(room)&username=\(username)&persona_id=\(currentPersonaId)"

        sessionLog.debug("Token request URL: \(tokenUrl)")

        guard let url = URL(string: tokenUrl) else {
            sessionLog.error("Invalid token URL: \(tokenUrl)")
            return nil
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            if let httpResponse = response as? HTTPURLResponse {
                sessionLog.debug("Token response status: \(httpResponse.statusCode)")
                if httpResponse.statusCode != 200 {
                    sessionLog.error("Token request failed with status \(httpResponse.statusCode)")
                    if let bodyStr = String(data: data, encoding: .utf8) {
                        sessionLog.error("Response body: \(bodyStr)")
                    }
                    return nil
                }
            }

            var tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
            sessionLog.debug("Token decoded - LiveKit URL: \(tokenResponse.url)")

            // Ensure room name is set
            if tokenResponse.room.isEmpty {
                tokenResponse = TokenResponse(token: tokenResponse.token, url: tokenResponse.url, room: room, sessionId: tokenResponse.sessionId)
            }
            return tokenResponse
        } catch {
            sessionLog.error("Token fetch error: \(error.localizedDescription)")
            return nil
        }
    }
    
    // MARK: - Audio Level Monitoring
    
    private func startAudioLevelMonitoring() {
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateAudioLevels()
            }
        }
    }
    
    private func updateAudioLevels() {
        // Simulate audio levels based on voice state
        // (LiveKit SDK doesn't directly expose audio levels on tracks)
        // NOTE: All active states use same level - no listening/speaking distinction
        let baseLevel: Float
        switch state {
        case .connected, .listening, .speaking:
            // All active conversation states use same base level
            baseLevel = 0.5
        default:
            baseLevel = 0.1
        }
        
        // Create organic waveform visualization
        let time = Float(Date().timeIntervalSince1970)
        audioLevels = (0..<8).map { i in
            let phase = Float(i) * 0.2
            let wave = sin(time * 8 + phase) * 0.1
            let variation = Float.random(in: -0.05...0.1)
            return max(0.1, min(1.0, baseLevel + wave + variation))
        }
        
        // Update voice state based on remote participant activity
        updateStateFromAudio()
    }
    
    private func hasAgentAudio() -> Bool {
        guard let room = room else { return false }
        
        for participant in room.remoteParticipants.values {
            let identityString = participant.identity?.stringValue ?? ""
            if identityString.contains("agent") {
                // Check if agent has audio tracks
                for publication in participant.trackPublications.values {
                    if publication.kind == .audio && publication.track != nil {
                        return true
                    }
                }
            }
        }
        return false
    }
    
    private func updateStateFromAudio() {
        // State is primarily managed by transcription events
        // This just provides a fallback for silence detection
        guard state.isActive && !isHandoffInProgress else { return }
        
        // Check if agent has audio - indicates speaking
        if hasAgentAudio() && state == .connected {
            // Agent joined and has audio capability
        }
    }
    
    // MARK: - Persona Switching (via TypeScript agent)
    
    /// Request handoff to another persona (sends message to TypeScript agent)
    func requestHandoff(to personaId: String) async {
        guard let room = room, state.isActive else { return }
        
        // Send handoff request to TypeScript agent
        let message: [String: Any] = [
            "type": ClientMessageType.handoffRequest.rawValue,
            "target": personaId,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            try await room.localParticipant.publish(data: data, options: DataPublishOptions(reliable: true))
            sessionLog.info("Sent handoff request for: \(personaId)")
        } catch {
            sessionLog.error("Failed to send handoff request: \(error.localizedDescription)")
        }
    }
    
    /// Cancel an in-progress handoff
    func cancelHandoff() async {
        guard let room = room, isHandoffInProgress else { return }
        
        let message: [String: Any] = [
            "type": ClientMessageType.handoffCancel.rawValue,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            try await room.localParticipant.publish(data: data, options: DataPublishOptions(reliable: true))
            
            // Reset local state
            isHandoffInProgress = false
            handoffTargetPersona = nil
            handoffBanter = nil
        } catch {
            sessionLog.error("Failed to cancel handoff: \(error.localizedDescription)")
        }
    }
    
    /// Switch persona directly (disconnects and reconnects with new persona)
    @MainActor
    func switchPersona(_ personaId: String) async {
        // Option 1: Request handoff through TypeScript agent (preserves context)
        await requestHandoff(to: personaId)
        
        // Option 2: Hard switch (disconnects, loses context)
        // Uncomment if you want immediate switch without agent involvement:
        /*
        let wasActive = state.isActive
        if wasActive {
            await stop()
        }
        currentPersonaId = personaId
        if wasActive {
            try? await Task.sleep(nanoseconds: 300_000_000)
            await start()
        }
        */
    }
    
    // MARK: - Data Channel Message Handling
    
    private func handleDataMessage(_ data: Data, from participant: RemoteParticipant?) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        
        // Try to parse as JSON
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }
        
        sessionLog.debug("Received data message: \(type)")
        
        switch type {
        case AgentMessageType.handoffStarted.rawValue:
            handleHandoffStarted(json)
            
        case AgentMessageType.handoffComplete.rawValue:
            handleHandoffComplete(json)
            
        case AgentMessageType.handoffProgress.rawValue:
            // Heartbeat during handoff - UI can show progress
            break
            
        case AgentMessageType.handoffFailed.rawValue:
            handleHandoffFailed(json)
            
        case AgentMessageType.mood.rawValue:
            handleMoodUpdate(json)
            
        case AgentMessageType.emotionEvent.rawValue:
            handleEmotionEvent(json)
            
        case AgentMessageType.partialTranscript.rawValue:
            handlePartialTranscript(json)
            
        case AgentMessageType.speakerChanged.rawValue:
            // Multi-speaker detection
            if let speaker = json["speaker"] as? String {
                sessionLog.debug("Speaker changed: \(speaker)")
            }
            
        case AgentMessageType.celebrationEvent.rawValue:
            handleCelebration(json)
            
        default:
            sessionLog.debug("Unknown message type: \(type)")
        }
    }
    
    private func handleHandoffStarted(_ json: [String: Any]) {
        guard let newAgent = json["newAgent"] as? String else { return }
        
        isHandoffInProgress = true
        handoffTargetPersona = newAgent
        handoffBanter = json["softOpenBanter"] as? String
        state = .thinking  // Show "thinking" state during handoff
        
        if json["playSound"] as? Bool == true {
            playSound("handoff")
        }
        
        sessionLog.info("Handoff started: \(self.currentPersonaId) → \(newAgent)")
    }
    
    private func handleHandoffComplete(_ json: [String: Any]) {
        guard let newAgent = json["newAgent"] as? String else { return }
        
        // Update to new persona
        currentPersonaId = newAgent
        isHandoffInProgress = false
        handoffTargetPersona = nil
        handoffBanter = nil
        state = .connected
        
        // Add greeting to transcriptions if provided
        if let greeting = json["greeting"] as? String {
            addTranscription(speaker: PersonaRegistry.get(newAgent).name, text: greeting, isAgent: true)
        }
        
        sessionLog.info("Handoff complete: now \(newAgent)")
    }
    
    private func handleHandoffFailed(_ json: [String: Any]) {
        let error = json["error"] as? String ?? "Handoff failed"
        
        isHandoffInProgress = false
        handoffTargetPersona = nil
        handoffBanter = nil
        state = .connected
        
        sessionLog.warning("Handoff failed: \(error)")
    }
    
    private func handleMoodUpdate(_ json: [String: Any]) {
        if let moodState = json["state"] as? String {
            currentMood = moodState
        }
        if let energy = json["energyLevel"] as? Double {
            energyLevel = energy
        }
        if let stage = json["relationshipStage"] as? String {
            relationshipStage = stage
        }
    }
    
    private func handleEmotionEvent(_ json: [String: Any]) {
        // Forward to avatar for expression
        // This enables Ferni EQ "better than human" expressions
        if let emotion = json["emotion"] as? String {
            sessionLog.debug("Emotion event: \(emotion)")
            // Trigger avatar expression via notification
            NotificationCenter.default.post(
                name: NSNotification.Name("FerniEmotionEvent"),
                object: nil,
                userInfo: json
            )
        }
    }
    
    private func handlePartialTranscript(_ json: [String: Any]) {
        guard let text = json["text"] as? String, !text.isEmpty else { return }
        let isAgent = json["isAgent"] as? Bool ?? false
        
        // Update UI with partial transcript (could show in real-time)
        // For now, only add final transcripts
    }
    
    private func handleCelebration(_ json: [String: Any]) {
        // Handle celebration events (milestones, achievements)
        if let celebrationType = json["celebration"] as? String {
            sessionLog.info("Celebration: \(celebrationType)")
            playSound("celebration")
        }
    }

    // MARK: - macOS Context Updates

    /// Start periodic context updates to keep the agent informed
    @MainActor
    private func startContextUpdateTimer() {
        // Invalidate any existing timer
        contextUpdateTimer?.invalidate()
        contextUpdateTimer = nil

        // Create a timer that fires on the main run loop
        // Use weak self to prevent retain cycles
        contextUpdateTimer = Timer.scheduledTimer(withTimeInterval: contextUpdateInterval, repeats: true) { [weak self] _ in
            guard let self = self, self.state.isActive else { return }
            // Don't create nested Tasks - just dispatch directly
            Task { @MainActor [weak self] in
                await self?.sendMacOSContext()
            }
        }
        sessionLog.info("Started context update timer (every \(Int(self.contextUpdateInterval))s)")
    }

    /// Stop the context update timer
    @MainActor
    private func stopContextUpdateTimer() {
        contextUpdateTimer?.invalidate()
        contextUpdateTimer = nil
    }

    // MARK: - macOS Context Sending

    /// Send macOS system context to the TypeScript agent
    func sendMacOSContext() async {
        guard let room = room, state.isActive else { return }

        let manager = SystemIntelligenceManager.shared

        // Build context payload
        var payload: [String: Any] = [
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]

        // Context Awareness
        if let snapshot = manager.lastContextSnapshot {
            payload["activeApp"] = snapshot.activeApp
            payload["windowTitle"] = snapshot.windowTitle
            if let selectedText = snapshot.selectedText {
                payload["selectedText"] = String(selectedText.prefix(500))
            }
        }

        // Calendar Context
        let calendarContext = manager.calendarService.getCalendarContext()
        payload["todaysEventCount"] = calendarContext["todaysEventCount"] ?? 0
        payload["isInMeeting"] = calendarContext["isInMeeting"] ?? false
        if let upcoming = calendarContext["upcomingEvent"] {
            payload["upcomingEvent"] = upcoming
        }
        if let current = calendarContext["currentMeeting"] {
            payload["currentMeeting"] = current
        }

        // Focus Mode
        let focusContext = manager.focusModeService.getFocusContext()
        payload["isFocused"] = focusContext["isFocused"] ?? false
        if let focusMode = focusContext["focusMode"] {
            payload["focusMode"] = focusMode
        }

        // Contacts (birthdays)
        let contactsContext = manager.contactsService.getContactsContext()
        if let birthdays = contactsContext["upcomingBirthdays"] as? [[String: Any]], !birthdays.isEmpty {
            payload["upcomingBirthdays"] = birthdays
        }

        // Location
        let locationContext = manager.locationService.getLocationContext()
        if let location = locationContext["location"] {
            payload["location"] = location
        }
        if locationContext["isCommuting"] as? Bool == true {
            payload["isCommuting"] = true
        }

        // Screen Time
        let screenTimeContext = manager.screenTimeService.getScreenTimeContext()
        payload["totalMinutesToday"] = screenTimeContext["totalMinutesToday"] ?? 0
        if let topApp = screenTimeContext["topApp"] {
            payload["topApp"] = topApp
        }
        if screenTimeContext["needsBreak"] as? Bool == true {
            payload["needsBreak"] = true
            payload["currentSessionMinutes"] = screenTimeContext["currentSessionMinutes"] ?? 0
        }

        // Wrap in message
        let message: [String: Any] = [
            "type": ClientMessageType.macosContext.rawValue,
            "payload": payload
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            try await room.localParticipant.publish(data: data, options: DataPublishOptions(reliable: true))
            sessionLog.debug("Sent macOS context to agent")
        } catch {
            sessionLog.warning("Failed to send macOS context: \(error.localizedDescription)")
        }
    }

    /// Send context with specific selected text (for "Help me with this" hotkey)
    func sendContextWithSelectedText(_ selectedText: String) async {
        guard let room = room, state.isActive else { return }

        let manager = SystemIntelligenceManager.shared

        var payload: [String: Any] = [
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "selectedText": String(selectedText.prefix(1000))
        ]

        // Add current context
        if let snapshot = manager.lastContextSnapshot {
            payload["activeApp"] = snapshot.activeApp
            payload["windowTitle"] = snapshot.windowTitle
        }

        let message: [String: Any] = [
            "type": ClientMessageType.macosContext.rawValue,
            "payload": payload,
            "helpMeWithThis": true
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            try await room.localParticipant.publish(data: data, options: DataPublishOptions(reliable: true))
            sessionLog.info("Sent 'Help me with this' context")
        } catch {
            sessionLog.warning("Failed to send context: \(error.localizedDescription)")
        }
    }

    // MARK: - Transcription Handling
    
    func handleTranscription(_ text: String, isAgent: Bool, isFinal: Bool) {
        guard isFinal && !text.isEmpty else { return }

        let speaker = isAgent ? currentPersona.name : "You"
        addTranscription(speaker: speaker, text: text, isAgent: isAgent)

        // CRITICAL: Do NOT change state on every transcription!
        // This was causing the "flickering" - rapid state changes between
        // .listening and .speaking on every message.
        //
        // Instead, stay in .connected during active conversation.
        // The VoiceOrb generates its own smooth animation internally
        // and doesn't need state changes to look alive.
        //
        // State should only change for:
        // - connect/disconnect
        // - handoffs
        // - errors
    }
    
    private func addTranscription(speaker: String, text: String, isAgent: Bool) {
        transcriptions.append(TranscriptionEntry(
            speaker: speaker,
            text: text,
            isAgent: isAgent,
            timestamp: Date()
        ))
        
        // Keep only last 50
        if transcriptions.count > 50 {
            transcriptions.removeFirst()
        }
    }
    
    // MARK: - Sound Effects
    
    private var audioPlayer: AVAudioPlayer?
    
    private func playSound(_ name: String) {
        let paths = [
            Bundle.main.resourcePath.map { "\($0)/sounds/\(name).mp3" },
            NSHomeDirectory() + "/Documents/voiceai/design-system/assets/sounds/\(name).mp3"
        ].compactMap { $0 }
        
        guard let path = paths.first(where: { FileManager.default.fileExists(atPath: $0) }) else {
            return
        }
        
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
            audioPlayer?.play()
        } catch {
            sessionLog.warning("Sound error: \(error.localizedDescription)")
        }
    }
}

// MARK: - Room Delegate
//
// CRITICAL: All delegate methods are nonisolated and called from WebRTC threads.
// We must be careful with Swift continuations and async/await bridging:
// 1. Always capture [weak self] to avoid retain cycles and crashes during deallocation
// 2. Avoid recursive calls (like calling start() from a delegate)
// 3. Don't hold references to room during async operations

extension NativeLiveKitSession: RoomDelegate {

    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        // IMPORTANT: Capture data synchronously, then dispatch to main actor
        // Avoid calling async methods that could trigger continuation issues
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            // Safety: check if we're still tracking this room (not disconnected)
            guard self.room != nil else {
                sessionLog.debug("Ignoring connection state change - room already cleared")
                return
            }

            switch connectionState {
            case .connected:
                self.connectionProgress = ""
                self.retryCount = 0
                sessionLog.info("Connection state: connected")

            case .disconnected:
                sessionLog.info("Connection state: disconnected")
                // Don't auto-reconnect from delegate - let user retry manually
                // Auto-reconnect causes continuation crashes due to recursive async calls
                if self.state.isActive {
                    self.state = .disconnected
                    self.connectionProgress = "Disconnected"
                }

            case .reconnecting:
                self.connectionProgress = "Reconnecting..."
                sessionLog.info("Connection state: reconnecting")

            default:
                break
            }
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication, track: Track) {
        if track.kind == .audio {
            sessionLog.info("Subscribed to agent audio")
        }
    }

    nonisolated func room(_ room: Room, participant: Participant, trackPublication: TrackPublication, didReceiveTranscriptionSegments segments: [TranscriptionSegment]) {
        // Capture segment data synchronously before dispatching
        let identityString = participant.identity?.stringValue ?? ""
        let isAgent = identityString.contains("agent")
        let segmentData = segments.map { (text: $0.text, isFinal: $0.isFinal) }

        Task { @MainActor [weak self] in
            guard let self = self, self.room != nil else { return }
            for segment in segmentData {
                self.handleTranscription(segment.text, isAgent: isAgent, isFinal: segment.isFinal)
            }
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant?, didReceiveData data: Data, forTopic topic: String, encryptionType: EncryptionType) {
        // Capture data synchronously - Data is a value type so this is safe
        let dataCopy = data

        Task { @MainActor [weak self] in
            guard let self = self, self.room != nil else { return }
            self.handleDataMessage(dataCopy, from: participant)
        }
    }
}

#else

// MARK: - Placeholder (LiveKit SDK not available)

/// Placeholder that prints instructions when LiveKit SDK is not enabled
class NativeLiveKitSession: ObservableObject {
    @Published var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni"
    @Published var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published var transcriptions: [TranscriptionEntry] = []
    @Published var connectionProgress: String = ""
    @Published var retryCount: Int = 0
    @Published var isHandoffInProgress: Bool = false
    @Published var currentMood: String = "neutral"
    @Published var energyLevel: Double = 0.5
    @Published var relationshipStage: String = "new"
    
    var currentPersona: Persona { PersonaRegistry.get(currentPersonaId) }
    var useCloudMode: Bool { 
        get { true }
        set { }
    }
    var tokenServer: String { "https://app.ferni.ai" }
    
    init() {
        print("""
        ╔════════════════════════════════════════════════════════════════╗
        ║  LiveKit SDK Not Enabled                                       ║
        ╠════════════════════════════════════════════════════════════════╣
        ║  To enable native voice:                                       ║
        ║                                                                ║
        ║  1. Edit Package.swift and uncomment:                          ║
        ║     .package(url: "https://github.com/livekit/client-sdk-swift"║
        ║                                                                ║
        ║  2. Run: swift package resolve                                 ║
        ║                                                                ║
        ║  3. Rebuild: ./build.sh                                        ║
        ║                                                                ║
        ║  Using CLI subprocess fallback instead.                        ║
        ╚════════════════════════════════════════════════════════════════╝
        """)
    }
    
    @MainActor
    func start() async {
        state = .error("Enable LiveKit SDK in Package.swift")
    }
    
    @MainActor
    func stop() async {
        state = .disconnected
    }
    
    @MainActor
    func toggle() async {
        await start()
    }
    
    @MainActor
    func switchPersona(_ id: String) async {
        currentPersonaId = id
    }
    
    func requestHandoff(to personaId: String) async {}
    func cancelHandoff() async {}
}

#endif

// MARK: - State Extension

extension VoiceState {
    var isError: Bool {
        if case .error = self { return true }
        return false
    }
}
