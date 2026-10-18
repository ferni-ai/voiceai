import FerniDesign
import FerniKit
import Foundation
import os

/// One conversation with Ferni, from tapping talk to hanging up.
///
/// Joining isn't done until the agent is in the room: the session waits up to
/// `agentTimeout` for it, tries once more with a fresh room, and otherwise
/// stops with something the person can act on (Retry). Silence on
/// "Connected" is what App Review hit in January 2026.
@MainActor
@Observable
public final class CallSession {
    public enum Phase: Equatable, Sendable {
        case idle
        case connecting
        /// In the room; Ferni hasn't arrived yet.
        case waitingForFerni
        case live
        case reconnecting
        case ended
        case failed(CallProblem)
    }

    public private(set) var phase: Phase = .idle
    public private(set) var agentActivity: AgentSignals.AgentActivity?
    public private(set) var isUserSpeaking = false
    /// Ferni's face for this call: pose, expression and the feedback they ask for.
    public let avatar: AvatarModel
    /// Ferni's voice level, fed by the room on the audio thread, read per frame.
    public let agentLevel: AudioLevelMeter
    public private(set) var isMuted = false
    /// A phone call or Siri has the audio; the call resumes when it's done.
    public private(set) var isOnHold = false
    /// When the latest call began (what it taught Ferni is learned after this).
    public private(set) var startedAt: Date?
    /// The room of the latest call (a report's session id).
    public private(set) var roomName: String?
    public private(set) var captions = CaptionBook()
    public private(set) var personaID = "ferni"
    /// Whether this phone has ever had a call go live (Home's first-visit hello).
    public private(set) var hasTalked: Bool
    private let defaults: UserDefaults
    private static let hasTalkedKey = "ferni.call.hasTalked"

    public typealias FetchToken = @Sendable (_ personaID: String) async throws -> CallToken

