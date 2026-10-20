import Foundation
import simd

/// Ferni's body over time: the alive prototype's frame loop, including the
/// touch, tears, firefly and particles (drawn by the view's overlay), minus
/// WebAudio (the app plays the cues). Every frame it
/// turns the expression, the call state and Ferni's real voice level into
/// spring targets, steps the springs, lays hand-keyed moments and the family
/// table on top, and returns the shader's uniforms. Deterministic for a seed,
/// so tests can drive it frame by frame.
@MainActor
public final class AliveRig {
    // MARK: Inputs (set before each frame)

    public var activity = AvatarActivity.idle
    public var expression = "neutral"
    /// Ferni's voice level from the remote audio track (AudioLevelMeter's gated RMS, 0...1).
    public var voiceLevel: Float = 0
    public var reduceMotion = false
    /// Hold every pose exactly at its target (still images, tests).
    public var still = false
    public var dark = false
    /// Reading along (the consent sheet): eyes down, slow blinks.
    public var reading = false

    // MARK: State

    public private(set) var persona: WindowPersona
    public private(set) var guestPersona: WindowPersona?
    /// Cues for the app (sound, haptics) since the last frame.
    public private(set) var cues: [KeyedCue] = []

    enum Ch: Int, CaseIterable {
        case squash, scale, posY, roll, pitch, yaw, gx, gy, topL, topR, botL, botR, archL, archR,
             sxL, syL, sxR, syR, tilt, crease, halo, glow, blush, poke, posX, shear, ringY, ringS, conv,
             stageX, stageY, stageS, capT, capB, capPitch
    }

    var s: [RigSpring]
    var g = Guest()
    private var time = 0.0
    private var rng: SplitMix
    private var env = 0.0, lastOnset = -1.0
    private var blink = 0.0, blinkFrom = 0.0, blinkPlan: [(at: Double, dur: Double, to: Double)] = [], blinkSeg: (at: Double, dur: Double, to: Double)?
    private var nextBlink = 2.5, nextSaccade = 0.0, nextNod = 0.0
    private var gazeTarget = SIMD2<Double>(0, 0)
    private var overlay: (id: String, until: Double)?
    private var lastActivity = AvatarActivity.idle
    private struct Track {
        var key: WritableKeyPath<SequenceLayer, Double>, values: [Double], at: Double, duration: Double
        var ease: (Double) -> Double
    }
    private var tracks: [Track] = []
    private var sequenceBeats: [(at: Double, step: AliveSequence.Step, holdUntil: Double)] = []
    private var playing: (id: String, until: Double)?
    private var layer = SequenceLayer()
    private var listeningMicros: [(at: Double, micro: MicroExpression)] = []
    private var keyed: (moment: KeyedMoment, start: Double, fired: Int)?
    private var handoff: Handoff?
    private var bodyFrom: SIMD3<Float>, bodyTo: SIMD3<Float>, glowFrom: SIMD3<Float>, glowTo: SIMD3<Float>, colourT = 1.0

    struct Guest {
        var x = RigSpring(2.9, k: 90, d: 12), y = RigSpring(-0.45, k: 90, d: 12), s = RigSpring(0.46, k: 120, d: 14)
        var sq = RigSpring(1, k: 170, d: 9), gx = RigSpring(-0.6, k: 500, d: 40), gy = RigSpring(0, k: 500, d: 40)
        var arch = RigSpring(0, k: 300, d: 30)
        var blinkAt = -1.0, nextBlink = 0.0
        var leaving: Double?
        mutating func step(_ dt: Double) {
            for kp in [\Guest.x, \.y, \.s, \.sq, \.gx, \.gy, \.arch] { self[keyPath: kp].step(dt) }
        }
    }

    struct Handoff {
        let to: WindowPersona, from: WindowPersona, start: Double, fromCorner: Bool
        var done = 0
    }

    public init(persona: WindowPersona = .ferni, seed: UInt64 = UInt64(Date().timeIntervalSince1970 * 1000)) {
        self.persona = persona
        rng = SplitMix(seed)
        let colours = Self.colours(persona)
        (bodyFrom, bodyTo, glowFrom, glowTo) = (colours.body, colours.body, colours.glow, colours.glow)
        let table: [(Double, Double, Double)] = [
            (1, 170, 9), (1, 160, 14), (0, 110, 13), (0, 80, 11), (0, 80, 11), (0, 60, 11), (0, 650, 46), (0, 650, 46),
            (0.1, 700, 50), (0.1, 700, 50), (0.06, 700, 50), (0.06, 700, 50), (0, 500, 40), (0, 500, 40),
            (1, 320, 22), (1, 320, 22), (1, 320, 22), (1, 320, 22), (0, 400, 36), (0, 200, 26), (0.2, 60, 14),
            (0.3, 40, 12), (0, 50, 14), (0, 260, 6), (0, 70, 10), (0, 140, 7), (0, 34, 9), (1, 60, 10), (0, 300, 30),
            (0, 80, 13), (0, 80, 13), (1, 90, 13),
            // The lid caps spring past and settle like the web's 0.3 s
            // cubic-bezier(0.34, 1.56, 0.64, 1).
            (0, 170, 13), (0, 170, 13),
            // The pitch the face itself rests at (its own look up or down), as
            // the pitch spring follows it: the caps sit on the orb as the web's
            // there and follow the head only from it.
            (0, 80, 11),
        ]
        s = table.map { RigSpring($0.0, k: $0.1, d: $0.2) }
    }

    subscript(_ c: Ch) -> RigSpring {
        get { s[c.rawValue] }
        set { s[c.rawValue] = newValue }
    }

    var motion: Double { reduceMotion ? 0.35 : 1 }
    var tempo: Double { Self.tempo[persona] ?? 1 }

    // MARK: Moments

    /// What the rig was asked to do, newest last (the last 16): lets a test
    /// check that a view passed each of its inputs on to the body.
    public enum Request: Equatable, Sendable {
        case keyed(KeyedMoment), sequence(String), micro(MicroExpression), doubleTake
    }
    public private(set) var requests: [Request] = []

