import Foundation

/// One expression as design-system/tokens/expressions.json describes it, with
/// only the fields the face is built from (scripts/sync-expression-tokens.py).
public struct ExpressionToken: Decodable, Equatable, Sendable {
    public struct Scale: Decodable, Equatable, Sendable { var scaleX: Double?, scaleY: Double? }
    public struct Lid: Decodable, Equatable, Sendable {
        var curve: Double?, asymmetry: Double?, droop: Bool?

        enum CodingKeys: String, CodingKey { case curve, asymmetry, droop }

        // A curve can be a word ("voice-reactive"): like the web's curveOf, anything but a number is 0.
        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            curve = try? c.decodeIfPresent(Double.self, forKey: .curve)
            asymmetry = try c.decodeIfPresent(Double.self, forKey: .asymmetry)
            droop = try c.decodeIfPresent(Bool.self, forKey: .droop)
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
    public var animation: String?
    public var effect: String?
    public var family = "core"

    /// The Luxo head tilt: curious faces lean in with the whole body.
    static let tilt: [String: Double] = [
        "curious": 0.22, "intrigued": 0.17, "interested": 0.12, "puzzled": 0.19, "confused": 0.15,
        "skeptical": 0.1, "attentive": 0.05, "wondering": 0.18,
    ]
    static let familyEffect: [String: String] = [
        "happy": "sparkle", "warmth": "heart", "tired": "z", "nervous": "sweat", "confused": "question",
        "surprised": "bang", "embarrassed": "blush", "coaching": "sparkle",
    ]

    /// The face for an expression id; neutral for an id the tokens don't have.
    public static func of(_ id: String, tokens: [String: ExpressionToken] = ExpressionTokens.all) -> Face {
        guard let e = tokens[id] ?? tokens["neutral"] else { return Face() }
        let top = e.lidTop?.curve ?? 0, bot = e.lidBottom?.curve ?? 0, happy = bot < 0
        let upper = clamp(max(top, 0) * 0.9 * (happy ? 0.6 : 1) / 100, 0, 0.95)
        let lower = happy ? 0 : clamp(bot * 0.5 / 100, 0, 0.6)
        let arch = happy ? clamp(-bot * 3 / 100, 0, 0.85) : 0
        let sx = e.eyeWhite?.scaleX ?? 1, sy = e.eyeWhite?.scaleY ?? 1

        func eye(_ o: ExpressionToken.Scale?) -> Eye {
            let ex = o?.scaleX ?? sx, ey = o?.scaleY ?? sy
            // A squeezed-shut eye (wink, yawn) reads as a closed happy arc, not a sliver.
            return ey < 0.35 ? Eye(sx: ex, sy: 1, top: 1, bot: 0, arch: 0.55)
                : Eye(sx: ex, sy: ey, top: upper, bot: lower, arch: arch)
        }

        var f = Face()
        f.left = eye(e.eyeLeft)
        f.right = eye(e.eyeRight)
        if let asym = e.lidTop?.asymmetry, asym != 0 {
            f.left.top = clamp(f.left.top * (1 + asym * 2), 0, 1)
            f.right.top = clamp(f.right.top * (1 - asym), 0, 1)
        }
        let body = BodyTransform(e.body?.transform)
        f.gx = (e.eyesGroup?.translateX ?? 0) * 0.09
        f.gy = -(e.eyesGroup?.translateY ?? 0) * 0.09
        f.tilt = e.lidTop?.droop == true ? 0.5 : (e.family == "frustrated" || e.family == "intense" ? -0.35 : 0)
        f.crease = clamp(e.smileCrease?.opacity ?? 0, 0, 1)
        f.halo = clamp(e.presenceRing.map { $0.opacity ?? 0.2 } ?? 0.2, 0, 1)
        f.posY = -body.ty / 100 * 1.6
        f.roll = body.rot * .pi / 180 * 1.8 + (tilt[id] ?? 0)
        f.squash = pow(body.sy / body.sx, 2.0 / 3)
        f.scale = (body.sx * body.sy).squareRoot()
        f.blush = e.family == "embarrassed" ? 0.9 : happy ? 0.55 : e.family == "warmth" ? 0.4 : 0
        f.glow = 0.2 + f.halo * 0.8
        f.animation = e.animation
        f.effect = e.sparkleGroup != nil ? "sparkle" : id == "crying" ? "tears" : familyEffect[e.family]
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
