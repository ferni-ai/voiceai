import SwiftUI

/// Ferni, live: one view for the whole app, drawn by `AvatarRenderer` on a
/// single TimelineView clock (ios-motion-spec §6.10).
///
/// Display rate (120 Hz on ProMotion) only while speaking; 30 fps otherwise and
/// always in Low Power Mode or when the device is hot; paused when the app isn't
/// active. Reduce Motion keeps blinks and the mouth and drops scale and gaze.
/// The first 600 ms are the wake (eyes open, glow comes up); input works from
/// the first frame.
public struct AvatarView: View {
    let persona: WindowPersona
    let expression: AvatarExpression
    let activity: AvatarActivity
    let level: @Sendable () -> Float
    let name: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var clock = Clock()
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    @State private var hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue

    /// - Parameter level: Ferni's raw voice level, read once per frame.
    public init(
        persona: WindowPersona, expression: AvatarExpression, activity: AvatarActivity,
        name: String = "Ferni", level: @escaping @Sendable () -> Float = { 0 }
    ) {
        self.persona = persona
        self.expression = expression
        self.activity = activity
        self.name = name
        self.level = level
    }

    public var body: some View {
        let throttled = lowPower || hot
        let cadence: Double? = activity == .speaking && !throttled ? nil : 1.0 / 30
        TimelineView(.animation(minimumInterval: cadence, paused: scenePhase != .active)) { timeline in
            let frame = clock.frame(
                at: timeline.date, persona: persona, expression: expression, activity: activity,
                level: Double(level()), reduceMotion: reduceMotion, lowPower: throttled
            )
            Canvas { context, size in AvatarRenderer.draw(frame, in: &context, size: size) }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel(name)
        .accessibilityValue(Self.words(for: activity, name: name))
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
            lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
        .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)) { _ in
            hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
        }
    }

    static func words(for activity: AvatarActivity, name: String) -> String {
        switch activity {
        case .idle: "\(name) is here"
        case .arriving: "\(name) is on the way"
        case .listening: "\(name) is listening"
        case .thinking: "\(name) is thinking"
        case .speaking: "\(name) is speaking"
        case .reconnecting: "Reconnecting"
        case .error: "\(name) couldn't connect"
        }
    }

    /// Per-view timekeeping: when the view woke, when the activity last changed,
    /// and the voice smoothing. A reference type so drawing never writes view state.
    final class Clock {
        private let woke = Date()
        private var activity: AvatarActivity?
        private var activitySince = Date()
        private var smoother = LevelSmoother()
        private var lastFrame: Date?

        func age(at now: Date) -> Double { now.timeIntervalSince(woke) }

        func frame(
            at now: Date, persona: WindowPersona, expression: AvatarExpression, activity: AvatarActivity,
            level: Double, reduceMotion: Bool, lowPower: Bool
        ) -> AvatarFrame {
            if activity != self.activity {
                self.activity = activity
                activitySince = now
            }
            let dt = lastFrame.map { now.timeIntervalSince($0) } ?? 0
            lastFrame = now
            let smoothed = Double(smoother.step(toward: Float(level), dt: dt))

            var f = AvatarFrame()
            f.persona = persona
            f.expression = expression
            f.activity = activity
            f.level = activity == .speaking ? smoothed : 0
            f.time = age(at: now)
            f.activityAge = now.timeIntervalSince(activitySince)
            f.reduceMotion = reduceMotion
            f.lowPower = lowPower
            return f
        }
    }
}