    private func record(_ request: Request) {
        requests.append(request)
        if requests.count > 16 { requests.removeFirst(requests.count - 16) }
    }

    /// A hand-keyed moment (arrival, a big win, goodbye).
    public func play(_ moment: KeyedMoment) {
        record(.keyed(moment))
        keyed = (moment, time, 0)
    }

    /// When, in the outgoing persona's beats, the teammate takes the middle.
    static let handoffSwap = 2.15

    /// Seconds from a handoff's start until the teammate has the middle of the
    /// stage, at `from`'s tempo: when the call's name should change (design
    /// audit P1-3: the chip said Maya while Ferni was still in front).
    public static func handoffSeconds(from: WindowPersona) -> Double { handoffSwap * (tempo[from] ?? 1) }

    /// The family table: `to` peeks in, they greet, swap places, and `to`
    /// takes the call while the one before waits small in the corner.
    public func handOff(to: WindowPersona) {
        guard to != persona, handoff == nil else { return }
        let fromCorner = guestPersona == to
        if !fromCorner {
            guestPersona = to
            g = Guest()
            g.x.x = 2.6; g.y.x = -0.62; g.s.x = 0.42
            g.x.t = 1.25; g.y.t = -0.62; g.s.t = 0.42
        }
        handoff = Handoff(to: to, from: persona, start: time, fromCorner: fromCorner)
        flash("intrigued", seconds: 0.1)
    }

    /// The teammate in the corner steps out (the call ended).
    public func dismissGuest() {
        guard guestPersona != nil, handoff == nil else { return }
        g.x.t = -2.8
        g.leaving = time + 0.7
    }

    /// Persona without staging (first appearance, outside a call): a colour
    /// crossfade, or at once.
    public func show(_ persona: WindowPersona, animated: Bool = true) {
        guard persona != self.persona, handoff == nil else { return }
        self.persona = persona
        let c = Self.colours(persona)
        (bodyFrom, glowFrom) = animated ? (currentBody, currentGlow) : (c.body, c.glow)
        (bodyTo, glowTo, colourT) = (c.body, c.glow, animated ? 0 : 1)
    }

    func flash(_ id: String, seconds: Double) { overlay = (id, time + seconds * tempo) }

    /// A choreographed moment from the design system's sequences (the
    /// prototype's playSequence), at the persona's tempo. One plays at a time:
    /// a lower-priority moment doesn't interrupt one still playing
    /// (orchestration.priorities). Under Reduce Motion the steps the tokens
    /// remove are left out and the motion is scaled down. Returns whether it plays.
    @discardableResult
    public func play(sequence id: String) -> Bool {
        record(.sequence(id))
        guard !still, let sequence = SequenceTokens.sequence(id) else { return false }
        if let playing, time < playing.until, SequenceTokens.priority(id) < SequenceTokens.priority(playing.id) { return false }
        let removed = reduceMotion ? SequenceTokens.removedUnderReduceMotion(id) : []
        let end = (sequence.totalDuration ?? 1000) / 1000 * tempo
        tracks.removeAll()
        sequenceBeats.removeAll()
        for step in sequence.steps where !removed.contains(step.element) {
            let delay = (step.delay ?? 0) / 1000 * tempo, duration = max(0.001, (step.duration ?? 0) / 1000 * tempo)
            if step.expression != nil || step.element == "sparkle" || step.element == "confetti" || step.element == "ambientLight" {
                sequenceBeats.append((time + delay, step, time + max(0.5, end - delay + 0.4)))
            }
            for (property, key) in SequenceLayer.channels[step.element] ?? [:] {
                guard let values = step.tracks[property] else { continue }
                tracks.append(Track(key: key, values: values, at: time + delay, duration: duration, ease: sequenceEase(step.easing)))
            }
        }
        if let accent = SequenceAccent.all[id] {
            flash(accent.face, seconds: accent.hold)
            tracks.append(Track(key: \.pitch, values: accent.nod, at: time, duration: accent.nodSeconds * tempo, ease: sequenceEase("linear")))
        }
        playing = (id, time + end)
        return true
    }

    /// The sequence playing now, if any.
    var playingSequence: String? { playing.flatMap { time < $0.until ? $0.id : nil } }

    /// This frame's layer from the playing tracks, and the steps that came due.
    private func stepSequence() {
        tracks.removeAll { time > $0.at + $0.duration + 0.05 }
        var l = SequenceLayer()
        for tr in tracks where time >= tr.at {
            let u = tr.ease(clamp((time - tr.at) / tr.duration, 0, 1)) * Double(tr.values.count - 1)
            let i = min(tr.values.count - 2, max(0, Int(u.rounded(.down))))
            let v = tr.values[i] + (tr.values[i + 1] - tr.values[i]) * (u - Double(i)), v0 = tr.values[0]
            if SequenceLayer.multiplies(tr.key) { l[keyPath: tr.key] *= v0 != 0 ? v / v0 : 1 }
            else if SequenceLayer.lights(tr.key) { l[keyPath: tr.key] += v - v0 }
            else { l[keyPath: tr.key] += v }
        }
        layer = l
        while let beat = sequenceBeats.first, time >= beat.at {
            sequenceBeats.removeFirst()
            if let face = beat.step.expression { overlay = (face, beat.holdUntil) }
            if beat.step.element == "sparkle" || beat.step.element == "confetti" { pendingSparkles += min(14, (beat.step.particles ?? 6) + 3) }
            if beat.step.element == "ambientLight" { self[.glow].v += 3 }
        }
    }

    /// A micro-expression: its face for 80-120 ms (at the persona's tempo),
    /// felt more than seen. It never cuts a longer flash short, and still
    /// frames don't play it.
    public func micro(_ m: MicroExpression) {
        record(.micro(m))
        guard !still, let flash = m.flash else { return }
        if let overlay, overlay.until - time > flash.seconds * tempo { return }
        self.flash(flash.face, seconds: flash.seconds)
    }

