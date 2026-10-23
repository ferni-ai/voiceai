import QuartzCore
import SwiftUI

/// Ferni, live: the GPU-rendered body from the owner's alive prototype
/// (`AliveShader`), moved by `AliveRig` on one clock (ios-motion-spec §6.10):
/// the Metal canvas's own display link, which asks for each frame with the
/// moment it will reach the glass (`AliveMetalView`).
///
/// The view takes a square slot in the layout; the Metal canvas extends past
/// it (headroom for hops, the ring and the corner teammate) so Ferni is never
/// clipped. The display's rate (120 Hz on ProMotion) while he speaks or
/// anything quick moves, never below 60 in a call, 30 only at home and at
/// rest, at most 60 in Low Power Mode or when the device is hot (`FramePace`);
/// paused when the app isn't active or something covers Ferni (`covered`).
/// Reduce Motion scales motion to 35% and skips the big moments.
public struct AvatarView: View {
    let persona: WindowPersona
    let expression: AvatarExpression
    let activity: AvatarActivity
    let level: @Sendable () -> Float
    let name: String
    let covered: Bool
    let onCue: ((KeyedCue) -> Void)?
    let reading: Bool
    /// You're muted: he looks away (award upgrade 9).
    let lookingAway: Bool
    /// The room's hour, for its light on Ferni (the app's clock; now if nil).
    let roomHour: Int?
    let wake: Int
    let doubleTake: Int
    let personSpeaking: Bool
    let micro: MicroBeat?
    let moment: MomentBeat?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale
    /// Each teammate acts its own way (persona acting SPEC); off by default.
    @AppStorage(PersonaActing.flagKey) private var personaActing = false
    @State private var rig: AliveRig
    /// Host time (CACurrentMediaTime) Ferni woke at: the rig's time counts from here.
    @State private var woke = CACurrentMediaTime()
    /// What the particle overlay draws, from the rig after each frame.
    @State private var feed = ParticleFeed()
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    @State private var hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
    @State private var slot = CGSize.zero
    @State private var arrivingSince: Date?
    @State private var arrivedThisCall = false
    /// The activity the last onChange handled (callJustEnded).
    @State private var seenActivity = AvatarActivity.idle
    /// Bumped when something asks for a new rate at once (a request, a touch);
    /// the canvas re-reads the pace. Every frame re-reads it too.
    @State private var kick = 0
    /// When he last stopped speaking (the turn-end hold, `FramePace.speechHold`).
    @State private var speechEnded: Date?
    @GestureState private var holding = false

    /// Canvas size and Ferni's place in it, in slot widths.
    static let canvas = CGSize(width: 1.7, height: 1.5)
    static let radius = 0.30, lift = 0.1
    /// Expressions that earn the hand-keyed "big win" (a spin) when the face changes to one.
    public static let wins: Set<AvatarExpression> = [.cheering, .proud, .excited]
    /// The part of the slot a finger can touch: Ferni himself (radius 0.30 of
    /// the slot) with a little slop, never the slot's corners.
    static let touchScale = 0.7

    /// - Parameters:
    ///   - level: Ferni's voice level from the remote audio track, read once per frame.
    ///   - onCue: what the body asks the app for (a haptic on a touch, a chime on landing), after each frame.
    public init(
        persona: WindowPersona, expression: AvatarExpression, activity: AvatarActivity,
        name: String = "Ferni", covered: Bool = false, wake: Int = 0, doubleTake: Int = 0, personSpeaking: Bool = false,
        micro: MicroBeat? = nil, moment: MomentBeat? = nil, rig: AliveRig? = nil,
        level: @escaping @Sendable () -> Float = { 0 },
        reading: Bool = false, lookingAway: Bool = false, roomHour: Int? = nil, onCue: ((KeyedCue) -> Void)? = nil
    ) {
        self.lookingAway = lookingAway
        self.roomHour = roomHour
        self.persona = persona
        self.expression = expression
        self.activity = activity
        self.name = name
        self.covered = covered
        self.level = level
        self.onCue = onCue
        self.reading = reading
        self.wake = wake
        self.doubleTake = doubleTake
        self.personSpeaking = personSpeaking
        self.micro = micro
        self.moment = moment
        _rig = State(initialValue: rig ?? AliveRig())
    }

