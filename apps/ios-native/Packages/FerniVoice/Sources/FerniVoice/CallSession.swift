import FerniDesign
import FerniKit
import Foundation
import os

/// One conversation with Ferni, from tapping talk to hanging up.
///
/// Joining isn't done until the agent is in the room. Each attempt (token, room,
/// agent) gets `agentTimeout` in all, whatever it's stuck on, and says "on the
/// way" after `arrivingAfter`; then one more try with a fresh room, and otherwise
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
    private let arrivingAfter: Duration
    private var room: (any VoiceRoom)?
    private let lifecycle: (any CallLifecycle)?
    private var callID: UUID?
    private var callBegan = ContinuousClock.now
    /// The last call was a good one: at least two minutes live, and the person
    /// ended it (not Ferni, a drop or an error). The check-in ask waits for one.
    public private(set) var lastCallWasGood = false
    private var liveSince: ContinuousClock.Instant?
    /// The clock calls are timed with; tests replace it.
    var now: () -> ContinuousClock.Instant = { .now }
    /// LiveCommunicationKit took this call: the system activates its audio.
    private var systemOwnsCall = false
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
        agentTimeout: Duration = .seconds(20),
        arrivingAfter: Duration = .seconds(8),
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
        self.arrivingAfter = arrivingAfter
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
    /// - Parameter prepare: runs first, while the screen already says
    ///   "Calling…" (the account and consent settle here). False ends the call
    ///   as "couldn't confirm it's you" rather than silently doing nothing.
    public func start(personaID: String = "ferni", prepare: (@MainActor () async -> Bool)? = nil) {
        guard !isActive else { return }
        self.personaID = personaID
        isMuted = false // a new call starts unmuted (critic M1)
        avatar.send(.connectTapped(personaID: personaID))
        let id = UUID()
        callID = id
        callBegan = .now
        startedAt = .now
        systemOwnsCall = false
        phase = .connecting
        callTask = Task {
            // Hung up before this task ever ran: nothing to start (or show).
            if Task.isCancelled { return }
            if let prepare {
                guard await prepare() else {
                    if !Task.isCancelled { fail(.notSignedIn) }
                    return
                }
                if Task.isCancelled { return }
            }
            // The system's call UI; the call still works if it refuses.
            if let lifecycle {
                do {
                    try await lifecycle.begin(id: id, name: PersonaRegistry.get(personaID).name)
                    systemOwnsCall = true
                } catch {
                    log.error("The system refused the call; running its audio ourselves")
                }
            }
            await run(rejoining: false)
        }
    }

    /// Hang up. Safe to call at any point, including while still connecting.
    public func end() async { await finish(byPerson: true) }

    private func finish(byPerson: Bool) async {
        lastCallWasGood = byPerson && liveSince.map { now() - $0 >= .seconds(120) } == true
        liveSince = nil
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

    /// A different person on this phone (sign-out, account deleted): the last
    /// call goes, and they're new to Ferni, in memory as well as on disk
    /// (critic L1). A call in progress is left alone.
    public func forgetPerson() {
        guard !isActive else { return }
        forgetLastCall()
        hasTalked = false
        defaults.removeObject(forKey: Self.hasTalkedKey)
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
                if systemOwnsCall {
                    // Nobody will activate the session now: the app does.
                    systemOwnsCall = false
                    if room != nil { try? audio.activate(systemOwned: false) }
                }
            } else if isActive {
                await end()
            }
        case .mute(let muted): _ = await setMuted(muted)
        case .audio(let active):
            audio.systemAudio(active: active)
            guard systemOwnsCall, isActive else { return }
            if active {
                await resume()
            } else if phase == .live {
                isOnHold = true // the system took the audio (another call)
            }
        }
    }

    // MARK: - Joining

    /// `cancelled`: the person hung up meanwhile; nothing may change on screen.
    private enum Attempt: Equatable, Sendable { case joined, ferniMissing, failed(CallProblem), cancelled }

    private func run(rejoining: Bool) async {
        guard !Task.isCancelled else { return }
        phase = .connecting
        if !rejoining { captions.clear() }
        guard await audio.requestMicrophone() else { return fail(.microphoneDenied) }
        // A fresh join gets one retry when Ferni doesn't show; a rejoin after a
        // dropped call gets a single try.
        for attempt in 1...(rejoining ? 1 : 2) {
            if Task.isCancelled { return }
            // The retry follows a late Ferni: still "on the way", never back to "Calling…".
            if attempt > 1 { phase = .waitingForFerni }
            switch await joinBeforeDeadline(attempt: attempt, rejoining: rejoining) {
            case .joined:
                if !Task.isCancelled {
                    phase = .live
                    if !rejoining { liveSince = now() }
                    if !rejoining, let id = callID { lifecycle?.connected(id: id) }
                    if !hasTalked {
                        hasTalked = true
                        defaults.set(true, forKey: Self.hasTalkedKey)
                    }
                }
                if rejoining { avatar.send(.reconnected) }
                return
            case .ferniMissing:
                log.error("Ferni didn't join (attempt \(attempt)); leaving room \(self.roomName ?? "-", privacy: .public)")
                await leaveRoom()
            case .failed(let problem):
                await leaveRoom()
                return fail(problem)
            case .cancelled:
                return
            }
        }
        if !Task.isCancelled {
            log.error("Giving up after \(rejoining ? 1 : 2) room(s); \(self.secondsSinceStart, privacy: .public) s since Talk")
            fail(rejoining ? .connectionLost : .ferniDidNotJoin)
        }
    }

    /// One attempt, with a watchdog: "on the way" at `arrivingAfter`, and at
    /// `agentTimeout` the attempt is abandoned wherever it's stuck (token,
    /// connect or waiting for the agent) and counts as Ferni missing. The
    /// watchdog stops the waiting, not just the join: a connect that ignores
    /// cancellation finishes later on its own, in a room already left.
    private func joinBeforeDeadline(attempt: Int, rejoining: Bool) async -> Attempt {
        let race = AttemptRace()
        let result = await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Attempt, Never>) in
                race.start(continuation,
                    joining: Task { race.finish(await self.join(attempt: attempt)) },
                    watchdog: Task { [weak self, arrivingAfter, agentTimeout] in
                        // The deadline wins if it's the shorter of the two.
                        try? await Task.sleep(for: min(arrivingAfter, agentTimeout))
                        guard let self, !Task.isCancelled else { return }
                        if !rejoining, arrivingAfter < agentTimeout, self.phase == .connecting {
                            self.phase = .waitingForFerni
                            self.log.info("Attempt \(attempt): no Ferni yet at \(self.secondsSinceStart, privacy: .public) s; on the way")
                        }
                        try? await Task.sleep(for: max(.zero, agentTimeout - arrivingAfter))
                        guard !Task.isCancelled, !self.agentHere else { return }
                        self.log.error("Attempt \(attempt): no Ferni after \(agentTimeout.components.seconds) s; abandoning it")
                        race.finish(.ferniMissing)
                    })
            }
        } onCancel: {
            race.finish(.cancelled) // hung up
        }
        race.stop()
        return result
    }

    /// The first of an attempt's join and its watchdog to finish decides it.
    private final class AttemptRace: @unchecked Sendable {
        private let lock = OSAllocatedUnfairLock()
        private var continuation: CheckedContinuation<Attempt, Never>?
        private var early: Attempt?
        private var joining: Task<Void, Never>?
        private var watchdog: Task<Void, Never>?

        func start(_ continuation: CheckedContinuation<Attempt, Never>, joining: Task<Void, Never>, watchdog: Task<Void, Never>) {
            let early: Attempt? = lock.withLock {
                self.joining = joining
                self.watchdog = watchdog
                if let early = self.early { return early }
                self.continuation = continuation
                return nil
            }
            // Hung up before it began.
            if let early { stop(); continuation.resume(returning: early) }
        }

        func finish(_ result: Attempt) {
            let waiting: CheckedContinuation<Attempt, Never>? = lock.withLock {
                guard continuation != nil else {
                    if early == nil, joining == nil { early = result }
                    return nil
                }
                defer { continuation = nil }
                return continuation
            }
            waiting?.resume(returning: result)
        }

        func stop() {
            let (joining, watchdog) = lock.withLock { (self.joining, self.watchdog) }
            joining?.cancel()
            watchdog?.cancel()
        }
    }

    /// Seconds since Talk, for the "call" log's timings.
    private var secondsSinceStart: String {
        let elapsed = (ContinuousClock.now - callBegan).components
        return String(format: "%.1f", Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18)
    }

    private func join(attempt: Int) async -> Attempt {
        let token: CallToken
        do {
            token = try await fetchToken(personaID)
            log.info("Attempt \(attempt): token at \(self.secondsSinceStart, privacy: .public) s (dispatched: \(token.agentDispatched.map(String.init) ?? "?", privacy: .public))")
        } catch {
            // A hang-up surfaces as a network error from URLSession: not a failure (critic H1).
            return Task.isCancelled ? .cancelled : .failed(CallProblem(error))
        }
        if Task.isCancelled { return .cancelled }
        let room = makeRoom()
        self.room = room
        roomName = token.room
        agentHere = false
        eventsTask = Task { [weak self] in
            for await event in room.events { self?.handle(event, from: room) }
        }
        do {
            try audio.activate(systemOwned: systemOwnsCall)
            try await room.connect(url: token.url, token: token.token)
            // Hung up while connecting: the room was already left; touch nothing.
            if Task.isCancelled || self.room !== room { return .cancelled }
            try await room.setMicrophone(enabled: !isMuted)
        } catch {
            log.error("Joining the room failed: \(error.localizedDescription, privacy: .public)")
            return Task.isCancelled || self.room !== room ? .cancelled : .failed(.offline)
        }
        if Task.isCancelled || self.room !== room { return .cancelled }
        log.info("Attempt \(attempt): in room \(token.room, privacy: .public) at \(self.secondsSinceStart, privacy: .public) s")
        // The server already knows dispatch failed: no point waiting it out.
        if token.agentDispatched == false, !agentHere { return .ferniMissing }
        // Until Ferni arrives or the attempt's watchdog gives up on him.
        while !agentHere, !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(50))
        }
        guard agentHere else { return Task.isCancelled ? .cancelled : .ferniMissing }
        log.info("Attempt \(attempt): Ferni joined at \(self.secondsSinceStart, privacy: .public) s")
        return .joined
    }

    private func leaveRoom() async {
        eventsTask?.cancel()
        eventsTask = nil
        let leaving = room
        room = nil
        agentHere = false
        await leaving?.disconnect()
        audio.deactivate(systemOwned: systemOwnsCall)
        agentActivity = nil
        isUserSpeaking = false
        agentLevel.reset()
    }

    private func fail(_ problem: CallProblem) {
        lastCallWasGood = false
        liveSince = nil
        phase = .failed(problem)
        avatar.send(.failed)
        isOnHold = false
        if let id = callID {
            callID = nil
            Task { await lifecycle?.ended(id: id, failed: true) }
        }
    }

    // MARK: - Events

    /// The agent brings in a teammate (critic H3). Only teammates the app
    /// knows ever reach the screen; a rejoin continues with whoever is on now.
    private func handle(_ handoff: AgentSignals.Handoff?) {
        switch handoff {
        case .started(let id)?:
            if let teammate = PersonaRegistry.known(serverID: id) { avatar.send(.handoffStarted(to: teammate.id)) }
        case .completed(let id)?:
            guard let teammate = PersonaRegistry.known(serverID: id) else { return }
            personaID = teammate.id
            avatar.send(.handoffCompleted(to: teammate.id, name: teammate.name))
        case .failed?:
            avatar.send(.handoffFailed)
        case nil:
            break
        }
    }

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
            if phase == .live { Task { await finish(byPerson: false) } }
        case .data(let data):
            guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            switch AgentSignals.userSpeech(from: json) {
            case .started?: isUserSpeaking = true
            case .ended?, .paused?: isUserSpeaking = false
            case nil: break
            }
            handle(AgentSignals.handoff(from: json))
            if let result = ExpressionEventMapper.shared.processMessage(json) {
                let hold = RemoteDuration.seconds(result.hold ?? result.duration)
                avatar.send(.expression(result.expression, hold: hold))
            }
        case .caption(let chunk):
            captions.apply(chunk, room: roomName)
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
        guard room != nil else { return }
        switch interruption {
        case .began:
            // The system has the mic (a phone call, Siri): Ferni waits.
            isOnHold = true
        case .ended:
            // "Should resume" is advice for media players. The person is still
            // in this call, so it always comes back (iOS often leaves the flag
            // off after Siri, an alarm or a declined call).
            await resume()
        }
    }

    /// Brings the call back after an interruption. If the system still has
    /// the audio, the call stays "On hold" (never "listening" over a dead mic)
    /// and the person can try again.
    public func resume() async {
        guard let room, isOnHold else { return }
        do {
            try audio.activate(systemOwned: systemOwnsCall)
            try await room.setMicrophone(enabled: !isMuted)
            isOnHold = false
        } catch {
            log.error("Couldn't resume after an interruption: \(error.localizedDescription, privacy: .public)")
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
            "Ferni couldn't join right now. Try again in a minute."
        case .connectionLost:
            "Lost the connection. Call back?"
        }
    }
}