    /// When Ferni starts listening: recognition at 0.3 s ("I hear you"), then
    /// interest or warmth at 1.5 s, each only while he's still listening (the
    /// prototype's runCall).
    private func stepMicros() {
        if activity != lastActivity {
            lastActivity = activity
            listeningMicros = activity == .listening
                ? [(time + 0.3, .recognition), (time + 1.5, rng.unit() < 0.5 ? .interest : .warmth)] : []
        }
        while let next = listeningMicros.first, time >= next.at {
            listeningMicros.removeFirst()
            micro(next.micro)
        }
    }

    // MARK: Touch, tears, the firefly and particles

    /// Something the prototype drew around Ferni, for the view's overlay. In
    /// Ferni radii from his centre, y up.
    public struct Particle: Equatable, Sendable {
        /// z (tired), sweat (nervous), question (confused) and bang (surprised)
        /// arrive once with the expression, as in the prototype's playFx.
        public enum Kind: Sendable { case sparkle, heart, firefly, z, sweat, question, bang }
        public var kind: Kind
        public var x: Double, y: Double, size: Double, alpha: Double
        public var rotation = 0.0
    }

    public private(set) var particles: [Particle] = []

    private struct Spark {
        var kind: Particle.Kind; var x, y, vx, vy, size, born, life: Double
        var ay = 0.0, rotation = 0.0
    }
    /// The expression the once-per-feeling particles last came for.
    private var effectExpression = "neutral"
    private var sparks: [Spark] = []
    private var pending: [KeyedCue] = []
    private var pokeDir = SIMD3<Double>(0, 0.3, 0.95)
    private var pokeTimes: [Double] = []
    /// Taps in the last 1.4 s: four make him spin (the prototype's tapReaction).
    private var quickTaps: [Double] = []
    private var spinStart: Double?
    private var pendingSparkles = 0
    /// A finger held on or near him (in Ferni radii, y up; nil until it moves).
    private var fingerDown = false, finger: SIMD2<Double>?, fingerNear = false
    private var doubleTakeStart: Double?, doubleTakeAway = SIMD2<Double>.zero, doubleTakeHeld = false
    /// A held breath: the body's squash pinned at `value` until `until`.
    private var squashHold: (until: Double, value: Double)?
    private var lastTouchCue = -10.0
    private var quietSince = 0.0
    private struct Fly {
        enum Phase { case wander, approach, land, flee }
        var phase: Phase, start: Double, pos: SIMD3<Double>, vel: SIMD3<Double>
    }
    private var fly: Fly?, fireflyDone = false
    private var sneezeStart: Double?, sneezeStage = 0, chooAt = 0.0
    private var nextSparkle = 0.0
    private var tearT = 0.0, tearA = 0.0

    /// A finger on Ferni at `point`, in Ferni radii from his centre (y up):
    /// a jelly dent there, a glance at the finger, a small flash of delight,
    /// and one soft tap in the hand at most every 2 s. Four quick taps (within
    /// 1.4 s) and he spins, silly, with sparkles and a whoosh. After five in
    /// ten seconds it's only a calm "I'm here" look. Nothing is counted or kept.
    public func poke(at point: SIMD2<Double>) {
        let len = simd_length(point)
        let p = len > 1 ? point / len : point
        quietSince = time
        if fly != nil { fly = nil; fireflyDone = true; sneezeStart = nil; sneezeStage = 0; squashHold = nil }
        pokeTimes = pokeTimes.filter { time - $0 < 10 } + [time]
        quickTaps = quickTaps.filter { time - $0 < 1.4 } + [time]
        pokeDir = simd_normalize(SIMD3(p.x, p.y, max((1 - simd_length_squared(p)).squareRoot(), 0.25)))
        gazeTarget = SIMD2(clamp(p.x, -0.85, 0.85), clamp(p.y, -0.7, 0.7))
        nextSaccade = time + 1.4
        if reduceMotion {
            scheduleBlink(at: time)
        } else if quickTaps.count >= 4, spinStart == nil {
            quickTaps = []
            spinStart = time
            pendingSparkles = 10
            flash("silly", seconds: 1.6)
            pending.append(.whoosh)
            self[.poke].v += 9
        } else if pokeTimes.count >= 5 {
            flash("content", seconds: 1.6)
            scheduleBlink(at: time + 0.15, slow: true)
            self[.poke].v += 2.5
        } else {
            flash(pokeTimes.count % 2 == 1 ? "happy" : "surprised", seconds: 0.7)
            self[.poke].v += 9
            self[.squash].v += 1.2
        }
        if time - lastTouchCue >= 2 {
            lastTouchCue = time
            pending.append(.touch)
        }
    }

    /// How long a finger stays still before Ferni notices it (the prototype's 650 ms).
    public static let noticeAfter = 0.65
    /// Farther than this (in Ferni radii) and the finger isn't near him.
    static let nearWithin = 1.9

    /// A finger held still on Ferni at rest (`noticeAfter`), then wherever it
    /// moves (`point`, in Ferni radii from his centre, y up; nil when it hasn't
    /// moved yet): he notices it, leans toward it, his eyes follow it, and
    /// they cross when it's close to his face (the prototype's stepFinger).
    public func fingerHeld(at point: SIMD2<Double>?) {
        guard !still else { return }
        fingerDown = true
        if let point { finger = point }
    }

    /// The finger is lifted: he lets it go.
    public func fingerLifted() {
        fingerDown = false
        finger = nil
    }

    /// The person is back after a little while (the prototype's doubleTake):
    /// a glance at them, a look away, a held breath with a half blink, then
    /// the snap back with a little start and a flash of surprise.
    public func doubleTake() {
        record(.doubleTake)
        guard !still, doubleTakeStart == nil, handoff == nil, keyed == nil else { return }
        doubleTakeStart = time
        // Away is where he was looking, or a side glance if that was at them.
        doubleTakeAway = simd_length(gazeTarget) > 0.3 ? gazeTarget : SIMD2(rng.unit() < 0.5 ? -0.5 : 0.5, 0.15)
    }