    public var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                GeometryReader { geo in
                    let side = min(geo.size.width, geo.size.height)
                    if let renderer = AliveRenderer.shared {
                        let throttled = lowPower || hot
                        // Read here, in the view update, and carried into the frames.
                        let look = FrameLook(dark: colorScheme == .dark, reduceMotion: reduceMotion, personaActing: personaActing)
                        ZStack {
                            AliveMetalView(
                                renderer: renderer,
                                radius: Float(Self.radius / Self.canvas.width), below: Float(Self.lift / Self.canvas.width),
                                scale: Self.renderScale(display: displayScale, throttled: throttled),
                                origin: woke, paused: Self.paused(covered: covered, active: scenePhase == .active), kick: kick,
                                frame: { seconds, date in frame(at: seconds, date: date, look: look) },
                                pace: { date in
                                    Self.pace(activity: activity, rig: rig, throttled: lowPower || hot, sinceSpeechEnd: sinceSpeechEnd(at: date))
                                }
                            )
                            ParticleLayer(feed: feed, side: side)
                        }
                        .frame(width: side * Self.canvas.width, height: side * Self.canvas.height)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2 - side * Self.lift)
                    } else {
                        AvatarPortrait(persona: persona) // no Metal: Ferni at rest
                    }
                }
                .allowsHitTesting(false)
            }
            .onGeometryChange(for: CGSize.self) { $0.size } action: { slot = $0 }
            // At rest Ferni can be touched, or a finger held on him (he leans
            // toward it); in a call only the app's own gestures apply. The hold
            // fails as soon as the finger moves, so Home still scrolls.
            .contentShape(.interaction, Circle().scale(Self.touchScale))
            .gesture(SpatialTapGesture().onEnded { touch(at: $0.location) }, including: activity == .idle ? .all : .none)
            .simultaneousGesture(hold, including: activity == .idle ? .all : .none)
            .onChange(of: holding) { _, now in
                if !now { rig.fingerLifted() }
                repace()
            }
            .accessibilityElement()
            .accessibilityLabel(name)
            .accessibilityValue(Self.words(for: activity, name: name))
            .onAppear {
                seenActivity = activity
                if activity == .idle { rig.rest(with: persona, animated: false) } else { rig.show(persona, animated: false) }
                if let moment = Self.launchMoment(reduceMotion: reduceMotion) { rig.play(moment) }
                repace()
            }
            .onChange(of: persona) { _, next in
                // In a call a new teammate arrives at the family table; at home
                // whoever answers next sits there too, Ferni in the corner. At
                // hang-up the persona and the activity change together: whichever
                // closure runs first, the goodbye comes first and the rest waits
                // for it (critic M4), so a call that just ended is left to the
                // activity's handler.
                if activity == .idle {
                    if Self.callJustEnded(seenActivity: seenActivity) { return }
                    rig.rest(with: next)
                } else {
                    rig.handOff(to: next)
                }
                repace()
            }
            .onChange(of: activity) { previous, next in
                seenActivity = next
                if previous == .speaking { speechEnded = .now }
                if next == .speaking || !FramePace.inCall(next) { speechEnded = nil }
                if next == .arriving, previous == .idle { arrivingSince = .now }
                let waited = arrivingSince.map { Date.now.timeIntervalSince($0) } ?? 0
                let plan = Self.joinPlan(from: previous, to: next, waited: waited, reduceMotion: reduceMotion, arrived: arrivedThisCall)
                switch plan {
                case .hop: rig.play(.join); arrivedThisCall = true
                case .settle: [KeyedCue.arrivalChime, .land].forEach { onCue?($0) }; arrivedThisCall = true
                case .none: if next != .arriving, previous == .arriving { arrivedThisCall = true }
                }
                if next == .idle { arrivedThisCall = false; arrivingSince = nil }
                if let sequence = Self.sequence(from: previous, to: next, join: plan, reduceMotion: reduceMotion) {
                    rig.play(sequence: sequence)
                }
                if next == .idle, previous != .idle, previous != .arriving {
                    if !reduceMotion { rig.play(.goodbye) }
                    // Back home: whoever answers next at the family table, once the
                    // goodbye is over (the rig holds it till then).
                    rig.rest(with: persona)
                }
                rig.stir()
                repace()
            }
            // Back after a long time away: he wakes where he is, as on opening the app.
            .onChange(of: wake) { _, _ in
                if activity == .idle, let moment = Self.launchMoment(reduceMotion: reduceMotion) { rig.play(moment) }
                repace()
            }
            // Back after a few seconds away: a glance, a look away, the snap back.
            .onChange(of: doubleTake) { _, _ in
                if activity == .idle { rig.doubleTake() }
                repace()
            }
            // A micro-expression from the call (the agent's humanization signals).
            .onChange(of: micro) { _, next in
                if let next { rig.micro(next.expression) }
                repace()
            }
            // A choreographed moment from the call (a breakthrough, a small win).
            .onChange(of: moment) { _, next in
                if let next { rig.play(sequence: next.id) }
                repace()
            }
            .onChange(of: expression) { _, next in
                if Self.winPlays(next, reduceMotion: reduceMotion, personSpeaking: personSpeaking) { rig.play(.win) }
                rig.stir()
                repace()
            }
            .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
                lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
                repace()
            }
            .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)) { _ in
                hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
                repace()
            }
    }

    /// A finger held still first, then followed wherever it goes.
    private var hold: some Gesture {
        LongPressGesture(minimumDuration: AliveRig.noticeAfter)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .updating($holding) { value, state, _ in
                if case .second(true, _) = value { state = true }
            }
            .onChanged { value in
                guard case .second(true, let drag) = value else { return }
                rig.fingerHeld(at: drag.flatMap { point(at: $0.location) })
                repace()
            }
    }

    /// A tap at `location` in the slot.
    private func touch(at location: CGPoint) {
        if let p = point(at: location) { rig.poke(at: p) }
        repace()
    }

    /// The rate for now, at once (outside a view update: after a handler).
    private func repace() { kick &+= 1 }

    private func sinceSpeechEnd(at date: Date) -> Double? { speechEnded.map { date.timeIntervalSince($0) } }

    /// The rate for `activity` and the rig as of its last frame or request.
    static func pace(activity: AvatarActivity, rig: AliveRig, throttled: Bool, sinceSpeechEnd: Double? = nil) -> Int {
        FramePace.rate(
            inCall: FramePace.inCall(activity), speaking: activity == .speaking,
            fastMotion: rig.fastMotion, settled: rig.settled, lowPower: throttled, sinceSpeechEnd: sinceSpeechEnd
        )
    }

    /// A point in the slot as Ferni radii from his centre (y up).
    private func point(at location: CGPoint) -> SIMD2<Double>? {
        let side = min(slot.width, slot.height)
        guard side > 0 else { return nil }
        let r = side * Self.radius
        return SIMD2((location.x - slot.width / 2) / r, (slot.height / 2 - location.y) / r)
    }

    /// One frame, `seconds` after he woke and on screen at `date`: this
    /// moment's inputs into the rig, out come the uniforms.
    private func frame(at seconds: Double, date: Date, look: FrameLook) -> AliveUniforms {
        rig.activity = activity
        rig.expression = expression.rawValue
        rig.voiceLevel = level()
        rig.reduceMotion = look.reduceMotion
        rig.personaActing = look.personaActing
        rig.reading = reading
        rig.lookingAway = lookingAway
        rig.personSpeaking = personSpeaking
        let dark = look.dark
        rig.dark = dark
        var u = rig.frame(at: seconds)
        feed.show(rig.particles, at: u.pos)
        // After the frame, never during it: the app's handlers may change state.
        if let onCue, !rig.cues.isEmpty {
            let cues = rig.cues
            Task { @MainActor in cues.forEach(onCue) }
        }
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        u.roomLight(RoomLight(hour: roomHour ?? Calendar.current.component(.hour, from: date)))
        return u
    }

    /// What plays when Ferni first appears: he wakes where he is (gap 3).
    /// Under Reduce Motion he's simply there.
    static func launchMoment(reduceMotion: Bool) -> KeyedMoment? { reduceMotion ? nil : .wake }

    /// The activity this view last handled: still a call's while the closure
    /// for a hang-up's persona change runs ahead of the activity's.
    static func callJustEnded(seenActivity: AvatarActivity) -> Bool {
        seenActivity != .idle && seenActivity != .arriving
    }

    /// What Ferni's body does when he joins a call (gap 4): the keyed join
    /// (`hop`); for a join under ~300 ms only its note and tap (`settle`), so
    /// a fast join never feels slowed down; nothing under Reduce Motion (the
    /// director plays the note and tap) or after he already arrived this call.
    enum JoinPlan: Equatable { case hop, settle, none }

    static func joinPlan(from: AvatarActivity, to: AvatarActivity, waited: Double, reduceMotion: Bool, arrived: Bool) -> JoinPlan {
        guard from == .arriving, to == .listening || to == .speaking, !arrived, !reduceMotion else { return .none }
        return waited < 0.3 ? .settle : .hop
    }

    /// The design system's sequence for a change in what Ferni is doing:
    /// connection_success for a fast join (it has no hop), error_recovery back
    /// from a dropped connection, and under Reduce Motion session_end for the
    /// goodbye (the keyed goodbye otherwise).
    static func sequence(from: AvatarActivity, to: AvatarActivity, join: JoinPlan, reduceMotion: Bool) -> String? {
        if join == .settle { return "connection_success" }
        if from == .reconnecting, [.listening, .thinking, .speaking].contains(to) { return "error_recovery" }
        if to == .idle, from != .idle, from != .arriving, reduceMotion { return "session_end" }
        return nil
    }

    /// The big win (a spin and hops) plays for a celebrating face, never while
    /// the person is speaking (it would spin over them) and not under Reduce Motion.
    static func winPlays(_ expression: AvatarExpression, reduceMotion: Bool, personSpeaking: Bool) -> Bool {
        wins.contains(expression) && !reduceMotion && !personSpeaking
    }

    /// Ferni draws at the screen's own scale (3x on most iPhones, gap 8), at
    /// most 3x; 1.5x in Low Power Mode or when the device is hot.
    static func renderScale(display: CGFloat, throttled: Bool) -> CGFloat {
        throttled ? 1.5 : min(max(display, 1), 3)
    }

    /// The clock stops when the app isn't active or something covers Ferni.
    static func paused(covered: Bool, active: Bool) -> Bool { covered || !active }

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

