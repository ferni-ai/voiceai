import Foundation
import AVFoundation
import Combine
import os.log
import FerniShared

#if canImport(LiveKit)
import LiveKit
#endif

private let sessionLog = Logger(subsystem: "com.ferni.voice.ios", category: "LiveKit")

// MARK: - Transcript Message

struct TranscriptMessage: Identifiable {
    let id = UUID()
    let text: String
    let isAgent: Bool
    let personaId: String
    let timestamp: Date
}

// MARK: - iOS LiveKit Voice Session
/// Native iOS implementation using LiveKit's Swift SDK.
/// Handles AVAudioSession configuration for iOS voice chat.

class IOSLiveKitSession: ObservableObject {

    // MARK: - Published State

    @Published private(set) var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni"
    @Published private(set) var transcriptMessages: [TranscriptMessage] = []
    @Published private(set) var isMuted: Bool = false
    @Published private(set) var connectionProgress: String = ""

    // Handoff state
    @Published private(set) var isHandoffInProgress: Bool = false
    @Published private(set) var handoffTargetPersona: String?

    var currentPersona: Persona {
        PersonaRegistry.get(currentPersonaId)
    }

    // MARK: - Configuration

    private let tokenServer = "https://app.ferni.ai"

    // MARK: - LiveKit

    #if canImport(LiveKit)
    private var room: Room?
    #endif

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {
        setupAudioSession()
    }

    // MARK: - Audio Session Setup