    /// The double take's beats, at the persona's tempo: at them 0-0.2 s,
    /// away until 0.67 s (holding his breath from 0.56 s), then back at them.
    private func stepDoubleTake(m: Double) {
        guard let start = doubleTakeStart else { return }
        let e = (time - start) / tempo
        nextSaccade = time + 1.2
        gazeTarget = e < 0.2 ? .zero : doubleTakeAway
        if e >= 0.56, !doubleTakeHeld {
            doubleTakeHeld = true
            squashHold = (time + 0.11 * tempo, 1 - 0.07 * m)
            halfBlink()
        }
        if e >= 0.67 {
            doubleTakeStart = nil
            doubleTakeHeld = false
            squashHold = nil
            gazeTarget = .zero
            micro(.surprise)
            pending.append(.startle)
            self[.squash].v += 3.4 * m
            self[.posY].v += 1.4 * m
        }
    }

    /// The playing sequence on the body, as the prototype lays it over the pose.
    private func applyLayer(m: Double) {
        let l = layer
        guard l != SequenceLayer() else { return }
        let squash = pow(l.sy / l.sx, 2.0 / 3)
        if squashHold == nil { self[.squash].t *= squash }
        self[.scale].t *= l.scale * (l.sx * l.sy).squareRoot() / squash
        self[.posY].t -= l.ty / 100 * 1.6 * m
        self[.roll].t += l.rot * .pi / 180 * 1.8 * m
        self[.pitch].t += l.pitch * .pi / 180 * m
        self[.glow].t += l.glow
        self[.halo].t += l.halo
        self[.ringS].t = l.haloS
    }

    /// One turn about his axis in 0.9 s, easing out; then the yaw unwinds the
    /// full turn so he settles facing front.
    private func stepSpin() {
        guard let spinStart else { return }
        let u = clamp((time - spinStart) / 0.9, 0, 1)
        self[.yaw].t += 2 * .pi * (1 - pow(1 - u, 3))
        if u >= 1 {
            self.spinStart = nil
            self[.yaw].x -= 2 * .pi
        }
    }

    private func stepTears(_ face: Face, dt: Double) -> SIMD4<Float> {
        let crying = face.effect == "tears"
        tearA += ((crying ? 1 : 0) - tearA) * min(1, dt * 3)
        if tearA > 0.01 { tearT += dt * (reduceMotion ? 0.5 : 1) }
        let left = (tearT / 2.6).truncatingRemainder(dividingBy: 1), right = ((tearT + 1.3) / 2.6).truncatingRemainder(dividingBy: 1)
        return SIMD4(Float(left), Float(right), Float(tearA), Float(tearA))
    }

    /// Once a session, after 20 s at rest with no touch, a firefly wanders by
    /// for 5.5 s while Ferni watches, comes in to land on his head (his eyes
    /// crossing as it nears), rests there 1.6 s, and he sneezes it away: the
    /// prototype's stepFly and sneeze.
    private func stepFirefly(dt: Double, m: Double) {
        if activity != .idle || reduceMotion {
            if fly != nil { fly = nil; fireflyDone = true; sneezeStart = nil }
            quietSince = max(quietSince, time)
            return
        }
        if fly == nil, !fireflyDone, time - quietSince >= 20 {
            fly = Fly(phase: .wander, start: time, pos: Self.wander(0), vel: .zero)
        }
        stepSneeze(m: m)
        guard var f = fly else { return }
        let t = time - f.start
        switch f.phase {
        case .wander:
            let p = Self.wander(t)
            f.vel = (p - f.pos) / max(dt, 1e-3)
            f.pos = p
            if t >= 5.5 { f.phase = .approach; f.start = time }
        case .approach:
            let head = headTop
            f.vel += ((head - f.pos) * 2.2 - f.vel * 1.4) * dt
            f.pos += f.vel * dt
            if simd_distance(f.pos, head) < 0.08 || t > 6 {
                f.phase = .land; f.start = time
                self[.squash].v -= 1.2 * m
            }
        case .land:
            f.pos = headTop
            if t > 1.6, sneezeStart == nil { sneezeStart = time }
        case .flee:
            f.pos += f.vel * dt
            if f.pos.y > 4 || abs(f.pos.x) > 4 { fly = nil; fireflyDone = true; return }
        }
        fly = f
    }

    /// The top of his head, where the firefly lands (in Ferni radii, a little in front).
    private var headTop: SIMD3<Double> {
        SIMD3(self[.posX].x * 0.35, self[.posY].x + self[.squash].x + 0.07, 0.25)
    }

    /// The firefly's wandering path, `t` seconds in.
    static func wander(_ t: Double) -> SIMD3<Double> {
        SIMD3(-1.9 + t / 7 * 3.8 + 0.25 * sin(t * 2.3), 0.75 + 0.35 * sin(t * 1.7) + 0.1 * sin(t * 5.1), 0.7 + 0.3 * sin(t * 0.9))
    }

    /// Ah... ah... (a yawn-wide inhale, held), choo (a jolt down and up, the
    /// firefly sent off), then a giggle and a few sparkles.
    private func stepSneeze(m: Double) {
        guard let start = sneezeStart else { return }
        let e = (time - start) / tempo
        if sneezeStage == 0 {
            sneezeStage = 1
            flash("yawning", seconds: 0.52)
            squashHold = (time + 0.42 * tempo, 1.1)
        }
        if sneezeStage == 1, e >= 0.46 {
            sneezeStage = 2
            chooAt = time
            squashHold = nil
            self[.squash].v -= 6 * m
            self[.pitch].v -= 4 * m
            self[.posY].v += 1.6 * m
            if var f = fly {
                f.phase = .flee; f.start = time
                f.vel = SIMD3(rng.range(-1.2, 1.2), 3, 0)
                fly = f
            }
        }
        if sneezeStage == 2, time - chooAt >= 0.26 {
            sneezeStart = nil
            sneezeStage = 0
            flash("amused", seconds: 1.5)
            pending.append(.giggle)
            pendingSparkles += 5
        }
    }

