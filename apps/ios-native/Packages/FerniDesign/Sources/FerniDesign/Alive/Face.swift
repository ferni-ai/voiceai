import Foundation

/// One expression as design-system/tokens/expressions.json describes it, with
/// only the fields the face is built from (scripts/sync-expression-tokens.py).
public struct ExpressionToken: Decodable, Equatable, Sendable {
    public struct Scale: Decodable, Equatable, Sendable { var scaleX: Double?, scaleY: Double? }
    public struct Lid: Decodable, Equatable, Sendable {
        var curve: Double?, asymmetry: Double?, droop: Bool?
        /// A drawn-together brow: worry on a concern or nervous face, a glare
        /// on a frustrated or intense one.
        var furrow: Bool?

        enum CodingKeys: String, CodingKey { case curve, asymmetry, droop, furrow }

        // A curve can be a word ("voice-reactive"): like the web's curveOf, anything but a number is 0.
        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            curve = try? c.decodeIfPresent(Double.self, forKey: .curve)
            asymmetry = try c.decodeIfPresent(Double.self, forKey: .asymmetry)
            droop = try c.decodeIfPresent(Bool.self, forKey: .droop)
            furrow = try c.decodeIfPresent(Bool.self, forKey: .furrow)
        }
    }
    public struct Offset: Decodable, Equatable, Sendable { var translateX: Double?, translateY: Double? }
    public struct Transform: Decodable, Equatable, Sendable { var transform: String? }
    public struct Opacity: Decodable, Equatable, Sendable { var opacity: Double? }

    var family: String
    var body: Transform?
    var eyeWhite: Scale?
    var eyeLeft: Scale?
    var eyeRight: Scale?
    var eyesGroup: Offset?
    var lidTop: Lid?
    var lidBottom: Lid?
    var smileCrease: Opacity?
    var presenceRing: Opacity?
    var animation: String?
    var sparkleGroup: Opacity?
}

/// All of Ferni's expressions, loaded once from the bundled token copy.
public enum ExpressionTokens {
    /// A micro-expression: a face held 80-120 ms, felt more than seen.
    struct Micro: Decodable, Equatable, Sendable { var expression: String, duration: Int }

    struct File: Decodable {
        var expressions: [String: ExpressionToken]
        var microExpressions: [String: Micro]?
    }

    static let file: File? = {
        guard let url = Bundle.module.url(forResource: "expression-tokens", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(File.self, from: data)
    }()

    public static let all: [String: ExpressionToken] = file?.expressions ?? [:]
    static let micro: [String: Micro] = file?.microExpressions ?? [:]
}

/// The design system's seven micro-expressions (expressions.json →
/// microExpressions), as the alive prototype's `micro()` plays them.
public enum MicroExpression: String, CaseIterable, Sendable {
    case recognition, concern, delight, warmth, interest, surprise, noticing

    /// The face it flashes and for how long, from the tokens.
    var flash: (face: String, seconds: Double)? {
        ExpressionTokens.micro[rawValue].map { ($0.expression, Double($0.duration) / 1000) }
    }
}

/// A micro-expression to play, numbered so the same one twice in a row plays twice.
public struct MicroBeat: Equatable, Sendable {
    public let expression: MicroExpression
    public let count: Int

    public init(_ expression: MicroExpression, count: Int) {
        self.expression = expression
        self.count = count
    }
}

/// The face geometry for one expression: lids, arch, eye sizes, gaze, the
/// body's pose and light. The same mapping as the web's face model
/// (apps/web/src/ui/face/face-model.ts) and the alive prototype's `faceOf`.
public struct Face: Equatable, Sendable {
    public struct Eye: Equatable, Sendable {
        public var sx = 1.0, sy = 1.0, top = 0.0, bot = 0.0, arch = 0.0
    }

