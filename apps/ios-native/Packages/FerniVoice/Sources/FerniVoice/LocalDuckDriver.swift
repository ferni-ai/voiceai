import Foundation

/// Runs one room's `LocalDuckController`: reads the caller's mic level every
/// frame, tells it when Ferni speaks, and carries out what it decides on
/// Ferni's playout volume and the call's existing interrupt.
@MainActor
final class LocalDuckDriver {
    /// One mic reading per frame: fast enough to catch a 150 ms onset to
    /// within a frame, slow enough to cost nothing.
    static let frame: Duration = .milliseconds(20)

    private var controller: LocalDuckController
    private let room: any VoiceRoom
    private let now: () -> ContinuousClock.Instant
    private let muted: () -> Bool
    private let interrupt: () async -> Void
    private var frames: Task<Void, Never>?
    private var ramp: Task<Void, Never>?
    /// Where Ferni's playout is now, in dB below normal.
    private var currentDB: Float = 0
    /// How many times this room ducked: the call's one debug counter.
    private(set) var ducks = 0

    init(room: any VoiceRoom, tuning: LocalDuckController.Tuning, now: @escaping () -> ContinuousClock.Instant,
         muted: @escaping () -> Bool, interrupt: @escaping () async -> Void) {
        controller = LocalDuckController(tuning: tuning)
        self.room = room
        self.now = now
        self.muted = muted
        self.interrupt = interrupt
    }

    func start(agentSpeaking: Bool) {
        room.startMicLevel()
        self.agentSpeaking(agentSpeaking)
        frames = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.frame)
                self?.readMic()
            }
        }
    }

    func agentSpeaking(_ speaking: Bool) {
        perform(controller.agentSpeaking(speaking, at: now()))
    }

    func stop() {
        frames?.cancel()
        ramp?.cancel()
    }

    private func readMic() {
        // Muted, the caller isn't talking to Ferni whatever the mic hears.
        guard let db = muted() ? MicLevelRenderer.silence : room.micLevelDB else { return }
        perform(controller.level(db, at: now()))
    }

    private func perform(_ actions: [LocalDuckController.Action]) {
        for action in actions {
            switch action {
            case .duck(let db):
                ducks += 1
                setGain(db)
            case .restore(let over):
                restore(over: over)
            case .sendInterrupt:
                Task { await interrupt() }
            }
        }
    }

    private func setGain(_ db: Float) {
        ramp?.cancel()
        currentDB = db
        room.setAgentGain(Double(pow(10, db / 20)))
    }

    /// Back to normal in frame-sized steps, even in dB so it sounds even.
    private func restore(over duration: Duration) {
        let steps = max(1, Int((duration / Self.frame).rounded(.up)))
        let from = currentDB
        guard steps > 1 else { return setGain(0) }
        ramp?.cancel()
        ramp = Task { [weak self] in
            for step in 1...steps {
                try? await Task.sleep(for: Self.frame)
                guard !Task.isCancelled, let self else { return }
                self.currentDB = from * Float(steps - step) / Float(steps)
                self.room.setAgentGain(Double(pow(10, self.currentDB / 20)))
            }
        }
    }
}