    /// The firefly's light for the shader: where it is and how bright.
    private func fireflyLight() -> SIMD4<Float> {
        guard let f = fly else { return .zero }
        let fadeIn = f.phase == .wander ? min(1, time - f.start) : 1
        let w = fadeIn * (0.75 + 0.25 * sin(time * 9))
        sparks.append(Spark(kind: .firefly, x: f.pos.x, y: f.pos.y, vx: 0, vy: 0, size: 0.09, born: time, life: 0))
        return SIMD4(Float(f.pos.x), Float(f.pos.y), Float(max(f.pos.z, 0.25)), Float(w * 0.8))
    }

    private func stepParticles(_ face: Face, dt: Double) {
        sparks.removeAll { $0.kind == .firefly || time - $0.born > $0.life }
        // Under Reduce Motion the feelings stay (confused without its ? read as
        // neutral: expression audit P1 #7), held still and faded in and out.
        // The bursts, which are only motion (sparkles, a touch's or goodbye's
        // hearts), don't play.
        let held = reduceMotion
        if held { pendingSparkles = 0 }
        func burst(_ kind: Particle.Kind, _ n: Int) {
            for _ in 0..<n {
                let a = rng.range(0, 2 * .pi), r = rng.range(1.05, 1.3)
                if kind == .heart {
                    sparks.append(Spark(kind: .heart, x: rng.range(-0.7, 0.7), y: rng.range(0.6, 1.0), vx: held ? 0 : rng.range(-0.08, 0.08),
                                        vy: held ? 0 : rng.range(0.35, 0.55), size: rng.range(0.14, 0.2), born: time, life: 1.6))
                } else if !held {
                    sparks.append(Spark(kind: .sparkle, x: cos(a) * r, y: sin(a) * r, vx: cos(a) * 0.25, vy: sin(a) * 0.25,
                                        size: rng.range(0.08, 0.14), born: time, life: rng.range(0.7, 1.0)))
                }
            }
        }
        if pendingSparkles > 0 { burst(.sparkle, pendingSparkles); pendingSparkles = 0 }
        for cue in cues where !held {
            if cue == .sparkle { burst(.sparkle, 6) }
            if cue == .heart { burst(.heart, 3) }
        }
        // Once when the expression arrives (not for a touch's brief flash).
        if expression != effectExpression {
            effectExpression = expression
            emitFeeling(Face.of(expression).effect, burst: burst)
        }
        if face.effect == "sparkle", overlay == nil, time >= nextSparkle, !held {
            burst(.sparkle, 1)
            nextSparkle = time + 0.5
        }
        if sparks.count > 24 { sparks.removeFirst(sparks.count - 24) }
        for i in sparks.indices where sparks[i].kind != .firefly && time >= sparks[i].born && !held {
            sparks[i].vy += sparks[i].ay * dt
            sparks[i].x += sparks[i].vx * dt
            sparks[i].y += sparks[i].vy * dt
        }
        particles = sparks.filter { time >= $0.born }.map { s in
            let alpha = s.kind == .firefly ? 1 : sin(.pi * clamp((time - s.born) / s.life, 0, 1))
            return Particle(kind: s.kind, x: s.x, y: s.y, size: s.size, alpha: alpha, rotation: s.rotation)
        }
    }

    /// The prototype's emit() for the feelings with weight, in Ferni radii (y up):
    /// three z's drifting up one after another, a bead of sweat that slides
    /// down, a ? or ! above his head, and hearts for warmth.
    private func emitFeeling(_ effect: String?, burst: (Particle.Kind, Int) -> Void) {
        let held = reduceMotion
        switch effect {
        case "z":
            for i in 0..<3 {
                let d = Double(i)
                sparks.append(Spark(kind: .z, x: 0.55 + d * 0.12, y: 0.75 + d * 0.1, vx: held ? 0 : rng.range(0.09, 0.16),
                                    vy: held ? 0 : rng.range(0.2, 0.27), size: 0.2 * (0.8 + d * 0.25), born: time + d * 0.55, life: 2.2))
            }
        case "sweat":
            sparks.append(Spark(kind: .sweat, x: 0.72, y: 0.55, vx: 0, vy: held ? 0 : -0.05, size: 0.18, born: time, life: 1.8, ay: held ? 0 : -0.55))
        case "question", "bang":
            let question = effect == "question"
            sparks.append(Spark(kind: question ? .question : .bang, x: 0.62, y: 1.05, vx: 0, vy: held ? 0 : 0.07, size: 0.3,
                                born: time, life: 1.5, rotation: question ? 0.18 : -0.12))
        case "heart":
            burst(.heart, 4)
        default:
            break
        }
    }

    // MARK: Frame

    /// Advances to `now` (seconds since the view woke) and returns the uniforms.
    public func frame(at now: Double) -> AliveUniforms {
        let dt = min(0.05, max(0, now - time))
        time = now
        cues = pending
        pending.removeAll()
        let m = motion
        stepMicros()
        stepSequence()
        let face = Face.of(faceID())
        apply(face, m: m)
        stepHandoff(m: m)
        stepGuest(dt, m: m)
        stepDoubleTake(m: m)
        stepFirefly(dt: dt, m: m)
        stepGaze(face, m: m)
        stepSpin()

        // Ferni's real voice moves the body: loudness as an envelope, syllable onsets as nods.
        if activity == .speaking {
            let target = Self.envelopeTarget(voiceLevel)
            let prev = env
            env += (target - env) * min(1, dt * (target > env ? 40 : 12))
            if env - prev > 0.12, env > 0.55, now - lastOnset > 0.26 {
                lastOnset = now
                self[.pitch].v -= 0.9 * m
                self[.squash].v += 0.7 * m
                if rng.unit() < 0.25 { halfBlink() }
                if guestPersona != nil, rng.unit() < 0.5 { g.sq.v -= 0.9 * m }
            }
        } else {
            env *= pow(0.85, dt * 60)
        }

        let breathing = still ? 0 : breath(face) * m
        self[.squash].t = face.squash + breathing + env * 0.04 * m
        if let hold = squashHold {
            if time < hold.until { self[.squash].t = hold.value } else { squashHold = nil }
        }
        self[.posY].t = face.posY + (still ? 0 : sin(now * 1.05) * 0.03 * m) + env * 0.02 * m
        // Connecting: he leans in, his light rising, eyes up for whoever is coming.
        self[.glow].t = face.glow + env * 0.45 + (activity == .arriving ? 0.3 * m : 0)
        self[.posX].t = 0
        self[.ringY].t = self[.posY].x
        self[.ringS].t = 1
        applyLayer(m: m)
        self[.shear].t = clamp(-self[.posX].v * 0.05 - self[.yaw].v * 0.012, -0.16, 0.16) * m
        self[.poke].t = 0

        stepBlink()
        let steps = Int((dt / (1.0 / 240)).rounded(.up))
        for _ in 0..<steps { for i in s.indices { s[i].step(dt / Double(steps)) } }
        applyKeyed(dt)
        if still { for i in s.indices { s[i].x = s[i].t; s[i].v = 0 } }
        if colourT < 1 { colourT = min(1, colourT + dt / 0.55) }
        var u = uniforms(now)
        u.fly = fireflyLight()
        u.tear = stepTears(face, dt: dt)
        stepParticles(face, dt: dt)
        return u
    }