    public var left = Eye(), right = Eye()
    public var gx = 0.0, gy = 0.0
    public var tilt = 0.0, crease = 0.0, halo = 0.2
    public var posY = 0.0, roll = 0.0, squash = 1.0, scale = 1.0
    public var blush = 0.0, glow = 0.36
    /// The web's page-colour lid caps over the body: the control point of the
    /// live overlay's quadratic top edge, and 100 minus its bottom one, /100
    /// (`webLids`). Its box is the orb, so sleepy's 0.55 covers the top 55%.
    public var capTop = 0.0, capBottom = 0.0
    public var animation: String?
    public var effect: String?
    /// How strongly a sparkling face sparkles (its token's sparkleGroup opacity).
    public var sparkle = 0.0
    public var family = "core"

    /// The live web overlay's lids (apps/web ferni-expressions.ui.ts, the
    /// `expressions` table): the top path's control point and 100 minus the
    /// bottom one's, for every id it draws. Skeptical and worried have two-curve
    /// paths there; these are their peaks.
    static let webLids: [String: (top: Double, bottom: Double)] = [
        "neutral": (-10, -10), "happy": (25, 15), "delighted": (28, 18), "surprised": (-18, -18), "curious": (15, 0),
        "skeptical": (10, 0), "worried": (18, 5), "sad": (35, 0), "sleepy": (55, 30), "thinking": (12, 5),
        "empathetic": (20, 10), "excited": (-12, -12), "contemplative": (18, 8), "noticing": (8, 0),
        "holdingSpace": (22, 12), "attentive": (5, -5), "absorbing": (20, 8), "receiving": (18, 10),
        "curiousLean": (10, -2), "warm": (12, 5), "pleased": (18, 10), "proud": (22, 12), "celebrating": (26, 16),
        "present": (10, 2), "holding": (20, 10), "accompanying": (18, 8), "waiting": (15, 5), "encouraging": (15, 8),
        "challenging": (10, 2), "reflecting": (14, 5), "recognizing": (18, 10), "remembering": (16, 6),
        "reconnecting": (20, 12), "insider": (22, 14), "growing": (20, 12), "processing": (18, 6),
        "realizing": (-8, -8), "shifting": (8, 0), "settling": (14, 4), "farewell": (22, 12),
    ]

    /// The warm faces that show hearts.
    static let hearts: Set<String> = ["loving", "tender", "nurturing", "caring"]

    /// The Luxo head tilt: curious faces lean in with the whole body.
    static let tilt: [String: Double] = [
        "curious": 0.22, "intrigued": 0.17, "interested": 0.12, "puzzled": 0.19, "confused": 0.15,
        "skeptical": 0.1, "attentive": 0.05, "wondering": 0.18,
        // A knowing tilt: without it wise rendered as peaceful (expression audit twins).
        "wise": 0.08,
        // Leaning in to someone who's hurting: it rendered as caring.
        "compassionate": 0.1,
    ]
    static let familyEffect: [String: String] = [
        "warmth": "heart",
    ]
    /// Glyphs, each for the few faces it belongs to (expression audit P2 #4):
    /// z's for sleep, a bead of sweat for nerves. No ? or ! (the web's rule is
    /// no emoji-like marks; Ferni's face carries confusion and surprise).
    static let glyphs: [String: String] = [
        "sleepy": "z", "drowsy": "z", "resting": "z", "nervous": "sweat", "embarrassed": "sweat", "crying": "tears",
    ]

    /// The few faces tuned by hand, as values in one table rather than
    /// conditions scattered through `of` (critic M6). Each says why.
    struct Tuning {
        /// The smile crease's cheek lift, overriding the tokens'.
        var cheek: Double?
        /// Lower lids lifted this much more.
        var lowerLift = 0.0
        /// The glare's share (1 = a full glare's tilt and lower lids; 0.5 = half).
        var glare = 1.0
        /// Each eye's top lid, held, in place of the tokens' asymmetry, and how
        /// much taller the open (left) eye is.
        var tops: (left: Double, right: Double)?
        var openEye = 1.0
    }

    static let tuning: [String: Tuning] = [
        // The everyday talking face: a cheek lift read smug and narrowed his range;
        // speaking differs from neutral by voice (2026-10-20).
        "speaking": Tuning(cheek: 0),
        // Settled, soft eyes, the lower lids up a touch (it rendered as speaking).
        "present": Tuning(lowerLift: 0.2),
        // Steady, not fierce: half the glare, no lower-lid push (it rendered as determined).
        "resolute": Tuning(glare: 0.5),
        // One eye narrowed, the other open: a pose, so it holds under Reduce
        // Motion. Without the "?" (P2 #4) and its motion, confused leaned on the
        // head tilt alone there, a tilted neutral (critic L2).
        "confused": Tuning(tops: (left: 0, right: 0.32), openEye: 1.12),
    ]