/// The environment a frame needs, read in the view update.
struct FrameLook: Equatable {
    let dark: Bool, reduceMotion: Bool, personaActing: Bool
}

/// The particles (and where Ferni is) after the last frame, for the overlay.
/// Only the overlay reads it, so a frame with particles redraws only them.
@MainActor @Observable
final class ParticleFeed {
    private(set) var particles: [AliveRig.Particle] = []
    private(set) var pos = SIMD2<Float>.zero

    /// Writes only what changed: no particles, no invalidation.
    func show(_ next: [AliveRig.Particle], at position: SIMD4<Float>) {
        if particles != next { particles = next }
        let p = SIMD2(position.x, position.y)
        if !next.isEmpty, pos != p { pos = p }
    }
}

/// The particle overlay, in the canvas's frame (the Metal canvas extends past the slot).
private struct ParticleLayer: View {
    let feed: ParticleFeed
    let side: CGFloat

    var body: some View {
        let w = side * AvatarView.canvas.width, h = side * AvatarView.canvas.height, r = side * AvatarView.radius
        AliveParticles(
            particles: feed.particles,
            centre: CGPoint(x: w / 2 + CGFloat(feed.pos.x) * r, y: h / 2 + side * AvatarView.lift - CGFloat(feed.pos.y) * r),
            radius: r
        )
    }
}
