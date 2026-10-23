import FerniDesign
import Foundation

/// The avatar's live state for the screen: `AvatarDirector` on a real clock.
/// One pending wake-up at a time (the director's next deadline), no Timer and
/// no asyncAfter. Effects go to `play`, which the app wires to haptics and
/// VoiceOver announcements.
@MainActor
@Observable
public final class AvatarModel {
    public private(set) var director = AvatarDirector()
    private let started = ContinuousClock.now
    private let play: @MainActor (AvatarEffect) -> Void
    private var wake: Task<Void, Never>?

    public init(play: @escaping @MainActor (AvatarEffect) -> Void = { _ in }) {
        self.play = play
    }

    public var pose: AvatarPose { director.pose }
    public var expression: AvatarExpression { director.expression }
    public var personaID: String { director.personaID }
    public var micro: MicroBeat? { director.micro }
    public var moment: MomentBeat? { director.moment }
    /// The caller is struggling: the body skips its playful goodbye.
    public var calm: Bool { director.calm }

    /// Reduce Motion lengthens the turn settle (the view drops scale and gaze).
    public var reduceMotion: Bool {
        get { director.reduceMotion }
        set { director.reduceMotion = newValue }
    }

    public func send(_ event: CallEvent) {
        apply(director.send(event, now: ContinuousClock.now - started))
    }

    private func apply(_ effects: [AvatarEffect]) {
        effects.forEach(play)
        wake?.cancel()
        guard let deadline = director.nextDeadline else { return }
        let at = started + deadline
        wake = Task { [weak self] in
            try? await Task.sleep(until: at, clock: .continuous)
            guard !Task.isCancelled, let self else { return }
            self.apply(self.director.tick(now: ContinuousClock.now - self.started))
        }
    }
}