    /// The face for an expression id; neutral for an id the tokens don't have.
    public static func of(_ id: String, tokens: [String: ExpressionToken] = ExpressionTokens.all) -> Face {
        guard let e = tokens[id] ?? tokens["neutral"] else { return Face() }
        let top = e.lidTop?.curve ?? 0, bot = e.lidBottom?.curve ?? 0, happy = bot < 0
        let glare = e.family == "frustrated" || e.family == "intense"
        // A furrow on a worried face: the inner corners lift and the lower lids
        // tense. Without it concern rendered as neutral, lids wider than
        // neutral's (expression audit P0 #1, 2026-10-20).
        let worry = e.lidTop?.furrow == true && !glare
        // The lifted inner corners need a lid to show on: concern's own lids
        // (curve 4-8) sit higher than neutral's.
        // Nervous: a tense lid for its slightly lifted inner corners to show on.
        let nervous = e.family == "nervous" && !worry
        let upper = max(clamp(max(top, 0) * 0.9 * (happy ? 0.6 : 1) / 100, 0, 0.95), worry ? 0.24 : nervous ? 0.16 : 0)
        // The smile crease is a cheek lift, not a line: the lower lids rise and curve
        // up, a little of the happy arch. Drawn as a cream stroke under each eye it
        // read as a floating lower lid (Seth, build .57, 2026-10-20); as a pose it also
        // tells apart four faces that rendered the same (expression audit twins).
        // Not on speaking, the everyday talking face: there the lift read smug and
        // narrowed his range (2026-10-20); speaking differs from neutral by voice.
        let tuned = tuning[id] ?? Tuning()
        let cheek = tuned.cheek ?? clamp(e.smileCrease?.opacity ?? 0, 0, 1) * 0.5
        // A glare pushes the lower lids up too, so frustration reads apart from focus
        // (expression audit P1 #8: focused and frustrated rendered the same).
        let lower = happy ? 0 : max(clamp(bot * 0.5 / 100 + min(cheek, 0.2) + tuned.lowerLift, 0, 0.6),
                                    worry ? 0.14 : glare && tuned.glare == 1 ? 0.12 : 0)
        let arch = happy ? clamp(-bot * 3 / 100, 0, 0.85) : cheek
        let sx = e.eyeWhite?.scaleX ?? 1, sy = e.eyeWhite?.scaleY ?? 1

        func eye(_ o: ExpressionToken.Scale?) -> Eye {
            let ex = o?.scaleX ?? sx, ey = o?.scaleY ?? sy
            // A squeezed-shut eye. A wink is a gentle closed arc, a thin band of white
            // bowed up (the web's squashed eye; the shut lid with only a fold read as a
            // dark notch, 2026-10-20). A yawn scrunches both: narrower, tighter arcs,
            // squeezed from below (it shut to the fold, a blank face with two tiny
            // brackets: expression audit P1 #6).
            guard ey < 0.35 else { return Eye(sx: ex, sy: ey, top: upper, bot: lower, arch: arch) }
            return e.family == "tired" ? Eye(sx: ex * 0.85, sy: 0.85, top: 0.45, bot: 0, arch: 0.95)
                : Eye(sx: ex, sy: 0.9, top: 0.45, bot: 0, arch: 0.85)
        }

        var f = Face()
        f.left = eye(e.eyeLeft)
        f.right = eye(e.eyeRight)
        if let tops = tuned.tops {
            f.left.top = tops.left
            f.right.top = tops.right
            f.left.sy *= tuned.openEye
        } else if let asym = e.lidTop?.asymmetry, asym != 0 {
            if max(f.left.top, f.right.top) > 0.01 {
                f.left.top = clamp(f.left.top * (1 + asym * 2), 0, 1)
                f.right.top = clamp(f.right.top * (1 - asym), 0, 1)
            } else {
                // Raised lids (curious, bewildered): scaling a lid at 0 did nothing
                // (expression audit P2 #6). One eye stays wide and the other
                // drops a little, the smaller one by the tokens' own eye sizes.
                if f.left.sy < f.right.sy { f.left.top = asym * 0.5 } else { f.right.top = asym * 0.5 }
            }
        }
        let body = BodyTransform(e.body?.transform)
        f.gx = (e.eyesGroup?.translateX ?? 0) * 0.09
        f.gy = -(e.eyesGroup?.translateY ?? 0) * 0.09
        // Nervous lifts its inner corners a little, short of worry (it rendered as listening).
        f.tilt = e.lidTop?.droop == true ? 0.5 : worry ? 0.45 : glare ? -0.6 * tuned.glare
            : nervous ? 0.3 : 0
        f.crease = clamp(e.smileCrease?.opacity ?? 0, 0, 1)
        f.halo = clamp(e.presenceRing.map { $0.opacity ?? 0.2 } ?? 0.2, 0, 1)
        f.posY = -body.ty / 100 * 1.6
        f.roll = body.rot * .pi / 180 * 1.8 + (tilt[id] ?? 0)
        f.squash = pow(body.sy / body.sx, 2.0 / 3)
        f.scale = (body.sx * body.sy).squareRoot()
        f.blush = e.family == "embarrassed" ? 0.9 : happy ? 0.55 : e.family == "warmth" ? 0.4 : 0
        f.glow = 0.2 + f.halo * 0.8
        if let web = webLids[id] {
            f.capTop = clamp(web.top / 100, 0, 0.8)
            f.capBottom = clamp(web.bottom / 100, 0, 0.6)
        } else {
            // Ids the overlay doesn't draw (the web leaves its lids alone for them):
            // only heavy lids from the tokens, the tired faces sleepy's table entry
            // stands for. A wink (20) or a light squint stays the eyes' own lids.
            f.capTop = top > 25 ? clamp(top / 100, 0, 0.8) : 0
            f.capBottom = abs(bot) > 25 ? clamp(abs(bot) / 100, 0, 0.6) : 0
        }
        f.animation = e.animation
        // Sparkles only where the tokens give them, at their strength: every happy
        // and coaching face sparkled twice a second (expression audit P2 #3).
        f.effect = e.sparkleGroup != nil ? "sparkle" : glyphs[id] ?? familyEffect[e.family]
        f.sparkle = e.sparkleGroup.map { $0.opacity ?? 1 } ?? 0
        // Hearts are for love and tenderness, not every warm face: four clumped
        // hearts on supportive (the face for someone struggling) read as cute at
        // the wrong moment (expression audit P1 #10). The other warm faces swell
        // the glow instead.
        if e.family == "warmth", !Self.hearts.contains(id) {
            f.effect = nil
            f.glow = max(f.glow, 0.8)
        }
        f.family = e.family
        return f
    }
}

/// A CSS transform from the tokens ("rotate(2deg) translateY(-4px) scale(1.03)"),
/// reduced to what the body uses.
struct BodyTransform: Equatable {
    var ty = 0.0, rot = 0.0, sx = 1.0, sy = 1.0

    init(_ css: String?) {
        var scale = 1.0, scaleX = 1.0, scaleY = 1.0
        for part in (css ?? "").split(separator: ")") {
            let pieces = part.split(separator: "(", maxSplits: 1)
            guard pieces.count == 2 else { continue }
            let name = pieces[0].trimmingCharacters(in: .whitespaces)
            let number = pieces[1].trimmingCharacters(in: .whitespaces)
                .replacingOccurrences(of: "px", with: "").replacingOccurrences(of: "deg", with: "")
            guard let value = Double(number) else { continue }
            switch name {
            case "translateY": ty = value
            case "rotate": rot = value
            case "scale": scale = value
            case "scaleX": scaleX = value
            case "scaleY": scaleY = value
            default: break
            }
        }
        sx = scale * scaleX
        sy = scale * scaleY
    }
}

@inline(__always) func clamp(_ x: Double, _ a: Double, _ b: Double) -> Double { min(b, max(a, x)) }