    func faceID() -> String {
        if let overlay, time < overlay.until { return overlay.id }
        overlay = nil
        if expression == "neutral", let stateFace = Self.stateFace[activity] { return stateFace }
        return expression
    }

    private func apply(_ f: Face, m: Double) {
        self[.topL].t = f.left.top; self[.topR].t = f.right.top
        self[.botL].t = f.left.bot; self[.botR].t = f.right.bot
        self[.archL].t = f.left.arch; self[.archR].t = f.right.arch
        self[.sxL].t = f.left.sx; self[.syL].t = f.left.sy; self[.sxR].t = f.right.sx; self[.syR].t = f.right.sy
        self[.tilt].t = f.tilt; self[.crease].t = f.crease; self[.halo].t = f.halo; self[.blush].t = f.blush
        self[.capT].t = f.capTop; self[.capB].t = f.capBottom
        self[.capPitch].t = clamp(f.gy, -0.7, 0.7) * max(m, 0.5) * 0.12
        // The head's tilt is a pose, not motion: Reduce Motion keeps it (at 35%
        // confused read as neutral, expression audit P1 #7).
        self[.roll].t = f.roll; self[.pitch].t = 0; self[.scale].t = 1 + (f.scale - 1) * m
    }

    private func breath(_ f: Face) -> Double {
        let (period, sy, sx): (Double, Double, Double) =
            activity == .speaking ? (1.8, 1.03, 0.98)
            : ["happy", "playful", "coaching", "surprised"].contains(f.family) ? (2.5, 1.025, 0.985)
            : ["presence", "tired", "warmth"].contains(f.family) ? (5, 1.02, 0.99) : (4, 1.018, 0.994)
        let amp = (pow(sy / sx, 2.0 / 3) - 1) * 0.5
        return sin(time * 2 * .pi / (period * tempo)) * amp
    }

    private func stepGaze(_ f: Face, m: Double) {
        var focus: SIMD2<Double>?
        if let handoff, handoff.done < 4, guestPersona != nil {
            focus = SIMD2(g.x.x - self[.stageX].x, g.y.x - self[.stageY].x)
        }
        // A finger held near him: noticed once, then the focus (in front of him,
        // z 1.3). The firefly, while it's here, has his attention instead.
        let near = fingerDown && activity == .idle && doubleTakeStart == nil && fly == nil
            && (finger.map { simd_length($0) < Self.nearWithin } ?? true)
        if near, !fingerNear {
            micro(.noticing)
            pending.append(.notice)
        }
        fingerNear = near
        let held: SIMD3<Double>? = if focus != nil || doubleTakeStart != nil {
            nil
        } else if let f = fly {
            SIMD3(f.pos.x - self[.posX].x * 0.35, f.pos.y - self[.posY].x, f.pos.z)
        } else if near {
            finger.map { SIMD3($0.x * 0.9, $0.y * 0.9, 1.3) }
        } else {
            nil
        }
        self[.conv].t = held.map { clamp(0.32 / (simd_length(SIMD3($0.x, $0.y - 0.1, $0.z - 1.05)) + 0.25) - 0.18, 0, 0.32) } ?? 0
        if near, focus == nil {
            // He leans in, eyes a little wider.
            self[.pitch].t -= 0.06 * m
            for c in [Ch.sxL, .sxR] { self[c].t *= 1.04 }
            for c in [Ch.syL, .syR] { self[c].t *= 1.08 }
        }
        if let focus {
            gazeTarget = SIMD2(clamp(focus.x / 1.2, -1, 1), clamp((focus.y - 0.05) / 1.25, -1, 1))
            self[.roll].t += clamp(focus.x * 0.06, -0.12, 0.12)
        } else if let p = held {
            gazeTarget = SIMD2(clamp(p.x / (1.2 + p.z * 0.15), -1, 1), clamp((p.y - 0.05) / 1.25, -1, 1))
            self[.roll].t += clamp(p.x * 0.06, -0.12, 0.12) * m
            self[.pitch].t += clamp((p.y - 0.2) * 0.08, -0.1, 0.18) * m
            nextSaccade = time + 0.8
        } else if still {
            gazeTarget = SIMD2(f.gx, f.gy)
        } else if time > nextSaccade {
            let prev = gazeTarget
            gazeTarget = SIMD2(f.gx + rng.range(-0.2, 0.2) * (activity == .listening ? 0.5 : 1), f.gy + rng.range(-0.14, 0.14))
            if activity == .thinking { gazeTarget = SIMD2(0.5 + rng.range(-0.1, 0.1), 0.42) }
            if simd_distance(gazeTarget, prev) > 0.25, rng.unit() < 0.35 { scheduleBlink(at: time + 0.01) }
            nextSaccade = time + rng.range(1.1, 3.4)
        }
        if reading, focus == nil { gazeTarget.y = min(gazeTarget.y, f.gy - 0.4) }
        if activity == .arriving, focus == nil { gazeTarget.y = max(gazeTarget.y, 0.4) }
        let drift = still ? .zero : SIMD2(sin(time * .pi * 2 / 8) * 0.04, sin(time * .pi * 2 / 8 * 1.3 + 1) * 0.03)
        self[.gx].t = clamp(gazeTarget.x + drift.x, -0.85, 0.85) * max(m, 0.5)
        self[.gy].t = clamp(gazeTarget.y + drift.y + layer.eyesTy * -0.03, -0.7, 0.7) * max(m, 0.5)
        self[.yaw].t = self[.gx].t * 0.32
        self[.roll].t += self[.gx].t * 0.05
        self[.pitch].t += self[.gy].t * 0.12
        if activity == .listening {
            self[.pitch].t -= 0.06
            if !still, time > nextNod { self[.pitch].v -= 1.3 * m; nextNod = time + rng.range(1.6, 3.0) }
        }
    }