    private let fetchToken: FetchToken
    private let makeRoom: @Sendable () -> any VoiceRoom
    private let audio: any CallAudio
    private let agentTimeout: Duration
    private var room: (any VoiceRoom)?
    private let lifecycle: (any CallLifecycle)?
    private var callID: UUID?
    private var callBegan = ContinuousClock.now
    private var agentHere = false
    private var callTask: Task<Void, Never>?
    private var eventsTask: Task<Void, Never>?
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "call")

    public init(
        fetchToken: @escaping FetchToken,
        makeRoom: @escaping @Sendable () -> any VoiceRoom,
        audio: any CallAudio,
        avatar: AvatarModel = AvatarModel(),
        lifecycle: (any CallLifecycle)? = nil,
        agentLevel: AudioLevelMeter = AudioLevelMeter(),
        agentTimeout: Duration = .seconds(10),
        defaults: UserDefaults = .standard
    ) {
        self.defaults = defaults
        hasTalked = defaults.bool(forKey: Self.hasTalkedKey)
        self.avatar = avatar
        self.lifecycle = lifecycle
        self.agentLevel = agentLevel
        self.fetchToken = fetchToken
        self.makeRoom = makeRoom
        self.audio = audio
        self.agentTimeout = agentTimeout
        Task { [weak self, interruptions = audio.interruptions] in
            for await interruption in interruptions { await self?.handle(interruption) }
        }
        if let lifecycle {
            Task { [weak self] in
                for await request in lifecycle.requests { await self?.handle(request) }
            }
        }
    }

    public var isActive: Bool {
        switch phase {
        case .connecting, .waitingForFerni, .live, .reconnecting: true
        default: false
        }
    }

    /// Start a call (also Retry after a failure). Ignored while one is running.
    public func start(personaID: String = "ferni") {
        guard !isActive else { return }
        self.personaID = personaID
        avatar.send(.connectTapped)
        let id = UUID()
        callID = id
        callBegan = .now
        startedAt = .now
        callTask = Task {
            // The system's call UI; the call still works if it refuses.
            try? await lifecycle?.begin(id: id, name: PersonaRegistry.get(personaID).name)
            await run(rejoining: false)
        }
    }

    /// Hang up. Safe to call at any point, including while still connecting.
    public func end() async {
        callTask?.cancel()
        callTask = nil
        await leaveRoom()
        phase = .ended
        avatar.send(.ended)
        isOnHold = false
        if let id = callID {
            callID = nil
            await lifecycle?.ended(id: id, failed: false)
        }
    }

    /// Tap Ferni while Ferni is talking: ask the agent to stop now (its
    /// `user_interrupt` handler, the web's tap-to-interrupt). Only while speaking.
    @discardableResult
    public func interrupt() async -> Bool {
        guard avatar.pose == .speaking, let room else { return false }
        let ms = Int(Date().timeIntervalSince1970 * 1000)
        do {
            try await room.send(Data(#"{"type":"user_interrupt","timestamp":\#(ms)}"#.utf8))
            return true
        } catch {
            log.error("Interrupt not sent: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// A different person: the last call's outcome and its "I'll remember"
    /// anchor don't carry over. A call in progress is left alone.
    public func forgetLastCall() {
        guard !isActive else { return }
        startedAt = nil
        phase = .idle
        captions.clear()
    }

    public func toggleMute() async {
        if await setMuted(!isMuted), let id = callID { await lifecycle?.setMuted(id: id, muted: isMuted) }
    }

    private func setMuted(_ muted: Bool) async -> Bool {
        guard muted != isMuted else { return true }
        isMuted = muted
        do {
            try await room?.setMicrophone(enabled: !muted)
            return true
        } catch {
            isMuted = !muted
            log.error("Mute change failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// The Lock Screen's end button, AirPods mute, the system call UI.
    private func handle(_ request: LifecycleRequest) async {
        switch request {
        case .end:
            // An end in the first seconds, before Ferni is even on the line, is the
            // system refusing the call (the Simulator does this): carry on without it.
            let refusal = phase != .live && phase != .reconnecting && ContinuousClock.now - callBegan < .seconds(2)
            if refusal {
                log.error("The system ended the call before it connected; continuing without it")
                callID = nil
            } else if isActive {
                await end()
            }
        case .mute(let muted): _ = await setMuted(muted)
        }
    }

    // MARK: - Joining

    private enum Attempt { case joined, ferniMissing, failed(CallProblem) }

    private func run(rejoining: Bool) async {
        phase = .connecting
        if !rejoining { captions.clear() }
        guard await audio.requestMicrophone() else { return fail(.microphoneDenied) }
        // A fresh join gets one retry when Ferni doesn't show; a rejoin after a
        // dropped call gets a single try.
        for attempt in 1...(rejoining ? 1 : 2) {
            if Task.isCancelled { return }
            switch await join() {
            case .joined:
                if !Task.isCancelled {
                    phase = .live
                    if !rejoining, let id = callID { lifecycle?.connected(id: id) }
                    if !hasTalked {
                        hasTalked = true
                        defaults.set(true, forKey: Self.hasTalkedKey)
                    }
                }
                if rejoining { avatar.send(.reconnected) }
                return
            case .ferniMissing:
                log.error("Ferni didn't join (attempt \(attempt))")
                await leaveRoom()
            case .failed(let problem):
                await leaveRoom()
                return fail(problem)
            }
        }
        if !Task.isCancelled { fail(rejoining ? .connectionLost : .ferniDidNotJoin) }
    }

    private func join() async -> Attempt {
        let token: CallToken
        do {
            token = try await fetchToken(personaID)
        } catch {
            return .failed(CallProblem(error))
        }
        let room = makeRoom()
        self.room = room
        roomName = token.room
        agentHere = false
        eventsTask = Task { [weak self] in
            for await event in room.events { self?.handle(event, from: room) }
        }
        do {
            try audio.activate()
            try await room.connect(url: token.url, token: token.token)
            try await room.setMicrophone(enabled: !isMuted)
        } catch {
            log.error("Joining the room failed: \(error.localizedDescription, privacy: .public)")
            return Task.isCancelled ? .ferniMissing : .failed(.offline)
        }
        if !agentHere { phase = .waitingForFerni }
        // The server already knows dispatch failed: no point waiting it out.
        let wait = token.agentDispatched == false ? Duration.zero : agentTimeout
        return await waitForAgent(upTo: wait) ? .joined : .ferniMissing
    }

    private func waitForAgent(upTo limit: Duration) async -> Bool {
        let deadline = ContinuousClock.now + limit
        while !agentHere, ContinuousClock.now < deadline, !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(50))
        }
        return agentHere
    }

    private func leaveRoom() async {
        eventsTask?.cancel()
        eventsTask = nil
        let leaving = room
        room = nil
        agentHere = false
        await leaving?.disconnect()
        audio.deactivate()
        agentActivity = nil
        isUserSpeaking = false
        agentLevel.reset()
    }

    private func fail(_ problem: CallProblem) {
        phase = .failed(problem)
        avatar.send(.failed)
        isOnHold = false
        if let id = callID {
            callID = nil
            Task { await lifecycle?.ended(id: id, failed: true) }
        }
    }

    // MARK: - Events

    private func handle(_ event: RoomEvent, from source: any VoiceRoom) {
        guard source === room else { return } // a room we already left
        switch event {
        case .agentJoined(let attributes):
            agentHere = true
            avatar.send(.agentJoined)
            apply(attributes)
        case .agentAttributes(let attributes):
            apply(attributes)
        case .agentLeft:
            agentHere = false
            // Ferni hangs up at the end of a conversation; the call is over.
            if phase == .live { Task { await end() } }
        case .data(let data):
            guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            switch AgentSignals.userSpeech(from: json) {
            case .started?: isUserSpeaking = true
            case .ended?, .paused?: isUserSpeaking = false
            case nil: break
            }
            if let result = ExpressionEventMapper.shared.processMessage(json) {
                let hold = RemoteDuration.seconds(result.hold ?? result.duration)
                avatar.send(.expression(result.expression, hold: hold))
            }
        case .caption(let chunk):
            captions.apply(chunk)
        case .reconnecting:
            if phase == .live { phase = .reconnecting }
            avatar.send(.reconnecting)
        case .reconnected:
            if phase == .reconnecting { phase = .live }
            avatar.send(.reconnected)
        case .disconnected(let byUs):
            guard !byUs, phase == .live || phase == .reconnecting else { return }
            // The network or server dropped the call: rejoin once with a fresh room.
            room = nil
            avatar.send(.reconnecting)
            callTask = Task {
                await leaveRoom()
                await run(rejoining: true)
            }
        }
    }

    private func apply(_ attributes: [String: String]) {
        guard let activity = AgentSignals.agentActivity(from: attributes) else { return }
        agentActivity = activity
        avatar.send(.agentState(activity))
    }

    private func handle(_ interruption: AudioInterruption) async {
        guard let room else { return }
        switch interruption {
        case .began:
            // The system has the mic (a phone call, Siri): Ferni waits.
            isOnHold = true
        case .ended(let shouldResume):
            isOnHold = false
            guard shouldResume else { return }
            try? audio.activate()
            try? await room.setMicrophone(enabled: !isMuted)
        }
    }
}

/// Why a call couldn't start or continue, with the words to show for it.
public enum CallProblem: Equatable, Sendable {
    case microphoneDenied
    case notSignedIn
    case offline
    case server(Int)
    case ferniDidNotJoin
    case connectionLost

    init(_ error: Error) {
        switch error as? FerniAPIError {
        case .notSignedIn?: self = .notSignedIn
        case .status(let code)?: self = code == 401 || code == 403 ? .notSignedIn : .server(code)
        case .unreachable?, nil: self = .offline
        }
    }

    public var message: String {
        switch self {
        case .microphoneDenied:
            "Ferni can't hear you yet. Turn on the microphone in Settings."
        case .notSignedIn:
            "Ferni couldn't confirm it's you. Try again in a moment."
        case .offline:
            "Couldn't reach Ferni. Check your connection and try again."
        case .server:
            "Something went wrong on our side. Try again in a minute."
        case .ferniDidNotJoin:
            "Ferni couldn't join. Let's try again."
        case .connectionLost:
            "Lost the connection. Call back?"
        }
    }
}
