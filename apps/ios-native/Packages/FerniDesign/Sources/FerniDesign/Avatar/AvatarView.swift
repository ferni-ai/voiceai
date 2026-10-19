import SwiftUI

/// Ferni, live: the GPU-rendered body from the owner's alive prototype
/// (`AliveShader`), moved by `AliveRig` on a single TimelineView clock
/// (ios-motion-spec §6.10).
///
/// The view takes a square slot in the layout; the Metal canvas extends past
/// it (headroom for hops, the ring and the corner teammate) so Ferni is never
/// clipped. Display rate (120 Hz on ProMotion) only while speaking; 30 fps
/// otherwise and always in Low Power Mode or when the device is hot; paused
/// when the app isn't active. Reduce Motion scales motion to 35% and skips
/// the big moments.
public struct AvatarView: View {
    let persona: WindowPersona
    let expression: AvatarExpression
    let activity: AvatarActivity
    let level: @Sendable () -> Float
    let name: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var rig = AliveRig()
    @State private var woke = Date()
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    @State private var hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue

    /// Canvas size and Ferni's place in it, in slot widths.
    static let canvas = CGSize(width: 1.7, height: 1.5)
    static let radius = 0.30, lift = 0.1
    /// Expressions that earn the hand-keyed "big win".
    static let wins: Set<AvatarExpression> = [.cheering, .proud, .excited]

    /// - Parameter level: Ferni's voice level from the remote audio track, read once per frame.
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
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                GeometryReader { geo in
                    let side = min(geo.size.width, geo.size.height)
                    if let renderer = AliveRenderer.shared {
                        let throttled = lowPower || hot
                        let cadence: Double? = activity == .speaking && !throttled ? nil : 1.0 / 30
                        TimelineView(.animation(minimumInterval: cadence, paused: scenePhase != .active)) { timeline in
                            AliveMetalView(
                                renderer: renderer, uniforms: frame(at: timeline.date),
                                radius: Float(Self.radius / Self.canvas.width), below: Float(Self.lift / Self.canvas.width),
                                scale: throttled ? 1.5 : 2
                            )
                        }
                        .frame(width: side * Self.canvas.width, height: side * Self.canvas.height)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2 - side * Self.lift)
                    } else {
                        AvatarPortrait(persona: persona) // no Metal: Ferni at rest
                    }
                }
                .allowsHitTesting(false)
            }
            .accessibilityElement()
            .accessibilityLabel(name)
            .accessibilityValue(Self.words(for: activity, name: name))
            .onAppear {
                rig.show(persona, animated: false)
                if !reduceMotion { rig.play(.arrival) }
            }
            .onChange(of: persona) { _, next in
                // In a call a new teammate arrives at the family table; at home the light just changes.
                if activity == .idle { rig.show(next) } else { rig.handOff(to: next) }
            }
            .onChange(of: activity) { previous, next in
                if next == .idle, previous != .idle, previous != .arriving {
                    if !reduceMotion { rig.play(.goodbye) }
                    rig.dismissGuest()
                }
            }
            .onChange(of: expression) { _, next in
                if Self.wins.contains(next), !reduceMotion { rig.play(.win) }
            }
            .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
                lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
            }
            .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)) { _ in
                hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
            }
    }

    /// One frame: this moment's inputs into the rig, out come the uniforms.
    private func frame(at date: Date) -> AliveUniforms {
        rig.activity = activity
        rig.expression = expression.rawValue
        rig.voiceLevel = level()
        rig.reduceMotion = reduceMotion
        let dark = colorScheme == .dark
        rig.dark = dark
        var u = rig.frame(at: date.timeIntervalSince(woke))
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        return u
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
}

/// What Ferni is doing, as the avatar shows it.
public enum AvatarActivity: Equatable, Sendable {
    case idle, arriving, listening, thinking, speaking, reconnecting, error
}