    // MARK: The family table

    private func stepHandoff(m: Double) {
        guard var h = handoff else { return }
        let t = (time - h.start) / tempo
        // A new teammate peeks in from the side with two hops; one already in the corner just turns.
        if h.done == 0 {
            if h.fromCorner { h.done = 2 } else if t >= 0.22 { g.sq.v += 3.4 * m; g.y.v += 2.2 * m; cues.append(.hop); h.done = 1 }
        }
        if h.done == 1, t >= 0.52 { g.sq.v += 3.4 * m; g.y.v += 2.2 * m; cues.append(.hop); h.done = 2 }
        if h.done == 2, t >= 0.9 {                                           // they greet each other
            flash("happy", seconds: 1)
            self[.roll].v += 1.4 * m * (g.x.x - self[.stageX].x >= 0 ? 1 : -1)
            g.arch.t = 0.6; g.sq.v += 2.6 * m
            cues.append(.arrivalChime)
            h.done = 3
        }
        if h.done == 3, t >= 1.45 {                                          // swap places
            g.x.t = 0.35; g.y.t = 0; g.s.t = 1; g.y.v += 3 * m; g.sq.v += 3 * m; g.arch.t = 0
            self[.stageX].t = -1.2; self[.stageY].t = -0.62; self[.stageS].t = 0.42; self[.posY].v += 2 * m
            cues.append(.whoosh)
            play(sequence: "handoff_transition")
            h.done = 4
        }
        if h.done == 4, t >= Self.handoffSwap {                              // hand over the role mid-flight
            func swap(_ a: Ch, _ b: WritableKeyPath<Guest, RigSpring>) {
                let (x, v) = (self[a].x, self[a].v)
                self[a].x = g[keyPath: b].x; self[a].v = g[keyPath: b].v
                g[keyPath: b].x = x; g[keyPath: b].v = v
            }
            swap(.stageX, \.x); swap(.stageY, \.y); swap(.stageS, \.s)
            self[.stageX].t = 0; self[.stageY].t = 0; self[.stageS].t = 1
            g.x.t = -1.2; g.y.t = -0.62; g.s.t = 0.42
            let c = Self.colours(h.to)
            (bodyFrom, bodyTo, glowFrom, glowTo, colourT) = (c.body, c.body, c.glow, c.glow, 1)
            guestPersona = h.from
            persona = h.to
            flash("happy", seconds: 0.9)
            cues.append(.sparkle)
            handoff = nil
            return
        }
        handoff = h
    }

    private func stepGuest(_ dt: Double, m: Double) {
        guard guestPersona != nil else { return }
        let steps = Int((dt / (1.0 / 240)).rounded(.up))
        for _ in 0..<steps { g.step(dt / Double(max(steps, 1))) }
        let mainX = self[.stageX].x + self[.posX].x * 0.35, mainY = self[.stageY].x + self[.posY].x
        g.gx.t = clamp((mainX - g.x.x) * 0.35, -0.8, 0.8)      // the teammate watches whoever is talking
        g.gy.t = clamp((mainY - g.y.x) * 0.3, -0.5, 0.5)
        if handoff == nil { g.sq.t = 1 + sin(time * 2 * .pi / 4.4 + 1.3) * 0.008 * m }
        if time > g.nextBlink { g.blinkAt = time; g.nextBlink = time + rng.range(2.8, 6.5) }
        if let leaving = g.leaving, time >= leaving { guestPersona = nil; g = Guest() }
    }

    // MARK: Blinks and keyed moments

    private func scheduleBlink(at t: Double, slow: Bool = false) {
        let k = slow ? 2.0 : 1.0
        blinkPlan = [(t, 0.055 * k, 1), (t + 0.075 * k, 0.075 * k, 0)]
        if !slow, rng.unit() < 0.16 { blinkPlan += [(t + 0.26, 0.05, 1), (t + 0.33, 0.08, 0)] }
        nextBlink = time + rng.range(3, 7) * (activity == .listening ? 1.25 : 1)
    }

    func halfBlink() { blinkPlan = [(time, 0.045, 0.5), (time + 0.055, 0.055, 0)] }

    private func stepBlink() {
        if blinkSeg == nil, let next = blinkPlan.first, time >= next.at {
            blinkSeg = blinkPlan.removeFirst()
            blinkFrom = blink
        }
        if let seg = blinkSeg {
            let u = clamp((time - seg.at) / seg.dur, 0, 1)
            let eased = seg.to > blinkFrom ? u * u : 1 - (1 - u) * (1 - u)
            blink = blinkFrom + (seg.to - blinkFrom) * eased
            if u >= 1 { blinkSeg = nil }
        } else if !still, time >= nextBlink {
            scheduleBlink(at: time, slow: reading || expression == "sleepy" || expression == "drowsy")
        }
    }

    private func applyKeyed(_ dt: Double) {
        guard let (moment, start, fired) = keyed else { return }
        let f = (time - start) * 60 / tempo
        if f > moment.end { keyed = nil; return }
        var fired2 = fired
        while fired2 < moment.cues.count, f >= moment.cues[fired2].frame { cues.append(moment.cues[fired2].cue); fired2 += 1 }
        keyed = (moment, start, fired2)
        for (channel, keys) in moment.channels {
            let v = KeyedMoment.sample(keys, at: f)
            for c in Self.targets(channel) {
                self[c].v = abs(v - self[c].x) > 1 ? 0 : (v - self[c].x) / max(dt, 1e-3)
                self[c].x = v
                self[c].t = v
            }
        }
    }

