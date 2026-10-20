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
             stageX, stageY, stageS
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

    /// A hand-keyed moment (arrival, a big win, goodbye).
    public func play(_ moment: KeyedMoment) {
        keyed = (moment, time, 0)
    }

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

    /// A micro-expression: its face for 80-120 ms (at the persona's tempo),
    /// felt more than seen. It never cuts a longer flash short, and still
    /// frames don't play it.
    public func micro(_ m: MicroExpression) {
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
    private var lastTouchCue = -10.0
    private var quietSince = 0.0
    private var fireflyStart: Double?, fireflyDone = false
    private var nextSparkle = 0.0
    private var tearT = 0.0, tearA = 0.0

    /// A finger on Ferni at `point`, in Ferni radii from his centre (y up):
    /// a jelly dent there, a glance at the finger, a small flash of delight,
    /// and one soft tap in the hand at most every 2 s. After five in ten
    /// seconds it's only a calm "I'm here" look. Nothing is counted or kept.
    public func poke(at point: SIMD2<Double>) {
        let len = simd_length(point)
        let p = len > 1 ? point / len : point
        quietSince = time
        if fireflyStart != nil { fireflyStart = nil; fireflyDone = true }
        pokeTimes = pokeTimes.filter { time - $0 < 10 } + [time]
        pokeDir = simd_normalize(SIMD3(p.x, p.y, max((1 - simd_length_squared(p)).squareRoot(), 0.25)))
        gazeTarget = SIMD2(clamp(p.x, -0.85, 0.85), clamp(p.y, -0.7, 0.7))
        nextSaccade = time + 1.4
        if reduceMotion {
            scheduleBlink(at: time)
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

    private func stepTears(_ face: Face, dt: Double) -> SIMD4<Float> {
        let crying = face.effect == "tears"
        tearA += ((crying ? 1 : 0) - tearA) * min(1, dt * 3)
        if tearA > 0.01 { tearT += dt * (reduceMotion ? 0.5 : 1) }
        let left = (tearT / 2.6).truncatingRemainder(dividingBy: 1), right = ((tearT + 1.3) / 2.6).truncatingRemainder(dividingBy: 1)
        return SIMD4(Float(left), Float(right), Float(tearA), Float(tearA))
    }

    /// Once a session, after 20 s at rest with no touch, a firefly wanders by
    /// for seven seconds and Ferni watches it.
    private func stepFirefly() -> SIMD4<Float> {
        if activity != .idle || reduceMotion {
            if fireflyStart != nil { fireflyStart = nil; fireflyDone = true }
            quietSince = max(quietSince, time)
            return .zero
        }
        if fireflyStart == nil, !fireflyDone, time - quietSince >= 20 { fireflyStart = time }
        guard let start = fireflyStart else { return .zero }
        let t = time - start, life = 7.0
        if t > life { fireflyStart = nil; fireflyDone = true; return .zero }
        let x = -1.9 + t / life * 3.8 + 0.25 * sin(t * 2.3)
        let y = 0.75 + 0.35 * sin(t * 1.7) + 0.1 * sin(t * 5.1)
        let w = min(1, t, life - t) * (0.75 + 0.25 * sin(t * 9))
        gazeTarget = SIMD2(clamp(x / 1.6, -0.85, 0.85), clamp((y - 0.05) / 1.25, -0.7, 0.7))
        nextSaccade = time + 0.5
        sparks.append(Spark(kind: .firefly, x: x, y: y, vx: 0, vy: 0, size: 0.09, born: time, life: 0))
        return SIMD4(Float(x), Float(y), 0.9, Float(w * 0.8))
    }

    /// Sparkles and hearts for the cues that ask for them, and a few sparkles
    /// while the expression itself sparkles. None under Reduce Motion.
    private func stepParticles(_ face: Face, dt: Double) {
        sparks.removeAll { $0.kind == .firefly || time - $0.born > $0.life }
        guard !reduceMotion else { sparks.removeAll(); particles = []; return }
        func burst(_ kind: Particle.Kind, _ n: Int) {
            for _ in 0..<n {
                let a = rng.range(0, 2 * .pi), r = rng.range(1.05, 1.3)
                if kind == .heart {
                    sparks.append(Spark(kind: .heart, x: rng.range(-0.7, 0.7), y: rng.range(0.6, 1.0), vx: rng.range(-0.08, 0.08),
                                        vy: rng.range(0.35, 0.55), size: rng.range(0.14, 0.2), born: time, life: 1.6))
                } else {
                    sparks.append(Spark(kind: .sparkle, x: cos(a) * r, y: sin(a) * r, vx: cos(a) * 0.25, vy: sin(a) * 0.25,
                                        size: rng.range(0.08, 0.14), born: time, life: rng.range(0.7, 1.0)))
                }
            }
        }
        for cue in cues {
            if cue == .sparkle { burst(.sparkle, 6) }
            if cue == .heart { burst(.heart, 3) }
        }
        // Once when the expression arrives (not for a touch's brief flash).
        if expression != effectExpression {
            effectExpression = expression
            emitFeeling(Face.of(expression).effect, burst: burst)
        }
        if face.effect == "sparkle", overlay == nil, time >= nextSparkle {
            burst(.sparkle, 1)
            nextSparkle = time + 0.5
        }
        if sparks.count > 24 { sparks.removeFirst(sparks.count - 24) }
        for i in sparks.indices where sparks[i].kind != .firefly && time >= sparks[i].born {
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
        switch effect {
        case "z":
            for i in 0..<3 {
                let d = Double(i)
                sparks.append(Spark(kind: .z, x: 0.55 + d * 0.12, y: 0.75 + d * 0.1, vx: rng.range(0.09, 0.16),
                                    vy: rng.range(0.2, 0.27), size: 0.2 * (0.8 + d * 0.25), born: time + d * 0.55, life: 2.2))
            }
        case "sweat":
            sparks.append(Spark(kind: .sweat, x: 0.72, y: 0.55, vx: 0, vy: -0.05, size: 0.18, born: time, life: 1.8, ay: -0.55))
        case "question", "bang":
            let question = effect == "question"
            sparks.append(Spark(kind: question ? .question : .bang, x: 0.62, y: 1.05, vx: 0, vy: 0.07, size: 0.3,
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
        let face = Face.of(faceID())
        apply(face, m: m)
        stepHandoff(m: m)
        stepGuest(dt, m: m)
        stepGaze(face, m: m)

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
        self[.posY].t = face.posY + (still ? 0 : sin(now * 1.05) * 0.03 * m) + env * 0.02 * m
        // Connecting: he leans in, his light rising, eyes up for whoever is coming.
        self[.glow].t = face.glow + env * 0.45 + (activity == .arriving ? 0.3 * m : 0)
        self[.posX].t = 0
        self[.ringY].t = self[.posY].x
        self[.ringS].t = 1
        self[.shear].t = clamp(-self[.posX].v * 0.05 - self[.yaw].v * 0.012, -0.16, 0.16) * m
        self[.poke].t = 0

        stepBlink()
        let steps = Int((dt / (1.0 / 240)).rounded(.up))
        for _ in 0..<steps { for i in s.indices { s[i].step(dt / Double(steps)) } }
        applyKeyed(dt)
        if still { for i in s.indices { s[i].x = s[i].t; s[i].v = 0 } }
        if colourT < 1 { colourT = min(1, colourT + dt / 0.55) }
        var u = uniforms(now)
        u.fly = stepFirefly()
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
        self[.roll].t = f.roll * m; self[.pitch].t = 0; self[.scale].t = 1 + (f.scale - 1) * m
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
        if let focus {
            gazeTarget = SIMD2(clamp(focus.x / 1.2, -1, 1), clamp((focus.y - 0.05) / 1.25, -1, 1))
            self[.roll].t += clamp(focus.x * 0.06, -0.12, 0.12)
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
        self[.gy].t = clamp(gazeTarget.y + drift.y, -0.7, 0.7) * max(m, 0.5)
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
            h.done = 4
        }
        if h.done == 4, t >= 2.15 {                                          // hand over the role mid-flight
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