    private func setupAudioSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
            )
            sessionLog.info("Audio session configured for voice chat")
        } catch {
            sessionLog.error("Failed to configure audio session: \(error.localizedDescription)")
        }
        #endif
    }

    private func activateAudioSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(true)
            sessionLog.info("Audio session activated")
        } catch {
            sessionLog.error("Failed to activate audio session: \(error.localizedDescription)")
        }
        #endif
    }

    private func deactivateAudioSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            sessionLog.info("Audio session deactivated")
        } catch {
            sessionLog.warning("Failed to deactivate audio session: \(error.localizedDescription)")
        }
        #endif
    }

    // MARK: - Connection

    @MainActor
    func connect() async {
        guard state == .disconnected || isErrorState else {
            sessionLog.debug("Connect called but state is \(String(describing: self.state))")
            return
        }

        sessionLog.info("Starting voice session")
        state = .connecting
        connectionProgress = "Checking connection..."

        // Health check
        guard await checkServerHealth() else {
            sessionLog.error("Health check failed")
            state = .error("Server unavailable")
            return
        }

        connectionProgress = "Getting access token..."

        // Fetch token
        guard let tokenData = await fetchToken() else {
            sessionLog.error("Failed to fetch token")
            state = .error("Failed to get token")
            return
        }

        sessionLog.info("Got token for room: \(tokenData.room)")
        connectionProgress = "Connecting to voice server..."

        // Activate audio session
        activateAudioSession()

        #if canImport(LiveKit)
        // Create and connect to room
        let roomOptions = RoomOptions(
            suspendLocalVideoTracksInBackground: true
        )

        let room = Room(delegate: self, roomOptions: roomOptions)
        self.room = room

        // Wait for initialization
        try? await Task.sleep(nanoseconds: 200_000_000)

        do {
            try await room.connect(url: tokenData.url, token: tokenData.token)
            sessionLog.info("Connected to LiveKit room")

            try? await Task.sleep(nanoseconds: 200_000_000)

            connectionProgress = "Starting microphone..."

            // Enable microphone
            var micEnabled = false
            for attempt in 1...3 {
                do {
                    try await room.localParticipant.setMicrophone(enabled: true)
                    micEnabled = true
                    sessionLog.info("Microphone enabled")
                    break
                } catch {
                    sessionLog.warning("Microphone attempt \(attempt) failed: \(error.localizedDescription)")
                    if attempt < 3 {
                        try? await Task.sleep(nanoseconds: 500_000_000)
                    }
                }
            }

            guard micEnabled else {
                sessionLog.error("Failed to enable microphone")
                state = .error("Microphone unavailable")
                connectionProgress = ""
                await room.disconnect()
                self.room = nil
                deactivateAudioSession()
                return
            }

            connectionProgress = ""
            state = .connected
            sessionLog.info("Voice session connected")

        } catch {
            sessionLog.error("Connection failed: \(error.localizedDescription)")
            state = .error("Connection failed")
            connectionProgress = ""
            await room.disconnect()
            self.room = nil
            deactivateAudioSession()
        }
        #else
        // LiveKit not available - show error
        state = .error("LiveKit SDK not available")
        connectionProgress = ""
        #endif
    }

    @MainActor
    func disconnect() {
        sessionLog.info("Disconnecting session...")

        #if canImport(LiveKit)
        guard let currentRoom = room else {
            state = .disconnected
            return
        }

        room = nil

        Task {
            do {
                try await currentRoom.localParticipant.setMicrophone(enabled: false)
            } catch {
                sessionLog.warning("Error disabling mic: \(error.localizedDescription)")
            }
            await currentRoom.disconnect()
        }
        #endif

        state = .disconnected
        connectionProgress = ""
        isMuted = false
        deactivateAudioSession()
    }

    private var isErrorState: Bool {
        if case .error = state { return true }
        return false
    }

    // MARK: - Mute Toggle

    func toggleMute() {
        #if canImport(LiveKit)
        guard let room = room else { return }

        isMuted.toggle()

        Task {
            do {
                try await room.localParticipant.setMicrophone(enabled: !isMuted)
                sessionLog.info("Microphone \(self.isMuted ? "muted" : "unmuted")")
            } catch {
                sessionLog.error("Failed to toggle mute: \(error.localizedDescription)")
            }
        }
        #endif
    }

    // MARK: - Persona Switching

    @MainActor
    func switchPersona(_ personaId: String) async {
        #if canImport(LiveKit)
        guard let room = room, state.isActive else { return }

        // Request handoff through data channel
        let message: [String: Any] = [
            "type": "handoff_request",
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
        #else
        // Without LiveKit, just update the persona ID locally
        currentPersonaId = personaId
        #endif
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
            sessionLog.error("Health check error: \(error.localizedDescription)")
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
        let room = "ferni-ios-\(UUID().uuidString.prefix(8))"
        let username = "ios-\(UUID().uuidString.prefix(8))"
        let tokenUrl = "\(tokenServer)/token?room=\(room)&username=\(username)&persona_id=\(currentPersonaId)"

        guard let url = URL(string: tokenUrl) else { return nil }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                sessionLog.error("Token request failed with status \(httpResponse.statusCode)")
                return nil
            }

            return try JSONDecoder().decode(TokenResponse.self, from: data)
        } catch {
            sessionLog.error("Token fetch error: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Transcription Handling

    private func handleTranscription(_ text: String, isAgent: Bool, isFinal: Bool) {
        guard isFinal && !text.isEmpty else { return }

        let message = TranscriptMessage(
            text: text,
            isAgent: isAgent,
            personaId: currentPersonaId,
            timestamp: Date()
        )

        DispatchQueue.main.async {
            self.transcriptMessages.append(message)

            // Keep only last 50 messages
            if self.transcriptMessages.count > 50 {
                self.transcriptMessages.removeFirst()
            }
        }
    }

    // MARK: - Data Channel Handling

    private func handleDataMessage(_ data: Data) {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        sessionLog.debug("Received data message: \(type)")

        switch type {
        case "handoff_started":
            if let newAgent = json["newAgent"] as? String {
                DispatchQueue.main.async {
                    self.isHandoffInProgress = true
                    self.handoffTargetPersona = newAgent
                    self.state = .thinking
                }
            }

        case "handoff_complete":
            if let newAgent = json["newAgent"] as? String {
                DispatchQueue.main.async {
                    self.currentPersonaId = newAgent
                    self.isHandoffInProgress = false
                    self.handoffTargetPersona = nil
                    self.state = .connected
                }
            }

        case "handoff_failed":
            DispatchQueue.main.async {
                self.isHandoffInProgress = false
                self.handoffTargetPersona = nil
                self.state = .connected
            }

        case "emotion_event":
            // Forward to UI for avatar expression
            if let emotion = json["emotion"] as? String {
                NotificationCenter.default.post(
                    name: NSNotification.Name("FerniEmotionEvent"),
                    object: nil,
                    userInfo: json
                )
            }

        default:
            break
        }
    }
}

// MARK: - Room Delegate

#if canImport(LiveKit)
extension IOSLiveKitSession: RoomDelegate {

    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        Task { @MainActor [weak self] in
            guard let self = self, self.room != nil else { return }

            switch connectionState {
            case .connected:
                self.connectionProgress = ""
                sessionLog.info("Connection state: connected")

            case .disconnected:
                sessionLog.info("Connection state: disconnected")
                if self.state.isActive {
                    self.state = .disconnected
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
        let dataCopy = data

        Task { @MainActor [weak self] in
            guard let self = self, self.room != nil else { return }
            self.handleDataMessage(dataCopy)
        }
    }
}
#endif