    // MARK: Uniforms

    private var currentBody: SIMD3<Float> { simd_mix(bodyFrom, bodyTo, SIMD3(repeating: Float(smooth(colourT)))) }
    private var currentGlow: SIMD3<Float> { simd_mix(glowFrom, glowTo, SIMD3(repeating: Float(smooth(colourT)))) }

    private func uniforms(_ now: Double) -> AliveUniforms {
        var u = AliveUniforms()
        u.res.z = Float(now.truncatingRemainder(dividingBy: 1000))
        u.res.w = dark ? 1 : 0
        let lidGaze = clamp(-self[.gy].x * 0.16, -0.08, 0.14)
        func lid(_ v: Double) -> Float { Float(clamp(v, 0, 1)) }
        u.body = SIMD4(currentBody, Float(clamp(self[.squash].x, 0.6, 1.5)))
        u.bg0.w = Float(clamp(self[.scale].x, 0.85, 1.2) * clamp(self[.stageS].x, 0.3, 1.2))
        u.bg1.w = Float(clamp(self[.glow].x, 0, 1.5))
        u.glowCol = SIMD4(currentGlow, Float(clamp(self[.blush].x, 0, 1)))
        u.pos = SIMD4(Float(self[.stageX].x + self[.posX].x * 0.35), Float(self[.stageY].x + self[.posY].x), 0, Float(self[.tilt].x))
        u.lean = SIMD4(Float(self[.roll].x), Float(self[.pitch].x), Float(self[.yaw].x), Float(clamp(self[.crease].x, 0, 1)))
        u.gaze = SIMD4(Float(self[.gx].x + self[.conv].x), Float(self[.gy].x), Float(self[.gx].x - self[.conv].x), Float(self[.gy].x))
        u.eyes = SIMD4(Float(self[.sxL].x), Float(self[.syL].x), Float(self[.sxR].x), Float(self[.syR].x))
        u.arch = SIMD4(Float(clamp(self[.archL].x, 0, 1)), Float(clamp(self[.archR].x, 0, 1)),
                       Float(clamp(self[.halo].x, 0, 1.2)), Float(self[.shear].x))
        u.ring = SIMD4(Float(self[.ringY].x - self[.posY].x), Float(self[.ringS].x), Float(clamp(g.arch.x, 0, 1)), 0)
        u.lids = SIMD4(lid(self[.topL].x + lidGaze + (1 - self[.topL].x) * blink),
                       lid(self[.topR].x + lidGaze + (1 - self[.topR].x) * blink),
                       lid(self[.botL].x + blink * 0.15 + env * 0.2), lid(self[.botR].x + blink * 0.15 + env * 0.2))
        u.poke = SIMD4(SIMD3<Float>(pokeDir), Float(clamp(self[.poke].x, -0.6, 0.6)))
        u.caps = SIMD4(Float(clamp(self[.capT].x, 0, 0.9)), Float(clamp(self[.capB].x, 0, 0.7)), Float(self[.capPitch].x), 0)
        if let guest = guestPersona {
            u.guest = SIMD4(Float(g.x.x), Float(g.y.x), Float(g.s.x), 1)
            u.guestEye = SIMD4(Float(g.gx.x), Float(g.gy.x), Float(clamp(1 - abs(time - g.blinkAt - 0.075) / 0.075, 0, 1)),
                               Float(clamp(g.sq.x, 0.6, 1.5)))
            u.guestCol = SIMD4(Self.colours(guest).body, 0)
        }
        return u
    }

    // MARK: Tables

    nonisolated static func targets(_ c: KeyChannel) -> [Ch] {
        switch c {
        case .posY: [.posY]
        case .posX: [.posX]
        case .squash: [.squash]
        case .top: [.topL, .topR]
        case .arch: [.archL, .archR]
        case .eyeSY: [.syL, .syR]
        case .eyeSX: [.sxL, .sxR]
        case .gazeY: [.gy]
        case .gazeX: [.gx]
        case .pitch: [.pitch]
        case .roll: [.roll]
        case .yaw: [.yaw]
        case .glow: [.glow]
        case .halo: [.halo]
        case .blush: [.blush]
        }
    }

    static let stateFace: [AvatarActivity: String] = [.listening: "attentive", .thinking: "pondering", .speaking: "warm"]
    /// motion.json personaModifiers.timingMultiplier
    static let tempo: [WindowPersona: Double] = [.ferni: 1, .maya: 0.95, .peter: 0.85, .alex: 1, .jordan: 0.8, .nayan: 1.1]

    nonisolated static func colours(_ p: WindowPersona) -> (body: SIMD3<Float>, glow: SIMD3<Float>) {
        let hex: (String, String) = switch p {
        case .ferni: ("#4a6741", "#6b8760")
        case .maya: ("#a67a6a", "#c69a8a")
        case .peter: ("#3a6b73", "#5a8b93")
        case .alex: ("#5a6b8a", "#7a8baa")
        case .jordan: ("#c4856a", "#e4a58a")
        case .nayan: ("#b8956a", "#d8b58a")
        }
        return (linear(hex: hex.0), linear(hex: hex.1))
    }

    /// The envelope target for a gated RMS level: back to dB, then the
    /// prototype's -48...-18 dB window.
    nonisolated static func envelopeTarget(_ level: Float) -> Double {
        guard level > 0 else { return 0 }
        let rms = Double(level) / 4 + 0.02
        return clamp((20 * log10(rms) + 48) / 30, 0, 1)
    }
}

private func smooth(_ u: Double) -> Double { u * u * (3 - 2 * u) }

/// A small seeded generator so the rig is reproducible in tests.
struct SplitMix: RandomNumberGenerator {
    var state: UInt64
    init(_ seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
    mutating func unit() -> Double { Double(next() >> 11) / Double(1 << 53) }
    mutating func range(_ a: Double, _ b: Double) -> Double { a + unit() * (b - a) }
}
