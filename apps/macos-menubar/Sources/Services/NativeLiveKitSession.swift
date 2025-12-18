import Foundation
import AVFoundation
import Combine

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
        guard state == .disconnected || isErrorState else { return }
        
        state = .connecting
        connectionProgress = "Checking connection..."
        retryCount = 0
        
        // Health check first
        guard await checkServerHealth() else {
            state = .error("Server unavailable")
            return
        }
        
        connectionProgress = "Getting access token..."
        
        // Fetch token
        guard let tokenData = await fetchToken() else {
            state = .error("Failed to get token")
            return
        }
        
        roomName = tokenData.room
        sessionId = tokenData.sessionId
        
        connectionProgress = "Connecting to voice server..."
        
        // Create room with delegate
        let room = Room(delegate: self)
        self.room = room
        
        // Connect
        do {
            try await room.connect(url: tokenData.url, token: tokenData.token)
            
            // Small delay to let room fully initialize before enabling mic
            try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
            
            connectionProgress = "Starting microphone..."
            
            // Enable microphone with retry logic to handle race conditions
            var micEnabled = false
            for attempt in 1...3 {
                do {
                    try await room.localParticipant.setMicrophone(enabled: true)
                    micEnabled = true
                    break
                } catch {
                    print("[NativeLK] Microphone attempt \(attempt) failed: \(error)")
                    if attempt < 3 {
                        try? await Task.sleep(nanoseconds: 500_000_000) // 500ms between retries
                    }
                }
            }
            
            guard micEnabled else {
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
            
            print("[NativeLK] Connected to room: \(tokenData.room)")
            
        } catch {
            state = .error("Connection failed")
            connectionProgress = ""
            print("[NativeLK] Connection error: \(error)")
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
    
    private func disconnect() async {
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
        
        guard let currentRoom = room else {
            roomName = nil
            sessionId = nil
            return
        }
        
        // Disable microphone with error handling (avoid crash)
        do {
            try await currentRoom.localParticipant.setMicrophone(enabled: false)
        } catch {
            print("[NativeLK] Error disabling mic during disconnect: \(error)")
        }
        
        // Disconnect room
        await currentRoom.disconnect()
        room = nil
        roomName = nil
        sessionId = nil
    }
    
    private var isErrorState: Bool {
        if case .error = state { return true }
        return false
    }
    
    // MARK: - Health Check
    
    private func checkServerHealth() async -> Bool {
        guard let url = URL(string: "\(tokenServer)/health") else { return false }
        
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode == 200
            }
        } catch {
            print("[NativeLK] Health check failed: \(error)")
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
        
        guard let url = URL(string: "\(tokenServer)/token?room=\(room)&username=\(username)&persona_id=\(currentPersonaId)") else {
            return nil
        }
        
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            var response = try JSONDecoder().decode(TokenResponse.self, from: data)
            // Ensure room name is set
            if response.room.isEmpty {
                response = TokenResponse(token: response.token, url: response.url, room: room, sessionId: response.sessionId)
            }
            return response
        } catch {
            print("[NativeLK] Token fetch error: \(error)")
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
        let baseLevel: Float
        switch state {
        case .speaking:
            baseLevel = 0.6
        case .listening:
            baseLevel = 0.4
        case .connected:
            baseLevel = 0.2
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
            print("[NativeLK] Sent handoff request for: \(personaId)")
        } catch {
            print("[NativeLK] Failed to send handoff request: \(error)")
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
            print("[NativeLK] Failed to cancel handoff: \(error)")
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
        
        print("[NativeLK] Received: \(type)")
        
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
                print("[NativeLK] Speaker changed: \(speaker)")
            }
            
        case AgentMessageType.celebrationEvent.rawValue:
            handleCelebration(json)
            
        default:
            print("[NativeLK] Unknown message type: \(type)")
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
        
        print("[NativeLK] Handoff started: \(currentPersonaId) → \(newAgent)")
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
        
        print("[NativeLK] Handoff complete: now \(newAgent)")
    }
    
    private func handleHandoffFailed(_ json: [String: Any]) {
        let error = json["error"] as? String ?? "Handoff failed"
        
        isHandoffInProgress = false
        handoffTargetPersona = nil
        handoffBanter = nil
        state = .connected
        
        print("[NativeLK] Handoff failed: \(error)")
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
            print("[NativeLK] Emotion event: \(emotion)")
            // TODO: Trigger avatar expression via notification
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
            print("[NativeLK] Celebration: \(celebrationType)")
            playSound("celebration")
        }
    }
    
    // MARK: - Transcription Handling
    
    func handleTranscription(_ text: String, isAgent: Bool, isFinal: Bool) {
        guard isFinal && !text.isEmpty else { return }
        
        let speaker = isAgent ? currentPersona.name : "You"
        addTranscription(speaker: speaker, text: text, isAgent: isAgent)
        
        // Update state
        if isAgent {
            state = .speaking
        } else {
            state = .listening
        }
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
            print("[NativeLK] Sound error: \(error)")
        }
    }
}

// MARK: - Room Delegate

extension NativeLiveKitSession: RoomDelegate {
    
    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        Task { @MainActor in
            switch connectionState {
            case .connected:
                connectionProgress = ""
                retryCount = 0  // Reset retry count on successful connection
            case .disconnected:
                if state.isActive {
                    // Auto-reconnect on unexpected disconnect
                    if retryCount < 3 {
                        retryCount += 1
                        connectionProgress = "Reconnecting (attempt \(retryCount))..."
                        // Delay before retry
                        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
                        await start()  // Try to reconnect
                    } else {
                        state = .error("Connection lost")
                        connectionProgress = "Connection lost after 3 attempts"
                    }
                }
            case .reconnecting:
                connectionProgress = "Reconnecting..."
            default:
                break
            }
        }
    }
    
    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication, track: Track) {
        if track.kind == .audio {
            print("[NativeLK] Subscribed to agent audio")
        }
    }
    
    nonisolated func room(_ room: Room, participant: Participant, trackPublication: TrackPublication, didReceiveTranscriptionSegments segments: [TranscriptionSegment]) {
        let identityString = participant.identity?.stringValue ?? ""
        let isAgent = identityString.contains("agent")
        
        for segment in segments {
            Task { @MainActor in
                handleTranscription(segment.text, isAgent: isAgent, isFinal: segment.isFinal)
            }
        }
    }
    
    nonisolated func room(_ room: Room, participant: RemoteParticipant?, didReceiveData data: Data, forTopic topic: String, encryptionType: EncryptionType) {
        Task { @MainActor in
            handleDataMessage(data, from: participant)
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
